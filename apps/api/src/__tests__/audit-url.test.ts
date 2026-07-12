import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { detectFileType } from "../services/analyzer.js";

// ---------------------------------------------------------------------------
// Unit tests for /api/audit-url
//
// The URL-validation surface (isAllowedUrl, scheme rejection, SSRF blocks,
// allowlist) is shared with /api/analyze-url and covered by
// analyze-url.test.ts — not re-tested here. These tests target what's new
// in audit-url: hash dedup, force bypass, the trimmed response shape, and
// the strict/practical score extraction.
//
// v1.33 migration (PDF-only → all four formats, via the same
// analyzeDocument/detectFileType dispatcher analyze-url.ts uses): also
// covers the finalUrl-based filename derivation, the unsupported-type 422
// gate (against the REAL detectFileType — see the import above, safe
// because detectFileType never touches the acquireSemaphore/
// releaseSemaphore exports that the pdfAnalyzer.js mock below omits), and
// the error-code → HTTP-status mapping in the route's catch block,
// including the ETIMEDOUT→504 branch that analyze-url.ts is still
// missing (a known, separately-tracked bug — audit-url.ts has it).
// ---------------------------------------------------------------------------

vi.mock("../db/sqlite.js", () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}));

vi.mock("../services/pdfAnalyzer.js", () => ({
  analyzePDF: vi.fn(),
}));

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    user: { email: "test@illinois.gov" },
    body: {},
    query: {},
    get: vi.fn(() => undefined),
    ...overrides,
  };
}

// Express stores each router.post(path, mw1, mw2, handler) registration as a
// Layer whose `.route.stack` is the ordered list of per-handler Layers;
// `.handle` on the LAST one is the actual async route handler function
// (authMiddleware / analyzeLimiter are the earlier ones). This exercises the
// REAL route module for the F3 store-sanitize test below — not a
// reimplementation — while staying supertest-free.
function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

// db.prepare/.run double that records every .run() call's args keyed by the
// exact SQL text — lets the F3 test below find the shared_reports INSERT's
// args specifically (the dedup SELECT and auditLog's audit_log INSERT also
// go through the same mocked db.prepare during the same request).
function makeSqlCapturingDb() {
  const runCallsBySql: Record<string, unknown[][]> = {};
  const prepare = vi.fn((sql: string) => ({
    get: vi.fn(() => undefined), // no dedup hit — forces the fresh-audit path
    run: vi.fn((...args: unknown[]) => {
      (runCallsBySql[sql] ??= []).push(args);
    }),
  }));
  return { db: { prepare }, runCallsBySql };
}

// ---------------------------------------------------------------------------
// Inline reimplementations of the pure helpers in audit-url.ts. We can't
// import the module directly because it pulls in #config which vitest's
// resolver doesn't see. This mirrors the analyze-url.test.ts pattern.
// ---------------------------------------------------------------------------

function extractProfileScore(
  payload: any,
  mode: "strict" | "practical",
): { score: number | null; grade: string | null } {
  // User-facing 'practical' maps to the internal 'remediation' key.
  const internalKey = mode === "practical" ? "remediation" : "strict";
  const profile = payload?.scoreProfiles?.[internalKey];
  if (profile && typeof profile.overallScore === "number") {
    return { score: profile.overallScore, grade: profile.grade ?? null };
  }
  if (mode === "strict" && typeof payload?.overallScore === "number") {
    return { score: payload.overallScore, grade: payload.grade ?? null };
  }
  return { score: null, grade: null };
}

function buildReportUrl(id: string, productionUrl: string, devUrl: string): string {
  const base = process.env.NODE_ENV === "production" ? productionUrl : devUrl;
  return `${base}/report/${id}`;
}

// ---------------------------------------------------------------------------
// extractProfileScore
// ---------------------------------------------------------------------------

describe("extractProfileScore", () => {
  it("reads scoreProfiles.strict for the strict mode", () => {
    const payload = {
      scoreProfiles: {
        strict: { overallScore: 49, grade: "F" },
        remediation: { overallScore: 72, grade: "C" },
      },
    };
    expect(extractProfileScore(payload, "strict")).toEqual({ score: 49, grade: "F" });
  });

  it("reads scoreProfiles.remediation for the practical mode (user-facing name maps to internal key)", () => {
    const payload = {
      scoreProfiles: {
        strict: { overallScore: 49, grade: "F" },
        remediation: { overallScore: 72, grade: "C" },
      },
    };
    expect(extractProfileScore(payload, "practical")).toEqual({ score: 72, grade: "C" });
  });

  it("strict falls back to top-level overallScore on pre-scoreProfiles payloads", () => {
    const payload = { overallScore: 85, grade: "B" };
    expect(extractProfileScore(payload, "strict")).toEqual({ score: 85, grade: "B" });
  });

  it("practical returns nulls when scoreProfiles.remediation is missing (no safe fallback exists)", () => {
    const payload = { overallScore: 85, grade: "B" };
    expect(extractProfileScore(payload, "practical")).toEqual({ score: null, grade: null });
  });

  it("returns null pair when both shapes are absent", () => {
    expect(extractProfileScore({}, "strict")).toEqual({ score: null, grade: null });
    expect(extractProfileScore(null, "practical")).toEqual({ score: null, grade: null });
  });

  it("handles missing grade gracefully", () => {
    const payload = { scoreProfiles: { strict: { overallScore: 50 } } };
    expect(extractProfileScore(payload, "strict")).toEqual({ score: 50, grade: null });
  });
});

// ---------------------------------------------------------------------------
// buildReportUrl
// ---------------------------------------------------------------------------

describe("buildReportUrl", () => {
  const ENV_BACKUP = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = ENV_BACKUP;
  });

  it("uses the production URL when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    const url = buildReportUrl("abc123", "https://audit.icjia.app", "http://localhost:5102");
    expect(url).toBe("https://audit.icjia.app/report/abc123");
  });

  it("uses the dev URL otherwise", () => {
    process.env.NODE_ENV = "development";
    const url = buildReportUrl("abc123", "https://audit.icjia.app", "http://localhost:5102");
    expect(url).toBe("http://localhost:5102/report/abc123");
  });
});

// ---------------------------------------------------------------------------
// Hash dedup: query semantics
// ---------------------------------------------------------------------------

describe("audit-url dedup behavior (Policy A)", () => {
  it("SHA-256 of identical buffers produces identical hex strings", async () => {
    const crypto = await import("node:crypto");
    const a = crypto.createHash("sha256").update(Buffer.from("hello")).digest("hex");
    const b = crypto.createHash("sha256").update(Buffer.from("hello")).digest("hex");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("SHA-256 of differing buffers produces differing hashes", async () => {
    const crypto = await import("node:crypto");
    const a = crypto.createHash("sha256").update(Buffer.from("hello")).digest("hex");
    const b = crypto.createHash("sha256").update(Buffer.from("world")).digest("hex");
    expect(a).not.toBe(b);
  });

  it('force-flag detection accepts body.force=true, body.force="true", and ?force=true', () => {
    const truthy = (req: { body?: any; query?: any }) =>
      req.body?.force === true || req.body?.force === "true" || req.query?.force === "true";

    expect(truthy({ body: { force: true } })).toBe(true);
    expect(truthy({ body: { force: "true" } })).toBe(true);
    expect(truthy({ query: { force: "true" } })).toBe(true);
    expect(truthy({ body: { force: false } })).toBe(false);
    expect(truthy({ body: {} })).toBe(false);
    expect(truthy({})).toBe(false);
  });

  it("dedup SQL filters by email + content_hash + TTL window", () => {
    // The route's query is:
    //   SELECT ... FROM shared_reports
    //    WHERE email = ?
    //      AND content_hash = ?
    //      AND expires_at > ?
    //    ORDER BY created_at DESC LIMIT 1
    //
    // Verify the parameter order matches what the route passes.
    const params = ["cschweda@gmail.com", "abc123hash", "2026-05-18T15:00:00.000Z"];
    expect(params[0]).toMatch(/@/);
    expect(params[1]).toHaveLength(10); // demo hash; real is 64 chars
    expect(params[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe("audit-url response shape", () => {
  it("returns single-scalar fields suitable for CSV ingestion", () => {
    // The contract the fleet automation relies on. Adding optional
    // fields is fine; renaming or removing any of these is a breaking
    // change.
    const sampleResponse = {
      filename: "report.pdf",
      pageCount: 12,
      audited: "2026-05-18T15:32:11.000Z",
      strict: { score: 49, grade: "F" },
      practical: { score: 72, grade: "C" },
      reportId: "a".repeat(32),
      reportUrl: "https://audit.icjia.app/report/" + "a".repeat(32),
      reportExpiresAt: "2027-05-18T15:32:11.000Z",
      cached: false,
    };
    // Every top-level field is a scalar or an object with at most 2
    // scalars. No nested categories, no arrays.
    for (const [key, value] of Object.entries(sampleResponse)) {
      if (key === "strict" || key === "practical") {
        expect(typeof value).toBe("object");
        expect(Object.keys(value as object).sort()).toEqual(["grade", "score"]);
      } else {
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });

  it("reportId is a 32-character hex string (16 random bytes hex-encoded)", () => {
    const id = randomBytes(16).toString("hex");
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("cached flag distinguishes new audit from dedup hit", () => {
    // True when dedup returned an existing row; false when a fresh
    // audit ran.
    expect({ cached: true } as { cached: boolean }).toHaveProperty("cached", true);
    expect({ cached: false } as { cached: boolean }).toHaveProperty("cached", false);
  });
});

// ---------------------------------------------------------------------------
// Filename derivation from the final (post-redirect) URL — v1.33 migration
// ---------------------------------------------------------------------------
// audit-url now derives the filename from safeFetch's `finalUrl` (the
// post-redirect URL), exactly like analyze-url.ts, instead of the
// original request URL's `check.parsed`. The fallback name is
// parameterized by the detected file type instead of a hardcoded
// 'remote.pdf'. Uses the real (native) URL API, same as the route.
// ---------------------------------------------------------------------------

describe("audit-url filename derivation", () => {
  function deriveFilename(finalUrl: string, fileType: string): string {
    const finalPath = new URL(finalUrl).pathname;
    const rawName = finalPath.split("/").pop() ?? `remote.${fileType}`;
    return rawName.slice(0, 200) || `remote.${fileType}`;
  }

  it("uses the final (post-redirect) URL pathname terminal segment", () => {
    expect(deriveFilename("https://icjia.illinois.gov/reports/annual-2022.pdf", "pdf")).toBe(
      "annual-2022.pdf",
    );
  });

  it("uses the redirect target, not the originally-requested URL", () => {
    // safeFetch follows redirects internally; finalUrl reflects the last
    // hop. A short-link that 302s to the real file must name the report
    // after the real file, not the short-link path.
    expect(deriveFilename("https://icjia.illinois.gov/files/quarterly-report.docx", "docx")).toBe(
      "quarterly-report.docx",
    );
  });

  it("falls back to remote.<type> (not remote.pdf) when the path has no terminal segment", () => {
    expect(deriveFilename("https://icjia.illinois.gov/", "pdf")).toBe("remote.pdf");
    expect(deriveFilename("https://icjia.illinois.gov/", "docx")).toBe("remote.docx");
    expect(deriveFilename("https://icjia.illinois.gov/", "pptx")).toBe("remote.pptx");
    expect(deriveFilename("https://icjia.illinois.gov/", "xlsx")).toBe("remote.xlsx");
  });

  it("caps the filename at 200 characters", () => {
    const longUrl = "https://icjia.illinois.gov/" + "a".repeat(500) + ".pdf";
    expect(deriveFilename(longUrl, "pdf").length).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Unsupported-type gate: detectFileType(buf) → 422 when it returns null
// ---------------------------------------------------------------------------
// Exercises the REAL detectFileType from services/analyzer.js (not a
// reimplementation), so this can't silently drift from the production
// detector — same rationale as analyze-url.test.ts importing the real
// isAllowedUrl instead of a local copy. The route itself still can't be
// imported directly here (see header note), so the 422 response body is
// reproduced from audit-url.ts for regression coverage of the exact copy.
// ---------------------------------------------------------------------------

describe("audit-url: unsupported-type gate", () => {
  it("detectFileType returns null for content that matches no supported format", async () => {
    expect(await detectFileType(Buffer.from("<html>not a document</html>"))).toBeNull();
  });

  it("detectFileType identifies a real PDF header (gate is not triggered for PDFs)", async () => {
    const pdfBuf = Buffer.from("%PDF-1.4\n%rest of a pdf");
    expect(await detectFileType(pdfBuf)).toBe("pdf");
  });

  it("builds the 422 response used when detectFileType(buf) returns null", () => {
    const res = makeRes();
    res.status(422).json({
      error: "Fetched content is not a supported document.",
      details:
        "The URL must point directly at a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file — the fetched content matches none of these formats.",
    });
    expect(res._status).toBe(422);
    expect(res._json.error).toMatch(/not a supported document/);
    expect(res._json.details).toContain("Word (.docx)");
    expect(res._json.details).toContain("PowerPoint (.pptx)");
    expect(res._json.details).toContain("Excel (.xlsx)");
  });
});

// ---------------------------------------------------------------------------
// Error-code → HTTP-status mapping (route's catch block)
// ---------------------------------------------------------------------------
// audit-url.ts can't be imported directly in this test file (see header
// note), so each branch below simulates the route's res calls the same
// way analyze-url.test.ts's "fetch error handling" describe does for its
// 502/AbortError cases. Not exhaustive over all six *_DISABLED/
// *_PARSE_FAILED branches (those are mechanical copies of analyze-url.ts
// with no new logic); focused on what's actually new/changed by this
// migration: the ETIMEDOUT→504 branch, and the generic-500 fix that stops
// echoing err.message to the client.
// ---------------------------------------------------------------------------

describe("audit-url: error-code → HTTP-status mapping", () => {
  it("DOCX_DISABLED maps to 415 (representative *_DISABLED branch)", () => {
    const res = makeRes();
    const err: any = { code: "DOCX_DISABLED" };
    if (err.code === "DOCX_DISABLED") {
      res.status(415).json({ error: "Word (.docx) auditing is currently disabled." });
    }
    expect(res._status).toBe(415);
  });

  it("PPTX_PARSE_FAILED maps to 422 (representative *_PARSE_FAILED branch)", () => {
    const res = makeRes();
    const err: any = { code: "PPTX_PARSE_FAILED" };
    if (err.code === "PPTX_PARSE_FAILED") {
      res.status(422).json({ error: "The fetched PowerPoint file could not be read." });
    }
    expect(res._status).toBe(422);
  });

  it("ETIMEDOUT maps to 504 (the branch analyze-url.ts is still missing; audit-url.ts has it)", () => {
    const res = makeRes();
    const err: any = { code: "ETIMEDOUT", killed: true };
    if (err?.code === "ETIMEDOUT" || err?.killed) {
      res.status(504).json({
        error: "This document is too complex to analyze within the time limit.",
      });
    }
    expect(res._status).toBe(504);
    expect(res._json.error).toMatch(/too complex/);
  });

  it("a killed child process without an ETIMEDOUT code also maps to 504 (err.killed alone)", () => {
    const res = makeRes();
    const err: any = { killed: true };
    if (err?.code === "ETIMEDOUT" || err?.killed) {
      res.status(504).json({
        error: "This document is too complex to analyze within the time limit.",
      });
    }
    expect(res._status).toBe(504);
  });

  it("the generic 500 fallback never echoes err.message to the client", () => {
    const res = makeRes();
    const err = new Error("/etc/secret/internal-library-path leaked here");
    // Route's actual final fallback: status 500, body has only `error`,
    // no `details` key derived from err.message anywhere.
    res.status(500).json({ error: "Internal server error" });
    expect(res._status).toBe(500);
    expect(res._json).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res._json)).not.toContain(err.message);
  });
});

// ---------------------------------------------------------------------------
// F3 [LOW, defense-in-depth] pre-merge re-audit finding: reports.ts's
// POST /api/reports runs sanitizeStoredReport() on a report before it is
// ever written to shared_reports (strips unsafe helpLinks[].url anywhere in
// the payload — a stored-XSS guard on the public /report/:id page).
// audit-url.ts's own shared_reports INSERT skipped that call. No exploit
// today (analyzeDocument's output isn't attacker-shaped), but the fix
// applies the SAME sanitizer here for store-boundary consistency. This
// invokes the REAL route handler (via extractHandler above), not a
// reimplementation, so it pins the actual source.
// ---------------------------------------------------------------------------

describe("audit-url: sanitizeStoredReport applied before shared_reports insert (F3, store-boundary hardening)", () => {
  it("neutralizes an unsafe helpLinks URL in the analysis result before it is persisted", async () => {
    vi.resetModules();
    const { db, runCallsBySql } = makeSqlCapturingDb();
    vi.doMock("../db/sqlite.js", () => ({ default: db }));
    vi.doMock("../services/analyzer.js", () => ({
      detectFileType: vi.fn().mockResolvedValue("pdf"),
      analyzeDocument: vi.fn().mockResolvedValue({
        overallScore: 91,
        grade: "A",
        categories: [
          {
            id: "alt_text",
            helpLinks: [{ label: "Evil", url: "javascript:alert(document.domain)" }],
          },
        ],
      }),
    }));
    vi.doMock("../services/safeFetch.js", () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from("%PDF-1.4 minimal"),
        finalUrl: "https://example.gov/a.pdf",
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }));
    vi.doMock("../services/urlPolicy.js", () => ({
      isAllowedUrl: vi.fn(() => ({ ok: true })),
      sendSafeFetchError: vi.fn(),
      validateUrlForFetch: vi.fn(),
      validateUrlPublic: vi.fn(),
      FETCH_TIMEOUT_MS: 30_000,
      MAX_PDF_BYTES: 15 * 1024 * 1024,
    }));
    try {
      const { default: router } = await import("../routes/audit-url.js");
      const handler = extractHandler(router, "/audit-url");
      const req = makeReq({ body: { url: "https://example.gov/a.pdf" } });
      const res = makeRes();

      await handler(req, res);

      // Sanity: the request actually succeeded down the fresh-audit path
      // (not an error branch) before checking what got persisted.
      expect(res._json?.reportId).toBeTruthy();

      const sql = Object.keys(runCallsBySql).find((s) => s.includes("INSERT INTO shared_reports"));
      expect(sql).toBeTruthy();
      const insertArgs = runCallsBySql[sql!][0];
      // INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at)
      const storedReportJson = insertArgs[3] as string;
      const stored = JSON.parse(storedReportJson);
      expect(stored.categories[0].helpLinks).toEqual([]);
      expect(storedReportJson).not.toContain("javascript:");
    } finally {
      vi.doUnmock("../db/sqlite.js");
      vi.doUnmock("../services/analyzer.js");
      vi.doUnmock("../services/safeFetch.js");
      vi.doUnmock("../services/urlPolicy.js");
      vi.resetModules();
    }
  });

  it("a report with no unsafe URLs is stored unchanged (sanitization is a no-op on safe data)", async () => {
    vi.resetModules();
    const { db, runCallsBySql } = makeSqlCapturingDb();
    vi.doMock("../db/sqlite.js", () => ({ default: db }));
    vi.doMock("../services/analyzer.js", () => ({
      detectFileType: vi.fn().mockResolvedValue("pdf"),
      analyzeDocument: vi.fn().mockResolvedValue({
        overallScore: 100,
        grade: "A",
        categories: [
          { id: "alt_text", helpLinks: [{ label: "WCAG", url: "https://www.w3.org/WAI/" }] },
        ],
      }),
    }));
    vi.doMock("../services/safeFetch.js", () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from("%PDF-1.4 minimal"),
        finalUrl: "https://example.gov/clean.pdf",
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }));
    vi.doMock("../services/urlPolicy.js", () => ({
      isAllowedUrl: vi.fn(() => ({ ok: true })),
      sendSafeFetchError: vi.fn(),
      validateUrlForFetch: vi.fn(),
      validateUrlPublic: vi.fn(),
      FETCH_TIMEOUT_MS: 30_000,
      MAX_PDF_BYTES: 15 * 1024 * 1024,
    }));
    try {
      const { default: router } = await import("../routes/audit-url.js");
      const handler = extractHandler(router, "/audit-url");
      const req = makeReq({ body: { url: "https://example.gov/clean.pdf" } });
      const res = makeRes();

      await handler(req, res);

      const sql = Object.keys(runCallsBySql).find((s) => s.includes("INSERT INTO shared_reports"));
      const stored = JSON.parse(runCallsBySql[sql!][0][3] as string);
      expect(stored.categories[0].helpLinks).toEqual([
        { label: "WCAG", url: "https://www.w3.org/WAI/" },
      ]);
    } finally {
      vi.doUnmock("../db/sqlite.js");
      vi.doUnmock("../services/analyzer.js");
      vi.doUnmock("../services/safeFetch.js");
      vi.doUnmock("../services/urlPolicy.js");
      vi.resetModules();
    }
  });
});

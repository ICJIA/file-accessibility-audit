/**
 * Every JSON error the API sends has the same shape — `error` (a sentence),
 * `code` (stable, machine-readable), optionally `details` — and every
 * response carries a request id.
 *
 * The app is the one production runs (app.ts) behind a real listener; each
 * case below is a real request that reaches a real error path. The routes'
 * existing `error` / `details` strings and status codes are asserted
 * UNCHANGED where a client is known to read them.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { root, drain } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/error-codes-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  process.env.TMP_DIR = `${root}/tmp`;
  return { root, drain: { on: false } };
});

// A share limit low enough to reach in a test; everything else as configured.
vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    RATE_LIMITS: {
      ...actual.RATE_LIMITS,
      reports: { ...actual.RATE_LIMITS.reports, max: 3 },
      // …and a bulk limit the cases below cannot reach by accident.
      bulk: { ...actual.RATE_LIMITS.bulk, max: 50 },
    },
  };
});

let server: Server;
let baseUrl = "";
let codes: readonly string[];
let slots: typeof import("../services/uploadSlots.js");
let tee: { uninstall(): void } | undefined;

beforeAll(async () => {
  mkdirSync(root, { recursive: true });
  ({ API_ERROR_CODES: codes } = await import("../services/apiError.js"));
  slots = await import("../services/uploadSlots.js");
  const { createApp } = await import("../app.js");
  await new Promise<void>((r) => {
    server = createApp({ isDraining: () => drain.on }).listen(0, "127.0.0.1", r);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  tee?.uninstall();
  tee = undefined;
  drain.on = false;
  slots._resetUploadSlots();
  vi.restoreAllMocks();
});

const json = (path: string, body: unknown, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });

function fileForm(name: string, type: string, bytes = new Uint8Array(64)): FormData {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Case {
  name: string;
  send: () => Promise<Response>;
  status: number;
  code: string;
  /** The existing sentence, when a client is known to read it. */
  error?: string;
}

const cases: Case[] = [
  {
    name: "an unknown path",
    send: () => fetch(`${baseUrl}/api/no-such-thing`),
    status: 404,
    code: "NOT_FOUND",
  },
  {
    name: "POST /api/analyze with no file",
    send: () => fetch(`${baseUrl}/api/analyze`, { method: "POST", body: new FormData() }),
    status: 400,
    code: "INVALID_REQUEST",
    error: "No file uploaded",
  },
  {
    name: "POST /api/analyze with a file type that is not accepted",
    send: () =>
      fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: fileForm("photo.jpg", "image/jpeg"),
      }),
    status: 400,
    code: "UNSUPPORTED_TYPE",
    error: "Only PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files are accepted",
  },
  {
    name: "POST /api/analyze with a renamed file that is not a document",
    send: () =>
      fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: fileForm("report.pdf", "application/pdf"),
      }),
    status: 400,
    code: "UNSUPPORTED_TYPE",
    error: "This file is not a supported document.",
  },
  {
    name: "POST /api/analyze with an unexpected multipart field",
    send: () => {
      const form = fileForm("a.pdf", "application/pdf");
      form.append("items[5]", "x");
      return fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
    },
    status: 400,
    code: "INVALID_REQUEST",
  },
  {
    name: "POST /api/analyze-job with no file",
    send: () => fetch(`${baseUrl}/api/analyze-job`, { method: "POST", body: new FormData() }),
    status: 400,
    code: "INVALID_REQUEST",
    error: "No file uploaded",
  },
  {
    name: "GET /api/analyze-job/:id for a job that does not exist",
    send: () => fetch(`${baseUrl}/api/analyze-job/00000000-0000-4000-8000-000000000000?t=x`),
    status: 404,
    code: "NOT_FOUND",
    error: "No such analysis job.",
  },
  {
    name: "POST /api/analyze-url with no url",
    send: () => json("/api/analyze-url", {}),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Missing required field: url",
  },
  // Since v1.180.0 /api/analyze-url accepts any PUBLIC host, so "a host that
  // is not allowed" is no longer a refusal there (and asking for one would
  // make this suite fetch from the internet). What it still refuses, with
  // the same code: a non-standard port, and a private address.
  {
    name: "POST /api/analyze-url with a non-standard port",
    send: () => json("/api/analyze-url", { url: "https://example.com:8443/a.pdf" }),
    status: 400,
    code: "URL_NOT_ALLOWED",
    error: "URL not allowed",
  },
  {
    name: "POST /api/analyze-url with a private address",
    send: () => json("/api/analyze-url", { url: "http://127.0.0.1/a.pdf" }),
    status: 400,
    code: "URL_NOT_ALLOWED",
    error: "URL resolves to a private/reserved address",
  },
  {
    name: "POST /api/audit-url with no url",
    send: () => json("/api/audit-url", {}),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Missing required field: url",
  },
  {
    name: "POST /api/audit-url with a host that is not allowed",
    send: () => json("/api/audit-url", { url: "https://example.com/a.pdf" }),
    status: 400,
    code: "URL_NOT_ALLOWED",
    error: "URL not allowed",
  },
  {
    name: "POST /api/audit-url-page with no url",
    send: () => json("/api/audit-url-page", {}),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Missing required field: url",
  },
  {
    name: "POST /api/audit-url-page with a host that is not allowed",
    send: () => json("/api/audit-url-page", { url: "https://example.com/" }),
    status: 400,
    code: "URL_NOT_ALLOWED",
    error: "URL not allowed",
  },
  {
    name: "POST /api/bulk-from-inventory with no inventory",
    send: () => json("/api/bulk-from-inventory", {}),
    status: 400,
    code: "INVALID_REQUEST",
  },
  {
    name: "POST /api/bulk-from-inventory with no matching entries",
    send: () => json("/api/bulk-from-inventory", { inventory: '{"category":"png"}\n' }),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Inventory contains no pdf entries with a resolvable public URL.",
  },
  {
    name: "a JSON body that is not JSON",
    send: () =>
      fetch(`${baseUrl}/api/audit-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    status: 400,
    code: "INVALID_REQUEST",
  },
  {
    name: "a JSON body over the 1 MB limit",
    send: () => json("/api/bulk-from-inventory", { inventory: "x".repeat(1024 * 1024 + 10) }),
    status: 413,
    code: "FILE_TOO_LARGE",
    error: "request entity too large",
  },
  {
    name: "GET /api/reports/:id with a malformed id",
    send: () => fetch(`${baseUrl}/api/reports/nope`),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Invalid report ID",
  },
  {
    name: "GET /api/reports/:id for a report that does not exist",
    send: () => fetch(`${baseUrl}/api/reports/${"0".repeat(32)}`),
    status: 404,
    code: "NOT_FOUND",
    error: "Report not found",
  },
  {
    name: "POST /api/reports with no report",
    send: () => json("/api/reports", { report: null }),
    status: 400,
    code: "INVALID_REQUEST",
    error: "Invalid report data",
  },
  {
    name: "POST /api/reports with an unsealed report",
    send: () => json("/api/reports", { report: { filename: "a.pdf", overallScore: 90 } }),
    status: 400,
    code: "INVALID_REQUEST",
  },
  {
    name: "the share limit (429)",
    send: async () => {
      let last!: Response;
      for (let i = 0; i < 4; i++) last = await json("/api/reports", { report: null });
      return last;
    },
    status: 429,
    code: "RATE_LIMITED",
    error: "Share limit reached. Please try again later.",
  },
  {
    name: "remediation while the feature is off — POST",
    send: () =>
      fetch(`${baseUrl}/api/remediate`, {
        method: "POST",
        body: fileForm("a.pdf", "application/pdf"),
      }),
    status: 404,
    code: "NOT_FOUND",
    error: "Not Found",
  },
  {
    name: "remediation while the feature is off — status",
    send: () => fetch(`${baseUrl}/api/remediate/x/status?token=y`),
    status: 404,
    code: "NOT_FOUND",
  },
  {
    name: "remediation while the feature is off — download",
    send: () => fetch(`${baseUrl}/api/remediate/x/download?token=y`),
    status: 404,
    code: "NOT_FOUND",
  },
  {
    name: "remediation while the feature is off — receipt",
    send: () => fetch(`${baseUrl}/api/remediate/x/receipt?token=y`),
    status: 404,
    code: "NOT_FOUND",
  },
];

describe("every error body has `error` and `code`", () => {
  it.each(cases)("$name", async (c) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await c.send();
    expect(res.status).toBe(c.status);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();

    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(codes).toContain(body.code);
    expect(body.code).toBe(c.code);
    if (body.details !== undefined) expect(typeof body.details).toBe("string");
    if (c.error !== undefined) expect(body.error).toBe(c.error);

    // …and every response, errors included, names its request.
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  it("covers every route file that can answer with an error", () => {
    // A new route file must add a case above: its errors are only known to
    // carry a code once a request has actually been made against it.
    const routeFiles = readdirSync(new URL("../routes/", import.meta.url)).filter((f) =>
      f.endsWith(".ts"),
    );
    const covered: Record<string, RegExp> = {
      "analyze.ts": /\/api\/analyze\b/,
      "analyzeJob.ts": /\/api\/analyze-job/,
      "analyze-url.ts": /\/api\/analyze-url/,
      "audit-url.ts": /\/api\/audit-url\b/,
      "audit-url-page.ts": /\/api\/audit-url-page/,
      "bulk-from-inventory.ts": /\/api\/bulk-from-inventory/,
      "reports.ts": /\/api\/reports/,
      "remediate.ts": /remediation/,
      // No error body of its own: 503 here is the status document itself.
      "status.ts": /./,
      // Cannot fail: a static document.
      "openapi.ts": /./,
    };
    expect(routeFiles.sort()).toEqual(Object.keys(covered).sort());
    for (const [file, pattern] of Object.entries(covered)) {
      expect(
        cases.some((c) => pattern.test(c.name)),
        file,
      ).toBe(true);
    }
  });
});

describe("429 and 503 are one shape on every route: error + code + Retry-After", () => {
  it("rate limited: Retry-After, the limiter's own sentence, RATE_LIMITED", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let res!: Response;
    for (let i = 0; i < 4; i++) res = await json("/api/reports", { report: null });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({
      error: "Share limit reached. Please try again later.",
      code: "RATE_LIMITED",
    });
  });

  it("every limiter answers through the one handler", () => {
    const src = readFileSync(new URL("../middleware/rateLimiter.ts", import.meta.url), "utf8");
    const limiters = src.match(/= (?:rateLimit|tieredLimiter)\(\{/g) ?? [];
    // tieredLimiter builds its instance with handler: loggedHandler(cfg.name, …)
    const handlers = src.match(/handler: loggedHandler\(/g) ?? [];
    expect(limiters.length).toBeGreaterThanOrEqual(7);
    expect(handlers.length).toBe(limiters.length - 2 + 1); // 2 tiered share 1 handler line
    expect(src).toContain('json({ ...message, code: "RATE_LIMITED" })');
  });

  it("busy before the upload is read: 503 + Retry-After + SERVER_BUSY, body never parsed", async () => {
    // Every place taken — as many synchronous uploads as the analyzer can
    // run and queue.
    const held: Array<() => void> = [];
    for (let i = 0; i < slots.uploadSlotLimit(); i++) held.push(slots.reserveUploadSlot()!);
    expect(slots.reserveUploadSlot()).toBeNull();

    // A body the parser would refuse with 400 if it were read.
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      body: fileForm("photo.jpg", "image/jpeg"),
    });
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toBe("The server is busy processing other files.");
    expect(body.code).toBe("SERVER_BUSY");
    expect(typeof body.details).toBe("string");

    // With one place free the same request is read (and refused for itself).
    held.pop()!();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const next = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      body: fileForm("photo.jpg", "image/jpeg"),
    });
    expect(next.status).toBe(400);
    // …and gave its place back when its response closed.
    for (const release of held) release();
    await vi.waitFor(() => expect(slots._reservedUploadSlots()).toBe(0));
  });

  it("the analyze-job route's busy answer has the same shape", async () => {
    const jobs = await import("../services/analyzeJobs.js");
    const { ANALYZE_JOB } = await import("#config");
    const held: Array<() => void> = [];
    for (let i = 0; i < ANALYZE_JOB.MAX_UNFINISHED_JOBS; i++)
      held.push(jobs.reserveAnalyzeJobSlot()!);
    const res = await fetch(`${baseUrl}/api/analyze-job`, {
      method: "POST",
      body: fileForm("a.pdf", "application/pdf"),
    });
    for (const release of held) release();
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({
      error: "The server is busy processing other files.",
      details: "Please wait a moment and try again.",
      code: "SERVER_BUSY",
    });
  });

  it("while the process is shutting down: every route answers 503 + Retry-After", async () => {
    drain.on = true;
    for (const path of ["/api/health", "/api/status", "/api/openapi.json", "/api/reports/x"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(503);
      expect(Number(res.headers.get("retry-after")), path).toBeGreaterThan(0);
      expect(res.headers.get("x-request-id")).toMatch(UUID);
      expect(await res.json()).toEqual({
        error: "The service is restarting.",
        details: "Please try again in a few seconds.",
        code: "SHUTTING_DOWN",
      });
    }
    drain.on = false;
    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(200);
  });
});

describe("the 413 for a JSON body states the real limits", () => {
  it("names 1 MB for JSON and 5 MB for a text/plain inventory", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await json("/api/bulk-from-inventory", { inventory: "x".repeat(1024 * 1024 + 10) });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.details).toBe(
      "A JSON request body may be up to 1 MB. An NDJSON inventory for /api/bulk-from-inventory may be up to 5 MB when it is sent as text/plain.",
    );
  });

  it("a text/plain inventory over 1 MB is accepted by the parser (it is only too large past 5 MB)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const line = '{"category":"png","path":"a.png"}\n';
    const res = await fetch(`${baseUrl}/api/bulk-from-inventory`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: line.repeat(Math.ceil((2 * 1024 * 1024) / line.length)),
    });
    // Read and parsed: the answer is about its CONTENT (no pdf entries).
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Inventory contains no pdf entries/);
  });
});

describe("X-Request-Id", () => {
  it("is on successful responses too, and differs per request", async () => {
    const a = await fetch(`${baseUrl}/api/health`);
    const b = await fetch(`${baseUrl}/api/health`);
    expect(a.status).toBe(200);
    expect(a.headers.get("x-request-id")).toMatch(UUID);
    expect(b.headers.get("x-request-id")).toMatch(UUID);
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });

  it("an id sent by the caller is ignored — a caller cannot write a value into the log", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-request-id": "caller-chosen-value" },
    });
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  it("the error-log line for a request carries that request's id, and nothing about the caller", async () => {
    const { installErrorLogTee } = await import("../services/errorLog.js");
    // Silence the terminal copy first; the tee wraps these and still writes the file.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = `${root}/request-id-logs`;
    const installed = installErrorLogTee({ dir, timeZone: "UTC", maxBytesPerDay: 1_000_000 });
    tee = installed;

    // A handled client error (one warn line from the global handler)…
    const refused = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { authorization: "Bearer not-a-real-token", "user-agent": "TestAgent/9.9" },
      body: fileForm("photo.jpg", "image/jpeg"),
    });
    expect(refused.status).toBe(400);
    const refusedId = refused.headers.get("x-request-id")!;

    // …and a second request, whose line must carry ITS id, not the first's.
    const broken = await fetch(`${baseUrl}/api/audit-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const brokenId = broken.headers.get("x-request-id")!;
    expect(brokenId).not.toBe(refusedId);

    const lines = readFileSync(installed.currentFile(), "utf8").split("\n");
    const log = lines.join("\n");
    const ofRequest = (id: string) => lines.filter((l) => l.includes(id));
    // Every line the first request caused — the rejected-token warning from
    // the middleware and the handled 400 from the global handler — is tagged.
    expect(ofRequest(refusedId).length).toBe(2);
    for (const l of ofRequest(refusedId)) {
      expect(l).toMatch(new RegExp(`^\\S+Z \\[warn\\] \\[req ${refusedId}\\] `));
    }
    expect(ofRequest(refusedId).some((l) => l.includes("[api] 400 "))).toBe(true);
    expect(ofRequest(brokenId)).toHaveLength(1);
    expect(ofRequest(brokenId)[0]).toContain(`[req ${brokenId}] [api] 400 `);

    // No identifier: not the address, not the token, not the user agent.
    expect(log).not.toMatch(/127\.0\.0\.1|::1|not-a-real-token|TestAgent/);
  });

  it("a line logged outside any request has no tag — the format is unchanged there", async () => {
    const { formatErrorLogEntry } = await import("../services/errorLog.js");
    expect(formatErrorLogEntry("error", ["boom %s", "x"], 0)).toBe(
      "1970-01-01T00:00:00Z [error] boom x\n",
    );
    expect(formatErrorLogEntry("warn", ["boom %s", "x"], 0, "abc")).toBe(
      "1970-01-01T00:00:00Z [warn] [req abc] boom x\n",
    );
  });
});

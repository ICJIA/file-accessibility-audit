/**
 * THE WIRING, not the logic: each audit path must actually call
 * recordAuditFailure with its own event type when the audit throws, and must
 * NOT call it for capacity (503). Each route module is imported for real and
 * its handler invoked directly (the extractHandler pattern audit-url.test.ts
 * and audit-url-page.test.ts use); collaborators are mocked per case.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

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
    body: {},
    query: {},
    headers: {},
    ip: "203.0.113.5",
    get: vi.fn(() => undefined),
    ...overrides,
  };
}

function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

const withCode = (code: string, message = "x") => Object.assign(new Error(message), { code });

/** Common mocks: no real DB, a spy-able audit log, permissive rate limiter. */
function mockCommon(privileged: boolean) {
  const recordAuditFailure = vi.fn();
  vi.doMock("../db/sqlite.js", () => ({
    default: {
      prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) })),
    },
  }));
  vi.doMock("../services/auditLog.js", () => ({
    recordAudit: vi.fn(),
    recordAuditFailure,
    recordRejectedUpload: vi.fn(),
    sanitizeStoredFilename: (s: string) => s,
    sha256Hex: vi.fn(() => "hash"),
    hasRecentAudit: vi.fn(() => false),
  }));
  vi.doMock("../middleware/rateLimiter.js", () => ({
    analyzeLimiter: (_req: any, _res: any, next: () => void) => next(),
    reportsLimiter: (_req: any, _res: any, next: () => void) => next(),
    isPrivilegedRequest: () => privileged,
  }));
  return { recordAuditFailure };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../db/sqlite.js");
  vi.doUnmock("../services/auditLog.js");
  vi.doUnmock("../middleware/rateLimiter.js");
  vi.doUnmock("../middleware/uploadMiddleware.js");
  vi.doUnmock("../services/analyzer.js");
  vi.doUnmock("../services/veraPdfBuffer.js");
  vi.doUnmock("../services/urlAuditPipeline.js");
  vi.doUnmock("../services/urlPolicy.js");
  vi.doUnmock("../services/safeFetch.js");
  vi.doUnmock("../services/pageAuditor.js");
});

describe("POST /api/analyze records analyze-failed", () => {
  async function load(privileged: boolean, analyzeError: unknown) {
    vi.resetModules();
    const m = mockCommon(privileged);
    vi.doMock("../middleware/uploadMiddleware.js", () => ({
      uploadMiddleware: { single: () => (_req: any, _res: any, next: () => void) => next() },
    }));
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw analyzeError;
      }),
      detectFileType: vi.fn(async () => "pdf"),
      detectLegacyFormat: vi.fn(() => null),
    }));
    vi.doMock("../services/veraPdfBuffer.js", () => ({
      runVeraPdfChecksOnBuffer: vi.fn(async () => ({ pdfUa: null, wcag: null })),
    }));
    const { default: router } = await import("../routes/analyze.js");
    return { handler: extractHandler(router, "/analyze"), ...m };
  }

  it("an unreadable upload → analyze-failed / unreadable, with the tier", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await load(true, withCode("PDF_PARSE_FAILED"));
    await handler(
      makeReq({ file: { originalname: "broken.pdf", buffer: Buffer.from("%PDF-") } }),
      makeRes(),
    );
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze",
      privileged: true,
      filename: "broken.pdf",
      reason: "unreadable",
    });
    expect(recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("server busy (503) records nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await load(
      false,
      Object.assign(new Error("busy"), { status: 503 }),
    );
    const res = makeRes();
    await handler(makeReq({ file: { originalname: "a.pdf", buffer: Buffer.from("%PDF-") } }), res);
    expect(res._status).toBe(503);
    expect(recordAuditFailure).not.toHaveBeenCalled();
  });
});

describe("POST /api/analyze-url and /api/audit-url record their own failed twin", () => {
  async function loadUrlRoute(file: "analyze-url" | "audit-url", analyzeError: unknown) {
    vi.resetModules();
    const m = mockCommon(false);
    vi.doMock("../services/urlAuditPipeline.js", () => ({
      runUrlAudit: vi.fn(async () => ({
        ok: true,
        buf: Buffer.from("%PDF-"),
        filename: "remote.pdf",
        fileType: "pdf",
        contentHash: "hash",
      })),
    }));
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw analyzeError;
      }),
      detectFileType: vi.fn(async () => "pdf"),
    }));
    vi.doMock("../services/urlPolicy.js", () => ({ isAllowedUrl: vi.fn(() => ({ ok: true })) }));
    // `@vite-ignore`: a plain template-literal dynamic import here goes through
    // Vite's dynamicImportVars static-glob transform, which globs for literal
    // `../routes/*.js` on disk — this repo's routes are `.ts` (imported by
    // `.js` specifier per its Node16/NodeNext convention), so the glob matches
    // nothing and throws "Unknown variable dynamic import" regardless of any
    // source change. `@vite-ignore` opts this expression out of that static
    // analysis so it falls through to vite-node's runtime SSR resolver — the
    // same one that already resolves every literal `await import("../routes/
    // audit-url.js")` elsewhere in this suite to its `.ts` source.
    const { default: router } = await import(/* @vite-ignore */ `../routes/${file}.js`);
    return { handler: extractHandler(router, `/${file}`), ...m };
  }

  it("analyze-url: an engine timeout → analyze-url-failed / timeout with the URL as filename", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await loadUrlRoute(
      "analyze-url",
      withCode("ETIMEDOUT"),
    );
    await handler(makeReq({ body: { url: "https://example.gov/slow.pdf" } }), makeRes());
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze-url",
      privileged: false,
      filename: "https://example.gov/slow.pdf",
      reason: "timeout",
    });
    expect(recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("audit-url: a corrupt Word file → audit-url-failed / unreadable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await loadUrlRoute(
      "audit-url",
      withCode("DOCX_PARSE_FAILED"),
    );
    await handler(
      makeReq({ body: { url: "https://example.gov/bad.docx", force: true } }),
      makeRes(),
    );
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "audit-url",
      privileged: false,
      filename: "https://example.gov/bad.docx",
      reason: "unreadable",
    });
    expect(recordAuditFailure).toHaveBeenCalledTimes(1);
  });
});

describe("runUrlAudit records fetch-failed for the route that called it", () => {
  async function loadPipeline(safeFetchImpl: () => Promise<unknown>) {
    vi.resetModules();
    const m = mockCommon(false);
    vi.doMock("../services/safeFetch.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/safeFetch.js")>();
      return { ...orig, safeFetch: vi.fn(safeFetchImpl) };
    });
    const { runUrlAudit } = await import("../services/urlAuditPipeline.js");
    const { SafeFetchError } = await import("../services/safeFetch.js");
    return { runUrlAudit, SafeFetchError, ...m };
  }

  it("a SafeFetchError (DNS) → <caller>-failed / fetch-failed, and the early-exit response still goes out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadPipeline(async () => {
      throw new loaded.SafeFetchError("dns_failed", "getaddrinfo ENOTFOUND example.gov");
    });
    const res = makeRes();
    const outcome = await loaded.runUrlAudit({
      url: "https://example.gov/missing.pdf",
      privileged: false,
      res,
      eventType: "audit-url",
    });
    expect(outcome.ok).toBe(false);
    expect(res._status).toBeGreaterThanOrEqual(400);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "audit-url",
      privileged: false,
      filename: "https://example.gov/missing.pdf",
      reason: "fetch-failed",
    });
    expect(loaded.recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("an upstream HTTP error status → fetch-failed too", async () => {
    const loaded = await loadPipeline(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));
    const res = makeRes();
    await loaded.runUrlAudit({
      url: "https://example.gov/gone.pdf",
      privileged: true,
      res,
      eventType: "analyze-url",
    });
    expect(res._status).toBe(502);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze-url",
      privileged: true,
      filename: "https://example.gov/gone.pdf",
      reason: "fetch-failed",
    });
    expect(loaded.recordAuditFailure).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/bulk-from-inventory records bulk-from-inventory-failed per entry", () => {
  function inventory(entries: object[]): string {
    return entries.map((e) => JSON.stringify(e)).join("\n");
  }
  const bulkReq = (inv: string) =>
    makeReq({
      body: { inventory: inv, filterCategory: "pdf" },
      get: vi.fn((h: string) =>
        h.toLowerCase() === "content-type" ? "application/json" : undefined,
      ),
    });
  const ENTRY = {
    path: "a.pdf",
    filename: "a.pdf",
    category: "pdf",
    publicUrl: "https://example.com/a.pdf",
  };

  async function loadBulk(opts: { safeFetch: () => Promise<unknown>; analyzeError?: unknown }) {
    vi.resetModules();
    const m = mockCommon(true);
    vi.doMock("../services/safeFetch.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/safeFetch.js")>();
      return { ...orig, safeFetch: vi.fn(opts.safeFetch) };
    });
    vi.doMock("../services/urlPolicy.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/urlPolicy.js")>();
      return { ...orig, validateUrlForFetch: vi.fn(() => undefined) };
    });
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw opts.analyzeError ?? new Error("unused");
      }),
      detectFileType: vi.fn(async () => "pdf"),
    }));
    const { default: router } = await import("../routes/bulk-from-inventory.js");
    const { SafeFetchError } = await import("../services/safeFetch.js");
    return { handler: extractHandler(router, "/bulk-from-inventory"), SafeFetchError, ...m };
  }

  it("a per-entry fetch failure → fetch-failed, and the batch continues", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadBulk({
      safeFetch: async () => {
        throw new loaded.SafeFetchError("network_error", "connect ECONNREFUSED 10.0.0.1:443");
      },
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(res._json.results).toHaveLength(1);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "bulk-from-inventory",
      privileged: true,
      filename: "a.pdf",
      reason: "fetch-failed",
    });
    expect(loaded.recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("a per-entry analysis failure → the classified reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadBulk({
      safeFetch: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        buffer: Buffer.from("%PDF-1.4"),
        finalUrl: "https://example.com/a.pdf",
        resolvedIp: "93.184.216.34",
      }),
      analyzeError: withCode("PDF_PARSE_FAILED"),
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "bulk-from-inventory",
      privileged: true,
      filename: "a.pdf",
      reason: "unreadable",
    });
    expect(loaded.recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("an upstream HTTP error status (not a throw) → fetch-failed too, and the batch continues", async () => {
    const loaded = await loadBulk({
      safeFetch: async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        buffer: Buffer.alloc(0),
        finalUrl: "https://example.com/a.pdf",
        resolvedIp: "93.184.216.34",
      }),
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "bulk-from-inventory",
      privileged: true,
      filename: "a.pdf",
      reason: "fetch-failed",
    });
    expect(loaded.recordAuditFailure).toHaveBeenCalledTimes(1);
  });

  it("a per-entry analysis failure with status 503 (capacity) records nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadBulk({
      safeFetch: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        buffer: Buffer.from("%PDF-1.4"),
        finalUrl: "https://example.com/a.pdf",
        resolvedIp: "93.184.216.34",
      }),
      analyzeError: Object.assign(new Error("busy"), { status: 503 }),
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(loaded.recordAuditFailure).not.toHaveBeenCalled();
  });
});

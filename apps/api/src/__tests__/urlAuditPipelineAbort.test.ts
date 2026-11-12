/**
 * Wiring for review finding 4: the URL-audit pipeline (POST /api/analyze-url
 * and /api/audit-url) must hand safeFetch a signal tied to the CLIENT
 * connection, and fire it when that connection closes before a response.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../db/sqlite.js", () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}));

const { safeFetch, recordAuditFailure } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  recordAuditFailure: vi.fn(),
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  safeFetch,
}));
vi.mock("../services/auditLog.js", () => ({
  sha256Hex: () => "hash",
  recordRejectedUpload: vi.fn(),
  recordAuditFailure,
}));

import { runUrlAudit } from "../services/urlAuditPipeline.js";
import { SafeFetchError } from "../services/safeFetch.js";

function makeRes() {
  const res: any = new EventEmitter();
  res.writableEnded = false;
  res._status = 200;
  res._json = null;
  res.status = (c: number) => {
    res._status = c;
    return res;
  };
  res.json = (b: unknown) => {
    res._json = b;
    res.writableEnded = true;
    return res;
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("runUrlAudit — abort on client disconnect", () => {
  it("passes safeFetch a signal and aborts it when the response closes unanswered", async () => {
    let seen: AbortSignal | undefined;
    safeFetch.mockImplementation(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          seen = opts.signal;
          opts.signal?.addEventListener("abort", () =>
            reject(new SafeFetchError("aborted", "Fetch aborted: the client disconnected")),
          );
        }),
    );
    const res = makeRes();
    const p = runUrlAudit({
      url: "https://icjia.illinois.gov/a.pdf",
      privileged: false,
      res,
      eventType: "analyze-url",
    });
    await new Promise((r) => setImmediate(r));
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);

    res.emit("close"); // the client went away mid-fetch
    expect(seen!.aborted).toBe(true);

    expect(await p).toEqual({ ok: false });
    // A disconnect is not a failed audit of the document.
    expect(recordAuditFailure).not.toHaveBeenCalled();
    // … and the listener does not outlive the fetch.
    expect(res.listenerCount("close")).toBe(0);
  });

  it("does not abort when the response closes normally after being written", async () => {
    let seen: AbortSignal | undefined;
    safeFetch.mockImplementation(async (_url: string, opts: { signal?: AbortSignal }) => {
      seen = opts.signal;
      return { ok: false, status: 404, statusText: "Not Found", buffer: Buffer.alloc(0) };
    });
    const res = makeRes();
    await runUrlAudit({
      url: "https://icjia.illinois.gov/a.pdf",
      privileged: false,
      res,
      eventType: "audit-url",
    });
    res.emit("close");
    expect(seen!.aborted).toBe(false);
    expect(res._status).toBe(502);
  });
});

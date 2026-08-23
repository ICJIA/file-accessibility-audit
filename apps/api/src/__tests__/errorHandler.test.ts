/**
 * The global Express error handler, extracted from index.ts (v1.88.0) so it
 * can be tested: a client-side outcome (4xx, incl. multer's LIMIT_FILE_SIZE →
 * 413) logs ONE line; a server fault (5xx) keeps the full error with stack.
 * Responses are byte-identical to before. Neither line carries an IP, a
 * token, a user agent or a body.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { ANALYSIS } from "#config";
import { errorHandler, logHandledError, statusOf } from "../middleware/errorHandler.js";

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
const req: any = {
  method: "POST",
  path: "/api/analyze",
  ip: "198.51.100.7",
  headers: { authorization: "Bearer leaky-token", "user-agent": "SecretAgent/9" },
  body: { url: "https://private.example/doc.pdf" },
};

afterEach(() => vi.restoreAllMocks());

describe("statusOf", () => {
  it("maps LIMIT_FILE_SIZE to 413, passes through any status value, defaults to 500", () => {
    expect(statusOf({ code: "LIMIT_FILE_SIZE" })).toBe(413);
    expect(statusOf({ status: 400 })).toBe(400);
    expect(statusOf({ status: 503 })).toBe(503);
    expect(statusOf({ status: 200 })).toBe(200);
    expect(statusOf({ status: "404" })).toBe("404");
    expect(statusOf({ status: 0 })).toBe(500);
    expect(statusOf(new Error("boom"))).toBe(500);
    expect(statusOf(undefined)).toBe(500);
  });
});

describe("logHandledError", () => {
  it("a 413 logs one warn line naming status, code, method and path — and nothing about the caller", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logHandledError(Object.assign(new Error("File too large"), { code: "LIMIT_FILE_SIZE" }), req);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toBe("[api] 413 LIMIT_FILE_SIZE POST /api/analyze");
    expect(line).not.toContain("198.51.100.7");
    expect(line).not.toContain("leaky-token");
    expect(line).not.toContain("SecretAgent");
    expect(line).not.toContain("private.example");
    expect(error).not.toHaveBeenCalled();
  });

  it("a 2xx status logs one warn line; the response status and log classification agree", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logHandledError({ status: 200, message: "odd" }, { method: "GET", path: "/x" });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toBe("[api] 200 error GET /x");
    expect(error).not.toHaveBeenCalled();
  });

  it("a 5xx keeps the full error (with stack) on console.error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    logHandledError(err, req);
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(err);
  });

  it("the Error.name fallback labels a 400 error with its name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    logHandledError(Object.assign(new Error("URL not allowed"), { status: 400 }), req);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toBe("[api] 400 Error POST /api/analyze");
  });
});

describe("errorHandler responses are unchanged", () => {
  it("LIMIT_FILE_SIZE → 413 with the size-reduction guidance", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = makeRes();
    errorHandler({ code: "LIMIT_FILE_SIZE" }, req, res, vi.fn());
    expect(res._status).toBe(413);
    expect(res._json.error).toBe(
      `This file is too large. The maximum upload size is ${ANALYSIS.MAX_FILE_SIZE_MB} MB.`,
    );
    expect(res._json.details).toMatch(/Reduced Size PDF/);
  });

  it("an error with a status echoes its message; a bare error is a generic 500", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r1 = makeRes();
    errorHandler(Object.assign(new Error("URL not allowed"), { status: 400 }), req, r1, vi.fn());
    expect(r1._status).toBe(400);
    expect(r1._json).toEqual({ error: "URL not allowed" });

    const r2 = makeRes();
    errorHandler(new Error("disk on fire at /srv/secret"), req, r2, vi.fn());
    expect(r2._status).toBe(500);
    expect(r2._json).toEqual({ error: "Internal server error" });
  });

  it("body-parser's own 413 (no multer code) keeps its own message, not the multer upload guidance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    const next = vi.fn();
    errorHandler(
      Object.assign(new Error("request entity too large"), { status: 413 }),
      req,
      res,
      next,
    );
    expect(res._status).toBe(413);
    expect(res._json).toEqual({ error: "request entity too large" });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toBe("[api] 413 Error POST /api/analyze");
  });
});

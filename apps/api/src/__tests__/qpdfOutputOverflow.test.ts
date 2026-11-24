/**
 * qpdf writes a document's whole object graph to stdout as JSON. When that
 * output is larger than ANALYSIS.QPDF_MAX_BUFFER, Node stops reading and kills
 * the child. That used to be indistinguishable from a corrupt file on the
 * async path ("QPDF parsing failed", no log line) and was reported as a
 * TIMEOUT on the sync path (spawnSync's ENOBUFS error carries SIGTERM).
 *
 * The overflow now has its own error string and one log line. The result is
 * still the ordinary "structure analyzer failed" partial result — downstream
 * code only ever tests `result.error` for truthiness — so no score moves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import {
  analyzeWithQpdf,
  analyzeWithQpdfAsync,
  QPDF_OUTPUT_TOO_LARGE_ERROR,
} from "../services/qpdfService.js";
import { execFile, execFileSync } from "node:child_process";

const mockExecSync = vi.mocked(execFileSync);
const mockExecFile = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;

/** Make the stubbed async execFile call back with `err`. */
function asyncFailsWith(err: unknown, stdout = "", stderr = ""): void {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (e: unknown, so: string, se: string) => void;
    cb(err, stdout, stderr);
    return {} as never;
  });
}

describe("qpdf output larger than QPDF_MAX_BUFFER", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExecSync.mockReset();
    mockExecFile.mockReset();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("async: ERR_CHILD_PROCESS_STDIO_MAXBUFFER gets its own error string and one log line", async () => {
    // The exact shape Node 22 produces (verified against a real child).
    const err: any = new RangeError("stdout maxBuffer length exceeded");
    err.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    asyncFailsWith(err, '{"qpdf":[{"jsonversion":2', "");

    const result = await analyzeWithQpdfAsync(Buffer.from("fake"));

    expect(result.error).toBe(QPDF_OUTPUT_TOO_LARGE_ERROR);
    expect(result.error).not.toBe("QPDF parsing failed");
    expect(result.hasStructTree).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/QPDF_MAX_BUFFER/);
  });

  it("async: an overflow is not a timeout even when Node also marks the child killed", async () => {
    // Node kills the child on overflow; some versions surface that as killed.
    const err: any = new RangeError("stdout maxBuffer length exceeded");
    err.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    err.killed = true;
    err.signal = "SIGTERM";
    asyncFailsWith(err);

    const result = await analyzeWithQpdfAsync(Buffer.from("fake"));
    expect(result.error).toBe(QPDF_OUTPUT_TOO_LARGE_ERROR);
  });

  it("sync: spawnSync's ENOBUFS (which carries SIGTERM) is an overflow, not a timeout", () => {
    const err: any = new Error("spawnSync qpdf ENOBUFS");
    err.code = "ENOBUFS";
    err.signal = "SIGTERM";
    err.status = null;
    mockExecSync.mockImplementation(() => {
      throw err;
    });

    const result = analyzeWithQpdf(Buffer.from("fake"));
    expect(result.error).toBe(QPDF_OUTPUT_TOO_LARGE_ERROR);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("an encrypted file still wins over an overflow", async () => {
    const err: any = new RangeError("stdout maxBuffer length exceeded");
    err.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    asyncFailsWith(err, "", "file is encrypted");

    await expect(analyzeWithQpdfAsync(Buffer.from("fake"))).rejects.toThrow("encrypted");
  });

  it("a real timeout is still a timeout", async () => {
    const err: any = new Error("Command failed");
    err.killed = true;
    err.signal = "SIGTERM";
    asyncFailsWith(err);

    await expect(analyzeWithQpdfAsync(Buffer.from("fake"))).rejects.toThrow("QPDF timeout");
    expect(warn).not.toHaveBeenCalled();
  });

  it("a corrupt file keeps the existing error string and logs nothing new", async () => {
    const err: any = new Error("qpdf: real failure");
    err.code = 2;
    asyncFailsWith(err, "partial garbage", "qpdf: some hard error");

    const result = await analyzeWithQpdfAsync(Buffer.from("fake"));
    expect(result.error).toBe("QPDF parsing failed");
    expect(warn).not.toHaveBeenCalled();
  });
});

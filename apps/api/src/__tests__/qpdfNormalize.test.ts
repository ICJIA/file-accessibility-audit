/**
 * qpdf normalization for the remediation pipeline.
 *
 * qpdf exits 3 ("operation succeeded with warnings") when it REPAIRED
 * recoverable damage — damaged xref, missing trailer keys — and still wrote
 * a valid normalized output. That is the primary remediation input, so exit
 * 3 with output present must count as success (same contract as the audit's
 * exit-3 recovery in qpdfService.handleQpdfError). Hard failures (exit 2,
 * no output) still throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { qpdfNormalize } from "../services/qpdfNormalize.js";

const mockExecFile = vi.mocked(execFile) as unknown as ReturnType<
  typeof vi.fn
>;
const mockExists = vi.mocked(existsSync);

function execResolves(): void {
  mockExecFile.mockImplementation(
    (_bin: any, _args: any, _opts: any, cb: any) => {
      cb(null, "", "");
      return {} as any;
    },
  );
}

function execRejectsWith(code: number, stderr = ""): void {
  mockExecFile.mockImplementation(
    (_bin: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error(`qpdf exited ${code}`);
      err.code = code;
      cb(err, "", stderr);
      return {} as any;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("qpdfNormalize", () => {
  it("returns warnings:false on a clean exit", async () => {
    execResolves();
    await expect(qpdfNormalize("/in.pdf", "/out.pdf")).resolves.toEqual({
      repairedWithWarnings: false,
    });
  });

  it("passes a wall-clock timeout to qpdf so a hung normalize is killed", async () => {
    execResolves();
    await qpdfNormalize("/in.pdf", "/out.pdf", 12345);
    const opts = mockExecFile.mock.calls[0][2] as { timeout?: number };
    expect(opts.timeout).toBe(12345);
  });

  it("treats exit 3 with output present as success (repaired input)", async () => {
    execRejectsWith(3, "WARNING: file is damaged");
    mockExists.mockReturnValue(true);
    await expect(qpdfNormalize("/in.pdf", "/out.pdf")).resolves.toEqual({
      repairedWithWarnings: true,
    });
    expect(mockExists).toHaveBeenCalledWith("/out.pdf");
  });

  it("throws on exit 3 when no output was written", async () => {
    execRejectsWith(3);
    mockExists.mockReturnValue(false);
    await expect(qpdfNormalize("/in.pdf", "/out.pdf")).rejects.toThrow();
  });

  it("throws on exit 2 (hard error) even if a stale output exists", async () => {
    execRejectsWith(2, "qpdf: unrecoverable");
    mockExists.mockReturnValue(true);
    await expect(qpdfNormalize("/in.pdf", "/out.pdf")).rejects.toThrow();
  });
});

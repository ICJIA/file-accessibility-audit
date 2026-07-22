import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock(...) factories are hoisted above plain top-level `const`s, so any
// variable a factory references must itself be declared via vi.hoisted() —
// same idiom already used in qpdfSpawnEnv.test.ts / ooxmlWorker.test.ts /
// remediate-spawn-env.test.ts. Assertions below are unchanged.
const { writeFileSync, unlinkSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ default: { writeFileSync, unlinkSync } }));

const { runVeraPdf } = vi.hoisted(() => ({ runVeraPdf: vi.fn() }));
vi.mock("../services/veraPdf.js", () => ({ runVeraPdf }));

// VERAPDF_PATH is read from #config; override per test via the mock below.
const { cfg } = vi.hoisted(() => ({
  cfg: { REMEDIATION: { VERAPDF_PATH: "/usr/bin/verapdf" as string | null } },
}));
vi.mock("#config", () => cfg);

import { runVeraPdfOnBuffer } from "../services/veraPdfBuffer.js";

beforeEach(() => {
  vi.clearAllMocks();
  cfg.REMEDIATION.VERAPDF_PATH = "/usr/bin/verapdf";
});

describe("runVeraPdfOnBuffer", () => {
  it("returns available:false without writing a temp file when VERAPDF_PATH is unset", async () => {
    cfg.REMEDIATION.VERAPDF_PATH = null;
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(verdict.available).toBe(false);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(runVeraPdf).not.toHaveBeenCalled();
  });

  it("writes a temp file, runs veraPDF against its path, and unlinks it", async () => {
    runVeraPdf.mockResolvedValue({
      available: true, passed: false, profile: "ua1",
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 2 }],
      totalFailureCount: 2,
    });
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const tmpPath = writeFileSync.mock.calls[0][0] as string;
    expect(tmpPath).toMatch(/\.pdf$/);
    expect(runVeraPdf).toHaveBeenCalledWith(tmpPath);
    expect(unlinkSync).toHaveBeenCalledWith(tmpPath);
    expect(verdict.passed).toBe(false);
    expect(verdict.totalFailureCount).toBe(2);
  });

  it("still unlinks the temp file if runVeraPdf rejects, and never throws", async () => {
    runVeraPdf.mockRejectedValue(new Error("boom"));
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(verdict.available).toBe(true);
    expect(verdict.passed).toBe(false);
    expect(verdict.error).toBeTruthy();
  });
});

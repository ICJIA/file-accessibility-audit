import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock(...) factories are hoisted above plain top-level `const`s, so any
// variable a factory references must itself be declared via vi.hoisted() —
// same idiom already used in qpdfSpawnEnv.test.ts / ooxmlWorker.test.ts /
// remediate-spawn-env.test.ts. Assertions below are unchanged.
const { writeFileSync, unlinkSync, existsSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  // v1.97.0: the WCAG profile existence probe. Default true so the wcag path
  // is exercisable; individual tests flip it to prove the missing-file
  // degradation.
  existsSync: vi.fn(() => true),
}));
vi.mock("node:fs", () => ({ default: { writeFileSync, unlinkSync, existsSync } }));

const { runVeraPdf } = vi.hoisted(() => ({ runVeraPdf: vi.fn() }));
vi.mock("../services/veraPdf.js", () => ({ runVeraPdf }));

// VERAPDF_PATH is read from #config; override per test via the mock below.
const { cfg } = vi.hoisted(() => ({
  cfg: {
    REMEDIATION: {
      VERAPDF_PATH: "/usr/bin/verapdf" as string | null,
      VERAPDF_AUDIT_TIMEOUT_MS: 30_000,
      // veraPDF now takes a concurrency slot before writing its temp file
      // (see veraPdfBuffer.ts). These must mirror the real config or every
      // call queues forever and silently reports available:false.
      VERAPDF_MAX_CONCURRENT: 2,
      VERAPDF_QUEUE_TIMEOUT_MS: 60_000,
    },
  },
}));
vi.mock("#config", () => cfg);

import { runVeraPdfOnBuffer, runVeraPdfChecksOnBuffer } from "../services/veraPdfBuffer.js";

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
      available: true,
      passed: false,
      profile: "ua1",
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 2 }],
      totalFailureCount: 2,
    });
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const tmpPath = writeFileSync.mock.calls[0][0] as string;
    expect(tmpPath).toMatch(/\.pdf$/);
    // v1.94.0: the third argument is the detected PDF/UA flavour — "ua1" for
    // this plain buffer (detectPdfUaFlavour has its own tests).
    // v1.94.0: third argument is the detected flavour; v1.97.0: fourth is
    // the profile FILE — undefined for the PDF/UA run (built-in flavour).
    expect(runVeraPdf).toHaveBeenCalledWith(
      tmpPath,
      cfg.REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS,
      "ua1",
      undefined,
    );
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

describe("runVeraPdfChecksOnBuffer (v1.97.0 — the WCAG second opinion)", () => {
  it("wcag:false returns wcag null and runs exactly one veraPDF pass", async () => {
    runVeraPdf.mockResolvedValue({
      available: true,
      passed: true,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
    });
    const r = await runVeraPdfChecksOnBuffer(Buffer.from("%PDF-1.4"), { wcag: false });
    expect(r.wcag).toBeNull();
    expect(runVeraPdf).toHaveBeenCalledTimes(1);
  });

  it("wcag:true runs BOTH passes against the SAME temp copy, writing it once and unlinking it once", async () => {
    runVeraPdf.mockResolvedValue({
      available: true,
      passed: true,
      profile: "x",
      failures: [],
      totalFailureCount: 0,
    });
    const r = await runVeraPdfChecksOnBuffer(Buffer.from("%PDF-1.4"), { wcag: true });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(runVeraPdf).toHaveBeenCalledTimes(2);
    const paths = runVeraPdf.mock.calls.map((c) => c[0]);
    expect(paths[0]).toBe(paths[1]);
    // The WCAG pass carries the vendored profile file; the UA pass does not.
    const profileArgs = runVeraPdf.mock.calls.map((c) => c[3]);
    const wcagCall = profileArgs.find(Boolean) as { path: string; label: string };
    expect(wcagCall.path).toMatch(/WCAG-2-2-Machine\.xml$/);
    expect(wcagCall.label).toBe("wcag-2.2-machine");
    expect(profileArgs.filter((a) => a === undefined)).toHaveLength(1);
    expect(r.wcag).not.toBeNull();
  });

  it("degrades the WCAG check to an honest available:false when the vendored profile is missing — the UA check still runs", async () => {
    // The positive probe result is cached module-level (one stat per
    // process), so get a FRESH module instance for the missing-file world.
    vi.resetModules();
    existsSync.mockReturnValue(false);
    const fresh = await import("../services/veraPdfBuffer.js");
    runVeraPdf.mockResolvedValue({
      available: true,
      passed: true,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
    });
    const r = await fresh.runVeraPdfChecksOnBuffer(Buffer.from("%PDF-1.4"), { wcag: true });
    expect(r.pdfUa.available).toBe(true);
    expect(r.wcag).toEqual(
      expect.objectContaining({ available: false, profile: "wcag-2.2-machine" }),
    );
    expect(runVeraPdf).toHaveBeenCalledTimes(1);
  });

  it("engine unconfigured: pdfUa unavailable, wcag null — no temp file at all", async () => {
    cfg.REMEDIATION.VERAPDF_PATH = null;
    const r = await runVeraPdfChecksOnBuffer(Buffer.from("%PDF-1.4"), { wcag: true });
    expect(r.pdfUa.available).toBe(false);
    expect(r.wcag).toBeNull();
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

/**
 * veraPDF hardening. As of v1.37.0 the PDF/UA-1 check runs on the MAIN
 * analyze path (routes/analyze.ts fires it for every PDF upload), not just
 * the remediation pipeline — so its resource and secrecy posture now has to
 * match the rest of the upload path.
 *
 * Three gaps this file pins:
 *
 *  1. CONCURRENCY. routes/analyze.ts runs veraPDF via `Promise.all` alongside
 *     analyzeDocument, and only analyzeDocument takes the analysis semaphore.
 *     ANALYSIS.MAX_CONCURRENT_ANALYSES is 2 precisely because "on a 4GB
 *     droplet, 2 is the safe maximum… each analysis can consume 50MB+" — but
 *     a veraPDF JVM is several times heavier than that and was spawned once
 *     per in-flight request with no cap at all. The analyze limiter is
 *     500/hour/IP, which bounds RATE, not CONCURRENCY.
 *
 *  2. SPAWN ENV. services/childSpawnEnv.ts (RB2-d/RB3-2) exists so binaries
 *     parsing ATTACKER-CONTROLLED bytes don't inherit the API's secrets. It
 *     is applied to qpdf, the OOXML worker and the remediation worker —
 *     veraPDF, a whole JVM parsing hostile PDFs, was missed.
 *
 *  3. ERROR LEAK. execFile's rejection message is
 *     "Command failed: <binary path> --flavour ua1 … <temp path>", and that
 *     string was returned verbatim as `pdfUaVerdict.error`, which
 *     routes/analyze.ts serializes to the client and reports persist into
 *     shared reports. reportSanitize.ts does not touch it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

const { writeFileSync, unlinkSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ default: { writeFileSync, unlinkSync } }));

const { cfg } = vi.hoisted(() => ({
  cfg: {
    REMEDIATION: {
      VERAPDF_PATH: "/opt/verapdf/verapdf" as string | null,
      VERAPDF_TIMEOUT_MS: 120_000,
      VERAPDF_AUDIT_TIMEOUT_MS: 30_000,
      VERAPDF_MAX_CONCURRENT: 2,
      VERAPDF_QUEUE_TIMEOUT_MS: 60_000,
    },
  },
}));
vi.mock("#config", () => cfg);

import { runVeraPdfOnBuffer } from "../services/veraPdfBuffer.js";
import { runVeraPdf } from "../services/veraPdf.js";

const PDF = Buffer.from("%PDF-1.4");

beforeEach(() => {
  vi.clearAllMocks();
  cfg.REMEDIATION.VERAPDF_PATH = "/opt/verapdf/verapdf";
  cfg.REMEDIATION.VERAPDF_MAX_CONCURRENT = 2;
  cfg.REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS = 60_000;
});

/** Resolve execFile's callback with a successful, minimal veraPDF report. */
function respondOk(): void {
  execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
    cb(
      null,
      JSON.stringify({
        report: { jobs: [{ validationResult: { compliant: true, details: { rules: [] } } }] },
      }),
      "",
    );
  });
}

describe("veraPDF concurrency is bounded", () => {
  it("never runs more JVMs at once than VERAPDF_MAX_CONCURRENT", async () => {
    cfg.REMEDIATION.VERAPDF_MAX_CONCURRENT = 2;
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      release.push(() => {
        inFlight--;
        cb(null, JSON.stringify({ report: { jobs: [] } }), "");
      });
    });

    const all = Promise.all(Array.from({ length: 6 }, () => runVeraPdfOnBuffer(PDF)));
    // Let every queued call get as far as it can, then drain.
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setImmediate(r));
      while (release.length) release.shift()!();
    }
    await all;

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("does not write a temp file for calls still queued for a slot", async () => {
    cfg.REMEDIATION.VERAPDF_MAX_CONCURRENT = 1;
    const release: Array<() => void> = [];
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      release.push(() => cb(null, JSON.stringify({ report: { jobs: [] } }), ""));
    });

    const all = Promise.all(Array.from({ length: 4 }, () => runVeraPdfOnBuffer(PDF)));
    await new Promise((r) => setImmediate(r));

    // Only the one holding the slot may have spilled its buffer to disk.
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setImmediate(r));
      while (release.length) release.shift()!();
    }
    await all;
  });

  it("degrades to available:false instead of failing the audit when the queue times out", async () => {
    cfg.REMEDIATION.VERAPDF_MAX_CONCURRENT = 1;
    cfg.REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS = 5;
    const release: Array<() => void> = [];
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      release.push(() => cb(null, JSON.stringify({ report: { jobs: [] } }), ""));
    });

    const held = runVeraPdfOnBuffer(PDF);
    const queued = runVeraPdfOnBuffer(PDF);
    const verdict = await queued;

    expect(verdict.available).toBe(false);

    while (release.length) release.shift()!();
    await held;
  });
});

describe("veraPDF spawn env", () => {
  it("does not pass API secrets to the veraPDF child, but keeps PATH", async () => {
    process.env.JWT_SECRET = "super-secret-signing-key";
    process.env.SMTP_PASS = "mail-password";
    try {
      respondOk();
      await runVeraPdfOnBuffer(PDF);

      expect(execFileMock).toHaveBeenCalledTimes(1);
      const opts = execFileMock.mock.calls[0][2] as { env?: NodeJS.ProcessEnv };
      expect(opts.env).toBeDefined();
      expect(opts.env!.JWT_SECRET).toBeUndefined();
      expect(opts.env!.SMTP_PASS).toBeUndefined();
      expect(opts.env!.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env.JWT_SECRET;
      delete process.env.SMTP_PASS;
    }
  });
});

describe("veraPDF error text is safe to return to a client", () => {
  it("does not leak the binary path or the temp file path", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      const err = new Error(
        "Command failed: /opt/verapdf/verapdf --flavour ua1 --format json /tmp/9f1c-abc.pdf\nsegfault",
      );
      cb(err, "", "segfault");
    });

    const verdict = await runVeraPdf("/tmp/9f1c-abc.pdf", 1000);

    expect(verdict.error).toBeTruthy();
    expect(verdict.error).not.toContain("/opt/verapdf");
    expect(verdict.error).not.toContain("/tmp/9f1c-abc.pdf");
    expect(verdict.error).not.toContain("Command failed");
  });
});

describe("v1.97.0 — profile-file invocation (the WCAG second opinion's plumbing)", () => {
  it("passes --profile <path> instead of --flavour, and labels the verdict from the profile when output names none", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(
        null,
        JSON.stringify({
          report: { jobs: [{ validationResult: { compliant: false, details: { rules: [] } } }] },
        }),
        "",
      );
    });
    const v = await runVeraPdf("/tmp/x.pdf", 1_000, "ua1", {
      path: "/repo/resources/verapdf/WCAG-2-2-Machine.xml",
      label: "wcag-2.2-machine",
    });
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args).toEqual([
      "--profile",
      "/repo/resources/verapdf/WCAG-2-2-Machine.xml",
      "--format",
      "json",
      "/tmp/x.pdf",
    ]);
    // No profileName in the output → the label of the profile that RAN, never
    // a hardcoded ua1 that would mislabel the WCAG panel (the v1.94.0 rule).
    expect(v.profile).toBe("wcag-2.2-machine");
    expect(v.passed).toBe(false);
  });

  it("without a profile file the flavour args are unchanged (the pre-v1.97.0 contract)", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, JSON.stringify({ report: { jobs: [] } }), "");
    });
    await runVeraPdf("/tmp/x.pdf", 1_000, "ua2");
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args).toEqual(["--flavour", "ua2", "--format", "json", "/tmp/x.pdf"]);
  });
});

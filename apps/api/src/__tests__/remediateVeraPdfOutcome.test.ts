/**
 * veraPDF has THREE outcomes on a remediation job, not two. `runVeraPdf`
 * returns `available:true, passed:false, error:"…"` when the JVM times out,
 * produces no output, or emits JSON it cannot parse — and the job used to
 * record that as `verapdf_failed`, storing verapdf_passed = 0, so the results
 * page badge read "! 0 rule failures" (an amber conformance failure) for a
 * check that never ran. Same class the 2026-09-01 sweep fixed on the audit
 * strip; missed here (fresh-eyes audit, 2026-09-02).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { veraPdfOutcome } from "../jobs/remediateVeraPdf.js";

const base = {
  profile: "PDF/UA-1 validation profile",
  failures: [] as Array<{ ruleId: string; clause: string; description: string; count: number }>,
  totalFailureCount: 0,
  distinctRuleCount: 0,
};

describe("veraPdfOutcome — the event and the stored pass flag for each veraPDF state", () => {
  it("a clean pass records verapdf_passed and stores passed = true", () => {
    const o = veraPdfOutcome({ ...base, available: true, passed: true });
    expect(o.event).toBe("verapdf_passed");
    expect(o.passed).toBe(true);
  });

  it("a real non-conformance records verapdf_failed and stores passed = false", () => {
    const o = veraPdfOutcome({
      ...base,
      available: true,
      passed: false,
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "Marked", count: 1 }],
      totalFailureCount: 1,
      distinctRuleCount: 1,
    });
    expect(o.event).toBe("verapdf_failed");
    expect(o.passed).toBe(false);
  });

  it("an ERROR (timeout / no output / unparseable) records verapdf_error and stores passed = null — never a failure", () => {
    const o = veraPdfOutcome({
      ...base,
      available: true,
      passed: false,
      error: "veraPDF exited with an error and produced no output",
    });
    expect(o.event).toBe("verapdf_error");
    expect(o.passed).toBeNull();
  });

  it("not configured records verapdf_unavailable and stores passed = null", () => {
    const o = veraPdfOutcome({ ...base, available: false, passed: false });
    expect(o.event).toBe("verapdf_unavailable");
    expect(o.passed).toBeNull();
  });
});

describe("setVeraPdfResult persists the third state", () => {
  let tmp: string;
  let jobs: typeof import("../services/remediationJobs.js");

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vera-outcome-"));
    process.env.DB_PATH = path.join(tmp, "test.db");
    jobs = await import("../services/remediationJobs.js");
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("stores verapdf_passed as NULL when veraPDF ran but could not produce a verdict", () => {
    const { job } = jobs.createJob({
      inputFilename: "x.pdf",
      originalFilename: "x.pdf",
      contentHash: "abc123",
      pageCount: 1,
    });
    jobs.setVeraPdfResult(
      job.id,
      true,
      null,
      JSON.stringify({ ...base, available: true, passed: false, error: "timed out" }),
    );
    const stored = jobs.getJobVeraPdf(job.id);
    expect(stored.available).toBe(true);
    expect(stored.passed).toBeNull();
  });
});

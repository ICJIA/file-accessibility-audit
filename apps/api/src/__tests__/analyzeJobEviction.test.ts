/**
 * Security review 2026-11-18 (Medium): 100 tiny uploads that are never
 * polled filled the progress-job store for its whole 10-minute TTL, and
 * every visitor was refused (503) until it drained. Finished, uncollected
 * jobs now give way, oldest first, when the store is full; running jobs
 * never do.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_JOBS,
  _jobCount,
  _resetAnalyzeJobs,
  createAnalyzeJob,
  finishJob,
  pollAnalyzeJob,
  reserveAnalyzeJobSlot,
} from "../services/analyzeJobs.js";

const result = { result: { score: 100 } as never };

function fillWithFinished(n: number): Array<{ id: string; token: string }> {
  const made: Array<{ id: string; token: string }> = [];
  for (let i = 0; i < n; i++) {
    const job = createAnalyzeJob(true);
    expect(job).toBeTruthy();
    finishJob(job!.id, result);
    made.push(job!);
  }
  return made;
}

describe("a store full of uncollected finished jobs", () => {
  beforeEach(() => _resetAnalyzeJobs());

  it("still admits a new visitor (the attack shape: 100 uploads never polled)", () => {
    fillWithFinished(MAX_JOBS);
    expect(_jobCount()).toBe(MAX_JOBS);
    expect(createAnalyzeJob(true)).toBeTruthy();
    expect(_jobCount()).toBe(MAX_JOBS);
  });

  it("the pre-upload reservation is admitted too", () => {
    fillWithFinished(MAX_JOBS);
    const release = reserveAnalyzeJobSlot();
    expect(release).toBeTruthy();
    release!();
  });

  it("evicts the OLDEST finished job first; newer results stay collectable", () => {
    const made = fillWithFinished(MAX_JOBS);
    createAnalyzeJob(true);
    expect(pollAnalyzeJob(made[0]!.id, made[0]!.token)).toBeNull();
    expect(pollAnalyzeJob(made[MAX_JOBS - 1]!.id, made[MAX_JOBS - 1]!.token)?.result).toBeTruthy();
  });

  it("never evicts a running job: the unfinished cap still answers 503", () => {
    for (let i = 0; i < 16; i++) expect(createAnalyzeJob(true)).toBeTruthy();
    expect(createAnalyzeJob(true)).toBeNull();
  });
});

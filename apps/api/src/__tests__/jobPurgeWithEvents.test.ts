/**
 * Step 4 of the retention sweep — purge finished remediation_jobs rows past
 * JOB_ROW_RETENTION_DAYS — had failed on every run since remediation_events
 * gained rows: the events table carried a FOREIGN KEY to remediation_jobs,
 * the API runs with foreign_keys = ON, and the events are kept for
 * EVENT_LOG_RETENTION_DAYS (7 years), so any job old enough to purge still
 * had events and SQLite rejected the whole DELETE. Nothing reported it until
 * v1.88.1's sweep summary did (production, 2026-08-23: "purge_jobs: FOREIGN
 * KEY constraint failed"; 62 finished jobs, the oldest 97 days old against a
 * 30-day policy).
 *
 * Migration 15 rebuilds remediation_events without the constraint: the events
 * ARE the standalone audit trail the policy describes and outlive their job
 * by design. This pins the outcome end to end against the real sweep on a
 * real file-backed database: the job row goes, its events stay, the summary
 * line comes back clean.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "job-purge-events-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.ACTIVITY_LOG_DIR = join(tmpDir, "logs");
process.env.REMEDIATION_ENABLED = "false";

let cleanup: typeof import("../services/remediationCleanup.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let REMEDIATION: (typeof import("#config"))["REMEDIATION"];

beforeAll(async () => {
  ({ REMEDIATION } = await import("#config"));
  cleanup = await import("../services/remediationCleanup.js");
  db = (await import("../db/sqlite.js")).default;
});
afterAll(() => {
  cleanup.stopCleanupInterval();
  rmSync(tmpDir, { recursive: true, force: true });
});

const DAY = 86_400_000;

function insertJob(id: string, status: "expired" | "failed" | "complete", ageDays: number): void {
  const at = Date.now() - ageDays * DAY;
  db.prepare(
    `INSERT INTO remediation_jobs (id, input_filename, status, created_at, completed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}.pdf`, status, at, at, at + DAY);
  for (const event of ["received", "processing_started", "verified_absent"]) {
    db.prepare(
      `INSERT INTO remediation_events (job_id, event, occurred_at, details) VALUES (?, ?, ?, ?)`,
    ).run(id, event, at, JSON.stringify({ note: `${id}:${event}` }));
  }
}

const eventsFor = (id: string): number =>
  (
    db.prepare(`SELECT COUNT(*) AS c FROM remediation_events WHERE job_id = ?`).get(id) as {
      c: number;
    }
  ).c;
const jobExists = (id: string): boolean =>
  db.prepare(`SELECT 1 FROM remediation_jobs WHERE id = ?`).get(id) !== undefined;

describe("retention sweep step 4: finished jobs purge even though their events are kept", () => {
  it("removes a job past JOB_ROW_RETENTION_DAYS, keeps its events, and reports no error", async () => {
    insertJob("old-expired", "expired", REMEDIATION.JOB_ROW_RETENTION_DAYS + 10);
    insertJob("old-failed", "failed", REMEDIATION.JOB_ROW_RETENTION_DAYS + 60);
    insertJob("recent-complete", "complete", 1);
    expect(eventsFor("old-expired")).toBe(3);

    const result = await cleanup.runCleanup();

    expect(result.errors.filter((e) => e.step === "purge_jobs")).toEqual([]);
    expect(result.purgedJobs).toBe(2);
    expect(jobExists("old-expired")).toBe(false);
    expect(jobExists("old-failed")).toBe(false);
    expect(jobExists("recent-complete")).toBe(true);
    // The audit trail outlives the job by policy (EVENT_LOG_RETENTION_DAYS).
    expect(eventsFor("old-expired")).toBe(3);
    expect(eventsFor("old-failed")).toBe(3);
    expect(cleanup.summarizeCleanup(result)).toMatch(/· errors: 0$/);
  });

  it("the next sweep purges nothing new and stays clean", async () => {
    const result = await cleanup.runCleanup();
    expect(result.purgedJobs).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

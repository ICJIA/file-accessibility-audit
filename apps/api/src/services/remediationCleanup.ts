/**
 * The application's retention sweep. Runs on API startup and on an interval
 * — ALWAYS, regardless of REMEDIATION.ENABLED (since v1.51.0; the interval
 * previously early-returned when remediation was off, which silently
 * disabled steps 6–7 too — retention must not hang off a feature flag).
 * Does eight things, in order:
 *
 *   1. Expire outputs past expires_at (delete file, mark row expired,
 *      record verified_absent for the auditor), then delete-and-verify the
 *      rest of the job's directory.
 *   2. Mark stuck jobs failed — a worker dispatched more than 10 min ago that
 *      never finished, or a job that waited in the queue longer than
 *      REMEDIATION.MAX_QUEUE_WAIT_MS — and delete-and-verify the job's whole
 *      directory (scratch copies of the document included). Then start any
 *      queued jobs the freed slots allow.
 *   3. Walk the output directory: delete-and-verify the directory of every
 *      job in a terminal state (failed / expired), the leftover scratch of a
 *      complete one, and any directory with no matching DB row (orphans).
 *      (Review 2026-11-12: this step used to skip every directory whose job
 *      row was under 7 days old, and step 2 deleted nothing — so a worker
 *      killed by its master timeout left the document on disk for about a
 *      week against a published 30-minute bound. No document bytes may
 *      outlive REMEDIATION.OUTPUT_TTL_MS in any terminal state.)
 *   4. Purge job rows past JOB_ROW_RETENTION_DAYS (terminal states only).
 *   5. Purge event rows past EVENT_LOG_RETENTION_DAYS.
 *   6. Purge audit_log rows past AUDIT_LOG_RETENTION_DAYS.
 *   7. Purge shared_reports rows past EXPIRY_DAYS + PURGE_GRACE_DAYS
 *      (v1.51.0). The grace window keeps the read gate's 410 "link has
 *      expired" response alive for a while after expiry before the row —
 *      and its up-to-1MB report_json — is deleted for good.
 *   8. Write the daily activity export — one CSV per complete local day of
 *      audit_log rows, into <repo-root>/logs — and prune activity files past
 *      AUDIT_LOG_RETENTION_DAYS and error-log files past
 *      ERROR_LOG_RETENTION_DAYS (v1.88.0, services/activityExport.ts). Runs
 *      after step 6 so both see one cutoff.
 *
 * Steps 1–4 are no-ops on a deployment that has never run remediation
 * (queries over empty tables; the orphan scan guards on the output dir
 * existing). Each step is idempotent. Failures in one step do not block
 * later steps. Returns a structured result so callers (and the CLI entry
 * point) can log what happened.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import db from "../db/sqlite.js";
import { ACTIVITY_EXPORT, DEPLOY, REMEDIATION, SHARED_REPORTS } from "#config";
import { runActivityExport } from "./activityExport.js";
import { activityLogDir } from "./dataDir.js";
import { pruneErrorLogs } from "./errorLog.js";
import { deleteAndVerify, purgeJobDir, recordEvent } from "./remediationEvents.js";
import { getJob, setExpired, setFailed } from "./remediationJobs.js";
import { dispatchQueuedJobs, endJobFromOutside, reconcileWorkers } from "./remediationQueue.js";
import { killWorkerGroup } from "./workerGroup.js";

const STUCK_RUNNING_MS = 10 * 60_000;

/**
 * A directory with no job row younger than this is left alone for one more
 * sweep: POST /api/remediate writes the upload into the job's directory a
 * moment BEFORE it inserts the row, and that window must not look like an
 * orphan.
 */
const ORPHAN_GRACE_MS = 2 * 60_000;

interface ExpiringRow {
  id: string;
  output_path: string | null;
}

const selectExpiring = db.prepare(
  `SELECT id, output_path FROM remediation_jobs
   WHERE status = 'complete' AND expires_at < ?`,
);

// A job that HOLDS A WORKER SLOT and has for too long: running (measured from
// dispatch; from creation on rows that predate started_at), or dispatched but
// never picked up by its worker. Queued jobs (pending, started_at NULL) are
// not "stuck" — they have their own, separate limit below.
const selectStuckRunning = db.prepare(
  `SELECT id FROM remediation_jobs
   WHERE (status = 'running' AND COALESCE(started_at, created_at) < ?)
      OR (status = 'pending' AND started_at IS NOT NULL AND started_at < ?)`,
);

const selectQueueExpired = db.prepare(
  `SELECT id FROM remediation_jobs
   WHERE status = 'pending' AND started_at IS NULL AND created_at < ?`,
);

const purgeOldJobs = db.prepare(
  `DELETE FROM remediation_jobs
   WHERE status IN ('complete','failed','expired')
     AND COALESCE(completed_at, created_at) < ?`,
);

const purgeOldEvents = db.prepare(`DELETE FROM remediation_events WHERE occurred_at < ?`);

// v1.20.1+: audit_log retention. audit_log is the canonical "this
// content has been audited" record used by the /api/remediate
// audit-gate. Without retention it grows unbounded — the slow-burn
// DoS vector flagged as P2.3 in the v1.20.1 red/blue review.
// created_at is stored as a SQLite TEXT timestamp (DATETIME DEFAULT
// CURRENT_TIMESTAMP), so the cutoff is an ISO string.
const purgeOldAuditLog = db.prepare(`DELETE FROM audit_log WHERE created_at < ?`);

// v1.51.0: shared_reports physical retention. expires_at is an ISO-8601 TEXT
// column (every writer stores `new Date(...).toISOString()`), so lexicographic
// comparison against an ISO cutoff is chronological — the same convention the
// read gate and the dedup lookups already rely on.
const purgeExpiredSharedReports = db.prepare(`DELETE FROM shared_reports WHERE expires_at < ?`);

export interface CleanupResult {
  expiredOutputs: number;
  stuckJobs: number;
  /** Jobs failed because they waited in the queue past MAX_QUEUE_WAIT_MS. */
  queueExpiredJobs: number;
  /** Directories of failed / expired jobs (and leftover scratch of complete
   *  ones) deleted-and-verified by step 3. */
  jobDirsPurged: number;
  orphanDirs: number;
  purgedJobs: number;
  purgedEvents: number;
  /** v1.20.1+: audit_log rows purged past AUDIT_LOG_RETENTION_DAYS. */
  purgedAuditLog: number;
  /** v1.51.0: shared_reports rows purged past EXPIRY_DAYS + PURGE_GRACE_DAYS. */
  purgedSharedReports: number;
  /** v1.88.0: daily activity files written / pruned by step 8. */
  activityFilesWritten: number;
  activityFilesPruned: number;
  /** v1.88.0: error-log files pruned by step 8. */
  errorLogFilesPruned: number;
  errors: Array<{ step: string; message: string }>;
}

export async function runCleanup(): Promise<CleanupResult> {
  const now = Date.now();
  const result: CleanupResult = {
    expiredOutputs: 0,
    stuckJobs: 0,
    queueExpiredJobs: 0,
    jobDirsPurged: 0,
    orphanDirs: 0,
    purgedJobs: 0,
    purgedEvents: 0,
    purgedAuditLog: 0,
    purgedSharedReports: 0,
    activityFilesWritten: 0,
    activityFilesPruned: 0,
    errorLogFilesPruned: 0,
    errors: [],
  };
  const outputRoot = resolve(REMEDIATION.OUTPUT_DIR);

  /* 1. Expire outputs past TTL */
  try {
    const expiring = selectExpiring.all(now) as ExpiringRow[];
    for (const row of expiring) {
      try {
        if (row.output_path && existsSync(row.output_path)) {
          await deleteAndVerify(row.id, row.output_path, "ttl_expired");
        }
        setExpired(row.id);
        recordEvent(row.id, "expired", { reason: "ttl" });
        // Then the rest of the job's directory — whatever is in it. (It used
        // to be removed only when already empty.)
        purgeJobDir(row.id, join(outputRoot, row.id), "ttl_expired");
        result.expiredOutputs++;
      } catch (e) {
        result.errors.push({
          step: "expire",
          message: `${row.id}: ${(e as Error).message}`,
        });
      }
    }
  } catch (e) {
    result.errors.push({ step: "expire_query", message: (e as Error).message });
  }

  /* 2a. Rows whose worker process no longer exists (a restart tree-killed
   *     it, the OOM killer took it): end them now rather than after the
   *     10-minute stuck window. Also run synchronously at boot (index.ts). */
  try {
    result.stuckJobs += reconcileWorkers(now);
  } catch (e) {
    result.errors.push({ step: "reconcile", message: (e as Error).message });
  }

  /* 2. Mark stuck running jobs failed */
  try {
    const stuckCutoff = now - STUCK_RUNNING_MS;
    const stuck = selectStuckRunning.all(stuckCutoff, stuckCutoff) as {
      id: string;
    }[];
    for (const row of stuck) {
      try {
        // Kill the worker's process group and wait for it to be gone, THEN
        // fail the row (freeing its slot), THEN delete and verify the job
        // directory — its input / normalized / tagged copies — with the same
        // events a completed job's deletion records. If the group will not
        // die the row is left active and the next sweep tries again.
        if (
          endJobFromOutside(
            row.id,
            "stuck_running",
            "worker timeout (stuck > 10 min)",
            "marked failed by cleanup sweep",
          )
        ) {
          result.stuckJobs++;
        }
      } catch (e) {
        result.errors.push({
          step: "stuck",
          message: `${row.id}: ${(e as Error).message}`,
        });
      }
    }
  } catch (e) {
    result.errors.push({
      step: "stuck_query",
      message: (e as Error).message,
    });
  }

  /* 2b. Jobs that waited in the queue too long: fail them and delete the
   *     upload they were holding. */
  try {
    const expired = selectQueueExpired.all(now - REMEDIATION.MAX_QUEUE_WAIT_MS) as {
      id: string;
    }[];
    for (const row of expired) {
      try {
        setFailed(row.id, "waited too long for a free remediation slot");
        recordEvent(row.id, "error", {
          error_type: "queue_timeout",
          message: "failed by cleanup sweep after waiting in the queue",
        });
        purgeJobDir(row.id, join(outputRoot, row.id), "cleanup");
        result.queueExpiredJobs++;
      } catch (e) {
        result.errors.push({
          step: "queue_expired",
          message: `${row.id}: ${(e as Error).message}`,
        });
      }
    }
  } catch (e) {
    result.errors.push({ step: "queue_expired_query", message: (e as Error).message });
  }

  /* 2c. Slots freed above (or by workers this process never saw exit) go to
   *     the queue. Only while the feature is on: a queue left over from
   *     before it was switched off must not start work. */
  if (REMEDIATION.ENABLED) {
    try {
      dispatchQueuedJobs();
    } catch (e) {
      result.errors.push({ step: "dispatch", message: (e as Error).message });
    }
  }

  /* 3. Walk OUTPUT_DIR. Each directory is named for its job id, and what
   *    happens to it is decided by that job's CURRENT row — any age:
   *      no row            → orphan: delete (after a short grace)
   *      failed / expired  → nothing of it belongs on disk: delete + verify
   *      complete          → only its output file does: delete leftover scratch
   *      pending / running → in use: leave it alone */
  try {
    if (existsSync(outputRoot)) {
      for (const entry of readdirSync(outputRoot)) {
        const entryPath = join(outputRoot, entry);
        try {
          const s = statSync(entryPath);
          if (!s.isDirectory()) continue;
          const job = getJob(entry);
          if (!job) {
            if (now - s.mtimeMs < ORPHAN_GRACE_MS) continue;
            rmSync(entryPath, { recursive: true, force: true });
            result.orphanDirs++;
          } else if (job.status === "failed" || job.status === "expired") {
            // Never delete under a process that could write it back: if any
            // of this job's worker group is somehow still alive, kill it and
            // leave the directory for the next sweep unless it is confirmed
            // gone.
            const dead = killWorkerGroup({
              jobId: job.id,
              pid: job.workerPid,
              startedAt: job.startedAt,
            });
            if (!dead) continue;
            purgeJobDir(job.id, entryPath, "cleanup");
            result.jobDirsPurged++;
          } else if (job.status === "complete") {
            const scratch = join(entryPath, "work");
            if (existsSync(scratch)) {
              purgeJobDir(job.id, scratch, "cleanup");
              result.jobDirsPurged++;
            }
          }
        } catch (e) {
          result.errors.push({
            step: "orphan",
            message: `${entry}: ${(e as Error).message}`,
          });
        }
      }
    }
  } catch (e) {
    result.errors.push({
      step: "orphan_scan",
      message: (e as Error).message,
    });
  }

  /* 4. Purge job rows past JOB_ROW_RETENTION_DAYS */
  try {
    const cutoff = now - REMEDIATION.JOB_ROW_RETENTION_DAYS * 86_400_000;
    const info = purgeOldJobs.run(cutoff);
    result.purgedJobs = info.changes;
  } catch (e) {
    result.errors.push({
      step: "purge_jobs",
      message: (e as Error).message,
    });
  }

  /* 5. Purge event rows past EVENT_LOG_RETENTION_DAYS */
  try {
    const cutoff = now - REMEDIATION.EVENT_LOG_RETENTION_DAYS * 86_400_000;
    const info = purgeOldEvents.run(cutoff);
    result.purgedEvents = info.changes;
  } catch (e) {
    result.errors.push({
      step: "purge_events",
      message: (e as Error).message,
    });
  }

  /* 6. Purge audit_log rows past AUDIT_LOG_RETENTION_DAYS (v1.20.1+).
   *    audit_log uses TEXT timestamps (DATETIME DEFAULT CURRENT_TIMESTAMP),
   *    so the cutoff is an ISO 8601 string. */
  try {
    const cutoffMs = now - SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS * 86_400_000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const info = purgeOldAuditLog.run(cutoffIso);
    result.purgedAuditLog = info.changes;
  } catch (e) {
    result.errors.push({
      step: "purge_audit_log",
      message: (e as Error).message,
    });
  }

  /* 7. Purge shared_reports past expiry + grace (v1.51.0). Rows inside the
   *    grace window survive so GET /api/reports/:id can keep answering the
   *    informative 410 before the id finally goes 404. */
  try {
    const cutoffMs = now - SHARED_REPORTS.PURGE_GRACE_DAYS * 86_400_000;
    const info = purgeExpiredSharedReports.run(new Date(cutoffMs).toISOString());
    result.purgedSharedReports = info.changes;
  } catch (e) {
    result.errors.push({
      step: "purge_shared_reports",
      message: (e as Error).message,
    });
  }

  /* 8. Daily activity export (v1.88.0): one CSV per complete local day,
   *    derived from audit_log; pruned on the same 365-day window as step 6.
   *    The directory is logs/ at the repository root (activityLogDir —
   *    ACTIVITY_LOG_DIR overrides), which on the production host shares the
   *    volume the /status disk probe watches. Any failure — including a
   *    missing ICU zone — is recorded here rather than falling back silently.
   *    The export and the error-log prune run under their OWN try/catch
   *    blocks: a failure in one (e.g. a bad time zone rejected by the export)
   *    must never stop the other from running. */
  try {
    const r = runActivityExport({
      db,
      dir: activityLogDir(),
      nowMs: now,
      retentionDays: SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS,
      graceMinutes: ACTIVITY_EXPORT.GRACE_MINUTES,
      timeZone: DEPLOY.LOCAL_TIME_ZONE,
    });
    result.activityFilesWritten = r.written;
    result.activityFilesPruned = r.pruned;
  } catch (e) {
    result.errors.push({ step: "activityExport", message: (e as Error).message });
  }

  try {
    result.errorLogFilesPruned = pruneErrorLogs(
      activityLogDir(),
      now,
      ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS,
      DEPLOY.LOCAL_TIME_ZONE,
    );
  } catch (e) {
    result.errors.push({ step: "errorLogPrune", message: (e as Error).message });
  }

  return result;
}

/**
 * One line describing what a sweep did (v1.88.1). Activity files first: "did
 * the first materialisation after a deploy run?" is the question an operator
 * reading `pm2 logs` actually has.
 */
export function summarizeCleanup(r: CleanupResult): string {
  const errors =
    r.errors.length === 0
      ? "0"
      : `${r.errors.length} (${r.errors.map((e) => `${e.step}: ${e.message}`).join("; ")})`;
  return (
    `[sweep] activity files: ${r.activityFilesWritten} written, ${r.activityFilesPruned} pruned` +
    ` · error logs pruned: ${r.errorLogFilesPruned}` +
    ` · audit_log rows purged: ${r.purgedAuditLog}` +
    ` · shared reports purged: ${r.purgedSharedReports}` +
    ` · remediation: ${r.expiredOutputs} expired, ${r.stuckJobs} stuck, ${r.orphanDirs} orphans,` +
    ` ${r.queueExpiredJobs} queue-expired, ${r.jobDirsPurged} job dirs purged,` +
    ` ${r.purgedJobs} jobs purged, ${r.purgedEvents} events purged` +
    ` · errors: ${errors}`
  );
}

function didSomething(r: CleanupResult): boolean {
  return (
    r.expiredOutputs +
      r.stuckJobs +
      r.queueExpiredJobs +
      r.jobDirsPurged +
      r.orphanDirs +
      r.purgedJobs +
      r.purgedEvents +
      r.purgedAuditLog +
      r.purgedSharedReports +
      r.activityFilesWritten +
      r.activityFilesPruned +
      r.errorLogFilesPruned >
      0 || r.errors.length > 0
  );
}

/**
 * Report a sweep's result (v1.88.1). Every captured step error goes to
 * stderr — so it reaches logs/errors-*.log and PM2 — and the summary line to
 * stdout when the sweep did anything, or always (the startup sweep, so a
 * restart's `pm2 logs` always shows one). An idle 5-minute sweep stays silent.
 */
export function logCleanupResult(r: CleanupResult, opts: { always: boolean }): void {
  for (const e of r.errors) console.error(`[sweep] step ${e.step} failed: ${e.message}`);
  if (opts.always || didSomething(r)) console.log(summarizeCleanup(r));
}

/**
 * The one entry point index.ts (startup) and the interval share: run the
 * sweep, report it, never reject. `run` is injectable for tests.
 */
export async function runScheduledSweep(
  opts: { always: boolean },
  run: () => Promise<CleanupResult> = runCleanup,
): Promise<void> {
  try {
    logCleanupResult(await run(), opts);
  } catch (e) {
    console.error("Remediation cleanup sweep failed:", e);
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Schedule the periodic sweep. Safe to call repeatedly; a second call is
 * a no-op (existing interval stays in place).
 *
 * Deliberately NOT gated on REMEDIATION.ENABLED (v1.51.0). It used to be,
 * on the reasoning "when disabled, there's nothing to clean up" — true in
 * v1.18, false ever since the audit_log purge (v1.20.1), the JTI backstop,
 * and the shared_reports purge moved in: turning the remediation flag off
 * (or restarting PM2 from a shell without /etc/environment, which defaults
 * it off) would silently stop ALL retention until the next process restart.
 * The remediation-specific steps are cheap no-ops when the feature is off.
 */
export function startCleanupInterval(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    void runScheduledSweep({ always: false });
  }, REMEDIATION.CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive on its own account
  intervalHandle.unref?.();
}

export function stopCleanupInterval(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/* CLI entry point: `pnpm tsx src/services/remediationCleanup.ts` */
const isMain = (() => {
  try {
    return (
      process.argv[1] !== undefined &&
      resolve(process.argv[1]) === resolve(import.meta.filename ?? "")
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  runCleanup().then(
    (r) => {
      console.log("Cleanup result:", JSON.stringify(r, null, 2));
      process.exit(r.errors.length > 0 ? 1 : 0);
    },
    (e) => {
      console.error("Cleanup failed:", e);
      process.exit(2);
    },
  );
}

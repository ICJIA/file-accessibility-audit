/**
 * Cleanup sweep for the remediation feature. Runs on API startup and
 * on a configured interval. Does five things, in order:
 *
 *   1. Expire outputs past expires_at (delete file, mark row expired,
 *      record verified_absent for the auditor).
 *   2. Mark stuck running jobs failed (created_at older than 10 min).
 *   3. Delete orphan directories (no matching DB row).
 *   4. Purge job rows past JOB_ROW_RETENTION_DAYS (terminal states only).
 *   5. Purge event rows past EVENT_LOG_RETENTION_DAYS.
 *
 * Each step is idempotent. Failures in one step do not block later
 * steps. Returns a structured result so callers (and the CLI entry
 * point) can log what happened.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import db from "../db/sqlite.js";
import { REMEDIATION } from "#config";
import {
  deleteAndVerify,
  recordEvent,
} from "./remediationEvents.js";
import { setExpired, setFailed } from "./remediationJobs.js";

const STUCK_RUNNING_MS = 10 * 60_000;

interface ExpiringRow {
  id: string;
  output_path: string | null;
}

const selectExpiring = db.prepare(
  `SELECT id, output_path FROM remediation_jobs
   WHERE status = 'complete' AND expires_at < ?`,
);

const selectStuckRunning = db.prepare(
  `SELECT id FROM remediation_jobs
   WHERE status IN ('pending','running') AND created_at < ?`,
);

const selectAllRecentIds = db.prepare(
  `SELECT id FROM remediation_jobs WHERE created_at > ?`,
);

const purgeOldJobs = db.prepare(
  `DELETE FROM remediation_jobs
   WHERE status IN ('complete','failed','expired')
     AND COALESCE(completed_at, created_at) < ?`,
);

const purgeOldEvents = db.prepare(
  `DELETE FROM remediation_events WHERE occurred_at < ?`,
);

export interface CleanupResult {
  expiredOutputs: number;
  stuckJobs: number;
  orphanDirs: number;
  purgedJobs: number;
  purgedEvents: number;
  errors: Array<{ step: string; message: string }>;
}

export async function runCleanup(): Promise<CleanupResult> {
  const now = Date.now();
  const result: CleanupResult = {
    expiredOutputs: 0,
    stuckJobs: 0,
    orphanDirs: 0,
    purgedJobs: 0,
    purgedEvents: 0,
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
        // Also remove the job's empty parent directory if it's now empty
        const jobDir = join(outputRoot, row.id);
        try {
          if (existsSync(jobDir) && readdirSync(jobDir).length === 0) {
            rmSync(jobDir, { recursive: true, force: true });
          }
        } catch {}
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

  /* 2. Mark stuck running jobs failed */
  try {
    const stuck = selectStuckRunning.all(now - STUCK_RUNNING_MS) as {
      id: string;
    }[];
    for (const row of stuck) {
      try {
        setFailed(row.id, "worker timeout (stuck > 10 min)");
        recordEvent(row.id, "error", {
          error_type: "stuck_running",
          message: "marked failed by cleanup sweep",
        });
        result.stuckJobs++;
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

  /* 3. Orphan directories — anything in OUTPUT_DIR with no DB row */
  try {
    if (existsSync(outputRoot)) {
      // 7 days ago covers anything realistic; jobs older than this are
      // either purged or aren't ours.
      const recentCutoff = now - 7 * 86_400_000;
      const knownIds = new Set(
        (selectAllRecentIds.all(recentCutoff) as { id: string }[]).map(
          (r) => r.id,
        ),
      );
      for (const entry of readdirSync(outputRoot)) {
        const entryPath = join(outputRoot, entry);
        try {
          const s = statSync(entryPath);
          if (!s.isDirectory()) continue;
          if (!knownIds.has(entry)) {
            rmSync(entryPath, { recursive: true, force: true });
            result.orphanDirs++;
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

  return result;
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Schedule periodic cleanup. Safe to call repeatedly; a second call is
 * a no-op (existing interval stays in place). Only schedules when
 * REMEDIATION.ENABLED is true — when disabled, there's nothing to
 * clean up via the regular pipeline.
 */
export function startCleanupInterval(): void {
  if (intervalHandle) return;
  if (!REMEDIATION.ENABLED) return;
  intervalHandle = setInterval(() => {
    runCleanup().catch((e) => {
      console.error("Remediation cleanup sweep failed:", e);
    });
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

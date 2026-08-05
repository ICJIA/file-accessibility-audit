/**
 * The application's retention sweep. Runs on API startup and on an interval
 * — ALWAYS, regardless of REMEDIATION.ENABLED (since v1.51.0; the interval
 * previously early-returned when remediation was off, which silently
 * disabled steps 6–8 too — retention must not hang off a feature flag).
 * Does eight things, in order:
 *
 *   1. Expire outputs past expires_at (delete file, mark row expired,
 *      record verified_absent for the auditor).
 *   2. Mark stuck running jobs failed (created_at older than 10 min).
 *   3. Delete orphan directories (no matching DB row).
 *   4. Purge job rows past JOB_ROW_RETENTION_DAYS (terminal states only).
 *   5. Purge event rows past EVENT_LOG_RETENTION_DAYS.
 *   6. Purge audit_log rows past AUDIT_LOG_RETENTION_DAYS.
 *   7. Purge expired revoked_jtis rows (C4 JWT revocation denylist). Also
 *      purged opportunistically on every logout (see auth.ts /
 *      jtiDenylist.ts), so this is a backstop for a server with few logouts.
 *   8. Purge shared_reports rows past EXPIRY_DAYS + PURGE_GRACE_DAYS
 *      (v1.51.0). The grace window keeps the read gate's 410 "link has
 *      expired" response alive for a while after expiry before the row —
 *      and its up-to-1MB report_json — is deleted for good.
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
import { REMEDIATION, SHARED_REPORTS } from "#config";
import { deleteAndVerify, recordEvent } from "./remediationEvents.js";
import { setExpired, setFailed } from "./remediationJobs.js";
import { purgeExpiredJtis } from "./jtiDenylist.js";

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

const selectAllRecentIds = db.prepare(`SELECT id FROM remediation_jobs WHERE created_at > ?`);

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
  orphanDirs: number;
  purgedJobs: number;
  purgedEvents: number;
  /** v1.20.1+: audit_log rows purged past AUDIT_LOG_RETENTION_DAYS. */
  purgedAuditLog: number;
  /** C4: revoked_jtis rows purged past their own expiry. */
  purgedJtis: number;
  /** v1.51.0: shared_reports rows purged past EXPIRY_DAYS + PURGE_GRACE_DAYS. */
  purgedSharedReports: number;
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
    purgedAuditLog: 0,
    purgedJtis: 0,
    purgedSharedReports: 0,
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
        (selectAllRecentIds.all(recentCutoff) as { id: string }[]).map((r) => r.id),
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

  /* 7. Purge expired revoked_jtis rows (C4). */
  try {
    result.purgedJtis = purgeExpiredJtis();
  } catch (e) {
    result.errors.push({
      step: "purge_jtis",
      message: (e as Error).message,
    });
  }

  /* 8. Purge shared_reports past expiry + grace (v1.51.0). Rows inside the
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

  return result;
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

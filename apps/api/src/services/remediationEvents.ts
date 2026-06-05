import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import db from "../db/sqlite.js";

/**
 * Lifecycle events tracked per remediation job. Append-only. Used to
 * render the user-facing processing receipt, the auditor compliance
 * report, and the cleanup-on-startup reconciliation.
 *
 * See docs/archive/pdf-remediation-integration-plan.md → "Lifecycle audit trail"
 * for the canonical event list and meaning.
 */
export type RemediationEvent =
  | "received"
  | "processing_started"
  | "normalize_complete"
  | "input_deleted"
  | "tagging_complete"
  | "intermediate_deleted"
  | "validation_passed"
  | "validation_failed"
  | "verapdf_passed"
  | "verapdf_failed"
  | "verapdf_unavailable"
  | "output_ready"
  | "downloaded"
  | "output_deleted"
  | "verified_absent"
  | "verify_failed"
  | "error"
  | "expired";

export interface EventRecord {
  id: number;
  jobId: string;
  event: RemediationEvent;
  occurredAt: number;
  details: Record<string, unknown> | null;
}

interface EventRow {
  id: number;
  job_id: string;
  event: string;
  occurred_at: number;
  details: string | null;
}

const insertStmt = db.prepare(
  "INSERT INTO remediation_events (job_id, event, occurred_at, details) VALUES (?, ?, ?, ?)",
);

const selectByJobStmt = db.prepare(
  "SELECT id, job_id, event, occurred_at, details FROM remediation_events WHERE job_id = ? ORDER BY occurred_at ASC, id ASC",
);

/**
 * Append an event to the lifecycle log. Never throws on details
 * serialisation failure — the event is recorded with `details=null`
 * and a separate `error` event explaining the loss is appended.
 */
export function recordEvent(
  jobId: string,
  event: RemediationEvent,
  details?: Record<string, unknown>,
): void {
  let serialized: string | null = null;
  if (details) {
    try {
      serialized = JSON.stringify(details);
    } catch (e) {
      serialized = null;
      // best-effort: log the failure as its own event without recursing
      insertStmt.run(jobId, "error", Date.now(), JSON.stringify({
        error_type: "event_details_serialize_failed",
        original_event: event,
        message: (e as Error).message,
      }));
    }
  }
  insertStmt.run(jobId, event, Date.now(), serialized);
}

export function getEventsForJob(jobId: string): EventRecord[] {
  const rows = selectByJobStmt.all(jobId) as EventRow[];
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    event: r.event as RemediationEvent,
    occurredAt: r.occurred_at,
    details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null,
  }));
}

/**
 * SHA-256 hex digest of a filesystem path string. Used in event
 * `details` to identify which file was deleted without exposing the
 * actual path in the audit log (paths can include jobIds that
 * cross-reference rows, but hashing them keeps the event payload
 * uniform-length and resistant to log scraping).
 */
function hashPath(path: string): string {
  return createHash("sha256").update(path).digest("hex");
}

/**
 * Verify a path is gone after a deletion. Records `verified_absent`
 * on ENOENT (the happy path); records `verify_failed` if the file
 * still exists or another error occurs. Returns true only when
 * ENOENT was observed — callers can use this to gate downstream
 * cleanup or compliance reporting.
 */
export async function verifyAbsent(
  jobId: string,
  filePath: string,
): Promise<boolean> {
  const pathHash = hashPath(filePath);
  try {
    await fs.stat(filePath);
    // file still exists — this is a compliance problem
    recordEvent(jobId, "verify_failed", {
      path_hash: pathHash,
      reason: "file still present after delete",
    });
    return false;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      recordEvent(jobId, "verified_absent", { path_hash: pathHash });
      return true;
    }
    recordEvent(jobId, "verify_failed", {
      path_hash: pathHash,
      reason: err.code ?? "stat failed",
      message: err.message,
    });
    return false;
  }
}

/**
 * Delete a file then verify the deletion. Combines the two steps so
 * callers can't accidentally skip verification. Records `error` on
 * delete failure but always attempts to verify regardless.
 */
export async function deleteAndVerify(
  jobId: string,
  filePath: string,
  trigger: "download" | "ttl_expired" | "manual" | "cleanup",
): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    recordEvent(jobId, "output_deleted", {
      path_hash: hashPath(filePath),
      trigger,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      // already gone — still record so the receipt is complete
      recordEvent(jobId, "output_deleted", {
        path_hash: hashPath(filePath),
        trigger,
        note: "already absent at delete time",
      });
    } else {
      recordEvent(jobId, "error", {
        error_type: "delete_failed",
        path_hash: hashPath(filePath),
        message: err.message,
      });
    }
  }
  return verifyAbsent(jobId, filePath);
}

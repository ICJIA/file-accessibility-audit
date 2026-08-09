import crypto from "node:crypto";
import path from "node:path";
import db from "../db/sqlite.js";
import { FILENAME, STATUS } from "#config";

/**
 * Shared writer for the audit_log table.
 *
 * audit_log is the canonical "this content has been audited" record.
 * Every audit path (browser upload, URL submit, fleet bulk, audit-url
 * persist) calls this so a single SQL query against (content_hash,
 * created_at) can answer "has this PDF been audited recently?" — used
 * by /api/remediate to gate remediation behind a prior audit.
 *
 * The function is best-effort. A logging failure must not block the
 * audit response that produced the event. The caller decides whether
 * to surface a warning if the row didn't write.
 */

export interface RecordAuditInput {
  filename: string;
  score: number | null;
  grade: string | null;
  contentHash?: string | null;
  /** Event type label. Default: 'analyze'. */
  eventType?: string;
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const insertStmt = db.prepare(
  `INSERT INTO audit_log
     (event_type, filename, score, grade, content_hash)
   VALUES (?, ?, ?, ?, ?)`,
);

/**
 * Hard length cap applied at the writer, not at the call sites.
 *
 * `filename` is attacker-controlled on every request — it comes from the
 * multipart Content-Disposition header — and is not bounded by anything
 * upstream. Clamping here means a new caller cannot reintroduce the gap by
 * forgetting, which is exactly how the rejection path acquired it (see
 * recordRejectedUpload).
 *
 * Length ONLY, no character filtering: audit-url-page deliberately stores a
 * URL in the filename column, and stripping `:` and `/` would mangle it.
 * Character sanitising belongs at the callers that know they hold a filename.
 */
const MAX_FILENAME_CHARS = 512;

function clamp(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Reduce an uploaded filename to the safe subset before storage: basename
 * only, length-capped, and restricted to FILENAME.ALLOWED_CHARS. Mirrors the
 * sanitiser routes/analyze.ts already applies on the success path — the point
 * of exporting it is that the two paths cannot drift.
 *
 * Only for values known to be filenames. Do NOT apply it to the URL that
 * audit-url-page stores in the same column.
 */
export function sanitizeStoredFilename(raw: string): string {
  // Collapse ALL whitespace to a plain space FIRST. FILENAME.ALLOWED_CHARS
  // permits `\s`, which matches \n, \r and \t as well as the ordinary space —
  // so on its own the allow-list lets line breaks through into a stored value
  // (red/blue audit 2026-08-05, finding R2). A filename is a single line by
  // definition, and anything downstream that renders these rows line-by-line
  // or exports them as delimited text would inherit the gap. Fixed here rather
  // than by narrowing the shared config regex, which routes/remediate.ts also
  // uses to build on-disk names.
  const singleLine = raw.replace(/\s/g, " ");
  const base = path.basename(singleLine).slice(0, FILENAME.MAX_LENGTH);
  const cleaned = base.replace(
    new RegExp(`[^${FILENAME.ALLOWED_CHARS.source.slice(1, -1)}]`, "g"),
    "_",
  );
  return cleaned.trim() || "unnamed_file";
}

export function recordAudit(input: RecordAuditInput): void {
  try {
    // The whole row is metadata ABOUT the audit event — file name, score,
    // grade, timestamp, content hash. Deliberately nothing about WHO:
    // v1.68.0 removed identity storage (no email, no IP address, no
    // user-agent), and this writer is where that guarantee is enforced for
    // every current and future call site.
    insertStmt.run(
      input.eventType ?? "analyze",
      clamp(input.filename, MAX_FILENAME_CHARS) ?? "",
      input.score,
      input.grade,
      input.contentHash ?? null,
    );
  } catch (err) {
    // Don't block the response on a logging failure — the audit
    // result has already been computed. Log to stderr so operators
    // can spot persistent issues.
    console.error("audit_log write failed:", err);
  }
}

/**
 * Records an upload the tool REFUSED — a legacy Office binary, a CSV, or any
 * other unauditable file. Separate from recordAudit's callers by event type
 * (STATUS.REJECTION_EVENT_TYPES), so refusals never inflate documents_audited
 * and never land in the grade distribution.
 *
 * Never writes a content_hash. The remediation audit-gate matches on
 * content_hash + email with no event_type filter, so a hash here would let
 * "this content was refused" satisfy a check that means "this content was
 * audited". Passing nothing means the column is NULL, which cannot match.
 * (The multer filter has no buffer to hash at that point anyway — the
 * guarantee and the mechanics agree.)
 *
 * Best-effort like recordAudit: a logging failure must never turn a clean 400
 * into a 500.
 */
export function recordRejectedUpload(input: { filename: string }): void {
  recordAudit({
    eventType: STATUS.REJECTION_EVENT_TYPES[0],
    // Sanitised HERE rather than at the callers. The multer file filter had
    // been passing file.originalname straight through, so a 4 kB filename
    // carrying raw markup was persisted verbatim. Doing it in the writer
    // means the guarantee holds for every call site including future ones,
    // instead of depending on each one remembering — the same reasoning as
    // the NULL content_hash above.
    filename: sanitizeStoredFilename(input.filename),
    score: null,
    grade: null,
    contentHash: null,
  });
}

/**
 * "Has this content been audited within the window?" Used by POST
 * /api/remediate to enforce the audit-before-remediate gate.
 *
 * Content-hash only (v1.68.0): identity storage is gone, so the gate binds
 * to the BYTES — remediation still requires that these exact bytes passed
 * through an audit recently (any path: browser upload, URL submit, fleet
 * bulk), which is the property that stops callers bypassing the audit
 * pipeline's rate limit by jumping straight to remediation. The per-caller
 * daily cap that used to ride the same identity lives in
 * services/remediationCap.ts (in-memory, transient).
 */
const findRecentAuditStmt = db.prepare(
  `SELECT 1 FROM audit_log
    WHERE content_hash = ?
      AND created_at > datetime(?, 'unixepoch')
    LIMIT 1`,
);

export function hasRecentAudit(contentHash: string, windowMs: number): boolean {
  const sinceUnixSec = Math.floor((Date.now() - windowMs) / 1000);
  const row = findRecentAuditStmt.get(contentHash, sinceUnixSec);
  return !!row;
}

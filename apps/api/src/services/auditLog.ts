import crypto from 'node:crypto'
import db from '../db/sqlite.js'

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
  email: string | null
  filename: string
  score: number | null
  grade: string | null
  contentHash?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  /** Event type label. Default: 'analyze'. */
  eventType?: string
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * The identity string used by the audit-gate + daily-cap on
 * /api/remediate. When authenticated, this is just the user's email.
 * When anonymous (AUTH.REQUIRE_LOGIN=false), it's `anon:${ip}` so two
 * different callers don't share a single 'anonymous' bucket — closing
 * P2.1 from the v1.20.1 red/blue review.
 *
 * Treat the result as opaque; only the equality comparison matters.
 */
export function gateIdentity(
  email: string | null | undefined,
  ip: string | null | undefined,
): string {
  if (email && email !== 'anonymous') {
    return email
  }
  // Strip IPv6 brackets + zone identifier for stability.
  const cleanIp = (ip ?? 'unknown').replace(/^\[|\]$/g, '').split('%')[0]
  return `anon:${cleanIp}`
}

const insertStmt = db.prepare(
  `INSERT INTO audit_log
     (event_type, email, filename, score, grade,
      ip_address, user_agent, content_hash)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
)

export function recordAudit(input: RecordAuditInput): void {
  try {
    insertStmt.run(
      input.eventType ?? 'analyze',
      // email is required-NOT-NULL on audit_log; coerce anonymous to a
      // sentinel string so dev / no-auth deployments still write rows.
      input.email ?? 'anonymous',
      input.filename,
      input.score,
      input.grade,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.contentHash ?? null,
    )
  } catch (err) {
    // Don't block the response on a logging failure — the audit
    // result has already been computed. Log to stderr so operators
    // can spot persistent issues.
    // eslint-disable-next-line no-console
    console.error('audit_log write failed:', err)
  }
}

/**
 * "Has this content been audited by this caller within the window?"
 * Used by POST /api/remediate to enforce the audit-before-remediate
 * gate.
 *
 * The query matches on content_hash + email (so audits from any
 * audit path — browser upload, URL submit, fleet bulk — all count
 * uniformly). When AUTH.REQUIRE_LOGIN is false, every caller is the
 * "anonymous" sentinel and the check still works.
 */
const findRecentAuditStmt = db.prepare(
  `SELECT 1 FROM audit_log
    WHERE content_hash = ?
      AND email = ?
      AND created_at > datetime(?, 'unixepoch')
    LIMIT 1`,
)

export function hasRecentAudit(
  contentHash: string,
  email: string,
  windowMs: number,
): boolean {
  const sinceUnixSec = Math.floor((Date.now() - windowMs) / 1000)
  const row = findRecentAuditStmt.get(contentHash, email, sinceUnixSec)
  return !!row
}

/**
 * "How many remediation jobs has this caller started in the window?"
 * Used by POST /api/remediate to enforce the daily cap. Counts every
 * non-pending row (pending rows aren't yet a meaningful resource hit;
 * the per-user concurrent limit handles those separately).
 */
const countRemediationsStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM remediation_jobs
    WHERE email = ?
      AND created_at > ?`,
)

export function countRecentRemediations(
  email: string,
  windowMs: number,
): number {
  const sinceMs = Date.now() - windowMs
  const row = countRemediationsStmt.get(email, sinceMs) as { n: number }
  return row.n
}

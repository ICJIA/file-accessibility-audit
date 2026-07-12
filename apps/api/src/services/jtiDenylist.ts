/**
 * Server-side JWT revocation via a jti denylist (C4).
 *
 * Sessions are stateless JWTs (see routes/auth.ts + middleware/
 * authMiddleware.ts) — normally there is nothing to "revoke" server-side
 * short of waiting out the token's own expiry. Logout writes the token's
 * jti here (keyed to the token's own exp, so the row never needs to
 * outlive what the JWT itself would already reject) and authMiddleware
 * checks this table whenever a presented token carries a jti. Tokens
 * signed before this feature existed carry no jti at all and are never
 * looked up here — see authMiddleware.ts's `payload.jti &&` guard.
 *
 * Rows never contain anything sensitive: just an opaque UUID (the jti)
 * and a millisecond-epoch expiry timestamp.
 */
import db from "../db/sqlite.js";

const insertStmt = db.prepare(
  "INSERT OR REPLACE INTO revoked_jtis (jti, expires_at) VALUES (?, ?)",
);
const existsStmt = db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ? AND expires_at > ?");
const purgeStmt = db.prepare("DELETE FROM revoked_jtis WHERE expires_at <= ?");

/**
 * Record `jti` as revoked until `expiresAtMs` (should be the SAME token's
 * own `exp` claim, converted to milliseconds — there is never a reason to
 * keep a denylist row alive longer than the JWT it blocks would already be
 * rejected for on expiry grounds alone). Opportunistically purges rows that
 * have already expired first, so the table doesn't grow without bound
 * between runs of the periodic cleanup sweep (see remediationCleanup.ts).
 */
export function revokeJti(jti: string, expiresAtMs: number): void {
  purgeExpiredJtis();
  insertStmt.run(jti, expiresAtMs);
}

/**
 * True if `jti` is present and its recorded expiry has not yet passed. A
 * row past its own expiry is treated as not-revoked even if the periodic
 * sweep hasn't purged it yet — moot in practice, since the JWT carrying
 * that jti would already fail standard `exp` verification by then anyway.
 */
export function isJtiRevoked(jti: string): boolean {
  return existsStmt.get(jti, Date.now()) !== undefined;
}

/**
 * Delete every row past its recorded expiry. Called opportunistically from
 * revokeJti() (every logout) and from the shared remediation cleanup sweep
 * (see remediationCleanup.ts) as a backstop for a server with few logouts.
 * Safe to call anytime, including when the table is empty. Returns the
 * number of rows removed.
 */
export function purgeExpiredJtis(): number {
  return purgeStmt.run(Date.now()).changes;
}

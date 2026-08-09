/**
 * In-memory per-caller daily remediation cap (v1.68.0).
 *
 * The identity-keyed SQL count this replaces (`SELECT COUNT(*) FROM
 * remediation_jobs WHERE email = ?`) died with identity storage: the
 * service no longer stores WHO did anything. The cap still has to exist —
 * it is the brake that stops one caller consuming the whole remediation
 * pipeline — so it lives here, in process memory, keyed by the caller's IP
 * address used TRANSIENTLY: never written to disk, a database row, or any
 * log, and gone entirely on restart. That reset is acceptable: the cap is
 * an abuse brake, not an entitlement ledger.
 *
 * Single-threaded JS makes check-and-reserve atomic, which is the property
 * the old SQL transaction (P2.4, v1.20.1 review) existed to guarantee.
 * Refused attempts do not consume slots. Empty keys are pruned on touch so
 * the map cannot grow monotonically across the retention window.
 */

const reservations = new Map<string, number[]>();

/**
 * Normalize a request IP into a stable in-memory cap key. Strips IPv6
 * brackets and zone identifiers (the same normalization the old
 * gateIdentity applied). The result never leaves process memory.
 */
export function capKeyFromIp(ip: string | null | undefined): string {
  return (ip ?? "unknown").replace(/^\[|\]$/g, "").split("%")[0];
}

/**
 * Reserve one remediation slot for `key` if fewer than `limit` reservations
 * exist inside the trailing `windowMs`. Returns whether the reservation was
 * granted; a refusal reserves nothing.
 */
export function reserveRemediationSlot(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const kept = prune(key, windowMs, now);
  if (kept.length >= limit) return false;
  kept.push(now);
  reservations.set(key, kept);
  return true;
}

/** How many reservations `key` holds inside the trailing window. */
export function remediationSlotsUsed(
  key: string,
  windowMs: number,
  now: number = Date.now(),
): number {
  return prune(key, windowMs, now).length;
}

function prune(key: string, windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  const kept = (reservations.get(key) ?? []).filter((t) => t > cutoff);
  if (kept.length === 0) reservations.delete(key);
  else reservations.set(key, kept);
  return kept;
}

/** Test hook: clear all reservations. */
export function _resetRemediationCap(): void {
  reservations.clear();
}

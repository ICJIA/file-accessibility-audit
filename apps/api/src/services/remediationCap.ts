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
import { clientKeyFromIp } from "./clientKey.js";

const reservations = new Map<string, number[]>();

/**
 * Normalize a request IP into a stable in-memory cap key — the SAME key every
 * rate limiter uses (services/clientKey.ts): IPv4 as-is, IPv4-mapped IPv6 as
 * its IPv4 address, any other IPv6 by its /64, so a caller cannot rotate
 * addresses inside their own /64 past the daily cap (review 2026-11-12). The
 * result never leaves process memory.
 */
export function capKeyFromIp(ip: string | null | undefined): string {
  return clientKeyFromIp(ip);
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
  activeJobsByCaller.clear();
}

/* ---------------------------------------------------------------------- */
/* Per-caller share of the remediation queue                               */
/* ---------------------------------------------------------------------- */
// The global cap (REMEDIATION.MAX_CONCURRENT_JOBS + MAX_QUEUED_JOBS) bounds
// the box; this bounds one caller's share of it, so a single caller cannot
// occupy every slot and the whole queue (review 2026-11-12). Which caller
// started which job is held HERE, in process memory, and nowhere else — the
// job row carries no caller (v1.68.0). A restart forgets it, which only
// means the share resets; the global cap does not depend on it.

const activeJobsByCaller = new Map<string, Set<string>>();

/**
 * How many of this caller's jobs are still queued or running. `isActive`
 * answers for one job id (the route passes a row lookup); ids that are no
 * longer active are dropped as a side effect, which is how a slot is
 * released when a job reaches a terminal state.
 */
export function callerActiveJobs(key: string, isActive: (jobId: string) => boolean): number {
  const ids = activeJobsByCaller.get(key);
  if (!ids) return 0;
  for (const id of ids) if (!isActive(id)) ids.delete(id);
  if (ids.size === 0) activeJobsByCaller.delete(key);
  return ids.size;
}

/** Note that `key` started `jobId`. */
export function trackCallerJob(key: string, jobId: string): void {
  let ids = activeJobsByCaller.get(key);
  if (!ids) activeJobsByCaller.set(key, (ids = new Set()));
  ids.add(jobId);
}

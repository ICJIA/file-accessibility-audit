/**
 * "Server busy" plumbing shared by the audit routes (review 2026-11-12).
 *
 * A full analysis line (ANALYSIS.MAX_QUEUED_ANALYSES) surfaces as an error
 * with `status: 503` from the analyzer's semaphore. Two things were missing:
 *
 *   - the synchronous routes answered 503 with no `Retry-After`, so an
 *     automated caller could only guess when to come back — setBusyRetryAfter;
 *   - an analyze JOB failed outright, although its caller is merely polling
 *     and has no way to "retry" short of uploading again — retryWhileBusy.
 */
import type { Response } from "express";
import { ANALYSIS } from "#config";

/** Put `Retry-After` on a 503 that means "busy, come back shortly". */
export function setBusyRetryAfter(res: Pick<Response, "setHeader">): void {
  // Guarded: the route unit tests pass bare response doubles.
  if (typeof res?.setHeader === "function") {
    res.setHeader("Retry-After", String(ANALYSIS.BUSY_RETRY_AFTER_S));
  }
}

export function isBusyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { status?: unknown }).status === 503;
}

export interface BusyRetryOptions {
  /** Give up (rethrow the busy error) once this much time has been spent waiting. */
  totalMs: number;
  /** First delay; doubles each attempt up to maxDelayMs. */
  firstDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Run `fn`; while it fails with a busy (503) error, wait and run it again,
 * with exponential backoff, until `totalMs` has passed — then rethrow the
 * busy error. Any other error is rethrown at once.
 */
export async function retryWhileBusy<T>(fn: () => Promise<T>, opts: BusyRetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const maxDelay = opts.maxDelayMs ?? 5_000;
  const deadline = now() + opts.totalMs;
  let delay = opts.firstDelayMs ?? 500;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isBusyError(err)) throw err;
      const left = deadline - now();
      if (left <= 0) throw err;
      await sleep(Math.min(delay, left));
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}

/**
 * The batch audit loop, pulled out of pages/index.vue (review 2026-11-12).
 *
 * WHY IT MOVED. The loop used to read and write the page's shared state
 * directly — `batchItems.value`, `batchProcessing`, one module-level abort
 * controller. Resetting mid-batch did not stop it, so the OLD run's tail
 * went on to act on whatever the page held next: it marked the NEW batch's
 * queued files "cancelled" (and dropped their File objects), declared the new
 * batch finished while it was still running, nulled the new run's abort
 * controller so Cancel stopped working, and its workers could even pick up
 * the new batch's files.
 *
 * THE RULE NOW: a run owns exactly the `items` array and the `signal` it was
 * given, and touches nothing else. It never looks at the page. A run whose
 * signal is aborted stops picking up work, and what it does afterwards lands
 * only on its own (already discarded) items.
 *
 * BUSY IS NOT BROKEN (2026-11-24, when a batch grew from 5 files to 25). The
 * server answers 429 (this network has sent too much) or 503 (both analysis
 * slots are taken) with a Retry-After header. That is a request to wait, not
 * a verdict on the file — but it used to mark the file failed and move on,
 * so one busy moment failed every file behind it. A run now WAITS (for the
 * server's Retry-After, else a growing pause), says so on the item, and
 * tries that file again, a bounded number of times. The wait ends at once
 * when the run is cancelled.
 */
export type BatchItemStatus = "queued" | "processing" | "done" | "error" | "cancelled";

export interface BatchRunItem<R, E> {
  id: string;
  filename: string;
  /** Nulled once the item reaches a terminal state, to free the File. */
  file: File | null;
  status: BatchItemStatus;
  result: R | null;
  error: E | null;
  /** Set while this file is waiting to be tried again after a busy answer —
   *  shown beside the file in the progress list. Cleared when it resumes. */
  note?: string | null;
}

/** How many times one file is tried in total before a busy answer counts as
 *  its failure. */
export const BATCH_MAX_ATTEMPTS = 6;
/** A single wait is never longer than this, whatever Retry-After says: a
 *  rate limit that will not clear for half an hour is a failure to report,
 *  not a spinner to sit under. */
export const BATCH_MAX_WAIT_MS = 90_000;
/** With no Retry-After: 4 s, 8 s, 16 s, 32 s, 64 s. */
export const BATCH_BASE_WAIT_MS = 4_000;

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const code = e?.status ?? e?.statusCode ?? e?.response?.status;
  return typeof code === "number" ? code : undefined;
}

/** True for the two answers that mean "wait and ask again". */
export function isBusyError(err: unknown): boolean {
  // "Lost contact" while polling is not a busy answer: the job may still be
  // running on the server, and sending the file again would start a second.
  if ((err as { lostContact?: boolean } | null)?.lostContact) return false;
  const code = statusOf(err);
  return code === 429 || code === 503;
}

/** Retry-After in ms (delta-seconds or an HTTP date), or null when absent. */
export function retryAfterMs(err: unknown, now: number = Date.now()): number | null {
  const headers = (err as { response?: { headers?: unknown } } | null)?.response?.headers;
  let raw: unknown;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, unknown>)["retry-after"];
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * How long to wait before trying a busy file again, or null to stop trying:
 * the attempts are used up, or the server asked for a wait longer than this
 * page will sit through.
 *
 * @param attempt  how many times the file has been tried so far (≥ 1)
 */
export function busyWaitMs(err: unknown, attempt: number, now: number = Date.now()): number | null {
  if (!isBusyError(err)) return null;
  if (attempt >= BATCH_MAX_ATTEMPTS) return null;
  const asked = retryAfterMs(err, now);
  if (asked !== null) {
    if (asked > BATCH_MAX_WAIT_MS) return null;
    // Never hammer: a "Retry-After: 0" still waits a moment.
    return Math.max(1_000, asked);
  }
  return Math.min(BATCH_BASE_WAIT_MS * 2 ** (attempt - 1), BATCH_MAX_WAIT_MS);
}

/** Resolves after `ms`, or immediately when the signal aborts. Never rejects. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export interface BatchRunOptions<R, E> {
  /** THIS run's items — mutated in place (pass the reactive array). */
  items: BatchRunItem<R, E>[];
  /** THIS run's abort signal. */
  signal: AbortSignal;
  analyze: (file: File, signal: AbortSignal) => Promise<R>;
  describeError: (err: unknown) => E;
  /** Matches the API's MAX_CONCURRENT_ANALYSES. */
  concurrency?: number;
  /** Test seam: how to wait. Defaults to a real, abortable timer. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** "The server is busy — trying again in about 12 seconds." */
export function waitNote(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return `The server is busy — trying again in about ${s} ${s === 1 ? "second" : "seconds"}`;
}

/** Resolves when every worker has stopped. Never rejects. */
export async function runBatch<R, E>(opts: BatchRunOptions<R, E>): Promise<void> {
  const { items, signal, analyze, describeError } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const sleep = opts.sleep ?? abortableSleep;
  let nextIndex = 0;
  // While one worker is waiting out a busy answer, the other must not start
  // a NEW file into the same busy server — it would only collect its own
  // 429/503 and burn an attempt. Both wait until this time has passed.
  let busyUntil = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (signal.aborted) return;
      const item = items[nextIndex++]!;
      // A file is only ever nulled after a terminal state, so a queued item
      // always still has one; the guard is for a caller that passes junk.
      const file = item.file;
      if (!file) {
        item.status = "cancelled";
        continue;
      }
      item.status = "processing";
      for (let attempt = 1; ; attempt++) {
        // Another worker was told to wait: wait with it before sending.
        const hold = busyUntil - Date.now();
        if (hold > 0) {
          item.note = waitNote(hold);
          await sleep(hold, signal);
          item.note = null;
          if (signal.aborted) {
            item.status = "cancelled";
            item.file = null;
            return;
          }
        }
        try {
          const result = await analyze(file, signal);
          // Aborted while the request was in flight but it answered anyway:
          // the run was cancelled, so its late answer is not a result.
          if (signal.aborted) {
            item.status = "cancelled";
            item.file = null;
            return;
          }
          item.result = result;
          item.status = "done";
          break;
        } catch (err) {
          if (signal.aborted) {
            item.status = "cancelled";
            item.file = null;
            return;
          }
          // Busy, not broken: wait as long as the server asked, then try
          // THIS file again. The files behind it are untouched.
          const wait = busyWaitMs(err, attempt);
          if (wait !== null) {
            busyUntil = Math.max(busyUntil, Date.now() + wait);
            item.note = waitNote(wait);
            await sleep(wait, signal);
            item.note = null;
            if (signal.aborted) {
              item.status = "cancelled";
              item.file = null;
              return;
            }
            continue;
          }
          item.error = describeError(err);
          item.status = "error";
          break;
        }
      }
      item.note = null;
      item.file = null; // free browser memory
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  // Whatever this run never reached (it was cancelled) is cancelled — on its
  // OWN items only.
  for (const item of items) {
    if (item.status === "queued") {
      item.status = "cancelled";
      item.file = null;
    }
  }
}

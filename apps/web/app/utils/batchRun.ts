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
}

/** Resolves when every worker has stopped. Never rejects. */
export async function runBatch<R, E>(opts: BatchRunOptions<R, E>): Promise<void> {
  const { items, signal, analyze, describeError } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  let nextIndex = 0;

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
      } catch (err) {
        if (signal.aborted) {
          item.status = "cancelled";
          item.file = null;
          return;
        }
        item.error = describeError(err);
        item.status = "error";
      }
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

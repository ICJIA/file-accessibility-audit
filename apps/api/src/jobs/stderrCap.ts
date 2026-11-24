/**
 * A hard limit on how much one remediation worker may write to its error
 * output.
 *
 * WHY (security review of v1.176.0, 2026-11-24). The worker's stderr is a raw
 * descriptor onto the day's application error log (services/remediationQueue.ts
 * openWorkerStderr), so that a worker which dies while starting leaves a
 * trace. The API's own writes to that log stop at ACTIVITY_EXPORT's
 * per-day byte limit — but a raw descriptor does not pass through that
 * counter. A worker is handed a document chosen by a stranger; a PDF built to
 * make a parser or the Java tagger complain without end could have grown the
 * log until the disk was full.
 *
 * WHAT THIS DOES. It replaces `process.stderr.write` in the worker process
 * with a counting version: after `maxBytes` it writes one notice line and
 * drops the rest. Everything the worker emits goes through that function —
 * `console.error` / `console.warn`, the analyzer's warnings, and the Java
 * tagger's output, which @opendataloader/pdf reads from a pipe and relays
 * with `process.stderr.write`. Every other tool the worker runs is started
 * with `execFile`, whose output is captured in memory under its own
 * `maxBuffer`, not inherited.
 *
 * What it cannot count is what Node itself prints when the process dies
 * before or outside JavaScript (a loader error at startup, a fatal crash).
 * That is one message per process, so it is bounded by its nature.
 *
 * Imported FIRST by jobs/remediate.ts, so it is in place before any other
 * module of the worker has run.
 */

/** Bytes of error output one worker may write. A stack trace is ~2 KB. */
export const WORKER_STDERR_MAX_BYTES = 64 * 1024;

const NOTICE =
  "[remediation worker] error output limit reached for this job — further output dropped\n";

type Write = typeof process.stderr.write;

/**
 * Wrap `stream.write` with a byte budget. Returns a function that restores
 * the original (used by tests). Exported for tests.
 */
export function capStream(
  stream: { write: Write },
  maxBytes: number = WORKER_STDERR_MAX_BYTES,
): () => void {
  const original = stream.write;
  let written = 0;
  let noticed = false;

  const capped = function (this: unknown, chunk: unknown, ...rest: unknown[]): boolean {
    // Callers may pass (chunk, cb) or (chunk, encoding, cb); a dropped write
    // must still call back, or a caller awaiting the flush would hang.
    const cb = rest.find((a): a is (err?: Error | null) => void => typeof a === "function");
    const size =
      typeof chunk === "string"
        ? Buffer.byteLength(chunk)
        : chunk instanceof Uint8Array
          ? chunk.byteLength
          : 0;
    if (written + size <= maxBytes) {
      written += size;
      return (original as (...a: unknown[]) => boolean).call(stream, chunk, ...rest);
    }
    if (!noticed) {
      noticed = true;
      written = maxBytes; // nothing after the notice
      (original as (...a: unknown[]) => boolean).call(stream, NOTICE);
    }
    if (cb) queueMicrotask(() => cb());
    return true;
  } as Write;

  stream.write = capped;
  return () => {
    stream.write = original;
  };
}

// Installed on import — but only in a process that IS the worker. The API and
// the tests import this module for `capStream` and must keep their stderr.
if (/[\\/]jobs[\\/]remediate\.(ts|js)$/.test(process.argv[1] ?? "")) {
  capStream(process.stderr);
}

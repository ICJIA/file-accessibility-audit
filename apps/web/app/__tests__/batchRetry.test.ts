/**
 * A busy server is waited out, not failed (2026-11-24, with the batch limit
 * raised to BATCH.MAX_FILES). 429 and 503 carry Retry-After; the run waits
 * that long and tries the SAME file again, and the files behind it are
 * untouched.
 */
import { describe, it, expect, vi } from "vitest";
import {
  BATCH_BASE_WAIT_MS,
  BATCH_MAX_ATTEMPTS,
  BATCH_MAX_WAIT_MS,
  busyWaitMs,
  isBusyError,
  retryAfterMs,
  runBatch,
  waitNote,
  type BatchRunItem,
} from "../utils/batchRun";
import { BATCH, RATE_LIMITS } from "../../../../audit.config";

type Item = BatchRunItem<{ grade: string }, { error: string }>;
function items(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    filename: `f${i}.pdf`,
    file: new File(["x"], `f${i}.pdf`),
    status: "queued" as const,
    result: null,
    error: null,
  }));
}
const busy = (status: number, retryAfter?: string) => ({
  status,
  response: { headers: new Headers(retryAfter ? { "retry-after": retryAfter } : {}) },
});
const describeError = (e: unknown) => ({ error: `status ${(e as { status?: number }).status}` });

describe("busyWaitMs", () => {
  it("only 429 and 503 are 'busy'", () => {
    expect(isBusyError({ status: 429 })).toBe(true);
    expect(isBusyError({ statusCode: 503 })).toBe(true);
    expect(isBusyError({ status: 502 })).toBe(false);
    expect(isBusyError({ status: 422 })).toBe(false);
    expect(isBusyError(new Error("network"))).toBe(false);
    expect(busyWaitMs({ status: 500 }, 1)).toBeNull();
  });

  it("honours Retry-After in seconds and as a date", () => {
    expect(retryAfterMs(busy(503, "7"))).toBe(7000);
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(retryAfterMs(busy(429, "Tue, 24 Nov 2026 12:00:30 GMT"), now)).toBe(30_000);
    expect(retryAfterMs({ response: { headers: { "retry-after": "3" } } })).toBe(3000);
    expect(retryAfterMs(busy(503))).toBeNull();
    expect(busyWaitMs(busy(503, "7"), 1)).toBe(7000);
  });

  it("never retries instantly, even on Retry-After: 0", () => {
    expect(busyWaitMs(busy(503, "0"), 1)).toBe(1000);
  });

  it("backs off on its own when the server names no wait", () => {
    expect(busyWaitMs(busy(503), 1)).toBe(BATCH_BASE_WAIT_MS);
    expect(busyWaitMs(busy(503), 2)).toBe(BATCH_BASE_WAIT_MS * 2);
    expect(busyWaitMs(busy(503), 5)).toBeLessThanOrEqual(BATCH_MAX_WAIT_MS);
  });

  it("gives up when the attempts are used or the wait asked for is too long", () => {
    expect(busyWaitMs(busy(503, "5"), BATCH_MAX_ATTEMPTS)).toBeNull();
    // A rate limit that clears in half an hour is a failure to report.
    expect(busyWaitMs(busy(429, "1800"), 1)).toBeNull();
  });

  it("says how long the wait is, in words", () => {
    expect(waitNote(12_000)).toBe("The server is busy — trying again in about 12 seconds");
    expect(waitNote(900)).toBe("The server is busy — trying again in about 1 second");
  });
});

describe("runBatch — busy answers", () => {
  it("waits for Retry-After and tries the same file again; later files are not failed", async () => {
    const list = items(3);
    const sleeps: number[] = [];
    const seen: string[] = [];
    let f0Tries = 0;
    await runBatch({
      items: list,
      signal: new AbortController().signal,
      concurrency: 1,
      describeError,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      analyze: async (file) => {
        seen.push(file.name);
        if (file.name === "f0.pdf" && ++f0Tries <= 2) throw busy(503, "3");
        return { grade: "A" };
      },
    });
    expect(seen).toEqual(["f0.pdf", "f0.pdf", "f0.pdf", "f1.pdf", "f2.pdf"]);
    expect(sleeps.slice(0, 2)).toEqual([3000, 3000]);
    expect(list.map((i) => i.status)).toEqual(["done", "done", "done"]);
    expect(list.every((i) => i.note == null && i.file === null)).toBe(true);
  });

  it("shows the wait on the item while it is waiting", async () => {
    const list = items(1);
    let noteDuringSleep: string | null | undefined;
    let tries = 0;
    await runBatch({
      items: list,
      signal: new AbortController().signal,
      describeError,
      sleep: async () => {
        noteDuringSleep = list[0]!.note;
      },
      analyze: async () => {
        if (++tries === 1) throw busy(429, "12");
        return { grade: "B" };
      },
    });
    expect(noteDuringSleep).toBe("The server is busy — trying again in about 12 seconds");
    expect(list[0]!.status).toBe("done");
  });

  it("a file that stays busy fails alone, after a bounded number of tries", async () => {
    const list = items(2);
    let f0Tries = 0;
    await runBatch({
      items: list,
      signal: new AbortController().signal,
      concurrency: 1,
      describeError,
      sleep: async () => {},
      analyze: async (file) => {
        if (file.name === "f0.pdf") {
          f0Tries++;
          throw busy(503, "1");
        }
        return { grade: "A" };
      },
    });
    expect(f0Tries).toBe(BATCH_MAX_ATTEMPTS);
    expect(list.map((i) => i.status)).toEqual(["error", "done"]);
    expect(list[0]!.error).toEqual({ error: "status 503" });
  });

  it("an ordinary failure is not retried", async () => {
    const list = items(1);
    const analyze = vi.fn(async () => {
      throw { status: 422 };
    });
    await runBatch({
      items: list,
      signal: new AbortController().signal,
      describeError,
      sleep: async () => {},
      analyze,
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(list[0]!.status).toBe("error");
  });

  it("cancel during a wait ends the wait and cancels the rest", async () => {
    const list = items(3);
    const controller = new AbortController();
    const analyze = vi.fn(async () => {
      throw busy(503, "60");
    });
    // The REAL abortable sleep: a 60-second wait must end the moment the
    // run is cancelled, or this test times out.
    const run = runBatch({
      items: list,
      signal: controller.signal,
      concurrency: 1,
      describeError,
      analyze,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(list[0]!.note).toContain("trying again");
    controller.abort();
    await run;
    expect(list.map((i) => i.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});

describe("the batch limit fits the rate limits it runs under", () => {
  // The arithmetic in the doc-comment above BATCH.MAX_FILES, as a gate:
  // raise the limit, or lower a rate limit, past what fits and this fails.
  it("a full batch, with every file retried the maximum number of times, fits the hourly limit twice over", () => {
    const worstCase = BATCH.MAX_FILES * BATCH_MAX_ATTEMPTS;
    expect(worstCase * 2).toBeLessThanOrEqual(RATE_LIMITS.analyze.anon);
  });

  it("a full batch's uploads fit inside one minute of the global limit with room to spare", () => {
    expect(BATCH.MAX_FILES * 2).toBeLessThanOrEqual(RATE_LIMITS.global.anon);
  });

  it("two files polling once a second stay far under the poll limit", () => {
    expect(2 * 60 * 2).toBeLessThanOrEqual(RATE_LIMITS.analyzeJobStatus.max);
  });
});

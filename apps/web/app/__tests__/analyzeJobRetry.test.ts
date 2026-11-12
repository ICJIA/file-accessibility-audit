import { describe, it, expect, vi } from "vitest";
import {
  analyzeWithProgress,
  resumeWithProgress,
  describeAnalysisError,
  type AnalyzeJobStatus,
} from "../utils/analyzeJob";

// ---------------------------------------------------------------------------
// Review 2026-11-12, finding 3: one failed status poll discarded a healthy
// audit — a single 429 from the rate limiter, or one 502 while nginx reloaded,
// and a five-minute audit that was still running on the server was reported
// as failed. Polling now rides out transient failures, and only a real
// terminal answer ends the job.
// ---------------------------------------------------------------------------

function running(): AnalyzeJobStatus {
  return {
    done: false,
    steps: {
      analysis: { state: "running" },
      veraPdfUa: { state: "pending" },
      veraPdfWcag: { state: "pending" },
    },
  };
}
function done(): AnalyzeJobStatus {
  return { ...running(), done: true, result: { overallScore: 91, grade: "A" } as never };
}
function httpError(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`HTTP ${status}`), { status, ...extra });
}

/** A fetcher that answers the create call, then plays `polls` in order. */
function scripted(polls: Array<AnalyzeJobStatus | Error>) {
  let i = 0;
  return vi.fn(async (url: string) => {
    if (url === "/api/analyze-job") return { jobId: "j1", token: "t1" };
    const next = polls[Math.min(i++, polls.length - 1)]!;
    if (next instanceof Error) throw next;
    return next;
  });
}

const file = () => new File(["x"], "a.pdf");
const noop = () => {};

describe("analyze-job polling tolerates transient failures", () => {
  it.each([429, 500, 502, 503, 504])("a single %i does not end a healthy audit", async (code) => {
    const fetcher = scripted([running(), httpError(code), running(), done()]);
    const result = await analyzeWithProgress(file(), fetcher as never, noop, {
      pollMs: 1,
      sleep: async () => {},
    });
    expect((result as { grade: string }).grade).toBe("A");
  });

  it("a network error (no status at all) is retried too", async () => {
    const fetcher = scripted([new TypeError("Failed to fetch"), done()]);
    const result = await analyzeWithProgress(file(), fetcher as never, noop, {
      pollMs: 1,
      sleep: async () => {},
    });
    expect((result as { grade: string }).grade).toBe("A");
  });

  it("backs off between consecutive failures and resets after a success", async () => {
    const sleeps: number[] = [];
    const fetcher = scripted([
      httpError(503),
      httpError(503),
      httpError(503),
      running(),
      httpError(503),
      done(),
    ]);
    await analyzeWithProgress(file(), fetcher as never, noop, {
      pollMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
    });
    // first poll, then 200/400/800 after three failures, back to 100 after
    // the success, 200 after the next failure.
    expect(sleeps).toEqual([100, 200, 400, 800, 100, 200]);
  });

  it("honours Retry-After (seconds), capped so the page never sleeps for minutes", async () => {
    const sleeps: number[] = [];
    const headers = (v: string) => ({ response: { headers: new Headers({ "retry-after": v }) } });
    const fetcher = scripted([
      httpError(429, headers("7")),
      httpError(429, headers("9999")),
      done(),
    ]);
    await analyzeWithProgress(file(), fetcher as never, noop, {
      pollMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(sleeps).toEqual([100, 7_000, 30_000]);
  });

  it("gives up after a bounded run of consecutive failures, with a message and a next step", async () => {
    const fetcher = scripted([httpError(502)]);
    const err = await analyzeWithProgress(file(), fetcher as never, noop, {
      pollMs: 1,
      sleep: async () => {},
      maxConsecutiveFailures: 4,
    }).catch((e) => e);
    // create + 4 failed polls, and no more.
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(err.data.error).toBe("We lost contact with the audit service.");
    expect(err.data.details).toMatch(/wait a minute/i);
    // Not a terminal answer — the caller keeps the resumable session, and
    // the message says a reload can pick the audit back up.
    expect(err.lostContact).toBe(true);
    expect(err.data.details).toMatch(/reload this page — it will pick the audit back up/);
  });

  it("a real terminal answer still ends the job at once", async () => {
    const terminal: AnalyzeJobStatus = {
      ...running(),
      done: true,
      error: { status: 422, body: { error: "This PDF is encrypted." } },
    };
    const fetcher = scripted([terminal]);
    const err = await analyzeWithProgress(file(), fetcher as never, noop, { pollMs: 1 }).catch(
      (e) => e,
    );
    expect(err.data.error).toBe("This PDF is encrypted.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a non-transient HTTP error (403) is not retried", async () => {
    const fetcher = scripted([httpError(403)]);
    await expect(
      analyzeWithProgress(file(), fetcher as never, noop, { pollMs: 1, sleep: async () => {} }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a resumed job that 404s is still 'gone', even after a transient failure", async () => {
    const fetcher = scripted([httpError(503), httpError(404)]);
    await expect(
      resumeWithProgress("j1", "t1", fetcher as never, noop, { pollMs: 1, sleep: async () => {} }),
    ).rejects.toMatchObject({ jobGone: true });
  });
});

describe("analyze-job polling stops when the page abandons it (reset)", () => {
  it("an aborted signal ends the loop without reporting a result or a status", async () => {
    const controller = new AbortController();
    const seen: AnalyzeJobStatus[] = [];
    const fetcher = scripted([running(), done()]);
    const pending = analyzeWithProgress(file(), fetcher as never, (s) => seen.push(s), {
      pollMs: 1,
      signal: controller.signal,
      sleep: async () => {
        // The reset lands while the loop is waiting for its second poll.
        if (seen.length === 1) controller.abort();
      },
    });
    await expect(pending).rejects.toMatchObject({ aborted: true });
    expect(seen).toHaveLength(1);
    // create + one poll; the second poll was never sent.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a fetch rejected by the abort is reported as abandoned, not as a failure", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/analyze-job") return { jobId: "j", token: "t" };
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      analyzeWithProgress(file(), fetcher as never, noop, {
        pollMs: 1,
        signal: controller.signal,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ aborted: true });
  });
});

describe("describeAnalysisError — never an empty red box", () => {
  it("keeps the server's own message when there is one", () => {
    expect(
      describeAnalysisError({ data: { error: "File too large", details: "Max 50 MB" } }),
    ).toEqual({
      error: "File too large",
      details: "Max 50 MB",
    });
  });

  it("an HTML error page (nginx 502) gets a message and a next step", () => {
    const out = describeAnalysisError({
      status: 502,
      data: "<html><h1>502 Bad Gateway</h1></html>",
    });
    expect(out.error).toBe("The audit service is not responding right now.");
    expect(out.details).toMatch(/not a problem with your file/i);
    expect(out.details).toMatch(/try again/i);
  });

  it("covers throttling, oversized uploads, no connection, and the unknown", () => {
    expect(describeAnalysisError({ status: 429, data: undefined }).error).toMatch(
      /too many requests/i,
    );
    expect(describeAnalysisError({ statusCode: 413 }).error).toMatch(/too large/i);
    expect(describeAnalysisError(new TypeError("Failed to fetch")).error).toMatch(
      /could not reach the audit service/i,
    );
    for (const e of [undefined, null, {}, { data: {} }, { data: { error: "" } }, { status: 500 }]) {
      const out = describeAnalysisError(e);
      expect(out.error.length).toBeGreaterThan(0);
      expect((out.details ?? "").length).toBeGreaterThan(0);
    }
  });

  it("adds a next step when the server sent a message without one", () => {
    const out = describeAnalysisError({ status: 400, data: { error: "Unsupported file type" } });
    expect(out.error).toBe("Unsupported file type");
    expect(out.details).toBeUndefined();
  });
});

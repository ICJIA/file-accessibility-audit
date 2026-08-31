import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyzeWithProgress,
  resumeWithProgress,
  AnalyzeJobUnsupportedError,
  type AnalyzeJobStatus,
} from "../utils/analyzeJob";
import ProcessingOverlay from "../components/ProcessingOverlay.vue";

// ---------------------------------------------------------------------------
// v1.100.0 — the job-model client. Under test: the poll loop delivers the
// result, error outcomes re-throw shaped like $fetch errors (so index.vue's
// existing handling applies), a missing endpoint signals fallback instead of
// failing the upload, and the overlay's steps mode renders REAL states with
// no percentage anywhere (the JVM passes expose none — a percent would be
// invented).
// ---------------------------------------------------------------------------

function status(over: Partial<AnalyzeJobStatus> = {}): AnalyzeJobStatus {
  return {
    done: false,
    steps: {
      analysis: { state: "running", startedAt: Date.now() },
      veraPdfUa: { state: "pending" },
      veraPdfWcag: { state: "pending" },
    },
    ...over,
  };
}

describe("analyzeWithProgress", () => {
  it("creates the job, polls until done, reports each status, and returns the result", async () => {
    const statuses = [
      status(),
      status({
        done: true,
        steps: {
          analysis: { state: "done" },
          veraPdfUa: { state: "done" },
          veraPdfWcag: { state: "done" },
        },
        result: { overallScore: 88, grade: "B" } as never,
      }),
    ];
    let polls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/analyze-job") return { jobId: "j1", token: "t1" };
      return statuses[Math.min(polls++, statuses.length - 1)];
    });
    const seen: AnalyzeJobStatus[] = [];
    const result = await analyzeWithProgress(
      new File(["x"], "a.pdf"),
      fetcher as never,
      (s) => seen.push(s),
      { pollMs: 1 },
    );
    expect((result as { overallScore: number }).overallScore).toBe(88);
    expect(seen.length).toBe(2);
    expect(fetcher.mock.calls[1]![0]).toContain("/api/analyze-job/j1?t=t1");
  });

  it("a 404 on creation signals fallback (jobUnsupported) — never a failed upload", async () => {
    const fetcher = vi.fn(async () => {
      throw Object.assign(new Error("not found"), { status: 404 });
    });
    await expect(
      analyzeWithProgress(new File(["x"], "a.pdf"), fetcher as never, () => {}, { pollMs: 1 }),
    ).rejects.toBeInstanceOf(AnalyzeJobUnsupportedError);
  });

  it("an error outcome re-throws with the server's body on err.data — the shape index.vue already handles", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/analyze-job") return { jobId: "j1", token: "t1" };
      return status({
        done: true,
        error: { status: 422, body: { error: "This PDF is password-protected." } },
      });
    });
    await expect(
      analyzeWithProgress(new File(["x"], "a.pdf"), fetcher as never, () => {}, { pollMs: 1 }),
    ).rejects.toMatchObject({
      status: 422,
      data: { error: "This PDF is password-protected." },
    });
  });
});

describe("ProcessingOverlay — steps mode (real observed states)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const steps = [
    { key: "analysis", label: "Audit engine — structure, content, and scoring", state: "done" },
    {
      key: "veraPdfUa",
      label: "veraPDF: PDF/UA conformance",
      state: "running",
      startedAt: Date.now() - 4_000,
    },
    { key: "veraPdfWcag", label: "veraPDF: WCAG machine checks", state: "pending" },
  ] as const;

  it("renders one row per non-skipped step with its real state; skipped steps never render; no percentage anywhere", async () => {
    const w = mount(ProcessingOverlay, {
      props: {
        stage: "",
        steps: [...steps, { key: "x", label: "hidden", state: "skipped" as const }],
      },
    });
    const rows = w.findAll('[data-testid="overlay-steps"] li');
    expect(rows.length).toBe(3);
    expect(rows[0]!.attributes("data-step-state")).toBe("done");
    expect(rows[0]!.text()).toContain("✓");
    expect(rows[1]!.attributes("data-step-state")).toBe("running");
    expect(rows[2]!.attributes("data-step-state")).toBe("pending");
    expect(w.text()).not.toContain("hidden");
    expect(w.text()).not.toContain("%");
    // Steps mode replaces the rotating queue…
    expect(w.find('[data-testid="overlay-rotating-stage"]').exists()).toBe(false);
    // …and states its own honesty line.
    expect(w.text()).toContain("real progress");
  });

  it("a running step shows its own elapsed seconds, ticking with the clock", async () => {
    const w = mount(ProcessingOverlay, { props: { stage: "", steps: [...steps] } });
    await vi.advanceTimersByTimeAsync(3_000);
    const running = w.findAll('[data-step-state="running"]')[0]!;
    expect(running.text()).toMatch(/\(\d+s\)/);
  });
});

describe("wiring — index.vue uses the job flow with the synchronous fallback", () => {
  const index = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
  it("calls analyzeWithProgress, maps statuses into overlay steps, and falls back to POST /api/analyze on jobUnsupported", () => {
    expect(index).toContain("analyzeWithProgress(file");
    expect(index).toContain(':steps="processingSteps"');
    expect(index).toContain("jobErr?.jobUnsupported");
    expect(index).toContain('$fetch<AnalysisResult>("/api/analyze"');
  });
});

describe("resuming a job after a page load (v1.147.0)", () => {
  it("polls an existing job and returns its result — no re-upload", async () => {
    // The whole point: the audit ran on the server the entire time. Rejoining
    // must not POST the file again.
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      return { done: true, steps: {}, result: { score: 88 } };
    }) as never;
    const result = await resumeWithProgress("job-9", "tok-9", fetcher, () => {}, { pollMs: 0 });
    expect((result as unknown as { score: number }).score).toBe(88);
    expect(calls).toEqual(["/api/analyze-job/job-9?t=tok-9"]);
    expect(calls.some((u) => u.includes("POST") || u === "/api/analyze-job")).toBe(false);
  });

  it("reports a 404 as jobGone, not as an analysis failure", async () => {
    // Swept after its TTL, already collected, or the API restarted. The
    // visitor did nothing wrong and must not be shown an error card.
    const fetcher = (async () => {
      const err = new Error("Not Found") as Error & { status: number };
      err.status = 404;
      throw err;
    }) as never;
    await expect(
      resumeWithProgress("gone", "tok", fetcher, () => {}, { pollMs: 0 }),
    ).rejects.toMatchObject({ jobGone: true });
  });

  it("does NOT swallow a 404 on a freshly created job", async () => {
    // Same status code, opposite meaning: a job we just created answering 404
    // is a real fault and must surface as one.
    let n = 0;
    const fetcher = (async () => {
      if (n++ === 0) return { jobId: "j", token: "t" };
      const err = new Error("Not Found") as Error & { status: number };
      err.status = 404;
      throw err;
    }) as never;
    const file = { name: "a.pdf" } as File;
    await expect(
      analyzeWithProgress(file, fetcher, () => {}, { pollMs: 0 }),
    ).rejects.not.toMatchObject({ jobGone: true });
  });

  it("hands the caller the job id and token the moment the upload is accepted", async () => {
    // These two strings are the entire mechanism for surviving a page load.
    const seen: Array<{ jobId: string; token: string }> = [];
    let n = 0;
    const fetcher = (async () => {
      if (n++ === 0) return { jobId: "job-x", token: "tok-x" };
      return { done: true, steps: {}, result: { score: 100 } };
    }) as never;
    await analyzeWithProgress({ name: "a.pdf" } as File, fetcher, () => {}, {
      pollMs: 0,
      onJobCreated: (j) => seen.push(j),
    });
    expect(seen).toEqual([{ jobId: "job-x", token: "tok-x" }]);
  });
});

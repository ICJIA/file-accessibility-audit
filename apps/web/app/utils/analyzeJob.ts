/**
 * Client for the job-model audit (v1.100.0): POST /api/analyze-job, then
 * poll GET /api/analyze-job/:id?t=… until done, reporting REAL step states
 * to the caller along the way.
 *
 * Pure and injectable (the fetcher is a parameter) so the poll loop, the
 * fallback signal, and the error shaping are directly testable. The caller
 * (index.vue) falls back to the synchronous POST /api/analyze when the job
 * endpoints don't exist — deploy skew must never break uploads — which this
 * util signals with `jobUnsupported` instead of guessing.
 */
import type { AnalysisResult } from "@file-audit/shared";

export type AnalyzeJobStepKey = "analysis" | "veraPdfUa" | "veraPdfWcag";
export interface AnalyzeJobStepInfo {
  state: "pending" | "running" | "done" | "skipped";
  startedAt?: number;
  endedAt?: number;
}
export interface AnalyzeJobStatus {
  done: boolean;
  steps: Record<AnalyzeJobStepKey, AnalyzeJobStepInfo>;
  result?: AnalysisResult;
  error?: { status: number; body: { error: string; details?: string } };
}

/** Thrown when the server has no job endpoints (older API) — the caller
 *  falls back to the synchronous endpoint. */
export class AnalyzeJobUnsupportedError extends Error {
  jobUnsupported = true as const;
  constructor() {
    super("analyze-job endpoints unavailable");
  }
}

type Fetcher = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>;

export async function analyzeWithProgress(
  file: File,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: { pollMs?: number; maxPolls?: number } = {},
): Promise<AnalysisResult> {
  const pollMs = opts.pollMs ?? 1_000;
  // Backstop far above the server's own 5-minute job timeout — the loop must
  // never be the thing that spins forever.
  const maxPolls = opts.maxPolls ?? 400;

  const formData = new FormData();
  formData.append("file", file);

  let created: { jobId: string; token: string };
  try {
    created = await fetcher<{ jobId: string; token: string }>("/api/analyze-job", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
  } catch (err) {
    const status =
      (err as { status?: number; statusCode?: number }).status ??
      (err as { statusCode?: number }).statusCode;
    // 404/405 = the endpoint doesn't exist on this deployment.
    if (status === 404 || status === 405) throw new AnalyzeJobUnsupportedError();
    throw err;
  }

  const statusUrl = `/api/analyze-job/${created.jobId}?t=${encodeURIComponent(created.token)}`;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const status = await fetcher<AnalyzeJobStatus>(statusUrl, { credentials: "include" });
    onStatus(status);
    if (status.done) {
      if (status.result) return status.result;
      // The same body the synchronous endpoint would have sent, shaped like
      // a $fetch error so the caller's existing handling applies untouched.
      const err = new Error(status.error?.body?.error ?? "Analysis failed") as Error & {
        data?: unknown;
        status?: number;
      };
      err.data = status.error?.body;
      err.status = status.error?.status;
      throw err;
    }
  }
  const timedOut = new Error("Analysis timed out") as Error & { data?: unknown };
  timedOut.data = {
    error: "This file is too complex to analyze within the time limit.",
  };
  throw timedOut;
}

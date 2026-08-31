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
import { AUDIT_TIMEOUT_MESSAGE } from "@file-audit/shared";

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

/** Thrown when a RESUMED job is no longer on the server — swept after its
 *  TTL, already collected by another tab, or lost to an API restart. Not a
 *  failure of the audit and never an error the visitor caused, so the caller
 *  shows the upload form again rather than an error card. */
export class AnalyzeJobGoneError extends Error {
  jobGone = true as const;
  constructor() {
    super("analysis job no longer available");
  }
}

type Fetcher = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>;

/** The shared poll loop. `startedAt` lets a RESUMED job inherit the elapsed
 *  time, so a tab that returns after eight minutes does not sit for the full
 *  budget again waiting on a job the server is about to sweep. */
async function pollUntilDone(
  jobId: string,
  token: string,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: { pollMs: number; maxPolls: number; resumed: boolean },
): Promise<AnalysisResult> {
  const statusUrl = `/api/analyze-job/${jobId}?t=${encodeURIComponent(token)}`;
  for (let i = 0; i < opts.maxPolls; i++) {
    await new Promise((r) => setTimeout(r, opts.pollMs));
    let status: AnalyzeJobStatus;
    try {
      status = await fetcher<AnalyzeJobStatus>(statusUrl, { credentials: "include" });
    } catch (err) {
      const code =
        (err as { status?: number; statusCode?: number }).status ??
        (err as { statusCode?: number }).statusCode;
      // On a RESUME a 404 is the expected end of the road, not a fault: the
      // job was swept, already delivered, or the API restarted. On a job we
      // just created it is a real error and stays one.
      if (opts.resumed && code === 404) throw new AnalyzeJobGoneError();
      throw err;
    }
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
  timedOut.data = { ...AUDIT_TIMEOUT_MESSAGE };
  throw timedOut;
}

/**
 * Rejoin a job this browser started before a page load — the visitor clicked
 * "Status", or any other real navigation, while their document was being
 * audited. The audit never stopped: it runs on the server, and the job holds
 * its result until a page collects it. This picks the polling back up.
 */
export async function resumeWithProgress(
  jobId: string,
  token: string,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: { pollMs?: number; maxPolls?: number } = {},
): Promise<AnalysisResult> {
  return pollUntilDone(jobId, token, fetcher, onStatus, {
    pollMs: opts.pollMs ?? 1_000,
    maxPolls: opts.maxPolls ?? 400,
    resumed: true,
  });
}

export async function analyzeWithProgress(
  file: File,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: {
    pollMs?: number;
    maxPolls?: number;
    /** Called the instant the server accepts the upload, with the only two
     *  facts needed to rejoin this audit after a page load. */
    onJobCreated?: (job: { jobId: string; token: string }) => void;
  } = {},
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

  opts.onJobCreated?.({ jobId: created.jobId, token: created.token });

  return pollUntilDone(created.jobId, created.token, fetcher, onStatus, {
    pollMs,
    maxPolls,
    resumed: false,
  });
}

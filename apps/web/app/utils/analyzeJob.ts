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

interface PublicPollOptions {
  pollMs?: number;
  maxPolls?: number;
  /** Consecutive failed status checks tolerated before giving up. */
  maxConsecutiveFailures?: number;
  /** Injectable wait, so tests can read the backoff without living it. */
  sleep?: (ms: number) => Promise<void>;
  /** Fires when the page abandons this audit (a reset). The loop then stops
   *  with AnalyzeJobAbortedError and reports nothing further. */
  signal?: AbortSignal;
}

/** Transient answers: throttling, or a proxy that could not reach the API
 *  for a moment (a deploy, an nginx reload). None of them says anything about
 *  the audit, which carries on running on the server. */
/** 500 is included for the STATUS POLL only: a job's own failure arrives as
 *  a 200 with `done` and an error body, so a bare 500 here is the status
 *  route hiccuping, not the audit failing. Still bounded like the rest. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** How many status checks in a row may fail before the page gives up. With
 *  the backoff below that is roughly a minute of silence. */
const MAX_CONSECUTIVE_POLL_FAILURES = 8;
const POLL_BACKOFF_MAX_MS = 8_000;
/** A Retry-After is honoured, but never for longer than this. */
const RETRY_AFTER_MAX_MS = 30_000;

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.statusCode ?? e?.response?.status;
}

/** Retry-After in ms (delta-seconds or an HTTP date), or null. */
function retryAfterMs(err: unknown): number | null {
  const headers = (err as { response?: { headers?: unknown } } | null)?.response?.headers;
  let raw: unknown;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, unknown>)["retry-after"];
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, RETRY_AFTER_MAX_MS);
}

/** Shown when the status checks stay unanswered. Says what happened and what
 *  to do next — never a bare "failed". */
export const POLL_LOST_CONTACT_MESSAGE = {
  error: "We lost contact with the audit service.",
  details:
    "Several status checks in a row went unanswered, so this page stopped waiting. This is a connection or server problem, not a problem with your file. Your audit may still be running: wait a minute, then reload this page — it will pick the audit back up if it has finished. If the upload form comes back instead, upload the file again.",
};
/** The same, for a tab that cannot rejoin the job (its session could not be
 *  stored) — it must not promise a reload will help. */
export const POLL_LOST_CONTACT_MESSAGE_NO_RESUME = {
  error: POLL_LOST_CONTACT_MESSAGE.error,
  details:
    "Several status checks in a row went unanswered, so this page stopped waiting. This is a connection or server problem, not a problem with your file. Wait a minute, then upload the file again.",
};

/** Thrown when the caller's AbortSignal fires (the visitor reset the page).
 *  Not a failure: the caller that aborted has already moved on. */
export class AnalyzeJobAbortedError extends Error {
  aborted = true as const;
  constructor() {
    super("analysis abandoned by the page");
  }
}

interface PollOptions {
  pollMs: number;
  maxPolls: number;
  resumed: boolean;
  maxConsecutiveFailures: number;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The shared poll loop. `startedAt` lets a RESUMED job inherit the elapsed
 *  time, so a tab that returns after eight minutes does not sit for the full
 *  budget again waiting on a job the server is about to sweep.
 *
 *  TOLERANT BY DESIGN (2026-11-12). One failed poll used to end the audit: a
 *  single 429 or a 502 during a deploy threw away a job that was still
 *  healthy on the server. A transient failure now waits (exponential backoff,
 *  or the server's own Retry-After) and asks again, up to a bounded run of
 *  consecutive failures; any success resets the run. Only a real terminal
 *  answer — the job's own result or error, a 404 on a resume, or a
 *  non-transient HTTP error — ends the loop. Mirrors
 *  composables/useRemediationJob.ts. */
async function pollUntilDone(
  jobId: string,
  token: string,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: PollOptions,
): Promise<AnalysisResult> {
  const statusUrl = `/api/analyze-job/${jobId}?t=${encodeURIComponent(token)}`;
  let failures = 0;
  let delayMs = opts.pollMs;
  for (let i = 0; i < opts.maxPolls; i++) {
    await opts.sleep(delayMs);
    if (opts.signal?.aborted) throw new AnalyzeJobAbortedError();
    let status: AnalyzeJobStatus;
    try {
      status = await fetcher<AnalyzeJobStatus>(statusUrl, {
        credentials: "include",
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw new AnalyzeJobAbortedError();
      const code = statusOf(err);
      // On a RESUME a 404 is the expected end of the road, not a fault: the
      // job was swept, already delivered, or the API restarted. On a job we
      // just created it is a real error and stays one.
      if (opts.resumed && code === 404) throw new AnalyzeJobGoneError();
      // No status at all = the request never got an answer (offline, DNS,
      // connection reset) — as transient as a 503.
      const transient = code === undefined || RETRYABLE_STATUS.has(code);
      if (!transient) throw err;
      failures++;
      if (failures >= opts.maxConsecutiveFailures) {
        const lost = new Error("Lost contact with the audit service") as Error & {
          data?: unknown;
          status?: number;
          lostContact?: boolean;
        };
        // NOT a terminal answer: the job may well still be running, so the
        // caller keeps whatever lets a reloaded tab rejoin it.
        lost.lostContact = true;
        lost.data = { ...POLL_LOST_CONTACT_MESSAGE };
        lost.status = code;
        throw lost;
      }
      delayMs = retryAfterMs(err) ?? Math.min(opts.pollMs * 2 ** failures, POLL_BACKOFF_MAX_MS);
      continue;
    }
    if (opts.signal?.aborted) throw new AnalyzeJobAbortedError();
    failures = 0;
    delayMs = opts.pollMs;
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
 * Turn anything a failed audit request can throw into a message a person can
 * act on (2026-11-12).
 *
 * The alert used to render `err.data.error` and nothing else. When the body
 * was not the API's JSON — an nginx 502 page is HTML, a dropped connection
 * has no body at all — that was `undefined`, and the visitor got an empty red
 * box. The server's own message is kept whenever there is one; otherwise the
 * status code picks a plain-language explanation and a next step.
 */
export function describeAnalysisError(err: unknown): { error: string; details?: string } {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  if (data && typeof data === "object") {
    const { error, details } = data as { error?: unknown; details?: unknown };
    if (typeof error === "string" && error.trim()) {
      return typeof details === "string" && details.trim() ? { error, details } : { error };
    }
  }
  const code = statusOf(err);
  if (code === 429) {
    return {
      error: "Too many requests from this network right now.",
      details: "Nothing is wrong with your file. Wait a minute, then try again.",
    };
  }
  if (code === 413) {
    return {
      error: "This file is too large to upload.",
      details: "Try a smaller file, or split the document into sections and check each one.",
    };
  }
  if (code === 502 || code === 503 || code === 504) {
    return {
      error: "The audit service is not responding right now.",
      details:
        "This is a server problem, not a problem with your file. Wait a minute, then try again.",
    };
  }
  if (code === undefined && err instanceof Error) {
    return {
      error: "Could not reach the audit service.",
      details: "Check your internet connection, then try again.",
    };
  }
  return {
    error: "The audit could not be completed.",
    details:
      "Try again. If it keeps happening, try a different file, or check the Status page linked at the bottom of this page.",
  };
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
  opts: PublicPollOptions = {},
): Promise<AnalysisResult> {
  return pollUntilDone(jobId, token, fetcher, onStatus, {
    pollMs: opts.pollMs ?? 1_000,
    maxPolls: opts.maxPolls ?? 400,
    resumed: true,
    maxConsecutiveFailures: opts.maxConsecutiveFailures ?? MAX_CONSECUTIVE_POLL_FAILURES,
    sleep: opts.sleep ?? realSleep,
    signal: opts.signal,
  });
}

export async function analyzeWithProgress(
  file: File,
  fetcher: Fetcher,
  onStatus: (status: AnalyzeJobStatus) => void,
  opts: PublicPollOptions & {
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
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw new AnalyzeJobAbortedError();
    const status =
      (err as { status?: number; statusCode?: number }).status ??
      (err as { statusCode?: number }).statusCode;
    // 404/405 = the endpoint doesn't exist on this deployment.
    if (status === 404 || status === 405) throw new AnalyzeJobUnsupportedError();
    throw err;
  }

  if (opts.signal?.aborted) throw new AnalyzeJobAbortedError();
  opts.onJobCreated?.({ jobId: created.jobId, token: created.token });

  return pollUntilDone(created.jobId, created.token, fetcher, onStatus, {
    pollMs,
    maxPolls,
    resumed: false,
    maxConsecutiveFailures: opts.maxConsecutiveFailures ?? MAX_CONSECUTIVE_POLL_FAILURES,
    sleep: opts.sleep ?? realSleep,
    signal: opts.signal,
  });
}

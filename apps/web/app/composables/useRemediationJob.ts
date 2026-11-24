/**
 * Polls the remediation job status endpoint until the job reaches a
 * terminal state (complete / failed / expired), or until a bounded run of
 * unanswered checks ends in `lostContact`. Cleans up its timer and its
 * visibility listener when the consuming component unmounts.
 *
 * The receipt (lifecycle events) is fetched once on completion, since
 * the full event log only matters at the end — there's no need to
 * poll it on every status tick.
 */
import { onMounted, onBeforeUnmount, ref, type Ref } from "vue";
// The real payload type from the engine (packages/shared) — this composable
// used to re-declare a lossy subset of it. Re-exported because the remediate
// result page imports it from here.
import type { CategoryResult, ScoreProfileResult, ScoringMode } from "@file-audit/shared";
export type { CategoryResult };

export type RemediationStatus = "pending" | "running" | "complete" | "failed" | "expired";

export type RemediationStep = "preparing" | "tagging" | "validating" | "comparing";

export interface JobStatus {
  jobId: string;
  status: RemediationStatus;
  step: RemediationStep | null;
  progressPct: number;
  inputScore: number | null;
  outputScore: number | null;
  outputValid: boolean | null;
  failureReason: string | null;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  /** Sanitized filename used for internal storage. */
  inputFilename?: string;
  /**
   * The exact uploaded filename (spaces, unicode, and all). The
   * download UI uses this for the "Keep original filename" option so
   * the remediated PDF can be dropped in place of the original
   * without breaking CMS links. Null for jobs created before v1.20.0.
   */
  originalFilename?: string | null;
}

export interface ReceiptEvent {
  event: string;
  occurredAt: number;
  details: Record<string, unknown> | null;
}

import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

export interface AuditResultLite {
  // The engine (apps/api analyzePDF -> AnalysisResult/ScoringResult) always
  // sends these; this DTO had dropped them even though ScoreCard's `result`
  // prop requires them (it renders the before/after filename + page count
  // by default on this very page). Re-added instead of hand-waving with
  // `as any` at the ScoreCard call sites.
  filename: string;
  pageCount: number;
  executiveSummary: string;
  overallScore: number;
  grade: string;
  categories: CategoryResult[];
  /** The engine always sends both (v1.6x+ / v1.37+); typed optional to stay
   *  honest about receipts stored before they existed. Read by the
   *  two-standards strip this page now opens each report with, and shaped to
   *  satisfy ScoreCard's own `result` contract. */
  conformance?: ConformanceVerdict;
  pdfUaVerdict?: {
    available?: boolean;
    passed?: boolean;
    profile?: string;
    totalFailureCount?: number;
    distinctRuleCount?: number;
    error?: string;
    failures?: Array<{ ruleId?: string; clause?: string; description?: string; count?: number }>;
  };
  // Real shape is the full ScoreProfileResult (this page's own
  // afterCategories/beforeCategories computeds already reach for
  // `.categories` off of it via a local cast, since the engine always
  // sends it) — was declared as a lossy {overallScore, grade}-only subset.
  scoreProfiles?: Partial<Record<ScoringMode, ScoreProfileResult>>;
  adobeParity?: {
    summary: {
      passed: number;
      failed: number;
      manual: number;
      skipped: number;
      notComputed: number;
      vacuousPasses: number;
      total: number;
    };
  };
}

export interface VeraPdfResult {
  available: boolean | null;
  passed: boolean | null;
  summary: {
    available?: boolean;
    passed?: boolean;
    profile?: string;
    failures?: Array<{
      ruleId: string;
      clause: string;
      description: string;
      count: number;
    }>;
    totalFailureCount?: number;
    error?: string;
  } | null;
}

export interface Receipt {
  jobId: string;
  filename: string;
  contentHash: string | null;
  status: RemediationStatus;
  inputScore: number | null;
  outputScore: number | null;
  createdAt: number;
  completedAt: number | null;
  inputAudit: AuditResultLite | null;
  outputAudit: AuditResultLite | null;
  veraPdf: VeraPdfResult | null;
  events: ReceiptEvent[];
}

interface UseRemediationJobReturn {
  status: Ref<JobStatus | null>;
  receipt: Ref<Receipt | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  isTerminal: Ref<boolean>;
  /** True once the poller has given up after a run of unanswered status
   *  checks. NOT a job outcome — the job may still be running on the server —
   *  so `isTerminal` stays false; the page tells the visitor to reload. */
  lostContact: Ref<boolean>;
}

// 1 s keeps the progress view fresh (the remediate page runs a
// client-side minimum-time animation per stage, so even sub-second
// jobs show the steps tick by) while staying far under the API's
// rate limits. The old 250 ms cadence (240 req/min) drained the anon
// global limit (100/min) ~25 s into longer jobs and the UI reported
// "Too many requests" mid-remediation. Each poll is scheduled after
// the previous one completes (no overlap), and failures back off
// exponentially up to POLL_BACKOFF_MAX_MS.
const POLL_INTERVAL_MS = 1000;
const POLL_BACKOFF_MAX_MS = 8000;
/** How many status checks in a row may fail before the page stops asking.
 *  With the backoff above that is a little under a minute of silence. The
 *  same bound utils/analyzeJob.ts puts on the audit poll: a loop that retries
 *  forever keeps a dead tab hitting the server every 8 s until it is closed. */
export const MAX_CONSECUTIVE_POLL_FAILURES = 8;
/** A Retry-After is honoured, but never for longer than this. */
const RETRY_AFTER_MAX_MS = 30_000;
/** Cadence while the tab is hidden. Nobody is watching the progress bar, and
 *  the job runs on the server either way; the poll catches up the moment the
 *  tab is shown again. */
export const HIDDEN_POLL_INTERVAL_MS = 10_000;
const TERMINAL_STATES = new Set<RemediationStatus>(["complete", "failed", "expired"]);

/** Shown when the status checks stay unanswered. Says what happened and what
 *  to do next. */
export const REMEDIATION_LOST_CONTACT_MESSAGE =
  "We lost contact with the remediation service. Several status checks in a row went unanswered, so this page stopped checking. This is a connection or server problem, not a problem with your file. Your job may still be running: wait a minute, then reload this page to try again.";

/** Retry-After in ms (delta-seconds or an HTTP date), or null. Same reading
 *  as utils/analyzeJob.ts. */
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

/**
 * @param jobId Job id returned by POST /api/remediate.
 * @param token The job's download token, from the SAME creation response
 *   (threaded through the result page's `?t=` query param — see
 *   pages/remediate/[jobId].vue). It is the only credential a job has: the
 *   API authorizes status and receipt reads by it and answers 404 without
 *   it, so a job's existence is never disclosed to a caller who lacks it.
 *   Optional only so a link with no `?t=` still makes the request and gets
 *   that 404 ("Remediation job not found.") instead of throwing here.
 */
export function useRemediationJob(jobId: string, token?: string): UseRemediationJobReturn {
  const status = ref<JobStatus | null>(null);
  const receipt = ref<Receipt | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  const isTerminal = ref(false);
  const lostContact = ref(false);

  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let delayMs = POLL_INTERVAL_MS;
  let failures = 0;
  let inFlight = false;

  const tabHidden = (): boolean => typeof document !== "undefined" && document.hidden;

  function stop(): void {
    stopped = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }

  function scheduleNext(): void {
    if (stopped || isTerminal.value) return;
    // A hidden tab never polls faster than the hidden cadence; a backoff or
    // Retry-After longer than that still wins.
    const wait = tabHidden() ? Math.max(delayMs, HIDDEN_POLL_INTERVAL_MS) : delayMs;
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      void pollOnce();
    }, wait);
  }

  /** Back in view: ask now instead of sitting out the rest of a hidden-tab
   *  wait. Only while the poller is healthy — a pending backoff or
   *  Retry-After is the server asking for room, and is left to run. */
  function onVisibilityChange(): void {
    if (stopped || tabHidden() || inFlight || failures > 0) return;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    void pollOnce();
  }

  async function pollOnce(): Promise<void> {
    inFlight = true;
    try {
      const data = await $fetch<JobStatus>(`/api/remediate/${jobId}/status${tokenQuery}`, {
        credentials: "include",
      });
      status.value = data;
      error.value = null;
      delayMs = POLL_INTERVAL_MS;
      failures = 0;
      if (TERMINAL_STATES.has(data.status)) {
        isTerminal.value = true;
        stop();
        // Fetch the receipt once we're done
        try {
          receipt.value = await $fetch<Receipt>(`/api/remediate/${jobId}/receipt${tokenQuery}`, {
            credentials: "include",
          });
        } catch (e) {
          error.value = `Could not load receipt: ${(e as Error).message}`;
        }
        loading.value = false;
        return;
      }
      loading.value = false;
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } };
      if (err.status === 404) {
        error.value = "Remediation job not found.";
        isTerminal.value = true;
        loading.value = false;
        stop();
        return;
      }
      failures++;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        // Give up asking — but this is NOT an answer about the job, which
        // may be healthy on the server. `isTerminal` stays false so the page
        // never renders it as an outcome; a reload starts a fresh poller.
        lostContact.value = true;
        error.value = REMEDIATION_LOST_CONTACT_MESSAGE;
        loading.value = false;
        stop();
        return;
      }
      // Back off on any failure so a struggling server isn't hammered; the
      // server's own Retry-After, when it sends one, is the better number.
      delayMs = Math.min(delayMs * 2, POLL_BACKOFF_MAX_MS);
      const asked = retryAfterMs(e);
      if (asked !== null) delayMs = Math.max(delayMs, asked);
      if (err.status !== 429) {
        // A 429 is throttling feedback aimed at this poller, not a job
        // failure — retry quietly. (Errors surfaced here stay visible
        // only until a poll succeeds again.)
        error.value = err.data?.error ?? (e as Error).message;
      }
      loading.value = false;
    } finally {
      inFlight = false;
    }
    scheduleNext();
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    void pollOnce();
  });

  onBeforeUnmount(stop);

  return { status, receipt, error, loading, isTerminal, lostContact };
}

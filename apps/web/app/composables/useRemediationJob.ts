/**
 * Polls the remediation job status endpoint until the job reaches a
 * terminal state (complete / failed / expired). Auto-cleans the
 * interval when the consuming component unmounts.
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
const TERMINAL_STATES = new Set<RemediationStatus>(["complete", "failed", "expired"]);

/**
 * @param jobId Job id returned by POST /api/remediate.
 * @param token The job's download token, from the SAME creation response
 *   (threaded through the result page's `?t=` query param — see
 *   pages/remediate/[jobId].vue). The API requires this on status/receipt
 *   reads whenever the caller isn't a logged-in owner (AUTH.REQUIRE_LOGIN
 *   off, or the job has no owner email — see routes/remediate.ts); an
 *   unauthorized read returns 404 rather than leaking job existence.
 *   Optional so a caller with no token still gets the pre-C5 URLs
 *   unchanged (e.g. an old bookmarked link with no `?t=`, or a future
 *   logged-in-only flow that doesn't need one).
 */
export function useRemediationJob(jobId: string, token?: string): UseRemediationJobReturn {
  const status = ref<JobStatus | null>(null);
  const receipt = ref<Receipt | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  const isTerminal = ref(false);

  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let delayMs = POLL_INTERVAL_MS;

  function stop(): void {
    stopped = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  function scheduleNext(): void {
    if (stopped || isTerminal.value) return;
    timeoutHandle = setTimeout(() => {
      void pollOnce();
    }, delayMs);
  }

  async function pollOnce(): Promise<void> {
    try {
      const data = await $fetch<JobStatus>(`/api/remediate/${jobId}/status${tokenQuery}`, {
        credentials: "include",
      });
      status.value = data;
      error.value = null;
      delayMs = POLL_INTERVAL_MS;
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
      // Back off on any failure so a struggling server isn't hammered.
      delayMs = Math.min(delayMs * 2, POLL_BACKOFF_MAX_MS);
      if (err.status !== 429) {
        // A 429 is throttling feedback aimed at this poller, not a job
        // failure — retry quietly. (Errors surfaced here stay visible
        // only until a poll succeeds again.)
        error.value = err.data?.error ?? (e as Error).message;
      }
      loading.value = false;
    }
    scheduleNext();
  }

  onMounted(() => {
    void pollOnce();
  });

  onBeforeUnmount(stop);

  return { status, receipt, error, loading, isTerminal };
}

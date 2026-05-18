/**
 * Polls the remediation job status endpoint until the job reaches a
 * terminal state (complete / failed / expired). Auto-cleans the
 * interval when the consuming component unmounts.
 *
 * The receipt (lifecycle events) is fetched once on completion, since
 * the full event log only matters at the end — there's no need to
 * poll it on every status tick.
 */
import { onMounted, onBeforeUnmount, ref, type Ref } from 'vue'

export type RemediationStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'expired'

export type RemediationStep =
  | 'preparing'
  | 'tagging'
  | 'validating'
  | 'comparing'

export interface JobStatus {
  jobId: string
  status: RemediationStatus
  step: RemediationStep | null
  progressPct: number
  inputScore: number | null
  outputScore: number | null
  outputValid: boolean | null
  failureReason: string | null
  createdAt: number
  completedAt: number | null
  expiresAt: number
  /** Sanitized filename used for internal storage. */
  inputFilename?: string
  /**
   * The exact uploaded filename (spaces, unicode, and all). The
   * download UI uses this for the "Keep original filename" option so
   * the remediated PDF can be dropped in place of the original
   * without breaking CMS links. Null for jobs created before v1.20.0.
   */
  originalFilename?: string | null
}

export interface ReceiptEvent {
  event: string
  occurredAt: number
  details: Record<string, unknown> | null
}

export interface CategoryResult {
  id: string
  label: string
  score: number | null
  grade: string | null
  severity: string | null
  findings?: string[]
  explanation?: string
}

export interface AuditResultLite {
  overallScore: number
  grade: string
  categories: CategoryResult[]
  scoreProfiles?: {
    strict?: { overallScore: number; grade: string }
    remediation?: { overallScore: number; grade: string }
  }
  adobeParity?: {
    summary: {
      passed: number
      failed: number
      manual: number
      skipped: number
      notComputed: number
      vacuousPasses: number
      total: number
    }
  }
}

export interface VeraPdfResult {
  available: boolean | null
  passed: boolean | null
  summary: {
    available?: boolean
    passed?: boolean
    profile?: string
    failures?: Array<{
      ruleId: string
      clause: string
      description: string
      count: number
    }>
    totalFailureCount?: number
    error?: string
  } | null
}

export interface Receipt {
  jobId: string
  filename: string
  contentHash: string | null
  status: RemediationStatus
  inputScore: number | null
  outputScore: number | null
  createdAt: number
  completedAt: number | null
  inputAudit: AuditResultLite | null
  outputAudit: AuditResultLite | null
  veraPdf: VeraPdfResult | null
  events: ReceiptEvent[]
}

interface UseRemediationJobReturn {
  status: Ref<JobStatus | null>
  receipt: Ref<Receipt | null>
  error: Ref<string | null>
  loading: Ref<boolean>
  isTerminal: Ref<boolean>
}

// Poll faster than the typical job duration so updates arrive while
// the worker is still running. Most jobs finish in ~1 second; 250 ms
// gives several update opportunities even on the fastest cases. The
// remediate page also runs a client-side minimum-time animation per
// stage so even a sub-second job still shows the steps tick by.
const POLL_INTERVAL_MS = 250
const TERMINAL_STATES = new Set<RemediationStatus>([
  'complete',
  'failed',
  'expired',
])

export function useRemediationJob(jobId: string): UseRemediationJobReturn {
  const status = ref<JobStatus | null>(null)
  const receipt = ref<Receipt | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(true)
  const isTerminal = ref(false)

  let intervalHandle: ReturnType<typeof setInterval> | null = null

  async function pollOnce(): Promise<void> {
    try {
      const data = await $fetch<JobStatus>(`/api/remediate/${jobId}/status`, {
        credentials: 'include',
      })
      status.value = data
      if (TERMINAL_STATES.has(data.status)) {
        isTerminal.value = true
        if (intervalHandle) {
          clearInterval(intervalHandle)
          intervalHandle = null
        }
        // Fetch the receipt once we're done
        try {
          receipt.value = await $fetch<Receipt>(
            `/api/remediate/${jobId}/receipt`,
            { credentials: 'include' },
          )
        } catch (e) {
          error.value = `Could not load receipt: ${(e as Error).message}`
        }
      }
      loading.value = false
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } }
      if (err.status === 404) {
        error.value = 'Remediation job not found.'
        isTerminal.value = true
        if (intervalHandle) {
          clearInterval(intervalHandle)
          intervalHandle = null
        }
      } else {
        error.value = err.data?.error ?? (e as Error).message
      }
      loading.value = false
    }
  }

  onMounted(() => {
    void pollOnce()
    intervalHandle = setInterval(() => {
      if (!isTerminal.value) void pollOnce()
    }, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  })

  return { status, receipt, error, loading, isTerminal }
}

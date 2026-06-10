<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  useRemediationJob,
  type CategoryResult,
} from '~/composables/useRemediationJob'

// Score-mode toggle (matches the audit page's ScoreCard contract)
// v1.21+: single Strict (WCAG + IITAA §E205.4) score. The historical
// dual-mode toggle was retired — PDF/UA conformance is now surfaced via
// the veraPDF Pass/Fail badge below the score (when veraPDF is configured).
const AUDIT_MODE = 'strict' as const

definePageMeta({ middleware: [] })

// Each remediation result page is a private, per-user, session-bound
// URL (UUID jobId + one-time download token in the query string).
// Tell search engines not to index or follow these URLs. This is both
// the correct privacy posture and what causes Lighthouse's `canonical`
// audit to short-circuit (noindex pages are exempt from the canonical
// requirement).
useHead({
  title: 'PDF Auto-Remediation',
  meta: [
    { name: 'robots', content: 'noindex,nofollow' },
  ],
})

const route = useRoute()
const jobId = String(route.params.jobId)
const downloadToken = String(route.query.t ?? '')

const { status, receipt, error, loading, isTerminal } = useRemediationJob(jobId)

// ------------------------------------------------------------------
// Category comparison (drives "What we fixed" / "Still needs review")
// ------------------------------------------------------------------

interface CategoryPair {
  id: string
  label: string
  before: number | null
  after: number | null
  delta: number | null
  findings: string[]
}

// Mode-aware categories: when the user toggles the After ScoreCard's
// scoring profile, the lists below use the matching profile's
// categories so severities/scores stay consistent with what they're
// looking at.
const afterCategories = computed<CategoryResult[]>(() => {
  const out = receipt.value?.outputAudit
  if (!out) return []
  const profile = (out.scoreProfiles as Record<string, { categories?: CategoryResult[] }> | undefined)?.[AUDIT_MODE]
  return profile?.categories ?? out.categories ?? []
})

const beforeCategories = computed<CategoryResult[]>(() => {
  const inp = receipt.value?.inputAudit
  if (!inp) return []
  const profile = (inp.scoreProfiles as Record<string, { categories?: CategoryResult[] }> | undefined)?.[AUDIT_MODE]
  return profile?.categories ?? inp.categories ?? []
})

const categoryPairs = computed<CategoryPair[]>(() => {
  const input = beforeCategories.value
  const output = afterCategories.value
  const byId = new Map<string, CategoryResult>()
  for (const c of input) byId.set(c.id, c)
  return output.map((after) => {
    const before = byId.get(after.id)
    const beforeScore = before?.score ?? null
    const afterScore = after.score ?? null
    return {
      id: after.id,
      label: after.label,
      before: beforeScore,
      after: afterScore,
      delta:
        beforeScore !== null && afterScore !== null
          ? afterScore - beforeScore
          : null,
      findings: after.findings ?? [],
    }
  })
})

// Outstanding issues by severity (after remediation). Severity comes
// from the audit's getSeverity() and lives on each CategoryResult.
const outstandingCritical = computed(() =>
  afterCategories.value.filter((c) => c.severity === 'Critical'),
)
const outstandingSerious = computed(() =>
  afterCategories.value.filter((c) => c.severity === 'Serious'),
)
const outstandingModerate = computed(() =>
  afterCategories.value.filter((c) => c.severity === 'Moderate'),
)
const outstandingCount = computed(
  () =>
    outstandingCritical.value.length +
    outstandingSerious.value.length +
    outstandingModerate.value.length,
)

// Acrobat next-steps hints per category id. Drawn from the actual
// Acrobat menu paths so users know where to click. Generic fallback
// at the end for categories not specifically mapped.
const acrobatStepsByCategory: Record<string, string> = {
  alt_text:
    'Tools → Accessibility → Set Alternate Text. Walk through each figure and add a description, or mark decorative images as artifacts.',
  reading_order:
    'Tools → Accessibility → Reading Order. Verify the order matches how a sighted user would read; reorder blocks if needed.',
  heading_structure:
    'Open the Tags panel (View → Show/Hide → Navigation Panes → Tags). Verify <H1>, <H2>, etc. are present and nested correctly.',
  table_markup:
    'In the Tags panel, expand each <Table> and confirm <TH> cells have a Scope attribute (Row or Column). Add via right-click → Properties → Tag.',
  title_language:
    'File → Properties → Description tab (Title field). For language: File → Properties → Advanced → Language.',
  bookmarks:
    'View → Show/Hide → Navigation Panes → Bookmarks. Add bookmarks via the menu or by right-clicking text and choosing "Add Bookmark".',
  form_accessibility:
    'Tools → Prepare Form. Right-click each field → Properties → set Tooltip and Tab Order.',
  pdf_ua_compliance:
    'Run Tools → Print Production → Preflight → "Verify compliance with PDF/UA-1." Fix any reported issues.',
  link_quality:
    'Right-click links → Edit Hyperlink. Use descriptive text in the tag (Tags panel) rather than "click here".',
  text_extractability:
    'If the file is scanned: Tools → Scan & OCR → Recognize Text → In This File. Otherwise verify selectable text is correct.',
  color_contrast:
    'Adobe Acrobat does not enforce contrast directly. Use the original authoring tool (Word, InDesign) to adjust colors, or fix via a third-party color contrast checker.',
}

function acrobatStepFor(catId: string): string {
  return (
    acrobatStepsByCategory[catId] ??
    'Open the Tags panel and verify the structure is meaningful; re-run Tools → Accessibility → Accessibility Checker.'
  )
}

// Compact "what we fixed" summary for the After card (a short list,
// distinct from the longer category breakdown sections below).
const fixedSummaryItems = computed(() =>
  categoryPairs.value
    .filter((p) => p.delta !== null && p.delta >= 10)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)),
)

const fixedCategories = computed(() =>
  categoryPairs.value.filter(
    (p) =>
      p.after !== null &&
      p.after >= 80 &&
      ((p.before ?? -1) < p.after || (p.before === null && p.after >= 80)),
  ),
)

const improvedButLowCategories = computed(() =>
  categoryPairs.value.filter(
    (p) =>
      p.after !== null &&
      p.after < 80 &&
      p.delta !== null &&
      p.delta > 0,
  ),
)

const needsManualCategories = computed(() =>
  categoryPairs.value.filter(
    (p) =>
      p.after !== null &&
      p.after < 80 &&
      (p.delta === null || p.delta <= 0),
  ),
)

// "Low-improvement" detection: the remediated output is still below a
// passing threshold AND the delta from input is small. This is the
// signature of an input PDF whose accessibility problems live deeper
// than what auto-tagging can reach — usually because the source
// document (Word, InDesign, etc.) was authored without accessibility
// in mind and the PDF was exported without structure tagging. Show the
// big explainer card so users understand the modest score wasn't a
// tool failure.
const lowImprovement = computed(() => {
  if (status.value?.status !== 'complete') return false
  const input = status.value?.inputScore ?? null
  const output = status.value?.outputScore ?? null
  if (input === null || output === null) return false
  const delta = output - input
  return output < 70 && delta < 15
})

// Items that auto-remediation typically CAN fix (used to seed the
// "what we were able to do automatically" list). Pulled from the
// fixedCategories + improvedButLowCategories that actually moved this
// run; falls back to a generic list if neither has anything.
const automatedFixesThisRun = computed(() =>
  [...fixedCategories.value, ...improvedButLowCategories.value].sort(
    (a, b) => (b.delta ?? 0) - (a.delta ?? 0),
  ),
)

// ------------------------------------------------------------------
// Three-heuristic comparison rows
// ------------------------------------------------------------------

interface HeuristicRow {
  label: string
  description: string
  beforeText: string
  afterText: string
  delta: string
}

function fmtScoreGrade(score: number | null | undefined, grade: string | null | undefined): string {
  if (score === null || score === undefined) return '–'
  return `${score.toFixed(0)} (${grade ?? '?'})`
}

const heuristicRows = computed<HeuristicRow[]>(() => {
  const inp = receipt.value?.inputAudit
  const out = receipt.value?.outputAudit
  if (!inp || !out) return []
  const rows: HeuristicRow[] = []

  // Strict (the canonical score most prominently shown on the audit page)
  const strictBefore = inp.scoreProfiles?.strict
  const strictAfter = out.scoreProfiles?.strict
  if (strictBefore || strictAfter) {
    const dB = strictBefore?.overallScore ?? null
    const dA = strictAfter?.overallScore ?? null
    rows.push({
      label: 'Strict score',
      description: 'The graded WCAG-aligned score shown on the audit page.',
      beforeText: fmtScoreGrade(dB, strictBefore?.grade),
      afterText: fmtScoreGrade(dA, strictAfter?.grade),
      delta:
        dA !== null && dB !== null
          ? `${dA - dB >= 0 ? '+' : ''}${(dA - dB).toFixed(0)}`
          : '–',
    })
  }

  return rows
})

const stepLabels: Record<string, string> = {
  preparing: 'Preparing file',
  tagging: 'Adding structure tags',
  validating: 'Validating result',
  comparing: 'Comparing scores',
}

const stepOrder = ['preparing', 'tagging', 'validating', 'comparing']

// Minimum time each stage is shown to the user, even if the worker
// finished the underlying step faster than we could poll. Without this,
// a sub-second job pops straight from 'pending' to 'complete' and the
// user never sees stages light up.
const MIN_STAGE_MS = 350

// Server-tracked "real" target index — derived from status. -1 = job
// not started yet visually. The displayedStageIdx animates UP toward
// this target but is held back by MIN_STAGE_MS between advances.
const displayedStageIdx = ref<number>(-1)
let stageAdvanceTimer: ReturnType<typeof setTimeout> | null = null

function clearStageTimer(): void {
  if (stageAdvanceTimer) {
    clearTimeout(stageAdvanceTimer)
    stageAdvanceTimer = null
  }
}

function targetStageIdx(): number {
  const s = status.value
  if (!s) return -1
  if (s.status === 'pending' || s.status === 'running') {
    if (s.step) return stepOrder.indexOf(s.step)
    return 0 // running but no step yet → at least show 'preparing'
  }
  if (s.status === 'complete') return stepOrder.length - 1 // show all stages done
  return displayedStageIdx.value // expired/failed: hold current
}

function scheduleAdvance(): void {
  clearStageTimer()
  const target = targetStageIdx()
  if (displayedStageIdx.value >= target) return
  stageAdvanceTimer = setTimeout(() => {
    displayedStageIdx.value = Math.min(displayedStageIdx.value + 1, stepOrder.length - 1)
    if (displayedStageIdx.value < targetStageIdx()) {
      scheduleAdvance()
    }
  }, MIN_STAGE_MS)
}

watch(
  () => [status.value?.status, status.value?.step],
  () => {
    const target = targetStageIdx()
    if (target < 0) return
    if (displayedStageIdx.value < 0) {
      // Snap to the first stage immediately so the indicator appears
      displayedStageIdx.value = 0
    }
    if (displayedStageIdx.value < target) {
      scheduleAdvance()
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearStageTimer)

function stepState(name: string): 'done' | 'active' | 'pending' {
  const idx = stepOrder.indexOf(name)
  if (idx < 0) return 'pending'
  if (idx < displayedStageIdx.value) return 'done'
  if (idx === displayedStageIdx.value) {
    // If the job is actually complete AND we've reached the last stage,
    // mark it done rather than 'active' so the final tick is shown
    if (status.value?.status === 'complete' && displayedStageIdx.value >= stepOrder.length - 1) {
      return 'done'
    }
    return 'active'
  }
  return 'pending'
}

// Progress percentage derived from the animated stage rather than
// the raw server progress_pct. This way the bar animates smoothly
// up through stages even when the job finished server-side
// instantly.
const displayedProgressPct = computed(() => {
  if (displayedStageIdx.value < 0) return 0
  const allDone =
    status.value?.status === 'complete' &&
    displayedStageIdx.value >= stepOrder.length - 1
  if (allDone) return 100
  return Math.round(((displayedStageIdx.value + 1) / stepOrder.length) * 100)
})

// Visually-running gate: keep the running section visible while the
// animation is still walking forward, even if the server already
// reports 'complete'.
const isVisuallyRunning = computed(() => {
  if (!status.value) return false
  if (status.value.status === 'pending' || status.value.status === 'running') {
    return true
  }
  if (
    status.value.status === 'complete' &&
    displayedStageIdx.value < stepOrder.length - 1
  ) {
    return true
  }
  return false
})

const downloadHref = computed(() =>
  status.value?.status === 'complete' && downloadToken
    ? `/api/remediate/${jobId}/download?token=${encodeURIComponent(downloadToken)}`
    : null,
)

// ------------------------------------------------------------------
// Result-section gating
// ------------------------------------------------------------------
// Result sections wait for BOTH the server status to flip to 'complete'
// AND the local progress animation to finish walking through every
// stage. Without this gate, the results appear roughly halfway through
// the progress bar when a fast server response races ahead of the
// animator. UX intent: progress indicator finishes its arc → results
// appear in one visual beat.
const isVisuallyComplete = computed(
  () => status.value?.status === 'complete' && !isVisuallyRunning.value,
)

// ------------------------------------------------------------------
// Download filename dialog state
// ------------------------------------------------------------------
// Three modes:
//   'keep'        — download with the exact original filename (spaces
//                   and all). DEFAULT. Critical for CMS file
//                   replacement workflows: links to the original PDF
//                   keep working when the file is overwritten in place.
//   'suffix'      — opt-in 'foo_remediated.pdf' for users who want to
//                   keep the original around alongside the remediated
//                   copy (no CMS replacement intent).
//   'rename'      — user-typed custom name. Shows an "are you sure?"
//                   warning before the download proceeds, because this
//                   path actively breaks any existing references to the
//                   PDF on the user's site.
const filenameChoice = ref<'keep' | 'suffix' | 'rename'>('keep')
const customFilename = ref('')

/**
 * The exact filename to display in the "Keep original filename"
 * option. Pulls from the server-side originalFilename (preserves
 * spaces and unicode) and falls back to inputFilename for jobs
 * created before v1.20.0 when originalFilename was not stored.
 */
const originalFilenameDisplay = computed(
  () =>
    status.value?.originalFilename ??
    status.value?.inputFilename ??
    '',
)

const suffixFilenamePreview = computed(() => {
  const base = (originalFilenameDisplay.value || 'remediated.pdf').replace(
    /\.pdf$/i,
    '',
  )
  return `${base}_remediated.pdf`
})

/**
 * Final download href with the user's filename choice applied.
 * - Default ("keep"): no ?name= param → server uses originalFilename
 *   via RFC 6266 dual-name Content-Disposition. Exact match for CMS
 *   overwrite.
 * - Suffix opt-in: ?name=<basename>_remediated.pdf
 * - Custom rename: ?name=<typed>.pdf — server validates length, forces
 *   .pdf extension, and encodes for Content-Disposition.
 */
const resolvedDownloadHref = computed(() => {
  if (!downloadHref.value) return null
  if (filenameChoice.value === 'suffix') {
    const baseName = (originalFilenameDisplay.value || 'remediated.pdf').replace(
      /\.pdf$/i,
      '',
    )
    return `${downloadHref.value}&name=${encodeURIComponent(baseName + '_remediated.pdf')}`
  }
  if (filenameChoice.value === 'rename' && customFilename.value) {
    const cleaned = customFilename.value.replace(/\.pdf$/i, '')
    return `${downloadHref.value}&name=${encodeURIComponent(cleaned + '.pdf')}`
  }
  return downloadHref.value
})

/**
 * Final-confirm gate for the rename path. Set true when the user
 * clicks Download with 'rename' selected so an "Are you sure?"
 * inline prompt appears. Click Download again to actually proceed
 * (the button text changes to "Confirm download with new name").
 */
const renameConfirming = ref(false)

function handleDownloadClick(event: MouseEvent) {
  if (filenameChoice.value === 'rename' && !renameConfirming.value) {
    event.preventDefault()
    renameConfirming.value = true
  }
}

// Reset the confirm gate when the user changes their mind back.
watch(filenameChoice, (next) => {
  if (next !== 'rename') renameConfirming.value = false
})

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString()
}

function fmtDuration(startMs?: number | null, endMs?: number | null): string {
  if (!startMs || !endMs) return ''
  const secs = Math.round((endMs - startMs) / 1000)
  if (secs < 60) return `${secs} s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m} min ${s} s`
}

const eventLabels: Record<string, string> = {
  received: 'Your PDF was uploaded',
  processing_started: 'Processing started',
  normalize_complete: 'File prepared for tagging',
  input_deleted: 'Original file deleted from server',
  tagging_complete: 'Structure tags added',
  intermediate_deleted: 'Intermediate files deleted from server',
  validation_passed: 'Output validated',
  validation_failed: 'Output failed validation',
  verapdf_passed: 'veraPDF: PDF/UA-1 conformance passed',
  verapdf_failed: 'veraPDF: PDF/UA-1 conformance not yet met',
  verapdf_unavailable: 'veraPDF check skipped (not configured)',
  output_ready: 'Remediated PDF ready',
  downloaded: 'You downloaded the remediated PDF',
  output_deleted: 'Remediated PDF deleted from server',
  verified_absent: 'Deletion verified (file no longer exists)',
  verify_failed: 'Deletion verification failed',
  error: 'Error',
  expired: 'Output expired',
}

const runtimeConfig = useRuntimeConfig()
const iitaaUrl = computed(() => String(runtimeConfig.public.iitaaUrl ?? ''))
const verapdfUrl = computed(() => String(runtimeConfig.public.verapdfUrl ?? ''))

function labelForEvent(name: string): string {
  return eventLabels[name] ?? name
}
</script>

<template>
  <!-- min-h-[calc(100vh-4rem)] reserves space so the page doesn't shift
       when status flips loading → running → complete. Without this
       reservation, Lighthouse measured CLS=0.252 on desktop because the
       result section (~3000px tall) appears in one paint and pushes the
       (initially empty) page from short to tall. -->
  <div class="max-w-3xl mx-auto px-4 py-10 min-h-[calc(100vh-4rem)]">
    <h1 class="text-2xl font-semibold mb-2">PDF Auto-Remediation</h1>
    <p class="text-sm text-[var(--text-muted)] mb-8">
      Receipt ID:
      <span class="font-mono">{{ jobId.slice(0, 8) }}</span>
    </p>

    <div v-if="loading && !status" class="py-12 text-center text-[var(--text-muted)]">
      Loading job status…
    </div>

    <!-- Running -->
    <section
      v-if="isVisuallyRunning"
      class="border border-[var(--border)] rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-4">Processing your PDF…</h2>
      <ol class="space-y-3">
        <li
          v-for="name in stepOrder"
          :key="name"
          class="flex items-center gap-3 text-sm"
        >
          <span
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
            :class="{
              'bg-emerald-600 text-white': stepState(name) === 'done',
              'bg-blue-600 text-white animate-pulse': stepState(name) === 'active',
              'bg-[var(--border)] text-[var(--text-muted)]': stepState(name) === 'pending',
            }"
          >
            {{ stepState(name) === 'done' ? '✓' : '·' }}
          </span>
          <span
            :class="{
              'text-[var(--text)]': stepState(name) !== 'pending',
              'text-[var(--text-muted)]': stepState(name) === 'pending',
            }"
          >
            {{ stepLabels[name] }}
          </span>
        </li>
      </ol>
      <div class="mt-6 w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
        <div
          class="h-full bg-blue-600 transition-all"
          :style="{ width: `${displayedProgressPct}%` }"
        />
      </div>
      <p class="mt-4 text-xs text-[var(--text-muted)]">
        You can leave this page and come back.
      </p>
    </section>

    <!-- Complete: before/after ScoreCards side-by-side -->
    <section
      v-if="isVisuallyComplete && receipt?.inputAudit && receipt?.outputAudit"
      class="mb-6"
    >
      <h2 class="text-emerald-400 text-center text-base font-medium mb-4">
        ✓ Auto-remediation complete
      </h2>

      <!-- AFTER (shown first — the result, infographic-style banner) -->
      <div class="rounded-xl border-2 border-emerald-700/40 bg-emerald-950/10 overflow-hidden">
        <div
          class="bg-emerald-700/25 border-b border-emerald-700/40 py-6 sm:py-8 px-6 text-center"
        >
          <p
            class="text-2xl sm:text-3xl font-black uppercase tracking-[0.2em] text-emerald-300 flex items-center justify-center gap-3"
          >
            <svg
              class="w-7 h-7 sm:w-8 sm:h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            After Remediation
          </p>
        </div>
        <div class="p-4 sm:p-6">
          <ScoreCard :result="receipt.outputAudit" />

          <!-- Compact PDF/UA-1 conformance badge — surfaces the veraPDF
               verdict right next to the headline score. Full details are
               in the dedicated veraPDF section further down. -->
          <div
            v-if="receipt?.veraPdf"
            class="mt-6 flex items-center justify-center"
          >
            <a
              href="#verapdf-detail"
              class="inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium border transition-colors"
              :class="
                !receipt.veraPdf.available
                  ? 'border-[var(--border)] bg-[var(--surface-deep)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                  : receipt.veraPdf.passed
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
              "
              :aria-label="
                !receipt.veraPdf.available
                  ? 'PDF/UA-1 conformance check not run (veraPDF not configured)'
                  : receipt.veraPdf.passed
                    ? 'PDF/UA-1 conformance check passed'
                    : 'PDF/UA-1 conformance check found failures'
              "
            >
              <span
                class="inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold"
                :class="
                  !receipt.veraPdf.available
                    ? 'bg-[var(--surface-hover)] text-[var(--text-muted)]'
                    : receipt.veraPdf.passed
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-amber-500/30 text-amber-200'
                "
              >
                {{
                  !receipt.veraPdf.available
                    ? '–'
                    : receipt.veraPdf.passed
                      ? '✓'
                      : '!'
                }}
              </span>
              <span class="uppercase tracking-wider text-[11px]">PDF/UA-1</span>
              <span class="text-xs">
                {{
                  !receipt.veraPdf.available
                    ? 'check not run'
                    : receipt.veraPdf.passed
                      ? 'conformance passed'
                      : `${receipt.veraPdf.summary?.totalFailureCount ?? 'some'} rule failure${(receipt.veraPdf.summary?.totalFailureCount ?? 0) === 1 ? '' : 's'}`
                }}
              </span>
              <span
                v-if="receipt.veraPdf.available"
                class="text-[10px] uppercase tracking-wider opacity-70"
              >
                details ↓
              </span>
            </a>
          </div>

          <!-- Three-heuristic comparison (visible by default — primary
               comparison story) -->
          <div
            v-if="heuristicRows.length > 0"
            class="mt-6 pt-6 border-t border-emerald-700/30"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-1">
              Score comparison
            </h3>
            <p class="text-xs text-[var(--text-muted)] mb-3">
              Strict (WCAG + IITAA §E205.4) score before and after
              remediation.
            </p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-[var(--text-muted)] border-b border-emerald-700/30">
                    <th class="py-2 pr-4 font-medium">Heuristic</th>
                    <th class="py-2 pr-4 font-medium">Before</th>
                    <th class="py-2 pr-4 font-medium">After</th>
                    <th class="py-2 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in heuristicRows"
                    :key="row.label"
                    class="border-b border-emerald-700/15 last:border-0"
                  >
                    <td class="py-3 pr-4">
                      <div class="font-medium">{{ row.label }}</div>
                      <div class="text-xs text-[var(--text-muted)] mt-0.5">
                        {{ row.description }}
                      </div>
                    </td>
                    <td class="py-3 pr-4 font-mono">{{ row.beforeText }}</td>
                    <td class="py-3 pr-4 font-mono">{{ row.afterText }}</td>
                    <td
                      class="py-3 font-mono"
                      :class="{
                        'text-emerald-400': row.delta.startsWith('+'),
                        'text-red-400': row.delta.startsWith('-'),
                      }"
                    >
                      {{ row.delta }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Fully fixed (visible by default — celebrate the wins) -->
          <div
            v-if="fixedCategories.length > 0"
            class="mt-6 pt-6 border-t border-emerald-700/30"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-2">
              ✓ Fully fixed ({{ fixedCategories.length }})
            </h3>
            <ul class="space-y-1 text-sm">
              <li
                v-for="cat in fixedCategories"
                :key="cat.id"
                class="flex items-baseline gap-3"
              >
                <span class="flex-1">{{ cat.label }}</span>
                <span class="font-mono text-[var(--text-muted)] text-xs">
                  {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after?.toFixed(0) ?? '?' }}
                </span>
                <span
                  v-if="cat.delta !== null"
                  class="font-mono text-emerald-400 text-xs w-12 text-right"
                >
                  +{{ cat.delta.toFixed(0) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Improved but still low (visible by default) -->
          <div
            v-if="improvedButLowCategories.length > 0"
            class="mt-6 pt-6 border-t border-emerald-700/30"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-2">
              ↑ Improved but still needs a closer look ({{ improvedButLowCategories.length }})
            </h3>
            <ul class="space-y-3 text-sm">
              <li v-for="cat in improvedButLowCategories" :key="cat.id">
                <div class="flex items-baseline gap-3">
                  <span class="flex-1">{{ cat.label }}</span>
                  <span class="font-mono text-[var(--text-muted)] text-xs">
                    {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after?.toFixed(0) }}
                  </span>
                  <span class="font-mono text-amber-400 text-xs w-12 text-right">
                    +{{ cat.delta?.toFixed(0) }}
                  </span>
                </div>
                <ul
                  v-if="cat.findings.length > 0"
                  class="mt-1 list-disc list-inside text-xs text-[var(--text-muted)] space-y-0.5"
                >
                  <li v-for="f in cat.findings.slice(0, 2)" :key="f">
                    {{ f }}
                  </li>
                </ul>
              </li>
            </ul>
          </div>

          <!-- Outstanding-issues callout + expandable severity detail -->
          <div class="mt-6 pt-6 border-t border-emerald-700/30">
            <!-- Inline summary -->
            <p
              v-if="outstandingCount === 0"
              class="text-sm text-emerald-300 text-center"
            >
              ✓ No critical, serious, or moderate issues remain.
            </p>
            <p v-else class="text-sm text-amber-300 text-center">
              <strong>{{ outstandingCount }}</strong>
              {{ outstandingCount === 1 ? 'issue still needs attention' : 'issues still need attention' }}
              ({{ outstandingCritical.length }} critical,
              {{ outstandingSerious.length }} serious,
              {{ outstandingModerate.length }} moderate).
            </p>

            <!-- Expandable detail with Adobe Acrobat next steps -->
            <details class="mt-4 group">
              <summary
                class="cursor-pointer text-sm font-medium text-emerald-200 hover:text-emerald-100 select-none text-center list-none flex items-center justify-center gap-2"
              >
                <span class="group-open:hidden">Show outstanding issues + Adobe Acrobat next steps ▾</span>
                <span class="hidden group-open:inline">Hide outstanding issues ▴</span>
              </summary>

              <div class="mt-6 space-y-6">

                <!-- Critical outstanding -->
                <div v-if="outstandingCritical.length > 0">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-red-400 mb-2">
                    Critical issues still outstanding
                  </h3>
                  <ul class="space-y-4 text-sm">
                    <li v-for="cat in outstandingCritical" :key="cat.id">
                      <div class="flex items-baseline gap-3">
                        <span class="font-medium flex-1">{{ cat.label }}</span>
                        <span class="font-mono text-[var(--text-muted)] text-xs">
                          {{ cat.score?.toFixed(0) ?? 'N/A' }}/100
                        </span>
                      </div>
                      <ul
                        v-if="cat.findings && cat.findings.length > 0"
                        class="mt-1 list-disc list-inside text-xs text-[var(--text-muted)] space-y-0.5"
                      >
                        <li v-for="f in cat.findings.slice(0, 3)" :key="f">
                          {{ f }}
                        </li>
                      </ul>
                      <p class="mt-2 text-xs text-blue-300/90 leading-relaxed">
                        <span class="font-semibold uppercase tracking-wider">Adobe Acrobat:</span>
                        {{ acrobatStepFor(cat.id) }}
                      </p>
                    </li>
                  </ul>
                </div>

                <!-- Serious outstanding -->
                <div v-if="outstandingSerious.length > 0">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-orange-400 mb-2">
                    Serious issues still outstanding
                  </h3>
                  <ul class="space-y-4 text-sm">
                    <li v-for="cat in outstandingSerious" :key="cat.id">
                      <div class="flex items-baseline gap-3">
                        <span class="font-medium flex-1">{{ cat.label }}</span>
                        <span class="font-mono text-[var(--text-muted)] text-xs">
                          {{ cat.score?.toFixed(0) ?? 'N/A' }}/100
                        </span>
                      </div>
                      <ul
                        v-if="cat.findings && cat.findings.length > 0"
                        class="mt-1 list-disc list-inside text-xs text-[var(--text-muted)] space-y-0.5"
                      >
                        <li v-for="f in cat.findings.slice(0, 3)" :key="f">
                          {{ f }}
                        </li>
                      </ul>
                      <p class="mt-2 text-xs text-blue-300/90 leading-relaxed">
                        <span class="font-semibold uppercase tracking-wider">Adobe Acrobat:</span>
                        {{ acrobatStepFor(cat.id) }}
                      </p>
                    </li>
                  </ul>
                </div>

                <!-- Moderate outstanding -->
                <div v-if="outstandingModerate.length > 0">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-2">
                    Moderate issues still outstanding
                  </h3>
                  <ul class="space-y-4 text-sm">
                    <li v-for="cat in outstandingModerate" :key="cat.id">
                      <div class="flex items-baseline gap-3">
                        <span class="font-medium flex-1">{{ cat.label }}</span>
                        <span class="font-mono text-[var(--text-muted)] text-xs">
                          {{ cat.score?.toFixed(0) ?? 'N/A' }}/100
                        </span>
                      </div>
                      <ul
                        v-if="cat.findings && cat.findings.length > 0"
                        class="mt-1 list-disc list-inside text-xs text-[var(--text-muted)] space-y-0.5"
                      >
                        <li v-for="f in cat.findings.slice(0, 3)" :key="f">
                          {{ f }}
                        </li>
                      </ul>
                      <p class="mt-2 text-xs text-blue-300/90 leading-relaxed">
                        <span class="font-semibold uppercase tracking-wider">Adobe Acrobat:</span>
                        {{ acrobatStepFor(cat.id) }}
                      </p>
                    </li>
                  </ul>
                </div>

                <!-- General Adobe wrap-up tip -->
                <div
                  v-if="outstandingCount > 0"
                  class="text-xs text-[var(--text-muted)] border-t border-emerald-700/20 pt-4"
                >
                  After your manual fixes in Adobe Acrobat, re-run
                  <strong>Tools → Accessibility → Accessibility Checker</strong>
                  to verify, then re-upload the file here to confirm the score
                  moved.
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- Low-improvement explainer card (only shown when output is still
           low AND delta is small — the "this is a source-document problem,
           not a tool problem" case). -->
      <section
        v-if="lowImprovement"
        class="mt-10 rounded-2xl border-2 border-amber-700/50 bg-amber-950/15 overflow-hidden"
      >
        <div
          class="bg-amber-700/25 border-b border-amber-700/40 py-5 sm:py-6 px-5 sm:px-7 text-center"
        >
          <p
            class="text-xl sm:text-2xl font-black uppercase tracking-[0.18em] text-amber-200 flex items-center justify-center gap-3 leading-tight"
          >
            <svg
              class="w-6 h-6 sm:w-7 sm:h-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            About this modest score
          </p>
        </div>

        <div class="p-5 sm:p-7 space-y-5">
          <!-- Honest framing -->
          <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
            Auto-remediation moved your score from
            <strong>{{ status?.inputScore?.toFixed(0) }}</strong> to
            <strong>{{ status?.outputScore?.toFixed(0) }}</strong> — a real
            improvement, but a smaller one than you might have hoped for.
            <strong class="text-amber-200">
              This is almost always a signal that the underlying PDF was
              exported from a non-accessible source document
            </strong>
            (Word, PowerPoint, InDesign, Pages) without the accessibility
            options turned on. The tool did what it can; the limits of
            what's possible live further upstream.
          </p>

          <!-- What we WERE able to fix -->
          <div
            v-if="automatedFixesThisRun.length > 0"
            class="rounded-lg border border-emerald-700/30 bg-emerald-950/15 p-4 sm:p-5"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-3">
              ✓ What we were able to fix automatically
            </h3>
            <ul class="space-y-1.5 text-sm">
              <li
                v-for="cat in automatedFixesThisRun"
                :key="cat.id"
                class="flex items-baseline gap-3"
              >
                <span class="text-emerald-400 flex-shrink-0">✓</span>
                <span class="flex-1">{{ cat.label }}</span>
                <span class="font-mono text-[var(--text-muted)] text-xs">
                  {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after?.toFixed(0) }}
                </span>
                <span
                  v-if="cat.delta !== null && cat.delta > 0"
                  class="font-mono text-emerald-400 text-xs w-12 text-right"
                >
                  +{{ cat.delta.toFixed(0) }}
                </span>
              </li>
            </ul>
            <p class="text-xs text-[var(--text-muted)] mt-3 leading-relaxed">
              These categories were improved by adding structural metadata
              that the source file was missing. They're the parts of
              accessibility a deterministic tool can address without
              guessing at authorial intent.
            </p>
          </div>

          <!-- What we COULDN'T fix automatically -->
          <div
            v-if="needsManualCategories.length > 0 || outstandingCritical.length > 0 || outstandingSerious.length > 0 || outstandingModerate.length > 0"
            class="rounded-lg border border-amber-700/30 bg-amber-950/10 p-4 sm:p-5"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider text-amber-300 mb-3">
              ⚠ What needs human judgment (and why)
            </h3>
            <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
              A few categories of accessibility issues cannot be remediated
              automatically by any tool, including this one and every
              commercial alternative. They require the original author's
              knowledge of the content:
            </p>
            <ul class="space-y-3 text-sm">
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Meaningful alt text for images and charts.</strong>
                  The tool can mark a figure as a
                  <code class="text-xs font-mono">&lt;Figure&gt;</code>
                  element, but it cannot describe what's in the image. "Bar
                  chart showing arrest counts by month, 2024" is useful;
                  "image" is not. Only the author knows what the chart
                  represents.
                </div>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Reading order in complex layouts.</strong>
                  Multi-column documents, pull quotes, sidebars, and other
                  rich layouts can confuse heuristic ordering algorithms.
                  Only a human reader knows whether "column 2 paragraph 1"
                  comes before or after "column 1 paragraph 4."
                </div>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Decorative vs. informative images.</strong>
                  An image of a horizontal-rule divider should be marked
                  <em>decorative</em> (screen readers skip it); an
                  organizational chart contains information and needs a
                  description. The tool reports all images without alt
                  text as a potential issue; deciding which are decorative
                  is a judgment call.
                </div>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Document title and meaningful metadata.</strong>
                  Many PDFs export with placeholder titles like "Document1"
                  or the filename. Only the author can supply a meaningful
                  title that reflects the document's actual content.
                </div>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Table semantics.</strong>
                  Auto-remediation can wrap table cells in tags but cannot
                  reliably know which row contains the column headers, or
                  whether a cell spans multiple columns. The author's
                  knowledge of the data structure is needed.
                </div>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                <div>
                  <strong>Heading hierarchy correctness.</strong>
                  A line of "14-pt bold text" might be a heading or
                  emphasized body text. The tool guesses heuristically; the
                  author knows for certain.
                </div>
              </li>
            </ul>
          </div>

          <!-- Why PDF remediation is hard -->
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)] mb-3">
              Why PDF remediation is fundamentally limited
            </h3>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
              PDFs are an <em>export</em> format. They were designed in 1993
              for print-fidelity — making a document look identical on every
              printer and screen. PDFs store
              <strong>where every glyph appears on the page</strong>, not
              what those glyphs mean. There's no concept of "heading" or
              "paragraph" or "image of a chart" baked into the format; the
              semantic layer that makes a PDF accessible (the structure
              tree, added optionally in PDF 1.4 from 2001) has to be added
              on top.
            </p>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
              When a document is exported to PDF without that structure
              layer, the semantic information from the source document is
              effectively lost. A remediation tool reads the visual layer
              and has to guess at the meaning: "this 14-pt bold line was
              probably a heading," "this image probably has content,"
              "these cells probably form a table." Some of those guesses
              are right; some aren't. The result is a document that has
              more structure than it did before — but still requires a
              human to verify the guesses.
            </p>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
              For the deeper technical explanation, see the
              <em>"Why Auditing Is Easy and Remediation Is Hard"</em>
              section of the
              <a
                href="/"
                class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
                >audit page</a
              >'s Technical Details dropdown.
            </p>
          </div>

          <!-- The better path: source documents -->
          <div class="rounded-lg border border-blue-700/40 bg-blue-950/20 p-4 sm:p-5">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-blue-200 mb-3">
              ★ The better path: fix accessibility at the source
            </h3>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
              PDF remediation is <strong>always a last resort</strong>. The
              accessibility information the source document already has
              (heading styles in Word, paragraph styles in InDesign, alt
              text fields, table-header settings) doesn't survive the
              export unless the "create tagged PDF" option is enabled.
              Once you have an untagged PDF, you're trying to reconstruct
              that information from visual cues.
            </p>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
              <strong>If you still have the source document</strong>
              (.docx, .indd, .pages, Google Docs, etc.), the highest-quality
              path is:
            </p>
            <ol class="space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside ml-2 mb-3">
              <li>
                Open the source in its native authoring tool.
              </li>
              <li>
                Use the built-in accessibility checker:
                <em>Word: Review → Check Accessibility</em>
                ·
                <em>InDesign: Accessibility panel</em>
                ·
                <em>Google Docs: Tools → Accessibility</em>
                ·
                <em>Pages: Inspector → Accessibility</em>.
              </li>
              <li>
                Fix the flagged issues: add alt text on every image, use
                heading styles (not just bold larger text), use the
                built-in table tools (not tab-stops), set the document
                title.
              </li>
              <li>
                Re-export as PDF with
                <strong>"Best for electronic distribution / accessibility"</strong>
                (Word, Pages) or
                <strong>"Create Tagged PDF"</strong> (InDesign) selected.
                Skipping this step is the #1 cause of remediable PDFs.
              </li>
              <li>Re-upload here to verify the fixes landed.</li>
            </ol>
            <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
              This path consistently produces a tagged PDF with a structure
              tree that
              <em>reflects what the author actually meant</em> — no
              reverse-engineering, no heuristic guesses, no last-resort
              remediation. Even when the audit + auto-remediation here got
              you partway, fixing at the source remains the gold standard
              for IITAA compliance.
            </p>
          </div>

          <!-- Footer summary -->
          <p
            class="text-xs text-[var(--text-muted)] text-center pt-2 leading-relaxed"
          >
            Modest scores from auto-remediation reflect the limits of working
            with an already-exported PDF — not a fault of the tool. The
            remediation you got is still useful (download it, use it as your
            starting point), but the most reliable accessibility outcomes
            always trace back to an accessible source document.
          </p>
        </div>
      </section>

      <!-- Down-pointing separator pointing to the original (below) -->
      <div class="flex flex-col items-center my-12 sm:my-16 text-[var(--text-muted)]">
        <p
          class="text-lg sm:text-xl font-semibold uppercase tracking-[0.2em] mb-4"
        >
          Improved from
        </p>
        <svg
          class="w-10 h-10 sm:w-12 sm:h-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19.5 8.25 12 15.75 4.5 8.25"
          />
        </svg>
      </div>

      <!-- BEFORE (shown second — for reference, muted banner) -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
        <div
          class="bg-[var(--border)]/30 border-b border-[var(--border)] py-3 sm:py-4 px-6 text-center"
        >
          <p
            class="text-sm sm:text-base font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
          >
            Before
          </p>
        </div>
        <div class="p-4 sm:p-6">
          <ScoreCard
            :result="receipt.inputAudit"
          />
        </div>
      </div>
    </section>

    <!-- Download + manual-review notice -->
    <section
      v-if="isVisuallyComplete"
      class="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-6 mb-6"
    >
      <div v-if="downloadHref" class="space-y-4">
        <h2 class="text-base font-semibold text-emerald-100 text-center">
          Download remediated PDF
        </h2>

        <!-- Why-keep-the-name explainer (always visible). -->
        <p class="text-xs text-emerald-200/85 leading-relaxed">
          <strong class="text-emerald-100">Recommended:</strong> download
          under the exact same filename as the original and replace the
          PDF in your CMS in place. This way every existing link to the
          PDF — on your website, in shared documents, in old emails —
          keeps working without redirects or fix-up. The "Keep original
          filename" option below is selected by default for this reason.
        </p>

        <div class="rounded-lg border border-emerald-700/30 bg-emerald-950/30 p-4 space-y-3">
          <!-- Option 1: Keep original filename (DEFAULT, RECOMMENDED) -->
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="filenameChoice"
              type="radio"
              value="keep"
              class="mt-1 accent-emerald-500"
            />
            <span class="flex-1">
              <span class="block text-sm font-medium text-emerald-100">
                Keep original filename
                <span class="ml-1 inline-block rounded bg-emerald-700/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-100">
                  Recommended
                </span>
              </span>
              <span class="block mt-1 font-mono text-xs text-[var(--text-muted)] break-all">
                {{ originalFilenameDisplay || '—' }}
              </span>
            </span>
          </label>

          <!-- Option 2: Add _remediated suffix (opt-in) -->
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="filenameChoice"
              type="radio"
              value="suffix"
              class="mt-1 accent-emerald-500"
            />
            <span class="flex-1">
              <span class="block text-sm font-medium text-emerald-100">
                Add a "_remediated" suffix
                <span class="text-xs text-emerald-300/70 font-normal">
                  (keeps the original alongside)
                </span>
              </span>
              <span class="block mt-1 font-mono text-xs text-[var(--text-muted)] break-all">
                {{ suffixFilenamePreview }}
              </span>
            </span>
          </label>

          <!-- Option 3: Use a different filename (warning + confirm gate) -->
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="filenameChoice"
              type="radio"
              value="rename"
              class="mt-1 accent-emerald-500"
            />
            <span class="flex-1">
              <span class="block text-sm font-medium text-emerald-100">
                Use a different filename
              </span>
              <div class="mt-1 flex items-center gap-1">
                <input
                  v-model.trim="customFilename"
                  type="text"
                  class="flex-1 rounded border border-[var(--border)] bg-[var(--surface-deep)] px-2 py-1 text-sm font-mono text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="my-renamed-report"
                  :disabled="filenameChoice !== 'rename'"
                  @click="filenameChoice = 'rename'"
                />
                <span class="text-xs font-mono text-[var(--text-muted)]">.pdf</span>
              </div>
            </span>
          </label>
        </div>

        <!-- "Are you sure?" warning + confirm gate for the rename path -->
        <div
          v-if="filenameChoice === 'rename'"
          class="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200 leading-relaxed"
        >
          <strong class="text-amber-100">⚠ Are you sure?</strong>
          A different filename means existing links to this PDF —
          anywhere it's referenced on your site, in emails, or in
          partner documents — will start returning 404s once the
          original file is removed. The recommended path is "Keep
          original filename" so a CMS overwrite preserves every
          existing link. Only use a custom name if you're keeping
          the original PDF in place and treating this as a separate
          new file.
          <span v-if="renameConfirming" class="block mt-2 text-amber-100">
            Click <strong>Confirm download</strong> again to proceed.
          </span>
        </div>

        <div class="text-center">
          <UButton
            :to="resolvedDownloadHref"
            external
            size="lg"
            color="primary"
            :disabled="filenameChoice === 'rename' && !customFilename"
            @click="handleDownloadClick"
          >
            <template v-if="filenameChoice === 'rename' && renameConfirming">
              ⬇ Confirm download with new name
            </template>
            <template v-else>
              ⬇ Download
            </template>
          </UButton>
        </div>
      </div>

      <p v-else class="text-sm text-amber-400 text-center">
        Download token missing — return to the audit page and click Remediate again.
      </p>

      <p class="text-sm mt-4 text-amber-400 text-center">
        ⚠ Manual review still recommended. Auto-remediation handles structure and
        metadata; it can't write meaningful alt text for charts or verify complex
        reading order.
      </p>
    </section>

    <!-- PDF/UA-1 conformance (veraPDF verdict + IITAA + manual review) -->
    <section v-if="isVisuallyComplete && receipt?.veraPdf" id="verapdf-detail" class="mb-6 scroll-mt-8">
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
          PDF/UA-1 conformance check
        </h3>

        <!-- veraPDF verdict -->
        <template v-if="receipt.veraPdf.available">
          <div class="flex items-start gap-3 mb-4">
            <span
              class="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
              :class="receipt.veraPdf.passed ? 'bg-emerald-700/40 text-emerald-200' : 'bg-amber-700/40 text-amber-200'"
            >
              {{ receipt.veraPdf.passed ? '✓' : '!' }}
            </span>
            <div class="flex-1 text-sm">
              <p class="font-medium mb-1">
                <template v-if="receipt.veraPdf.passed">
                  veraPDF reported PDF/UA-1 conformance.
                </template>
                <template v-else>
                  veraPDF found {{ receipt.veraPdf.summary?.totalFailureCount ?? 'some' }}
                  PDF/UA-1 rule failures.
                </template>
              </p>
              <p class="text-xs text-[var(--text-muted)] leading-relaxed">
                The remediated PDF was validated with
                <a
                  v-if="verapdfUrl"
                  :href="verapdfUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-300 hover:text-blue-200 underline"
                >veraPDF</a>
                <span v-else>veraPDF</span> — the open-source PDF/UA-1 validator
                from the PDF Association + Dual Lab. It checks technical
                conformance to ISO 14289-1 (tag presence, structure tree,
                MarkInfo, language, title, etc.).
              </p>
            </div>
          </div>

          <!-- Top failing rules if any -->
          <div
            v-if="!receipt.veraPdf.passed && receipt.veraPdf.summary?.failures && receipt.veraPdf.summary.failures.length > 0"
            class="mb-4 pl-10"
          >
            <p class="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2">
              Top failing rules
            </p>
            <ul class="text-xs space-y-1.5 text-[var(--text-muted)]">
              <li
                v-for="f in receipt.veraPdf.summary.failures.slice(0, 5)"
                :key="f.ruleId + f.clause"
              >
                <span class="font-mono text-[var(--text)]">{{ f.ruleId }}</span>
                <!-- ruleId is "clause-testNumber" (e.g. 7.1-1) on veraPDF ≥1.30;
                     repeat the clause only when it isn't already the prefix -->
                <span v-if="f.clause && !String(f.ruleId).startsWith(f.clause)"> · {{ f.clause }}</span>
                <span v-if="f.description"> — {{ f.description }}</span>
                <span class="text-amber-400 ml-1">({{ f.count }})</span>
              </li>
            </ul>
          </div>
        </template>

        <!-- veraPDF unavailable -->
        <template v-else>
          <div class="flex items-start gap-3 mb-4">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--border)] text-[var(--text-muted)] flex-shrink-0">
              –
            </span>
            <div class="flex-1 text-sm">
              <p class="font-medium mb-1">veraPDF check was not run.</p>
              <p class="text-xs text-[var(--text-muted)] leading-relaxed">
                <a
                  v-if="verapdfUrl"
                  :href="verapdfUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-300 hover:text-blue-200 underline"
                >veraPDF</a>
                <span v-else>veraPDF</span> (the open-source PDF/UA-1 validator)
                isn't installed on this server. Configure
                <span class="font-mono">REMEDIATION_VERAPDF_PATH</span> in the
                environment to enable conformance reporting.
              </p>
            </div>
          </div>
        </template>

        <!-- The non-negotiable manual review reminder -->
        <div class="border-t border-[var(--border)] pt-4 text-sm">
          <p class="font-medium text-amber-300 mb-2">
            ⚠ Manual review is still required for IITAA compliance.
          </p>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            veraPDF (and any automated tool) can only check what's machine-verifiable:
            tag presence, structure depth, metadata. It cannot judge whether your
            <strong>alt text is meaningful</strong>, whether
            <strong>reading order makes sense to a sighted reader</strong>, or
            whether <strong>table semantics</strong> correctly model the data.
            Those require a human pass — typically in Adobe Acrobat (Tools →
            Accessibility → Accessibility Checker, plus the Reading Order and
            Tags panels) or with a screen reader. Conformance with the
            <a
              v-if="iitaaUrl"
              :href="iitaaUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-300 hover:text-blue-200 underline"
            >Illinois Information Technology Accessibility Act (IITAA)</a>
            <span v-else>Illinois Information Technology Accessibility Act (IITAA)</span>
            depends on both the machine-verifiable parts and that human review.
          </p>
        </div>
      </div>
    </section>

    <!-- Source-document recommendation: PDF remediation is a fallback;
         the real fix is upstream in the authoring tool. -->
    <section v-if="isVisuallyComplete" class="mb-6">
      <SourceDocumentNotice variant="result" />
    </section>

    <!-- Issues summary on the remediated output (same component as audit page).
         IssuesSummary is self-titled ('Issues to fix'), so no wrapping <h2> here. -->
    <section
      v-if="isVisuallyComplete && receipt?.outputAudit?.categories"
      class="mb-6"
    >
      <IssuesSummary :categories="receipt.outputAudit.categories" />
    </section>

    <!-- Failed -->
    <section
      v-if="status && status.status === 'failed'"
      class="border border-amber-700/50 bg-amber-950/20 rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3 text-amber-400">
        Auto-remediation didn't help this time
      </h2>
      <p class="text-sm mb-4">
        We tried but couldn't reliably improve this PDF without risking damage
        to its content.
      </p>
      <p class="text-sm mb-2 font-medium">Recommended next step:</p>
      <p class="text-sm text-[var(--text-muted)] mb-4">
        Open the original in Adobe Acrobat Pro → Accessibility → Autotag, then
        run the Accessibility Checker.
      </p>
      <p class="text-sm mb-2 font-medium">Common reasons this happens:</p>
      <ul class="text-sm text-[var(--text-muted)] list-disc list-inside space-y-1 mb-4">
        <li>PDF already has structure tags from another tool</li>
        <li>Complex multi-column layout</li>
        <li>Scanned / image-based content</li>
      </ul>
      <details v-if="status.failureReason" class="text-xs text-[var(--text-muted)]">
        <summary class="cursor-pointer">Technical detail</summary>
        <pre class="whitespace-pre-wrap mt-2">{{ status.failureReason }}</pre>
      </details>
    </section>

    <!-- Expired -->
    <section
      v-if="status && status.status === 'expired'"
      class="border border-[var(--border)] rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3">This job has expired</h2>
      <p class="text-sm text-[var(--text-muted)]">
        The remediated PDF was deleted after the retention window. Audit your
        PDF again and rerun remediation if you still need it.
      </p>
    </section>

    <!-- Error from the polling itself -->
    <section
      v-if="error"
      class="border border-red-700/50 bg-red-950/20 rounded-lg p-4 mb-6 text-sm"
    >
      {{ error }}
    </section>

    <!-- Receipt panel (any terminal state) -->
    <section
      v-if="receipt && isTerminal"
      class="border border-[var(--border)] rounded-lg p-6"
    >
      <h2 class="text-lg font-medium mb-1">Processing receipt</h2>
      <p class="text-xs text-[var(--text-muted)] mb-4">
        Receipt ID:
        <span class="font-mono">{{ receipt.jobId }}</span>
        <span v-if="receipt.contentHash">
          · Content hash:
          <span class="font-mono">{{ receipt.contentHash.slice(0, 16) }}…</span>
        </span>
      </p>

      <ol class="space-y-1 text-sm">
        <li
          v-for="evt in receipt.events"
          :key="evt.occurredAt"
          class="flex gap-3 font-mono text-xs"
        >
          <span class="text-[var(--text-muted)]">
            {{ fmtTime(evt.occurredAt) }}
          </span>
          <span>{{ labelForEvent(evt.event) }}</span>
        </li>
      </ol>

      <p
        v-if="receipt.completedAt"
        class="text-xs text-[var(--text-muted)] mt-4"
      >
        Total time on server: {{ fmtDuration(receipt.createdAt, receipt.completedAt) }}.
        No copies were sent to any third party.
      </p>
    </section>
  </div>
</template>

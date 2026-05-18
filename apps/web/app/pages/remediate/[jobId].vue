<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  useRemediationJob,
  type CategoryResult,
} from '~/composables/useRemediationJob'

// Score-mode toggle (matches the audit page's ScoreCard contract)
const beforeMode = ref<'strict' | 'remediation'>('strict')
const afterMode = ref<'strict' | 'remediation'>('strict')

definePageMeta({ middleware: [] })

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
  const profile = (out.scoreProfiles as Record<string, { categories?: CategoryResult[] }> | undefined)?.[afterMode.value]
  return profile?.categories ?? out.categories ?? []
})

const beforeCategories = computed<CategoryResult[]>(() => {
  const inp = receipt.value?.inputAudit
  if (!inp) return []
  const profile = (inp.scoreProfiles as Record<string, { categories?: CategoryResult[] }> | undefined)?.[afterMode.value]
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

  // Remediation (the "practical" profile)
  const remBefore = inp.scoreProfiles?.remediation
  const remAfter = out.scoreProfiles?.remediation
  if (remBefore || remAfter) {
    const dB = remBefore?.overallScore ?? null
    const dA = remAfter?.overallScore ?? null
    rows.push({
      label: 'Remediation score',
      description: 'Practical scoring profile (weights N/A categories more leniently).',
      beforeText: fmtScoreGrade(dB, remBefore?.grade),
      afterText: fmtScoreGrade(dA, remAfter?.grade),
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

function stepState(name: string): 'done' | 'active' | 'pending' {
  const current = status.value?.step
  if (!current) {
    return status.value?.status === 'complete' ? 'done' : 'pending'
  }
  const i = stepOrder.indexOf(current)
  const j = stepOrder.indexOf(name)
  if (j < i) return 'done'
  if (j === i) return 'active'
  return 'pending'
}

const downloadHref = computed(() =>
  status.value?.status === 'complete' && downloadToken
    ? `/api/remediate/${jobId}/download?token=${encodeURIComponent(downloadToken)}`
    : null,
)

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
  <div class="max-w-3xl mx-auto px-4 py-10">
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
      v-if="status && (status.status === 'pending' || status.status === 'running')"
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
          :style="{ width: `${status.progressPct}%` }"
        />
      </div>
      <p class="mt-4 text-xs text-[var(--text-muted)]">
        You can leave this page and come back.
      </p>
    </section>

    <!-- Complete: before/after ScoreCards side-by-side -->
    <section
      v-if="status?.status === 'complete' && receipt?.inputAudit && receipt?.outputAudit"
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
          <ScoreCard
            v-model:selected-mode="afterMode"
            :result="receipt.outputAudit"
          />

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
              Both scoring profiles before and after remediation.
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
              ✓ No critical, serious, or moderate issues remain on the selected
              scoring profile.
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
            v-model:selected-mode="beforeMode"
            :result="receipt.inputAudit"
          />
        </div>
      </div>
    </section>

    <!-- Download + manual-review notice -->
    <section
      v-if="status?.status === 'complete'"
      class="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-6 mb-6 text-center"
    >
      <UButton
        v-if="downloadHref"
        :to="downloadHref"
        external
        size="lg"
        color="primary"
      >
        ⬇ Download Remediated PDF
      </UButton>
      <p v-else class="text-sm text-amber-400">
        Download token missing — return to the audit page and click Remediate again.
      </p>
      <p class="text-sm mt-4 text-amber-400">
        ⚠ Manual review still recommended. Auto-remediation handles structure and
        metadata; it can't write meaningful alt text for charts or verify complex
        reading order.
      </p>
    </section>

    <!-- Compliance disclaimer (veraPDF verdict + IITAA + manual review) -->
    <section v-if="status?.status === 'complete' && receipt?.veraPdf" class="mb-6">
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
          Compliance disclaimer
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
                <span v-if="f.clause"> · {{ f.clause }}</span>
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
    <section v-if="status?.status === 'complete'" class="mb-6">
      <SourceDocumentNotice variant="result" />
    </section>

    <!-- Issues summary on the remediated output (same component as audit page) -->
    <section
      v-if="status?.status === 'complete' && receipt?.outputAudit?.categories"
      class="mb-6"
    >
      <h2 class="text-lg font-medium mb-3">Issues in the remediated PDF</h2>
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

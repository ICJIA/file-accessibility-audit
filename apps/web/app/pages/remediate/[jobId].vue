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

const categoryPairs = computed<CategoryPair[]>(() => {
  const input = receipt.value?.inputAudit?.categories ?? []
  const output = receipt.value?.outputAudit?.categories ?? []
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

  // Adobe parity (the 32-rule checker signal)
  const adBefore = inp.adobeParity?.summary
  const adAfter = out.adobeParity?.summary
  if (adBefore || adAfter) {
    const pB = adBefore?.passed ?? null
    const pA = adAfter?.passed ?? null
    const tot = adAfter?.total ?? adBefore?.total ?? 0
    rows.push({
      label: 'Adobe Acrobat checks',
      description: 'The 32-rule parity check Adobe Acrobat itself runs.',
      beforeText: pB === null ? '–' : `${pB}/${tot} passed`,
      afterText: pA === null ? '–' : `${pA}/${tot} passed`,
      delta:
        pA !== null && pB !== null
          ? `${pA - pB >= 0 ? '+' : ''}${pA - pB}`
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
  output_ready: 'Remediated PDF ready',
  downloaded: 'You downloaded the remediated PDF',
  output_deleted: 'Remediated PDF deleted from server',
  verified_absent: 'Deletion verified (file no longer exists)',
  verify_failed: 'Deletion verification failed',
  error: 'Error',
  expired: 'Output expired',
}

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

      <!-- BEFORE -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6 relative">
        <span class="absolute top-3 left-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Before
        </span>
        <ScoreCard
          v-model:selected-mode="beforeMode"
          :result="receipt.inputAudit"
        />
      </div>

      <!-- Down-arrow separator -->
      <div class="flex flex-col items-center my-8 text-[var(--text-muted)]">
        <svg
          class="w-6 h-6"
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
        <span class="text-xs uppercase tracking-wider mt-1">
          Auto-remediated to
        </span>
      </div>

      <!-- AFTER -->
      <div class="rounded-xl border-2 border-emerald-700/40 bg-emerald-950/10 p-4 sm:p-6 relative">
        <span class="absolute top-3 left-3 text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
          After remediation
        </span>
        <ScoreCard
          v-model:selected-mode="afterMode"
          :result="receipt.outputAudit"
        />
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

    <!-- Three-heuristic comparison -->
    <section
      v-if="status?.status === 'complete' && heuristicRows.length > 0"
      class="border border-[var(--border)] rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-1">All three scoring heuristics</h2>
      <p class="text-sm text-[var(--text-muted)] mb-4">
        The audit measures accessibility three ways. Here's how each one moved.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
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
              class="border-b border-[var(--border)]/40 last:border-0"
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
    </section>

    <!-- What we fixed -->
    <section
      v-if="status?.status === 'complete' && fixedCategories.length > 0"
      class="border border-emerald-700/40 bg-emerald-950/10 rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3 text-emerald-400">
        ✓ What we fixed ({{ fixedCategories.length }})
      </h2>
      <ul class="space-y-2 text-sm">
        <li
          v-for="cat in fixedCategories"
          :key="cat.id"
          class="flex items-baseline gap-3"
        >
          <span class="font-medium flex-1">{{ cat.label }}</span>
          <span class="font-mono text-[var(--text-muted)]">
            {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after?.toFixed(0) ?? '?' }}
          </span>
          <span
            v-if="cat.delta !== null"
            class="font-mono text-emerald-400 w-12 text-right"
          >
            +{{ cat.delta.toFixed(0) }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Improved but still low -->
    <section
      v-if="status?.status === 'complete' && improvedButLowCategories.length > 0"
      class="border border-amber-700/40 bg-amber-950/10 rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3 text-amber-400">
        ↑ Improved but still needs a closer look ({{ improvedButLowCategories.length }})
      </h2>
      <ul class="space-y-3 text-sm">
        <li v-for="cat in improvedButLowCategories" :key="cat.id">
          <div class="flex items-baseline gap-3">
            <span class="font-medium flex-1">{{ cat.label }}</span>
            <span class="font-mono text-[var(--text-muted)]">
              {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after?.toFixed(0) }}
            </span>
            <span class="font-mono text-amber-400 w-12 text-right">
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
    </section>

    <!-- Still needs manual review -->
    <section
      v-if="status?.status === 'complete' && needsManualCategories.length > 0"
      class="border border-red-700/40 bg-red-950/10 rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3 text-red-400">
        ⚠ Still needs manual review ({{ needsManualCategories.length }})
      </h2>
      <p class="text-sm text-[var(--text-muted)] mb-4">
        Auto-remediation couldn't improve these categories. These typically need
        a human to write meaningful descriptions, verify reading order, or mark
        table headers.
      </p>
      <ul class="space-y-3 text-sm">
        <li v-for="cat in needsManualCategories" :key="cat.id">
          <div class="flex items-baseline gap-3">
            <span class="font-medium flex-1">{{ cat.label }}</span>
            <span class="font-mono text-[var(--text-muted)]">
              {{ cat.before === null ? 'N/A' : cat.before.toFixed(0) }} → {{ cat.after === null ? 'N/A' : cat.after.toFixed(0) }}
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
    </section>

    <!-- Issues summary on the remediated output (same component as audit page) -->
    <section
      v-if="status?.status === 'complete' && receipt?.outputAudit?.categories"
      class="mb-6"
    >
      <h2 class="text-lg font-medium mb-3">Issues in the remediated PDF</h2>
      <IssuesSummary :categories="receipt.outputAudit.categories" />
    </section>

    <!-- Adobe parity comparison (uses the same card as audit page) -->
    <section
      v-if="status?.status === 'complete' && receipt?.outputAudit?.adobeParity"
      class="mb-6"
    >
      <h2 class="text-lg font-medium mb-3">Adobe Acrobat checks (remediated)</h2>
      <AdobeParityCard :parity="receipt.outputAudit.adobeParity" />
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

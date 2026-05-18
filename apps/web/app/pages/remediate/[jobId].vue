<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRemediationJob } from '~/composables/useRemediationJob'

definePageMeta({ middleware: [] })

const route = useRoute()
const jobId = String(route.params.jobId)
const downloadToken = String(route.query.t ?? '')

const { status, receipt, error, loading, isTerminal } = useRemediationJob(jobId)

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

    <!-- Complete -->
    <section
      v-if="status && status.status === 'complete'"
      class="border border-emerald-700/50 bg-emerald-950/20 rounded-lg p-6 mb-6"
    >
      <h2 class="text-lg font-medium mb-3 text-emerald-400">
        Auto-remediation complete
      </h2>
      <p class="text-2xl font-semibold mb-1">
        {{ status.inputScore?.toFixed(0) ?? '?' }} → {{ status.outputScore?.toFixed(0) ?? '?' }}
      </p>
      <p class="text-sm text-[var(--text-muted)] mb-6">
        Score improvement from auto-remediation.
      </p>
      <UButton
        v-if="downloadHref"
        :to="downloadHref"
        external
        size="lg"
        color="primary"
      >
        ⬇ Download Remediated PDF
      </UButton>
      <p v-else class="text-sm text-amber-400 mb-4">
        Download token missing — return to the audit page and click Remediate again.
      </p>
      <p class="text-sm mt-6 text-amber-400">
        ⚠ Manual review still recommended. Auto-remediation handles structure and
        metadata; it can't write meaningful alt text for charts or verify
        complex reading order.
      </p>
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

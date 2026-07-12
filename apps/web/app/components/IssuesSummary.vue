<template>
  <div v-if="rows.length" class="issues-summary">
    <h2 class="title">Issues to fix</h2>
    <p class="subtitle">
      Sorted by severity.<span data-export-exclude> Click a row to see the fix steps.</span>
    </p>
    <ul class="rows">
      <li
        v-for="row in rows"
        :key="row.id"
        :class="['row-wrap', `sev-${row.sevClass}`]"
      >
        <button
          type="button"
          :class="['row', { open: expanded[row.id] }]"
          :aria-expanded="!!expanded[row.id]"
          :aria-controls="`fix-steps-${row.id}`"
          @click="toggle(row.id)"
        >
          <span :class="['sev', `sev-${row.sevClass}`]">{{ row.severity }}</span>
          <span class="name">{{ row.label }}</span>
          <span class="summary">{{ row.summary }}</span>
          <span class="toggle" aria-hidden="true" data-export-exclude>
            <span class="toggle-text">{{ expanded[row.id] ? 'Hide' : 'Show' }} fix steps</span>
            <svg
              class="chevron"
              :class="{ rotated: expanded[row.id] }"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        <div
          v-if="expanded[row.id]"
          :id="`fix-steps-${row.id}`"
          class="fix-body"
          role="region"
          :aria-label="`Fix steps for ${row.label}`"
        >
          <div v-if="row.findings.main.length" class="findings-block">
            <h3 class="block-title">What we found</h3>
            <ul class="findings-list">
              <li v-for="(f, i) in row.findings.main" :key="i" class="finding-item">
                {{ f }}
              </li>
            </ul>
          </div>

          <div v-if="row.findings.acrobat.length" class="acrobat-block">
            <h3 class="block-title">How to fix in Adobe Acrobat</h3>
            <ol class="acrobat-list">
              <li
                v-for="(step, j) in row.findings.acrobat"
                :key="j"
                class="acrobat-step"
              >
                <span class="step-num">{{ j + 1 }}.</span>
                <span class="step-text">{{ step }}</span>
              </li>
            </ol>
          </div>

          <p
            v-if="!row.findings.main.length && !row.findings.acrobat.length"
            class="empty"
          >
            No detailed fix steps are available for this category. Run the full
            audit report for technical signals.
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { firstActionableFinding, partitionCardFindings } from '~/utils/findings'

const props = defineProps<{
  categories: Array<{
    id: string
    label: string
    severity?: string | null
    findings?: string[]
  }>
}>()

// Keyed precisely by the severity union (not a bare Record<string, number>)
// so indexing with `.severity` below is guaranteed defined — that field is
// filtered to exactly these three values just above.
const SEVERITY_RANK: Record<'Critical' | 'Moderate' | 'Minor', number> = {
  Critical: 0,
  Moderate: 1,
  Minor: 2,
}

const expanded = ref<Record<string, boolean>>({})

const rows = computed(() => {
  return (props.categories || [])
    .filter(
      (c) =>
        c.severity === 'Critical' ||
        c.severity === 'Moderate' ||
        c.severity === 'Minor',
    )
    .map((c) => ({
      id: c.id,
      label: c.label,
      severity: c.severity as 'Critical' | 'Moderate' | 'Minor',
      sevClass: (c.severity as string).toLowerCase(),
      summary: firstActionableFinding(c.findings),
      findings: partitionCardFindings(c.findings),
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
})

function toggle(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}
</script>

<style scoped>
.issues-summary {
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-card);
  padding: 16px 18px;
}
.title {
  color: var(--text-heading);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.subtitle {
  color: var(--text-muted);
  font-size: 11.5px;
  margin: 2px 0 10px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row-wrap {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--surface-deep);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  transition: background-color 120ms;
}
.row:hover {
  background: var(--surface-hover, var(--surface-deep));
}
.row:focus-visible {
  outline: 2px solid var(--accent-green, #22c55e);
  outline-offset: 2px;
}
.row.open {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
}
.sev {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
  flex: 0 0 auto;
  font-weight: 600;
}
.sev.sev-critical {
  background: rgba(239, 68, 68, 0.12);
  color: rgb(252, 165, 165);
}
.sev.sev-moderate {
  background: rgba(234, 179, 8, 0.12);
  color: rgb(253, 224, 71);
}
.sev.sev-minor {
  background: rgba(59, 130, 246, 0.12);
  color: rgb(147, 197, 253);
}
.name {
  color: var(--text-secondary);
  font-weight: 500;
  flex: 0 0 auto;
}
.summary {
  color: var(--text-muted);
  font-size: 11.5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--link, #3b82f6);
  font-size: 11.5px;
  flex: 0 0 auto;
}
.chevron {
  transition: transform 150ms;
}
.chevron.rotated {
  transform: rotate(180deg);
}
.fix-body {
  border: 1px solid var(--border-subtle);
  border-top: none;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  background: var(--surface-card);
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.findings-block .block-title {
  color: var(--text-secondary);
}
.findings-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.finding-item {
  line-height: 1.5;
}
.acrobat-block {
  border-radius: 6px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.04);
  padding: 10px 12px;
}
.acrobat-block .block-title {
  color: rgb(252, 211, 77);
}
.acrobat-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acrobat-step {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.5;
}
.step-num {
  flex-shrink: 0;
  width: 18px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: rgba(245, 158, 11, 0.85);
}
.step-text {
  flex: 1;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>

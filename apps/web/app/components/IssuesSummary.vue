<template>
  <div v-if="rows.length" class="issues-summary">
    <h2 class="title">Issues to fix</h2>
    <p class="subtitle">Sorted by severity. Click a row to jump to its fix steps.</p>
    <ul class="rows">
      <li
        v-for="row in rows"
        :key="row.id"
        :class="['row', `sev-${row.sevClass}`]"
      >
        <span :class="['sev', `sev-${row.sevClass}`]">{{ row.severity }}</span>
        <span class="name">{{ row.label }}</span>
        <span class="summary">{{ row.summary }}</span>
        <a :href="`#cat-${row.id}`" class="jump" @click.prevent="onJump(row.id)">↓ Fix steps</a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { firstActionableFinding } from '~/utils/findings'

const props = defineProps<{
  categories: Array<{
    id: string
    label: string
    severity?: string | null
    findings?: string[]
  }>
}>()

const SEVERITY_RANK: Record<string, number> = {
  Critical: 0,
  Moderate: 1,
  Minor: 2,
}

const rows = computed(() => {
  return (props.categories || [])
    .filter((c) => c.severity === 'Critical' || c.severity === 'Moderate' || c.severity === 'Minor')
    .map((c) => ({
      id: c.id,
      label: c.label,
      severity: c.severity as 'Critical' | 'Moderate' | 'Minor',
      sevClass: (c.severity as string).toLowerCase(),
      summary: firstActionableFinding(c.findings),
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
})

function onJump(catId: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(`cat-${catId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--surface-deep);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
}
.sev {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
  flex: 0 0 auto;
  font-weight: 600;
}
.sev.sev-critical { background: rgba(239,68,68,0.12); color: rgb(252,165,165); }
.sev.sev-moderate { background: rgba(234,179,8,0.12); color: rgb(253,224,71); }
.sev.sev-minor    { background: rgba(59,130,246,0.12); color: rgb(147,197,253); }
.name { color: var(--text-secondary); font-weight: 500; flex: 0 0 auto; }
.summary {
  color: var(--text-muted);
  font-size: 11.5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jump {
  color: var(--link, #3b82f6);
  font-size: 11.5px;
  flex: 0 0 auto;
  text-decoration: none;
}
.jump:hover { text-decoration: underline; }
.jump:focus-visible { outline: 2px solid var(--accent-green, #22c55e); outline-offset: 2px; border-radius: 2px; }
</style>

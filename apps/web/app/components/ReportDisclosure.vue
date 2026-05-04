<template>
  <details
    :open="isOpen"
    class="report-disclosure"
    @toggle="onToggle"
  >
    <summary>
      <span class="chevron" aria-hidden="true">▸</span>
      <span class="label">{{ label }}</span>
      <span v-if="badge" class="badge">{{ badge }}</span>
    </summary>
    <div class="body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  mode: 'reader' | 'auditor'
  label: string
  badge?: string
}>()

const isOpen = ref(props.mode === 'auditor')

watch(
  () => props.mode,
  (next) => {
    isOpen.value = next === 'auditor'
  },
)

function onToggle(e: Event) {
  isOpen.value = (e.target as HTMLDetailsElement).open
}
</script>

<style scoped>
.report-disclosure {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-card-alt, rgba(255, 255, 255, 0.02));
  margin: 12px 0;
  transition: border-color 0.15s ease;
}
.report-disclosure[open] {
  border-color: var(--border);
}
.report-disclosure > summary {
  list-style: none;
  cursor: pointer;
  padding: 9px 14px;
  font-size: 12.5px;
  color: var(--text-muted);
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.report-disclosure > summary::-webkit-details-marker {
  display: none;
}
.report-disclosure > summary:focus-visible {
  outline: 2px solid var(--accent-green, #22c55e);
  outline-offset: -2px;
}
.report-disclosure > summary .chevron {
  color: var(--text-muted);
  font-size: 10px;
  transition: transform 0.15s ease;
  display: inline-block;
}
.report-disclosure[open] > summary .chevron {
  transform: rotate(90deg);
}
.report-disclosure > summary .label {
  flex: 1;
  color: var(--text-muted);
  font-weight: 500;
}
.report-disclosure[open] > summary .label {
  color: var(--text-secondary);
}
.report-disclosure > summary .badge {
  font-size: 10.5px;
  color: var(--text-muted);
  font-style: italic;
}
.report-disclosure > .body {
  padding: 0 14px 14px;
}
.report-disclosure > .body > :first-child {
  margin-top: 6px;
}
</style>

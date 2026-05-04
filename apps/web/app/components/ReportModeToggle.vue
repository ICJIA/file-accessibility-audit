<template>
  <div class="mode-toggle" role="group" aria-label="Report view mode">
    <button
      type="button"
      :aria-pressed="modelValue === 'reader' ? 'true' : 'false'"
      :class="['seg', 'reader', { active: modelValue === 'reader' }]"
      @click="emit('update:modelValue', 'reader')"
    >
      Reader
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'auditor' ? 'true' : 'false'"
      :class="['seg', 'auditor', { active: modelValue === 'auditor' }]"
      @click="emit('update:modelValue', 'auditor')"
    >
      Auditor
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: 'reader' | 'auditor' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'reader' | 'auditor'] }>()
</script>

<style scoped>
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.seg {
  padding: 4px 12px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border: 0;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg:hover:not(.active) {
  color: var(--text-secondary);
  background: var(--surface-hover);
}
.seg:focus-visible {
  outline: 2px solid var(--accent-green, #22c55e);
  outline-offset: -2px;
}
.seg.reader.active {
  background: rgba(16, 185, 129, 0.15);
  color: rgb(110, 231, 183);
}
.seg.auditor.active {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(252, 211, 77);
}
</style>

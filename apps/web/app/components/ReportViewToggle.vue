<template>
  <div
    class="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs"
    role="group"
    aria-label="Report view"
    data-export-exclude
  >
    <button
      type="button"
      :aria-pressed="modelValue === 'visual'"
      :class="btnClass('visual')"
      @click="$emit('update:modelValue', 'visual')"
    >
      Visual view
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'detailed'"
      :class="btnClass('detailed')"
      @click="$emit('update:modelValue', 'detailed')"
    >
      Detailed view
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ReportViewMode } from "~/composables/useReportView";

const props = defineProps<{ modelValue: ReportViewMode }>();
defineEmits<{ (e: "update:modelValue", v: ReportViewMode): void }>();

function btnClass(m: ReportViewMode): string {
  const base = "px-3 py-1.5 font-medium transition-colors cursor-pointer";
  return m === props.modelValue
    ? `${base} bg-blue-500/15 text-[var(--text-heading)]`
    : `${base} text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]`;
}
</script>

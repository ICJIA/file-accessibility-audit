<template>
  <div class="w-full" data-export-exclude>
    <p class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
      How do you want to read this report?
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Report view">
      <button
        v-for="opt in options"
        :key="opt.mode"
        type="button"
        :aria-pressed="modelValue === opt.mode"
        :class="cardClass(opt.mode)"
        @click="$emit('update:modelValue', opt.mode)"
      >
        <span :class="iconClass(opt.mode)" aria-hidden="true">
          <!-- Numbered-steps glyph for Visual, dense-rows glyph for Detailed:
               the shapes say what each view is before the words are read. -->
          <svg
            v-if="opt.mode === 'visual'"
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="5" cy="6" r="2.2" />
            <circle cx="5" cy="18" r="2.2" />
            <path d="M5 8.2v7.6M11 6h8M11 18h8" />
          </svg>
          <svg
            v-else
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 5h16M4 9h16M4 13h16M4 17h10" />
          </svg>
        </span>
        <span class="min-w-0 text-left">
          <span class="flex items-center gap-2">
            <span class="text-sm font-bold text-[var(--text-heading)]">{{ opt.title }}</span>
            <span
              v-if="modelValue === opt.mode"
              class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300"
              >Showing</span
            >
          </span>
          <span class="mt-0.5 block text-xs text-[var(--text-secondary)] leading-snug">
            {{ opt.blurb }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReportViewMode } from "~/composables/useReportView";

// This used to be a pair of text-xs labels in a small bordered strip, aligned
// right above the report. It was missed — a reader looking for the step-by-step
// plan could not find the control that shows it, and reported the plan as
// gone. A toggle nobody sees is not a toggle; it is a hidden setting.
//
// So it now states its own question, gives each option a shape and a sentence
// saying what you get, and marks the active one in words ("Showing") rather
// than by background colour alone — colour is not available to everyone, and
// this is an accessibility tool.
const props = defineProps<{ modelValue: ReportViewMode }>();
defineEmits<{ (e: "update:modelValue", v: ReportViewMode): void }>();

const options: Array<{ mode: ReportViewMode; title: string; blurb: string }> = [
  {
    mode: "visual",
    title: "Visual",
    blurb: "Your grade, then a numbered plan — one fix at a time, in plain language.",
  },
  {
    mode: "detailed",
    title: "Detailed",
    blurb: "The full technical report: every finding, WCAG criteria and evidence.",
  },
];

function cardClass(m: ReportViewMode): string {
  const base =
    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]";
  return m === props.modelValue
    ? `${base} border-emerald-500/50 bg-emerald-500/10`
    : `${base} border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]`;
}

function iconClass(m: ReportViewMode): string {
  const base = "shrink-0 flex h-9 w-9 items-center justify-center rounded-lg";
  return m === props.modelValue
    ? `${base} bg-emerald-500/20 text-emerald-300`
    : `${base} bg-[var(--surface-icon)] text-[var(--text-muted)]`;
}
</script>

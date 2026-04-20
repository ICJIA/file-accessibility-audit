<template>
  <div
    data-testid="mode-compare-box"
    :data-category-id="categoryId"
    class="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-3 py-2.5"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p
        class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]"
      >
        How each mode scores this category
      </p>
      <span
        class="text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5"
        :class="
          diverges
            ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
            : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-muted)]'
        "
      >
        {{ copy.label }}
      </span>
    </div>
    <div class="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
      <button
        type="button"
        :aria-pressed="selectedMode === 'strict'"
        data-testid="mode-compare-strict"
        class="text-left rounded-md border px-2.5 py-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        :class="
          selectedMode === 'strict'
            ? 'border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-400/30'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
        "
        @click="emit('update:selectedMode', 'strict')"
      >
        <p class="flex items-center gap-1.5">
          <span
            class="text-[10px] uppercase tracking-wide text-emerald-300 font-semibold"
            >Strict</span
          >
          <span
            v-if="selectedMode === 'strict'"
            class="text-[9px] uppercase tracking-wide text-emerald-300/80 font-medium"
            >Active</span
          >
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(strictScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ strictGrade ?? "—" }}</span
          >
        </p>
      </button>
      <button
        type="button"
        :aria-pressed="selectedMode === 'remediation'"
        data-testid="mode-compare-practical"
        class="text-left rounded-md border px-2.5 py-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        :class="
          selectedMode === 'remediation'
            ? 'border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/30'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
        "
        @click="emit('update:selectedMode', 'remediation')"
      >
        <p class="flex items-center gap-1.5">
          <span
            class="text-[10px] uppercase tracking-wide text-amber-300 font-semibold"
            >Practical</span
          >
          <span
            v-if="selectedMode === 'remediation'"
            class="text-[9px] uppercase tracking-wide text-amber-300/80 font-medium"
            >Active</span
          >
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(practicalScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ practicalGrade ?? "—" }}</span
          >
        </p>
      </button>
    </div>
    <div class="mt-2.5 space-y-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
      <p>
        <span class="font-semibold text-[var(--text-secondary)]"
          >Why the scores differ:</span
        >
        {{ copy.whatPracticalCredits }}
      </p>
      <p
        v-for="block in orderedWhyBlocks"
        :key="block.key"
        :class="block.key === activeWhyKey ? 'text-[var(--text-secondary)]' : ''"
      >
        <span class="font-semibold" :class="block.accentClass">
          Why {{ block.label }} matters:
        </span>
        {{ block.text
        }}<span
          v-if="block.key === activeWhyKey"
          class="ml-1 text-[10px] uppercase tracking-wide"
          :class="block.accentClass"
          >· active view</span
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  canCategoryDiverge,
  getDivergenceCopy,
} from "~/utils/modeDivergence";
import type { ScoringMode } from "~/utils/scoringProfiles";

const props = defineProps<{
  categoryId: string;
  strictScore: number | null;
  strictGrade: string | null;
  practicalScore: number | null;
  practicalGrade: string | null;
  selectedMode: ScoringMode;
}>();

const emit = defineEmits<{
  "update:selectedMode": [mode: ScoringMode];
}>();

const copy = computed(() => getDivergenceCopy(props.categoryId));

const diverges = computed(() => {
  if (!canCategoryDiverge(props.categoryId)) return false;
  return props.strictScore !== props.practicalScore;
});

const activeWhyKey = computed(() =>
  props.selectedMode === "strict" ? "strict" : "practical",
);

const orderedWhyBlocks = computed(() => {
  const strictBlock = {
    key: "strict" as const,
    label: "Strict",
    text: copy.value.whyStrictMatters,
    accentClass: "text-emerald-300",
  };
  const practicalBlock = {
    key: "practical" as const,
    label: "Practical",
    text: copy.value.whyPracticalMatters,
    accentClass: "text-amber-300",
  };
  return props.selectedMode === "strict"
    ? [strictBlock, practicalBlock]
    : [practicalBlock, strictBlock];
});

function formatScore(score: number | null): string {
  return score === null ? "N/A" : `${score}/100`;
}
</script>

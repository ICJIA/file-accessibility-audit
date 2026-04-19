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
      <div
        class="rounded-md border px-2.5 py-2"
        :class="
          selectedMode === 'strict'
            ? 'border-emerald-400/50 bg-emerald-500/10'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)]'
        "
        data-testid="mode-compare-strict"
      >
        <p class="text-[10px] uppercase tracking-wide text-emerald-300 font-semibold">
          Strict
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(strictScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ strictGrade ?? "—" }}</span
          >
        </p>
      </div>
      <div
        class="rounded-md border px-2.5 py-2"
        :class="
          selectedMode === 'remediation'
            ? 'border-amber-400/50 bg-amber-500/10'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)]'
        "
        data-testid="mode-compare-practical"
      >
        <p class="text-[10px] uppercase tracking-wide text-amber-300 font-semibold">
          Practical
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(practicalScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ practicalGrade ?? "—" }}</span
          >
        </p>
      </div>
    </div>
    <div class="mt-2.5 space-y-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
      <p>
        <span class="font-semibold text-[var(--text-secondary)]"
          >Why the scores differ:</span
        >
        {{ copy.whatPracticalCredits }}
      </p>
      <p>
        <span class="font-semibold text-emerald-300">Why Strict matters:</span>
        {{ copy.whyStrictMatters }}
      </p>
      <p>
        <span class="font-semibold text-amber-300">Why Practical matters:</span>
        {{ copy.whyPracticalMatters }}
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

const copy = computed(() => getDivergenceCopy(props.categoryId));

const diverges = computed(() => {
  if (!canCategoryDiverge(props.categoryId)) return false;
  return props.strictScore !== props.practicalScore;
});

function formatScore(score: number | null): string {
  return score === null ? "N/A" : `${score}/100`;
}
</script>

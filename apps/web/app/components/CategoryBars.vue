<template>
  <section
    class="category-bars rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5"
    aria-labelledby="category-bars-title"
  >
    <h2
      id="category-bars-title"
      class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
    >
      Where the score comes from
    </h2>

    <ul class="mt-3 space-y-2.5 list-none m-0 p-0" role="list">
      <li
        v-for="cat in scored"
        :key="cat.id"
        data-testid="bar-row"
        class="flex items-center gap-2 sm:gap-3"
        :aria-label="rowLabel(cat)"
      >
        <span class="w-28 sm:w-44 flex-shrink-0 text-xs text-[var(--text-secondary)] truncate">{{
          cat.label
        }}</span>
        <div class="flex-1 h-2.5 rounded bg-[var(--surface-deep)]" aria-hidden="true">
          <div
            data-testid="bar-fill"
            class="h-2.5 rounded"
            :style="{ width: `${cat.score}%`, backgroundColor: barColor(cat) }"
          />
        </div>
        <span
          class="w-8 text-right font-mono text-xs text-[var(--text-secondary)]"
          aria-hidden="true"
          >{{ cat.score }}</span
        >
        <span
          class="inline-flex w-5 h-5 rounded-full text-[10px] font-bold items-center justify-center flex-shrink-0"
          :style="{ backgroundColor: withAlpha(barColor(cat), 12), color: barColor(cat) }"
          aria-hidden="true"
          >{{ cat.grade || "—" }}</span
        >
        <!-- FIXED WIDTH, and ALWAYS RENDERED (2026-08-31 bug report). The
             track above is flex-1, so anything variable to its right changes
             how much room the track gets — and the fill is a percentage OF
             THE TRACK. "Minor" is far narrower than "No issues found", so a
             94 sat in a wider track and drew a LONGER bar than a 100 beside
             it. A row with no severity at all rendered no chip and was wider
             still. Every trailing column is now a fixed size, so every track
             is identical and the bars are comparable down the column, which
             is the entire point of showing them stacked. -->
        <span
          class="w-[6.5rem] flex-shrink-0 text-[10px] text-center whitespace-nowrap"
          aria-hidden="true"
          ><span
            v-if="cat.severity"
            class="inline-block px-2 py-0.5 rounded-full"
            :style="{
              backgroundColor: withAlpha(sevColor(cat.severity), 8),
              color: sevColor(cat.severity),
            }"
            >{{ cat.severity }}</span
          ></span
        >
      </li>
    </ul>

    <div
      v-if="na.length"
      data-testid="bars-na"
      class="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-1"
    >
      <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Not scored
      </p>
      <p v-for="cat in na" :key="cat.id" class="text-xs text-[var(--text-muted)]">
        <span class="text-[var(--text-secondary)]">{{ cat.label }}</span>
        — {{ cat.notAssessed ? "Not assessed" : "Not applicable" }}:
        {{ naReason(cat.id, cat.notAssessed) }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";
import { computed } from "vue";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { gradeColor, severityColor, withAlpha } = useTokenColors();
import { naReason } from "~/utils/modeDivergence";

interface BarCategory {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  notAssessed?: boolean;
}

const props = defineProps<{ categories: BarCategory[] }>();

const safe = computed<BarCategory[]>(() =>
  Array.isArray(props.categories) ? props.categories : [],
);
const scored = computed(() => safe.value.filter((c) => c.score !== null));
const na = computed(() => safe.value.filter((c) => c.score === null));

function barColor(cat: BarCategory): string {
  return gradeColor(cat.grade);
}
function sevColor(severity: string): string {
  return severityColor(severity);
}
function rowLabel(cat: BarCategory): string {
  const sev = cat.severity ? `, severity ${cat.severity}` : "";
  return `${cat.label}: ${cat.score} out of 100, grade ${cat.grade ?? "none"}${sev}`;
}
</script>

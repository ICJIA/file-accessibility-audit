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

    <ul class="mt-3 space-y-2.5 list-none m-0 p-0">
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
          :style="{ backgroundColor: barColor(cat) + '20', color: barColor(cat) }"
          aria-hidden="true"
          >{{ cat.grade || "—" }}</span
        >
        <span
          v-if="cat.severity"
          class="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
          aria-hidden="true"
          >{{ cat.severity }}</span
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
import { computed } from "vue";
import { gradeColor, severityColor } from "@file-audit/shared";
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
  return cat.grade ? gradeColor(cat.grade) : "#555";
}
function sevColor(severity: string): string {
  return severityColor(severity);
}
function rowLabel(cat: BarCategory): string {
  const sev = cat.severity ? `, severity ${cat.severity}` : "";
  return `${cat.label}: ${cat.score} out of 100, grade ${cat.grade ?? "none"}${sev}`;
}
</script>

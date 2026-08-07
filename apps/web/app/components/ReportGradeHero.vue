<template>
  <div class="text-center">
    <div class="flex justify-center">
      <div
        class="w-44 h-44 sm:w-56 sm:h-56 rounded-full flex items-center justify-center border-[6px]"
        :style="{
          borderColor: color,
          backgroundColor: withAlpha(color, 8),
          boxShadow: `0 0 80px ${withAlpha(color, 25)}, 0 0 24px ${withAlpha(color, 15)}`,
        }"
      >
        <span class="text-8xl sm:text-9xl font-black" :style="{ color }">{{ grade }}</span>
      </div>
    </div>
    <p class="text-4xl sm:text-5xl font-bold mt-5">
      {{ overallScore }}<span class="text-xl sm:text-2xl text-[var(--text-secondary)]">/100</span>
    </p>
    <p class="text-base sm:text-lg font-semibold mt-2" :style="{ color: labelColor }">
      {{ label }}
    </p>

    <!-- Score and letter are a matched pair again: the score is capped by the
         worst finding and the letter is derived from it through the published
         scale, so 69 is a D and always will be. v1.58.0 capped the LETTER
         instead and produced "D" above "80/100", which readers correctly
         called wrong. What the panel now has to explain is not the letter but
         the NUMBER — why it stalls below the raw average until a blocking
         finding is fixed. -->
    <div
      class="mt-5 mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-5 py-4 text-left"
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Fix progress
        </span>
        <span class="text-sm font-semibold text-[var(--text-heading)]">
          {{ checksPassed }} of {{ checksTotal }} checks passed
        </span>
      </div>
      <div
        class="mt-2 h-2 rounded-full bg-[var(--surface-deep)] overflow-hidden"
        aria-hidden="true"
      >
        <div class="h-full rounded-full bg-sky-500/70" :style="{ width: `${barWidth}%` }" />
      </div>
      <p class="mt-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
        {{ progressNote }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";
import { computed } from "vue";
import { scoreCapReason } from "@file-audit/shared";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { gradeColor, severityColor, withAlpha } = useTokenColors();
import { gradeLabel } from "~/utils/exportFormats/shared";
import { publicationVerdict } from "~/utils/actionPlan";

const props = defineProps<{
  grade: string;
  overallScore: number;
  categories: Array<{ severity?: string | null; score?: number | null; notAssessed?: boolean }>;
}>();

const color = computed(() => gradeColor(props.grade));

const hasCategories = computed(
  () => Array.isArray(props.categories) && props.categories.length > 0,
);

// No categories (URL page-audit reports stored in the same table) → the grade
// adjective alone; a publication clause would claim document-level knowledge
// we don't have for those.
const verdict = computed(() => publicationVerdict(props.categories));

// The emotional headline for non-technical readers. When something blocks
// publication the blocker leads on its own ("Not ready to publish — 2 critical
// issues"): pairing it with the grade adjective produced sentences like
// "Excellent — not ready to publish", because the grade is a weighted average
// and the verdict is a severity tally. The grade letter above is unaffected.
const label = computed(() => {
  if (!hasCategories.value) return gradeLabel(props.grade);
  const v = verdict.value;
  return v.tone === "critical" ? v.text : `${gradeLabel(props.grade)} — ${v.text}`;
});

// A blocking verdict must never render in reassuring grade-green.
const labelColor = computed(() =>
  hasCategories.value && verdict.value.tone === "critical"
    ? severityColor("Critical")
    : color.value,
);

// Plain counts, not a percentage — a second figure out of 100 next to the
// score would be one more thing to mistake for the grade.
//
// Counted over the same set the SCORE is computed over, so the two can never
// be arithmetic-checked against each other and disagree: a check that does
// not apply counts as passed (no tables means no table problem), while one
// that could not be assessed is excluded entirely rather than assumed good.
const counted = computed(() =>
  (Array.isArray(props.categories) ? props.categories : []).filter(
    (c) => c && (c.score !== null || c.notAssessed !== true),
  ),
);
const checksTotal = computed(() => counted.value.length);
const checksPassed = computed(
  () => counted.value.filter((c) => c.score === 100 || c.score === null).length,
);
const barWidth = computed(() =>
  checksTotal.value === 0 ? 0 : Math.round((checksPassed.value / checksTotal.value) * 100),
);

// Explains the NUMBER, not the letter. A reader watching the score stall
// needs to know one finding is holding it there — not that the checks stopped
// improving. When nothing is capped there is nothing to explain.
const progressNote = computed(() => {
  const reason = scoreCapReason(props.overallScore, props.categories);
  if (!reason) {
    // "Fix the steps below" is wrong on a document with no steps — which is
    // exactly the report an author is most likely to read closely.
    return checksPassed.value === checksTotal.value && checksTotal.value > 0
      ? "Every automated check passed. See what still needs a human below."
      : "Fix the steps below and re-upload to watch this rise.";
  }
  const n = checksTotal.value - checksPassed.value;
  return (
    `${n === 1 ? "The one check that didn't pass is" : `${n} checks did not pass; the most serious is`} ` +
    `${reason.severity.toLowerCase()}, which holds the score at ${reason.cappedScore} — ` +
    `a ${reason.severity.toLowerCase()} issue caps a document at ${reason.cappedGrade} until it is fixed.`
  );
});
</script>

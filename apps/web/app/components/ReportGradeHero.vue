<template>
  <div class="text-center">
    <div class="flex justify-center">
      <div
        class="w-44 h-44 sm:w-56 sm:h-56 rounded-full flex items-center justify-center border-[6px]"
        :style="{
          borderColor: color,
          backgroundColor: color + '15',
          boxShadow: `0 0 80px ${color}40, 0 0 24px ${color}25`,
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { gradeColor, severityColor } from "@file-audit/shared";
import { gradeLabel } from "~/utils/exportFormats/shared";
import { publicationVerdict } from "~/utils/actionPlan";

const props = defineProps<{
  grade: string;
  overallScore: number;
  categories: Array<{ severity?: string | null }>;
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
</script>

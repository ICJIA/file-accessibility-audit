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
    <p class="text-base sm:text-lg font-semibold mt-2" :style="{ color }">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { gradeColor } from "@file-audit/shared";
import { gradeLabel } from "~/utils/exportFormats/shared";
import { verdictPhrase } from "~/utils/actionPlan";

const props = defineProps<{
  grade: string;
  overallScore: number;
  categories: Array<{ severity?: string | null }>;
}>();

const color = computed(() => gradeColor(props.grade));
// "Poor — not ready to publish": the emotional headline for non-technical
// readers. gradeLabel supplies the adjective, verdictPhrase the consequence.
// No categories (URL page-audit reports stored in the same table) → no
// publication clause; a clause would claim document-level knowledge we
// don't have for those.
const label = computed(() =>
  Array.isArray(props.categories) && props.categories.length
    ? `${gradeLabel(props.grade)} — ${verdictPhrase(props.categories)}`
    : gradeLabel(props.grade),
);
</script>

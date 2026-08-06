<template>
  <div class="text-center">
    <div class="flex justify-center">
      <div
        class="w-28 h-28 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: color, backgroundColor: color + '15' }"
      >
        <span class="text-5xl sm:text-7xl font-black" :style="{ color }">{{ grade }}</span>
      </div>
    </div>
    <p class="text-3xl font-bold mt-4">
      {{ overallScore }}<span class="text-lg text-[var(--text-secondary)]">/100</span>
    </p>
    <p class="text-sm font-medium mt-1" :style="{ color }">{{ label }}</p>
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

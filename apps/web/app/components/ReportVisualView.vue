<template>
  <div>
    <ReportGradeHero
      :grade="result.grade"
      :overall-score="result.overallScore ?? result.score"
      :categories="result.categories || []"
      class="mb-5"
    />

    <SeverityTiles v-if="hasCategories" :categories="result.categories" class="mb-4" />

    <VerdictStrip
      :conformance="result.conformance"
      :wcag-version="wcag.version"
      class="mb-6"
    />

    <slot name="notice" />

    <div
      v-if="result.isScanned"
      class="mb-4 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
    >
      <p class="text-[var(--status-warning-orange)] font-medium text-sm">
        This document appears to be a scanned image. Screen readers cannot access its content. OCR
        and full remediation are required — that's step 1 of your action plan.
      </p>
    </div>

    <div
      v-if="result.warnings?.length"
      class="mb-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4"
    >
      <p
        v-for="w in result.warnings"
        :key="w"
        class="text-[var(--status-warning-yellow)] text-sm"
      >
        {{ w }}
      </p>
    </div>

    <!-- No categories[] (URL page-audit rows share the shared_reports table)
         → no plan, no tiles, no bars, no expander. Rendering the green pass
         card for a page with axe violations would be actively misleading. -->
    <template v-if="hasCategories">
      <ActionPlan
        :steps="planSteps"
        :conformance="result.conformance"
        class="mb-6"
        @show-evidence="revealEvidence"
      />

      <CategoryBars :categories="result.categories" class="mb-6" />

      <TechnicalReport
        v-model:open="techOpen"
        :result="result"
        :verapdf-url="verapdfUrl"
        :wcag-version="wcag.version"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ReportGradeHero from "~/components/ReportGradeHero.vue";
import SeverityTiles from "~/components/SeverityTiles.vue";
import VerdictStrip from "~/components/VerdictStrip.vue";
import ActionPlan from "~/components/ActionPlan.vue";
import CategoryBars from "~/components/CategoryBars.vue";
import TechnicalReport from "~/components/TechnicalReport.vue";
import { buildActionPlan } from "~/utils/actionPlan";
import { useWcag } from "~/composables/useWcag";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard downstream.
  // (@typescript-eslint/no-explicit-any is off repo-wide — see eslint.config.mjs.)
  result: Record<string, any>;
  verapdfUrl?: string;
}>();

const wcag = useWcag();
const techOpen = ref(false);

const hasCategories = computed(
  () => Array.isArray(props.result.categories) && props.result.categories.length > 0,
);

const planSteps = computed(() => buildActionPlan(props.result.categories, props.result.fileType));

function revealEvidence(categoryId: string): void {
  techOpen.value = true;
  nextTick(() => {
    document
      .getElementById(`cat-${categoryId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
</script>

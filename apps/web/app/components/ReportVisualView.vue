<template>
  <div>
    <ReportGradeHero
      :grade="displayedGrade"
      :overall-score="displayedScore"
      :categories="displayedCategories"
      class="mb-5"
    />

    <SeverityTiles v-if="hasCategories" :categories="displayedCategories" class="mb-4" />

    <VerdictStrip :conformance="result.conformance" :wcag-version="wcag.version" class="mb-6" />

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
      <p v-for="w in result.warnings" :key="w" class="text-[var(--status-warning-yellow)] text-sm">
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

      <slot name="cta" />

      <CategoryBars :categories="displayedCategories" class="mb-6" />

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
import { categoriesForScoringMode } from "~/utils/scoringProfiles";
import { useWcag } from "~/composables/useWcag";
import type { CategoryResult } from "@file-audit/shared";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard downstream.
  // (@typescript-eslint/no-explicit-any is off repo-wide — see eslint.config.mjs.)
  result: Record<string, any>;
  verapdfUrl?: string;
}>();

const wcag = useWcag();
const techOpen = ref(false);

// Gates whether the plan/tiles/bars/technical-report block renders at all.
// Deliberately reads the RAW categories array, not the scoring-mode-projected
// one below: a page-audit report (no categories[]) must keep rendering the
// grade hero without these sections, and categoriesForScoringMode always
// returns an array (possibly a same-length mapped copy), so gating on it
// instead would not change this guard's truthiness but would obscure why it
// exists — see the spec's page-audit-guard note.
const hasCategories = computed(
  () => Array.isArray(props.result.categories) && props.result.categories.length > 0,
);

// Same derivation the Detailed view uses (ScoreCard.vue's displayedProfile /
// displayedCategories, ReportContent.vue's displayedCategories): project
// categories onto the "strict" scoring profile when the report carries one.
// Old stored reports (pre-v1.21) can have a top-level grade/score that
// diverges from scoreProfiles.strict — without this, the Visual view's hero,
// tiles, plan, and bars would disagree with the Detailed view for those
// reports. categoriesForScoringMode always returns an array, so every
// consumer below stays array-safe.
//
// The explicit <CategoryResult> type argument is required, not decorative:
// `props.result` is `Record<string, any>`, so `props.result.categories` is
// `any`, and inferring T from an `any` argument resolves to the function's
// bare constraint (ScoredCategoryLike — no `label`) rather than `any`, which
// then failed CategoryBars' `label`-requiring BarCategory[] prop at
// typecheck. Pinning T explicitly sidesteps that inference and gives every
// consumer below (CategoryBars, SeverityTiles, ReportGradeHero,
// buildActionPlan) the fully-shaped type it expects.
const displayedCategories = computed(() =>
  categoriesForScoringMode<CategoryResult>(
    props.result.categories,
    props.result.scoreProfiles,
    "strict",
  ),
);
const displayedGrade = computed(
  () => props.result.scoreProfiles?.strict?.grade ?? props.result.grade,
);
const displayedScore = computed(
  () =>
    props.result.scoreProfiles?.strict?.overallScore ??
    props.result.overallScore ??
    props.result.score,
);

const planSteps = computed(() => buildActionPlan(displayedCategories.value, props.result.fileType));

function revealEvidence(categoryId: string): void {
  techOpen.value = true;
  nextTick(() => {
    document
      .getElementById(`cat-${categoryId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
</script>

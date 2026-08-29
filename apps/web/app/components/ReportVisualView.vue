<template>
  <div>
    <ReportGradeHero
      :grade="displayedGrade"
      :overall-score="displayedScore"
      :categories="displayedCategories"
      :not-assessed-count="notAssessedCount"
      class="mb-5"
    />

    <SeverityTiles v-if="hasCategories" :categories="displayedCategories" class="mb-4" />

    <!-- Which rulebook produced the grade, stated before anyone scrolls.
         Gated like the plan/tiles: a page-audit row (no categories[]) must
         not get a green legal-verdict box the axe results could contradict. -->
    <TwoStandardsStrip
      v-if="hasCategories"
      :conformance="result.conformance"
      :wcag-version="wcag.version"
      :file-type="result.fileType"
      :pdf-ua-verdict="result.pdfUaVerdict"
      class="mb-6"
    />

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
      <!-- What made this document, and when — read this BEFORE the plan,
           because the plan's source route targets whatever app made it. -->
      <DocumentMetadataCard :result="result" class="mb-6" />

      <ActionPlan
        :steps="planSteps"
        :conformance="result.conformance"
        :pdf-ua-verdict="result.pdfUaVerdict"
        :categories="displayedCategories"
        class="mb-6"
        @show-evidence="revealEvidence"
      />

      <!-- Directly under the plan: the moment someone has read the fixes is
           the moment they go and do them, away from this tab. -->
      <PrintPlanButton :result="result" class="mb-6" />

      <slot name="cta" />

      <!-- Directly under the plan, so on a clean report — where the plan is a
           single green line — this is the first substantial thing the author
           reads. A 100 used to end the report with nothing to act on, and the
           question it left behind ("what should I still look at?") is exactly
           the one a document author asks. -->
      <ManualReviewCard
        :categories="displayedCategories"
        :conformance="result.conformance"
        class="mb-6"
      />

      <!-- "Fix it at the source" — strategy, not a step. It used to sit ABOVE
           the plan, where ~120 words of advice stood between a reader and the
           one thing they came for. It is advice about HOW to do the work, so
           it reads better once the work is known; a reader who has just seen
           the fixes and the manual checks is exactly the one deciding whether
           to repair the PDF or go back to the Word file. Still on every
           report, unchanged, never gated. -->
      <slot name="notice" />

      <CategoryBars :categories="displayedCategories" class="mb-6" />

      <!-- The report's findings regrouped under the Matterhorn Protocol's 31
           checkpoints (v1.93.0). Collapsed by default; self-hides for
           non-PDF reports. Purely a re-presentation of evidence above —
           never a second score. -->
      <MatterhornReportPanel :result="result" class="mb-6" />

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
import ActionPlan from "~/components/ActionPlan.vue";
import TwoStandardsStrip from "~/components/TwoStandardsStrip.vue";
import DocumentMetadataCard from "~/components/DocumentMetadataCard.vue";
import PrintPlanButton from "~/components/PrintPlanButton.vue";
import CategoryBars from "~/components/CategoryBars.vue";
import MatterhornReportPanel from "~/components/MatterhornReportPanel.vue";
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

const planSteps = computed(() =>
  buildActionPlan(
    displayedCategories.value,
    props.result.fileType,
    props.result.pdfMetadata?.creator,
  ),
);

// For the hero's automation-limit band. Array.isArray, not ?.length: on the
// shared page `result` is raw stored JSON, and a forged conformance block
// could carry a non-array notAssessed. null = unknown, never a claimed zero.
const notAssessedCount = computed(() => {
  const list = props.result.conformance?.notAssessed;
  return Array.isArray(list) ? list.length : null;
});

function revealEvidence(categoryId: string): void {
  techOpen.value = true;
  nextTick(() => {
    // May legitimately be absent (malformed/legacy reports) — every access
    // below is optional-chained so a missing target is a silent no-op, not
    // a throw.
    const target = document.getElementById(`cat-${categoryId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Move DOM focus too, not just the viewport: without this, a keyboard/
    // screen-reader user's focus stays on the button they just left, and
    // their next Tab continues from there instead of from the card the
    // scroll just sent them to (the card is tabindex="-1" in
    // ReportContent.vue for exactly this purpose). preventScroll avoids
    // fighting the smooth scrollIntoView above with the browser's own
    // default (instant) focus-scroll.
    target?.focus({ preventScroll: true });
  });
}
</script>

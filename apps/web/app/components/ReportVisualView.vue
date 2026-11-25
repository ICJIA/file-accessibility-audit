<template>
  <!-- Report layout "verdict first" (2026-11-25, chosen by the user from two
       reworked samples). The page answers, in this order:

         1. Can I publish this?      the grade block and the verdict headline
         2. What counts, what doesn't  the one verdict strip; the limit of
                                     automated checking
         3. What do I fix?           the plan, with the scorecard beside it
         4. What must a person check? the by-hand section
         5. What else is here?       reference material, folded

       The view is a size container: given a wide column the hero and the
       plan sit in two columns; in a narrow one the same elements stack in
       this same order, so the Tab order is the order on screen at every
       width. Every element the report had is still here with the same props;
       only where each one sits has changed. -->
  <div class="@container">
    <!-- 1 · The answer -->
    <div class="@5xl:grid @5xl:grid-cols-12 @5xl:gap-x-12 mb-10">
      <ReportGradeHero
        part="block"
        :grade="displayedGrade"
        :overall-score="displayedScore"
        :categories="displayedCategories"
        :conformance="result.conformance"
        :not-assessed-count="notAssessedCount"
        :file-type="result.fileType"
        :wcag-version="wcag.version"
        class="mb-6 @5xl:mb-0 @5xl:col-span-4"
      />
      <div class="@5xl:col-span-8 min-w-0 flex flex-col justify-between gap-8">
        <div>
          <!-- The file this report is about: the hosting page passes its
               filename banner here, in its compact form. -->
          <div class="mb-4"><slot name="banner" /></div>
          <ReportGradeHero
            part="verdict"
            :grade="displayedGrade"
            :overall-score="displayedScore"
            :categories="displayedCategories"
            :conformance="result.conformance"
            :not-assessed-count="notAssessedCount"
            :file-type="result.fileType"
            :plain-rest="plainVerdict"
          />
          <!-- When the verdict line above already counts the fixes, this is
               not repeated. -->
          <p
            v-if="hasCategories && planSteps.length && !plainVerdict"
            data-testid="hero-fix-count"
            class="mt-3 text-lg font-semibold text-[var(--text-secondary)]"
          >
            {{ planSteps.length }} {{ planSteps.length === 1 ? "fix" : "fixes" }} in the plan below.
          </p>
        </div>
        <SeverityTiles v-if="hasCategories" :categories="displayedCategories" class="max-w-xl" />
        <div class="flex flex-wrap items-center gap-3">
          <!-- Straight to the work. data-export-exclude: a jump link has no
               place in a downloaded report. -->
          <a
            v-if="hasCategories && planSteps.length"
            href="#action-plan"
            class="pk-btn pk-btn-brand"
            style="text-decoration: none"
            data-export-exclude
            >See the {{ planSteps.length === 1 ? "fix" : `${planSteps.length} fixes` }}
            <span aria-hidden="true" class="ml-1">↓</span></a
          >
          <!-- The host's controls: the view switch and, on the results page,
               Reset and Export. -->
          <slot name="actions" />
        </div>
      </div>
    </div>

    <!-- 2 · What the grade counts, and what it cannot check — side by side,
         directly under the answer. The strip is the ONE verdict (which
         rulebook produced the grade; PDF/UA reported, not scored). Gated like
         the plan and tiles: a page-audit row (no categories[]) must not get a
         legal-verdict box the axe results could contradict. -->
    <div v-if="hasCategories" class="mb-12 @5xl:mb-20">
      <div class="grid gap-1 @5xl:grid-cols-5">
        <TwoStandardsStrip
          :conformance="result.conformance"
          :wcag-version="wcag.version"
          :file-type="result.fileType"
          :pdf-ua-verdict="result.pdfUaVerdict"
          :analyzed-at="analyzedAt"
          class="@5xl:col-span-3"
        />
        <!-- The limit of automated checking, said beside the verdict so the
           grade is never read without it. The full explanation and the list
           are in section 4. -->
        <div
          data-testid="automation-limit-pointer"
          class="@5xl:col-span-2 border-l-4 border-amber-500 bg-amber-500/10 p-5 sm:p-6"
        >
          <p class="pk-label text-[var(--status-warning-yellow)] mb-2">What it cannot check</p>
          <p class="text-base text-[var(--text-primary)] leading-relaxed">
            This tool checks a subset — a human has to check the rest.
            <template v-if="notAssessedCount">
              {{ notAssessedCount }} WCAG
              {{ notAssessedCount === 1 ? "criterion was" : "criteria were" }} not machine-checked
              on this document.
            </template>
            <a
              href="#by-hand"
              class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >What to check by hand</a
            >
          </p>
        </div>
      </div>
      <!-- The one sentence that ties the counts on this page together: the
           fixes (the unit used everywhere else) to the criteria and categories
           the verdict strip names. -->
      <p
        v-if="countsLine"
        data-testid="counts-line"
        class="mt-4 text-base text-[var(--text-secondary)]"
      >
        {{ countsLine }}
      </p>
    </div>

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

    <!-- 3 · The work: the plan in the wide column, the scorecard beside it -->
    <div
      v-if="hasCategories"
      class="@5xl:grid @5xl:grid-cols-12 @5xl:gap-x-16 @5xl:items-start mb-12 @5xl:mb-20"
    >
      <div class="@5xl:col-span-8 min-w-0">
        <!-- The steps only, every one closed (user decision 2026-11-25: the
             list reads more clearly as a list); "Show how" opens a step. Best
             practices and veraPDF's verdict — the rest of this component —
             are in section 5. -->
        <ActionPlan
          part="steps"
          start-collapsed
          :steps="planSteps"
          :conformance="result.conformance"
          :pdf-ua-verdict="result.pdfUaVerdict"
          :categories="displayedCategories"
          :result="result"
          :analyzed-at="analyzedAt"
          class="mb-6"
          @show-evidence="revealEvidence"
        />

        <!-- Directly under the plan: the moment someone has read the fixes is
             the moment they go and do them, away from this tab. -->
        <PrintPlanButton :result="result" :analyzed-at="analyzedAt" class="mb-6" />
      </div>
      <div class="@5xl:col-span-4 min-w-0 mt-12 @5xl:mt-0">
        <!-- Where the points went: problems first, each linked to its fix,
             and under it the meter that explains the number. -->
        <CategoryBars :categories="displayedCategories" :step-ranks="stepRanks" class="mb-8" />
        <ReportGradeHero
          part="progress"
          :grade="displayedGrade"
          :overall-score="displayedScore"
          :categories="displayedCategories"
          :conformance="result.conformance"
          :not-assessed-count="notAssessedCount"
          :file-type="result.fileType"
        />
      </div>
    </div>

    <!-- The host's next-step panel (on the results page, the optional
         automatic repair). Full width: it holds a form. -->
    <div v-if="hasCategories && $slots.cta" class="mb-12 @5xl:mb-20">
      <slot name="cta" />
    </div>

    <!-- 4 · What a person still has to do: one section, set apart in amber.
         The manual checks beside the explanation of why they exist. -->
    <div
      id="by-hand"
      class="scroll-mt-6 border-l-4 border-amber-500 bg-amber-500/5 p-4 sm:p-8 mb-12 @5xl:mb-20"
    >
      <div class="@5xl:grid @5xl:grid-cols-12 @5xl:gap-x-10 @5xl:items-start">
        <ManualReviewCard
          v-if="hasCategories"
          :categories="displayedCategories"
          :conformance="result.conformance"
          :file-type="result.fileType"
          :wcag-verdict="result.wcagVerdict"
          class="@5xl:col-span-7 mb-6 @5xl:mb-0"
        />
        <ReportGradeHero
          part="band"
          :grade="displayedGrade"
          :overall-score="displayedScore"
          :categories="displayedCategories"
          :conformance="result.conformance"
          :not-assessed-count="notAssessedCount"
          :file-type="result.fileType"
          :class="hasCategories ? '@5xl:col-span-5' : '@5xl:col-span-12'"
        />
      </div>
    </div>

    <!-- A report with no categories[] has no plan and no bars; it still gets
         the progress meter. -->
    <ReportGradeHero
      v-if="!hasCategories"
      part="progress"
      :grade="displayedGrade"
      :overall-score="displayedScore"
      :categories="displayedCategories"
      :conformance="result.conformance"
      :not-assessed-count="notAssessedCount"
      :file-type="result.fileType"
      class="mb-12"
    />

    <template v-if="hasCategories">
      <!-- 5 · Reference: none of it changes the grade. Each item is folded
           behind a one-line row (native <details>, so it opens without
           script, in a downloaded report too, and prints open). -->
      <h2 class="pk-display text-3xl sm:text-4xl text-[var(--text-heading)]">
        More in this report
      </h2>
      <p class="mt-3 mb-6 text-base text-[var(--text-secondary)]">
        None of this changes the grade. Open what you need.
      </p>

      <details class="pk-more">
        <summary>
          <span class="pk-more-title">About this document</span>
          <span class="pk-more-hint">What made this file, and when</span>
        </summary>
        <DocumentMetadataCard :result="result" class="mb-6" />
      </details>

      <details v-if="$slots.notice" class="pk-more">
        <summary>
          <span class="pk-more-title">Fixing at the source</span>
          <span class="pk-more-hint">Why the original document is the better place to repair</span>
        </summary>
        <!-- "Fix it at the source" — strategy, not a step. Still on every
             report, unchanged, never gated. -->
        <div class="mb-6"><slot name="notice" /></div>
      </details>

      <details class="pk-more">
        <summary>
          <span class="pk-more-title">Best practices and independent checks</span>
          <span class="pk-more-hint">Reported, never scored</span>
        </summary>
        <ActionPlan
          part="extras"
          :steps="planSteps"
          :conformance="result.conformance"
          :pdf-ua-verdict="result.pdfUaVerdict"
          :categories="displayedCategories"
          :result="result"
          :analyzed-at="analyzedAt"
          class="mb-6"
        />
      </details>

      <!-- Both of these fold themselves: the Matterhorn regrouping (v1.93.0;
           self-hides for non-PDF reports; never a second score) and the full
           technical report. -->
      <MatterhornReportPanel :result="result" class="mt-6 mb-6" />

      <TechnicalReport
        v-model:open="techOpen"
        :result="result"
        :verapdf-url="verapdfUrl"
        :wcag-version="wcag.version"
        class="mb-10"
      />

      <!-- Before and after, where the page offers it. -->
      <div v-if="$slots.compare" class="bg-[var(--surface-card)] p-5 sm:p-7 mb-1">
        <slot name="compare" />
      </div>
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
import { buildActionPlan, publicationVerdict } from "~/utils/actionPlan";
import { failingCategoryIds } from "~/utils/publicationStatus";
import { categoriesForScoringMode } from "~/utils/scoringProfiles";
import { useWcag } from "~/composables/useWcag";
import type { CategoryResult } from "@file-audit/shared";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard downstream.
  // (@typescript-eslint/no-explicit-any is off repo-wide — see eslint.config.mjs.)
  result: Record<string, any>;
  verapdfUrl?: string;
  /** The shared row's createdAt on /report/[id]; absent for a live analysis. */
  analyzedAt?: string | null;
}>();

const wcag = useWcag();
// One count, in one unit. The page speaks in FIXES — the steps of the plan —
// so the verdict line does too. A fix is "needed" when its category produced
// a failing WCAG 2.1 criterion; any other step in the plan is recommended.
const requiredFixes = computed(() => {
  const failing = failingCategoryIds(props.result.conformance);
  return planSteps.value.filter((st) => failing.has(st.categoryId)).length;
});
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** What stands between this file and publication, in plain words. Only when
 *  something blocks publication; otherwise the verdict sentence stands as it
 *  is. The grade measures WCAG 2.1 A/AA, as the verdict itself says. */
const plainVerdict = computed<string | null>(() => {
  if (!hasCategories.value) return null;
  const tone = publicationVerdict(displayedCategories.value, props.result.conformance).tone;
  const total = planSteps.value.length;
  if (tone !== "critical" || total === 0) return null;
  const needed = requiredFixes.value;
  if (needed === 0) return `${plural(total, "fix", "fixes")} needed before publishing.`;
  const more = total - needed;
  return (
    `${plural(needed, "fix", "fixes")} needed to meet WCAG 2.1 A/AA.` +
    (more > 0 ? ` ${more} more recommended.` : "")
  );
});
/** "These 4 fixes cover 3 failing WCAG 2.1 criteria in 4 categories." */
const countsLine = computed<string | null>(() => {
  const needed = requiredFixes.value;
  const failures: unknown = props.result.conformance?.failures;
  if (!needed || !Array.isArray(failures)) return null;
  const criteria = new Set(
    failures.map((f) => (f as { sc?: unknown })?.sc).filter((sc) => typeof sc === "string"),
  ).size;
  const cats = failingCategoryIds(props.result.conformance).size;
  if (!criteria || !cats) return null;
  return (
    `${needed === 1 ? "This fix covers" : `These ${needed} fixes cover`} ` +
    `${plural(criteria, "failing WCAG 2.1 criterion", "failing WCAG 2.1 criteria")} ` +
    `in ${plural(cats, "category", "categories")}.`
  );
});
// Category id → its step's number in the plan, so each bar can point at its fix.
const stepRanks = computed<Record<string, number>>(() =>
  Object.fromEntries(planSteps.value.map((st) => [st.categoryId, st.rank])),
);
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
    props.result.conformance,
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
    // "Reduce motion" means jump, not glide.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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

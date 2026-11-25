<template>
  <!-- Plakat hero. The grade stands in the brand block: label at the head,
       the letter at poster scale, the score at the foot — white on the brand
       blue (5.7:1) in both themes.

       `part` lets the Visual view place the three pieces of this component
       where its layout needs them — the block, the verdict lines, and the
       two explanatory panels — while every piece keeps the same props and
       the same computed values. Without `part` it renders all three, in
       order, as it always has. -->
  <div class="text-center @5xl:text-left" :class="part === 'block' ? 'h-full' : ''">
    <div
      v-if="!part || part === 'block'"
      data-testid="grade-block"
      class="pk-block flex flex-col justify-between gap-4 text-left p-5 sm:p-7 min-h-[21rem] @5xl:min-h-[30rem]"
      :class="part === 'block' ? 'h-full' : ''"
    >
      <p class="pk-label flex justify-between gap-4">
        <span>Grade</span>
        <span v-if="wcagVersion">WCAG {{ wcagVersion }} A/AA</span>
      </p>
      <span
        class="block text-[clamp(12rem,42vw,17rem)] @5xl:text-[22rem] leading-[0.76] font-black tracking-tight -ml-[0.04em]"
        >{{ grade }}</span
      >
      <p class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span class="text-3xl sm:text-4xl font-black tracking-tight"
          >{{ overallScore }}<span class="text-xl sm:text-2xl font-bold">/100</span></span
        >
        <!-- The grade's own word, beside its number. Left out when something
             blocks publication: "Excellent" beside "Not ready to publish" is
             the contradiction the verdict line was rewritten to avoid. -->
        <span
          v-if="adjective"
          data-testid="grade-adjective"
          class="text-lg sm:text-xl font-black tracking-tight"
          >{{ adjective }}</span
        >
      </p>
    </div>
    <template v-if="!part || part === 'verdict'">
      <!-- The answer to "can I publish this?" — the largest words in the
           hero. The verdict is one sentence; its lead clause is set as the
           headline and the rest directly under it. The dash between them is
           kept for assistive technology and for anything reading the text. -->
      <p
        data-testid="grade-label"
        :class="part === 'verdict' ? '' : 'mt-4'"
        :style="{ color: labelColor }"
      >
        <span
          class="block font-black tracking-tight"
          :class="
            part === 'verdict'
              ? 'text-[clamp(2.5rem,6vw,5.25rem)] leading-[0.94]'
              : 'text-xl sm:text-2xl leading-tight'
          "
          >{{ labelHead }}</span
        ><template v-if="plainRest"
          ><span class="sr-only">. </span
          ><span
            data-testid="grade-plain"
            class="block mt-4 text-xl sm:text-2xl leading-snug font-bold tracking-tight text-[var(--text-heading)]"
            >{{ plainRest }}</span
          ></template
        ><template v-else-if="labelRest"
          ><span class="sr-only"> — </span
          ><span
            class="block font-bold tracking-tight text-[var(--text-heading)]"
            :class="part === 'verdict' ? 'mt-4 text-xl sm:text-2xl leading-snug' : 'text-base'"
            >{{ labelRest }}</span
          ></template
        >
      </p>
      <!-- What this format's grade covers (user decision 2026-11-18): the same
         content can grade differently by format, so say why beside the letter. -->
      <p
        v-if="scopeNote"
        data-testid="format-scope-note"
        class="mt-2 @5xl:mt-3 mx-auto @5xl:mx-0 max-w-xl text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
      >
        {{ scopeNote }}
      </p>
    </template>

    <template v-if="!part || part === 'details' || part === 'band' || part === 'progress'">
      <!-- Directly under the verdict, BEFORE the fix-progress meter (v1.74.1):
         non-technical managers stopped reading at "ready to publish", so the
         warning now interrupts the celebration rather than trailing it.
         Ungated since v1.102.0 — every grade gets the full subset band. -->
      <AutomationLimitBand
        v-if="part !== 'progress'"
        id="automation-limit"
        :not-assessed-count="notAssessedCount"
        :link-manual-review="hasCategories"
        class="mx-auto @5xl:mx-0 max-w-2xl @5xl:max-w-none scroll-mt-6"
        :class="part === 'details' || part === 'band' ? '' : 'mt-5'"
      />

      <!-- Score and letter are a matched pair again: the score is capped by the
         worst finding and the letter is derived from it through the published
         scale, so 69 is a D and always will be. v1.58.0 capped the LETTER
         instead and produced "D" above "80/100", which readers correctly
         called wrong. What the panel now has to explain is not the letter but
         the NUMBER — why it stalls below the raw average until a blocking
         finding is fixed. -->
      <div
        v-if="part !== 'band'"
        :class="part === 'progress' ? '' : 'mt-5'"
        class="mx-auto @5xl:mx-0 max-w-md @5xl:max-w-none rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-5 py-4 text-left"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Fix progress
          </span>
          <span
            class="text-sm font-semibold text-[var(--text-heading)] text-right"
            data-testid="fix-progress-count"
          >
            {{ progress.headline }}
          </span>
        </div>
        <div
          class="mt-2 h-2 rounded-full bg-[var(--surface-deep)] overflow-hidden"
          aria-hidden="true"
        >
          <div class="h-full rounded-full bg-sky-500/70" :style="{ width: `${barWidth}%` }" />
        </div>
        <!-- The checks the count above leaves out, said outright: it used to
           fold "did not apply" into "passed", which made the sentence
           disagree with the chart of scored bars further down. -->
        <p
          v-if="progress.others"
          data-testid="fix-progress-others"
          class="mt-2 text-xs text-[var(--text-muted)] leading-relaxed"
        >
          {{ progress.others }}
        </p>
        <p class="mt-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          {{ progressNote }}
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";
import { computed } from "vue";
import { scoreCapReason } from "@file-audit/shared";
import AutomationLimitBand from "~/components/AutomationLimitBand.vue";
import { formatScopeNote } from "~/utils/formatScope";
import { fixProgress } from "~/utils/fixProgress";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { gradeColor, severityColor } = useTokenColors();
import { gradeLabel } from "~/utils/exportFormats/shared";
import { publicationVerdict } from "~/utils/actionPlan";
import { allChecksPassedCaveat, publicationStatus } from "~/utils/publicationStatus";

const props = defineProps<{
  grade: string;
  overallScore: number;
  categories: Array<{ severity?: string | null; score?: number | null; notAssessed?: boolean }>;
  /** The report's conformance verdict — a confirmed WCAG 2.1 failure blocks
   *  "ready to publish" whatever the severities say. Raw stored JSON on the
   *  shared page; absent on reports older than the gate. */
  conformance?: unknown;
  /** Count of WCAG criteria the audit never machine-checked, for the
   *  automation-limit band. null/absent = unknown, the band omits the claim. */
  notAssessedCount?: number | null;
  /** The document's format, for the format-scope note under the label. */
  fileType?: string | null;
  /** Render one piece only — see the template note. Absent = all of it. */
  part?: "block" | "verdict" | "details" | "band" | "progress";
  /** The Visual view's plain statement of what stands between this file and
   *  publication, counted in fixes — the same unit the plan below uses.
   *  When given, it is shown in place of the verdict sentence's second
   *  clause ("4 WCAG 2.1 requirements not met"); the headline is unchanged. */
  plainRest?: string | null;
  /** The WCAG version the grade measures, shown at the head of the block. */
  wcagVersion?: string | null;
}>();

const scopeNote = computed(() =>
  Array.isArray(props.categories) && props.categories.length > 0
    ? formatScopeNote(props.fileType)
    : null,
);

const color = computed(() => gradeColor(props.grade));

const hasCategories = computed(
  () => Array.isArray(props.categories) && props.categories.length > 0,
);

// No categories (URL page-audit reports stored in the same table) → the grade
// adjective alone; a publication clause would claim document-level knowledge
// we don't have for those.
const verdict = computed(() => publicationVerdict(props.categories, props.conformance));

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

// The grade's adjective at the foot of the block — see the template note.
const adjective = computed(() =>
  hasCategories.value && verdict.value.tone === "critical" ? null : gradeLabel(props.grade),
);
// The verdict sentence, split at its dash for display: "Not ready to publish"
// as the headline, "4 WCAG 2.1 requirements not met" under it.
const labelHead = computed(() => label.value.split(" — ")[0] ?? label.value);
const labelRest = computed(() => label.value.split(" — ").slice(1).join(" — "));
// A blocking verdict must never render in reassuring grade-green.
const labelColor = computed(() =>
  hasCategories.value && verdict.value.tone === "critical"
    ? severityColor("Critical")
    : color.value,
);

// Plain counts, not a percentage — a second figure out of 100 next to the
// score would be one more thing to mistake for the grade.
//
// The sentence says exactly what it counts (utils/fixProgress.ts): scored
// checks that passed, out of scored checks — the same bars the chart below
// shows. A check that does not apply is not held against the document (no
// tables means no table problem), and is NAMED as not applying rather than
// counted as passed; one that could not be assessed is named separately and
// never assumed good.
const progress = computed(() => fixProgress(props.categories));
const barWidth = computed(() => progress.value.barPercent);

// Explains the NUMBER, not the letter. A reader watching the score stall
// needs to know one finding is holding it there — not that the checks stopped
// improving. When nothing is capped there is nothing to explain.
const progressNote = computed(() => {
  const reason = scoreCapReason(props.overallScore, props.categories);
  if (!reason) {
    // "Fix the steps below" is wrong on a document with no steps — which is
    // exactly the report an author is most likely to read closely.
    if (progress.value.nothingFailed) {
      // Every category at 100 is not "every check passed" when the WCAG gate
      // failed something or reached no verdict.
      return (
        allChecksPassedCaveat(publicationStatus(props.categories, props.conformance)) ??
        "Every automated check passed. See what still needs a human below."
      );
    }
    return "Fix the steps below and re-upload to watch this rise.";
  }
  const n = progress.value.failed;
  return (
    `${n === 1 ? "The one check that didn't pass is" : `${n} checks did not pass; the most serious is`} ` +
    `${reason.severity.toLowerCase()}, which holds the score at ${reason.cappedScore} — ` +
    `a ${reason.severity.toLowerCase()} issue caps a document at ${reason.cappedGrade} until it is fixed.`
  );
});
</script>

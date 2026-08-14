<template>
  <!-- The unmissable version of the truth the ManualReviewCard states in
       prose further down the page: a score — even 100 — is the AUTOMATED half
       of accessibility, not a guarantee the document works in a screen
       reader. It sits directly under the score in both heroes, because the
       high score is exactly the moment a reader closes the tab satisfied —
       and ONLY under scores that look done (grade over a 79: A and B, gated
       by shouldShowAutomationLimit below). A C/D/F report already leads with
       work to do; the ManualReviewCard covers the human half there.

       Hard rule (v1.58.1, gradeCapNote.test.ts): no figure that could be
       read as the grade — no percentages, nothing out of 100. The only
       number here is a plain count of never-checked criteria.

       The right half's dashed border is the state, not decoration: work that
       is permanently open, next to the solid "done" half. Words carry both
       states too ("Done" / "Always still required") — never color alone. -->
  <section
    v-if="shouldShowAutomationLimit(grade)"
    data-testid="automation-limit"
    class="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4 sm:p-5 text-left"
    aria-labelledby="automation-limit-h"
  >
    <p
      id="automation-limit-h"
      class="text-base sm:text-lg font-bold text-[var(--text-heading)] flex items-start gap-2"
    >
      <span aria-hidden="true" class="text-amber-400 shrink-0">⚠</span>
      <span>Even a perfect score is not a guarantee</span>
    </p>
    <p class="text-xs sm:text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
      A high score means this document handles the signals automated tests can measure — it is in
      good shape. It does not mean the document is guaranteed to work with a screen reader.
      Accessibility is two half-jobs, and software can only ever finish the first:
    </p>

    <div class="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div class="rounded-lg border border-[var(--border-alt)] bg-[var(--surface-deep)] p-3.5">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Automated checks
        </p>
        <p class="text-sm font-semibold text-[var(--text-heading)] mt-1">
          <span aria-hidden="true" :style="{ color: 'var(--icon-pass)' }">✓</span>
          Done — this score
        </p>
        <p class="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
          Software measured what a machine can see: a title and language set, tags present, alt text
          present, table headers marked.
        </p>
      </div>
      <div class="rounded-lg border-2 border-dashed border-amber-500/50 p-3.5">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Human review
        </p>
        <p class="text-sm font-semibold text-[var(--text-heading)] mt-1">
          <span aria-hidden="true" class="text-amber-400">◯</span>
          Always still required
        </p>
        <p class="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
          Open the document with a screen reader — or hand it to someone who uses one. Confirm the
          alt text describes each image, headings match their sections, and the reading order makes
          sense. No tool can do this half.
        </p>
      </div>
    </div>

    <div class="mt-3 space-y-1">
      <p
        v-if="typeof notAssessedCount === 'number' && notAssessedCount > 0"
        class="text-xs text-[var(--text-secondary)] leading-relaxed"
      >
        {{ notAssessedCount }} WCAG criteri{{ notAssessedCount === 1 ? "on" : "a" }} on this
        document {{ notAssessedCount === 1 ? "was" : "were" }} never machine-checked at all.
      </p>
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
        <template v-if="linkManualReview"
          >Start the human half at
          <a
            href="#manual-review-h"
            class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >Still worth checking by hand</a
          >
          below.</template
        >
        <template v-else>Have a person confirm the human half before this document ships.</template>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { shouldShowAutomationLimit } from "~/utils/automationLimit";

withDefaults(
  defineProps<{
    /** The grade displayed beside this band. The band gates ITSELF on it
     *  (over a 79 — A and B, the grades that look done), so no mount can
     *  forget the threshold. Absent/junk grade = no band. */
    grade?: string | null;
    /** How many WCAG criteria the audit never machine-checked (from
     *  conformance.notAssessed). null = unknown (e.g. a forged or legacy
     *  shared report without a conformance block) — the band then makes no
     *  count claim rather than asserting a zero it cannot back. */
    notAssessedCount?: number | null;
    /** Render the in-page link to ManualReviewCard's heading. Off by default
     *  because the remediation page shows ScoreCards with no such card — an
     *  anchor there would jump nowhere. */
    linkManualReview?: boolean;
  }>(),
  { grade: null, notAssessedCount: null, linkManualReview: false },
);
</script>

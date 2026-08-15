<template>
  <!-- The unmissable version of the truth the ManualReviewCard states in
       prose further down the page: a score — even 100 — is the AUTOMATED half
       of accessibility, not a guarantee the document works in a screen
       reader. It sits directly under the score in both heroes, because the
       high score is exactly the moment a reader closes the tab satisfied.

       Two forms, composing two user rules. The FULL band renders only under
       scores that look done (grade over a 79: A and B, gated by
       shouldShowAutomationLimit) — a C/D/F report already leads with work to
       do. But "always remind, no matter the grade, that humans have to be in
       the loop": every other grade gets the compact one-line reminder below
       instead, so no score display is ever silent about the human half.

       Hard rule (v1.58.1, gradeCapNote.test.ts): no figure that could be
       read as the grade — no percentages, nothing out of 100. The only
       number here is a plain count of never-checked criteria.

       The right half's dashed border is the state, not decoration: work that
       is permanently open, next to the solid "done" half. Words carry both
       states too ("Done" / "Always still required") — never color alone. -->
  <section
    v-if="shouldShowAutomationLimit(grade)"
    data-testid="automation-limit"
    class="rounded-xl border border-amber-500/60 overflow-hidden text-left"
    aria-labelledby="automation-limit-h"
  >
    <!-- Solid amber, dark text: the loudest element on the page after the
         grade itself (v1.74.1). Non-technical managers stopped reading at
         the green verdict; a tinted panel below the fold of their attention
         wasn't enough. Filled amber-400 with black text holds ~10:1 in both
         themes. -->
    <p
      id="automation-limit-h"
      data-testid="automation-limit-head"
      class="bg-amber-400 text-black px-4 sm:px-5 py-2.5 text-sm sm:text-base font-extrabold flex items-center gap-2"
    >
      <span aria-hidden="true" class="shrink-0">⚠</span>
      <span>Even a high score is not a guarantee</span>
    </p>
    <div class="bg-amber-500/[0.06] p-4 sm:p-5">
      <p class="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
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
            Software measured what a machine can see: a title and language set, tags present, alt
            text present, table headers marked.
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
            alt text describes each image, headings match their sections, and the reading order
            makes sense. No tool can do this half.
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
          <template v-else
            >Have a person confirm the human half before this document ships.</template
          >
        </p>
      </div>
    </div>
  </section>

  <!-- Every grade that doesn't get the full band gets this line instead —
       humans stay in the loop at every score, including unknown or junk
       grades on forged shared reports. -->
  <p
    v-else
    data-testid="human-loop-reminder"
    class="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-4 py-2.5 text-left text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
  >
    <span aria-hidden="true" class="text-amber-400">⚠</span>
    Whatever the grade, automated checks are only part of the job — a person still has to review
    this document.<template v-if="linkManualReview">
      See
      <a
        href="#manual-review-h"
        class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >Still worth checking by hand</a
      >
      below.</template
    >
  </p>
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

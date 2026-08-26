<template>
  <!-- The always-on half of the automation-honesty pair: every report, every
       grade, both heroes (ReportGradeHero for the Visual view, ScoreCard for
       the Detailed view and the remediation before/after cards), directly
       under the score and ABOVE the fix-progress meter (v1.74.1: the
       reassuring parts must not be reachable without passing this).

       v1.102.0 (user request): the band no longer gates on grade. It used to
       show its full form only over a 79 — A/B, the grades that look done —
       with a one-line reminder everywhere else; the rule now is "something
       users always see, so they understand this tool checks a subset and the
       rest needs an actual human". One form, every grade, and the numbers
       come from published studies rather than folklore:

       - UK GDS 2017 (10 tools vs a page of 143 planted barriers): best tool
         41% counting manual-inspection prompts, 37% counting errors and
         warnings only; worst 17%; all ten combined still missed 42 barriers.
         https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/
       - Deque 2021 (the axe vendor's own study — the most optimistic
         published figure): 57% of issue VOLUME across ~2,000 audits.
         https://www.deque.com/automated-accessibility-coverage-report/
       - Adobe's Acrobat checker documentation: logical reading order and
         color contrast are listed as manual checks.
         https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html
       - Matterhorn (the PDF/UA test model this site runs): humanJudgment of
         failureConditions conditions need a person — read live from
         MATTERHORN_FACTS, so a protocol-data change updates this copy too.

       AMENDED HARD RULE (was v1.58.1: no percentages anywhere near the
       grade — see gradeCapNote.test.ts for the original lesson): the user's
       2026-08-26 request puts the coverage percentages front and center, so
       the band now carries them — but ONLY as paired coverage ranges and
       attributed study figures with "%" attached, inside this bordered card
       about TOOLS in general. Never a bare figure out of 100 that could
       shadow the grade. automationLimitBand.test.ts pins exactly which
       figures may appear and that no others do.

       The dashed border on the human half is the state, not decoration:
       permanently open work beside the solid "done" half. Words carry both
       states too ("Checked" / "Still open") — never color alone. -->
  <section
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
      <span>This tool checks a subset — a human has to check the rest</span>
    </p>
    <div class="bg-amber-500/[0.06] p-4 sm:p-5">
      <p class="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
        No automated checker can test more than part of accessibility — not this site, not Adobe
        Acrobat's checker, not PAC, not Word's. Independent tests put the machine-checkable share at
        roughly 30–40% of issues. The score above covers that part, done well — it still cannot tell
        you the document works in a screen reader.
      </p>

      <!-- The proportion, drawn. aria-hidden: the two labelled halves below
           are the accessible statement of the same fact. Widths are the
           study-backed rough shares of accessibility work in general — NOT a
           measurement of this document. -->
      <div class="mt-3.5 flex h-3 gap-1" aria-hidden="true">
        <div class="rounded-full bg-sky-500/70" style="width: 35%"></div>
        <div
          class="rounded-full border-2 border-dashed border-amber-500/60"
          style="width: 65%"
        ></div>
      </div>

      <div class="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div class="rounded-lg border border-[var(--border-alt)] bg-[var(--surface-deep)] p-3.5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Machine-checkable · roughly 30–40%
          </p>
          <p class="text-sm font-semibold text-[var(--text-heading)] mt-1">
            <span aria-hidden="true" :style="{ color: 'var(--icon-pass)' }">✓</span>
            Checked — this score
          </p>
          <p class="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            The yes/no rules software can test: tags exist, images carry alt text, a title and
            language are set, contrast clears the minimums, form fields are labelled.
          </p>
        </div>
        <div class="rounded-lg border-2 border-dashed border-amber-500/50 p-3.5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Human judgment · roughly 60–70%
          </p>
          <p class="text-sm font-semibold text-[var(--text-heading)] mt-1">
            <span aria-hidden="true" class="text-amber-400">◯</span>
            Still open — needs a person
          </p>
          <p class="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            The judgment calls no software can make: does the alt text actually describe the image,
            does the reading order make sense in a screen reader, do complex tables navigate
            sensibly, is the writing clear.
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
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
          If you have additional questions about file accessibility, contact your agency
          accessibility coordinator.
        </p>
        <p class="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Where the numbers come from: the
          <a
            href="https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-[var(--text-secondary)]"
            >UK government's ten-tool test</a
          >
          (best tool 41%, worst 17%),
          <a
            href="https://www.deque.com/automated-accessibility-coverage-report/"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-[var(--text-secondary)]"
            >Deque's own audit data</a
          >
          (57% of issue volume — the most optimistic figure on record), and
          <a
            href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-[var(--text-secondary)]"
            >Adobe's checker documentation</a
          >
          (reading order and contrast are manual checks). The Matterhorn test model this site runs
          on PDFs marks {{ MATTERHORN_FACTS.humanJudgment }} of its
          {{ MATTERHORN_FACTS.failureConditions }} failure conditions as needing human judgment.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { MATTERHORN_FACTS } from "~/data/matterhorn";

withDefaults(
  defineProps<{
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
  { notAssessedCount: null, linkManualReview: false },
);
</script>

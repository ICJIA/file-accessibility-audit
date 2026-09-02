<template>
  <!--
    Two rulebooks apply to a PDF and only one of them is the law. This strip
    says which is which, on EVERY report, before anyone scrolls.

    WHY (2026-08-29): the split shipped in v1.130.0 as labelled groups inside
    the category cards — correct, but invisible on any document that happens
    to have no unscored PDF/UA items, which is most of them. That buried the
    single most useful answer to the reasonable objection "you are grading our
    file against PDF/UA, and PDF/UA is not the law." Stating both verdicts up
    front makes the basis of the grade explicit whatever the document contains.

    Deliberately NOT a tab: a tab would hide half a reader's issues behind a
    click and imply they must pick a standard. Both verdicts, side by side,
    always.
  -->
  <div data-testid="two-standards-strip" class="space-y-2">
    <!-- THE LAW — what the grade measures. -->
    <!-- Deliberately dominant (user request 2026-08-29): a reviewer's first
         question is "just tell me the WCAG/IITAA failures" — everything else
         is information, not the compliance answer. So the legal verdict gets
         the full width, the larger type and the colour; PDF/UA sits beneath
         it in a quiet, dashed, muted box that reads as a footnote. -->
    <div
      class="rounded-xl border-2 px-5 py-4"
      :class="
        lawFailing
          ? 'border-[var(--status-error-red)]/50 bg-[var(--status-error-red)]/10'
          : 'border-[var(--status-ok-green)]/50 bg-[var(--status-ok-green)]/10'
      "
    >
      <p class="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
        Required by WCAG 2.1 · ADA Title II · Illinois IITAA
      </p>
      <p class="text-lg sm:text-xl font-bold text-[var(--text-heading)] mt-1 leading-snug">
        <span aria-hidden="true">{{ lawFailing ? "✕" : "✓" }}</span>
        {{ lawVerdict }}
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-1">
        <template v-if="currentEra">
          <strong class="font-semibold">This — and only this — is what your grade measures.</strong>
          {{ " " }}Nothing beyond WCAG 2.1 A/AA is counted — not the criteria WCAG 2.2 added, not
          PDF/UA.
        </template>
        <template v-else>
          <strong class="font-semibold"
            >This report predates the current scoring model ({{ legalOnlySince }}).</strong
          >
          {{ " " }}Its grade may include items today's reports list without counting — re-upload the
          document for a grade measured only against WCAG 2.1 A/AA.
        </template>
        <template v-if="lawFailing">
          {{ " " }}
          <a href="#action-plan" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >Go to the fixes</a
          >.
        </template>
        <template v-else-if="conformance?.notAssessed?.length">
          {{ " " }}{{ conformance.notAssessed.length }} criteria still need a quick manual review —
          see "Still worth checking by hand" below.
        </template>
      </p>
    </div>

    <!-- PDF/UA — reported, never scored. -->
    <div
      class="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-deep)] px-4 py-3"
    >
      <p class="text-xs text-[var(--text-muted)] leading-relaxed">
        <span class="font-semibold uppercase tracking-wide"
          >PDF/UA best practice — extra credit:</span
        >
        {{ " " }}<span class="text-[var(--text-secondary)]">{{ pdfUaVerdictLine }}</span
        >. The PDF industry's own standard (ISO 14289), checked by veraPDF. Where one of its rules
        overlaps WCAG 2.1, your grade already counts this tool's own check of that point; the PDF/UA
        verdict itself is extra credit.
        <strong class="font-semibold text-[var(--text-secondary)]"
          >Not counted in your score.</strong
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LEGAL_ONLY_SCORING_SINCE } from "@file-audit/shared";
import type { PdfUaVerdict } from "@file-audit/shared";
import { computed } from "vue";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  conformance?: ConformanceVerdict | null;
  wcagVersion: string;
  fileType?: string | null;
  pdfUaVerdict?: {
    available?: boolean;
    passed?: boolean;
    failures?: Array<{ count?: number }>;
    /** Whole-document totals — the stored failure list is truncated to the
     *  top 20 rules, so these are the numbers to display when present. */
    totalFailureCount?: number;
    distinctRuleCount?: number;
    /** Set when veraPDF started but could not finish (crash/timeout). */
    error?: string;
  } | null;
  /** veraPDF's WCAG-profile pass (wcagVerdict). Only consulted for the
   *  clean line: "No automated failures found" is true of THIS checker, and
   *  when the profile run beside it flagged WCAG items the line says so and
   *  points at the technical report (2026-09-02). Never a failure here. */
  wcagVerdict?: Partial<PdfUaVerdict> | null;
  /** The stored row's createdAt on /report/[id]; absent for a live analysis.
   *  Gates the "nothing beyond WCAG 2.1 is counted" claim: a payload
   *  analysed before the legal-only sweep carries deductions today's model
   *  reports without counting, and the absolute sentence was false over
   *  exactly those grades. */
  analyzedAt?: string | null;
}>();

// Live analyses (no analyzedAt) are always current-era. A stored date is
// compared as its ISO day; anything unparseable is treated as PRE-sweep —
// a forged or legacy payload must never earn the absolute claim.
const currentEra = computed(() => {
  const at = props.analyzedAt;
  if (at === undefined || at === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}/.test(at)) return false;
  return at.slice(0, 10) >= LEGAL_ONLY_SCORING_SINCE;
});

// Exposed for the era sentence in the template.
const legalOnlySince = LEGAL_ONLY_SCORING_SINCE;

const lawFailing = computed(() => props.conformance?.status === "fail");

const lawVerdict = computed(() => {
  const c = props.conformance;
  if (!c) return "Checked against the legal standard";
  if (c.status === "fail") {
    // DISTINCT criteria, not failure entries: 1.3.1 failing in headings AND
    // tables is one criterion twice, and a reader who counts the listed
    // criteria must land on this number (2026-09-01: "4 criteria failing"
    // over a list of three). Entries without an sc (forged/legacy payloads)
    // keep the entry count rather than fabricate a smaller number.
    const entries = c.failures.length;
    const scList = c.failures.map((f) => (f as { sc?: string }).sc).filter(Boolean);
    const n = scList.length === entries ? new Set(scList).size : entries;
    // One category can fail two criteria (a missing title AND a missing
    // language both live in Title & Language), and one criterion can fail in
    // two categories — so the criteria count can differ from the severity
    // tiles a reader just added up. Bridge the two numbers whenever they
    // differ (user report 2026-08-29: "4+1 = 5 … but this says 6").
    const catList = c.failures.map((f) => f.category).filter(Boolean);
    const cats = new Set(catList).size;
    // Bridge only when every failure carries a category (old stored reports
    // may not) — never let missing data fabricate a smaller-looking number.
    const bridge =
      catList.length === entries && cats !== n
        ? ` in ${cats} ${cats === 1 ? "category" : "categories"}`
        : "";
    return `${n} ${n === 1 ? "criterion" : "criteria"} failing${bridge}`;
  }
  const w = props.wcagVerdict;
  const veraItems =
    w?.available && !w.error
      ? typeof w.totalFailureCount === "number" && w.totalFailureCount > 0
        ? w.totalFailureCount
        : (w.failures ?? []).reduce((n, f) => n + (f.count ?? 1), 0)
      : 0;
  if (veraItems > 0) {
    return `No automated failures found by this checker — veraPDF's WCAG-profile pass flagged ${veraItems} ${veraItems === 1 ? "item" : "items"} to verify by hand (see the technical report)`;
  }
  return "No automated failures found";
});

/** Never overstates: silence from veraPDF is reported as not-checked, and a
 *  non-PDF is told plainly that the standard does not apply to it. */
const pdfUaVerdictLine = computed(() => {
  if (props.fileType && props.fileType !== "pdf") {
    return "Does not apply to this file type";
  }
  const v = props.pdfUaVerdict;
  if (!v?.available) return "Not checked on this document";
  if (v.passed) return "No PDF/UA failures found";
  // Whole-document totals when the verdict carries them — the stored
  // failure list is truncated to the top 20 rules, so summing it undercounts
  // busy documents. Fall back to summing for older stored payloads.
  const items =
    typeof v.totalFailureCount === "number" && v.totalFailureCount > 0
      ? v.totalFailureCount
      : (v.failures ?? []).reduce((n, f) => n + (f.count ?? 1), 0);
  const rules =
    typeof v.distinctRuleCount === "number" && v.distinctRuleCount > 0
      ? v.distinctRuleCount
      : (v.failures ?? []).length;
  // Every error path returns available:true, passed:false, failures:[] —
  // which used to render "0 items across 0 rules", a clean-looking line
  // beside the panel's own "Could not validate". A check that did not finish
  // is not a result.
  if (v.error || (items === 0 && rules === 0)) return "Could not be checked on this document";
  return `${items} ${items === 1 ? "item" : "items"} across ${rules} ${rules === 1 ? "rule" : "rules"}`;
});
</script>

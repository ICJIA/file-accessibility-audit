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
        <strong class="font-semibold">This — and only this — is what your grade measures.</strong>
        {{ " " }}Nothing beyond WCAG 2.1 A/AA is counted — not the criteria WCAG 2.2 added, not
        PDF/UA.
        <template v-if="lawFailing">
          {{ " " }}
          <a href="#action-plan" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >Go to the fixes</a
          >.
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
        >. The PDF industry's own standard (ISO 14289), checked by veraPDF — a best practice, not
        required by WCAG 2.1.
        <strong class="font-semibold text-[var(--text-secondary)]"
          >Not counted in your score.</strong
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  } | null;
}>();

const lawFailing = computed(() => props.conformance?.status === "fail");

const lawVerdict = computed(() => {
  const c = props.conformance;
  if (!c) return "Checked against the legal standard";
  if (c.status === "fail") {
    const n = c.failures.length;
    return `${n} ${n === 1 ? "criterion" : "criteria"} failing`;
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
  const items = (v.failures ?? []).reduce((n, f) => n + (f.count ?? 1), 0);
  const rules = (v.failures ?? []).length;
  return `${items} ${items === 1 ? "item" : "items"} across ${rules} ${rules === 1 ? "rule" : "rules"}`;
});
</script>

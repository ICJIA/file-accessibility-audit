<template>
  <div v-if="hasSomethingToPrint" class="w-full" data-export-exclude>
    <button
      type="button"
      data-testid="print-plan"
      class="group flex w-full items-center gap-4 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-4 text-left transition-colors cursor-pointer hover:border-emerald-400/70 hover:bg-emerald-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
      @click="openPlan"
    >
      <span
        class="shrink-0 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"
        aria-hidden="true"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 9V3h12v6" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" rx="1" />
        </svg>
      </span>
      <span class="min-w-0">
        <span class="block text-base font-bold text-[var(--text-heading)]">
          Printer-friendly action steps
        </span>
        <span class="mt-0.5 block text-sm text-[var(--text-secondary)] leading-snug">
          {{ blurb }}
        </span>
      </span>
      <span
        class="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wider text-emerald-300"
        aria-hidden="true"
        >Open ↗</span
      >
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { buildPrintablePlan, openPrintablePlan } from "~/utils/printablePlan";
import { manualChecks } from "~/utils/manualReview";
import { buildActionPlan, publicationVerdict } from "~/utils/actionPlan";
import { useWcag } from "~/composables/useWcag";

const wcag = useWcag();

// The workflow this tool serves is: drop a file, get a grade, get fixes. That
// last step meant keeping a browser tab open while working in Word or
// Acrobat. The fix steps are exactly the part someone needs NEXT TO the
// document rather than behind it — so they get a page to print, save as PDF,
// or hand to whoever actually edits the file.
//
// Big and unmissable on purpose: the small right-aligned view toggle taught us
// that a control non-technical readers need cannot be a hint.
const props = defineProps<{
  result: {
    filename?: string;
    grade?: string | null;
    overallScore?: number | null;
    fileType?: string | null;
    categories?: Array<{
      id?: string;
      label?: string;
      score?: number | null;
      severity?: string | null;
    }>;
    conformance?: {
      notAssessed?: Array<{ sc: string; name: string; level: string; url?: string }>;
    } | null;
  } | null;
  /** Overrides for the remediation page, which is printing a different thing:
   *  what is STILL wrong after the automatic fixes ran. */
  heading?: string;
  intro?: string;
  /** Print the source URL in the header. Off for remediation: that job page
   *  expires, and it is not somewhere the reader should return to — the file
   *  has already been remediated, and the page cannot show the original
   *  audit either. A dead link on a printout is worse than no link. */
  showUrl?: boolean;
}>();

const categories = computed(() => props.result?.categories ?? []);
const steps = computed(() =>
  buildActionPlan(categories.value, props.result?.fileType, props.result?.pdfMetadata?.creator),
);
const checks = computed(() => manualChecks(categories.value));
const notAssessed = computed(() => props.result?.conformance?.notAssessed ?? []);

// Nothing to print for a page-audit row that carries no categories at all.
const hasSomethingToPrint = computed(
  () => steps.value.length > 0 || checks.value.length > 0 || notAssessed.value.length > 0,
);

const blurb = computed(() => {
  const n = steps.value.length;
  if (n === 0)
    return "Opens in a new tab: the checks a person still needs to make. Print or save as PDF.";
  return (
    `Opens in a new tab: ${n} fix${n === 1 ? "" : "es"} with step-by-step instructions for both the ` +
    `source document and Acrobat, plus the checks only a person can make. Print or save as PDF.`
  );
});

function openPlan(): void {
  openPrintablePlan(
    buildPrintablePlan({
      filename: props.result?.filename || "document",
      grade: props.result?.grade ?? null,
      score: props.result?.overallScore ?? null,
      verdict: categories.value.length ? publicationVerdict(categories.value).text : null,
      steps: steps.value,
      manualChecks: checks.value,
      notAssessed: notAssessed.value,
      reportUrl:
        props.showUrl !== false && typeof window !== "undefined" ? window.location.href : null,
      heading: props.heading,
      intro: props.intro,
      // Real links to the W3C rules: clickable in the tab, and the print
      // stylesheet writes each address out in full for typing from paper.
      understandingUrl: wcag.understandingUrl,
      wcagQuickref: wcag.quickref,
      wcagLabel: wcag.label,
    }),
  );
}
</script>

<template>
  <div class="text-center space-y-4">
    <p v-if="showFilename" class="text-sm text-[var(--text-muted)]">
      {{ result.filename }} — {{ result.pageCount }} page{{
        result.pageCount !== 1 ? "s" : ""
      }}
    </p>

    <!-- Grade circle -->
    <div class="flex justify-center">
      <div
        class="w-28 h-28 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: gradeColor, backgroundColor: gradeColor + '15' }"
      >
        <span
          class="text-5xl sm:text-7xl font-black"
          :style="{ color: gradeColor }"
        >
          {{ displayedProfile.grade }}
        </span>
      </div>
    </div>

    <!-- Score -->
    <p class="text-3xl font-bold">
      {{ displayedProfile.overallScore
      }}<span class="text-lg text-[var(--text-secondary)]">/100</span>
    </p>

    <!-- Label -->
    <p class="text-sm font-medium" :style="{ color: gradeColor }">
      {{ gradeLabel }}
    </p>

    <!-- WCAG conformance verdict — deliberately independent of the score
         above. Colour follows the grade (green for A/B, red for C/D/F) so a
         strong file is not alarmed by a single flagged criterion, while the
         panel still lists every finding. See the conformance computeds below. -->
    <div
      v-if="conformance"
      data-testid="conformance-gate"
      class="max-w-lg mx-auto mt-5 rounded-lg border px-5 py-4 text-left"
      :style="{
        borderColor: conformanceStyle.border,
        backgroundColor: conformanceStyle.background,
      }"
    >
      <p
        class="text-sm font-semibold flex items-start gap-2"
        :style="{ color: conformanceStyle.heading }"
      >
        <span aria-hidden="true">{{ conformanceStyle.icon }}</span>
        <span>{{ conformanceHeading }}</span>
      </p>
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
        {{ conformanceBody }}
      </p>
      <ul
        v-if="conformance.failures.length"
        class="mt-3 space-y-1.5 list-none pl-0"
      >
        <li
          v-for="(f, i) in conformance.failures"
          :key="i"
          class="text-xs text-[var(--text-secondary)] leading-relaxed"
        >
          <a
            :href="safeHttpUrl(f.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ f.sc }} {{ f.name }}</a
          ><span class="text-[var(--text-muted)]"> (Level {{ f.level }})</span>
          — {{ f.issue }}
        </li>
      </ul>
      <p
        v-if="conformance.notAssessed.length"
        class="text-xs text-[var(--text-muted)] leading-relaxed mt-3"
      >
        Not evaluated automatically:
        <template
          v-for="(n, i) in conformance.notAssessed"
          :key="n.sc"
          ><a
            :href="safeHttpUrl(n.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ n.sc }} {{ n.name }}</a
          ><template v-if="i < conformance.notAssessed.length - 1"
            >, </template
          ></template
        >. These still require manual review.
      </p>
      <p
        class="text-xs text-[var(--text-muted)] leading-relaxed mt-3 pt-3 border-t"
        :style="{ borderColor: 'var(--border-alt)' }"
      >
        This audit checks documents against
        <a
          :href="wcag.quickref"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
          >{{ wcag.label }}</a
        >
        — the accessibility standard adopted by the
        <a
          href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
          target="_blank"
          rel="noopener noreferrer"
          class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
          >Illinois Information Technology Accessibility Act (IITAA)</a
        >
        and the U.S. Department of Justice's
        <a
          href="https://www.ada.gov/resources/title-ii-rule/"
          target="_blank"
          rel="noopener noreferrer"
          class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
          >ADA Title II rule</a
        >
        for state and local government.
      </p>
    </div>

    <!-- PDF/UA-1 conformance signals — paired with the WCAG verdict above.
         Signals only, not a verdict; the card points to PAC / veraPDF for the
         formal PDF/UA-1 (ISO 14289-1) conformance test. -->
    <PdfUaSignalsCard
      v-if="result.pdfUa"
      :signals="result.pdfUa"
      class="max-w-2xl mx-auto mt-5"
    />

    <!-- Verdict explanation (counts) -->
    <p
      v-if="verdictExplanation"
      data-testid="verdict-explanation"
      class="text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed"
      v-html="verdictExplanation"
    />

    <!-- Summary -->
    <p
      class="text-sm text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed"
      v-html="highlightedSummary"
    />

    <!-- Caveat -->
    <div
      class="max-w-lg mx-auto mt-5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border-alt)] px-5 py-4"
    >
      <p
        v-if="sourceApp"
        class="text-xs text-[var(--text-secondary)] leading-relaxed"
      >
        This automated audit provides a reliable initial assessment, but it
        cannot catch every issue. For the most thorough evaluation, run
        {{ sourceApp }}'s built-in
        <a
          href="https://support.microsoft.com/en-us/office/improve-accessibility-with-the-accessibility-checker-a16f6de0-2f39-4a2b-8bd8-5ad801426c7f"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >Accessibility Checker (Review → Check Accessibility)</a
        >. Because this {{ sourceApp }} file is the source document, fixing
        issues here corrects them at the root — and any PDF you export from it
        inherits the fixes automatically.
      </p>
      <p v-else class="text-xs text-[var(--text-secondary)] leading-relaxed">
        This automated audit provides a reliable initial assessment, but it
        cannot catch every issue. For the most thorough evaluation, test your
        PDF directly in
        <a
          href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >Adobe Acrobat's Accessibility Checker</a
        >. Whenever possible, ensure your source document (Word, InDesign, etc.)
        is accessible before generating the PDF — retrofitting accessibility
        after export is more difficult and less reliable.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  categoriesForScoringMode,
  type ScoreProfile,
  type ScoringMode,
} from "~/utils/scoringProfiles";
import { escapeHtml } from "~/utils/escapeHtml";
import { GRADE_THRESHOLDS, safeHttpUrl } from "@file-audit/shared";
import PdfUaSignalsCard from "~/components/PdfUaSignalsCard.vue";

const wcag = useWcag();

interface Category {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  findings?: string[];
}

interface ConformanceFinding {
  sc: string;
  name: string;
  level: "A" | "AA";
  category: string;
  issue: string;
  url: string;
}

interface ConformanceVerdict {
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  notAssessed: {
    sc: string;
    name: string;
    level: "A" | "AA";
    reason: string;
    url: string;
  }[];
  headline: string;
}

interface PdfUaSignals {
  hasIdentifier: boolean;
  part: string | null;
  isTagged: boolean;
  isMarkedContent: boolean;
  artifactRunCount: number;
  structTreeDepth: number;
  fontCount: number;
  embeddedFontCount: number;
  allFontsEmbedded: boolean;
  hasLanguage: boolean;
  hasTitle: boolean;
}

const props = withDefaults(
  defineProps<{
    result: {
      filename: string;
      pageCount: number;
      overallScore: number;
      grade: string;
      executiveSummary: string;
      categories?: Category[];
      scoreProfiles?: Partial<Record<ScoringMode, ScoreProfile>>;
      conformance?: ConformanceVerdict;
      pdfUa?: PdfUaSignals;
      fileType?: "pdf" | "docx" | "pptx" | "xlsx";
    };
    // The prominent ReportFileBanner now carries the filename above the card on
    // the live + shared report pages, which pass showFilename: false to avoid
    // duplicating it. Defaults true so other callers (e.g. the remediation
    // before/after cards) keep showing the filename line unchanged.
    showFilename?: boolean;
  }>(),
  { showFilename: true },
);

/**
 * "Word" | "PowerPoint" | "Excel" when the audited file is an editable Office
 * source document; null for PDF and for unknown stored fileType strings (the
 * public /report/:id page renders caller-controlled JSON, so unknown values
 * must fall back to the PDF framing, matching the old isDocx behavior).
 */
const sourceApp = computed<string | null>(() => {
  switch (props.result.fileType) {
    case "docx":
      return "Word";
    case "pptx":
      return "PowerPoint";
    case "xlsx":
      return "Excel";
    default:
      return null;
  }
});

/** Per-format manual-review clause for the positive conformance body. */
const manualReviewNote = computed(() => {
  switch (props.result.fileType) {
    case "docx":
      return "the correctness of alt text, headings, and reading order can only be confirmed by manual review.";
    case "pptx":
      return "the correctness of alt text, slide titles, and reading order can only be confirmed by manual review.";
    case "xlsx":
      return "the correctness of alt text, sheet names, and table structure can only be confirmed by manual review.";
    default:
      return "color contrast is not evaluated here, and the correctness of alt text, headings, reading order, and tags can only be confirmed by manual review.";
  }
});

// Colors + labels derive from the engine's grade thresholds so the hero can
// never disagree with the scorer or the other grade-colored surfaces.
const gradeMap: Record<string, { color: string; label: string }> =
  Object.fromEntries(
    GRADE_THRESHOLDS.map((t) => [t.grade, { color: t.color, label: t.label }]),
  );

const displayedProfile = computed(() => {
  const strict = props.result.scoreProfiles?.strict;
  return {
    overallScore: strict?.overallScore ?? props.result.overallScore,
    grade: strict?.grade ?? props.result.grade,
    executiveSummary:
      strict?.executiveSummary ?? props.result.executiveSummary,
  };
});

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    props.result.categories,
    props.result.scoreProfiles,
    "strict",
  ),
);

const gradeColor = computed(
  () => gradeMap[displayedProfile.value.grade]?.color || "#666",
);
const gradeLabel = computed(
  () => gradeMap[displayedProfile.value.grade]?.label || "",
);

// WCAG conformance verdict — independent of the numeric score. The score is a
// prioritised-readiness metric with partial credit; this is the pass/fail
// answer (a document can score 90+ and still have a confirmed WCAG failure).
//
// Presentation is *tone*-driven, not pass/fail-driven. A strong document
// (grade A or B) is shown a calm green panel even when a criterion is flagged:
// WCAG is all-or-nothing per criterion, and a single gap should not alarm an
// otherwise-solid file. A weak document (C/D/F) gets a red panel. Either way
// the panel still lists every flagged criterion — tone never hides a finding.
// "incomplete" (an analyzer could not run) stays neutral: a genuine "could not
// check", neither a pass nor a fail.
// Normalize once so every downstream read (template + computeds below) can
// treat `failures`/`notAssessed` as arrays. On the public /report/:id page the
// conformance object comes from attacker-controlled stored JSON, so a forged
// report could omit these arrays and crash SSR with "reading 'length' of
// undefined". The TS type promises arrays; this enforces it at runtime.
const conformance = computed(() => {
  const c = props.result.conformance;
  if (!c || typeof c !== "object") return null;
  return {
    ...c,
    failures: Array.isArray(c.failures) ? c.failures : [],
    notAssessed: Array.isArray(c.notAssessed) ? c.notAssessed : [],
  };
});

const conformanceTone = computed<"positive" | "warning" | "neutral">(() => {
  const status = conformance.value?.status;
  if (!status || status === "incomplete") return "neutral";
  const grade = displayedProfile.value.grade;
  return grade === "A" || grade === "B" ? "positive" : "warning";
});

const conformanceHasFailures = computed(
  () => (conformance.value?.failures.length ?? 0) > 0,
);

// Border / background / heading colour + icon for each tone.
const conformanceStyle = computed(() => {
  switch (conformanceTone.value) {
    case "positive":
      return {
        border: "var(--icon-pass)",
        background: "rgba(34, 197, 94, 0.08)",
        heading: "var(--icon-pass)",
        icon: "ⓘ",
      };
    case "warning":
      return {
        border: "var(--icon-fail)",
        background: "rgba(239, 68, 68, 0.08)",
        heading: "var(--icon-fail)",
        icon: "⚠",
      };
    default:
      return {
        border: "var(--border-alt)",
        background: "var(--surface-hover)",
        heading: "var(--text-secondary)",
        icon: "ⓘ",
      };
  }
});

const conformanceHeading = computed(() => {
  if (conformance.value?.status === "incomplete") {
    return "WCAG verdict could not be determined";
  }
  if (conformanceTone.value === "positive") {
    return conformanceHasFailures.value
      ? "A few items still need attention"
      : "No automated WCAG failures found";
  }
  return conformanceHasFailures.value
    ? "This document needs additional manual remediation"
    : "Some findings to review";
});

// Mirrors conformance.ts's Level-A/AA breakdown phrasing for the warning body.
const conformanceFailBreakdown = computed(() => {
  const failures = conformance.value?.failures ?? [];
  const a = failures.filter((f) => f.level === "A").length;
  const aa = failures.filter((f) => f.level === "AA").length;
  if (aa === 0) return `${a} Level A failure${a === 1 ? "" : "s"}`;
  if (a === 0) return `${aa} Level AA failure${aa === 1 ? "" : "s"}`;
  return `${a} Level A and ${aa} Level AA failures`;
});

// Grade-aware body copy. Deliberately replaces the API's score-blind
// `conformance.headline` on-page: a high-scoring file is reassured while still
// being told plainly what is left to fix. The API headline is left untouched
// for the formal exports (Word / Markdown / HTML), where the firmer
// record-keeping language is wanted.
const conformanceBody = computed(() => {
  const c = conformance.value;
  if (!c) return "";
  if (c.status === "incomplete") return c.headline;

  const grade = displayedProfile.value.grade;

  if (conformanceTone.value === "positive") {
    if (conformanceHasFailures.value) {
      const n = c.failures.length;
      const items = n === 1 ? "the 1 item" : `the ${n} items`;
      return `This file earned a grade of ${grade} — a strong result overall. WCAG conformance is stricter than a letter grade, though: it is assessed criterion by criterion with no partial credit, so even a single image missing alternative text causes a strict reading of WCAG ${wcag.version} to flag the whole document. Fixing ${items} below is what is left to reach full Level AA conformance — worth addressing, but the ${grade} grade already reflects a document in good shape.`;
    }
    return `No automated WCAG failures were detected, and this file earned a grade of ${grade}. This is still not a determination of full conformance — ${manualReviewNote.value}`;
  }

  // warning tone (grade C / D / F)
  if (conformanceHasFailures.value) {
    const howToFix = sourceApp.value
      ? `Correcting them is manual work — fix the issues directly in ${sourceApp.value} (Review → Check Accessibility), then re-run this audit to confirm the fixes landed.`
      : "Correcting them is manual work — fix the document in Adobe Acrobat's Accessibility Checker, or repair the source file (Word, InDesign) and re-export the PDF, then re-run this audit to confirm the fixes landed.";
    return `Automated checks confirmed ${conformanceFailBreakdown.value} that should be corrected for this document to meet WCAG ${wcag.version} Level AA — the standard required by the Illinois IITAA 2.1 and the ADA Title II rule. The flagged criteria are listed below; each links to the exact W3C rule. ${howToFix}`;
  }
  return `The automated checks found no confirmed WCAG failures, but the category scores below indicate structural issues worth addressing — ${manualReviewNote.value}`;
});

const severityCounts = computed(() => {
  const cats = displayedCategories.value;
  return {
    critical: cats.filter((c) => c.severity === "Critical").length,
    moderate: cats.filter((c) => c.severity === "Moderate").length,
  };
});

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

const verdictExplanation = computed(() => {
  const { critical, moderate } = severityCounts.value;
  const parts: string[] = [];
  if (critical > 0) {
    parts.push(
      `<span style="color: var(--icon-fail); font-weight: 600;">${pluralize(critical, "critical issue")}</span>`,
    );
  }
  if (moderate > 0) {
    parts.push(
      `<span style="color: var(--icon-na); font-weight: 600;">${pluralize(moderate, "moderate issue")}</span>`,
    );
  }

  if (!props.result.categories || props.result.categories.length === 0) {
    return `Scored against WCAG ${wcag.version} AA and IITAA §E205.4 — the rules that govern non-web document accessibility in Illinois. Emphasizes programmatically determinable structure: real headings, real table-header relationships, logical reading order.`;
  }

  if (parts.length === 0) {
    return `Scored against WCAG ${wcag.version} AA and IITAA §E205.4. Every scored category passed with no critical or moderate issues — a strong structural signal, though not a final legal determination.`;
  }
  return `Scored against WCAG ${wcag.version} AA and IITAA §E205.4. The scored categories below show ${joinParts(parts)} — review the detailed findings before treating the file as publication-ready.`;
});

function highlightSeverities(raw: string): string {
  let text = escapeHtml(raw);
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-fail); font-weight: 600;">$1</span>',
  );
  text = text.replace(
    /(\d+ moderate(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-na); font-weight: 600;">$1</span>',
  );
  return text;
}

const highlightedSummary = computed(() =>
  highlightSeverities(displayedProfile.value.executiveSummary),
);
</script>

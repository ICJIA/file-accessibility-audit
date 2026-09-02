<script setup lang="ts">
import { computed } from "vue";

const wcag = useWcag();

const props = withDefaults(
  defineProps<{
    /** Analyzed file type — selects the library list, category count, and copy. */
    fileType?: "pdf" | "docx" | "pptx" | "xlsx";
  }>(),
  { fileType: "pdf" },
);

const isDocx = computed(() => props.fileType === "docx");
const isPptx = computed(() => props.fileType === "pptx");
const isXlsx = computed(() => props.fileType === "xlsx");
/** All three Office formats share the JSZip + fast-xml-parser pipeline. */
const isOoxml = computed(() => isDocx.value || isPptx.value || isXlsx.value);

/** Possessive subject for the intro sentence, per OOXML format. */
const ooxmlSubject = computed(() =>
  isDocx.value
    ? "the Word document's"
    : isPptx.value
      ? "the PowerPoint presentation's"
      : "the Excel workbook's",
);

// The open-source libraries named in the badge row, per format.
const libraries = computed(() =>
  isOoxml.value
    ? [
        {
          href: "https://stuk.github.io/jszip/",
          name: "JSZip",
          note: `— unzips the .${props.fileType} (OOXML) package`,
        },
        {
          href: "https://github.com/NaturalIntelligence/fast-xml-parser",
          name: "fast-xml-parser",
          note: "— OOXML structure & content analysis",
        },
      ]
    : [
        {
          href: "https://qpdf.readthedocs.io/",
          name: "QPDF",
          note: "— PDF structure & tag extraction",
        },
        {
          href: "https://mozilla.github.io/pdf.js/",
          name: "PDF.js (Mozilla)",
          note: "— content & metadata analysis",
        },
      ],
);
</script>

<template>
  <div
    class="mb-8 rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-3 sm:px-6 py-4 sm:py-5"
  >
    <h2
      class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 text-center"
    >
      How Scores Are Derived
    </h2>
    <p class="text-xs text-[var(--text-muted)] leading-relaxed mb-4 text-center">
      This tool uses established open-source libraries to
      <template v-if="isOoxml">read {{ ooxmlSubject }} Office Open XML (OOXML) structure</template
      ><template v-else>extract and analyze PDF structure</template>. Scores are calculated against
      <a
        :href="wcag.quickref"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--link)] hover:text-[var(--link-hover)]"
        >{{ wcag.label }}</a
      >
      success criteria and
      <a
        href="https://www.ada.gov/resources/title-ii-rule/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--link)] hover:text-[var(--link-hover)]"
        >ADA Title II</a
      >
      digital accessibility requirements, as adopted in Illinois by the
      <a
        href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--link)] hover:text-[var(--link-hover)]"
        >IITAA 2.1</a
      >
      standard.
    </p>
    <div class="flex flex-wrap justify-center gap-2 mb-4">
      <a
        v-for="lib in libraries"
        :key="lib.name"
        :href="lib.href"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-icon)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
      >
        <svg
          class="w-3.5 h-3.5 text-[var(--text-muted)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
          />
        </svg>
        {{ lib.name }}
        <span class="text-[var(--text-muted)]">{{ lib.note }}</span>
      </a>
    </div>
    <p v-if="isDocx" class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Eight categories are weighed against <strong>WCAG {{ wcag.version }} AA</strong> (the standard
      <strong>IITAA 2.1 §E205.4</strong> and ADA Title II both require) — the rules that govern
      non-web document accessibility in Illinois. Checks the tool can't yet automate for Word
      (reading order, form fields) are always reported as Not Assessed and sit outside the weighted
      score; a category that simply doesn't apply to a given document (no tables, no images) counts
      as passing, so a document is never penalized for content it doesn't have. Unlike PDF, color
      contrast is checked directly here, because Word stores explicit and theme colors. The score
      tracks remediation progress; the WCAG 2.1 verdict above is the compliance answer.
    </p>
    <p v-else-if="isPptx" class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Nine categories are weighed against <strong>WCAG {{ wcag.version }} AA</strong> (the standard
      <strong>IITAA 2.1 §E205.4</strong> and ADA Title II both require) — the rules that govern
      non-web document accessibility in Illinois. PowerPoint-specific checks include
      <strong>slide titles</strong>
      (every slide should have a unique title placeholder — Microsoft's highest-severity PowerPoint
      rule; reported as an advisory, never scored — requiring a title to exist is WCAG 2.4.10, Level
      AAA) and a title-first
      <strong>reading order</strong> check (reported as an advisory, never scored); checks that have
      no PowerPoint equivalent (heading structure, bookmarks) are not part of its category set, form
      fields are always reported as Not Assessed, and a category that simply doesn't apply to a
      given deck counts as passing rather than shrinking the score's base. Color contrast is checked
      directly, because PowerPoint stores explicit and theme colors. Machine checks are benchmarked
      against Microsoft's own Accessibility Checker rules for PowerPoint. The score tracks
      remediation progress; the WCAG 2.1 verdict above is the compliance answer.
    </p>
    <p v-else-if="isXlsx" class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Seven categories are weighed against <strong>WCAG {{ wcag.version }} AA</strong> (the standard
      <strong>IITAA 2.1 §E205.4</strong> and ADA Title II both require) — the rules that govern
      non-web document accessibility in Illinois. Excel-specific checks include
      <strong>sheet names</strong> (no default "Sheet1" tabs on visible sheets — an advisory, never
      scored) and
      <strong>table markup</strong>
      (data in real table objects with header rows; merged cells are flagged as advisories). Excel
      stores no document-language property, so the language half of Title &amp; Language is reported
      as not assessed and the title is scored alone; checks with no Excel equivalent (heading
      structure, reading order, list structure) are not part of its category set, form fields are
      always reported as Not Assessed, and a category that simply doesn't apply to a given workbook
      counts as passing rather than shrinking the score's base. Color contrast is checked directly
      from explicit font and fill colors. Machine checks are benchmarked against Microsoft's own
      Accessibility Checker rules for Excel. The score tracks remediation progress; the WCAG 2.1
      verdict above is the compliance answer.
    </p>
    <p v-else class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Nine categories are weighed against
      <strong>WCAG {{ wcag.version }} AA</strong> (the standard
      <strong>IITAA 2.1 §E205.4</strong> and ADA Title II both require) — the rules that govern
      non-web document accessibility in Illinois. A category that doesn't apply (e.g. tables in a
      document with no tables) counts as passing and keeps its weight — a document is never
      penalized for content it doesn't have, and a simple document's one fault is never magnified by
      a shrunken base (the pre-v1.58.3 renormalization did exactly that, and was removed). Only
      checks the tool could not assess — color contrast on PDFs — sit outside the weighted score.
      The score tracks remediation progress; the WCAG 2.1 verdict above is the compliance answer.
      <strong>PDF/UA-1 (ISO 14289-1)</strong> — a separate ISO standard for tagged PDFs — is
      verified with veraPDF on every PDF audit (the PDF/UA verdict on the report) and again by the
      optional remediation pipeline.
    </p>
  </div>
</template>

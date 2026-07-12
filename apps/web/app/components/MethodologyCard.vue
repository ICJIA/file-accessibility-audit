<script setup lang="ts">
import { computed } from "vue";

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
        href="https://www.w3.org/WAI/WCAG22/quickref/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--link)] hover:text-[var(--link-hover)]"
        >WCAG 2.2 Level AA</a
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
      Eight categories are weighed against <strong>WCAG 2.2 AA</strong> (a superset of the WCAG 2.1
      AA required by <strong>IITAA 2.1 §E205.4</strong>
      and ADA Title II) — the rules that govern non-web document accessibility in Illinois.
      Categories that don't apply to Word (reading order, form fields) are marked N/A and the
      remaining weights renormalized. Unlike PDF, color contrast is checked directly here, because
      Word stores explicit and theme colors. This score is the compliance benchmark for publication.
    </p>
    <p v-else-if="isPptx" class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Nine categories are weighed against <strong>WCAG 2.2 AA</strong> (a superset of the WCAG 2.1
      AA required by <strong>IITAA 2.1 §E205.4</strong> and ADA Title II) — the rules that govern
      non-web document accessibility in Illinois. PowerPoint-specific checks include
      <strong>slide titles</strong>
      (every slide needs a unique title placeholder — Microsoft's highest-severity PowerPoint rule)
      and a title-first
      <strong>reading order</strong> check; categories that don't apply to PowerPoint (heading
      structure, form fields, bookmarks) are omitted and the remaining weights renormalized. Color
      contrast is checked directly, because PowerPoint stores explicit and theme colors. Machine
      checks are benchmarked against Microsoft's own Accessibility Checker rules for PowerPoint.
      This score is the compliance benchmark for publication.
    </p>
    <p v-else-if="isXlsx" class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Seven categories are weighed against <strong>WCAG 2.2 AA</strong> (a superset of the WCAG 2.1
      AA required by <strong>IITAA 2.1 §E205.4</strong> and ADA Title II) — the rules that govern
      non-web document accessibility in Illinois. Excel-specific checks include
      <strong>sheet names</strong> (no default "Sheet1" tabs on visible sheets) and
      <strong>table markup</strong>
      (data in real table objects with header rows; merged cells are flagged as advisories). Excel
      stores no document-language property, so the language half of Title &amp; Language is reported
      as not assessed and the title is scored alone; categories that don't apply to Excel (heading
      structure, reading order, list structure, form fields) are omitted and the remaining weights
      renormalized. Color contrast is checked directly from explicit font and fill colors. Machine
      checks are benchmarked against Microsoft's own Accessibility Checker rules for Excel. This
      score is the compliance benchmark for publication.
    </p>
    <p v-else class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
      Nine categories are weighed against
      <strong>WCAG 2.2 AA</strong> (a superset of the WCAG 2.1 AA required by
      <strong>IITAA 2.1 §E205.4</strong> and ADA Title II) — the rules that govern non-web document
      accessibility in Illinois. Categories that don't apply (e.g. tables in a document with no
      tables) are excluded and the remaining weights renormalized. This score is the compliance
      benchmark for publication. <strong>PDF/UA-1 (ISO 14289-1)</strong> — a separate ISO standard
      for tagged PDFs — is verified with veraPDF when you run the optional remediation pipeline.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Props {
  /** Tighter visual on result page, default for audit page. */
  variant?: "audit" | "result";
  /** Analyzed file type — an OOXML file IS the source, so the framing flips. */
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "audit",
  fileType: "pdf",
});

const isResult = computed(() => props.variant === "result");
const isDocx = computed(() => props.fileType === "docx");
const isPptx = computed(() => props.fileType === "pptx");
const isXlsx = computed(() => props.fileType === "xlsx");
</script>

<template>
  <div
    class="rounded-xl border border-blue-700/30 bg-blue-950/20 px-5 py-5"
    :class="isResult ? 'sm:px-6 sm:py-5' : 'sm:px-7 sm:py-6'"
  >
    <div class="flex gap-3 items-start">
      <svg
        class="w-5 h-5 sm:w-6 sm:h-6 text-blue-300 flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.355a7.49 7.49 0 0 1-3 0M3.75 18h2.25l1.5-1.5h9l1.5 1.5h2.25"
        />
      </svg>
      <div class="flex-1">
        <h3 class="text-sm sm:text-base font-semibold text-blue-200 mb-1.5">
          The best path to accessibility starts at the source
        </h3>
        <p v-if="isDocx" class="text-sm text-[var(--text)] leading-relaxed mb-3">
          A Word document is the <strong>source document</strong> — the best place to fix
          accessibility. Correcting issues here (heading styles, alt text, table header rows, real
          list formatting) fixes them at the root, and any PDF you export from this file inherits
          that structure automatically. There's no separate remediation step: fix it in Word, then
          re-check.
        </p>
        <p v-else-if="isPptx" class="text-sm text-[var(--text)] leading-relaxed mb-3">
          A PowerPoint deck is the <strong>source document</strong> — the best place to fix
          accessibility. Correcting issues here (slide titles from the built-in layouts, alt text,
          table header rows, real bulleted lists) fixes them at the root, and any PDF you export
          from this deck inherits that structure automatically. There's no separate remediation
          step: fix it in PowerPoint, then re-check.
        </p>
        <p v-else-if="isXlsx" class="text-sm text-[var(--text)] leading-relaxed mb-3">
          An Excel workbook is the <strong>source document</strong> — the best place to fix
          accessibility. Correcting issues here (descriptive sheet tab names, real table objects
          with header rows, alt text on charts and images) fixes them at the root, and any PDF you
          export from this workbook inherits that structure automatically. There's no separate
          remediation step: fix it in Excel, then re-check.
        </p>
        <p v-else class="text-sm text-[var(--text)] leading-relaxed mb-3">
          PDF remediation — including this tool and Adobe Acrobat — is a fallback for finished
          documents. The most reliable accessibility comes from fixing issues in the
          <strong>source document</strong> (Word, InDesign, Pages, Google Docs, etc.) and
          re-exporting. When the source is structured well, the PDF inherits that structure
          automatically and no remediation is needed.
        </p>
        <details class="text-sm">
          <summary class="cursor-pointer text-blue-300 hover:text-blue-200 select-none font-medium">
            Quick source-document tips ▾
          </summary>
          <ul v-if="isPptx" class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed">
            <li>
              <strong class="text-[var(--text)]">Run the checker:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues before you share or
              export the deck.
            </li>
            <li>
              <strong class="text-[var(--text)]">Slide titles:</strong> give every slide a unique
              title using the built-in title placeholder — pick a layout with a title via
              <em>Home → Layout</em>, or add titles quickly in <em>View → Outline View</em>. A text
              box that merely looks like a title is not one.
            </li>
            <li>
              <strong class="text-[var(--text)]">Alt text:</strong> right-click each image, chart,
              or SmartArt graphic → <em>View Alt Text</em>; describe it, or check
              <em>Mark as decorative</em>.
            </li>
            <li>
              <strong class="text-[var(--text)]">Reading order:</strong> open
              <em>Review → Check Accessibility → Reading Order pane</em> — screen readers follow the
              shape order, not the visual layout, and the slide title should come first.
            </li>
            <li>
              <strong class="text-[var(--text)]">Tables:</strong> use <em>Insert → Table</em> (not
              text boxes arranged as a grid) and keep <em>Header Row</em> checked under Table
              Design.
            </li>
          </ul>
          <ul
            v-else-if="isXlsx"
            class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed"
          >
            <li>
              <strong class="text-[var(--text)]">Run the checker:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues before you share or
              export the workbook.
            </li>
            <li>
              <strong class="text-[var(--text)]">Sheet names:</strong> rename every tab
              (double-click the tab, or right-click → <em>Rename</em>) from the default "Sheet1" to
              a name that says what the sheet contains, and unhide or remove sheets you don't need.
            </li>
            <li>
              <strong class="text-[var(--text)]">Real tables:</strong> select each data region and
              use <em>Home → Format as Table</em> with <em>My table has headers</em> checked —
              screen readers announce header cells only for real table objects.
            </li>
            <li>
              <strong class="text-[var(--text)]">Merged cells:</strong> avoid them inside data
              regions — they break the row/column relationships screen readers rely on.
            </li>
            <li>
              <strong class="text-[var(--text)]">Alt text:</strong> right-click each chart or image
              → <em>View Alt Text</em>; describe it, or check <em>Mark as decorative</em>.
            </li>
          </ul>
          <ul
            v-else-if="isDocx"
            class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed"
          >
            <li>
              <strong class="text-[var(--text)]">Run the checker:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues before you share or
              export the document.
            </li>
            <li>
              <strong class="text-[var(--text)]">Heading styles:</strong> use Word's built-in
              heading styles (Heading 1, 2, 3 — not just bold, larger text) so the document has a
              real, navigable structure.
            </li>
            <li>
              <strong class="text-[var(--text)]">Alt text:</strong> right-click each image or
              graphic → <em>View Alt Text</em>; describe it, or check <em>Mark as decorative</em>.
            </li>
            <li>
              <strong class="text-[var(--text)]">Tables:</strong> use <em>Insert → Table</em> (not
              tabs or spaced-out text) and keep <em>Header Row</em> checked under Table Design so
              column headers are announced.
            </li>
            <li>
              <strong class="text-[var(--text)]">Lists:</strong> use the built-in bulleted/numbered
              list styles rather than typed dashes or numbers, so screen readers announce list
              structure.
            </li>
          </ul>
          <ul v-else class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed">
            <li>
              <strong class="text-[var(--text)]">Microsoft Word:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues before export. Use
              built-in heading styles (Heading 1, 2, 3 — not just bold larger text), set alt text on
              every image, and use Word's table tools (not tabs) for tables.
            </li>
            <li>
              <strong class="text-[var(--text)]">Adobe InDesign:</strong> set the document title in
              <em>File → File Info</em>, apply paragraph styles mapped to PDF tags (<em
                >Paragraph Styles panel → Export Tagging</em
              >), and use the <em>Articles</em> panel to control reading order.
            </li>
            <li>
              <strong class="text-[var(--text)]">Google Docs:</strong>
              <em>Tools → Accessibility</em> screen-reader support; use heading styles, descriptive
              link text, and add alt text via <em>Image options → Alt text</em>.
            </li>
            <li>
              <strong class="text-[var(--text)]">Apple Pages:</strong> use Paragraph Styles for
              headings and add image descriptions in the Image inspector.
            </li>
            <li>
              <strong class="text-[var(--text)]">When exporting:</strong> always choose the "Best
              for electronic distribution / accessibility" option (Word, Pages) or "Create Tagged
              PDF" (InDesign). Skipping this on export is the #1 cause of remediable PDFs we see
              here.
            </li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>

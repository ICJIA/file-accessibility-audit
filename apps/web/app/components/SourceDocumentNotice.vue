<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** Tighter visual on result page, default for audit page. */
  variant?: 'audit' | 'result'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'audit',
})

const isResult = computed(() => props.variant === 'result')
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
        <p class="text-sm text-[var(--text)] leading-relaxed mb-3">
          PDF remediation — including this tool and Adobe Acrobat — is a
          fallback for finished documents. The most reliable accessibility
          comes from fixing issues in the
          <strong>source document</strong> (Word, InDesign, Pages, Google
          Docs, etc.) and re-exporting.
          When the source is structured well, the PDF inherits that
          structure automatically and no remediation is needed.
        </p>
        <details class="text-sm">
          <summary
            class="cursor-pointer text-blue-300 hover:text-blue-200 select-none font-medium"
          >
            Quick source-document tips ▾
          </summary>
          <ul class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed">
            <li>
              <strong class="text-[var(--text)]">Microsoft Word:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues
              before export. Use built-in heading styles (Heading 1, 2, 3 — not
              just bold larger text), set alt text on every image, and use
              Word's table tools (not tabs) for tables.
            </li>
            <li>
              <strong class="text-[var(--text)]">Adobe InDesign:</strong> set
              the document title in <em>File → File Info</em>, apply paragraph
              styles mapped to PDF tags
              (<em>Paragraph Styles panel → Export Tagging</em>), and use the
              <em>Articles</em> panel to control reading order.
            </li>
            <li>
              <strong class="text-[var(--text)]">Google Docs:</strong>
              <em>Tools → Accessibility</em> screen-reader support; use heading
              styles, descriptive link text, and add alt text via
              <em>Image options → Alt text</em>.
            </li>
            <li>
              <strong class="text-[var(--text)]">Apple Pages:</strong> use
              Paragraph Styles for headings and add image descriptions in the
              Image inspector.
            </li>
            <li>
              <strong class="text-[var(--text)]">When exporting:</strong> always
              choose the "Best for electronic distribution / accessibility"
              option (Word, Pages) or "Create Tagged PDF" (InDesign). Skipping
              this on export is the #1 cause of remediable PDFs we see here.
            </li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>

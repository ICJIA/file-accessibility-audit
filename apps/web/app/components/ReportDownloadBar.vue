<template>
  <div
    class="flex flex-wrap"
    :class="variant === 'compact' ? 'justify-center gap-3' : 'gap-2 justify-center'"
  >
    <template v-if="variant === 'compact'">
      <button
        v-for="btn in buttons"
        :key="btn.format"
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
        :title="btn.title"
        :aria-label="btn.ariaLabel"
        @click="btn.handler"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" :d="btn.icon" />
        </svg>
        {{ btn.label }}
      </button>
    </template>
    <template v-else>
      <UButton
        v-for="btn in buttons"
        :key="btn.format"
        variant="soft"
        color="neutral"
        size="sm"
        :title="btn.title"
        :aria-label="btn.ariaLabel"
        @click="btn.handler"
      >
        <template #leading>
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" :d="btn.icon" />
          </svg>
        </template>
        {{ btn.label }}
      </UButton>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * ReportDownloadBar — Task F4. Replaces the 10 hand-duplicated download
 * buttons (5 formats × pages/index.vue + pages/report/[id].vue) with one
 * component that loops a `[{label, format, handler}]` array built from
 * useReportExport().
 *
 * The two call sites render download buttons quite differently — index.vue
 * uses Nuxt UI `<UButton>`s with a distinct icon per format and longer
 * labels ("Text (.txt)"); report/[id].vue uses plain `<button>`s with a
 * shared tray-download icon (except PDF, which already reused the same
 * printer icon in both places) and shorter labels ("Text"). `variant`
 * selects which of those two pre-existing visual treatments to render, so
 * swapping in this component is a visual no-op at both call sites — labels,
 * classes, icons, and button order are each preserved exactly per variant.
 * Every button additionally gets a descriptive `aria-label` (none of the
 * original 10 had one — they relied on visible text alone).
 */
import { computed } from "vue";
import { useReportExport, type ReportResult } from "~/composables/useReportExport";

type DownloadFormat = "text" | "html" | "markdown" | "json" | "pdf";

interface DownloadButtonDef {
  format: DownloadFormat;
  label: string;
  ariaLabel: string;
  icon: string;
  title?: string;
  handler: () => void;
}

const props = defineProps<{
  result: ReportResult;
  /** "cards" (default) = index.vue's UButton treatment; "compact" = report/[id].vue's plain-button treatment. */
  variant?: "cards" | "compact";
}>();

const { exportText, exportHtml, exportMarkdown, exportJSON, exportPdfViaBrowserPrint } =
  useReportExport();

// Icon paths — copied verbatim from the markup each variant is replacing.
const ICONS = {
  // index.vue's per-format icons ("cards" variant).
  textDoc:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  htmlGlobe:
    "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  markdownDoc:
    "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  jsonBrackets: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
  // Shared by both variants for PDF, and by every button in the "compact" variant.
  printer:
    "M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z",
  // report/[id].vue's single shared tray-download icon ("compact" variant, all but PDF).
  tray: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
} as const;

// The PDF button's title text in both variants is preserved character-for-
// character, including index.vue's pre-existing `&quot;` entities (a
// latent cosmetic quirk of the original bound-attribute string, not a new
// bug — see the "cards" variant below).
const PDF_TITLE_COMPACT = "Opens the browser print dialog — pick 'Save as PDF' as the destination.";
const PDF_TITLE_CARDS =
  "Opens the browser print dialog — pick &quot;Save as PDF&quot; as the destination.";

function ariaLabelFor(format: DownloadFormat): string {
  switch (format) {
    case "text":
      return "Download report as plain text";
    case "html":
      return "Download report as HTML";
    case "markdown":
      return "Download report as Markdown";
    case "json":
      return "Download report as JSON";
    case "pdf":
      return "Print report to PDF";
  }
}

// index.vue's original order/labels/icons.
const cardButtons = computed<DownloadButtonDef[]>(() => [
  {
    format: "text",
    label: "Text (.txt)",
    ariaLabel: ariaLabelFor("text"),
    icon: ICONS.textDoc,
    handler: () => exportText(props.result),
  },
  {
    format: "html",
    label: "HTML (.html)",
    ariaLabel: ariaLabelFor("html"),
    icon: ICONS.htmlGlobe,
    handler: () => exportHtml(props.result),
  },
  {
    format: "markdown",
    label: "Markdown (.md)",
    ariaLabel: ariaLabelFor("markdown"),
    icon: ICONS.markdownDoc,
    handler: () => exportMarkdown(props.result),
  },
  {
    format: "json",
    label: "JSON (.json)",
    ariaLabel: ariaLabelFor("json"),
    icon: ICONS.jsonBrackets,
    handler: () => exportJSON(props.result),
  },
  {
    format: "pdf",
    label: "PDF (browser print)",
    ariaLabel: ariaLabelFor("pdf"),
    icon: ICONS.printer,
    title: PDF_TITLE_CARDS,
    handler: () => exportPdfViaBrowserPrint(props.result),
  },
]);

// report/[id].vue's original order/labels (shared tray icon for every
// format except PDF, which already used the printer icon there too).
const compactButtons = computed<DownloadButtonDef[]>(() => [
  {
    format: "text",
    label: "Text",
    ariaLabel: ariaLabelFor("text"),
    icon: ICONS.tray,
    handler: () => exportText(props.result),
  },
  {
    format: "markdown",
    label: "Markdown",
    ariaLabel: ariaLabelFor("markdown"),
    icon: ICONS.tray,
    handler: () => exportMarkdown(props.result),
  },
  {
    format: "json",
    label: "JSON",
    ariaLabel: ariaLabelFor("json"),
    icon: ICONS.tray,
    handler: () => exportJSON(props.result),
  },
  {
    format: "html",
    label: "HTML",
    ariaLabel: ariaLabelFor("html"),
    icon: ICONS.tray,
    handler: () => exportHtml(props.result),
  },
  {
    format: "pdf",
    label: "PDF",
    ariaLabel: ariaLabelFor("pdf"),
    icon: ICONS.printer,
    title: PDF_TITLE_COMPACT,
    handler: () => exportPdfViaBrowserPrint(props.result),
  },
]);

const buttons = computed(() =>
  props.variant === "compact" ? compactButtons.value : cardButtons.value,
);
</script>

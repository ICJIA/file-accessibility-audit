<script setup lang="ts">
/**
 * /sample-report — what a report looks like, before uploading anything.
 *
 * A first-time visitor could not see what they would get without handing
 * over a file. This page renders one bundled, REAL engine result through the
 * same components the home page uses for a live report, so what is shown is
 * what they will see.
 *
 * NOTHING IS FETCHED OR STORED. No API call, no database row, no share link.
 * The result is a JSON file in the app bundle (app/data/sampleReport.json:
 * the audit engine's unedited output for a public ICJIA research report, with
 * the filename replaced by a neutral one and the document's author field and
 * author finding removed). It is loaded with a dynamic import so it is its
 * own chunk — the home page never downloads it.
 *
 * Repair and sharing are deliberately absent: there is no file to repair and
 * no report row to share. The page says so rather than showing dead buttons.
 */
import { shallowRef } from "vue";
import ReportVisualView from "~/components/ReportVisualView.vue";
import ReportFileBanner from "~/components/ReportFileBanner.vue";

definePageMeta({ middleware: [], wide: true });

const runtimeConfig = useRuntimeConfig();
const siteUrl = String(runtimeConfig.public.siteUrl ?? "");

useHead({
  title: "Sample accessibility report",
  meta: [
    {
      name: "description",
      content:
        "See what you get before you upload anything: a sample accessibility report for a PDF, with its WCAG 2.1 grade, a plain-language list of what to fix, and what a person still has to check.",
    },
  ],
  link: siteUrl ? [{ rel: "canonical", href: `${siteUrl}/sample-report` }] : [],
});

// Raw JSON, exactly as the engine wrote it — the same loose shape the shared
// report page hands to ReportVisualView.
const sample = shallowRef<Record<string, any> | null>(null);
const failed = shallowRef(false);
// Awaited in setup, on the server AND in the browser, so both render the
// report from the first frame. (Loading it only on the server and letting the
// browser start empty made the two disagree — a hydration mismatch.) The
// dynamic import keeps the data in its own chunk either way.
try {
  const m = await import("~/data/sampleReport.json");
  sample.value = (m.default ?? m) as Record<string, any>;
} catch {
  failed.value = true;
}
</script>

<template>
  <div>
    <p class="pk-label pk-rule pt-6 text-[var(--text-muted)] mb-4">Example</p>
    <h1 class="pk-page-title text-[var(--text-heading)] mb-6">Sample report</h1>

    <!-- The banner: unmissable, in words, and before any grade. A sample that
         could be mistaken for the visitor's own document would be worse than
         no sample. -->
    <div
      role="note"
      aria-label="This is a sample report"
      data-testid="sample-banner"
      class="mb-6 rounded-xl border-2 border-[var(--border-hover)] bg-[var(--surface-raised)] px-4 py-4 sm:px-5"
    >
      <p class="text-base font-bold text-[var(--text-heading)]">
        Sample report — this is an example document, not yours.
      </p>
      <p class="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
        This is a real check of a public state report, with the file renamed. It shows what you get
        for your own file: a grade, a list of what to fix in plain language, and what a person still
        has to check. Repair, sharing and downloads are turned off here because there is no file of
        yours behind it.
      </p>
      <p class="mt-3">
        <NuxtLink
          to="/"
          data-testid="sample-cta-top"
          class="inline-block rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cobalt-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
          >Check your own document</NuxtLink
        >
      </p>
    </div>

    <template v-if="sample">
      <!-- No #cta slot: that is where a live report puts the repair button. -->
      <ReportVisualView
        :result="sample"
        :verapdf-url="String(runtimeConfig.public.verapdfUrl ?? '')"
        data-testid="sample-report"
      >
        <template #banner>
          <ReportFileBanner
            compact
            :filename="sample.filename"
            :page-count="sample.pageCount"
            :is-scanned="sample.isScanned"
            :file-type="sample.fileType"
            class="mb-6"
          />
        </template>
        <template #notice>
          <SourceDocumentNotice variant="audit" :file-type="sample.fileType" class="mb-4" />
        </template>
      </ReportVisualView>

      <div
        class="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-5 text-center"
      >
        <p class="text-sm text-[var(--text-secondary)]">
          That was the sample. Your own report has the same parts, plus downloads, a link you can
          share, and — for PDFs — an optional automatic repair.
        </p>
        <p class="mt-3">
          <NuxtLink
            to="/"
            data-testid="sample-cta-bottom"
            class="inline-block rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cobalt-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
            >Check your own document</NuxtLink
          >
        </p>
      </div>
    </template>

    <!-- A polite live region: the report arrives a moment after the page. -->
    <p
      v-else
      role="status"
      aria-live="polite"
      data-testid="sample-loading"
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-6 text-center text-sm text-[var(--text-muted)]"
    >
      {{
        failed
          ? "The sample report could not be loaded. Reload the page to try again."
          : "Loading the sample report…"
      }}
    </p>
  </div>
</template>

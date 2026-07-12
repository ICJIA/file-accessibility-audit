<template>
  <div class="min-h-screen bg-[var(--surface-body)] text-[var(--text-primary)]">
    <main class="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <div
          class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
        />
        <p class="text-[var(--text-muted)]">Loading report...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <div
          class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4"
        >
          <span class="text-3xl">!</span>
        </div>
        <h2 class="text-xl font-semibold text-[var(--status-error)] mb-2">
          Report Not Available
        </h2>
        <p class="text-[var(--text-muted)] text-sm">{{ errorMessage }}</p>
      </div>

      <!-- Report -->
      <div v-else-if="data">
        <!-- Report content — the exact subtree the HTML export snapshots, so
             the download is identical to this shared view. -->
        <div data-report-content>
        <!-- Prominent filename banner — leaves no doubt which file this
             shared report (and its PDF print) refers to -->
        <ReportFileBanner
          :filename="(data as any).report.filename"
          :page-count="(data as any).report.pageCount"
          :is-scanned="(data as any).report.isScanned"
          :file-type="(data as any).report.fileType"
          class="mb-6"
        />
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="flex justify-end items-center gap-2 mb-4">
            <button
              class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              :aria-label="
                colorMode.value === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              "
              @click="toggleColorMode"
            >
              <svg
                v-if="colorMode.value === 'dark'"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                />
              </svg>
              <svg
                v-else
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                />
              </svg>
            </button>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold mb-1">
            {{ appName.replace("Audit", "Report") }}
          </h1>
          <p class="text-sm text-[var(--text-secondary)] mt-2">
            <a
              :href="auditUrl"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline transition-colors"
              >{{ appName }}</a
            >
          </p>
          <p class="text-sm text-[var(--text-secondary)] mt-2">
            <!-- The API (GET /api/reports/:id) never returns who shared a
                 report — the sharer's email is PII and is intentionally
                 dropped server-side (see apps/api/src/routes/reports.ts) —
                 so this has always rendered as "Shared on" unconditionally. -->
            Shared on {{ formatDate(data.createdAt) }}
          </p>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Shareable links expire after 365 days
          </p>
        </div>

        <!-- Score Hero -->
        <div
          class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard :result="(data as any).report" :show-filename="false" />
        </div>

        <ReportActionBanner
          v-if="data?.report?.categories"
          :categories="(data as any).report.categories"
          :file-type="(data as any).report.fileType"
          class="mb-4"
        />

        <IssuesSummary
          v-if="data?.report?.categories"
          :categories="(data as any).report.categories"
          class="mb-8"
        />
        <!-- Scanned warning -->
        <div
          v-if="data.report.isScanned"
          class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
        >
          <p class="text-[var(--status-warning-orange)] font-medium text-sm">
            This PDF appears to be a scanned image. Screen readers cannot access
            its content. OCR and full remediation are required.
          </p>
        </div>

        <!-- Warnings -->
        <div
          v-if="data.report.warnings?.length"
          class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4"
        >
          <p
            v-for="w in data.report.warnings"
            :key="w"
            class="text-[var(--status-warning-yellow)] text-sm"
          >
            {{ w }}
          </p>
        </div>

        <MethodologyCard :file-type="(data as any).report.fileType" />

        <ReportContent :result="(data as any).report" />

        </div>
        <!-- /report content -->

        <!-- Downloads + CTA -->
        <div
          class="mt-8 text-center rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
        >
          <div class="flex flex-col items-center gap-3">
            <p
              class="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium"
            >
              Download Report
            </p>
            <div class="flex flex-wrap justify-center gap-3">
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadDocx"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Text
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadMarkdown"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Markdown
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadJson"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                JSON
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadHtml"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                HTML
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                title="Opens the browser print dialog — pick 'Save as PDF' as the destination."
                @click="downloadPdf"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                  />
                </svg>
                PDF
              </button>
            </div>
            <p class="text-xs text-[var(--text-muted)]">
              Text, HTML, and Markdown for reading; PDF via your browser's print dialog; JSON for LLMs.
            </p>
          </div>
          <div class="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <p class="text-sm text-[var(--text-muted)] mb-3">
              Want to audit your own document?
            </p>
            <a
              :href="auditUrl"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              Audit Your Document
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-6 pt-6 border-t border-[var(--border)] text-center">
          <p class="text-xs text-[var(--text-muted)]">
            Report generated by
            <a
              :href="auditUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
              >{{ appName }}</a
            >
            — {{ formatDate(data.createdAt) }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import ReportFileBanner from "~/components/ReportFileBanner.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import type { CategoryResult, ScoreProfileResult, ScoringMode } from "@file-audit/shared";


definePageMeta({ layout: false });

const route = useRoute();
const id = route.params.id as string;
const config = useRuntimeConfig();
const auditUrl = config.public.siteUrl as string;
const appName = config.public.appName as string;
const colorMode = useColorMode();

function toggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

// Mirrors the res.json() shape built in apps/api/src/routes/reports.ts (GET
// /api/reports/:id) — a plain Express handler proxied through, not a Nitro
// server route, so Nuxt can't infer this from the URL. `report` is whatever
// was originally POSTed (see sanitizeStoredReport), which in practice is
// always an AnalysisResult; `sharedBy` is never sent (PII — see that route).
interface SharedReportResult {
  filename: string;
  pageCount: number;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  isScanned: boolean;
  warnings?: string[];
  categories: CategoryResult[];
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
  scoreProfiles?: Partial<Record<ScoringMode, ScoreProfileResult>>;
}
interface SharedReportResponse {
  report: SharedReportResult;
  createdAt: string;
  expiresAt: string;
}

const { data, pending, error } = await useFetch<SharedReportResponse>(
  `/api/reports/${id}`,
);

const {
  exportJSON,
  exportMarkdown,
  exportText,
  exportHtml,
  exportPdfViaBrowserPrint,
} = useReportExport();

function downloadJson() {
  if (data.value) {
    exportJSON((data.value as any).report);
  }
}

function downloadMarkdown() {
  if (data.value) {
    exportMarkdown((data.value as any).report);
  }
}

function downloadDocx() {
  if (data.value) {
    exportText((data.value as any).report);
  }
}

function downloadHtml() {
  if (data.value) {
    exportHtml((data.value as any).report);
  }
}

function downloadPdf() {
  if (data.value) {
    exportPdfViaBrowserPrint((data.value as any).report);
  }
}

const errorMessage = computed(() => {
  if (!error.value) return "";
  const status = (error.value as any)?.statusCode;
  if (status === 410) return "This report link has expired.";
  if (status === 404)
    return "This report was not found. It may have been removed or the link may be incorrect.";
  return "Unable to load this report. Please try again later.";
});

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

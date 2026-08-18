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
        <h2 class="text-xl font-semibold text-[var(--status-error)] mb-2">Report Not Available</h2>
        <p class="text-[var(--text-muted)] text-sm">{{ errorMessage }}</p>
      </div>

      <!-- Report -->
      <div v-else-if="data">
        <div class="flex justify-end items-center gap-2 mb-4">
          <button
            class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            :aria-label="
              colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
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

        <!-- Which page this report is about — the page-audit analogue of
             ReportFileBanner: leaves no doubt what was audited. -->
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 sm:px-6 py-4 mb-8"
        >
          <p class="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Web page accessibility report
          </p>
          <h1 class="text-lg sm:text-xl font-semibold text-[var(--text-heading)] break-words">
            {{ report.pageTitle || report.url }}
          </h1>
          <p class="text-sm mt-1 break-all">
            <a
              v-if="isSafeHttpUrl(report.url)"
              data-testid="audited-url"
              :href="report.url"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >{{ report.url }}</a
            >
            <span v-else data-testid="audited-url" class="text-[var(--text-muted)]">{{
              report.url
            }}</span>
          </p>
          <p class="text-xs text-[var(--text-muted)] mt-2">
            Audited {{ formatDate(report.audited) }} with automated accessibility rules (axe-core).
            The page may have changed since.
          </p>
        </div>

        <!-- Score hero -->
        <div class="text-center mb-8">
          <div
            class="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 mb-3"
            :style="{ borderColor: gradeTone, color: gradeTone }"
          >
            <span data-testid="page-grade" class="text-5xl font-bold">{{ report.grade }}</span>
          </div>
          <p data-testid="page-score" class="text-lg font-medium">
            {{ report.score }}<span class="text-[var(--text-muted)]"> / 100</span>
          </p>
          <p class="text-sm text-[var(--text-muted)] mt-1">
            {{ violationNoun }} found by the automated scan
          </p>
        </div>

        <!-- Severity counts — all four axe impact buckets, zeros included,
             so a reader sees the full scale, not just the buckets that hit. -->
        <div
          data-testid="severity-counts"
          class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10"
          role="list"
          aria-label="Violations by severity"
        >
          <div
            v-for="bucket in severityBuckets"
            :key="bucket.key"
            role="listitem"
            class="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-3 py-3 text-center"
          >
            <p
              class="text-2xl font-bold"
              :style="{ color: bucket.count > 0 ? bucket.color : 'var(--text-muted)' }"
            >
              {{ bucket.count }}
            </p>
            <p class="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {{ bucket.label }}
            </p>
          </div>
        </div>

        <!-- Violations -->
        <section v-if="violations.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold text-[var(--text-heading)] mb-4">
            Violations ({{ violations.length }})
          </h2>
          <ul class="space-y-4">
            <li
              v-for="issue in violations"
              :key="issue.id"
              class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5"
            >
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span
                  class="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                  :style="impactBadgeStyle(issue.impact)"
                >
                  {{ impactLabel(issue.impact) }}
                </span>
                <code class="text-xs text-[var(--text-muted)]">{{ issue.id }}</code>
              </div>
              <p class="text-sm mb-2">{{ issue.description }}</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                Affects {{ elementNoun(issue.nodeCount) }}
              </p>
              <ul v-if="issue.nodes?.length" class="mb-3 space-y-1">
                <li v-for="(node, i) in issue.nodes" :key="i">
                  <code
                    class="text-xs bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 break-all"
                    >{{ node.target.join(" ") }}</code
                  >
                </li>
              </ul>
              <a
                v-if="isSafeHttpUrl(issue.helpUrl)"
                :href="issue.helpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >How to fix this ({{ issue.id }}) &rarr;</a
              >
            </li>
          </ul>
        </section>

        <!-- No violations -->
        <div
          v-else
          data-testid="no-violations"
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6 text-center mb-10"
        >
          <p class="text-[var(--status-success)] font-medium mb-1">
            No violations found by the automated scan
          </p>
          <p class="text-sm text-[var(--text-muted)]">
            Automated rules cover only part of accessibility. A person should still confirm the page
            works with a keyboard and a screen reader.
          </p>
        </div>

        <!-- Incomplete checks — open by default, per the product rule that
             issue lists are never hidden behind a closed accordion. -->
        <section v-if="incomplete.length > 0" data-testid="incomplete-section" class="mb-10">
          <h2 class="text-lg font-semibold text-[var(--text-heading)] mb-1">
            Needs manual review ({{ incomplete.length }})
          </h2>
          <p class="text-sm text-[var(--text-muted)] mb-4">
            The scanner could not decide these on its own — a person needs to look. They are not
            counted against the score.
          </p>
          <ul class="space-y-4">
            <li
              v-for="issue in incomplete"
              :key="issue.id"
              class="rounded-xl border border-dashed border-[var(--border-alt)] bg-[var(--surface-card-alt)] p-4 sm:p-5"
            >
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <code class="text-xs text-[var(--text-muted)]">{{ issue.id }}</code>
              </div>
              <p class="text-sm mb-2">{{ issue.description }}</p>
              <ul v-if="issue.nodes?.length" class="mb-3 space-y-1">
                <li v-for="(node, i) in issue.nodes" :key="i">
                  <code
                    class="text-xs bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 break-all"
                    >{{ node.target.join(" ") }}</code
                  >
                </li>
              </ul>
              <a
                v-if="isSafeHttpUrl(issue.helpUrl)"
                :href="issue.helpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >What to check ({{ issue.id }}) &rarr;</a
              >
            </li>
          </ul>
        </section>

        <!-- Footer -->
        <footer
          class="border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--text-muted)] space-y-1"
        >
          <p>
            Shared on {{ formatDate(createdAt) }} &mdash; this link expires
            {{ formatDate(expiresAt) }}.
          </p>
          <p>
            Generated by
            <a href="/" class="underline text-[var(--link)] hover:text-[var(--link-hover)]">{{
              appName
            }}</a>
            using axe-core in a real browser.
          </p>
        </footer>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";

definePageMeta({ layout: false });

const route = useRoute();
const id = route.params.id as string;
const config = useRuntimeConfig();
const appName = config.public.appName as string;
const colorMode = useColorMode();
const { gradeColor, severityColor } = useTokenColors();

function toggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

// Mirrors PageAuditResult in apps/api/src/services/pageAuditor.ts — the
// payload POST /api/audit-url-page stores in shared_reports and GET
// /api/reports/:id serves back verbatim (regradeStoredReport passes page
// payloads through untouched: they have no `categories` array). Declared
// locally like SharedReportResponse in pages/report/[id].vue: apps/web
// deliberately depends only on @file-audit/shared, and this shape lives in
// the api app. pageReportWiring.test.ts pins the wiring on both sides.
interface PageIssue {
  id: string;
  impact: string | null;
  description: string;
  helpUrl: string;
  tags: string[];
  nodeCount: number;
  nodes: { target: string[] }[];
}

interface PageReport {
  url: string;
  pageTitle: string | null;
  audited: string;
  score: number;
  grade: string;
  violationCount: number;
  bySeverity?: { critical: number; serious: number; moderate: number; minor: number };
  violations?: PageIssue[];
  incomplete?: PageIssue[];
}

interface PageReportResponse {
  report: PageReport;
  createdAt: string;
  expiresAt: string;
}

const { data, pending, error } = await useFetch<PageReportResponse>(`/api/reports/${id}`);

const errorMessage = computed(() => {
  if (!error.value) return "";
  const status = error.value.statusCode ?? error.value.status;
  if (status === 410) return "This report link has expired.";
  if (status === 404)
    return "This report was not found. It may have been removed or the link may be incorrect.";
  return "Unable to load this report. Please try again later.";
});

const report = computed(() => data.value!.report);
const createdAt = computed(() => data.value!.createdAt);
const expiresAt = computed(() => data.value!.expiresAt);

// Rows stored before cf1228e predate violations[]/incomplete[] in the
// payload, so both default rather than trusting the field to exist.
const violations = computed(() => report.value.violations ?? []);
const incomplete = computed(() => report.value.incomplete ?? []);

const violationNoun = computed(() => {
  const n = report.value.violationCount ?? violations.value.length;
  return n === 1 ? "1 violation" : `${n} violations`;
});

function elementNoun(count: number): string {
  return count === 1 ? "1 element" : `${count} elements`;
}

const gradeTone = computed(() => gradeColor(report.value.grade));

// axe impacts (critical/serious/moderate/minor) are a four-rung scale; the
// document palette has three. Map the top two onto the app's Critical red
// and orange status tone, and reuse the themed Moderate/Minor colors, so
// both themes keep AA contrast (see useTokenColors).
function impactTone(impact: string | null | undefined): string {
  switch ((impact ?? "").toLowerCase()) {
    case "critical":
      return severityColor("Critical");
    case "serious":
      return "var(--status-warning-orange)";
    case "moderate":
      return severityColor("Moderate");
    case "minor":
      return severityColor("Minor");
    default:
      return "var(--text-muted)";
  }
}

function impactLabel(impact: string | null | undefined): string {
  const s = (impact ?? "unknown").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function impactBadgeStyle(impact: string | null | undefined) {
  const color = impactTone(impact);
  return { color, border: `1px solid ${color}` };
}

const severityBuckets = computed(() => {
  const counts = report.value.bySeverity ?? { critical: 0, serious: 0, moderate: 0, minor: 0 };
  return (["critical", "serious", "moderate", "minor"] as const).map((key) => ({
    key,
    label: impactLabel(key),
    count: counts[key] ?? 0,
    color: impactTone(key),
  }));
});

// url and nodes[].target originate in the AUDITED page (its address, its
// DOM), and helpUrl in axe rule metadata — none of it authored here. Render
// a link only for plain http(s); anything else stays inert text.
function isSafeHttpUrl(u: string | null | undefined): boolean {
  if (typeof u !== "string") return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

useHead({
  // Reads data directly, not the report computed — that one assumes data is
  // set, which the 404/410/error states never satisfy.
  title: computed(() => {
    const r = data.value?.report;
    const subject = r?.pageTitle || r?.url || "Shared report";
    return `Page audit — ${subject}`;
  }),
});
</script>

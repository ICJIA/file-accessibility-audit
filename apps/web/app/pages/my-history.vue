<template>
  <div>
    <h2 class="text-xl font-semibold mb-6">My Analysis History</h2>

    <div v-if="pending" class="text-[var(--text-muted)]">Loading…</div>

    <div v-else-if="!data?.data?.length" class="text-[var(--text-muted)]">
      No analyses yet.
      <NuxtLink to="/" class="text-[var(--accent-green)] hover:underline">Analyze a file</NuxtLink>
      to get started.
    </div>

    <div v-else>
      <!-- wrapper/cell-padding classes are restated explicitly (they match
           ReportsTable's own defaults) so this page's responsive-layout
           contract stays visible/greppable here, not only inside the shared
           component — see __tests__/responsive.test.ts. -->
      <ReportsTable
        :rows="data.data"
        :columns="columns"
        caption="My analysis history: filename, score, grade, and date"
        table-class="min-w-[420px]"
        wrapper-class="overflow-x-auto"
        cell-padding-x="px-3 sm:px-4"
        cell-padding-x-center="px-2 sm:px-4"
      >
        <template #cell-score="{ value }">{{ (value as number | null) ?? "—" }}</template>
        <template #cell-grade="{ value }">
          <span
            v-if="value"
            class="inline-block w-8 h-8 rounded-full text-sm font-bold leading-8 text-center"
            :style="{
              backgroundColor: gradeColor(value as string) + '20',
              color: gradeColor(value as string),
            }"
          >
            {{ value }}
          </span>
        </template>
        <template #cell-created_at="{ value }">{{ formatDate(value as string) }}</template>
      </ReportsTable>

      <PaginationControls
        :page="page"
        :total-pages="data.pagination.totalPages"
        @update:page="goToPage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ReportsTable from "~/components/ReportsTable.vue";
import PaginationControls from "~/components/PaginationControls.vue";
import { usePaginatedReports } from "~/composables/usePaginatedReports";

// Auth gating removed — this app runs un-gated (AUTH.REQUIRE_LOGIN=false).
// To re-gate this page in the future, restore:
//   definePageMeta({ middleware: 'auth' })
// The `auth` middleware (app/middleware/auth.ts) is kept in place and stays
// a no-op until AUTH.REQUIRE_LOGIN is flipped to true server-side.

// Mirrors the res.json() shape built in apps/api/src/routes/logs.ts (GET
// /api/my-history) — a plain Express handler proxied through, not a Nitro
// server route, so Nuxt can't infer this from the URL; declared here. This
// query selects an explicit column list (narrower than /api/logs).
interface HistoryRow {
  id: number;
  filename: string | null;
  score: number | null;
  grade: string | null;
  created_at: string;
}

const { data, pending, page, goToPage } = usePaginatedReports<HistoryRow>("/api/my-history", {
  limit: 20,
});

const columns = [
  { key: "filename", label: "Filename" },
  { key: "score", label: "Score", align: "center" as const },
  { key: "grade", label: "Grade", align: "center" as const },
  { key: "created_at", label: "Date", align: "right" as const },
];

const gradeColors: Record<string, string> = {
  A: "#22c55e",
  B: "#14b8a6",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

function gradeColor(grade: string): string {
  return gradeColors[grade] || "#666";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>

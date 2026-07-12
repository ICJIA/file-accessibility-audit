<template>
  <div>
    <h2 class="text-xl font-semibold mb-6">Admin — Audit Log</h2>

    <div v-if="pending" class="text-[var(--text-muted)]">Loading…</div>

    <div v-else-if="error" class="text-[var(--status-error)]">
      {{ (error as any)?.data?.error || "Failed to load audit logs" }}
    </div>

    <div v-else-if="data">
      <!-- wrapper/cell-padding classes are restated explicitly (they match
           ReportsTable's own defaults) so this page's responsive-layout
           contract stays visible/greppable here, not only inside the shared
           component — see __tests__/responsive.test.ts. -->
      <ReportsTable
        :rows="data.data"
        :columns="columns"
        caption="Admin audit log of login, verification, and analyze events"
        table-class="min-w-[520px]"
        wrapper-class="overflow-x-auto"
        cell-padding-x="px-3 sm:px-4"
        cell-padding-x-center="px-2 sm:px-4"
      >
        <template #cell-event_type="{ value }">
          <UBadge :color="eventColor(value as string)" variant="subtle" size="xs">
            {{ value }}
          </UBadge>
        </template>
        <template #cell-filename="{ value }">{{ (value as string | null) || "—" }}</template>
        <template #cell-grade="{ value }">{{ (value as string | null) || "—" }}</template>
        <template #cell-created_at="{ value }">
          {{
            new Date(value as string).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          }}
        </template>
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
// /api/logs) — that route is a plain Express handler proxied through, not a
// Nitro server route, so Nuxt can't infer this from the URL; it must be
// declared here.
interface AuditLogRow {
  id: number;
  event_type: string;
  email: string;
  filename: string | null;
  score: number | null;
  grade: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  content_hash: string | null;
}

const { data, pending, error, page, goToPage } = usePaginatedReports<AuditLogRow>("/api/logs", {
  limit: 50,
});

const columns = [
  { key: "event_type", label: "Event" },
  { key: "email", label: "Email" },
  { key: "filename", label: "Filename" },
  { key: "grade", label: "Grade", align: "center" as const },
  { key: "created_at", label: "Date", align: "right" as const },
];

// The literal union UBadge['color'] currently accepts (@nuxt/ui 4.5.1).
type BadgeColor = "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";

function eventColor(type: string): BadgeColor {
  const colors: Record<string, BadgeColor> = {
    login: "info",
    logout: "neutral",
    otp_request: "warning",
    analyze: "success",
  };
  return colors[type] || "neutral";
}
</script>

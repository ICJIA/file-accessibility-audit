<template>
  <div>
    <h2 class="text-xl font-semibold mb-6">Admin — Audit Log</h2>

    <div v-if="pending" class="text-[var(--text-muted)]">Loading…</div>

    <div v-else-if="error" class="text-[var(--status-error)]">
      {{ error.data?.error || 'Failed to load audit logs' }}
    </div>

    <div v-else-if="data">
      <div class="rounded-xl border border-[var(--border)] overflow-x-auto">
        <table class="w-full text-sm min-w-[520px]">
          <thead class="bg-[var(--surface-card)] text-[var(--text-muted)]">
            <tr>
              <th class="text-left px-3 sm:px-4 py-3 font-medium">Event</th>
              <th class="text-left px-3 sm:px-4 py-3 font-medium">Email</th>
              <th class="text-left px-3 sm:px-4 py-3 font-medium">Filename</th>
              <th class="text-center px-2 sm:px-4 py-3 font-medium">Grade</th>
              <th class="text-right px-3 sm:px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border)]">
            <tr v-for="row in data.data" :key="row.id" class="hover:bg-[var(--surface-card-50)] transition-colors">
              <td class="px-3 sm:px-4 py-3">
                <UBadge
                  :color="eventColor(row.event_type)"
                  variant="subtle"
                  size="xs"
                >
                  {{ row.event_type }}
                </UBadge>
              </td>
              <td class="px-3 sm:px-4 py-3 text-[var(--text-secondary)]">{{ row.email }}</td>
              <td class="px-3 sm:px-4 py-3 text-[var(--text-heading)]">{{ row.filename || '—' }}</td>
              <td class="text-center px-2 sm:px-4 py-3">{{ row.grade || '—' }}</td>
              <td class="text-right px-3 sm:px-4 py-3 text-[var(--text-muted)]">
                {{ new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="data.pagination.totalPages > 1" class="mt-4 flex justify-center gap-2">
        <UButton
          v-for="p in data.pagination.totalPages"
          :key="p"
          size="xs"
          :variant="p === page ? 'solid' : 'ghost'"
          :color="p === page ? 'primary' : 'neutral'"
          @click="goToPage(p)"
        >
          {{ p }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Auth gating removed — this app runs un-gated (AUTH.REQUIRE_LOGIN=false).
// To re-gate this page in the future, restore:
//   definePageMeta({ middleware: 'auth' })
// The `auth` middleware (app/middleware/auth.ts) is kept in place and stays
// a no-op until AUTH.REQUIRE_LOGIN is flipped to true server-side.

const page = ref(1)

// Mirrors the res.json() shape built in apps/api/src/routes/logs.ts (GET
// /api/logs) — that route is a plain Express handler proxied through, not a
// Nitro server route, so Nuxt can't infer this from the URL; it must be
// declared here.
interface AuditLogRow {
  id: number
  event_type: string
  email: string
  filename: string | null
  score: number | null
  grade: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  content_hash: string | null
}
interface LogsResponse {
  data: AuditLogRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const { data, pending, error } = useFetch<LogsResponse>('/api/logs', {
  query: { page, limit: 50 },
  credentials: 'include',
  watch: [page],
})

// The literal union UBadge['color'] currently accepts (@nuxt/ui 4.5.1).
type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

function eventColor(type: string): BadgeColor {
  const colors: Record<string, BadgeColor> = {
    login: 'info',
    logout: 'neutral',
    otp_request: 'warning',
    analyze: 'success',
  }
  return colors[type] || 'neutral'
}

// A plain assignment expression (`@click="page = p"`) types as
// `(event) => number` under vue-tsc (the assignment's value), which UButton's
// click handler prop (`(event) => void | Promise<void>`) rejects; a real
// function body has no such implicit return.
function goToPage(p: number) {
  page.value = p
}
</script>

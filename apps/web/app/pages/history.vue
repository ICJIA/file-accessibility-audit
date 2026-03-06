<template>
  <div>
    <h2 class="text-xl font-semibold mb-6">Admin — Audit Log</h2>

    <div v-if="pending" class="text-neutral-500">Loading…</div>

    <div v-else-if="error" class="text-red-400">
      {{ error.data?.error || 'Failed to load audit logs' }}
    </div>

    <div v-else-if="data">
      <div class="rounded-xl border border-[#222222] overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-[#111111] text-neutral-400">
            <tr>
              <th class="text-left px-4 py-3 font-medium">Event</th>
              <th class="text-left px-4 py-3 font-medium">Email</th>
              <th class="text-left px-4 py-3 font-medium">Filename</th>
              <th class="text-center px-4 py-3 font-medium">Grade</th>
              <th class="text-right px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#222222]">
            <tr v-for="row in data.data" :key="row.id" class="hover:bg-[#111111]/50 transition-colors">
              <td class="px-4 py-3">
                <UBadge
                  :color="eventColor(row.event_type)"
                  variant="subtle"
                  size="xs"
                >
                  {{ row.event_type }}
                </UBadge>
              </td>
              <td class="px-4 py-3 text-neutral-300">{{ row.email }}</td>
              <td class="px-4 py-3 text-white">{{ row.filename || '—' }}</td>
              <td class="text-center px-4 py-3">{{ row.grade || '—' }}</td>
              <td class="text-right px-4 py-3 text-neutral-400">
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
          @click="page = p"
        >
          {{ p }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const page = ref(1)

const { data, pending, error } = useFetch('/api/logs', {
  query: { page, limit: 50 },
  credentials: 'include',
  watch: [page],
})

function eventColor(type: string): string {
  const colors: Record<string, string> = {
    login: 'info',
    logout: 'neutral',
    otp_request: 'warning',
    analyze: 'success',
  }
  return colors[type] || 'neutral'
}
</script>

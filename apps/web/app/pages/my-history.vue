<template>
  <div>
    <h2 class="text-xl font-semibold mb-6">My Analysis History</h2>

    <div v-if="pending" class="text-[var(--text-muted)]">Loading…</div>

    <div v-else-if="!data?.data?.length" class="text-[var(--text-muted)]">
      No analyses yet. <NuxtLink to="/" class="text-[var(--accent-green)] hover:underline">Analyze a PDF</NuxtLink> to get started.
    </div>

    <div v-else>
      <div class="rounded-xl border border-[var(--border)] overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-[var(--surface-card)] text-[var(--text-muted)]">
            <tr>
              <th class="text-left px-4 py-3 font-medium">Filename</th>
              <th class="text-center px-4 py-3 font-medium">Score</th>
              <th class="text-center px-4 py-3 font-medium">Grade</th>
              <th class="text-right px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border)]">
            <tr v-for="row in data.data" :key="row.id" class="hover:bg-[var(--surface-card-50)] transition-colors">
              <td class="px-4 py-3 text-[var(--text-heading)]">{{ row.filename }}</td>
              <td class="text-center px-4 py-3">{{ row.score ?? '—' }}</td>
              <td class="text-center px-4 py-3">
                <span
                  v-if="row.grade"
                  class="inline-block w-8 h-8 rounded-full text-sm font-bold leading-8 text-center"
                  :style="{ backgroundColor: gradeColor(row.grade) + '20', color: gradeColor(row.grade) }"
                >
                  {{ row.grade }}
                </span>
              </td>
              <td class="text-right px-4 py-3 text-[var(--text-muted)]">{{ formatDate(row.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
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

const { data, pending } = useFetch('/api/my-history', {
  query: { page, limit: 20 },
  credentials: 'include',
  watch: [page],
})

const gradeColors: Record<string, string> = {
  A: '#22c55e', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

function gradeColor(grade: string): string {
  return gradeColors[grade] || '#666'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
</script>

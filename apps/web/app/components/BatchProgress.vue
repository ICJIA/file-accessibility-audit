<template>
  <div class="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
    <div class="relative">
      <div class="w-16 h-16 border-4 border-[var(--border)] border-t-green-500 rounded-full animate-spin" />
    </div>

    <div class="text-center space-y-2">
      <p class="text-lg font-medium text-[var(--text-heading)]">Analyzing {{ items.length }} files</p>
      <p class="text-sm text-[var(--text-muted)]">{{ doneCount }} of {{ items.length }} complete</p>
    </div>

    <div class="w-full max-w-md space-y-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border)] px-4 py-2.5"
      >
        <!-- Status icon -->
        <div class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          <div v-if="item.status === 'processing'" class="w-4 h-4 border-2 border-[var(--border)] border-t-green-500 rounded-full animate-spin" />
          <svg v-else-if="item.status === 'done'" class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <svg v-else-if="item.status === 'error'" class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div v-else class="w-3 h-3 rounded-full bg-[var(--border)]" />
        </div>

        <!-- Filename -->
        <span class="flex-1 text-sm truncate" :class="item.status === 'queued' ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'">
          {{ item.filename }}
        </span>

        <!-- Grade badge (when done) -->
        <span
          v-if="item.status === 'done' && item.result?.grade"
          class="flex-shrink-0 inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center"
          :style="{ backgroundColor: gradeColor(item.result.grade) + '20', color: gradeColor(item.result.grade) }"
        >{{ item.result.grade }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface BatchItem {
  id: string
  filename: string
  file: File
  status: 'queued' | 'processing' | 'done' | 'error'
  result: any | null
  error: any | null
}

const props = defineProps<{
  items: BatchItem[]
}>()

const doneCount = computed(() =>
  props.items.filter(i => i.status === 'done' || i.status === 'error').length
)

const gradeColors: Record<string, string> = {
  A: '#22c55e', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

function gradeColor(grade: string): string {
  return gradeColors[grade] || '#666'
}
</script>

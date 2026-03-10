<template>
  <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
    <div class="px-4 py-4 border-b border-[var(--border-subtle)]">
      <div class="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          class="mt-1"
          :checked="selected"
          @change="$emit('toggle-selected', item.id)"
        >

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-medium text-[var(--text-heading)] break-all">{{ item.filename }}</p>
            <span class="text-xs px-2 py-0.5 rounded-full capitalize" :class="statusClass">
              {{ item.state }}
            </span>
            <span v-if="item.grade" class="text-xs px-2 py-0.5 rounded-full" :style="{ backgroundColor: gradeColor + '20', color: gradeColor }">
              Grade {{ item.grade }}
            </span>
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            {{ formatDate(item.updatedAt) }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton v-if="item.canRetry" size="xs" variant="soft" color="neutral" @click="$emit('retry', item.id)">
            Retry
          </UButton>
          <UButton v-if="item.canCancel" size="xs" variant="soft" color="neutral" @click="$emit('cancel', item.id)">
            Cancel
          </UButton>
          <UButton v-if="item.canDownload" size="xs" variant="soft" color="neutral" @click="$emit('download', item.id)">
            Download PDF
          </UButton>
          <UButton size="xs" variant="ghost" color="neutral" @click="$emit('delete', item.id)">
            Delete
          </UButton>
          <UButton
            v-if="item.result"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Hide Details' : 'Show Details' }}
          </UButton>
        </div>
      </div>

      <div class="grid gap-3 mt-4 md:grid-cols-2">
        <div>
          <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Upload</span>
            <span>{{ uploadProgress }}%</span>
          </div>
          <div class="h-2 rounded-full bg-[var(--surface-icon)] overflow-hidden">
            <div class="h-full rounded-full bg-blue-500 transition-all" :style="{ width: `${uploadProgress}%` }" />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>{{ item.processingStage || 'Processing' }}</span>
            <span>{{ item.processingProgress }}%</span>
          </div>
          <div class="h-2 rounded-full bg-[var(--surface-icon)] overflow-hidden">
            <div class="h-full rounded-full bg-green-500 transition-all" :style="{ width: `${item.processingProgress}%` }" />
          </div>
        </div>
      </div>

      <div v-if="item.error" class="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {{ item.error.error || item.error.details || 'This item failed.' }}
      </div>
    </div>

    <div v-if="expanded && item.result" class="p-5 space-y-5">
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card-alt)] p-5">
        <ScoreCard :result="item.result" />
      </div>

      <div class="space-y-3">
        <CategoryRow
          v-for="category in item.result.categories"
          :key="category.id"
          :category="category"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueItem } from '../composables/useClientQueue'

const props = defineProps<{
  item: QueueItem
  selected: boolean
  uploadProgress: number
}>()

defineEmits<{
  'toggle-selected': [itemId: string]
  retry: [itemId: string]
  cancel: [itemId: string]
  delete: [itemId: string]
  download: [itemId: string]
}>()

const expanded = ref(false)

const gradeColors: Record<string, string> = {
  A: '#22c55e',
  B: '#14b8a6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
}

const gradeColor = computed(() => gradeColors[props.item.grade || ''] || '#94a3b8')

const statusClass = computed(() => {
  const map: Record<string, string> = {
    complete: 'bg-green-500/15 text-green-300',
    processing: 'bg-blue-500/15 text-blue-300',
    queued: 'bg-yellow-500/15 text-yellow-300',
    uploading: 'bg-cyan-500/15 text-cyan-300',
    failed: 'bg-red-500/15 text-red-300',
    cancelled: 'bg-slate-500/15 text-slate-300',
  }
  return map[props.item.state] || 'bg-slate-500/15 text-slate-300'
})

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

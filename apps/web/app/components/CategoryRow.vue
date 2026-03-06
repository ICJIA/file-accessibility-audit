<template>
  <div class="rounded-xl border border-[#222222] bg-[#111111] overflow-hidden">
    <button
      class="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#1a1a1a] transition-colors"
      @click="expanded = !expanded"
    >
      <!-- Category name -->
      <span class="flex-shrink-0 w-44 text-sm font-medium text-white">
        {{ category.label }}
      </span>

      <!-- Score bar -->
      <div class="flex-1 h-2.5 bg-[#222222] rounded-full overflow-hidden">
        <div
          v-if="category.score !== null"
          class="h-full rounded-full transition-all duration-700 ease-out"
          :style="{ width: category.score + '%', backgroundColor: scoreColor }"
        />
      </div>

      <!-- Score number -->
      <span class="w-10 text-right text-sm font-mono" :style="{ color: scoreColor }">
        {{ category.score !== null ? category.score : 'N/A' }}
      </span>

      <!-- Grade badge -->
      <span
        v-if="category.grade"
        class="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
        :style="{ backgroundColor: scoreColor + '20', color: scoreColor }"
      >
        {{ category.grade }}
      </span>
      <span v-else class="w-7 h-7 flex items-center justify-center text-xs text-neutral-500 flex-shrink-0">
        —
      </span>

      <!-- Severity badge -->
      <UBadge
        v-if="category.severity"
        :color="severityColor"
        variant="subtle"
        size="xs"
        class="w-20 justify-center flex-shrink-0"
      >
        {{ category.severity }}
      </UBadge>
      <span v-else class="w-20 text-center text-xs text-neutral-500 flex-shrink-0">N/A</span>

      <!-- Chevron -->
      <svg
        class="w-4 h-4 text-neutral-500 transition-transform flex-shrink-0"
        :class="expanded ? 'rotate-180' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Findings -->
    <div v-if="expanded" class="px-5 pb-4 border-t border-[#222222]">
      <ul class="mt-3 space-y-2">
        <li
          v-for="(finding, i) in category.findings"
          :key="i"
          class="text-sm text-neutral-400 flex gap-2"
        >
          <span class="flex-shrink-0 mt-0.5">
            {{ findingIcon(finding) }}
          </span>
          <span>{{ finding }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  category: {
    id: string
    label: string
    score: number | null
    grade: string | null
    severity: string | null
    findings: string[]
  }
}>()

const expanded = ref(false)

const gradeColors: Record<string, string> = {
  A: '#22c55e', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

const scoreColor = computed(() => {
  if (props.category.grade) return gradeColors[props.category.grade] || '#666'
  return '#555'
})

const severityColorMap: Record<string, string> = {
  Pass: 'success',
  Minor: 'info',
  Moderate: 'warning',
  Critical: 'error',
}

const severityColor = computed(() => severityColorMap[props.category.severity || ''] || 'neutral')

function findingIcon(finding: string): string {
  if (finding.toLowerCase().includes('not found') || finding.toLowerCase().includes('no ') || finding.toLowerCase().includes('missing')) {
    return '✗'
  }
  if (finding.toLowerCase().includes('found') || finding.toLowerCase().includes('present') || finding.toLowerCase().includes('all ')) {
    return '✓'
  }
  return '•'
}
</script>

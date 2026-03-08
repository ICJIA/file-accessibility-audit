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
      <span v-else class="w-7 h-7 flex items-center justify-center text-xs text-neutral-400 flex-shrink-0">
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
      <span v-else class="w-20 text-center text-xs text-neutral-400 flex-shrink-0">N/A</span>

      <!-- Chevron -->
      <svg
        class="w-4 h-4 text-neutral-400 transition-transform flex-shrink-0"
        :class="expanded ? 'rotate-180' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Findings -->
    <div v-if="expanded" class="px-5 pb-5 border-t border-[#222222]">
      <!-- Explanation -->
      <div v-if="category.explanation" class="mt-4 mb-4 text-sm text-neutral-400 bg-[#0d0d0d] rounded-lg px-4 py-3 border border-[#1a1a1a]">
        <span class="text-neutral-400 font-medium">What this checks:</span>
        {{ category.explanation }}
      </div>

      <ul class="space-y-2">
        <li
          v-for="(finding, i) in category.findings"
          :key="i"
          class="text-sm text-neutral-400 flex gap-2"
        >
          <span
            class="flex-shrink-0 mt-0.5 font-bold"
            :class="findingIconColor(finding)"
          >
            {{ findingIcon(finding) }}
          </span>
          <span>{{ finding }}</span>
        </li>
      </ul>

      <!-- Help links -->
      <div v-if="category.helpLinks?.length" class="mt-4 pt-3 border-t border-[#1a1a1a]">
        <span class="text-xs font-medium text-neutral-400 uppercase tracking-wide">Learn more</span>
        <div class="mt-2 flex flex-wrap gap-2">
          <a
            v-for="link in category.helpLinks"
            :key="link.url"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
          >
            {{ link.label }}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
      </div>
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
    explanation?: string
    helpLinks?: Array<{ label: string; url: string }>
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

function isNa(): boolean {
  return props.category.score === null
}

function isFail(finding: string): boolean {
  if (isNa()) return false // N/A categories are never failures
  const f = finding.toLowerCase()
  return f.includes('not found') || f.includes('no ') || f.includes('missing') || f.includes('not tagged') || f.includes('no extractable') || f.includes('unlabeled')
}

function isPass(finding: string): boolean {
  const f = finding.toLowerCase()
  return f.includes('found') || f.includes('present') || f.includes('all ') || f.includes('declared') || f.includes('title:') || f.includes('author:')
}

function findingIcon(finding: string): string {
  if (isFail(finding)) return '✗'
  if (isPass(finding)) return '✓'
  if (isNa()) return '–'
  return '•'
}

function findingIconColor(finding: string): string {
  if (isFail(finding)) return 'text-red-500'
  if (isPass(finding)) return 'text-green-500'
  if (isNa()) return 'text-yellow-500'
  return 'text-neutral-400'
}
</script>

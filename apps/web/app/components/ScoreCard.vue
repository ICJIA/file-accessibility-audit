<template>
  <div class="text-center space-y-4">
    <p class="text-sm text-neutral-400">
      {{ result.filename }} — {{ result.pageCount }} page{{ result.pageCount !== 1 ? 's' : '' }}
    </p>

    <!-- Grade circle -->
    <div class="flex justify-center">
      <div
        class="w-40 h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: gradeColor, backgroundColor: gradeColor + '15' }"
      >
        <span
          class="text-7xl font-black"
          :style="{ color: gradeColor }"
        >
          {{ result.grade }}
        </span>
      </div>
    </div>

    <!-- Score -->
    <p class="text-3xl font-bold">
      {{ result.overallScore }}<span class="text-lg text-neutral-500">/100</span>
    </p>

    <!-- Label -->
    <p class="text-sm font-medium" :style="{ color: gradeColor }">
      {{ gradeLabel }}
    </p>

    <!-- Summary -->
    <p class="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
      {{ result.executiveSummary }}
    </p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  result: {
    filename: string
    pageCount: number
    overallScore: number
    grade: string
    executiveSummary: string
  }
}>()

const gradeMap: Record<string, { color: string; label: string }> = {
  A: { color: '#22c55e', label: 'Excellent' },
  B: { color: '#14b8a6', label: 'Good' },
  C: { color: '#eab308', label: 'Needs Improvement' },
  D: { color: '#f97316', label: 'Poor' },
  F: { color: '#ef4444', label: 'Failing' },
}

const gradeColor = computed(() => gradeMap[props.result.grade]?.color || '#666')
const gradeLabel = computed(() => gradeMap[props.result.grade]?.label || '')
</script>

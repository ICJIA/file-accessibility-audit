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
      {{ result.overallScore }}<span class="text-lg text-neutral-300">/100</span>
    </p>

    <!-- Label -->
    <p class="text-sm font-medium" :style="{ color: gradeColor }">
      {{ gradeLabel }}
    </p>

    <!-- Summary -->
    <p class="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed" v-html="highlightedSummary" />

    <!-- Caveat -->
    <div class="max-w-lg mx-auto mt-5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-5 py-4">
      <p class="text-xs text-neutral-300 leading-relaxed">
        This automated audit provides a reliable initial assessment, but it cannot catch every issue. For the most thorough evaluation, test your PDF directly in
        <a href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">Adobe Acrobat's Accessibility Checker</a>.
        Whenever possible, ensure your source document (Word, InDesign, etc.) is accessible before generating the PDF — retrofitting accessibility after export is more difficult and less reliable.
      </p>
    </div>
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightSeverities(raw: string): string {
  let text = escapeHtml(raw)
  // Highlight "critical" phrases in red
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: #ef4444; font-weight: 600;">$1</span>'
  )
  // Highlight "moderate" phrases in yellow
  text = text.replace(
    /(\d+ moderate(?: accessibility)? issues?)/gi,
    '<span style="color: #eab308; font-weight: 600;">$1</span>'
  )
  return text
}

const highlightedSummary = computed(() => highlightSeverities(props.result.executiveSummary))
</script>

<template>
  <div class="text-center space-y-4">
    <!-- Verdict banner -->
    <div
      role="status"
      aria-live="polite"
      data-testid="verdict-banner"
      class="flex items-center justify-center gap-3 sm:gap-4 px-6 py-5 sm:px-10 sm:py-7 rounded-2xl text-2xl sm:text-3xl font-extrabold tracking-tight text-white shadow-lg ring-1 ring-white/10"
      :style="{ backgroundColor: verdictColor }"
    >
      <!-- Thumbs up (accessible) -->
      <svg
        v-if="isAccessible"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-sm"
        aria-hidden="true"
      >
        <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
      </svg>
      <!-- Thumbs down (not accessible) -->
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-sm"
        aria-hidden="true"
      >
        <path d="M15.73 5.25h1.035A7.465 7.465 0 0118 9.375a7.465 7.465 0 01-1.235 4.125h-.148c-.806 0-1.534.446-2.031 1.08a9.04 9.04 0 01-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 00-.322 1.672V21a.75.75 0 01-.75.75 2.25 2.25 0 01-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H3.622c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 011.5 12c0-2.848.992-5.464 2.649-7.521.388-.482.987-.729 1.605-.729H9.77a4.5 4.5 0 011.423.23l3.114 1.04a4.5 4.5 0 001.423.23zM21.669 13.023c.536-1.362.831-2.845.831-4.398 0-1.22-.182-2.398-.52-3.507-.26-.85-1.084-1.368-1.973-1.368H19.1c-.445 0-.72.498-.523.898.591 1.2.924 2.55.924 3.977a8.959 8.959 0 01-1.302 4.666c-.245.403.028.959.5.959h1.053c.832 0 1.612-.453 1.918-1.227z" />
      </svg>
      <span>{{ verdictText }}</span>
    </div>

    <p class="text-sm text-[var(--text-muted)]">
      {{ result.filename }} — {{ result.pageCount }} page{{ result.pageCount !== 1 ? 's' : '' }}
    </p>

    <!-- Grade circle -->
    <div class="flex justify-center">
      <div
        class="w-28 h-28 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: gradeColor, backgroundColor: gradeColor + '15' }"
      >
        <span
          class="text-5xl sm:text-7xl font-black"
          :style="{ color: gradeColor }"
        >
          {{ result.grade }}
        </span>
      </div>
    </div>

    <!-- Score -->
    <p class="text-3xl font-bold">
      {{ result.overallScore }}<span class="text-lg text-[var(--text-secondary)]">/100</span>
    </p>

    <!-- Label -->
    <p class="text-sm font-medium" :style="{ color: gradeColor }">
      {{ gradeLabel }}
    </p>

    <!-- Verdict explanation (counts) -->
    <p
      v-if="verdictExplanation"
      data-testid="verdict-explanation"
      class="text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed"
      v-html="verdictExplanation"
    />

    <!-- Summary -->
    <p class="text-sm text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed" v-html="highlightedSummary" />

    <!-- Caveat -->
    <div class="max-w-lg mx-auto mt-5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border-alt)] px-5 py-4">
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
        This automated audit provides a reliable initial assessment, but it cannot catch every issue. For the most thorough evaluation, test your PDF directly in
        <a href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)] underline">Adobe Acrobat's Accessibility Checker</a>.
        Whenever possible, ensure your source document (Word, InDesign, etc.) is accessible before generating the PDF — retrofitting accessibility after export is more difficult and less reliable.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Category {
  id: string
  label: string
  score: number | null
  grade: string | null
  severity: string | null
  findings?: string[]
}

const props = defineProps<{
  result: {
    filename: string
    pageCount: number
    overallScore: number
    grade: string
    executiveSummary: string
    categories?: Category[]
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

const isAccessible = computed(() => props.result.grade === 'A' || props.result.grade === 'B')
const verdictText = computed(() => isAccessible.value ? 'This file is accessible' : 'This file is not accessible')
const verdictColor = computed(() => isAccessible.value ? '#15803d' : '#b91c1c')

const severityCounts = computed(() => {
  const cats = props.result.categories || []
  return {
    critical: cats.filter(c => c.severity === 'Critical').length,
    moderate: cats.filter(c => c.severity === 'Moderate').length,
  }
})

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
}

const verdictExplanation = computed(() => {
  if (!props.result.categories || props.result.categories.length === 0) return ''
  const { critical, moderate } = severityCounts.value
  const parts: string[] = []
  if (critical > 0) {
    parts.push(`<span style="color: var(--icon-fail); font-weight: 600;">${pluralize(critical, 'critical issue')}</span>`)
  }
  if (moderate > 0) {
    parts.push(`<span style="color: var(--icon-na); font-weight: 600;">${pluralize(moderate, 'moderate issue')}</span>`)
  }

  if (isAccessible.value) {
    if (parts.length === 0) {
      return 'Every scored category passed with no critical or moderate issues — this document is in strong shape for WCAG 2.1 AA and ADA Title II.'
    }
    return `The document passes overall, though ${joinParts(parts)} remain in individual categories. See the detailed findings below to take it from compliant to polished.`
  }

  if (parts.length === 0) {
    return 'Several categories are close to passing but fall short of WCAG 2.1 AA thresholds. Review the detailed findings below to bring this document into compliance.'
  }
  return `Resolving ${joinParts(parts)} in the detailed findings below will move this document toward WCAG 2.1 AA and ADA Title II compliance.`
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightSeverities(raw: string): string {
  let text = escapeHtml(raw)
  // Highlight "critical" phrases in red
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-fail); font-weight: 600;">$1</span>'
  )
  // Highlight "moderate" phrases in yellow
  text = text.replace(
    /(\d+ moderate(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-na); font-weight: 600;">$1</span>'
  )
  return text
}

const highlightedSummary = computed(() => highlightSeverities(props.result.executiveSummary))
</script>

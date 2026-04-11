<template>
  <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
    <button
      class="w-full px-3 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left hover:bg-[var(--surface-hover)] transition-colors"
      @click="expanded = !expanded"
    >
      <!-- Mobile: category name + chevron row -->
      <div class="flex items-center justify-between sm:contents">
        <!-- Category name -->
        <span class="flex-shrink-0 sm:w-44 text-sm font-medium text-[var(--text-heading)]">
          {{ category.label }}
        </span>

        <!-- Chevron (visible on mobile in the name row) -->
        <svg
          class="w-4 h-4 text-[var(--text-muted)] transition-transform flex-shrink-0 sm:hidden"
          :class="expanded ? 'rotate-180' : ''"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <!-- Score bar + badges row -->
      <div class="flex items-center gap-2 sm:gap-4 sm:contents w-full">
        <!-- Score bar -->
        <div class="flex-1 h-2.5 bg-[var(--surface-icon)] rounded-full overflow-hidden">
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
        <span v-else class="w-7 h-7 flex items-center justify-center text-xs text-[var(--text-muted)] flex-shrink-0">
          —
        </span>

        <!-- Severity badge -->
        <UBadge
          v-if="category.severity"
          :color="severityColor"
          variant="subtle"
          size="xs"
          class="w-20 justify-center flex-shrink-0 hidden sm:inline-flex"
        >
          {{ category.severity }}
        </UBadge>
        <span v-else class="w-20 text-center text-xs text-[var(--text-muted)] flex-shrink-0 hidden sm:inline">N/A</span>

        <!-- Chevron (desktop only) -->
        <svg
          class="w-4 h-4 text-[var(--text-muted)] transition-transform flex-shrink-0 hidden sm:block"
          :class="expanded ? 'rotate-180' : ''"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Findings -->
    <div v-if="expanded" class="px-3 sm:px-5 pb-4 sm:pb-5 border-t border-[var(--border)]">
      <!-- Explanation -->
      <div v-if="category.explanation" class="mt-4 mb-4 text-sm text-[var(--text-muted)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)]">
        <span class="text-[var(--text-muted)] font-medium">What this checks:</span>
        {{ category.explanation }}
      </div>

      <ul class="space-y-2 max-h-[32rem] overflow-y-auto">
        <li
          v-for="(finding, i) in splitAcrobatGuide(category.findings).regular"
          :key="i"
          :class="finding.startsWith('---')
            ? 'text-sm text-[var(--text-secondary)] font-semibold mt-2 pt-2 border-t border-[var(--border-subtle)]'
            : finding.startsWith('  ')
              ? 'text-xs font-mono text-[var(--text-muted)] pl-6 opacity-80'
              : isGuidanceFinding(finding)
                ? 'text-sm text-[var(--text-muted)] flex gap-2 bg-amber-500/8 rounded px-2 py-1.5 border-l-2 border-amber-500/40'
                : 'text-sm text-[var(--text-muted)] flex gap-2'"
        >
          <template v-if="finding.startsWith('---')">
            {{ finding.replace(/^-{3}\s*/, '').replace(/\s*-{3}$/, '') }}
          </template>
          <template v-else-if="finding.startsWith('  ')">
            {{ finding }}
          </template>
          <template v-else-if="isGuidanceFinding(finding)">
            <span class="flex-shrink-0 mt-0.5 text-amber-400">&#9656;</span>
            <span>{{ finding }}</span>
          </template>
          <template v-else>
            <span
              class="flex-shrink-0 mt-0.5 font-bold"
              :style="findingIconStyle(finding)"
            >
              {{ findingIcon(finding) }}
            </span>
            <span>{{ finding }}</span>
          </template>
        </li>
      </ul>

      <!-- Adobe Acrobat Remediation Guide -->
      <div
        v-if="splitAcrobatGuide(category.findings).acrobat.length"
        class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden"
      >
        <div class="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
          <svg class="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.194-.14 1.743" />
          </svg>
          <span class="text-sm font-semibold text-amber-300">How to Fix in Adobe Acrobat</span>
        </div>
        <ol class="px-4 py-3 space-y-2">
          <li
            v-for="(step, j) in splitAcrobatGuide(category.findings).acrobat"
            :key="j"
            class="text-sm text-[var(--text-muted)] flex gap-2.5"
          >
            <span class="flex-shrink-0 text-amber-400/70 font-mono text-xs mt-0.5 w-4 text-right">{{ j + 1 }}.</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>

      <!-- Help links -->
      <div v-if="category.helpLinks?.length" class="mt-4 pt-3 border-t border-[var(--border-subtle)]">
        <span class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Learn more</span>
        <div class="mt-2 flex flex-wrap gap-2">
          <a
            v-for="link in category.helpLinks"
            :key="link.url"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
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

const showAdvanced = ref(false)

function isAdvancedFinding(finding: string): boolean {
  return finding.startsWith('---') || finding.startsWith('  ')
}

function hasAdvancedFindings(findings: string[]): boolean {
  return findings.some(f => isAdvancedFinding(f))
}

function filteredFindings(findings: string[]): string[] {
  if (showAdvanced.value) return findings
  return findings.filter(f => !isAdvancedFinding(f))
}

function isGuidanceFinding(finding: string): boolean {
  const f = finding.toLowerCase()
  return f.startsWith('how to fix:') || f.startsWith('tip:') || f.startsWith('fix:') || f.startsWith('note:') || f.startsWith('review these')
}

function isAcrobatHeading(finding: string): boolean {
  return finding.startsWith('---') && finding.toLowerCase().includes('adobe acrobat')
}

function splitAcrobatGuide(findings: string[]): { regular: string[], acrobat: string[] } {
  const filtered = filteredFindings(findings)
  const idx = filtered.findIndex(f => isAcrobatHeading(f))
  if (idx === -1) return { regular: filtered, acrobat: [] }
  return { regular: filtered.slice(0, idx), acrobat: filtered.slice(idx + 1) }
}

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

function findingIconStyle(finding: string): Record<string, string> {
  if (isFail(finding)) return { color: 'var(--icon-fail)' }
  if (isPass(finding)) return { color: 'var(--icon-pass)' }
  if (isNa()) return { color: 'var(--icon-na)' }
  return { color: 'var(--text-muted)' }
}
</script>

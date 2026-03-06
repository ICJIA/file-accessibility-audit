<template>
  <div class="min-h-screen bg-[#0a0a0a] text-white">
    <div class="max-w-4xl mx-auto px-6 py-10">

      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p class="text-neutral-400">Loading report...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <div class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
          <span class="text-3xl">!</span>
        </div>
        <h2 class="text-xl font-semibold text-red-400 mb-2">Report Not Available</h2>
        <p class="text-neutral-400 text-sm">{{ errorMessage }}</p>
      </div>

      <!-- Report -->
      <div v-else-if="data">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold mb-1">PDF Accessibility Report</h1>
          <p class="text-sm text-neutral-500">
            Shared by {{ data.sharedBy }} on {{ formatDate(data.createdAt) }}
          </p>
          <p class="text-xs text-neutral-600 mt-1">
            Link expires {{ formatDate(data.expiresAt) }}
          </p>
        </div>

        <!-- Score Hero -->
        <div class="text-center mb-8 rounded-xl border border-[#222222] bg-[#111111] p-8">
          <p class="text-sm text-neutral-400 mb-4">
            {{ data.report.filename }} — {{ data.report.pageCount }} page{{ data.report.pageCount !== 1 ? 's' : '' }}
          </p>

          <div class="flex justify-center mb-4">
            <div
              class="w-32 h-32 rounded-full flex items-center justify-center border-4"
              :style="{ borderColor: gradeColor, backgroundColor: gradeColor + '15' }"
            >
              <span class="text-6xl font-black" :style="{ color: gradeColor }">
                {{ data.report.grade }}
              </span>
            </div>
          </div>

          <p class="text-2xl font-bold">
            {{ data.report.overallScore }}<span class="text-base text-neutral-500">/100</span>
          </p>
          <p class="text-sm font-medium mt-1" :style="{ color: gradeColor }">
            {{ gradeLabels[data.report.grade] || '' }}
          </p>
          <p class="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed mt-4">
            {{ data.report.executiveSummary }}
          </p>
        </div>

        <!-- Scanned warning -->
        <div v-if="data.report.isScanned" class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
          <p class="text-orange-300 font-medium text-sm">
            This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required.
          </p>
        </div>

        <!-- Warnings -->
        <div v-if="data.report.warnings?.length" class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p v-for="w in data.report.warnings" :key="w" class="text-yellow-300 text-sm">{{ w }}</p>
        </div>

        <!-- Score Table -->
        <div class="mb-8 rounded-xl border border-[#222222] bg-[#111111] overflow-hidden">
          <div class="px-5 py-3 border-b border-[#222222]">
            <h2 class="text-sm font-semibold text-neutral-300">Category Scores</h2>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#222222] text-neutral-500 text-xs uppercase tracking-wide">
                <th class="text-left px-5 py-2 font-medium">Category</th>
                <th class="text-center px-3 py-2 font-medium">Score</th>
                <th class="text-center px-3 py-2 font-medium">Grade</th>
                <th class="text-center px-3 py-2 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cat in data.report.categories"
                :key="cat.id"
                class="border-b border-[#1a1a1a] last:border-0"
              >
                <td class="px-5 py-2.5 text-neutral-300">{{ cat.label }}</td>
                <td class="text-center px-3 py-2.5 font-mono" :style="{ color: catColor(cat) }">
                  {{ cat.score !== null ? cat.score : 'N/A' }}
                </td>
                <td class="text-center px-3 py-2.5">
                  <span
                    v-if="cat.grade"
                    class="inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center"
                    :style="{ backgroundColor: catColor(cat) + '20', color: catColor(cat) }"
                  >{{ cat.grade }}</span>
                  <span v-else class="text-neutral-600">—</span>
                </td>
                <td class="text-center px-3 py-2.5">
                  <span
                    v-if="cat.severity"
                    class="text-xs px-2 py-0.5 rounded-full"
                    :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
                  >{{ cat.severity }}</span>
                  <span v-else class="text-neutral-600 text-xs">N/A</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detailed Findings -->
        <h2 class="text-lg font-semibold mb-4">Detailed Findings</h2>

        <div class="space-y-4">
          <div
            v-for="cat in data.report.categories"
            :key="cat.id"
            class="rounded-xl border border-[#222222] bg-[#111111] p-5"
          >
            <div class="flex items-center gap-3 mb-3">
              <h3 class="font-semibold text-white">{{ cat.label }}</h3>
              <span class="text-sm font-mono" :style="{ color: catColor(cat) }">
                {{ cat.score !== null ? `${cat.score}/100` : 'N/A' }}
              </span>
              <span
                v-if="cat.severity"
                class="text-xs px-2 py-0.5 rounded-full ml-auto"
                :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
              >{{ cat.severity }}</span>
            </div>

            <p v-if="cat.explanation" class="text-sm text-neutral-500 bg-[#0d0d0d] rounded-lg px-4 py-3 border border-[#1a1a1a] mb-3">
              <span class="text-neutral-400 font-medium">What this checks:</span>
              {{ cat.explanation }}
            </p>

            <ul class="space-y-1.5">
              <li
                v-for="(finding, i) in cat.findings"
                :key="i"
                class="text-sm text-neutral-400 flex gap-2"
              >
                <span
                  class="flex-shrink-0 mt-0.5 font-bold"
                  :class="findingIconColor(cat, finding)"
                >{{ findingIcon(cat, finding) }}</span>
                <span>{{ finding }}</span>
              </li>
            </ul>

            <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[#1a1a1a]">
              <span class="text-xs font-medium text-neutral-500 uppercase tracking-wide">Learn more</span>
              <div class="mt-2 flex flex-wrap gap-2">
                <a
                  v-for="link in cat.helpLinks"
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

        <!-- Footer -->
        <div class="mt-10 pt-6 border-t border-[#222222] text-center">
          <p class="text-xs text-neutral-600">
            Report generated by File Accessibility Audit Tool — {{ formatDate(data.createdAt) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const id = route.params.id as string

const { data, pending, error } = await useFetch(`/api/reports/${id}`)

const errorMessage = computed(() => {
  if (!error.value) return ''
  const status = (error.value as any)?.statusCode
  if (status === 410) return 'This report link has expired.'
  if (status === 404) return 'This report was not found. It may have been removed or the link may be incorrect.'
  return 'Unable to load this report. Please try again later.'
})

const gradeLabels: Record<string, string> = {
  A: 'Excellent', B: 'Good', C: 'Needs Improvement', D: 'Poor', F: 'Failing',
}

const gradeColors: Record<string, string> = {
  A: '#22c55e', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

const gradeColor = computed(() => {
  return gradeColors[(data.value as any)?.report?.grade] || '#666'
})

function catColor(cat: any): string {
  if (cat.grade) return gradeColors[cat.grade] || '#666'
  return '#555'
}

function sevColor(severity: string): string {
  const map: Record<string, string> = {
    Pass: '#22c55e', Minor: '#3b82f6', Moderate: '#eab308', Critical: '#ef4444',
  }
  return map[severity] || '#999'
}

function isFail(cat: any, finding: string): boolean {
  if (cat.score === null) return false
  const f = finding.toLowerCase()
  return f.includes('not found') || f.includes('no ') || f.includes('missing') || f.includes('not tagged') || f.includes('no extractable') || f.includes('unlabeled')
}

function isPass(finding: string): boolean {
  const f = finding.toLowerCase()
  return f.includes('found') || f.includes('present') || f.includes('all ') || f.includes('declared') || f.includes('title:') || f.includes('author:')
}

function findingIcon(cat: any, finding: string): string {
  if (isFail(cat, finding)) return '✗'
  if (isPass(finding)) return '✓'
  if (cat.score === null) return '–'
  return '•'
}

function findingIconColor(cat: any, finding: string): string {
  if (isFail(cat, finding)) return 'text-red-500'
  if (isPass(finding)) return 'text-green-500'
  if (cat.score === null) return 'text-yellow-500'
  return 'text-neutral-500'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}
</script>

<template>
  <div class="min-h-screen bg-[#0a0a0a] text-white">
    <main class="max-w-4xl mx-auto px-6 py-10">

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
          <h1 class="text-2xl font-bold mb-1">{{ appName.replace('Audit', 'Report') }}</h1>
          <p class="text-sm text-neutral-300 mt-2">
            <a :href="auditUrl" class="text-blue-400 hover:text-blue-300 underline transition-colors">{{ appName }}</a>
          </p>
          <p class="text-sm text-neutral-300 mt-2">
            {{ data.sharedBy && data.sharedBy !== 'anonymous' ? `Shared by ${data.sharedBy} on` : 'Shared on' }} {{ formatDate(data.createdAt) }}
          </p>
          <p class="text-xs text-neutral-400 mt-1">
            Shareable links expire after 30 days
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
            {{ data.report.overallScore }}<span class="text-base text-neutral-300">/100</span>
          </p>
          <p class="text-sm font-medium mt-1" :style="{ color: gradeColor }">
            {{ gradeLabels[data.report.grade] || '' }}
          </p>
          <p class="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed mt-4" v-html="highlightedSummary" />
          <div class="max-w-lg mx-auto mt-5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-5 py-4">
            <p class="text-xs text-neutral-300 leading-relaxed">
              This automated audit provides a reliable initial assessment, but it cannot catch every issue. For the most thorough evaluation, test your PDF directly in
              <a href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">Adobe Acrobat's Accessibility Checker</a>.
              Whenever possible, ensure your source document (Word, InDesign, etc.) is accessible before generating the PDF — retrofitting accessibility after export is more difficult and less reliable.
            </p>
          </div>
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

        <!-- Methodology -->
        <div class="mb-8 rounded-xl border border-[#2a2a2a] bg-[#141414] px-6 py-5">
          <h2 class="text-xs font-semibold text-neutral-300 uppercase tracking-wide mb-3 text-center">How Scores Are Derived</h2>
          <p class="text-xs text-neutral-400 leading-relaxed mb-4 text-center">
            This tool uses established open-source libraries to extract and analyze PDF structure. Scores are calculated against
            <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300">WCAG 2.1 Level AA</a>
            success criteria and
            <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300">ADA Title II</a>
            digital accessibility requirements.
          </p>
          <div class="flex flex-wrap justify-center gap-2 mb-4">
            <a href="https://qpdf.readthedocs.io/" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-neutral-300 bg-[#1a1a1a] hover:bg-[#222222] border border-[#222222] rounded-lg px-3 py-1.5 transition-colors">
              <svg class="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" /></svg>
              QPDF
              <span class="text-neutral-400">— PDF structure &amp; tag extraction</span>
            </a>
            <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-neutral-300 bg-[#1a1a1a] hover:bg-[#222222] border border-[#222222] rounded-lg px-3 py-1.5 transition-colors">
              <svg class="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" /></svg>
              PDF.js <span class="text-neutral-400">(Mozilla)</span>
              <span class="text-neutral-400">— content &amp; metadata analysis</span>
            </a>
          </div>
          <p class="text-xs text-neutral-400 leading-relaxed text-center">
            Nine categories are weighted by impact — from text extractability (the most fundamental barrier) to reading order. Categories that don't apply are excluded and weights renormalized.
            <a :href="auditUrl" class="text-blue-400 hover:text-blue-300">View the full scoring rubric</a> on the audit tool.
          </p>
        </div>

        <!-- Score Table -->
        <div class="mb-8 rounded-xl border border-[#222222] bg-[#111111] overflow-hidden">
          <div class="px-5 py-3 border-b border-[#222222]">
            <h2 class="text-sm font-semibold text-neutral-300">Category Scores</h2>
          </div>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#222222] text-neutral-300 text-xs uppercase tracking-wide">
                <th class="text-left px-5 py-2 font-medium">Category</th>
                <th class="text-center px-3 py-2 font-medium">Score</th>
                <th class="text-center px-3 py-2 font-medium">Grade</th>
                <th class="text-center px-3 py-2 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cat in scoredCategories"
                :key="cat.id"
                class="border-b border-[#1a1a1a] last:border-0"
              >
                <td class="px-5 py-2.5 text-neutral-300">{{ cat.label }}</td>
                <td class="text-center px-3 py-2.5 font-mono" :style="{ color: catColor(cat) }">
                  {{ cat.score }}
                </td>
                <td class="text-center px-3 py-2.5">
                  <span
                    v-if="cat.grade"
                    class="inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center"
                    :style="{ backgroundColor: catColor(cat) + '20', color: catColor(cat) }"
                  >{{ cat.grade }}</span>
                  <span v-else class="text-neutral-400">—</span>
                </td>
                <td class="text-center px-3 py-2.5">
                  <span
                    v-if="cat.severity"
                    class="text-xs px-2 py-0.5 rounded-full"
                    :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
                  >{{ cat.severity }}</span>
                  <span v-else class="text-neutral-400 text-xs">—</span>
                </td>
              </tr>
            </tbody>
            <tbody v-if="naCategories.length">
              <tr class="border-t border-[#222222]">
                <td colspan="4" class="px-5 py-2 text-xs font-medium text-neutral-300 uppercase tracking-wide bg-[#0d0d0d]">
                  Not Included in Scoring
                </td>
              </tr>
              <tr
                v-for="cat in naCategories"
                :key="cat.id"
                class="border-b border-[#1a1a1a] last:border-0"
              >
                <td class="px-5 py-2.5 text-neutral-400">{{ cat.label }}</td>
                <td class="text-center px-3 py-2.5 font-mono text-neutral-400">N/A</td>
                <td class="text-center px-3 py-2.5 text-neutral-400">—</td>
                <td class="text-center px-3 py-2.5 text-neutral-400 text-xs">N/A</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detailed Findings -->
        <h2 class="text-lg font-semibold mb-4">Detailed Findings</h2>

        <div class="space-y-4">
          <div
            v-for="cat in scoredCategories"
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

            <p v-if="cat.explanation" class="text-sm text-neutral-300 bg-[#0d0d0d] rounded-lg px-4 py-3 border border-[#1a1a1a] mb-3">
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
                  :class="findingIconColor(cat)"
                >{{ findingIcon(cat) }}</span>
                <span>{{ finding }}</span>
              </li>
            </ul>

            <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[#1a1a1a]">
              <span class="text-xs font-medium text-neutral-400 uppercase tracking-wide">Learn more</span>
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

        <!-- Not Included in Scoring -->
        <div v-if="naCategories.length">
          <h2 class="text-lg font-semibold mb-4 mt-8 text-neutral-300">Not Included in Scoring</h2>

          <div class="space-y-4">
            <div
              v-for="cat in naCategories"
              :key="cat.id"
              class="rounded-xl border border-[#1a1a1a] bg-[#111111] p-5"
            >
              <div class="flex items-center gap-3 mb-3">
                <h3 class="font-semibold text-neutral-400">{{ cat.label }}</h3>
                <span class="text-sm font-mono text-neutral-400">N/A</span>
              </div>

              <p v-if="cat.explanation" class="text-sm text-neutral-300 bg-[#0d0d0d] rounded-lg px-4 py-3 border border-[#1a1a1a] mb-3">
                <span class="text-neutral-400 font-medium">What this checks:</span>
                {{ cat.explanation }}
              </p>

              <ul class="space-y-1.5">
                <li
                  v-for="(finding, i) in cat.findings"
                  :key="i"
                  class="text-sm text-neutral-400 flex gap-2"
                >
                  <span class="flex-shrink-0 mt-0.5 font-bold text-yellow-500">–</span>
                  <span>{{ finding }}</span>
                </li>
              </ul>

              <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[#1a1a1a]">
                <span class="text-xs font-medium text-neutral-400 uppercase tracking-wide">Learn more</span>
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
        </div>

        <!-- Downloads + CTA -->
        <div class="mt-8 text-center rounded-xl border border-[#222222] bg-[#111111] p-6">
          <div class="flex flex-col items-center gap-3">
            <p class="text-xs text-neutral-300 uppercase tracking-wide font-medium">Download Report</p>
            <div class="flex flex-wrap justify-center gap-3">
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#333] bg-[#0a0a0a] text-sm text-neutral-400 hover:bg-[rgba(34,197,94,0.15)] hover:text-green-400 hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadDocx"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Word
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#333] bg-[#0a0a0a] text-sm text-neutral-400 hover:bg-[rgba(34,197,94,0.15)] hover:text-green-400 hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadMarkdown"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Markdown
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#333] bg-[#0a0a0a] text-sm text-neutral-400 hover:bg-[rgba(34,197,94,0.15)] hover:text-green-400 hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadJson"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                JSON
              </button>
            </div>
            <p class="text-xs text-neutral-400">
              Word and Markdown for reading, JSON for LLMs (includes WCAG mappings and remediation plan)
            </p>
          </div>
          <div class="mt-4 pt-4 border-t border-[#1a1a1a]">
            <p class="text-sm text-neutral-400 mb-3">Want to audit your own PDF?</p>
            <a
              :href="auditUrl"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              Audit Your PDF
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-6 pt-6 border-t border-[#222222] text-center">
          <p class="text-xs text-neutral-400">
            Report generated by <a :href="auditUrl" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">{{ appName }}</a> — {{ formatDate(data.createdAt) }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const id = route.params.id as string
const config = useRuntimeConfig()
const auditUrl = config.public.siteUrl as string
const appName = config.public.appName as string

const { data, pending, error } = await useFetch(`/api/reports/${id}`)

const { exportJSON, exportMarkdown, exportDocx } = useReportExport()

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightSeverities(raw: string): string {
  let text = escapeHtml(raw)
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: #ef4444; font-weight: 600;">$1</span>'
  )
  text = text.replace(
    /(\d+ moderate(?: accessibility)? issues?)/gi,
    '<span style="color: #eab308; font-weight: 600;">$1</span>'
  )
  return text
}

const highlightedSummary = computed(() => {
  return highlightSeverities((data.value as any)?.report?.executiveSummary || '')
})

function downloadJson() {
  if (data.value) {
    exportJSON((data.value as any).report)
  }
}

function downloadMarkdown() {
  if (data.value) {
    exportMarkdown((data.value as any).report)
  }
}

function downloadDocx() {
  if (data.value) {
    exportDocx((data.value as any).report)
  }
}

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

const scoredCategories = computed(() =>
  (data.value as any)?.report?.categories?.filter((c: any) => c.score !== null) || []
)
const naCategories = computed(() =>
  (data.value as any)?.report?.categories?.filter((c: any) => c.score === null) || []
)

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

function findingIcon(cat: any): string {
  if (cat.score === null) return '–'
  if (cat.score >= 90) return '✓'
  if (cat.score >= 70) return '•'
  return '✗'
}

function findingIconColor(cat: any): string {
  if (cat.score === null) return 'text-yellow-500'
  if (cat.score >= 90) return 'text-green-500'
  if (cat.score >= 70) return 'text-blue-400'
  if (cat.score >= 40) return 'text-yellow-500'
  return 'text-red-500'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}
</script>

<template>
  <div>
    <!-- Error state -->
    <div v-if="analysisError" class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6">
      <h3 class="font-semibold text-red-400 mb-2">{{ analysisError.error }}</h3>
      <p v-if="analysisError.details" class="text-sm text-neutral-400">{{ analysisError.details }}</p>
      <UButton class="mt-4" variant="outline" color="neutral" @click="clearResults">
        Try Another File
      </UButton>
    </div>

    <!-- Results state -->
    <div v-else-if="result">
      <!-- Scanned warning banner -->
      <div v-if="result.isScanned" class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
        <p class="text-orange-300 font-medium text-sm">
          This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required.
        </p>
      </div>

      <!-- Warnings -->
      <div v-if="result.warnings?.length" class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
        <p v-for="w in result.warnings" :key="w" class="text-yellow-300 text-sm">{{ w }}</p>
      </div>

      <ScoreCard :result="result" />

      <div class="mt-8 space-y-3">
        <CategoryRow
          v-for="cat in result.categories"
          :key="cat.id"
          :category="cat"
        />
      </div>

      <!-- Export & Share -->
      <div class="mt-8 rounded-xl border border-[#222222] bg-[#111111] p-5">
        <!-- Download row -->
        <p class="text-sm font-medium text-neutral-400 mb-3">Download Report</p>
        <div class="flex flex-wrap gap-2">
          <UButton variant="soft" color="primary" size="sm" @click="exportDocx(result)" :loading="exporting">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </template>
            Word (.docx)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportHtml(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
            </template>
            HTML (.html)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportMarkdown(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </template>
            Markdown (.md)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportJSON(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
            </template>
            JSON (.json)
          </UButton>
        </div>

        <!-- Share divider -->
        <div class="border-t border-[#222222] my-4" />

        <!-- Share row -->
        <p class="text-sm font-medium text-neutral-400 mb-3">Share Report</p>

        <div v-if="!shareUrl">
          <div class="flex flex-wrap gap-2">
            <UButton
              variant="soft"
              color="success"
              size="sm"
              @click="handleShare"
              :loading="sharing"
            >
              <template #leading>
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              </template>
              Create Shareable Link
            </UButton>
          </div>
          <p class="text-xs text-neutral-600 mt-2">Creates a public link anyone can view — no login required. Expires in 90 days.</p>
          <p v-if="shareError" class="text-xs text-red-400 mt-1">{{ shareError }}</p>
        </div>

        <!-- Share URL display -->
        <div v-else class="space-y-3">
          <div class="flex gap-2">
            <input
              type="text"
              :value="shareUrl"
              readonly
              class="flex-1 bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-neutral-300 font-mono select-all"
              @focus="($event.target as HTMLInputElement).select()"
            >
            <UButton variant="soft" color="neutral" size="sm" @click="copyShareUrl">
              {{ copied ? 'Copied!' : 'Copy' }}
            </UButton>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton variant="soft" color="primary" size="sm" @click="emailShareUrl">
              <template #leading>
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              </template>
              Email Link
            </UButton>
            <UButton variant="ghost" color="neutral" size="xs" @click="clearShare">
              Dismiss
            </UButton>
          </div>
        </div>
      </div>

      <div class="mt-4">
        <UButton variant="outline" color="neutral" @click="clearResults">
          Analyze Another File
        </UButton>
      </div>
    </div>

    <!-- Processing overlay -->
    <ProcessingOverlay v-else-if="processing" :stage="processingStage" />

    <!-- Drop zone (idle state) -->
    <DropZone v-else @file-selected="analyzeFile" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const resetSignal = inject<Ref<number>>('resetSignal')
const {
  exportMarkdown, exportJSON, exportDocx, exportHtml,
  shareReport, shareUrl, shareError, sharing, clearShare,
  exporting,
} = useReportExport()

const processing = ref(false)
const processingStage = ref('')
const result = ref<any>(null)
const analysisError = ref<any>(null)

watch(() => resetSignal?.value, () => {
  clearResults()
})

async function analyzeFile(file: File) {
  processing.value = true
  analysisError.value = null
  result.value = null

  try {
    processingStage.value = 'Uploading…'
    const formData = new FormData()
    formData.append('file', file)

    processingStage.value = 'Extracting PDF structure…'

    const response = await $fetch('/api/analyze', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    processingStage.value = 'Building report…'
    await new Promise(r => setTimeout(r, 300)) // Brief pause for UX

    result.value = response
  } catch (err: any) {
    if (err.status === 401) {
      navigateTo('/login')
      return
    }
    analysisError.value = err.data || { error: 'Analysis failed. Please try again.' }
  } finally {
    processing.value = false
  }
}

function clearResults() {
  result.value = null
  analysisError.value = null
  clearShare()
}

const copied = ref(false)

async function handleShare() {
  if (!result.value) return
  await shareReport(result.value)
}

async function copyShareUrl() {
  if (!shareUrl.value) return
  await navigator.clipboard.writeText(shareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function emailShareUrl() {
  if (!shareUrl.value || !result.value) return
  const subject = encodeURIComponent(`PDF Accessibility Report: ${result.value.filename}`)
  const body = encodeURIComponent(
    `Here is the accessibility report for "${result.value.filename}":\n\n` +
    `Score: ${result.value.overallScore}/100 (Grade ${result.value.grade})\n\n` +
    `View the full report:\n${shareUrl.value}\n\n` +
    `This link expires in 90 days.`
  )
  window.open(`mailto:?subject=${subject}&body=${body}`, '_self')
}
</script>

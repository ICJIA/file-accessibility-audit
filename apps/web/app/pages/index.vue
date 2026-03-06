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

      <div class="mt-8 flex gap-3">
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

const processing = ref(false)
const processingStage = ref('')
const result = ref<any>(null)
const analysisError = ref<any>(null)

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
}
</script>

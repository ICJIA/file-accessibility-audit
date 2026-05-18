<script setup lang="ts">
import { computed, ref } from 'vue'
import { navigateTo, useRuntimeConfig } from '#app'

interface Props {
  /** The File that was uploaded for the audit; re-uploaded for remediation. */
  file?: File | null
  /** Current audit score (used to suppress the button on already-A docs). */
  inputScore?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  file: null,
  inputScore: null,
})

const config = useRuntimeConfig()
const enabled = Boolean(config.public.remediationEnabled)

const submitting = ref(false)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)

const visible = computed(() => {
  if (!enabled) return false
  if (props.inputScore !== null && props.inputScore >= 90) return false
  return true
})

async function startRemediation(file: File): Promise<void> {
  submitting.value = true
  error.value = null
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<{
      jobId: string
      downloadToken: string
      inputScore: number
      inputGrade: string
    }>('/api/remediate', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    await navigateTo(
      `/remediate/${res.jobId}?t=${encodeURIComponent(res.downloadToken)}`,
    )
  } catch (e) {
    const err = e as { status?: number; data?: { error?: string } }
    if (err.status === 401) {
      await navigateTo('/login')
      return
    }
    error.value =
      err.data?.error ??
      (e as Error).message ??
      'Could not start remediation.'
    submitting.value = false
  }
}

async function handleClick(): Promise<void> {
  if (props.file) {
    await startRemediation(props.file)
    return
  }
  // Fallback: file no longer in memory (page reload, shared report view).
  // Trigger the hidden picker.
  fileInput.value?.click()
}

async function handlePickerChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const picked = input.files?.[0]
  if (!picked) return
  pendingFile.value = picked
  await startRemediation(picked)
}
</script>

<template>
  <div
    v-if="visible"
    class="w-full max-w-2xl rounded-xl border border-blue-700/40 bg-blue-950/20 px-5 sm:px-8 py-5 sm:py-6 text-center"
  >
    <p class="text-xs uppercase tracking-wide text-blue-300/80 mb-3">
      Optional next step
    </p>
    <UButton
      color="primary"
      size="xl"
      :loading="submitting"
      :disabled="submitting"
      class="w-full sm:w-auto"
      @click="handleClick"
    >
      <template #leading>
        <svg
          class="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </template>
      Auto-Remediate this PDF
    </UButton>
    <p class="text-sm text-[var(--text-muted)] mt-3">
      Adds structure tags, fixes metadata, and re-audits. Most issues are
      fixed automatically — manual review is still recommended for alt
      text and table headers.
    </p>
    <p v-if="error" class="text-sm text-red-400 mt-3">
      {{ error }}
    </p>
    <input
      ref="fileInput"
      type="file"
      accept="application/pdf,.pdf"
      class="hidden"
      @change="handlePickerChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
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

// Phase machine: idle → uploading → finalizing → (navigates away) or error.
// Each phase shows a distinct, unambiguous visual + copy state so a
// second click is obviously redundant (button visibly busy + label
// explains what's happening).
type Phase = 'idle' | 'uploading' | 'finalizing'

const phase = ref<Phase>('idle')
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Escalating copy: after a beat the "Sending PDF…" line is replaced by
// "Server is processing your upload — this can take a few seconds…"
// so a slow upload doesn't look like a frozen UI.
const slowCopyVisible = ref(false)
let slowCopyTimer: ReturnType<typeof setTimeout> | null = null

const visible = computed(() => {
  if (!enabled) return false
  return true
})

// Already-accessible files (score ≥ 90) don't benefit from automated
// remediation — the button stays visible but is disabled so the user
// understands their file has been checked and is in good shape.
const alreadyAccessible = computed(() =>
  props.inputScore !== null && props.inputScore >= 90,
)

const busy = computed(() => phase.value !== 'idle')
const disabledForClick = computed(() => busy.value || alreadyAccessible.value)

const phaseCopy = computed(() => {
  if (phase.value === 'uploading') {
    return slowCopyVisible.value
      ? 'Server is processing your upload — this can take a few seconds…'
      : 'Sending PDF to the remediation server…'
  }
  if (phase.value === 'finalizing') {
    return 'Opening the progress page…'
  }
  return ''
})

const buttonLabel = computed(() => {
  if (phase.value === 'uploading') return 'Starting remediation…'
  if (phase.value === 'finalizing') return 'Almost there…'
  return 'Attempt remediation'
})

function clearSlowTimer(): void {
  if (slowCopyTimer) {
    clearTimeout(slowCopyTimer)
    slowCopyTimer = null
  }
  slowCopyVisible.value = false
}

async function startRemediation(file: File): Promise<void> {
  phase.value = 'uploading'
  error.value = null
  clearSlowTimer()
  slowCopyTimer = setTimeout(() => {
    slowCopyVisible.value = true
  }, 2_500)
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
    phase.value = 'finalizing'
    clearSlowTimer()
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
    phase.value = 'idle'
    clearSlowTimer()
  }
}

async function handleClick(): Promise<void> {
  if (busy.value) return
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
  await startRemediation(picked)
}

onBeforeUnmount(() => {
  clearSlowTimer()
})
</script>

<template>
  <div
    v-if="visible"
    class="w-full max-w-2xl rounded-xl px-5 sm:px-8 py-5 sm:py-6 text-center transition-all duration-200"
    :class="
      alreadyAccessible
        ? 'border border-[var(--border)] bg-[var(--surface-card)]'
        : busy
          ? 'border-2 border-blue-400/70 bg-blue-950/40 shadow-[0_0_28px_rgba(59,130,246,0.25)] animate-pulse-soft'
          : 'border border-blue-700/40 bg-blue-950/20'
    "
    :aria-busy="busy ? 'true' : 'false'"
  >
    <p
      class="text-xs uppercase tracking-wide mb-3"
      :class="
        alreadyAccessible
          ? 'text-[var(--text-muted)]'
          : busy
            ? 'text-blue-200'
            : 'text-blue-300/80'
      "
    >
      {{
        alreadyAccessible
          ? 'No further automated remediation needed'
          : busy
            ? 'Starting remediation'
            : 'Optional next step'
      }}
    </p>
    <UButton
      :color="alreadyAccessible ? 'neutral' : 'primary'"
      :variant="alreadyAccessible ? 'subtle' : 'solid'"
      size="xl"
      :loading="busy"
      :disabled="disabledForClick"
      :class="[
        'w-full sm:w-auto',
        alreadyAccessible ? 'opacity-60 cursor-not-allowed' : '',
        busy ? 'ring-2 ring-blue-300/60 ring-offset-2 ring-offset-blue-950 cursor-wait' : '',
      ]"
      @click="handleClick"
    >
      <template v-if="!busy" #leading>
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
      {{ buttonLabel }}
    </UButton>

    <!-- Busy state: explicit, animated status line below the button so
         users have an unambiguous signal something is happening. -->
    <div
      v-if="busy"
      class="mt-4 flex items-center justify-center gap-2 text-sm text-blue-100"
      aria-live="polite"
    >
      <span class="inline-flex gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style="animation-delay: -0.32s" />
        <span class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style="animation-delay: -0.16s" />
        <span class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
      </span>
      <span>{{ phaseCopy }}</span>
    </div>

    <p
      v-if="!busy && alreadyAccessible"
      class="text-sm text-[var(--text-muted)] mt-3 max-w-lg mx-auto"
    >
      This PDF already scored {{ props.inputScore }} on the audit and won't
      benefit from additional automated remediation. We still recommend a
      manual review pass in Adobe Acrobat (Accessibility → Accessibility
      Checker) to verify alt text, reading order, and table semantics.
    </p>
    <div v-else-if="!busy" class="mt-3 text-sm text-[var(--text-muted)] max-w-xl mx-auto space-y-2 text-left sm:text-center">
      <p>
        Attempts to add structure tags, fix metadata, and re-audit the file.
        <strong class="text-[var(--text-secondary)]">Results vary by source document</strong> — a re-audit will
        show you exactly what improved.
      </p>
      <details class="text-xs">
        <summary class="cursor-pointer text-[var(--link)] hover:text-[var(--link-hover)] inline-block">
          Why do some PDFs remediate better than others?
        </summary>
        <div class="mt-2 space-y-2 text-[var(--text-muted)]">
          <p>
            <span class="text-[var(--text-secondary)]">Usually large gains:</span>
            text-heavy PDFs exported from Word with real heading styles, or
            simple single-column reports — the underlying structure is there,
            it just needs to be tagged.
          </p>
          <p>
            <span class="text-[var(--text-secondary)]">Modest gains:</span>
            PDFs exported from InDesign or LaTeX with partial tagging, or
            documents with a mix of text and simple tables.
          </p>
          <p>
            <span class="text-[var(--text-secondary)]">Smaller or no gains:</span>
            scanned image-only PDFs (no real text), Canva or
            design-tool exports without structure, heavily multi-column
            layouts, complex forms, and documents dominated by images or
            complex tables. These typically need manual work in Adobe
            Acrobat after the automated pass.
          </p>
          <p>
            Either way, the tool will refuse to give you back a file whose
            score got worse — if the result regresses, you'll see a "couldn't
            remediate" message instead of a damaged PDF. Manual review for
            alt text and table headers is recommended on every output.
          </p>
        </div>
      </details>
    </div>
    <p v-if="error" class="text-sm text-red-400 mt-3" role="alert">
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

<style scoped>
/* Slower, calmer pulse than Tailwind's default — pairs with the blue
   glow shadow to make the busy panel obviously alive without strobing.
   Falls back to no animation if the user prefers reduced motion. */
@keyframes pulse-soft {
  0%, 100% { box-shadow: 0 0 24px rgba(59, 130, 246, 0.18); }
  50%      { box-shadow: 0 0 32px rgba(59, 130, 246, 0.32); }
}
.animate-pulse-soft {
  animation: pulse-soft 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-soft { animation: none; }
}
</style>

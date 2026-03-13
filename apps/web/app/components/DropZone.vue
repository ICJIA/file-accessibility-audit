<template>
  <div>
    <!-- Validation error (shown even without staged files) -->
    <div v-if="validationError && stagedFiles.length === 0" class="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
      <p class="text-xs text-[var(--status-error)]">{{ validationError }}</p>
    </div>

    <!-- Staged file list (shown when multiple files selected but not yet submitted) -->
    <div v-if="stagedFiles.length > 0" class="mb-4">
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-[var(--text-heading)]">
            {{ stagedFiles.length }} {{ stagedFiles.length === 1 ? 'file' : 'files' }} selected
          </p>
          <button
            class="text-xs text-[var(--text-muted)] hover:text-[var(--status-error)] transition-colors"
            @click="clearStaged"
          >Clear all</button>
        </div>
        <ul class="space-y-2">
          <li
            v-for="(f, i) in stagedFiles"
            :key="i"
            class="flex items-center justify-between rounded-lg bg-[var(--surface-deep)] px-3 py-2 text-sm"
          >
            <span class="text-[var(--text-secondary)] truncate mr-3">{{ f.name }}</span>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-xs text-[var(--text-muted)]">{{ formatSize(f.size) }}</span>
              <button
                class="text-[var(--text-muted)] hover:text-[var(--status-error)] transition-colors"
                @click="removeStaged(i)"
                title="Remove file"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        </ul>
        <div v-if="validationError" class="mt-3 text-xs text-[var(--status-error)]">{{ validationError }}</div>
        <div class="mt-3 flex gap-2 justify-center">
          <button
            class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
            @click="submitStaged"
          >
            Analyze {{ stagedFiles.length }} {{ stagedFiles.length === 1 ? 'File' : 'Files' }}
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-[var(--border-input)] text-[var(--text-secondary)] text-sm hover:bg-[var(--surface-hover)] transition-colors"
            @click="openPicker"
          >Add More</button>
        </div>
      </div>
    </div>

    <div
      class="flex flex-col items-center justify-center min-h-[50vh] border-2 border-dashed rounded-2xl transition-all cursor-pointer"
      :class="dragging
        ? 'border-green-400 bg-green-400/5 scale-[1.01]'
        : 'border-[var(--border-input)] hover:border-[var(--border-hover)] bg-[var(--surface-card-50)]'"
      @dragover.prevent
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="handleDrop"
      @click="openPicker"
    >
      <div class="text-center space-y-4 p-8">
        <div class="mx-auto w-16 h-16 rounded-full bg-[var(--surface-icon)] flex items-center justify-center">
          <svg class="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>

        <div>
          <p class="text-lg font-medium" :class="dragging ? 'text-green-400' : 'text-[var(--text-heading)]'">
            {{ dragging ? 'Drop your PDFs here' : 'Drop PDF files here' }}
          </p>
          <p class="text-sm text-[var(--text-muted)] mt-1">or click to browse — up to 5 files, max 50 MB each</p>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".pdf,application/pdf"
      multiple
      class="hidden"
      @change="handleFileInput"
    />
  </div>
</template>

<script setup lang="ts">
const MAX_FILES = 5
const MAX_SIZE = 50 * 1024 * 1024

const emit = defineEmits<{
  'file-selected': [file: File]
  'files-selected': [files: File[]]
}>()

const dragging = ref(false)
const dragCounter = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const stagedFiles = ref<File[]>([])
const validationError = ref('')

// Prevent browser from opening dropped files anywhere on the page
onMounted(() => {
  const prevent = (e: DragEvent) => e.preventDefault()
  document.addEventListener('dragover', prevent)
  document.addEventListener('drop', prevent)
  onUnmounted(() => {
    document.removeEventListener('dragover', prevent)
    document.removeEventListener('drop', prevent)
  })
})

function onDragEnter() {
  dragCounter.value++
  dragging.value = true
}

function onDragLeave() {
  dragCounter.value--
  if (dragCounter.value <= 0) {
    dragCounter.value = 0
    dragging.value = false
  }
}

function openPicker() {
  fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  dragCounter.value = 0
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  processFiles(files)
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  processFiles(files)
  input.value = '' // Reset so same files can be re-selected
}

function processFiles(files: File[]) {
  validationError.value = ''

  const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) {
    validationError.value = 'Please select PDF files'
    return
  }

  const oversized = pdfs.filter(f => f.size > MAX_SIZE)
  if (oversized.length) {
    validationError.value = `${oversized.map(f => f.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the 50 MB limit`
    return
  }

  const combined = [...stagedFiles.value, ...pdfs]
  if (combined.length > MAX_FILES) {
    validationError.value = `Maximum ${MAX_FILES} files allowed (you have ${combined.length})`
    return
  }

  // Single file with nothing staged → emit immediately (original behavior)
  if (pdfs.length === 1 && stagedFiles.value.length === 0) {
    emit('file-selected', pdfs[0])
    return
  }

  // Multiple files or adding to existing staged → stage them
  stagedFiles.value = combined
}

function removeStaged(index: number) {
  stagedFiles.value.splice(index, 1)
  validationError.value = ''
}

function clearStaged() {
  stagedFiles.value = []
  validationError.value = ''
}

function submitStaged() {
  if (stagedFiles.value.length === 0) return
  if (stagedFiles.value.length === 1) {
    emit('file-selected', stagedFiles.value[0])
  } else {
    emit('files-selected', [...stagedFiles.value])
  }
  stagedFiles.value = []
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

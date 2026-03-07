<template>
  <div>
    <div
      class="flex flex-col items-center justify-center min-h-[50vh] border-2 border-dashed rounded-2xl transition-all cursor-pointer"
      :class="dragging
        ? 'border-green-400 bg-green-400/5 scale-[1.01]'
        : 'border-[#333333] hover:border-[#555555] bg-[#111111]/50'"
      @dragover.prevent
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="handleDrop"
      @click="openPicker"
    >
      <div class="text-center space-y-4 p-8">
        <div class="mx-auto w-16 h-16 rounded-full bg-[#222222] flex items-center justify-center">
          <svg class="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>

        <div>
          <p class="text-lg font-medium" :class="dragging ? 'text-green-400' : 'text-white'">
            {{ dragging ? 'Drop your PDF here' : 'Drop a PDF file here' }}
          </p>
          <p class="text-sm text-neutral-500 mt-1">or click to browse — max 100 MB</p>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".pdf,application/pdf"
      class="hidden"
      @change="handleFileInput"
    />
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const dragging = ref(false)
const dragCounter = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)

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

function openPicker() {
  fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  dragCounter.value = 0
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) processFile(file)
  input.value = '' // Reset so same file can be re-selected
}

function processFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please select a PDF file')
    return
  }
  if (file.size > 100 * 1024 * 1024) {
    alert('File exceeds the 100 MB limit')
    return
  }
  emit('file-selected', file)
}
</script>

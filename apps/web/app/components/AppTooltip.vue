<template>
  <div
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @keydown.escape="hide"
  >
    <slot :tooltip-id="tooltipId" />
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="visible"
          ref="tooltipEl"
          role="tooltip"
          :id="tooltipId"
          class="fixed z-[9999] max-w-[min(20rem,calc(100vw-1rem))] px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--surface-card)] text-[var(--text-heading)] border border-[var(--border)] shadow-lg pointer-events-none break-words"
          :style="positionStyle"
        >
          {{ text }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  text: string
}>()

const tooltipId = `tooltip-${useId()}`
const visible = ref(false)
const tooltipEl = ref<HTMLElement | null>(null)
const triggerRect = ref<DOMRect | null>(null)
const positionStyle = ref<Record<string, string>>({})

function show(e: Event) {
  const target = (e.currentTarget as HTMLElement)
  triggerRect.value = target.getBoundingClientRect()
  visible.value = true
  nextTick(updatePosition)
}

function hide() {
  visible.value = false
}

function updatePosition() {
  if (!triggerRect.value || !tooltipEl.value) return

  const rect = triggerRect.value
  const tip = tooltipEl.value
  const tipRect = tip.getBoundingClientRect()
  const pad = 8

  // Default: centered above the trigger
  let top = rect.top - tipRect.height - pad
  let left = rect.left + rect.width / 2 - tipRect.width / 2

  // Flip below if not enough room above
  if (top < pad) {
    top = rect.bottom + pad
  }

  // Clamp horizontal to viewport
  const vw = window.innerWidth
  if (left < pad) left = pad
  if (left + tipRect.width > vw - pad) left = vw - pad - tipRect.width

  // Clamp vertical to viewport
  const vh = window.innerHeight
  if (top + tipRect.height > vh - pad) top = vh - pad - tipRect.height

  positionStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}
</script>

<style scoped>
.tooltip-fade-enter-active {
  transition: opacity 0.1s ease;
}
.tooltip-fade-leave-active {
  transition: opacity 0.05s ease;
}
.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>

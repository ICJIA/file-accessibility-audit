<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'

interface Props {
  /** Mermaid source code (e.g., `flowchart TD; A-->B`) */
  source: string
  /** Optional accessible title for the diagram */
  title?: string
  /** Optional accessible long description (alt-text equivalent) */
  desc?: string
}

const props = defineProps<Props>()

const containerRef = ref<HTMLDivElement | null>(null)
const error = ref<string | null>(null)
const isClient = ref(false)

let renderIdCounter = 0
let mermaidInitialized = false

async function ensureMermaidInitialized() {
  const mermaid = (await import('mermaid')).default
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        background: '#111111',
        primaryColor: '#1e293b',
        primaryTextColor: '#f5f5f5',
        primaryBorderColor: '#3b82f6',
        lineColor: '#9ca3af',
        secondaryColor: '#374151',
        tertiaryColor: '#1f2937',
        textColor: '#f5f5f5',
        mainBkg: '#1e293b',
        nodeBorder: '#3b82f6',
        clusterBkg: '#0f172a',
        clusterBorder: '#3b82f6',
        labelTextColor: '#f5f5f5',
        edgeLabelBackground: '#1e293b',
      },
      securityLevel: 'loose',
      flowchart: { curve: 'basis', useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    })
    mermaidInitialized = true
  }
  return mermaid
}

async function render(): Promise<void> {
  if (typeof window === 'undefined') return
  await nextTick()
  if (!containerRef.value) return

  try {
    const mermaid = await ensureMermaidInitialized()
    const id = `mermaid-${++renderIdCounter}-${Date.now()}`
    const { svg } = await mermaid.render(id, props.source)
    if (containerRef.value) {
      containerRef.value.innerHTML = svg
    }
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[MermaidDiagram] render failed:', e)
    }
  }
}

onMounted(async () => {
  isClient.value = true
  // Wait one tick so the v-if swap places the container in the DOM
  await nextTick()
  await render()
})

watch(
  () => props.source,
  async () => {
    if (isClient.value) {
      await render()
    }
  },
)
</script>

<template>
  <figure
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-deep)] overflow-hidden"
  >
    <figcaption
      v-if="title"
      class="px-4 sm:px-5 pt-4 pb-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold"
    >
      {{ title }}
    </figcaption>

    <!-- SSR / pre-mount: show the source text. The same content stays
         readable for screen readers and users without JavaScript. -->
    <pre
      v-if="!isClient"
      class="px-4 sm:px-5 py-4 text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto m-0"
    >{{ source }}</pre>

    <!-- Client-mounted: mermaid renders into this container. -->
    <div
      v-else
      ref="containerRef"
      class="px-3 sm:px-5 py-4 overflow-x-auto flex justify-center mermaid-container"
      :aria-label="title || 'Diagram'"
      :aria-describedby="desc ? 'mermaid-desc' : undefined"
    />

    <p
      v-if="desc"
      id="mermaid-desc"
      class="px-4 sm:px-5 pb-4 text-xs text-[var(--text-muted)] leading-relaxed"
    >
      {{ desc }}
    </p>

    <p
      v-if="error"
      class="px-4 sm:px-5 pb-4 text-xs text-red-400 m-0"
      role="alert"
    >
      Diagram could not be rendered: {{ error }}
    </p>
  </figure>
</template>

<style>
.mermaid-container svg {
  max-width: 100%;
  height: auto;
}
</style>

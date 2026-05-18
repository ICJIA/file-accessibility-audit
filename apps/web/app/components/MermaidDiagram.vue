<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

interface Props {
  /** Mermaid source code (e.g., `graph TD; A-->B`) */
  source: string
  /** Optional accessible title for the diagram */
  title?: string
  /** Optional accessible description (long-form alt for the SVG) */
  desc?: string
}

const props = defineProps<Props>()

const containerRef = ref<HTMLDivElement | null>(null)
const error = ref<string | null>(null)
const rendered = ref(false)

let renderIdCounter = 0

async function render(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!containerRef.value) return

  try {
    // Dynamic import so mermaid only loads on pages that use the
    // component, and only in the browser (never during SSR).
    const mermaid = (await import('mermaid')).default

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        background: '#111111',
        primaryColor: '#1d4ed8',
        primaryTextColor: '#f5f5f5',
        primaryBorderColor: '#3b82f6',
        lineColor: '#737373',
        secondaryColor: '#374151',
        tertiaryColor: '#1f2937',
        textColor: '#f5f5f5',
        mainBkg: '#111111',
        nodeBorder: '#3b82f6',
        clusterBkg: '#111111',
        clusterBorder: '#3b82f6',
        labelTextColor: '#f5f5f5',
        edgeLabelBackground: '#111111',
      },
      securityLevel: 'strict',
      flowchart: { curve: 'basis', useMaxWidth: true },
      sequence: { useMaxWidth: true },
    })

    const id = `mermaid-${++renderIdCounter}-${Date.now()}`
    const { svg } = await mermaid.render(id, props.source)
    containerRef.value.innerHTML = svg
    rendered.value = true
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
    rendered.value = false
  }
}

onMounted(() => {
  void render()
})

watch(() => props.source, () => {
  void render()
})
</script>

<template>
  <figure
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-deep)] overflow-hidden"
  >
    <figcaption v-if="title" class="px-4 sm:px-5 pt-4 pb-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">
      {{ title }}
    </figcaption>

    <ClientOnly>
      <div
        ref="containerRef"
        class="px-3 sm:px-5 py-4 overflow-x-auto flex justify-center"
        :aria-label="title || 'Diagram'"
        :aria-describedby="desc ? 'mermaid-desc' : undefined"
      />
      <template #fallback>
        <!-- SSR / no-JS fallback: show the source so the diagram is still
             readable when JavaScript is disabled or unavailable. -->
        <pre class="px-4 sm:px-5 py-4 text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto">{{ source }}</pre>
      </template>
    </ClientOnly>

    <p
      v-if="desc"
      id="mermaid-desc"
      class="px-4 sm:px-5 pb-4 text-xs text-[var(--text-muted)] leading-relaxed"
    >
      {{ desc }}
    </p>

    <p
      v-if="error"
      class="px-4 sm:px-5 pb-4 text-xs text-red-400"
      role="alert"
    >
      Diagram could not be rendered: {{ error }}
    </p>
  </figure>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'

interface Props {
  /** Mermaid source code — keep it simple: flowchart TD with plain labels. */
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

let mermaidInitialized = false
// Serialize renders across all instances on the page so concurrent
// calls can't share global mermaid state and produce combined SVGs.
let renderChain: Promise<void> = Promise.resolve()
let idCounter = 0

async function initMermaid() {
  const mermaid = (await import('mermaid')).default
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#0a0a0a',
        primaryColor: '#1e293b',
        primaryTextColor: '#f5f5f5',
        primaryBorderColor: '#3b82f6',
        lineColor: '#9ca3af',
        secondaryColor: '#1e3a8a',
        tertiaryColor: '#374151',
        textColor: '#f5f5f5',
        mainBkg: '#1e293b',
        nodeBorder: '#3b82f6',
        edgeLabelBackground: '#0a0a0a',
      },
      securityLevel: 'loose',
      // No HTML labels — they introduce foreignObject rendering quirks
      // that broke earlier iterations. SVG <text> only.
      flowchart: { useMaxWidth: true, htmlLabels: false },
    })
    mermaidInitialized = true
  }
  return mermaid
}

async function render(): Promise<void> {
  if (typeof window === 'undefined') return
  await nextTick()
  if (!containerRef.value) return

  // Chain onto the global render queue. Each render runs to completion
  // (or failure) before the next one starts. This prevents mermaid's
  // internal global state from being shared between concurrent renders.
  const next = renderChain.catch(() => undefined).then(async () => {
    if (!containerRef.value) return
    try {
      const mermaid = await initMermaid()
      const id = `m${++idCounter}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const { svg } = await mermaid.render(id, props.source)
      if (containerRef.value) {
        containerRef.value.innerHTML = svg
      }
      error.value = null
    } catch (e) {
      error.value = (e as Error).message
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('[MermaidDiagram]', e)
      }
    }
  })
  renderChain = next
  await next
}

onMounted(async () => {
  isClient.value = true
  await nextTick()
  await render()
})

watch(
  () => props.source,
  () => {
    if (isClient.value) {
      void render()
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

    <!-- SSR / pre-mount: show the source text. Stays readable for screen
         readers and users without JavaScript. -->
    <pre
      v-if="!isClient"
      class="px-4 sm:px-5 py-4 text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto m-0"
    >{{ source }}</pre>

    <!-- Client-mounted: mermaid renders into the inner div. Outer div
         is the scroll viewport so a wider diagram still fits the page. -->
    <div
      v-else
      class="px-3 sm:px-5 py-4 overflow-x-auto overflow-y-hidden"
      :aria-label="title || 'Diagram'"
      :aria-describedby="desc ? 'mermaid-desc' : undefined"
    >
      <div ref="containerRef" class="mermaid-host" />
    </div>

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
      Diagram render error: {{ error }}
    </p>
  </figure>
</template>

<style>
/* The figure is its own layout + paint container so a mermaid SVG can
   never bleed into the next section, no matter what dimensions mermaid
   emits internally. */
figure {
  position: relative;
  contain: layout paint;
}
.mermaid-host {
  display: block;
  width: 100%;
  min-height: 60px;
  text-align: center;
  /* Confine the SVG to this container regardless of intrinsic dims */
  position: relative;
  overflow: hidden;
}
.mermaid-host > svg {
  display: block;
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
  margin: 0 auto;
}
.mermaid-host text,
.mermaid-host .nodeLabel,
.mermaid-host .edgeLabel {
  fill: #f5f5f5 !important;
  color: #f5f5f5 !important;
}
</style>

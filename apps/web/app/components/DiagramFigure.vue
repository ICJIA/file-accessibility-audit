<script setup lang="ts">
import { computed, useId } from 'vue'

interface Props {
  /** Diagram name — matches a file in app/assets/diagrams/<name>.svg. */
  name: string
  /** Accessible title shown as the figure caption. */
  title?: string
  /** Accessible long description (the diagram's text alternative). */
  desc?: string
}

const props = defineProps<Props>()

// Pre-rendered dark-theme SVGs (generated at dev time from the static Mermaid
// sources by scripts/generate-diagrams.mjs, optimized with SVGO). Imported as
// URLs so each is a hashed, cacheable static file the browser fetches lazily
// — no mermaid runtime, and no ~150 KB of inline SVG bloating the HTML.
const urls = import.meta.glob('../assets/diagrams/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const src = computed(() => {
  const entry = Object.entries(urls).find(([path]) =>
    path.endsWith(`/${props.name}.svg`),
  )
  return entry ? entry[1] : ''
})

const descId = `diagram-desc-${useId()}`
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

    <div class="px-3 sm:px-5 py-4 overflow-x-auto overflow-y-hidden">
      <!-- The dark theme + light text are baked into the SVG, so it renders
           correctly as a standalone image. Lazy-loaded below the fold. -->
      <img
        :src="src"
        :alt="title || ''"
        :aria-describedby="desc ? descId : undefined"
        loading="lazy"
        decoding="async"
        class="diagram-img"
      />
    </div>

    <p
      v-if="desc"
      :id="descId"
      class="px-4 sm:px-5 pb-4 text-xs text-[var(--text-muted)] leading-relaxed"
    >
      {{ desc }}
    </p>
  </figure>
</template>

<style scoped>
figure {
  position: relative;
  contain: layout paint;
}
.diagram-img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>

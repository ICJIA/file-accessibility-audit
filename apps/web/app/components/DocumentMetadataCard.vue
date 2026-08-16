<template>
  <section
    data-testid="about-document"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden"
    aria-labelledby="about-document-title"
  >
    <div class="px-4 sm:px-5 py-3 border-b border-[var(--border)]">
      <h2 id="about-document-title" class="text-sm font-semibold text-[var(--text-heading)]">
        About this document
      </h2>
      <p class="text-xs text-[var(--text-muted)] mt-0.5">
        Recorded inside the file by the program that made it — informational only, not part of the
        score.
      </p>
    </div>

    <dl
      v-if="items.length"
      class="px-4 sm:px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2"
    >
      <div v-for="item in items" :key="item.label" class="text-sm min-w-0">
        <dt class="text-xs text-[var(--text-muted)]">{{ item.label }}</dt>
        <dd
          class="m-0 break-words"
          :class="item.value ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'"
        >
          {{ item.value || "Not set" }}
        </dd>
      </div>
    </dl>
    <p v-else class="px-4 sm:px-5 py-3 text-sm text-[var(--text-muted)]">
      This file doesn't record which program made it or when it was created — many tools leave this
      information blank.
    </p>

    <p
      class="px-4 sm:px-5 py-2.5 text-xs leading-relaxed text-[var(--text-muted)] border-t border-[var(--border-subtle)] m-0"
      role="note"
    >
      {{ tieIn }}
    </p>
  </section>
</template>

<script setup lang="ts">
// The Visual view's answer to "what made this document, and when?" — the
// context that makes the plan's source-document route make sense, surfaced
// where the plan is read instead of only inside the collapsed technical
// expander. Same field inventory as the Detailed view's metadata panel,
// built by the same util.
import { computed } from "vue";
import { metadataItemsFor, sourceTieInLine } from "~/utils/documentMetadata";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard in the utils.
  result: Record<string, any> | null;
}>();

const items = computed(() => metadataItemsFor(props.result));
const tieIn = computed(() => sourceTieInLine(props.result));
</script>

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

    <!-- The headline facts stay visible; the full property table folds away.
         This card sits ABOVE the action plan on purpose (user request
         2026-08-16: the reader should see what made the document before the
         steps that depend on it) — but at full height it pushed the plan far
         down the page. Collapsing the table keeps the reason for its position
         and returns the space: the source application, page count and creation
         date are what the plan actually depends on, and they are still here
         without a click. -->
    <div v-if="items.length" class="px-4 sm:px-5 py-3">
      <p data-testid="about-document-summary" class="text-sm text-[var(--text-secondary)] m-0">
        <span v-for="(fact, i) in headlineFacts" :key="fact">
          <span v-if="i > 0" class="text-[var(--text-muted)]"> · </span>{{ fact }}
        </span>
      </p>

      <!-- The collapse must not LOSE detail in print (the reorder's contract
           was "no details removed"): beforeprint force-opens the disclosure,
           afterprint restores the reader's state. -->
      <details ref="propsDisclosure" class="mt-2 group">
        <summary
          class="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors select-none"
        >
          All document properties ({{ items.length }})
        </summary>
        <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          <div v-for="item in items" :key="item.label" class="text-sm min-w-0">
            <dt class="text-xs text-[var(--text-muted)]">{{ item.label }}</dt>
            <dd
              class="m-0 break-words"
              :class="
                item.value ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'
              "
            >
              {{ item.value || "Not set" }}
            </dd>
          </div>
        </dl>
      </details>
    </div>
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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { metadataItemsFor, sourceTieInLine } from "~/utils/documentMetadata";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard in the utils.
  result: Record<string, any> | null;
}>();

const items = computed(() => metadataItemsFor(props.result));
const tieIn = computed(() => sourceTieInLine(props.result));

/** The three facts the action plan below actually depends on: what made the
 *  document, how long it is, and when. Everything else folds away. */
const headlineFacts = computed(() => {
  const pick = (label: string) => items.value.find((i) => i.label === label)?.value;
  const source = pick("Source Application") || pick("PDF Producer");
  const pages = pick("Page Count");
  const created = pick("Created");
  return [
    source,
    pages ? `${pages} ${pages === "1" ? "page" : "pages"}` : null,
    created ? `created ${created}` : null,
  ].filter((x): x is string => !!x);
});

const propsDisclosure = ref<HTMLDetailsElement | null>(null);
let openBeforePrint = false;
const onBeforePrint = () => {
  if (propsDisclosure.value) {
    openBeforePrint = propsDisclosure.value.open;
    propsDisclosure.value.open = true;
  }
};
const onAfterPrint = () => {
  if (propsDisclosure.value) propsDisclosure.value.open = openBeforePrint;
};
onMounted(() => {
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("afterprint", onAfterPrint);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeprint", onBeforePrint);
  window.removeEventListener("afterprint", onAfterPrint);
});
</script>

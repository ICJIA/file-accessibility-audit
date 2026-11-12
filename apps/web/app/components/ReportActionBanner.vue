<template>
  <div v-if="copy" class="action-banner" :class="severityClass">
    {{ copy }}
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { publicationBanner, publicationStatus } from "~/utils/publicationStatus";

const props = defineProps<{
  categories: Array<{ severity?: string | null }>;
  /** The report's conformance verdict. Severity alone measures extent — a
   *  Minor category can still carry a confirmed WCAG 2.1 failure, and this
   *  banner used to call exactly those documents a pass (2026-11-12). Absent
   *  on reports stored before the gate existed; raw stored JSON on the shared
   *  page, so `unknown` and narrowed by the helper. */
  conformance?: unknown;
  /** Analyzed file type. The copy below is deliberately format-agnostic
   * ("this document"), so this isn't interpolated into the text — it's
   * accepted so callers can pass it consistently with sibling components
   * and so this component never has to be told it only handles PDFs. */
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
}>();

const wcag = useWcag();

// Text and colour come from the one shared decision (utils/publicationStatus)
// so this banner cannot disagree with the hero, the plan, or the exports.
const banner = computed(() =>
  publicationBanner(publicationStatus(props.categories, props.conformance), wcag.version),
);
const copy = computed<string | null>(() => banner.value?.text ?? null);
const severityClass = computed(() => banner.value?.class ?? "pass");
</script>

<style scoped>
.action-banner {
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid;
}
.action-banner.critical {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
  color: rgb(252, 165, 165);
}
.action-banner.moderate {
  border-color: rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.05);
  color: rgb(253, 224, 71);
}
.action-banner.minor {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
  color: rgb(147, 197, 253);
}
.action-banner.pass {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
  color: rgb(134, 239, 172);
}
</style>

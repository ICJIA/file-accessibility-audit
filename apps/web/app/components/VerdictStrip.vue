<template>
  <div
    v-if="conformance"
    data-testid="verdict-strip"
    class="rounded-lg border px-4 py-2.5 text-center text-sm"
    :class="stripClass"
  >
    <span class="font-semibold"
      ><span aria-hidden="true">{{ icon }}</span> {{ heading }}</span
    >
    <template v-if="conformance.status === 'fail'">
      <span class="opacity-80">
        · {{ conformance.failures.length }}
        {{ conformance.failures.length === 1 ? "criterion" : "criteria" }} failing —
      </span>
      <a
        href="#technical-report"
        class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >details below</a
      >
    </template>
    <span v-else-if="conformance.notAssessed.length" class="opacity-80">
      · {{ conformance.notAssessed.length }} criteria still need a quick manual review
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { conformanceHeading, type ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  conformance?: ConformanceVerdict | null;
  wcagVersion: string;
}>();

const heading = computed(() =>
  props.conformance ? conformanceHeading(props.conformance, props.wcagVersion) : "",
);
const icon = computed(() => {
  if (props.conformance?.status === "fail") return "✗";
  if (props.conformance?.status === "incomplete") return "!";
  return "✓";
});
const stripClass = computed(() => {
  const s = props.conformance?.status;
  if (s === "fail") return "border-red-500/35 bg-red-500/10 text-[var(--status-error)]";
  if (s === "incomplete")
    return "border-yellow-500/35 bg-yellow-500/10 text-[var(--status-warning-yellow)]";
  return "border-green-500/35 bg-green-500/10 text-[var(--status-success)]";
});
</script>

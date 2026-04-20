<template>
  <span class="inline-flex items-center justify-center gap-1.5">
    <span class="text-[var(--text-muted)]">N/A</span>
    <span class="relative group inline-flex">
      <button
        type="button"
        :aria-describedby="tooltipId"
        :aria-label="`Why is ${catId.replace(/_/g, ' ')} N/A? ${reason}`"
        class="inline-flex w-4 h-4 items-center justify-center rounded-full border border-[var(--border)] text-[10px] leading-none text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]"
      >
        <span aria-hidden="true">i</span>
      </button>
      <span
        :id="tooltipId"
        role="tooltip"
        class="pointer-events-none opacity-0 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 absolute bottom-full right-1/2 translate-x-1/2 mb-2 z-20 w-64 rounded-md border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-xs leading-relaxed text-left text-[var(--text-secondary)] shadow-lg"
      >
        {{ reason }}
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { naReason } from "~/utils/modeDivergence";
import type { ScoringMode } from "~/utils/scoringProfiles";

const props = defineProps<{
  catId: string;
  mode: ScoringMode;
}>();

const reason = computed(() => naReason(props.catId, props.mode));
const tooltipId = computed(() => `na-tooltip-${props.catId}`);
</script>

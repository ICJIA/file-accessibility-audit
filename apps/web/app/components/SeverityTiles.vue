<template>
  <div class="flex gap-2 sm:gap-3 max-w-xl mx-auto">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      :data-testid="`severity-tile-${tile.key}`"
      class="flex-1 rounded-xl border px-3 py-2.5 text-center"
      :class="tile.count === 0 ? 'tile-zero border-[var(--border-subtle)]' : tile.activeClass"
    >
      <div
        class="text-2xl font-extrabold leading-tight"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : tile.textClass"
      >
        {{ tile.count }}
      </div>
      <div
        class="text-[10px] font-semibold tracking-wide"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : tile.textClass"
      >
        <span aria-hidden="true">{{ tile.icon }}</span> {{ tile.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { tallySeverity } from "~/utils/severityTally";

const props = defineProps<{ categories: Array<{ severity?: string | null }> }>();

const tally = computed(() => tallySeverity(props.categories));

// Icon + label + count, always — severity is never color-alone.
const tiles = computed(() => [
  {
    key: "critical",
    label: "Critical",
    icon: "⛔",
    count: tally.value.critical,
    activeClass: "border-red-500/40 bg-red-500/10",
    textClass: "text-red-400",
  },
  {
    key: "moderate",
    label: "Moderate",
    icon: "⚠",
    count: tally.value.moderate,
    activeClass: "border-yellow-500/40 bg-yellow-500/10",
    textClass: "text-yellow-400",
  },
  {
    key: "minor",
    label: "Minor",
    icon: "ⓘ",
    count: tally.value.minor,
    activeClass: "border-blue-500/40 bg-blue-500/10",
    textClass: "text-blue-400",
  },
]);
</script>

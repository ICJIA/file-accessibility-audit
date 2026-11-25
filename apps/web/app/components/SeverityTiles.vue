<template>
  <div class="flex gap-4 sm:gap-6">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      :data-testid="`severity-tile-${tile.key}`"
      class="flex-1 border-t-4 pt-3 text-left"
      :class="[RULE[tile.key], tile.count === 0 ? 'tile-zero border-[var(--border-alt)]' : '']"
      :style="tile.count === 0 ? {} : { borderColor: tile.color }"
    >
      <div
        class="text-6xl sm:text-7xl font-black leading-none tracking-tight"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-heading)]'"
      >
        {{ tile.count }}
      </div>
      <div
        class="mt-1 text-xs font-semibold tracking-wide uppercase"
        :style="tile.count === 0 ? {} : { color: tile.color }"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : ''"
      >
        <span aria-hidden="true">{{ tile.icon }}</span> {{ tile.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";
import { computed } from "vue";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { severityColor } = useTokenColors();
// The three rules differ in line style as well as colour, so the levels can
// be told apart without relying on hue.
const RULE: Record<string, string> = {
  critical: "border-solid",
  moderate: "border-dashed",
  minor: "border-dotted",
};
import { tallySeverity } from "~/utils/severityTally";

const props = defineProps<{ categories: Array<{ severity?: string | null }> }>();

const tally = computed(() =>
  tallySeverity(Array.isArray(props.categories) ? props.categories : []),
);

// Icon + label + count, always — severity is never color-alone.
const tiles = computed(() => [
  {
    key: "critical",
    label: "Critical",
    icon: "⛔",
    count: tally.value.critical,
    color: severityColor("Critical"),
  },
  {
    key: "moderate",
    label: "Moderate",
    icon: "⚠",
    count: tally.value.moderate,
    color: severityColor("Moderate"),
  },
  {
    key: "minor",
    label: "Minor",
    icon: "ⓘ",
    count: tally.value.minor,
    color: severityColor("Minor"),
  },
]);
</script>

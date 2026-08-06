<template>
  <div class="flex gap-2 sm:gap-3 max-w-xl mx-auto">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      :data-testid="`severity-tile-${tile.key}`"
      class="flex-1 rounded-xl border px-3 py-2.5 text-center"
      :class="tile.count === 0 ? 'tile-zero border-[var(--border-subtle)]' : ''"
      :style="
        tile.count === 0
          ? {}
          : { borderColor: tile.color + '40', backgroundColor: tile.color + '10' }
      "
    >
      <div
        class="text-2xl font-extrabold leading-tight"
        :style="tile.count === 0 ? {} : { color: tile.color }"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : ''"
      >
        {{ tile.count }}
      </div>
      <div
        class="text-[10px] font-semibold tracking-wide uppercase"
        :style="tile.count === 0 ? {} : { color: tile.color }"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : ''"
      >
        <span aria-hidden="true">{{ tile.icon }}</span> {{ tile.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { severityColor } from "@file-audit/shared";
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

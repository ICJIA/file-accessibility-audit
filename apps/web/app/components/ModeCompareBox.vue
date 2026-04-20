<template>
  <div
    ref="rootEl"
    data-testid="mode-compare-box"
    :data-category-id="categoryId"
    class="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-3 py-2.5"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p
        class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]"
      >
        How each mode scores this category
      </p>
      <span
        class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide rounded-full border px-2.5 py-1"
        :class="
          diverges
            ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
            : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
        "
      >
        <span aria-hidden="true" class="text-[13px] leading-none">{{
          diverges ? "⚠" : "="
        }}</span>
        {{ copy.label }}
      </span>
    </div>
    <p
      v-if="!diverges"
      class="mt-1 text-[11px] text-[var(--text-muted)] leading-snug"
    >
      Both pills show the same score because this category scores the same
      under both methodologies — only the profile weight differs, which
      affects the overall grade. Not a bug.
    </p>
    <div class="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
      <button
        type="button"
        :aria-pressed="selectedMode === 'strict'"
        data-testid="mode-compare-strict"
        class="text-left rounded-md border px-2.5 py-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        :class="
          selectedMode === 'strict'
            ? 'border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-400/30'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
        "
        @click="flipMode('strict')"
      >
        <p class="flex items-center gap-1.5">
          <span
            class="text-[10px] uppercase tracking-wide text-emerald-300 font-semibold"
            >Strict</span
          >
          <span
            v-if="selectedMode === 'strict'"
            class="text-[9px] uppercase tracking-wide text-emerald-300/80 font-medium"
            >Active</span
          >
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(strictScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ strictGrade ?? "—" }}</span
          >
        </p>
      </button>
      <button
        type="button"
        :aria-pressed="selectedMode === 'remediation'"
        data-testid="mode-compare-practical"
        class="text-left rounded-md border px-2.5 py-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        :class="
          selectedMode === 'remediation'
            ? 'border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/30'
            : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
        "
        @click="flipMode('remediation')"
      >
        <p class="flex items-center gap-1.5">
          <span
            class="text-[10px] uppercase tracking-wide text-amber-300 font-semibold"
            >Practical</span
          >
          <span
            v-if="selectedMode === 'remediation'"
            class="text-[9px] uppercase tracking-wide text-amber-300/80 font-medium"
            >Active</span
          >
        </p>
        <p class="mt-0.5 font-mono text-sm text-[var(--text-heading)]">
          {{ formatScore(practicalScore) }}
          <span class="text-[var(--text-muted)] text-xs"
            >·
            {{ practicalGrade ?? "—" }}</span
          >
        </p>
      </button>
    </div>
    <div class="mt-2.5 space-y-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
      <p>
        <span class="font-semibold text-[var(--text-secondary)]"
          >Why the scores differ:</span
        >
        {{ copy.whatPracticalCredits }}
      </p>
      <p
        v-for="block in orderedWhyBlocks"
        :key="block.key"
        :class="block.key === activeWhyKey ? 'text-[var(--text-secondary)]' : ''"
      >
        <span class="font-semibold" :class="block.accentClass">
          Why {{ block.label }} matters:
        </span>
        {{ block.text
        }}<span
          v-if="block.key === activeWhyKey"
          class="ml-1 text-[10px] uppercase tracking-wide"
          :class="block.accentClass"
          >· active view</span
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  canCategoryDiverge,
  getDivergenceCopy,
} from "~/utils/modeDivergence";
import type { ScoringMode } from "~/utils/scoringProfiles";

const props = defineProps<{
  categoryId: string;
  strictScore: number | null;
  strictGrade: string | null;
  practicalScore: number | null;
  practicalGrade: string | null;
  selectedMode: ScoringMode;
}>();

const emit = defineEmits<{
  "update:selectedMode": [mode: ScoringMode];
}>();

const rootEl = ref<HTMLElement | null>(null);

// Keep the clicked card visually static across the mode flip. Content
// above the box (rationale banners, divergence badges, category-mode
// badges) re-renders with different heights when the mode changes, which
// without this handler would shift the clicked card up or down in the
// viewport. Capture the box's viewport-relative top before the emit,
// and after Vue has flushed the DOM, scroll by the delta.
async function flipMode(mode: ScoringMode) {
  if (mode === props.selectedMode) return;
  const el = rootEl.value;
  const beforeTop = el?.getBoundingClientRect().top ?? null;
  emit("update:selectedMode", mode);
  if (beforeTop === null || typeof window === "undefined") return;
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const afterTop = el?.getBoundingClientRect().top ?? null;
  if (afterTop === null) return;
  const delta = afterTop - beforeTop;
  if (Math.abs(delta) > 1) {
    window.scrollBy({ top: delta, left: 0, behavior: "instant" as ScrollBehavior });
  }
}

const copy = computed(() => getDivergenceCopy(props.categoryId));

const diverges = computed(() => {
  if (!canCategoryDiverge(props.categoryId)) return false;
  return props.strictScore !== props.practicalScore;
});

const activeWhyKey = computed(() =>
  props.selectedMode === "strict" ? "strict" : "practical",
);

const orderedWhyBlocks = computed(() => {
  const strictBlock = {
    key: "strict" as const,
    label: "Strict",
    text: copy.value.whyStrictMatters,
    accentClass: "text-emerald-300",
  };
  const practicalBlock = {
    key: "practical" as const,
    label: "Practical",
    text: copy.value.whyPracticalMatters,
    accentClass: "text-amber-300",
  };
  return props.selectedMode === "strict"
    ? [strictBlock, practicalBlock]
    : [practicalBlock, strictBlock];
});

function formatScore(score: number | null): string {
  return score === null ? "N/A" : `${score}/100`;
}
</script>

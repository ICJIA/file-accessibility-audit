<template>
  <div class="mb-6">
    <!-- The completion message lives HERE, as the switcher's own header —
         not in a separate dismissible banner — so the one element that says
         "you have N reports" is the same element used to switch between
         them. -->
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2 px-1">
      <p
        class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
        aria-hidden="true"
      >
        Your {{ items.length }} reports
      </p>
      <p class="text-xs text-[var(--text-secondary)]">
        All {{ items.length }} files processed — select a file to read its report.
      </p>
    </div>

    <div
      role="tablist"
      :aria-label="`${items.length} file results`"
      class="grid gap-2"
      style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))"
    >
      <AppTooltip
        v-for="(item, idx) in items"
        :key="item.id"
        v-slot="{ tooltipId }"
        :text="item.filename"
      >
        <!-- Every card — active or not — keeps full card chrome (border +
             surface). The previous switcher styled inactive tabs as muted
             text on a transparent gradient, and users simply did not see
             them (the "I don't see the second tab" report, 2026-08-17). -->
        <button
          role="tab"
          :aria-selected="activeIndex === idx"
          :aria-describedby="tooltipId"
          class="batch-file-card flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all w-full min-w-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
          :class="
            activeIndex === idx
              ? 'border-[var(--border-hover)] bg-[var(--surface-hover)] shadow-sm'
              : 'border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)]'
          "
          @click="emit('switch', idx)"
        >
          <!-- Grade ring: a miniature of the report hero, in the grade's own
               color — the scoreboard reading of "N files, N grades". -->
          <span
            v-if="item.status === 'done' && item.result?.grade"
            class="flex-shrink-0 inline-flex w-10 h-10 rounded-full border-2 items-center justify-center text-base font-bold"
            :style="{
              borderColor: gradeColor(item.result.grade),
              color: gradeColor(item.result.grade),
              backgroundColor: withAlpha(gradeColor(item.result.grade), 10),
            }"
            :aria-label="`Grade ${item.result.grade}`"
            >{{ item.result.grade }}</span
          >
          <span
            v-else
            class="flex-shrink-0 inline-flex w-10 h-10 rounded-full border-2 items-center justify-center"
            :class="
              item.status === 'error'
                ? 'border-red-500/40 text-red-500'
                : 'border-[var(--border)] text-[var(--text-muted)]'
            "
          >
            <svg
              v-if="item.status === 'error'"
              class="w-5 h-5"
              aria-label="Error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <svg
              v-else
              class="w-5 h-5"
              aria-label="Cancelled"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </span>

          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm"
              :class="
                activeIndex === idx
                  ? 'text-[var(--text-heading)] font-medium'
                  : 'text-[var(--text-secondary)]'
              "
              >{{ item.filename }}</span
            >
            <span
              v-if="item.status === 'done' && item.result"
              class="block text-xs text-[var(--text-muted)] tabular-nums"
              >{{ item.result.overallScore }}<span class="opacity-70">/100</span></span
            >
            <span v-else-if="item.status === 'error'" class="block text-xs text-red-500"
              >Couldn't analyze</span
            >
            <span v-else class="block text-xs text-[var(--text-muted)]">Cancelled</span>
          </span>
        </button>
      </AppTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppTooltip from "~/components/AppTooltip.vue";
import { useTokenColors } from "~/composables/useTokenColors";

interface SwitcherItem {
  id: string;
  filename: string;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  result: { grade: string; overallScore: number } | null;
}

defineProps<{
  items: SwitcherItem[];
  activeIndex: number;
}>();

const emit = defineEmits<{ switch: [idx: number] }>();

const { gradeColor, withAlpha } = useTokenColors();
</script>

<template>
  <section class="category-bars" aria-labelledby="category-bars-title">
    <h2 id="category-bars-title" class="pk-display text-2xl sm:text-3xl text-[var(--text-heading)]">
      Where the points went
    </h2>

    <p class="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
      Each category is scored out of 100. The ones with something to fix come first.
    </p>

    <ul class="mt-5 list-none m-0 p-0" role="list">
      <li
        v-for="cat in ordered"
        :key="cat.id"
        data-testid="bar-row"
        class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-2 border-t-2 border-[var(--border-alt)] pt-3 pb-4"
        :aria-label="rowLabel(cat)"
      >
        <span class="order-1 text-sm font-bold text-[var(--text-heading)]"
          >{{ cat.label
          }}<a
            v-if="stepRanks?.[cat.id]"
            :href="`#plan-item-${cat.id}`"
            class="ml-2 font-semibold underline whitespace-nowrap text-[var(--link)] hover:text-[var(--link-hover)]"
            >fix {{ stepRanks[cat.id] }}</a
          ></span
        >
        <div class="order-4 col-span-3 h-2.5 bg-[var(--surface-icon)]" aria-hidden="true">
          <div
            data-testid="bar-fill"
            class="h-2.5"
            :class="isFlagged(cat) ? '' : 'bg-[var(--sev-pass)]'"
            :style="
              isFlagged(cat)
                ? { width: `${cat.score}%`, backgroundColor: sevColor(cat.severity!) }
                : { width: `${cat.score}%` }
            "
          />
        </div>
        <span
          class="order-3 text-right text-sm font-bold text-[var(--text-heading)] before:content-['·'] before:mr-2"
          aria-hidden="true"
          >{{ cat.score }}</span
        >
        <!-- NO per-category letter (2026-09-01): a letter beside a category
             score gets read as the DOCUMENT's grade — the product's own
             author read a B report as a C off the title row's chip. The bar
             colour still encodes the band; score + severity say the rest.
             The overall grade keeps its letter in the hero alone. -->
        <!-- FIXED WIDTH, and ALWAYS RENDERED (2026-08-31 bug report). The
             track above is flex-1, so anything variable to its right changes
             how much room the track gets — and the fill is a percentage OF
             THE TRACK. "Minor" is far narrower than "No issues found", so a
             94 sat in a wider track and drew a LONGER bar than a 100 beside
             it. A row with no severity at all rendered no chip and was wider
             still. Every trailing column is now a fixed size, so every track
             is identical and the bars are comparable down the column, which
             is the entire point of showing them stacked.

             7rem, not 6.5: "No scored issues" (v1.149.0) measures 99px in a
             104px track — it fits, but five pixels is not margin, it is luck
             with one font. Widening the shared track keeps every bar
             comparable and costs nothing.

             Plakat layout (2026-11): the bar now has a row to itself, under
             the label, the status and the score, so every track is the full
             width of the list by construction and the bars stay comparable. -->
        <span
          class="order-2 w-[7rem] flex-shrink-0 text-xs font-semibold text-right whitespace-nowrap"
          aria-hidden="true"
          ><span
            v-if="cat.severity"
            class="inline-block py-0.5 text-sm font-bold"
            :class="isFlagged(cat) ? '' : 'text-[var(--sev-pass)]'"
            :style="isFlagged(cat) ? { color: sevColor(cat.severity) } : {}"
            >{{ cat.severity }}</span
          ></span
        >
      </li>
    </ul>

    <div
      v-if="na.length"
      data-testid="bars-na"
      class="pt-3 border-t-2 border-[var(--border-alt)] space-y-1"
    >
      <p class="sr-only">Not scored</p>
      <!-- A term and its explanation, so a description list — not a bold
           <p> over a small one, which axe DevTools read as a heading in
           paragraph markup (p-as-heading, 2026-11-26). -->
      <dl>
        <div v-for="cat in na" :key="cat.id" class="pb-3">
          <dt
            class="flex items-baseline justify-between gap-4 text-sm font-bold text-[var(--text-muted)]"
          >
            <span>{{ cat.label }}</span>
            <span
              ><span class="sr-only">: </span
              >{{ cat.notAssessed ? "Not assessed" : "Not applicable" }}</span
            >
          </dt>
          <dd class="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            {{ naReason(cat.id, cat.notAssessed) }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useTokenColors } from "~/composables/useTokenColors";
import { computed } from "vue";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { severityColor } = useTokenColors();
import { naReason } from "~/utils/modeDivergence";

interface BarCategory {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  notAssessed?: boolean;
}

const props = defineProps<{
  categories: BarCategory[];
  /** Category id → the number of the action-plan step that fixes it, so a bar
   *  can point at its fix. Absent = no links. */
  stepRanks?: Record<string, number>;
}>();

const safe = computed<BarCategory[]>(() =>
  Array.isArray(props.categories) ? props.categories : [],
);
const scored = computed(() => safe.value.filter((c) => c.score !== null));
const na = computed(() => safe.value.filter((c) => c.score === null));
// Problems first: categories with something to fix, lowest score first; then
// the rest in their usual order. Array.sort is stable, so ties keep it.
const ordered = computed(() =>
  [...scored.value].sort((a, b) => {
    const fa = isFlagged(a);
    const fb = isFlagged(b);
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? (a.score ?? 0) - (b.score ?? 0) : 0;
  }),
);

// A category with a Critical, Moderate or Minor finding draws its bar and its
// status in that severity's colour; one with nothing to fix draws them in the
// pass green (--sev-pass, measured for both themes). They were grey for a few
// hours of 2026-11-25 and read as "not scored" (user report) — grey is now
// kept for the categories that really are not scored, listed under the bars.
function isFlagged(cat: BarCategory): boolean {
  return cat.severity === "Critical" || cat.severity === "Moderate" || cat.severity === "Minor";
}
function sevColor(severity: string): string {
  return severityColor(severity);
}
function rowLabel(cat: BarCategory): string {
  const sev = cat.severity ? `, severity ${cat.severity}` : "";
  return `${cat.label}: ${cat.score} out of 100${sev}`;
}
</script>

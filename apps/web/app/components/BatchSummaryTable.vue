<template>
  <section
    class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-4"
    aria-labelledby="batch-summary-heading"
    data-testid="batch-summary"
    data-export-exclude
  >
    <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h3 id="batch-summary-heading" class="text-sm font-semibold text-[var(--text-heading)]">
        Batch summary
      </h3>
      <button
        type="button"
        data-testid="batch-csv"
        class="rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
        @click="downloadCsv"
      >
        Download summary (CSV)
      </button>
    </div>

    <!-- Wide tables scroll sideways INSIDE this box, so the page itself never
         scrolls horizontally at 320 px. Focusable and named so the scrolling
         is reachable from the keyboard (WCAG 2.1.1). -->
    <div class="overflow-x-auto" role="region" aria-labelledby="batch-summary-caption" tabindex="0">
      <table class="w-full min-w-[44rem] border-collapse text-left text-xs sm:text-sm">
        <caption id="batch-summary-caption" class="mb-2 text-left text-xs text-[var(--text-muted)]">
          One row for each file in this batch: its overall grade and score, how many of its checks
          are critical, moderate or minor, and its most serious issue.
          {{
            sortDescription
          }}
        </caption>
        <thead>
          <tr class="border-b border-[var(--border)] text-[var(--text-muted)]">
            <th scope="col" class="py-2 pr-3 font-semibold">File</th>
            <th scope="col" class="py-2 pr-3 font-semibold">Format</th>
            <th scope="col" class="py-2 pr-3 font-semibold">Grade</th>
            <th scope="col" class="py-2 pr-3 font-semibold" :aria-sort="sort">
              <!-- The sort control is a real button inside the header cell;
                   aria-sort on the cell says which way it currently sorts,
                   and the arrow is repeated in words for everyone else. -->
              <button
                type="button"
                data-testid="batch-sort-score"
                class="inline-flex items-center gap-1 rounded font-semibold underline decoration-dotted underline-offset-2 hover:text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
                @click="cycleSort"
              >
                Score
                <span aria-hidden="true">{{ sortArrow }}</span>
                <span class="sr-only">— {{ sortButtonHint }}</span>
              </button>
            </th>
            <th scope="col" class="py-2 pr-3 font-semibold">Critical</th>
            <th scope="col" class="py-2 pr-3 font-semibold">Moderate</th>
            <th scope="col" class="py-2 pr-3 font-semibold">Minor</th>
            <th scope="col" class="py-2 pr-3 font-semibold">Top issue</th>
            <th scope="col" class="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedRows"
            :key="row.id"
            class="border-b border-[var(--border)] last:border-b-0 align-top"
            :class="row.index === activeIndex ? 'bg-[var(--surface-hover)]' : ''"
          >
            <th scope="row" class="max-w-[16rem] py-2 pr-3 font-medium">
              <!-- The filename opens that file's report below. -->
              <button
                type="button"
                data-testid="batch-summary-view"
                class="break-all text-left underline text-[var(--link)] hover:text-[var(--link-hover)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
                :aria-current="row.index === activeIndex ? 'true' : undefined"
                @click="emit('view', row.index)"
              >
                {{ row.filename }}<span class="sr-only"> — show this report</span>
              </button>
              <span
                v-if="row.index === activeIndex"
                class="mt-0.5 block text-[11px] font-normal text-[var(--text-muted)]"
                >Showing below</span
              >
            </th>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">{{ row.format }}</td>
            <td class="py-2 pr-3 font-bold text-[var(--text-heading)]">
              {{ row.grade ?? "—" }}
            </td>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">
              <template v-if="row.score !== null">{{ row.score }}</template>
              <template v-else
                ><span aria-hidden="true">—</span><span class="sr-only">No score</span></template
              >
            </td>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">{{ row.critical ?? "—" }}</td>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">{{ row.moderate ?? "—" }}</td>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">{{ row.minor ?? "—" }}</td>
            <td class="py-2 pr-3 text-[var(--text-secondary)]">{{ row.topIssue }}</td>
            <td class="py-2 text-[var(--text-secondary)]">
              <span
                class="font-medium"
                :class="row.status === 'Failed' ? 'text-[var(--status-error)]' : ''"
                >{{ row.status }}</span
              >
              <span v-if="row.reason" class="block text-xs text-[var(--text-muted)]">{{
                row.reason
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Said once, politely, when the order changes or the file is saved. -->
    <p class="sr-only" role="status" aria-live="polite" data-testid="batch-summary-status">
      {{ announcement }}
    </p>
    <p class="mt-2 text-xs text-[var(--text-muted)]">
      The score is each document's overall score out of 100. The CSV holds the same rows, in the
      order the files were added.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  batchSummaryCsv,
  batchSummaryFilename,
  sortByScore,
  summarizeBatch,
  type BatchSummaryInput,
  type ScoreSort,
} from "~/utils/batchSummary";
import { downloadBlob } from "~/utils/download";

const props = defineProps<{
  items: BatchSummaryInput[];
  activeIndex: number;
}>();
const emit = defineEmits<{ view: [index: number] }>();

const rows = computed(() => summarizeBatch(props.items));
const sort = ref<ScoreSort>("none");
const sortedRows = computed(() => sortByScore(rows.value, sort.value));
const announcement = ref("");

const sortArrow = computed(() =>
  sort.value === "ascending" ? "↑" : sort.value === "descending" ? "↓" : "↕",
);
const sortDescription = computed(() =>
  sort.value === "ascending"
    ? "Sorted by score, lowest first."
    : sort.value === "descending"
      ? "Sorted by score, highest first."
      : "In the order the files were added.",
);
const sortButtonHint = computed(() =>
  sort.value === "none"
    ? "sort lowest score first"
    : sort.value === "ascending"
      ? "sort highest score first"
      : "return to the order the files were added",
);

// Lowest first on the first press: the files that need the most work are
// what a person sorting a batch is looking for.
function cycleSort() {
  sort.value =
    sort.value === "none" ? "ascending" : sort.value === "ascending" ? "descending" : "none";
  announcement.value = sortDescription.value;
}

function downloadCsv() {
  const blob = new Blob([batchSummaryCsv(rows.value)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, batchSummaryFilename());
  announcement.value = "Summary downloaded as a CSV file.";
}
</script>

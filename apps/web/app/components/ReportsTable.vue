<template>
  <div class="rounded-xl border border-[var(--border)]" :class="wrapperClass">
    <table class="w-full text-sm" :class="tableClass">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead class="bg-[var(--surface-card)] text-[var(--text-muted)]">
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            class="py-3 font-medium"
            :class="[
              col.align === 'center' ? cellPaddingXCenter : cellPaddingX,
              alignClass(col.align),
            ]"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--border)]">
        <tr
          v-for="(row, index) in rows"
          :key="row.id != null ? String(row.id) : index"
          class="hover:bg-[var(--surface-card-50)] transition-colors"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="py-3"
            :class="[
              col.align === 'center' ? cellPaddingXCenter : cellPaddingX,
              alignClass(col.align),
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">{{
              row[col.key]
            }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
/**
 * ReportsTable — the shared table shell behind pages/history.vue (admin audit
 * log) and pages/my-history.vue (personal analysis history). Task F3 dedupes
 * the two pages' near-identical table markup into this component +
 * usePaginatedReports.ts + PaginationControls.vue.
 *
 * Deliberately dumb: it owns only structure (table/thead/tbody, the column
 * and row loops) and table a11y semantics (`scope="col"` on every header,
 * a visually-hidden `<caption>` — Task F6's table requirements, folded in
 * from the start rather than bolted on later). Every cell's *presentation*
 * (badges, colors, date formats, fallback dashes) belongs to the calling
 * page via a `cell-<column key>` scoped slot — the admin log and the
 * personal history render the same "Grade"/"Date" columns quite differently
 * on purpose (e.g. a colored grade circle vs plain text, a short date vs a
 * long one), and this component makes no assumption that they should match.
 *
 * The page decides what to render when `rows` is empty (my-history.vue shows
 * a "No analyses yet" message instead of the table at all; history.vue just
 * renders the table with no rows) — that's app-level, not this component's.
 */
export interface ReportsTableColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
}

withDefaults(
  defineProps<{
    rows: Array<Record<string, unknown>>;
    columns: ReportsTableColumn[];
    /** Visually-hidden <caption> — the table's accessible name for screen-reader/table-navigation users. */
    caption: string;
    /** Extra classes appended to the <table> element (e.g. a page-specific min-width). */
    tableClass?: string;
    /** Extra classes appended to the scrolling wrapper <div> (e.g. overflow-x-auto). */
    wrapperClass?: string;
    /** Horizontal cell padding for left/right-aligned columns. */
    cellPaddingX?: string;
    /** Horizontal cell padding for center-aligned columns (original tables used a narrower value here). */
    cellPaddingXCenter?: string;
  }>(),
  {
    tableClass: "",
    wrapperClass: "overflow-x-auto",
    cellPaddingX: "px-3 sm:px-4",
    cellPaddingXCenter: "px-2 sm:px-4",
  },
);

function alignClass(align?: "left" | "center" | "right"): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}
</script>

<!-- apps/web/app/components/MatterhornReportPanel.vue
     "Your document against the Matterhorn checklist" (v1.93.0) — the
     landing page's 31-checkpoint disclosure made concrete for ONE report.
     Renders on all four report surfaces (Visual + Detailed × live and
     shared pages), collapsed by default per the asymmetry rule.

     HONESTY CONTRACT (pinned by matterhornReportPanel.test.ts):
       - No aggregate count, ever — a "24 of 31" beside a letter grade is
         read as a second grade. The panel never renders totals.
       - Statuses are words, never a bare "Pass": "Issues found" /
         "No machine-detected issues" / "Needs human review" /
         "Not machine-checked".
       - veraPDF evidence lines show the raw clause + description verbatim;
         unmappable rules land in a visible "Other PDF/UA rules" block.
     Self-hides for non-PDF reports and category-less page-audit rows (the
     projection returns null). Explicit imports — see AnnouncementBanner. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { buildMatterhornProjection, type MatterhornRowStatus } from "~/utils/matterhornReport";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard in the util.
  // (@typescript-eslint/no-explicit-any is off repo-wide — see eslint.config.mjs.)
  result: Record<string, any>;
}>();

const open = ref(false);

const projection = computed(() => buildMatterhornProjection(props.result ?? {}));

interface StatusStyle {
  label: string;
  chipClass: string;
}
const STATUS_STYLES: Record<MatterhornRowStatus, StatusStyle> = {
  issues: {
    label: "Issues found",
    chipClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  clean: {
    label: "No machine-detected issues",
    chipClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  human: {
    label: "Needs human review",
    chipClass: "border-[var(--border)] bg-transparent text-[var(--text-muted)]",
  },
  unchecked: {
    label: "Not machine-checked",
    chipClass: "border-dashed border-[var(--border)] bg-transparent text-[var(--text-muted)]",
  },
};

const MAX_EVIDENCE_PER_ROW = 5;
</script>

<template>
  <section
    v-if="projection"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    data-testid="matterhorn-report-panel"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 text-left"
      :aria-expanded="open"
      data-testid="matterhorn-report-toggle"
      @click="open = !open"
    >
      <span>
        <span class="block text-sm sm:text-base font-semibold text-[var(--text-heading)]"
          >Your document against the Matterhorn checklist</span
        >
        <span class="mt-0.5 block text-xs text-[var(--text-muted)]"
          >How this report's findings land on the PDF industry's 31-checkpoint test model — the same
          checklist explained on the front page.</span
        >
      </span>
      <span
        class="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)]"
        aria-hidden="true"
      >
        {{ open ? "Hide ↑" : "Show ↓" }}
      </span>
    </button>

    <div v-if="open" class="mt-4">
      <p class="text-xs text-[var(--text-muted)] leading-relaxed">
        This is a different grouping of the findings already in this report — it adds nothing to the
        score and takes nothing from it. It exists so you (or a remediation vendor who works from
        PAC or the Matterhorn Protocol) can see where this document stands on each checkpoint.
      </p>
      <p
        class="mt-2 text-xs text-[var(--text-muted)] leading-relaxed"
        data-testid="matterhorn-law-linkage"
      >
        <strong class="text-[var(--text-secondary)]"
          >Why these checkpoints matter to an Illinois agency:</strong
        >
        ADA Title II and the Illinois IITAA make <strong>WCAG</strong> the legal accessibility
        standard for public bodies — but WCAG says <em>what</em> must be true of any content, not
        <em>how</em> a PDF shows it internally. The Matterhorn Protocol is the PDF industry's
        translation of those same requirements into concrete, testable form — and it is what
        professional checkers like PAC actually test. Clearing this report's findings advances both
        at once: the WCAG obligation the law names, and the PDF-specific checks evaluators run. (To
        be precise, the law requires WCAG, not a PDF/UA badge — but the two overlap heavily by
        design.)
      </p>
      <p
        v-if="!projection.veraPdfRan"
        class="mt-2 text-xs text-[var(--text-muted)] leading-relaxed"
        data-testid="matterhorn-vera-missing"
      >
        The veraPDF machine check did not run for this report, so checkpoints only veraPDF covers
        show <em>Not machine-checked</em>, and partially-covered checkpoints reflect the audit
        engine's checks alone.
      </p>

      <!-- Two columns for the one-line checkpoints; FULL WIDTH the moment a
           checkpoint has findings. A grid row is as tall as its tallest cell,
           so a checkpoint with five veraPDF clauses used to sit beside an
           empty one and the reader had to work out which heading a block of
           findings belonged to. Reported from a real report, 2026-08-28. -->
      <!-- ONE column, top to bottom (v1.115.0). Two columns meant a grid row
           was as tall as its tallest cell, so a checkpoint with five veraPDF
           clauses sat beside an empty one; giving those the full row fixed the
           association but left a mixed rhythm — one column here, two there,
           and a lone checkpoint banded across half the panel. A single column
           makes every checkpoint its own row: the band always spans the whole
           width, and the row index IS the visual row.

           No row gap, because the zebra bands have to meet edge to edge; the
           spacing lives in each row's padding, and the negative margin lets a
           band bleed to the card's inner edge rather than eat the row's
           width. -->
      <ol class="mt-4 -mx-3 list-none p-0" data-testid="matterhorn-list">
        <li
          v-for="(row, index) in projection.rows"
          :key="row.checkpoint.id"
          class="grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 border-t border-[var(--border-subtle,var(--border))] px-3 py-2.5"
          :class="index % 2 === 1 ? 'bg-[var(--surface-raised)]' : ''"
          :data-visual-row="index"
          data-testid="matterhorn-row"
        >
          <!-- The checkpoint's own number, at display size: this is a
               numbered standard, and the numeral is how a reader crossreferences
               a finding with PAC or the Matterhorn document. Tabular figures so
               the column of numerals lines up; quiet in colour so it marks the
               step without competing with the checkpoint's name. -->
          <span
            class="font-mono text-2xl leading-none tabular-nums text-right text-[var(--text-muted)]"
            aria-hidden="true"
            data-testid="matterhorn-number"
            >{{ row.checkpoint.id }}</span
          >
          <div class="min-w-0">
            <p class="text-sm font-medium text-[var(--text-heading)]">
              {{ row.checkpoint.name }}
              <span
                class="ml-1.5 inline-block align-middle rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                :class="STATUS_STYLES[row.status].chipClass"
                >{{ STATUS_STYLES[row.status].label }}</span
              >
            </p>
            <!-- The rail is what ties these lines to the heading above
                   them. Each line is a two-column grid so a wrapped clause
                   hangs under its own text instead of under the veraPDF tag —
                   the clauses run long, and a ragged left edge is what made a
                   list of five of them hard to read. The tag column is a FIXED
                   width rather than auto: each line is its own grid, so an
                   auto column would size to its own row and every description
                   would start at a different x — including the plain-language
                   findings, which carry no tag at all. -->
            <ul
              v-if="row.evidence.length"
              class="mt-1.5 space-y-1.5 border-l border-[var(--border)] pl-3 text-xs text-[var(--text-muted)] leading-relaxed list-none"
              data-testid="matterhorn-evidence"
            >
              <li
                v-for="ev in row.evidence.slice(0, MAX_EVIDENCE_PER_ROW)"
                :key="ev.label"
                class="grid grid-cols-[3.75rem_1fr] gap-x-1"
              >
                <span
                  class="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300/80"
                  >{{ ev.source === "verapdf" ? "veraPDF" : "" }}</span
                >
                <span>{{ ev.label }}</span>
              </li>
              <li v-if="row.evidence.length > MAX_EVIDENCE_PER_ROW" class="pl-1 italic">
                … and {{ row.evidence.length - MAX_EVIDENCE_PER_ROW }} more finding(s) — see the
                categories above.
              </li>
            </ul>
          </div>
        </li>
      </ol>

      <div
        v-if="projection.unmapped.length"
        class="mt-4 border-t border-[var(--border)] pt-3"
        data-testid="matterhorn-unmapped"
      >
        <p class="text-sm font-medium text-[var(--text-heading)]">Other PDF/UA rules</p>
        <p class="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
          veraPDF findings whose rule doesn't group under one checkpoint — every one is either
          listed or counted below, never silently dropped:
        </p>
        <ul class="mt-1 space-y-0.5 text-xs text-[var(--text-muted)] leading-relaxed list-none p-0">
          <li v-for="ev in projection.unmapped" :key="ev.label">
            <span class="font-mono text-[10px] uppercase tracking-wider text-amber-300/80"
              >veraPDF</span
            >
            {{ ev.label }}
          </li>
          <li v-if="projection.unmappedTruncated > 0" data-testid="matterhorn-unmapped-more">
            … and {{ projection.unmappedTruncated }} more rule(s) not shown — open the PDF/UA panel
            above (or run veraPDF locally) for the full list.
          </li>
        </ul>
      </div>

      <p
        class="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)] leading-relaxed"
      >
        <em>No machine-detected issues</em> means the machine-checkable side of a checkpoint came up
        clean for the parts this tool and veraPDF examine — most checkpoints also carry conditions
        only a person can judge, which the manual-review card lists. veraPDF lines show the rule's
        own clause number and wording, grouped under the checkpoint that clause belongs to.
        <NuxtLink to="/#matterhorn" class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >How the checklist works</NuxtLink
        >
      </p>
    </div>
  </section>
</template>

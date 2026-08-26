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
        v-if="!projection.veraPdfRan"
        class="mt-2 text-xs text-[var(--text-muted)] leading-relaxed"
        data-testid="matterhorn-vera-missing"
      >
        The veraPDF machine check did not run for this report, so checkpoints only veraPDF covers
        show <em>Not machine-checked</em>, and partially-covered checkpoints reflect the audit
        engine's checks alone.
      </p>

      <ol class="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 list-none p-0">
        <li
          v-for="row in projection.rows"
          :key="row.checkpoint.id"
          class="border-t border-[var(--border-subtle,var(--border))] pt-3"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-px shrink-0 font-mono text-[11px] text-[var(--text-muted)]"
              aria-hidden="true"
              >{{ row.checkpoint.id }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-[var(--text-heading)]">
                {{ row.checkpoint.name }}
                <span
                  class="ml-1.5 inline-block align-middle rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  :class="STATUS_STYLES[row.status].chipClass"
                  >{{ STATUS_STYLES[row.status].label }}</span
                >
              </p>
              <ul
                v-if="row.evidence.length"
                class="mt-1 space-y-0.5 text-xs text-[var(--text-muted)] leading-relaxed list-none p-0"
              >
                <li v-for="ev in row.evidence.slice(0, MAX_EVIDENCE_PER_ROW)" :key="ev.label">
                  <span
                    v-if="ev.source === 'verapdf'"
                    class="font-mono text-[10px] uppercase tracking-wider text-amber-300/80"
                    >veraPDF</span
                  >
                  {{ ev.label }}
                </li>
                <li v-if="row.evidence.length > MAX_EVIDENCE_PER_ROW">
                  … and {{ row.evidence.length - MAX_EVIDENCE_PER_ROW }} more finding(s) — see the
                  categories above.
                </li>
              </ul>
            </div>
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
          veraPDF findings whose rule doesn't group under one checkpoint — listed here so nothing is
          dropped:
        </p>
        <ul class="mt-1 space-y-0.5 text-xs text-[var(--text-muted)] leading-relaxed list-none p-0">
          <li v-for="ev in projection.unmapped" :key="ev.label">
            <span class="font-mono text-[10px] uppercase tracking-wider text-amber-300/80"
              >veraPDF</span
            >
            {{ ev.label }}
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

<template>
  <section
    data-testid="adobe-parity-card"
    class="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4 sm:px-6 sm:py-5 shadow-sm"
  >
    <!-- Header -->
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p
          class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]"
        >
          Reconciliation view
        </p>
        <h2
          class="mt-1 text-base sm:text-lg font-semibold text-[var(--text-heading)]"
        >
          Adobe Acrobat parity — 32 rules
        </h2>
        <p
          class="mt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
        >
          The 32 rules Acrobat's built-in Accessibility Checker runs, mirrored
          here alongside what this tool saw. No aggregated "Adobe score" is
          published — anchoring on the higher number would defeat the purpose.
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        :aria-expanded="expanded"
        aria-controls="adobe-parity-body"
        @click="expanded = !expanded"
      >
        {{ expanded ? "Hide details" : "Show 32 rules" }}
      </button>
    </header>

    <!-- Authority callout — always visible, even when body is collapsed -->
    <div
      class="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:px-5 sm:py-4 text-amber-100"
      role="note"
      aria-label="Authority note"
    >
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em]">
        Worth knowing — Adobe is not the canonical reference
      </p>
      <p class="mt-2 text-xs sm:text-sm leading-relaxed">
        Managers and authors often treat "Adobe Accessibility Checker says
        Passed" as the definitive verdict. It is not. Acrobat's built-in
        checker runs
        <strong>32 binary rules</strong>
        that Adobe chose to automate. The actual authorities are:
      </p>
      <ul
        class="mt-2 ml-4 list-disc text-xs sm:text-sm leading-relaxed space-y-1"
      >
        <li>
          <strong>WCAG 2.1 Level AA</strong> — the W3C standard, the legal
          basis for ADA case law, Section 508, EU EN 301 549, and Illinois
          IITAA §E205.4.
        </li>
        <li>
          <strong>PDF/UA (ISO 14289-1)</strong> — the ISO standard specifically
          for accessible PDFs, referenced in IITAA §504.2.2.
        </li>
        <li>
          <strong>Matterhorn Protocol</strong> — the PDF Association's full
          conformance test, with
          <strong>136 failure conditions</strong>
          (vs. Acrobat's 32). Closer to canonical for PDF/UA.
        </li>
      </ul>
      <p class="mt-3 text-xs sm:text-sm leading-relaxed">
        Most of Acrobat's rules are
        <em>existence-validators</em>: they check whether tags that already
        exist are well-formed. They almost never assert that a type of content
        <em>must exist</em>. On a document with sparse structure, most rules
        pass vacuously — Acrobat runs out of things to flag. This tool scores
        against WCAG + IITAA directly and catches the gaps Acrobat's checker
        does not.
      </p>
    </div>

    <!-- Summary tallies -->
    <div
      class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3 text-xs sm:text-sm"
    >
      <StatPill
        label="Passed"
        :value="summary.passed"
        tone="pass"
        :sub="
          summary.vacuousPasses > 0
            ? `${summary.vacuousPasses} vacuous`
            : undefined
        "
      />
      <StatPill label="Failed" :value="summary.failed" tone="fail" />
      <StatPill label="Manual" :value="summary.manual" tone="info" />
      <StatPill label="Skipped" :value="summary.skipped" tone="muted" />
      <StatPill
        label="Not computed"
        :value="summary.notComputed"
        tone="muted"
      />
    </div>

    <p
      v-if="summary.vacuousPasses > 0"
      class="mt-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
    >
      <strong class="text-amber-200">Watch the vacuous count.</strong>
      {{ summary.vacuousPasses }} of {{ summary.passed }} passes above clear
      Acrobat's bar only because the relevant content does not exist in the
      document (no tables → table rules pass, no figures → alt-text rules
      pass). Acrobat still reports these as "Passed" with no asterisk.
    </p>

    <!-- Rule detail -->
    <div v-show="expanded" id="adobe-parity-body" class="mt-5 space-y-5">
      <div
        v-for="(rulesInCategory, category) in groupedRules"
        :key="category"
        class="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <h3
          class="border-b border-[var(--border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
        >
          {{ category }}
          <span class="text-[var(--text-secondary)] normal-case tracking-normal font-normal">
            — {{ rulesInCategory.length }} rule{{
              rulesInCategory.length === 1 ? "" : "s"
            }}
          </span>
        </h3>
        <ul class="divide-y divide-[var(--border)]">
          <li
            v-for="rule in rulesInCategory"
            :key="rule.id"
            class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <div class="flex shrink-0 items-center gap-2 sm:w-56">
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                :class="statusStyle(rule.status)"
              >
                {{ statusLabel(rule.status) }}
              </span>
              <span
                v-if="rule.vacuous && rule.status === 'passed'"
                class="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200"
                title="Passes because the relevant content type does not exist in the document. Acrobat cannot flag missing content."
              >
                ⚠ vacuous
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs sm:text-sm font-medium text-[var(--text-heading)]">
                {{ rule.name }}
              </p>
              <p
                class="mt-0.5 text-[11px] sm:text-xs text-[var(--text-muted)] italic"
              >
                Acrobat: {{ rule.description }}
              </p>
              <p
                class="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
              >
                {{ rule.note }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, defineComponent, h } from "vue";

type AdobeStatus =
  | "passed"
  | "failed"
  | "manual"
  | "skipped"
  | "not_computed";

interface AdobeRuleResult {
  id: string;
  category: string;
  name: string;
  description: string;
  status: AdobeStatus;
  vacuous: boolean;
  note: string;
}

interface AdobeParitySummary {
  passed: number;
  failed: number;
  manual: number;
  skipped: number;
  notComputed: number;
  vacuousPasses: number;
  total: number;
}

const props = defineProps<{
  parity: {
    summary: AdobeParitySummary;
    rules: AdobeRuleResult[];
  };
}>();

const expanded = ref(false);
const summary = computed(() => props.parity.summary);

// Preserve Adobe's native category order.
const CATEGORY_ORDER: readonly string[] = [
  "Document",
  "Page Content",
  "Forms",
  "Alternate Text",
  "Tables",
  "Lists",
  "Headings",
];

const groupedRules = computed(() => {
  const groups: Record<string, AdobeRuleResult[]> = {};
  for (const cat of CATEGORY_ORDER) groups[cat] = [];
  for (const rule of props.parity.rules) {
    if (!groups[rule.category]) groups[rule.category] = [];
    groups[rule.category].push(rule);
  }
  return groups;
});

function statusLabel(status: AdobeStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "manual":
      return "Manual";
    case "skipped":
      return "Skipped";
    case "not_computed":
      return "Not computed";
  }
}

function statusStyle(status: AdobeStatus): string {
  switch (status) {
    case "passed":
      return "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30";
    case "failed":
      return "bg-rose-500/15 text-rose-200 border border-rose-400/30";
    case "manual":
      return "bg-sky-500/15 text-sky-200 border border-sky-400/30";
    case "skipped":
      return "bg-slate-500/15 text-slate-200 border border-slate-400/30";
    case "not_computed":
      return "bg-violet-500/15 text-violet-200 border border-violet-400/30";
  }
}

// Inline stat pill — small enough to keep co-located.
const StatPill = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    sub: { type: String, required: false, default: undefined },
    tone: {
      type: String as () => "pass" | "fail" | "info" | "muted",
      required: true,
    },
  },
  setup(p) {
    const toneClass: Record<typeof p.tone, string> = {
      pass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
      fail: "border-rose-400/30 bg-rose-500/10 text-rose-100",
      info: "border-sky-400/30 bg-sky-500/10 text-sky-100",
      muted: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]",
    };
    return () =>
      h(
        "div",
        {
          class: [
            "rounded-lg border px-3 py-2 text-center",
            toneClass[p.tone],
          ],
        },
        [
          h("div", { class: "text-lg font-semibold leading-tight" }, p.value),
          h(
            "div",
            { class: "text-[10px] uppercase tracking-wider opacity-80" },
            p.label,
          ),
          p.sub
            ? h(
                "div",
                { class: "mt-1 text-[10px] text-amber-300" },
                p.sub,
              )
            : null,
        ],
      );
  },
});
</script>

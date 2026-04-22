<template>
  <section
    data-testid="adobe-parity-card"
    class="rounded-2xl border-2 border-indigo-500/30 bg-indigo-500/[0.04] px-4 py-4 sm:px-6 sm:py-5 shadow-sm"
  >
    <!-- Header -->
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p
          class="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-300"
        >
          Third view · alongside Strict &amp; Practical
        </p>
        <h2
          class="mt-1 text-lg sm:text-xl font-semibold text-[var(--text-heading)]"
        >
          Adobe Acrobat parity — 32 rules
        </h2>
        <p
          class="mt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
        >
          The 32 binary rules Acrobat's built-in Accessibility Checker runs —
          mirrored here rule-by-rule so you can reconcile this audit against
          what Acrobat would say. Adobe's reference:
          <a
            href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
            target="_blank"
            rel="noopener noreferrer"
            class="underline decoration-dotted underline-offset-2 hover:text-[var(--text-heading)]"
          >
            helpx.adobe.com — Create and verify PDF accessibility
          </a>
          ↗. No aggregated "Adobe score" is published — anchoring on the higher
          number would defeat the purpose.
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

    <!-- Summary tallies — the at-a-glance "Acrobat view" numbers.
         Each pill is a button: click to filter + expand the rule detail
         below so users can see exactly which rules fell into that bucket.
         Hovering reveals the rule names. Click the same pill again or
         "Show all 32" to clear the filter. -->
    <div
      class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3 text-xs sm:text-sm"
      data-testid="adobe-parity-tallies"
      role="group"
      aria-label="Adobe Acrobat rule tallies — click a pill to filter the rule list below"
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
        :active="activeFilter === 'passed'"
        :title="tooltipFor('passed')"
        @click="toggleFilter('passed')"
      />
      <StatPill
        label="Failed"
        :value="summary.failed"
        tone="fail"
        :active="activeFilter === 'failed'"
        :title="tooltipFor('failed')"
        :disabled="summary.failed === 0"
        @click="toggleFilter('failed')"
      />
      <StatPill
        label="Manual"
        :value="summary.manual"
        tone="info"
        :active="activeFilter === 'manual'"
        :title="tooltipFor('manual')"
        :disabled="summary.manual === 0"
        @click="toggleFilter('manual')"
      />
      <StatPill
        label="Skipped"
        :value="summary.skipped"
        tone="muted"
        :active="activeFilter === 'skipped'"
        :title="tooltipFor('skipped')"
        :disabled="summary.skipped === 0"
        @click="toggleFilter('skipped')"
      />
      <StatPill
        label="Not computed"
        :value="summary.notComputed"
        tone="muted"
        :active="activeFilter === 'not_computed'"
        :title="tooltipFor('not_computed')"
        :disabled="summary.notComputed === 0"
        @click="toggleFilter('not_computed')"
      />
    </div>

    <p class="mt-2 text-[11px] sm:text-xs text-[var(--text-muted)] italic">
      Click a pill to see exactly which rules fall in that bucket. Hover for a
      quick preview.
    </p>

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

    <!-- Authority callout — always visible, even when rule detail is collapsed.
         Sits under the tallies so users see the numbers first, then the
         canonical-references context that explains why Acrobat isn't the bar. -->
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
        <a
          href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
          target="_blank"
          rel="noopener noreferrer"
          class="underline decoration-dotted underline-offset-2 hover:text-amber-50"
        ><strong>32 binary rules</strong></a>
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

    <!-- Rule detail -->
    <div v-show="expanded" id="adobe-parity-body" class="mt-5 space-y-5">
      <div
        v-if="activeFilter"
        class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2.5 text-xs sm:text-sm text-indigo-100"
      >
        <span>
          Showing only
          <strong>{{ statusLabel(activeFilter) }}</strong>
          rules
          ({{ filteredCount }} of {{ summary.total }}).
        </span>
        <button
          type="button"
          class="rounded-full border border-indigo-300/40 bg-indigo-300/10 px-3 py-1 text-[11px] font-medium text-indigo-100 hover:bg-indigo-300/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          @click="activeFilter = null"
        >
          Show all 32
        </button>
      </div>
      <div
        v-for="(rulesInCategory, category) in filteredGroupedRules"
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
import { computed, ref, nextTick, defineComponent, h } from "vue";

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
const activeFilter = ref<AdobeStatus | null>(null);
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

// Filter the grouped rules by activeFilter; empty categories are pruned so
// the detail view doesn't show a cluster of empty-section headers.
const filteredGroupedRules = computed(() => {
  if (!activeFilter.value) return groupedRules.value;
  const filtered: Record<string, AdobeRuleResult[]> = {};
  for (const [cat, rules] of Object.entries(groupedRules.value)) {
    const match = rules.filter((r) => r.status === activeFilter.value);
    if (match.length > 0) filtered[cat] = match;
  }
  return filtered;
});

const filteredCount = computed(() => {
  if (!activeFilter.value) return summary.value.total;
  return props.parity.rules.filter((r) => r.status === activeFilter.value)
    .length;
});

function rulesByStatus(status: AdobeStatus): AdobeRuleResult[] {
  return props.parity.rules.filter((r) => r.status === status);
}

// Native `title` tooltip content — compact list of rule names so hovering a
// pill previews exactly which rules it's pointing at, without needing to
// click. Cross-platform and works without a custom tooltip library.
function tooltipFor(status: AdobeStatus): string {
  const rules = rulesByStatus(status);
  if (rules.length === 0) {
    return `No rules in this bucket on this document.`;
  }
  const header = `${rules.length} ${statusLabel(status).toLowerCase()} rule${rules.length === 1 ? "" : "s"}:`;
  const names = rules
    .map((r) => {
      const suffix = r.vacuous && r.status === "passed" ? " (vacuous)" : "";
      return `• ${r.name}${suffix}`;
    })
    .join("\n");
  const footer = `\n\nClick to show only these rules below.`;
  return `${header}\n${names}${footer}`;
}

function toggleFilter(status: AdobeStatus): void {
  // Clicking a pill with 0 count does nothing (button is also disabled).
  if (rulesByStatus(status).length === 0) return;
  // Click same pill again → clear filter but keep detail expanded.
  if (activeFilter.value === status) {
    activeFilter.value = null;
    return;
  }
  // Otherwise switch filter and auto-expand so user sees the detail.
  activeFilter.value = status;
  expanded.value = true;
  // After Vue updates the DOM, scroll the body into view so the user sees
  // the filter result without manual scrolling.
  nextTick(() => {
    const body = document.getElementById("adobe-parity-body");
    body?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

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

// Inline stat pill. Renders as a <button> so it's keyboard-navigable and
// announces its pressed state to screen readers; clicking emits a click
// event that the parent uses to filter the rule detail list.
const StatPill = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    sub: { type: String, required: false, default: undefined },
    tone: {
      type: String as () => "pass" | "fail" | "info" | "muted",
      required: true,
    },
    active: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    title: { type: String, default: "" },
  },
  emits: ["click"],
  setup(p, { emit }) {
    const toneClass: Record<typeof p.tone, string> = {
      pass: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
      fail: "border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
      info: "border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25",
      muted:
        "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
    };
    const activeRing: Record<typeof p.tone, string> = {
      pass: "ring-emerald-300",
      fail: "ring-rose-300",
      info: "ring-sky-300",
      muted: "ring-indigo-300",
    };
    return () =>
      h(
        "button",
        {
          type: "button",
          title: p.title,
          "aria-pressed": p.active ? "true" : "false",
          "aria-label": `${p.value} ${p.label.toLowerCase()} — ${p.disabled ? "no rules in this bucket" : "click to filter"}`,
          disabled: p.disabled || undefined,
          onClick: () => {
            if (!p.disabled) emit("click");
          },
          class: [
            "rounded-xl border px-3 py-3 sm:py-4 text-center transition",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
            toneClass[p.tone],
            p.active
              ? `ring-2 ${activeRing[p.tone]} shadow-md`
              : "",
            p.disabled
              ? "opacity-50 cursor-not-allowed hover:bg-[var(--surface)]"
              : "cursor-pointer",
          ],
        },
        [
          h(
            "div",
            { class: "text-2xl sm:text-3xl font-bold leading-none" },
            p.value,
          ),
          h(
            "div",
            {
              class:
                "mt-1.5 text-[10px] sm:text-[11px] uppercase tracking-wider opacity-90 font-medium",
            },
            p.label,
          ),
          p.sub
            ? h(
                "div",
                {
                  class:
                    "mt-1.5 text-[10px] sm:text-[11px] font-semibold text-amber-300",
                },
                p.sub,
              )
            : null,
        ],
      );
  },
});
</script>

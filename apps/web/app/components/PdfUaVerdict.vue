<!-- apps/web/app/components/PdfUaVerdict.vue -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { PdfUaVerdict } from "@file-audit/shared";
import { pdfUaFixHint } from "./pdfUaFixHint";

const props = defineProps<{ verdict: PdfUaVerdict; verapdfUrl?: string; grade?: string }>();
// Default collapsed: the failed-checkpoint list is non-empty on ~95% of
// documents, so it must not dump a long list unprompted. Expandable via the
// toggle button below.
const open = ref(false);
// The grade-vs-machine-check reconciliation explainer is its own collapsible.
const whyOpen = ref(false);

// veraPDF errored rather than producing a real verdict (timeout, no stdout,
// unparseable output — see runVeraPdfOnBuffer's catch branch in
// apps/api/src/services/veraPdfBuffer.ts, which sets `error` and leaves
// totalFailureCount at 0). Must render as a neutral "could not validate"
// state, never as the definitive Fail veraPDF never actually returned.
const couldNotValidate = computed(
  () => Boolean(props.verdict?.error) && props.verdict?.totalFailureCount === 0,
);

// Grade-aware reassurance. The "Don't Panic" framing only applies when the WCAG
// grade — the measure that matters for real users — is actually good; we never
// tell someone with a failing grade that they're fine. Grade is optional (the
// remediation page reuses this panel with no grade → neutral explainer).
const isFail = computed(() => !couldNotValidate.value && !props.verdict?.passed);
const gradeKnown = computed(() => typeof props.grade === "string" && props.grade.length > 0);
const gradeIsGood = computed(() => props.grade === "A" || props.grade === "B");
const showDontPanic = computed(() => isFail.value && gradeIsGood.value);

// Defensive client-side sort so "most frequent first" and the Pareto top-3
// hold even for verdicts saved before the API sorted them (Task 1).
const sortedFailures = computed(() =>
  [...(props.verdict?.failures ?? [])].sort((a, b) => b.count - a.count),
);

// True distinct-rule count; falls back to the shown list length for reports
// saved before distinctRuleCount was recorded.
const distinctRuleCount = computed(
  () => props.verdict?.distinctRuleCount ?? sortedFailures.value.length,
);
const shownCount = computed(() => sortedFailures.value.length);
const truncated = computed(() => distinctRuleCount.value > shownCount.value);
const totalOccurrences = computed(() => props.verdict?.totalFailureCount ?? 0);

// Reframed secondary line renders only for a real, counted Fail.
const showReframe = computed(
  () =>
    !couldNotValidate.value &&
    !props.verdict?.passed &&
    distinctRuleCount.value > 0 &&
    totalOccurrences.value > 0,
);

// Pareto honesty gate: claim "top 3 dominate" only with >=4 rule types AND the
// top 3 genuinely covering >=60% of occurrences.
const topThreeShare = computed(() => {
  const total = totalOccurrences.value;
  if (total <= 0) return 0;
  return sortedFailures.value.slice(0, 3).reduce((s, f) => s + f.count, 0) / total;
});
const showPareto = computed(() => distinctRuleCount.value >= 4 && topThreeShare.value >= 0.6);
const paretoPct = computed(() => Math.min(100, Math.round(topThreeShare.value * 100)));

// The toggle's scope phrase ("the 4" / "the top 20 of 34").
const toggleScope = computed(() =>
  truncated.value
    ? `the top ${fmt(shownCount.value)} of ${fmt(distinctRuleCount.value)}`
    : `the ${fmt(distinctRuleCount.value)}`,
);

// Locale-fixed formatting so CI renders "6,941" regardless of host locale.
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
</script>

<template>
  <section
    v-if="verdict?.available"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
  >
    <div class="flex items-start gap-3">
      <span
        class="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
        :class="
          couldNotValidate
            ? 'border border-[var(--border)] text-[var(--text-muted)]'
            : verdict.passed
              ? 'bg-emerald-700/40 text-emerald-200'
              : 'bg-amber-700/40 text-amber-200'
        "
        >{{ couldNotValidate ? "?" : verdict.passed ? "✓" : "!" }}</span
      >
      <div class="flex-1 text-sm">
        <p v-if="couldNotValidate" class="font-medium mb-1 text-[var(--text-muted)]">
          PDF/UA-1 machine checks (veraPDF): Could not validate
        </p>
        <p v-else class="font-medium mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>PDF/UA-1 machine checks (veraPDF): {{ verdict.passed ? "Pass" : "Fail" }}</span>
          <span
            v-if="showDontPanic"
            data-testid="pdfua-dont-panic"
            class="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-200"
            title="In large, friendly letters."
            >Don't Panic</span
          >
        </p>

        <!-- Reframed count: distinct rule types lead; occurrence sum demoted. -->
        <template v-if="showReframe">
          <p class="mb-1 text-sm">
            <span class="font-semibold text-[var(--text)]"
              >{{ fmt(distinctRuleCount) }} rule type{{ distinctRuleCount === 1 ? "" : "s" }} to
              fix</span
            ><span class="text-[var(--text-muted)] font-normal">
              · {{ fmt(totalOccurrences) }} total occurrence{{
                totalOccurrences === 1 ? "" : "s"
              }}</span
            >
          </p>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
            veraPDF counts every occurrence separately.
            <template v-if="distinctRuleCount === 1"
              >This rule type accounts for all {{ fmt(totalOccurrences) }}</template
            ><template v-else
              >These {{ fmt(distinctRuleCount) }} rule types account for all
              {{ fmt(totalOccurrences) }}</template
            ><template v-if="showPareto">
              — and the top 3 cause ~{{ fmt(paretoPct) }}% of them</template
            >.
          </p>
        </template>
        <p v-if="couldNotValidate" class="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
          {{ verdict.error }}
        </p>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Machine-checkable conditions only (ISO 14289-1 via
          <a
            v-if="verapdfUrl"
            :href="verapdfUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-300 hover:text-blue-200 underline"
            >veraPDF</a
          ><span v-else>veraPDF</span>). Full PDF/UA conformance also requires manual review —
          meaningful alt text, logical reading order, and correct table semantics can't be verified
          automatically.
        </p>

        <div v-if="!couldNotValidate && !verdict.passed && sortedFailures.length" class="mt-3">
          <button
            type="button"
            class="text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
            :aria-expanded="open"
            @click="open = !open"
          >
            {{ open ? "Hide" : "Show" }} {{ toggleScope }} rule type{{
              distinctRuleCount === 1 && !truncated ? "" : "s"
            }}
            (most frequent first)
            {{ open ? "↑" : "↓" }}
          </button>
          <ul v-if="open" class="mt-2 text-xs space-y-1.5 text-[var(--text-muted)]">
            <li v-for="f in sortedFailures" :key="f.ruleId + '|' + f.clause">
              <span class="font-mono text-[var(--text)]">{{ f.clause }}</span>
              <span
                v-if="
                  f.ruleId && f.ruleId !== f.clause && !String(f.ruleId).startsWith(f.clause + '-')
                "
              >
                · {{ f.ruleId }}</span
              >
              <span v-if="f.description"> — {{ f.description }}</span>
              <span class="text-amber-400 ml-1">({{ fmt(f.count) }})</span>
              <div class="mt-0.5 text-[var(--text-secondary)]">
                <span class="text-emerald-300/80">Fix:</span> {{ pdfUaFixHint(f) }}
              </div>
            </li>
          </ul>
        </div>

        <!-- Grade-aware reconciliation: why a machine-check Fail can sit beside a
             strong WCAG grade, and what to do about it. Only on a Fail. -->
        <div
          v-if="isFail"
          data-testid="pdfua-reconcile"
          class="mt-4 rounded-lg border px-3.5 py-3"
          :class="
            gradeIsGood
              ? 'border-emerald-400/30 bg-emerald-500/[0.07]'
              : gradeKnown
                ? 'border-amber-400/30 bg-amber-500/[0.07]'
                : 'border-[var(--border)] bg-[var(--surface)]'
          "
        >
          <p class="text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)]">
            <template v-if="gradeIsGood"
              ><strong class="text-[var(--text-heading)]">You're in good shape.</strong> Your WCAG
              grade is the measure that matters most for real-world use, and it's strong — a
              machine-check Fail here doesn't undo that. It just shows where there's room to
              improve.</template
            ><template v-else-if="gradeKnown"
              ><strong class="text-[var(--text-heading)]">Worth your attention.</strong> These
              machine checks add to gaps your WCAG grade already flags — both are worth
              addressing.</template
            ><template v-else
              ><strong class="text-[var(--text-heading)]"
                >Different tools ask different questions.</strong
              >
              Here's how this stricter check relates to the WCAG grade.</template
            >
          </p>
          <button
            type="button"
            data-testid="pdfua-why-toggle"
            class="mt-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            :aria-expanded="whyOpen"
            @click="whyOpen = !whyOpen"
          >
            Why the tools differ — and what's worth doing {{ whyOpen ? "↑" : "↓" }}
          </button>
          <ul
            v-if="whyOpen"
            class="mt-2 space-y-2 list-disc pl-4 text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)]"
          >
            <li>
              <strong class="text-[var(--text-heading)]">Your grade is the headline.</strong> WCAG
              2.2 AA measures whether real people using assistive tech can actually use this
              document — that's the measure that matters most for real-world use.
            </li>
            <li>
              <strong class="text-[var(--text-heading)]"
                >Accessibility is never quite "done," though.</strong
              >
              This panel runs PDF/UA-1 — a stricter, all-or-nothing machine check of the file's
              structure, where a single technicality flips it to Fail even on an excellent document.
              Because different tools ask different questions,
              <strong class="text-[var(--text-heading)]"
                >Adobe Acrobat, PAC, and veraPDF can each say something the grade doesn't</strong
              >
              — none is wrong, they're just pickier.
            </li>
            <li>
              <strong class="text-[var(--text-heading)]"
                >So it's a punch-list, not an alarm.</strong
              >
              Some items are cosmetic (e.g. font metadata); some are small real gaps (e.g. an
              untagged image). If you need formal PDF/UA-1 conformance — or just want to go further
              — the failed checkpoints above are your to-do list.
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

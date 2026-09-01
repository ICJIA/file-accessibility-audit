<!-- apps/web/app/components/WcagMachineChecks.vue -->
<script setup lang="ts">
// veraPDF's machine-testable WCAG 2.2 second opinion (v1.97.0) — the analog
// of PAC 2024's separate WCAG module. Deliberately its own component rather
// than more branches in PdfUaVerdict.vue: the framing differs (second
// opinion vs. formal-standard check), and the honesty rules differ — this
// panel must NEVER phrase a clean run as "Pass" or WCAG conformance, because
// the product's conformance verdict already owns that claim and most WCAG
// criteria need human judgment.
//
// Render contract (the census-generation discipline from v1.94.0):
//   prop absent/undefined — the report predates the feature, the deployment
//     has it off, or the result is non-PDF → render NOTHING. An absent key
//     must never become a false "Did not run".
//   available:false — the feature was on but the check could not run
//     (engine unconfigured, JVM queue saturated, vendored profile missing)
//     → explicit "Did not run" disclosure, the v1.91.0 rule.
//   error + zero counts — veraPDF errored → neutral "Could not validate".
//   otherwise — ran: either no machine-detected failures, or the rule list.
import { computed, ref } from "vue";
import type { PdfUaVerdict } from "@file-audit/shared";

const props = defineProps<{
  verdict?: PdfUaVerdict | null;
  verapdfUrl?: string;
}>();

const open = ref(false);

const couldNotValidate = computed(
  () => Boolean(props.verdict?.error) && props.verdict?.totalFailureCount === 0,
);
const didNotRun = computed(() => props.verdict?.available === false);

// The API truncates to 20 rules, but a FORGED shared-report payload bypasses
// that — bound the render too (the RB-2 rule from v1.94.0: every dimension a
// stored payload controls gets a client-side cap).
const RENDER_CAP = 20;
const sortedFailures = computed(() =>
  [...(props.verdict?.failures ?? [])]
    .slice(0, 1000)
    .sort((a, b) => b.count - a.count)
    .slice(0, RENDER_CAP),
);
const distinctRuleCount = computed(
  () => props.verdict?.distinctRuleCount ?? sortedFailures.value.length,
);
const totalOccurrences = computed(() => props.verdict?.totalFailureCount ?? 0);
const truncated = computed(() => distinctRuleCount.value > sortedFailures.value.length);

// The profile aggregates two rule sources: WCAG success criteria (clauses
// like "1.4.3") and the machine-testable structural rules they depend on
// (ISO 14289 clauses like "7.1"). Label SC-shaped clauses as WCAG so the
// contrast rule reads "WCAG 1.4.3", never a bare number a reader must guess
// at.
function clauseLabel(clause: string): string {
  // A WCAG success criterion's first segment is a PRINCIPLE, 1–4. ISO
  // 14289-1 clauses (5.x, 6.x, 7.x) also come in three segments — 7.18.5,
  // 7.21.7, 7.4.4 — and there is no "WCAG 7.18.5"; labelling them so put a
  // nonexistent criterion number in front of readers (found 2026-09-01).
  return /^[1-4]\.\d+\.\d+$/.test(clause) ? `WCAG ${clause}` : `Clause ${clause}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
</script>

<template>
  <section
    v-if="verdict"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    data-testid="wcag-machine-checks"
  >
    <!-- Did not run (feature on, check impossible) -->
    <div v-if="didNotRun" class="flex items-start gap-3" data-testid="wcag-did-not-run">
      <span
        class="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border border-[var(--border)] text-[var(--text-muted)]"
        aria-hidden="true"
        >–</span
      >
      <div class="flex-1 text-sm">
        <p class="font-medium mb-1 text-[var(--text-muted)]">
          WCAG machine checks (veraPDF second opinion): Did not run
        </p>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          The separate
          <a
            v-if="verapdfUrl"
            :href="verapdfUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-300 hover:text-blue-200 underline"
            >veraPDF</a
          ><span v-else>veraPDF</span>
          pass over the machine-testable WCAG 2.2 rules did not run for this audit — the engine may
          have been momentarily at capacity. Not run means not checked, never passed; your score and
          categories are computed independently and are unaffected.
        </p>
      </div>
    </div>

    <div v-else class="flex items-start gap-3">
      <span
        class="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
        :class="
          couldNotValidate
            ? 'border border-[var(--border)] text-[var(--text-muted)]'
            : verdict.passed
              ? 'bg-emerald-700/40 text-emerald-200'
              : 'bg-sky-700/40 text-sky-200'
        "
        aria-hidden="true"
        >{{ couldNotValidate ? "?" : verdict.passed ? "✓" : "+" }}</span
      >
      <div class="flex-1 text-sm">
        <p v-if="couldNotValidate" class="font-medium mb-1 text-[var(--text-muted)]">
          WCAG machine checks (veraPDF second opinion): Could not validate
        </p>
        <p v-else-if="verdict.passed" class="font-medium mb-1" data-testid="wcag-clean">
          WCAG machine checks (veraPDF second opinion): No machine-detected failures
        </p>
        <p v-else class="font-medium mb-1" data-testid="wcag-flagged">
          WCAG machine checks (veraPDF second opinion):
          {{ fmt(distinctRuleCount) }} rule type{{ distinctRuleCount === 1 ? "" : "s" }} flagged
          <span class="text-[var(--text-muted)] font-normal">
            · {{ fmt(totalOccurrences) }} occurrence{{ totalOccurrences === 1 ? "" : "s" }}</span
          >
        </p>

        <p v-if="couldNotValidate" class="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
          {{ verdict.error }}
        </p>

        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          An independent second opinion: the same
          <a
            v-if="verapdfUrl"
            :href="verapdfUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-300 hover:text-blue-200 underline"
            >veraPDF</a
          ><span v-else>veraPDF</span>
          engine, run against its machine-testable WCAG 2.2 profile — the subset a dedicated checker
          like PAC verifies by machine. It can flag things this report's score does not compute (its
          rules include text contrast, which for PDFs is otherwise not assessed here), and it
          changes nothing about your score or grade.
          <template v-if="verdict.passed"
            >No machine-detected failures is <strong>not</strong> WCAG conformance — most WCAG
            criteria still require human judgment, listed under "Still worth checking by
            hand."</template
          >
        </p>

        <div v-if="!couldNotValidate && !verdict.passed && sortedFailures.length" class="mt-3">
          <button
            type="button"
            class="text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
            :aria-expanded="open"
            @click="open = !open"
          >
            {{ open ? "Hide" : "Show" }}
            {{
              truncated
                ? `the top ${fmt(sortedFailures.length)} of ${fmt(distinctRuleCount)}`
                : `the ${fmt(distinctRuleCount)}`
            }}
            rule type{{ distinctRuleCount === 1 && !truncated ? "" : "s" }} (most frequent first)
            {{ open ? "↑" : "↓" }}
          </button>
          <ul v-if="open" class="mt-2 text-xs space-y-1.5 text-[var(--text-muted)]">
            <li v-for="f in sortedFailures" :key="f.ruleId + '|' + f.clause">
              <span class="font-mono text-[var(--text)]">{{ clauseLabel(f.clause) }}</span>
              <span v-if="f.description"> — {{ f.description }}</span>
              <span class="text-amber-400 ml-1">({{ fmt(f.count) }})</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

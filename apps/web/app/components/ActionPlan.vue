<template>
  <section
    id="action-plan"
    class="action-plan rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6"
    aria-labelledby="action-plan-title"
  >
    <h2 id="action-plan-title" class="text-base sm:text-lg font-bold text-[var(--text-heading)]">
      Your action plan
    </h2>

    <template v-if="steps.length">
      <p class="text-xs text-[var(--text-muted)] mt-0.5 mb-5">{{ subtitle }}</p>

      <ol class="relative pl-14 sm:pl-16 space-y-3 list-none m-0 p-0" role="list">
        <!-- the rail -->
        <span
          class="absolute left-[19px] sm:left-[23px] top-2 bottom-2 w-0.5 bg-[var(--border)]"
          aria-hidden="true"
        />
        <li v-for="step in steps" :key="step.categoryId" class="relative">
          <span
            class="absolute -left-14 sm:-left-16 top-0.5 w-10 h-10 sm:w-12 sm:h-12 rounded-full text-lg sm:text-xl font-extrabold inline-flex items-center justify-center"
            :style="numStyle(step.severity)"
            aria-hidden="true"
            >{{ step.rank }}</span
          >
          <div
            class="rounded-lg border bg-[var(--surface-deep)]"
            :class="
              step.severity === 'Critical' ? 'border-red-500/35' : 'border-[var(--border-subtle)]'
            "
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 text-left px-3 py-2.5 cursor-pointer"
              :aria-expanded="openId === step.categoryId"
              :aria-controls="`plan-step-${step.categoryId}`"
              @click="toggle(step.categoryId)"
            >
              <span class="sr-only">Step {{ step.rank }} of {{ steps.length }}: </span>
              <span class="flex-1 text-sm font-semibold text-[var(--text-heading)]">{{
                step.title
              }}</span>
              <!-- The chip is EARNED, not stamped (v1.135.0). v1.132's
                   unconditional REQUIRED chip was wrong for the class of
                   scored-technique steps: the SFY25 report said "3 criteria
                   failing" above five REQUIRED chips, and the bookmarks
                   step's own finding text ("no WCAG criterion strictly
                   requires bookmarks") contradicted its chip one inch below.
                   REQUIRED = this step's category produced a failing
                   criterion in the conformance verdict. RECOMMENDED = scored
                   for readiness (bookmarks on a long PDF, a reading-order
                   signal) — it raises the score and helps real readers, but
                   is not a WCAG 2.1 criterion failure, and the plan's
                   subtitle reconciles the arithmetic. No conformance verdict
                   (old stored reports) → no chip: never assert what cannot
                   be verified. -->
              <!-- Fixed-width slot so every row's chip starts at the same x —
                   the chips, severity pills, and Show-how links each form a
                   clean vertical column (user request 2026-08-29). -->
              <span v-if="conformance" class="hidden sm:flex w-[168px] justify-end flex-shrink-0">
                <span
                  v-if="isRequiredStep(step)"
                  data-testid="step-law-chip"
                  class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border border-[var(--status-error-red)]/40 text-[var(--status-error-red)]"
                  >REQUIRED BY WCAG 2.1</span
                >
                <span
                  v-else
                  data-testid="step-reco-chip"
                  class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border border-[var(--status-warning-yellow)]/40 text-[var(--status-warning-yellow)]"
                  >RECOMMENDED</span
                >
              </span>
              <span class="flex w-[92px] justify-end flex-shrink-0">
                <span
                  class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  :style="sevChipStyle(step.severity)"
                  ><span aria-hidden="true">{{ sevIcon(step.severity) }}</span>
                  {{ step.severity }}</span
                >
              </span>
              <span
                class="text-xs text-[var(--link)] whitespace-nowrap w-[72px] text-right flex-shrink-0"
                data-export-exclude
                >{{ openId === step.categoryId ? "Hide" : "Show how" }}</span
              >
            </button>

            <div
              v-show="openId === step.categoryId"
              :id="`plan-step-${step.categoryId}`"
              class="plan-step-body px-3 pb-3"
            >
              <p class="text-xs text-[var(--text-muted)] mb-2">{{ step.why }}</p>

              <!-- "Says who?" — answered by someone else. When veraPDF (the
                   PDF Association's own validator, which this project did not
                   write) failed the same defect on THIS document, its verdict
                   is quoted verbatim: its words, its clause, its count. Absent
                   entirely when veraPDF did not run or did not flag this — a
                   silence that is never dressed up as agreement. -->
              <div
                v-if="veraByCategory[step.categoryId]?.length"
                data-testid="pdfua-cosign"
                class="mb-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <p class="text-xs font-semibold text-[var(--text-heading)]">
                  <span aria-hidden="true">⚖️</span> Independently confirmed &mdash; this is
                  veraPDF&rsquo;s finding, not ours
                </p>
                <p class="text-xs text-[var(--text-muted)] mt-1">
                  veraPDF is the PDF industry&rsquo;s own validator, built by the PDF Association
                  and not by us. Run against this document, it failed the same point:
                </p>
                <ul class="mt-1.5 space-y-1">
                  <li
                    v-for="f in veraByCategory[step.categoryId]"
                    :key="f.ruleId + '|' + f.clause"
                    class="text-xs text-[var(--text-muted)]"
                  >
                    <span class="italic">&ldquo;{{ f.description }}&rdquo;</span>
                    <span class="whitespace-nowrap">
                      &mdash; ISO 14289-1, clause
                      <span class="font-mono text-[var(--text)]">{{ f.clause }}</span>
                      <template v-if="f.count"
                        >, {{ f.count }} failed check<template v-if="f.count !== 1"
                          >s</template
                        ></template
                      >
                    </span>
                  </li>
                </ul>
              </div>

              <div
                class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2.5 space-y-2.5"
              >
                <div v-for="route in step.routes" :key="route.tool" class="flex gap-2 text-sm">
                  <span aria-hidden="true" class="flex-shrink-0">{{
                    route.tool === "source" ? "📝" : "🔧"
                  }}</span>
                  <div class="text-[var(--text-secondary)] min-w-0">
                    <span
                      class="font-semibold"
                      :class="route.tool === 'source' ? 'text-green-500' : 'text-amber-500'"
                      >{{ route.label }}:</span
                    >
                    <ol
                      v-if="route.steps.length > 1"
                      class="list-decimal ml-5 mt-1 space-y-1 text-[13px]"
                    >
                      <li v-for="(s, i) in route.steps" :key="i">{{ s }}</li>
                    </ol>
                    <span v-else> {{ route.steps[0] }}</span>
                  </div>
                </div>
              </div>

              <p class="text-[11px] leading-relaxed text-[var(--text-muted)] mt-2 mb-0" role="note">
                {{ FIX_STEPS_VERSION_NOTE }}
              </p>

              <div class="mt-2 flex items-center gap-2 flex-wrap">
                <!-- LINKED (standing rule, 2026-08-31: naming a criterion
                     means linking it). This chip is on the checklist a public
                     body actually works from, and it named the rule the
                     deduction rests on with no way to go and read it — while
                     the PRINTABLE version of the same data has linked it all
                     along (printablePlan.ts renderStep). Falls back to a plain
                     chip if a criterion has no known slug, rather than
                     rendering a dead link. -->
                <component
                  :is="criterionHref(wcagRef.sc) ? 'a' : 'span'"
                  v-for="wcagRef in step.wcagRefs"
                  :key="wcagRef.sc"
                  :href="criterionHref(wcagRef.sc) || undefined"
                  :target="criterionHref(wcagRef.sc) ? '_blank' : undefined"
                  :rel="criterionHref(wcagRef.sc) ? 'noopener noreferrer' : undefined"
                  class="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5"
                  :class="criterionHref(wcagRef.sc) ? 'underline hover:text-indigo-300' : ''"
                  :title="wcagRef.name"
                  >WCAG {{ wcagRef.sc }}</component
                >
                <button
                  type="button"
                  data-testid="evidence-link"
                  class="text-xs text-[var(--link)] hover:text-[var(--link-hover)] underline cursor-pointer"
                  data-export-exclude
                  @click="$emit('show-evidence', step.categoryId)"
                >
                  Evidence &amp; technical detail ↓
                </button>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </template>

    <div
      v-else
      data-testid="plan-pass-card"
      class="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 mt-2"
    >
      <p class="text-sm font-semibold text-green-500">
        <span aria-hidden="true">✓</span> Nothing to fix — this document passes all automated
        checks.
      </p>
      <!-- Was a list of bare SC numbers, which told an author nothing they
           could act on. The manual-review card directly below now names each
           criterion and links it, so this only has to hand off to it. -->
      <p v-if="conformance?.notAssessed?.length" class="text-xs text-[var(--text-muted)] mt-1.5">
        Passing every automated check is not the same as being accessible — see
        <strong class="text-[var(--text-secondary)]">Still worth checking by hand</strong> below for
        what a person still needs to confirm.
      </p>
    </div>

    <!-- Below this line is everything the plan does not require: best
         practices checked against this document's own evidence, then (when
         veraPDF has something to say) its independent verdict, verbatim.
         Kept out of the numbered steps on purpose: a number in this plan
         means a WCAG 2.1 obligation. The seam used to live inside the
         beyond group alone; now it introduces both non-required tiers
         (2026-08-30). Gated on hasBestPractices, not the looser `result`
         (fix round 1, 2026-08-30) — `result` is truthy for any report
         object, including one with categories but a missing/unrecognized
         fileType, which BestPracticesSection would silently render nothing
         for; the seam must not draw a rule over empty space. -->
    <div
      v-if="hasBestPractices || showBeyondGroup"
      class="flex items-center gap-3 mt-8 mb-4"
      aria-hidden="true"
    >
      <div class="h-px flex-1 bg-[var(--border)]"></div>
      <span class="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]"
        >Everything WCAG 2.1 requires is above &uarr;</span
      >
      <div class="h-px flex-1 bg-[var(--border)]"></div>
    </div>

    <BestPracticesSection v-if="result" :result="result" :analyzed-at="analyzedAt" class="mt-8" />

    <!-- ABOVE AND BEYOND, NARROWED (2026-08-30) — this card now carries only
         veraPDF's verdict, the one thing the Best Practices section above
         does not and should not reproduce: an independent validator's own
         words on this document. Our own unscored findings moved into that
         section, where each one gets a description, this document's own
         evidence, and a fix. -->
    <div v-if="showBeyondGroup" data-testid="plan-beyond-group" class="mt-8">
      <div class="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 px-5 sm:px-6 py-5">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span aria-hidden="true" class="text-2xl leading-none text-sky-400">○</span>
          <!-- h2, not h3 (fix round 1, 2026-08-30): the plan, Best Practices,
               and this card are three peer tiers, not a subsection of Best
               Practices — a flat heading outline is how a screen-reader user
               navigates, and nesting this under Best Practices' own h2 misled
               that navigation even though no level was skipped. -->
          <h2 class="text-lg sm:text-xl font-bold text-[var(--text-heading)] m-0">
            Above and beyond — veraPDF's verdict
          </h2>
        </div>
        <p class="text-sm text-[var(--text-muted)] mt-2.5 leading-relaxed">
          veraPDF is an independent PDF/UA validator, built by the PDF Association and not by us.
          What follows is its verdict on this document, in its own words: every rule it failed, the
          ISO 14289 clause behind it, and how many times it occurs — or, if it could not finish,
          that it says so.
          <strong class="font-semibold text-[var(--text-secondary)]"
            >None of it affected your grade.</strong
          >
        </p>

        <!-- The numbers at a glance, infographic-style: what is optional here,
             and the referee's own totals. This card only renders at all when
             showBeyondGroup is true, which requires `error || passed ===
             false` — so a "veraPDF: ✓ clean" chip for `passed === true` can
             never be reached (fix round 1, 2026-08-30: was reachable on main via beyondItems, unreachable once showBeyondGroup narrowed to veraPDF alone —
             deleted). Do not re-add it without widening showBeyondGroup
             first, or it stays unreachable. -->
        <div class="mt-3.5 flex flex-wrap gap-2" data-testid="beyond-stat-chips">
          <span
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[var(--text-secondary)]"
          >
            <span class="text-sky-400 font-bold">0</span> of these count toward your score
          </span>
          <span
            v-if="pdfUaVerdict?.available && pdfUaVerdict.passed === false"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[var(--text-secondary)]"
          >
            veraPDF:
            <span class="text-sky-400 font-bold">{{
              (pdfUaVerdict.totalFailureCount ?? 0).toLocaleString()
            }}</span>
            occurrences ·
            <span class="text-sky-400 font-bold">{{
              pdfUaVerdict.distinctRuleCount ?? veraFailures.length
            }}</span>
            rules
          </span>
        </div>

        <!-- veraPDF's verdict, verbatim and in full. The referee's words, not
           our judgment — same doctrine as the per-step co-sign. -->
        <div
          v-if="pdfUaVerdict?.available"
          data-testid="plan-vera-detail"
          class="mt-4 border-t border-sky-500/20 pt-3"
        >
          <p class="text-xs font-semibold text-[var(--text-secondary)] m-0">
            What veraPDF found
            <span class="font-normal text-[var(--text-muted)]"
              >— the PDF Association's own PDF/UA validator, run on this document</span
            >
          </p>
          <!-- No "passed === true" branch here (fix round 1, 2026-08-30: was
               dead code, deleted) — this whole card only renders when
               showBeyondGroup is true, which requires `error || passed ===
               false`, so by the time we reach this template, a non-error
               path is always a failing one. -->
          <p v-if="pdfUaVerdict.error" class="text-xs text-[var(--status-warning-orange)] mt-1.5">
            veraPDF could not complete its check: {{ pdfUaVerdict.error }}
          </p>
          <template v-else>
            <p class="text-xs text-[var(--text-muted)] mt-1">
              {{ (pdfUaVerdict.totalFailureCount ?? 0).toLocaleString() }} occurrence{{
                (pdfUaVerdict.totalFailureCount ?? 0) === 1 ? "" : "s"
              }}
              across {{ pdfUaVerdict.distinctRuleCount ?? veraFailures.length }} failing rule{{
                (pdfUaVerdict.distinctRuleCount ?? veraFailures.length) === 1 ? "" : "s"
              }}<template v-if="pdfUaVerdict.profile"> of {{ pdfUaVerdict.profile }}</template
              >.
            </p>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(row, i) in veraRows" :key="`vera-${i}`" class="text-xs">
                <!-- A rule we can advise on gets a collapsed per-rule expander
                   with BOTH routes — fix it in the source file, or fix it in
                   the exported PDF (user request 2026-08-29: "a place to
                   start — either with the source file or with the PDF
                   export"). A rule pdfUaFixRoutes cannot map renders as a
                   plain row: wrong advice under the referee's words would be
                   worse than none. -->
                <details v-if="row.routes" :data-testid="`vera-fix-${i}`" class="group/vera">
                  <summary
                    class="flex gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                  >
                    <span class="flex-shrink-0 font-mono text-sky-400">{{
                      row.f.clause || row.f.ruleId || "—"
                    }}</span>
                    <span class="text-[var(--text-muted)] min-w-0">
                      {{ row.f.description || "(no description provided)" }}
                      <span class="text-[var(--text-secondary)] whitespace-nowrap"
                        >× {{ row.f.count ?? 1 }}</span
                      >
                      <span class="text-[var(--link)] whitespace-nowrap">
                        · How to fix
                        <span
                          aria-hidden="true"
                          class="inline-block transition-transform group-open/vera:rotate-90"
                          >▸</span
                        >
                      </span>
                    </span>
                  </summary>
                  <div class="mt-1.5 mb-1 ml-5 pl-3 border-l border-sky-500/25 space-y-1.5">
                    <p class="m-0">
                      <span class="font-semibold text-[var(--text-secondary)]"
                        >In the source file (Word, InDesign):</span
                      >
                      <span class="text-[var(--text-muted)]"> {{ row.routes.source }}</span>
                    </p>
                    <p class="m-0">
                      <span class="font-semibold text-[var(--text-secondary)]"
                        >In the exported PDF (Acrobat):</span
                      >
                      <span class="text-[var(--text-muted)]"> {{ row.routes.pdf }}</span>
                    </p>
                  </div>
                </details>
                <div v-else class="flex gap-2">
                  <span class="flex-shrink-0 font-mono text-sky-400">{{
                    row.f.clause || row.f.ruleId || "—"
                  }}</span>
                  <span class="text-[var(--text-muted)] min-w-0">
                    {{ row.f.description || "(no description provided)" }}
                    <span class="text-[var(--text-secondary)] whitespace-nowrap"
                      >× {{ row.f.count ?? 1 }}</span
                    >
                  </span>
                </div>
              </li>
            </ul>
            <p
              v-if="(pdfUaVerdict.distinctRuleCount ?? 0) > veraFailures.length"
              class="text-xs text-[var(--text-muted)] mt-1.5"
            >
              Showing the first {{ veraFailures.length }} rules — the complete list is in the full
              technical report's PDF/UA panel.
            </p>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { withAlpha, wcagSlugFor } from "@file-audit/shared";
import { useTokenColors } from "~/composables/useTokenColors";
import { computed, ref, watch } from "vue";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { severityColor } = useTokenColors();
import type { PlanStep, PlanSeverity } from "~/utils/actionPlan";
import { pdfUaFailuresByCategory, type PdfUaFailureLike } from "./pdfUaCategory";
import { pdfUaFixRoutes } from "./pdfUaFixHint";
import { FIX_STEPS_VERSION_NOTE } from "~/utils/fixStepVersions";
import BestPracticesSection from "~/components/BestPracticesSection.vue";
import { evaluateBestPractices } from "~/utils/bestPractices";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  steps: PlanStep[];
  conformance?: ConformanceVerdict | null;
  /** The document's OWN veraPDF verdict. When it independently flagged the
   *  same defect, the step says so in veraPDF's words — see pdfUaCategory.ts. */
  pdfUaVerdict?: {
    available?: boolean;
    passed?: boolean;
    profile?: string;
    totalFailureCount?: number;
    distinctRuleCount?: number;
    error?: string;
    failures?: PdfUaFailureLike[];
  } | null;
  /** Scored categories. No longer read directly by this component — the
   *  reported-but-unscored items it used to collect for the beyond group
   *  now come from `result` via BestPracticesSection (2026-08-30). Kept as
   *  a prop for callers that still pass it. */
  categories?: Array<{ label?: string; findings?: string[] }> | null;
  /** The whole report, passed straight through to BestPracticesSection,
   *  which does its own narrowing — /report/[id] renders attacker-controlled
   *  stored JSON — and self-hides when it has nothing to show. */
  result?: unknown;
  /** Forwarded to BestPracticesSection and its era gate. */
  analyzedAt?: string | null;
}>();

/** Whether BestPracticesSection will actually render a row below — the same
 *  test it uses internally, called here too so the seam (which introduces
 *  it) can know before it does (fix round 1, 2026-08-30). `result` alone is
 *  not enough: it is truthy for any report object, including one with
 *  categories but a missing/unrecognized fileType, for which
 *  evaluateBestPractices returns nothing and the section renders nothing. */
// Version-aware Understanding-page base (WCAG 2.1 by default).
const wcag = useWcag();

/** Understanding-page URL for a criterion number, or null when the slug is
 *  unknown — the chip then renders as plain text rather than a dead link.
 *  Same source of truth the printable plan uses (wcagSlugFor). */
function criterionHref(sc: string): string | null {
  const slug = wcagSlugFor(sc);
  return slug ? wcag.understandingUrl(slug) : null;
}

const hasBestPractices = computed(
  () => evaluateBestPractices(props.result, undefined, { analyzedAt: props.analyzedAt }).length > 0,
);

/** Every failing veraPDF rule, largest count first — the referee's full list,
 *  not our summary of it. */
const veraFailures = computed(() => {
  const v = props.pdfUaVerdict;
  if (!v?.available) return [];
  return [...(v.failures ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
});

/** Each failing rule paired with its two-route fix advice (null = no
 *  advice, rendered plain). */
const veraRows = computed(() => veraFailures.value.map((f) => ({ f, routes: pdfUaFixRoutes(f) })));

/** The beyond group is now purely veraPDF's verdict — the referee's own
 *  words. Our unscored findings moved to BestPracticesSection (2026-08-30),
 *  where each gets a description, this document's evidence, and links. */
const showBeyondGroup = computed(() => {
  const v = props.pdfUaVerdict;
  return Boolean(v?.available && (v.error || v.passed === false));
});

// Grouped once per verdict, not per step render.
const veraByCategory = computed(() => pdfUaFailuresByCategory(props.pdfUaVerdict));

defineEmits<{ (e: "show-evidence", categoryId: string): void }>();

// Step 1 open by default — the one thing to do next is zero clicks away.
// Steps are NOT guaranteed to keep their identity for the life of this
// component: on index.vue, switching the active batch tab swaps `result`
// (and therefore `steps`) without remounting ActionPlan, so seeding openId
// only at setup would leave a stale/arbitrary step open after the switch.
// The watch below re-seeds it to the new first step whenever the array
// itself changes. Exclusive-open accordion: only one step can be open at a
// time; clicking the open step closes it.
const openId = ref<string | null>(props.steps.length ? props.steps[0]!.categoryId : null);

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
}

watch(
  () => props.steps,
  (s) => {
    openId.value = s.length ? s[0]!.categoryId : null;
  },
);

/** Categories that produced an actual failing WCAG 2.1 criterion. A step is
 *  REQUIRED only when its category is here — matching on the conformance
 *  finding's own `category` field, not on shared SC numbers, so two
 *  categories that cite the same criterion (1.3.1 spans tables, headings,
 *  and forms) can never borrow each other's failures. */
const failingCategories = computed(
  () => new Set((props.conformance?.failures ?? []).map((f) => f.category)),
);
function isRequiredStep(s: { categoryId: string }): boolean {
  return failingCategories.value.has(s.categoryId);
}
const requiredCount = computed(() => props.steps.filter((s) => isRequiredStep(s)).length);

const subtitle = computed(() => {
  const n = props.steps.length;
  const c = props.steps.filter((s) => s.severity === "Critical").length;
  const base = `${n} ${n === 1 ? "fix" : "fixes"}, in order.`;
  const start =
    c === 0
      ? `${base} Re-upload the fixed file to verify.`
      : `${base} ${c === 1 ? "№ 1 blocks" : `№ 1–${c} block`} publication — start there, then re-upload to verify.`;
  // Reconcile the arithmetic a reader will do anyway: the verdict strip says
  // "N criteria failing", and the plan may hold MORE steps than that,
  // because some scored fixes are recommendations rather than criterion
  // failures. Say so, or the two numbers read as a contradiction.
  if (!props.conformance || n === 0) return start;
  const req = requiredCount.value;
  const rec = n - req;
  // One fix can clear MORE than one failing criterion (the title-and-language
  // step clears 2.4.2 and 3.1.1 at once), so the criteria count above the
  // plan can exceed the step count. Say so, or "6 criteria failing" over
  // "5 fixes" reads as a lost fix.
  const failures = props.conformance.failures ?? [];
  const critCount = failures.length;
  const multiSteps = props.steps.filter(
    (st) => failures.filter((f) => f.category === st.categoryId).length > 1,
  );
  const criteriaBridge =
    req > 0 && critCount > req
      ? ` Together they clear all ${critCount} failing WCAG 2.1 criteria — ${
          multiSteps.length === 1
            ? `fix № ${multiSteps[0]!.rank} clears more than one`
            : "some fixes clear more than one"
        }.`
      : "";
  if (rec === 0) return `${start}${criteriaBridge}`;
  if (req === 0) {
    return `${start} No WCAG 2.1 criterion is failing — ${n === 1 ? "this fix is" : "these fixes are"} recommended: ${n === 1 ? "it raises" : "they raise"} your score and ${n === 1 ? "helps" : "help"} real readers.`;
  }
  return `${start} ${req} of the ${n} clear WCAG 2.1 criterion failures; the other ${rec} ${rec === 1 ? "is" : "are"} recommended — ${rec === 1 ? "it raises" : "they raise"} your score and ${rec === 1 ? "helps" : "help"} real readers, but ${rec === 1 ? "is not a WCAG 2.1 failure" : "are not WCAG 2.1 failures"}.${criteriaBridge}`;
});

function sevIcon(s: PlanSeverity): string {
  return s === "Critical" ? "⛔" : s === "Moderate" ? "⚠" : "ⓘ";
}

function sevChipStyle(s: PlanSeverity): Record<string, string> {
  const c = severityColor(s);
  return { color: c, backgroundColor: withAlpha(c, 8), border: `1px solid ${c}35` };
}

function numStyle(s: PlanSeverity): Record<string, string> {
  const c = severityColor(s);
  // Big solid infographic badges. At this size the number is WCAG "large
  // text" (3:1): white passes on red 3.76:1 and blue 3.68:1 in BOTH color
  // modes; yellow needs a dark number (#111 ≈ 8:1). These two literals are
  // fixed on-badge text colors (mode-independent), same exemption class as
  // the token rule's own white — chosen purely for contrast.
  return { backgroundColor: c, color: s === "Moderate" ? "#111" : "#fff" };
}
</script>

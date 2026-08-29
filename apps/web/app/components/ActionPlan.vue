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
              <!-- Every numbered step is a legal requirement: a PDF/UA-only
                   item carries no severity, so it never becomes a step (see
                   the "above and beyond" group below). Saying so on each step
                   is what a compliance reviewer is scanning for. -->
              <span
                data-testid="step-law-chip"
                class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border border-[var(--status-error-red)]/40 text-[var(--status-error-red)] hidden sm:inline"
                >REQUIRED BY LAW</span
              >
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                :style="sevChipStyle(step.severity)"
                ><span aria-hidden="true">{{ sevIcon(step.severity) }}</span>
                {{ step.severity }}</span
              >
              <span class="text-xs text-[var(--link)] whitespace-nowrap" data-export-exclude>{{
                openId === step.categoryId ? "Hide" : "Show how"
              }}</span>
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
                <span
                  v-for="wcagRef in step.wcagRefs"
                  :key="wcagRef.sc"
                  class="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5"
                  :title="wcagRef.name"
                  >WCAG {{ wcagRef.sc }}</span
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

    <!-- ABOVE AND BEYOND — what the report found that the law does not
         require. Kept out of the numbered steps on purpose. -->
    <div
      v-if="beyondItems.length"
      data-testid="plan-beyond-group"
      class="mt-5 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-deep)] px-4 py-3"
    >
      <p class="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Above and beyond — not required by law
      </p>
      <p class="text-xs text-[var(--text-muted)] mt-1">
        None of these affected your grade. They are worth doing if you are aiming at PDF/UA
        conformance as well as WCAG, ADA Title II and IITAA.
      </p>
      <ul class="mt-2 space-y-2">
        <li v-for="(item, i) in beyondItems" :key="`beyond-${i}`" class="text-xs flex gap-2">
          <span aria-hidden="true" class="flex-shrink-0 mt-0.5 text-[var(--text-muted)]">○</span>
          <span class="text-[var(--text-muted)]">
            <span v-if="item.label" class="font-semibold text-[var(--text-secondary)]"
              >{{ item.label }}: </span
            >{{ item.text }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { withAlpha } from "@file-audit/shared";
import { useTokenColors } from "~/composables/useTokenColors";
import { computed, ref, watch } from "vue";
// Theme-aware: the dark palette fails AA on the light theme. See useTokenColors.
const { severityColor } = useTokenColors();
import type { PlanStep, PlanSeverity } from "~/utils/actionPlan";
import { pdfUaFailuresByCategory, type PdfUaFailureLike } from "./pdfUaCategory";
import { isNotScoredFinding } from "~/utils/findings";
import { FIX_STEPS_VERSION_NOTE } from "~/utils/fixStepVersions";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  steps: PlanStep[];
  conformance?: ConformanceVerdict | null;
  /** The document's OWN veraPDF verdict. When it independently flagged the
   *  same defect, the step says so in veraPDF's words — see pdfUaCategory.ts. */
  pdfUaVerdict?: { available?: boolean; failures?: PdfUaFailureLike[] } | null;
  /** Scored categories, read ONLY to collect the reported-but-unscored items
   *  for the "above and beyond" group. The plan itself is built from steps. */
  categories?: Array<{ label?: string; findings?: string[] }> | null;
}>();

/** PDF/UA work the report shows but never scored. Deliberately NOT numbered
 *  steps: a number in this plan means a legal obligation, and mixing optional
 *  work into that list is exactly the conflation this release removed. Listed
 *  after the steps so an author aiming at full PDF/UA conformance still has
 *  everything in one place. */
const beyondItems = computed(() =>
  (props.categories ?? []).flatMap((c) =>
    (c.findings ?? [])
      .filter((f) => typeof f === "string" && isNotScoredFinding(f))
      .map((f) => ({ label: c.label ?? "", text: f })),
  ),
);

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

const subtitle = computed(() => {
  const n = props.steps.length;
  const c = props.steps.filter((s) => s.severity === "Critical").length;
  const base = `${n} ${n === 1 ? "fix" : "fixes"}, in order.`;
  if (c === 0) return `${base} Re-upload the fixed file to verify.`;
  const which = c === 1 ? "№ 1 blocks" : `№ 1–${c} block`;
  return `${base} ${which} publication — start there, then re-upload to verify.`;
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

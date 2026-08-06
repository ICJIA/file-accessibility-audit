<template>
  <section
    class="action-plan rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6"
    aria-labelledby="action-plan-title"
  >
    <h2 id="action-plan-title" class="text-base sm:text-lg font-bold text-[var(--text-heading)]">
      Your action plan
    </h2>

    <template v-if="steps.length">
      <p class="text-xs text-[var(--text-muted)] mt-0.5 mb-5">{{ subtitle }}</p>

      <ol class="relative pl-14 sm:pl-16 space-y-3 list-none m-0 p-0">
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
              <span class="flex-1 text-sm font-semibold text-[var(--text-heading)]">{{
                step.title
              }}</span>
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
      <p v-if="conformance?.notAssessed?.length" class="text-xs text-[var(--text-muted)] mt-1.5">
        Some WCAG criteria can't be checked automatically ({{
          conformance.notAssessed.map((n) => n.sc).join(", ")
        }}) — a quick manual review is still recommended.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { severityColor } from "@file-audit/shared";
import type { PlanStep, PlanSeverity } from "~/utils/actionPlan";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  steps: PlanStep[];
  conformance?: ConformanceVerdict | null;
}>();

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
  return { color: c, backgroundColor: c + "15", border: `1px solid ${c}35` };
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

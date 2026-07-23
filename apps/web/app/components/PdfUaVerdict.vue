<!-- apps/web/app/components/PdfUaVerdict.vue -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { PdfUaVerdict } from "@file-audit/shared";
import { pdfUaFixHint } from "./pdfUaFixHint";

const props = defineProps<{ verdict: PdfUaVerdict; verapdfUrl?: string }>();
// Default collapsed: the failed-checkpoint list is non-empty on ~95% of
// documents, so it must not dump a long list unprompted. Expandable via the
// toggle button below.
const open = ref(false);

// veraPDF errored rather than producing a real verdict (timeout, no stdout,
// unparseable output — see runVeraPdfOnBuffer's catch branch in
// apps/api/src/services/veraPdfBuffer.ts, which sets `error` and leaves
// totalFailureCount at 0). Must render as a neutral "could not validate"
// state, never as the definitive Fail veraPDF never actually returned.
const couldNotValidate = computed(
  () => Boolean(props.verdict?.error) && props.verdict?.totalFailureCount === 0,
);
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
        <p v-else class="font-medium mb-1">
          PDF/UA-1 machine checks (veraPDF): {{ verdict.passed ? "Pass" : "Fail" }}
          <span v-if="!verdict.passed" class="text-[var(--text-muted)] font-normal">
            — {{ verdict.totalFailureCount }} rule failure{{
              verdict.totalFailureCount === 1 ? "" : "s"
            }}
          </span>
        </p>
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

        <div v-if="!couldNotValidate && !verdict.passed && verdict.failures?.length" class="mt-3">
          <button
            type="button"
            class="text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
            :aria-expanded="open"
            @click="open = !open"
          >
            {{ open ? "Hide" : "Show" }} failed checkpoints ({{ verdict.failures.length }})
            {{ open ? "↑" : "↓" }}
          </button>
          <ul v-if="open" class="mt-2 text-xs space-y-1.5 text-[var(--text-muted)]">
            <li v-for="f in verdict.failures" :key="f.ruleId + '|' + f.clause">
              <span class="font-mono text-[var(--text)]">{{ f.clause }}</span>
              <span
                v-if="f.ruleId && f.ruleId !== f.clause && !String(f.ruleId).startsWith(f.clause + '-')"
              >
                · {{ f.ruleId }}</span
              >
              <span v-if="f.description"> — {{ f.description }}</span>
              <span class="text-amber-400 ml-1">({{ f.count }})</span>
              <div class="mt-0.5 text-[var(--text-secondary)]">
                <span class="text-emerald-300/80">Fix:</span> {{ pdfUaFixHint(f) }}
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

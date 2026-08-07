<template>
  <section
    v-if="checks.length || criteria.length"
    data-testid="manual-review"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    aria-labelledby="manual-review-h"
  >
    <h2 id="manual-review-h" class="text-lg font-bold text-[var(--text-heading)]">
      Still worth checking by hand
    </h2>
    <p class="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-3xl">
      {{ intro }}
    </p>

    <!-- Passed checks, and the judgment each one could not make. -->
    <ol v-if="checks.length" class="mt-5 space-y-3">
      <li
        v-for="(c, i) in checks"
        :key="c.id"
        class="rounded-lg border border-[var(--border-alt)] bg-[var(--surface-deep)] p-4"
      >
        <div class="flex items-start gap-3">
          <span
            class="shrink-0 w-6 h-6 rounded-full bg-emerald-900/40 text-emerald-300 text-xs font-bold flex items-center justify-center"
            aria-hidden="true"
            >{{ i + 1 }}</span
          >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[var(--text-heading)]">{{ c.label }}</p>
            <p class="text-xs text-emerald-300/90 mt-1">
              <span aria-hidden="true">✓</span> {{ c.verified }}
            </p>
            <p class="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              {{ c.confirm }}
            </p>
          </div>
        </div>
      </li>
    </ol>

    <!-- Criteria this tool does not evaluate at all. A separate list, because
         these are not "we checked and it passed" — they were never checked. -->
    <div v-if="criteria.length" class="mt-5">
      <h3 class="text-sm font-semibold text-[var(--text-heading)]">
        Not checked by this tool at all
      </h3>
      <p class="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed max-w-3xl">
        {{ criteria.length }} WCAG {{ wcagVersion }} criteri{{ criteria.length === 1 ? "on" : "a" }}
        need a person or a live interaction to judge, so no automated tool can report on them. They
        are not failures — they are simply unexamined.
      </p>
      <ul class="mt-3 space-y-2">
        <li v-for="n in criteria" :key="n.sc" class="text-xs text-[var(--text-secondary)]">
          <a
            :href="safeHttpUrl(n.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ n.sc }} {{ n.name }}</a
          ><span class="text-[var(--text-muted)]"> (Level {{ n.level }})</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { safeHttpUrl } from "@file-audit/shared";
import { manualChecks } from "~/utils/manualReview";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

// A clean report used to end with a one-line green card and a list of bare
// WCAG numbers, which tells an author nothing they can act on. These checks
// verify that accessibility structure EXISTS; almost none can judge whether it
// is CORRECT — alt text of "image" passes, a heading describing the wrong
// section passes. This card names that gap, so a perfect score is not read as
// "nothing left to do".
const props = defineProps<{
  categories: Array<{ id?: string; label?: string; score?: number | null }>;
  conformance?: ConformanceVerdict | null;
  wcagVersion: string;
}>();

const checks = computed(() => manualChecks(props.categories));
const criteria = computed(() => props.conformance?.notAssessed ?? []);

// The framing changes with the document: on a clean report this list IS the
// report's remaining content, so it says so rather than reading as an
// afterthought appended to a pass.
const intro = computed(() => {
  const clean = props.categories.every((c) => c && (c.score === 100 || c.score == null));
  return clean
    ? "Every automated check passed — but automated checks can only confirm that accessibility structure is present, not that it is right. Nothing below is a failure. These are the judgments a person still has to make before publishing."
    : "Separate from the fixes above: these checks passed, but passing only means the structure is there. A person still has to confirm it is correct.";
});
</script>

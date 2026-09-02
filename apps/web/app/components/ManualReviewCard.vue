<template>
  <section
    v-if="categories.length"
    data-testid="manual-review"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    aria-labelledby="manual-review-h"
  >
    <h2 id="manual-review-h" class="text-lg font-bold text-[var(--text-heading)]">
      Still worth checking by hand
    </h2>
    <p
      class="text-sm text-[var(--text-heading)] font-medium mt-1.5 leading-relaxed max-w-3xl border-l-2 border-emerald-500/50 pl-3"
    >
      No automated audit — this one included — can tell you a document is accessible. It can only
      tell you where it definitely is not. Whatever the score, a person has to look at the document
      before it is published.
    </p>
    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed max-w-3xl">
      {{ intro }}
    </p>

    <p
      v-if="hasFindings"
      class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed max-w-3xl"
    >
      Fixing everything in the action plan will clear the automated findings. It will not, on its
      own, make the document accessible — the checks below still need a person, and so does
      re-reading the document once the fixes are in.
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
            class="shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center"
            :class="
              c.tone === 'caution'
                ? 'bg-amber-900/40 text-amber-300'
                : 'bg-emerald-900/40 text-emerald-300'
            "
            aria-hidden="true"
            >{{ i + 1 }}</span
          >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[var(--text-heading)]">{{ c.label }}</p>
            <!-- A caution entry is NOT a passed check — the category was
                 excluded from scoring (e.g. every image marked decorative),
                 so the ✓ would claim a verification that never happened. -->
            <p
              class="text-xs mt-1"
              :class="c.tone === 'caution' ? 'text-amber-300/90' : 'text-emerald-300/90'"
            >
              <span aria-hidden="true">{{ c.tone === "caution" ? "!" : "✓" }}</span>
              {{ c.verified }}
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
        {{ criteria.length === 1 ? "was" : "were" }} not machine-checked by this audit — each row
        below says why, and some (contrast among them) other tools do measure. They are not failures
        — they are simply unexamined here.
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
          <span v-if="n.reason" class="block mt-0.5 text-[var(--text-muted)]">{{ n.reason }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { safeHttpUrl } from "@file-audit/shared";
import { manualChecks, withVeraContrast } from "~/utils/manualReview";
import { useWcag } from "~/composables/useWcag";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";
import type { PdfUaVerdict } from "@file-audit/shared";

// A clean report used to end with a one-line green card and a list of bare
// WCAG numbers, which tells an author nothing they can act on. These checks
// verify that accessibility structure EXISTS; almost none can judge whether it
// is CORRECT — alt text of "image" passes, a heading describing the wrong
// section passes. This card names that gap, so a perfect score is not read as
// "nothing left to do".
const props = defineProps<{
  categories: Array<{
    id?: string;
    label?: string;
    score?: number | null;
    severity?: string | null;
    notAssessed?: boolean | null;
    findings?: readonly string[] | null;
  }>;
  conformance?: ConformanceVerdict | null;
  /** Steers per-format wording (PowerPoint has no tag structure, so its
   *  reading-order card must not speak of tags). */
  fileType?: string | null;
  /** veraPDF's WCAG-profile pass, when it ran: its contrast rule can see
   *  what this checker's 1.4.3 "not assessed" row cannot (2026-09-02). */
  wcagVerdict?: Partial<PdfUaVerdict> | null;
}>();

// Read rather than receive: this card renders on both report views and on two
// pages, and neither page had a wcag binding to thread through.
const wcagVersion = useWcag().version;

const checks = computed(() => manualChecks(props.categories, props.fileType));
const criteria = computed(() =>
  withVeraContrast(props.conformance?.notAssessed ?? [], props.wcagVerdict ?? null),
);
const hasFindings = computed(() =>
  props.categories.some((c) => c && typeof c.score === "number" && c.score < 100),
);

// The framing changes with the document: on a clean report this list IS the
// report's remaining content, so it says so rather than reading as an
// afterthought appended to a pass.
const intro = computed(() => {
  const clean = props.categories.every((c) => c && (c.score === 100 || c.score == null));
  return clean
    ? "Every automated check passed — but these checks can only confirm that accessibility structure is present, not that it is right. Nothing below is a failure. These are the judgments a person still has to make before publishing."
    : "Separate from the fixes above: the checks listed here passed, and passing only means the structure is there. A person still has to confirm it is correct.";
});
</script>

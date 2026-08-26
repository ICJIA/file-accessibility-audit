<!-- apps/web/app/components/MatterhornChecklist.vue
     The landing page's checkpoint-by-checkpoint Matterhorn Protocol coverage
     disclosure (v1.91.0; rewritten for non-technical readers in v1.92.0 —
     the audience is agency staff, not PDF engineers, so the section leads
     with the three questions they actually ask: why "Matterhorn", what is
     veraPDF, and does any of this change my score). The claim this section
     makes is the product's trust story — which layer checks what, and what
     no software can check — so the data lives in ~/data/matterhorn.ts and
     matterhornChecklist.test.ts pins the honesty-critical entries. Explicit
     import (not Nuxt auto-import): the plain vitest config resolves `~` but
     performs no auto-import, the same trap AnnouncementBanner.vue documents. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  MATTERHORN_CHECKPOINTS,
  MATTERHORN_FACTS,
  type MatterhornCoverage,
} from "~/data/matterhorn";

interface CoverageStyle {
  label: string;
  chipClass: string;
}

// Text label + chip color per coverage value. The LABEL carries the meaning
// (WCAG 1.4.1 — color is never the only carrier); colors follow the site's
// code-legend conventions: emerald = this tool's own machinery, sky =
// structural/shared, amber = delegated guard, neutral = out of machine reach.
const COVERAGE_STYLES: Record<MatterhornCoverage, CoverageStyle> = {
  engine: {
    label: "Audit engine",
    chipClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  "engine-partial": {
    label: "Engine + veraPDF",
    chipClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  verapdf: {
    label: "veraPDF",
    chipClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  human: {
    label: "Human review",
    chipClass: "border-[var(--border)] bg-transparent text-[var(--text-muted)]",
  },
};

const checkpoints = MATTERHORN_CHECKPOINTS;
const facts = MATTERHORN_FACTS;

// Collapsed by default (v1.94.0 — the section moved above the fold, right
// beneath the Technical Details expander, and must not push the feature
// tiles off screen). The What's New banner links /#matterhorn, so arriving
// on that hash opens the panel instead of landing on a closed bar.
//
// RB-review F2: the banner lives on THIS page, so its click is a same-route
// hash navigation — no remount, so onMounted alone never fired. The router
// hash is watched reactively; useRoute is Nuxt-auto-imported and absent in
// the plain vitest environment, hence the guarded lookup.
const rootEl = ref<HTMLDetailsElement | null>(null);
function openIfMatterhornHash(hash: string | undefined): void {
  if (hash === "#matterhorn" && rootEl.value) rootEl.value.open = true;
}
try {
  // eslint-disable-next-line no-undef
  const route = useRoute();
  watch(
    () => route.hash,
    (h) => openIfMatterhornHash(h),
  );
} catch {
  /* plain vitest / non-router host — the mounted check below still runs */
}
onMounted(() => {
  try {
    openIfMatterhornHash(window.location.hash);
  } catch {
    /* SSR/test environments without a location — stay collapsed */
  }
});

const coverageCount = computed(() => {
  const counts: Record<MatterhornCoverage, number> = {
    engine: 0,
    "engine-partial": 0,
    verapdf: 0,
    human: 0,
  };
  for (const c of checkpoints) counts[c.coverage]++;
  return counts;
});
</script>

<template>
  <!-- Collapsible, styled as a sibling of the Technical Details expander it
       sits beneath (same details/summary pattern, chevron included).
       RB-review F10: the collapse must not cost the heading outline or the
       landmark list — an accessibility product's trust disclosure has to be
       reachable by H-key and region navigation, so the section landmark and
       a real <h2> (inside the summary) are preserved. -->
  <section id="matterhorn" aria-labelledby="matterhorn-heading" class="mt-4">
    <details
      ref="rootEl"
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden group"
    >
      <summary
        class="px-3 sm:px-6 py-4 cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors select-none flex items-center gap-2"
      >
        <svg
          class="w-4 h-4 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <h2 id="matterhorn-heading" class="inline text-sm font-semibold">
          The Matterhorn Checklist: The 31 Checkpoints of PDF Accessibility — and Who Checks Each
          One
        </h2>
      </summary>
      <div class="px-3 sm:px-6 pb-6 border-t border-[var(--border)]">
        <p class="mt-4 text-sm text-[var(--text-secondary)] max-w-2xl">
          When you check a PDF here, how do you know the checker itself is any good? The PDF
          industry answers that with a published master checklist of everything a PDF accessibility
          checker should test. Here is that whole checklist — and who checks each item on it, in
          plain terms.
        </p>

        <!-- The three questions non-technical visitors actually ask, answered
         before any jargon is used. -->
        <div class="mt-6 grid gap-4 sm:grid-cols-3">
          <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5">
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-1.5">
              Why "Matterhorn"?
            </h3>
            <p class="text-xs text-[var(--text-muted)] leading-relaxed">
              It's the PDF industry's official test model for accessible PDFs, published by the
              <a
                href="https://pdfa.org/resource/the-matterhorn-protocol/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >PDF Association</a
              >
              — the group that stewards the PDF format itself — and named after the famous Alpine
              mountain. Its {{ facts.checkpoints }} checkpoints work like the marked stops on a
              climbing route: clear them all and a PDF meets the formal accessibility standard
              (called PDF/UA). Professional checkers, like the
              <a
                href="https://pac.pdf-accessibility.org/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >PAC</a
              >
              tool many agencies use, are built on this same list.
            </p>
          </div>
          <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5">
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-1.5">
              What is veraPDF?
            </h3>
            <p class="text-xs text-[var(--text-muted)] leading-relaxed">
              A free, industry-standard PDF checker, created with the PDF Association —
              <a
                href="https://verapdf.org/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >veraPDF</a
              >
              is an independent second opinion, and it runs automatically alongside our own audit
              engine on every PDF you check here. You don't install or run anything: its result
              simply appears in your report. And if it ever cannot run, your report says
              <em>"Did not run"</em> rather than staying silent.
            </p>
          </div>
          <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5">
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-1.5">
              Does this change my score?
            </h3>
            <p class="text-xs text-[var(--text-muted)] leading-relaxed">
              No. Your score comes from the WCAG-based categories in your report, and the action
              plan there is still the thing to follow. These checkpoints cover the same ground —
              headings, image descriptions, tables, language — so fixing your report's findings
              improves both. The veraPDF result appears as its own informational panel on PDF
              reports; it informs, it never grades.
            </p>
          </div>
        </div>

        <div class="mt-5">
          <!-- Headline figures — stated so the coverage below has a denominator. -->
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            The protocol defines
            <strong class="text-[var(--text-secondary)]">{{ facts.checkpoints }} checkpoints</strong
            >, made up of
            <strong class="text-[var(--text-secondary)]"
              >{{ facts.failureConditions }} specific ways a PDF can fail</strong
            >. Software can verify {{ facts.machineCheckable }} of them;
            {{ facts.humanJudgment }} need human judgment; {{ facts.noDefinedTest }} have no defined
            test. No tool anywhere can automate the human part — which is why every report here
            includes a manual-review card listing what still needs a person's eyes.
          </p>

          <!-- Legend. Each mechanism is explained once, then the rows just chip. -->
          <ul class="mt-4 grid gap-2 sm:grid-cols-2 text-xs text-[var(--text-muted)]">
            <li class="flex items-start gap-2">
              <span
                class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                >Audit engine</span
              >
              <span
                >checked by this tool's own analyzer on every PDF audit ({{
                  coverageCount.engine
                }}
                checkpoints)</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span
                class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-sky-500/40 bg-sky-500/10 text-sky-300"
                >Engine + veraPDF</span
              >
              <span
                >our analyzer catches the common problems; veraPDF covers the rest of what software
                can check ({{ coverageCount["engine-partial"] }})</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span
                class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-amber-500/40 bg-amber-500/10 text-amber-300"
                >veraPDF</span
              >
              <span
                >checked by veraPDF — the independent checker described above — as part of every PDF
                audit ({{ coverageCount.verapdf }})</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span
                class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-[var(--border)] text-[var(--text-muted)]"
                >Human review</span
              >
              <span
                >no software anywhere can judge these — your report's manual-review card lists them
                for human eyes ({{ coverageCount.human }})</span
              >
            </li>
          </ul>

          <!-- The 31 checkpoints, in the protocol's own order. -->
          <ol class="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 list-none p-0">
            <li
              v-for="c in checkpoints"
              :key="c.id"
              class="flex items-start gap-3 border-t border-[var(--border-subtle,var(--border))] pt-3"
            >
              <span
                class="mt-px shrink-0 font-mono text-[11px] text-[var(--text-muted)]"
                aria-hidden="true"
                >{{ c.id }}</span
              >
              <div class="min-w-0">
                <p class="text-sm font-medium text-[var(--text-heading)]">
                  {{ c.name }}
                  <span
                    class="ml-1.5 inline-block align-middle rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    :class="COVERAGE_STYLES[c.coverage].chipClass"
                    >{{ COVERAGE_STYLES[c.coverage].label }}</span
                  >
                </p>
                <p class="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
                  {{ c.summary }}
                </p>
              </div>
            </li>
          </ol>

          <!-- The disclosure contract that keeps this section honest. -->
          <p
            class="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)] leading-relaxed"
          >
            One more honesty rule: if veraPDF ever cannot run, PDF reports say
            <span class="text-[var(--text-secondary)]"
              >&ldquo;PDF/UA-1 machine checks (veraPDF): Did not run&rdquo;</span
            >
            instead of hiding the panel — a missing check is never presented as a passing one. The
            Matterhorn Protocol applies to PDF files; Word, PowerPoint, and Excel audits follow the
            per-format checks on the
            <NuxtLink
              to="/technical-details"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >technical details</NuxtLink
            >
            page.
          </p>
        </div>
      </div>
    </details>
  </section>
</template>

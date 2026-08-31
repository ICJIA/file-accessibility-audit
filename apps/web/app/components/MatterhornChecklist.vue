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
  MATTERHORN_PROTOCOL_URL,
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

        <!-- Scope note — v1.101.0 (user request): why this checklist names
             ONE format. Matterhorn is PDF/UA's test model and PDF-only by
             construction; Office files are still fully audited here, just
             under their own per-format checks. Saying both halves out loud
             prevents the two wrong readings — that Office files aren't
             checked, or that this list applies to them.
             matterhornChecklist.test.ts pins both halves and the spec link. -->
        <div
          class="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6"
          data-testid="matterhorn-pdf-only"
        >
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
            Why is this checklist only about PDFs?
          </h3>
          <div
            class="space-y-2.5 text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-3xl"
          >
            <p>
              The Matterhorn Protocol was written for exactly one file format: PDF. It is the test
              model for PDF/UA (ISO 14289), the accessibility standard for PDF files specifically,
              and its {{ facts.checkpoints }} checkpoints test machinery that only exists inside a
              PDF — the hidden tag tree, artifact marking, bookmark outlines, font embedding. Word,
              PowerPoint, and Excel files are built on a completely different internal format
              (Office Open XML), so these checkpoints have no meaning there.
            </p>
            <p>
              Office files can absolutely still be checked here. Drop a Word (.docx), PowerPoint
              (.pptx), or Excel (.xlsx) file on the same tool and it gets its own audit covering the
              same accessibility ground — image descriptions, heading structure, table setup —
              tested the way those formats actually store it, with every per-format check listed on
              the
              <NuxtLink
                to="/technical-details"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >technical details</NuxtLink
              >
              page. Only this Matterhorn checklist and the veraPDF panels are PDF-specific.
            </p>
            <p>
              The protocol itself is published free by the PDF Association — read the
              <a
                :href="MATTERHORN_PROTOCOL_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >Matterhorn Protocol specification</a
              >
              if you want the full test model behind this list.
            </p>
          </div>
        </div>

        <!-- v1.97.0 (user request): THE linkage a non-technical Illinois
             agency reader needs before anything else on this list makes
             sense — WCAG and IITAA are the law they already know; Matterhorn
             is how those legal requirements get tested inside a PDF. The
             honesty line at the end is load-bearing: the law names WCAG, not
             PDF/UA, and this block must never imply otherwise
             (matterhornChecklist.test.ts pins it). -->
        <div
          class="mt-6 rounded-xl border border-[var(--accent-green)]/30 bg-[var(--surface-card)] p-4 sm:p-6"
          data-testid="matterhorn-law-linkage"
        >
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
            WCAG and IITAA are the law — so where does Matterhorn fit?
          </h3>
          <div
            class="space-y-2.5 text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-3xl"
          >
            <p>
              <strong>The legal chain, in one breath:</strong> ADA Title II (federal, in effect
              compliance due April 26, 2027 for entities of 50,000 or more, April 26, 2028 for
              smaller ones and special districts) and Illinois' IITAA 2.1 make digital accessibility
              a legal obligation for public bodies like ICJIA — and both name
              <strong>WCAG 2.1 AA</strong> as the standard to meet. (This tool audits against WCAG
              2.2 AA, a superset of that legal minimum.)
            </p>
            <p>
              <strong>But WCAG was written mainly for web pages.</strong> It says <em>what</em> must
              be true of any content — text alternatives for images, a correct reading order, real
              headings, sufficient contrast — not <em>how</em> those requirements look inside a PDF,
              whose internals are nothing like a web page's.
            </p>
            <p>
              <strong>Matterhorn is the PDF world's translation.</strong> PDF/UA (ISO 14289) is the
              technical standard for an accessible PDF, and the Matterhorn Protocol is its published
              test model: the {{ facts.checkpoints }} checkpoints below are the concrete, checkable
              form those same WCAG-style requirements take inside a PDF file.
            </p>
            <p>
              <strong>Why you should care:</strong> when your PDF is evaluated — by an auditor, a
              records officer, a remediation vendor, or the professional checkers agencies use (PAC,
              Acrobat, veraPDF) — these checkpoints are what those tools test. Fixing your report's
              findings moves both needles at once: the WCAG/IITAA obligation the law names, and the
              PDF-specific checks evaluators actually run.
            </p>
            <p class="text-[var(--text-muted)]">
              To be precise: the law requires WCAG — a PDF does not need a PDF/UA badge to be
              lawful. But the two overlap heavily by design, and Matterhorn is how PDF accessibility
              gets tested in practice.
            </p>
          </div>
          <!-- The chain, drawn: colors follow the section's coverage legend
               (neutral = external requirement, emerald = this tool's work). -->
          <p class="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]" aria-hidden="true">
            <span
              class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)]"
              >ADA Title II + IITAA</span
            >
            <span class="text-[var(--text-muted)]">→ require →</span>
            <span
              class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)]"
              >WCAG 2.1 AA</span
            >
            <span class="text-[var(--text-muted)]">→ tested in PDFs via →</span>
            <span
              class="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-sky-300"
              >Matterhorn's 31 checkpoints</span
            >
            <span class="text-[var(--text-muted)]">→ shown in →</span>
            <span
              class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
              >your report</span
            >
          </p>
        </div>

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
                :href="MATTERHORN_PROTOCOL_URL"
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
              engine on every PDF you check here — once against the PDF/UA standard, and once
              against its machine-testable WCAG&nbsp;2.2 rules (v1.97.0). You don't install or run
              anything: both results simply appear in your report. And if a check ever cannot run,
              your report says <em>"Did not run"</em> rather than staying silent.
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

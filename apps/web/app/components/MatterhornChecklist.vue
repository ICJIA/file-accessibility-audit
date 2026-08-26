<!-- apps/web/app/components/MatterhornChecklist.vue
     The landing page's checkpoint-by-checkpoint Matterhorn Protocol coverage
     disclosure (v1.91.0). The claim this section makes is the product's trust
     story — which layer checks what, and what no software can check — so the
     data lives in ~/data/matterhorn.ts and matterhornChecklist.test.ts pins
     the honesty-critical entries. Explicit import (not Nuxt auto-import): the
     plain vitest config resolves `~` but performs no auto-import, the same
     trap AnnouncementBanner.vue documents. -->
<script setup lang="ts">
import { computed } from "vue";
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
  <section id="matterhorn" aria-labelledby="matterhorn-heading" class="mt-14">
    <div class="mb-2 text-center">
      <h2
        id="matterhorn-heading"
        class="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--text-muted)]"
      >
        The Matterhorn Checklist
      </h2>
      <p class="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl mx-auto">
        Every PDF audit here is measured against the
        <a
          href="https://pdfa.org/resource/the-matterhorn-protocol/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >Matterhorn Protocol</a
        >
        — the PDF Association's test model for PDF/UA, the same {{ facts.checkpoints }} checkpoints
        professional checkers like
        <a
          href="https://pac.pdf-accessibility.org/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >PAC</a
        >
        are built on. Here is every checkpoint, and which layer of this tool checks it.
      </p>
    </div>

    <div class="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
      <!-- Headline figures — stated so the coverage below has a denominator. -->
      <p class="text-xs text-[var(--text-muted)] leading-relaxed">
        Matterhorn Protocol 1.1 defines
        <strong class="text-[var(--text-secondary)]">{{ facts.checkpoints }} checkpoints</strong>
        comprising
        <strong class="text-[var(--text-secondary)]"
          >{{ facts.failureConditions }} failure conditions</strong
        >
        — {{ facts.machineCheckable }} machine-checkable, {{ facts.humanJudgment }} requiring human
        judgment, and {{ facts.noDefinedTest }} with no defined test. No automated checker can go
        past the machine-checkable set; the honest ones say so.
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
            >the analyzer checks the frequent failure modes; the veraPDF pass covers the rest of the
            machine-testable conditions ({{ coverageCount["engine-partial"] }})</span
          >
        </li>
        <li class="flex items-start gap-2">
          <span
            class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-amber-500/40 bg-amber-500/10 text-amber-300"
            >veraPDF</span
          >
          <span
            >checked by the open-source
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >veraPDF</a
            >
            validator, which runs alongside every PDF audit on this server ({{
              coverageCount.verapdf
            }})</span
          >
        </li>
        <li class="flex items-start gap-2">
          <span
            class="mt-px inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-[var(--border)] text-[var(--text-muted)]"
            >Human review</span
          >
          <span
            >no software — this tool, PAC, or veraPDF — can judge these; every report lists them on
            its manual-review card ({{ coverageCount.human }})</span
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
        If veraPDF ever cannot run, PDF reports say
        <span class="text-[var(--text-secondary)]"
          >&ldquo;PDF/UA-1 machine checks (veraPDF): Did not run&rdquo;</span
        >
        instead of hiding the panel — missing checks are never presented as passing. The Matterhorn
        Protocol applies to PDF; Word, PowerPoint, and Excel audits follow the per-format checks on
        the
        <NuxtLink to="/technical-details" class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >technical details</NuxtLink
        >
        page.
      </p>
    </div>
  </section>
</template>

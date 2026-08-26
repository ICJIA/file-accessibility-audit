<script setup lang="ts">
// Public page — no auth middleware. Since v1.98.0 this page and the
// Technical Details collapsible on the audit page are ONE content source
// (user decision): both render <TechnicalExplainer />, so they can never
// drift apart. This file is page chrome only — head, back nav, header, and
// the related-documents grid. technicalDetailsSync.test.ts pins that no
// section prose lives here.
import { useRouter } from "vue-router";
import { onMounted, ref } from "vue";

definePageMeta({ middleware: [] });

const runtimeConfig = useRuntimeConfig();

useHead({
  title: "Technical Details",
  meta: [
    {
      name: "description",
      content:
        "How the ICJIA File Accessibility Audit tool analyzes PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) documents and remediates PDFs — the complete technical reference: pipelines, scoring, tools, limitations, and privacy.",
    },
  ],
  link: [
    {
      rel: "canonical",
      href: `${runtimeConfig.public.siteUrl}/technical-details`,
    },
  ],
});

const router = useRouter();
const hasHistory = ref(false);
onMounted(() => {
  hasHistory.value = typeof window !== "undefined" && window.history.length > 1;
});
function goBack(): void {
  if (hasHistory.value) router.back();
  else void router.push("/");
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10 space-y-10">
    <!-- Back nav. mb-6, not -mb-4: under Tailwind v4, space-y-* sets this
         element's own margin-bottom via a zero-specificity :where(), so a
         negative margin class replaces it (pulling the header over the
         button) instead of collapsing against the next sibling as in v3.
         Pinned by backNavSpacing.test.ts. -->
    <nav class="mb-6">
      <button
        type="button"
        class="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        @click="goBack"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        <span>{{ hasHistory ? "Back" : "Back to home" }}</span>
      </button>
    </nav>

    <!-- Header -->
    <header>
      <p class="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)] mb-3">
        Technical Details
      </p>
      <h1 class="text-3xl sm:text-5xl font-black text-[var(--text-heading)] leading-tight">
        How This Tool Works
      </h1>
      <p class="mt-4 text-sm text-[var(--text-secondary)] leading-relaxed">
        The complete technical reference — identical to the <em>Technical Details</em> section on
        the
        <NuxtLink to="/" class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >audit page</NuxtLink
        >, published as its own page so it can be linked, printed, and read without the audit UI
        around it. For the legal/compliance-facing version, see the
        <NuxtLink
          to="/data-retention"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >data retention policy</NuxtLink
        >.
      </p>
    </header>

    <!-- THE content — the single source shared with the audit page's
         collapsible. All section prose lives in TechnicalExplainer.vue. -->
    <TechnicalExplainer />

    <!-- Related documents (page chrome, not shared content — the audit
         page's collapsible has its own surroundings). -->
    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
        Related documents
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NuxtLink
          to="/data-retention"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Compliance
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">Data Retention Policy</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Auditor-ready document covering retention periods, lifecycle audit trail, AI usage
            statement, and red/blue team security audit history.
          </p>
        </NuxtLink>
        <NuxtLink
          to="/"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">App</div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">Audit page</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Upload a PDF, Word, PowerPoint, or Excel document and run the audit. The same content as
            this page sits there in the <em>Technical Details</em> dropdown, beside your results.
          </p>
        </NuxtLink>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Code</div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">Source on GitHub ↗</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Full open-source repository. Every claim above is verifiable against the code there.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">History</div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">Changelog ↗</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Per-release notes for every version, including the addition of the auto-remediation
            feature in v1.18.0.
          </p>
        </a>
      </div>
    </section>
  </div>
</template>

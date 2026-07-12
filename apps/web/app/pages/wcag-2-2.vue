<script setup lang="ts">
definePageMeta({ middleware: [] });

const wcag = useWcag();
const runtimeConfig = useRuntimeConfig();
const iitaaUrl = String(
  runtimeConfig.public.iitaaUrl ?? "https://doit.illinois.gov/initiatives/accessibility/iitaa.html",
);
const siteUrl = String(runtimeConfig.public.siteUrl ?? "");

useHead({
  title: "How WCAG 2.2 differs from WCAG 2.1",
  meta: [
    {
      name: "description",
      content:
        "A plain-language guide for managers: what WCAG 2.2 adds over 2.1, what it means for your documents, and why WCAG 2.1 AA remains the IITAA/ADA Title II legal minimum.",
    },
  ],
  link: siteUrl ? [{ rel: "canonical", href: `${siteUrl}/wcag-2-2` }] : [],
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <p class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
      Standards explainer
    </p>
    <h1 class="text-3xl font-black text-[var(--text-heading)] mb-4">
      How WCAG 2.2 differs from WCAG 2.1
    </h1>

    <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 mb-8">
      <p class="text-sm font-semibold text-emerald-200 mb-1">Compliance bottom line</p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        Illinois law (<strong>IITAA 2.1</strong>, effective June 24, 2024) and the federal
        <strong>ADA Title II</strong> rule both require <strong>WCAG 2.1 Level AA</strong> — that is
        the legal minimum and it is <strong>mandatory</strong>.
        <strong>WCAG 2.2 is not yet referenced by IITAA</strong>, so conforming to 2.2 is
        <strong>optional and forward-looking</strong>. We audit against 2.2 anyway because it is a
        strict superset of 2.1 and we expect the standards to follow.
      </p>
    </div>

    <h2 class="text-xl font-bold text-[var(--text-heading)] mb-3">The short version</h2>
    <p class="text-[var(--text-secondary)] leading-relaxed mb-3">
      WCAG 2.2 doesn't replace 2.1 — it <strong>adds nine new success criteria</strong> and
      <strong>removes one</strong> (4.1.1 "Parsing", now obsolete). Everything your documents
      already needed for 2.1 Level AA still applies, unchanged. Of the nine additions,
      <strong>six are at Level A/AA</strong> (the compliance tier); three are Level AAA.
    </p>
    <p class="text-[var(--text-secondary)] leading-relaxed mb-8">
      Almost all of the new rules target <strong>interactive web pages and apps</strong> — things
      like pointer dragging, tap-target size, and login flows. For a
      <strong>static document</strong>, most of them simply don't apply. A few can matter for
      <strong>interactive forms</strong>, and our audit flags those for manual review.
    </p>

    <h2 class="text-xl font-bold text-[var(--text-heading)] mb-3">
      The six new Level A/AA rules, in plain terms
    </h2>
    <div class="overflow-x-auto rounded-lg border border-[var(--border)] mb-8">
      <table class="w-full text-sm min-w-[560px]">
        <thead>
          <tr
            class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide"
          >
            <th class="text-left px-4 py-2 font-medium">New rule (level)</th>
            <th class="text-left px-4 py-2 font-medium">What it means</th>
            <th class="text-left px-4 py-2 font-medium">Affects our documents?</th>
          </tr>
        </thead>
        <tbody class="text-[var(--text-muted)]">
          <tr class="border-b border-[var(--border-subtle)]">
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">
              Focus Not Obscured (AA)
            </td>
            <td class="px-4 py-2.5">
              The item you tab to can't be hidden behind sticky headers/footers.
            </td>
            <td class="px-4 py-2.5">No — web UI only.</td>
          </tr>
          <tr class="border-b border-[var(--border-subtle)]">
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">
              Dragging Movements (AA)
            </td>
            <td class="px-4 py-2.5">
              Anything done by dragging must also work with a simple tap/click.
            </td>
            <td class="px-4 py-2.5">No — web UI only.</td>
          </tr>
          <tr class="border-b border-[var(--border-subtle)]">
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">Target Size (AA)</td>
            <td class="px-4 py-2.5">Clickable controls are at least 24×24 pixels.</td>
            <td class="px-4 py-2.5">Only interactive forms.</td>
          </tr>
          <tr class="border-b border-[var(--border-subtle)]">
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">
              Consistent Help (A)
            </td>
            <td class="px-4 py-2.5">Help/contact options appear in the same place across pages.</td>
            <td class="px-4 py-2.5">No — multi-page web UI.</td>
          </tr>
          <tr class="border-b border-[var(--border-subtle)]">
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">
              Redundant Entry (A)
            </td>
            <td class="px-4 py-2.5">Don't make people re-type information they already gave.</td>
            <td class="px-4 py-2.5">Only interactive forms.</td>
          </tr>
          <tr>
            <td class="px-4 py-2.5 font-medium text-[var(--text-secondary)]">
              Accessible Authentication (AA)
            </td>
            <td class="px-4 py-2.5">No memory/puzzle test required to log in.</td>
            <td class="px-4 py-2.5">Only interactive forms.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 class="text-xl font-bold text-[var(--text-heading)] mb-3">What this means for you</h2>
    <p class="text-[var(--text-secondary)] leading-relaxed mb-3">
      For ordinary documents (reports, memos, forms you only read), moving from 2.1 to 2.2 changes
      nothing about what this tool checks — the automated checks are identical. We display "WCAG
      2.2" to signal we're holding documents to the newest bar, and we surface the form-relevant new
      rules as <em>"not assessed — manual review"</em> when a PDF has interactive form fields,
      rather than pretending we tested them.
    </p>
    <p class="text-[var(--text-secondary)] leading-relaxed mb-8">
      If your organization needs to report strictly against the legal minimum, the audit can be
      switched back to WCAG 2.1 — ask your administrator.
    </p>

    <div class="flex flex-wrap gap-3">
      <a
        :href="wcag.quickref"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-[var(--link)] hover:text-[var(--link-hover)] underline"
        >WCAG {{ wcag.version }} Quick Reference</a
      >
      <a
        href="https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-[var(--link)] hover:text-[var(--link-hover)] underline"
        >W3C: What's New in WCAG 2.2</a
      >
      <a
        :href="iitaaUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-[var(--link)] hover:text-[var(--link-hover)] underline"
        >Illinois IITAA</a
      >
      <NuxtLink
        to="/technical-details"
        class="text-sm text-[var(--link)] hover:text-[var(--link-hover)] underline"
        >Technical details</NuxtLink
      >
    </div>
  </div>
</template>

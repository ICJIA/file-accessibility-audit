<template>
    <!-- 11. Standards -->
    <section id="standards" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        11. Standards &amp; compliance alignment
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        The tool's design and this policy aim to align with the following standards and regulations.
        Alignment with a standard does not constitute certification — official conformance audits
        remain the responsibility of the user agency.
      </p>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
        <li>
          <strong>WCAG 2.2 Level AA</strong> (Web Content Accessibility Guidelines, W3C) — a
          superset of the WCAG 2.1 AA that IITAA 2.1 and ADA Title II require; the audit scores each
          uploaded document — PDF, Word, PowerPoint, or Excel — against a set of WCAG-aligned
          categories that map to these success criteria for non-web documents. The exact category
          set is tailored per format (for example, reading order and form accessibility are
          structurally not applicable to Word, and heading structure does not apply to a
          spreadsheet).
        </li>
        <li>
          <strong>ADA Title II</strong> (U.S. federal law, effective April 2026 for state and local
          government digital content) — informs the tool's diagnostic and remediation framing.
        </li>
        <li>
          <strong>Illinois IITAA</strong> (Information Technology Accessibility Act) — the tool's
          compliance disclaimers on the remediation result page link to the Illinois DOIT
          accessibility standards.
        </li>
        <li>
          <strong>PDF/UA-1 (ISO 14289-1)</strong> — the remediation pipeline uses veraPDF to
          validate output against PDF/UA-1 technical conformance. veraPDF's verdict is surfaced
          honestly on the result page; manual review is acknowledged as still required for full
          accessibility.
        </li>
        <li>
          <strong>State of Illinois records-retention policy</strong> — the default 7-year retention
          period for the <code class="text-xs font-mono">remediation_events</code> audit trail
          matches typical state-agency records-retention schedules. Adjust via configuration if your
          agency's schedule differs.
        </li>
      </ul>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 12. Standards & compliance alignment. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

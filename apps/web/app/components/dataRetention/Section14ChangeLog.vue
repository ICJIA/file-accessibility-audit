<template>
    <!-- 13. Change log -->
    <section id="change-log" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        13. Change log for this policy
      </h2>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)]">
        <li>
          <strong>v1.1 · 2026-07-03</strong> — Documents that the audit pipeline (§ 2) covers
          Microsoft Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files in addition to PDF.
          All four formats are handled identically by the audit pipeline: processed in memory only,
          never written to disk, and discarded after the response. Adds the OOXML container-parsing
          tools (JSZip, fast-xml-parser) to the toolchain table (§ 5) and an OOXML glossary entry (§
          12). The remediation pipeline (§ 3) is unchanged and remains PDF-only.
        </li>
        <li>
          <strong>v1.0 · 2026-05-18</strong> — Initial publication. Covers tool versions v1.18.0 and
          newer. Documents the audit pipeline and the optional auto-remediation pipeline introduced
          in v1.18.0.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        This policy is version-controlled with the source code. Any change to the data-handling
        behavior of the tool is reflected here, with a corresponding version bump and a dated entry
        above. The complete change history is available via
        <code class="text-xs font-mono">git log apps/web/app/pages/data-retention.vue</code>
        on the project's GitHub repository.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 14. Change log for this policy. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

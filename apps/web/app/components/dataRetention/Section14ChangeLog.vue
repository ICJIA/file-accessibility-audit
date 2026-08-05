<template>
  <!-- 13. Change log -->
  <section id="change-log" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      14. Change log for this policy
    </h2>
    <ul class="space-y-2 text-sm text-[var(--text-secondary)]">
      <li>
        <strong>v1.3 · 2026-08-05</strong> — Adds § 8a, a dated storage-verification annex proving §
        8 against the source code, and qualifies § 8 where verification showed the wording
        overclaimed: a <em>saved or shared</em> report quotes short strings from the document
        (metadata fields, image alt-text values, link text and destinations, bookmark titles,
        form-field names) inside its findings; page and paragraph text, images, form-field values,
        and file bytes remain never-stored, and a plain unshared audit stores none of the quoted
        strings either. Documents the nightly database backups added in tool v1.49.0 (§ 7, § 8):
        on-server snapshots kept outside the application directory, integrity-checked, with only the
        5 newest retained — so a purged row persists in snapshots for roughly 5 further days.
      </li>
      <li>
        <strong>v1.2 · 2026-08-05</strong> — Documents that refused uploads are recorded in the
        usage log (tool v1.46.0 and newer): a refusal stores the file name the upload was offered
        under (sanitized) and a timestamp — never any file content, and deliberately no content
        fingerprint (§ 7, § 8, § 10). Corrects the usage-log retention entry in § 7: rows are purged
        after 365 days by the periodic cleanup sweep (configurable), not retained indefinitely — the
        365-day purge has been in place since tool v1.20.1. Corrects § 8: the usage log has always
        recorded the caller's IP address and browser user-agent alongside each row; the previous
        wording implied otherwise. Documents that veraPDF also runs during every PDF audit (tool
        v1.37.0 and newer), not only in remediation (§ 2, § 5). Corrects the OTP code lifetime in §
        7 (15 minutes, not 10). Records the 2026-08-05 full red/blue security audit and the stricter
        file-name cleaning it introduced (§ 10). Corrects the on-page numbering of §§ 12–15, which
        had drifted one behind the table of contents.
      </li>
      <li>
        <strong>v1.1 · 2026-07-03</strong> — Documents that the audit pipeline (§ 2) covers
        Microsoft Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files in addition to PDF. All
        four formats are handled identically by the audit pipeline: processed in memory only, never
        written to disk, and discarded after the response. Adds the OOXML container-parsing tools
        (JSZip, fast-xml-parser) to the toolchain table (§ 5) and an OOXML glossary entry (§ 13).
        The remediation pipeline (§ 3) is unchanged and remains PDF-only.
      </li>
      <li>
        <strong>v1.0 · 2026-05-18</strong> — Initial publication. Covers tool versions v1.18.0 and
        newer. Documents the audit pipeline and the optional auto-remediation pipeline introduced in
        v1.18.0.
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

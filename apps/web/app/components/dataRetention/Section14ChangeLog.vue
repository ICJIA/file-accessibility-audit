<template>
  <!-- 14. Change log -->
  <section id="change-log" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      14. Change log for this policy
    </h2>
    <ul class="space-y-2 text-sm text-[var(--text-secondary)]">
      <li>
        <strong>v1.14 · 2026-08-25</strong> — One clarification of the v1.13 figures; nothing new is
        collected or stored and no retention period changes. The re-audit summary on the status page
        now counts <em>public</em> audits only: audits made through the internal trusted-tool tier
        (the automated fleet inventory, § 8a) are excluded, because the fleet re-scans unchanged
        documents on a schedule and its runs were drowning out the picture of documents people
        actually fix. Records whose tier is unknown — written before the tier was recorded — are
        excluded as well, so the summary climbs from when tier recording began rather than guessing.
        The distinct-document counts are unchanged and still include every tier.
      </li>
      <li>
        <strong>v1.13 · 2026-08-25</strong> — Nothing new is collected or stored; no retention
        period changes. The public status page publishes two new families of
        <em>aggregate</em> figures computed from the usage-metadata records the policy already
        describes (§ 6, § 8): the number of <em>distinct documents</em> audited (a count of distinct
        content fingerprints — the fingerprints themselves are never shown), and a
        <em>re-audit summary</em> for the last 30 days — how many documents were checked more than
        once, how many of those improved, and the median score change. The summary is computed by
        grouping records by file name inside the database; no file name, fingerprint, or individual
        score is published. When fewer than five documents qualify, the rates and the median are
        withheld — over so few documents they would describe a single visitor's documents rather
        than a usage pattern. The counts themselves remain published, like every other aggregate
        count on the status page.
      </li>
      <li>
        <strong>v1.12 · 2026-08-22</strong> — Two additions, no change to any retention period.
        <em>Failed audits are now recorded</em> in the usage-metadata table: an audit the tool
        attempted and could not complete leaves a row with the same fields as a successful one, no
        score or grade, no content hash, and a one-word reason code (<code class="text-xs font-mono"
          >unreadable</code
        >, <code class="text-xs font-mono">timeout</code>,
        <code class="text-xs font-mono">fetch-failed</code>,
        <code class="text-xs font-mono">navigation-failed</code>,
        <code class="text-xs font-mono">internal</code>) — never the error text. § 8a shows the new
        <code class="text-xs font-mono">audit_log.reason</code> column.
        <em>Daily activity files</em>: each night the server writes the previous day's usage-log
        rows to a CSV file so auditors and managers can review a day without querying the database.
        Derived from the table, same fields, deleted on the same 365-day schedule, kept on the
        server's disk only, not part of the nightly backup, never served by the site (§ 7, § 8).
        <em>Application error log</em>: the service's own error output — message and stack trace,
        for diagnosing faults — is also kept as one file per day in the same place, for 30 days, not
        backed up, never served (§ 7, § 8).
      </li>
      <li>
        <strong>v1.11 · 2026-08-21</strong> — Adds one column to the usage-metadata table (<code
          class="text-xs font-mono"
          >audit_log.privileged</code
        >) recording which request tier an audit came through: the internal trusted-tool tier used
        by the automated fleet, or the public tier. It lets the status page report privileged-tier
        volume so the shared service token's use can be watched. It is a property of that token,
        <strong>not</strong> an identity — nothing about who made the request — and no new table, no
        document content, and no change to any retention period (§ 8a shows the updated schema).
      </li>
      <li>
        <strong>v1.10 · 2026-08-20</strong> — Discloses one more kind of document text that a
        <em>saved or shared</em> PDF report can quote. When a document tags a box of text as an
        image (Word does this with text boxes, sidebars, and chart titles), the report now keeps an
        excerpt of up to 80 characters of that text so it can point an author at the right box — and
        tell them to change its tag rather than describe it, because a description would hide the
        text from screen readers. The same section now also names heading text and the page number
        beside each quoted link, both of which reports already carried. Nothing about who uploaded a
        file, nothing about visitors, and no new table, column, or retention period: the excerpts
        live inside the same stored report text, under the same 365-day expiry (§ 7, § 8, § 8a).
      </li>
      <li>
        <strong>v1.9 · 2026-08-18</strong> — Extends the v1.8 address generalization to a third
        per-file page type and discloses a short gap. The report page for web-page audits
        (/page-report/…) shipped on 2026-08-18 without being covered by the generalization, so for
        part of that day each visit to such a report reached the analytics server with the report's
        individual address — contrary to what v1.8 states. Fixed the same day: those pages now count
        only as their base route (/page-report), an automated check fails the build for any future
        per-file page type left out of the generalization, and the few individual addresses already
        recorded remain only in the analytics tool's historical data on ICJIA's own server. What is
        recorded per page view is otherwise unchanged (§ 7).
        <strong>Nothing about what the audit tool itself stores changed.</strong>
      </li>
      <li>
        <strong>v1.8 · 2026-08-15</strong> — Narrows what the analytics beacon reports. Page
        addresses are now generalized before they leave the visitor's browser: a repair-job page
        (/remediate/…) or a shared-report page (/report/…) counts only as its base route, so
        per-file addresses never reach the analytics server, and query strings — including the
        one-time repair download token, which the previous stock analytics script included in its
        payload URL — are never sent at all. What is recorded per page view is otherwise unchanged
        (§ 7); § 8a and § 9 state the generalization.
        <strong>Nothing about what the audit tool itself stores changed.</strong>
      </li>
      <li>
        <strong>v1.7 · 2026-08-14</strong> — Documents the addition of privacy-friendly page-view
        analytics. The site's web pages now count visits with Plausible, an open-source, cookie-free
        analytics tool, self-hosted by ICJIA on its own server (plausible.icjia.cloud, a
        DigitalOcean droplet ICJIA manages itself) — no commercial analytics provider, ad network,
        or tracker receives anything. Recorded per page view: the page URL, referrer, browser and
        operating-system family, device type, and country/region — never a cookie, never a stored IP
        address or user-agent, and never anything about an uploaded document. The visitor's browser
        reports directly to the analytics server; the audit application never receives or forwards
        that data, and audits themselves do not pass through analytics at all. Page views within a
        single day are linked by a salted hash that rotates every 24 hours, so activity can never be
        connected across days or across sites. Adds the analytics store to § 7, reworks the
        analytics bullets in § 8, qualifies the analytics row in § 8a, and describes the safeguard
        in § 9.
        <strong>Nothing about what the audit tool itself stores changed.</strong>
      </li>
      <li>
        <strong>v1.6 · 2026-08-09</strong> — Documents the identifier-removal release (tool
        v1.68.0): the sign-in system is removed entirely — no accounts, no login codes, no sessions,
        no API tokens tied to a person — and the service
        <em>stops storing identifiers altogether</em>. The email, IP-address, and browser user-agent
        columns were dropped from the database schema itself (migration 11), destroying the
        previously stored values, not merely ending new writes; the login-code and token tables were
        deleted; and the one email the service could ever send (the login code) is gone with the
        mail-sending code. What remains per audit is metadata about the event — file name, score,
        grade, timestamp, content hash — and it says nothing about who did the checking. The
        caller's IP address is still used <em>transiently in server memory</em> to rate-limit
        requests and cap remediation jobs, and is written nowhere. Old nightly snapshots retain the
        old shape until the keep-5 rotation ages them out (≈5 days). The hosting layer's standard
        nginx access logs are unchanged and remain outside these application records (§ 8a; their
        retention is now listed in § 7). Updates §§ 2, 3, 4, 5, 6, 7, 7a, 8, 8a, 9, 11.
      </li>
      <li>
        <strong>v1.5 · 2026-08-09</strong> — Wording only; nothing stored, used, or retained
        changed. States explicitly — for federal and state auditors — that every retained row is
        <em>metadata about an audit event</em> (date, file name, score, grade): a record
        <em>about</em> the document, never a copy of any part of it (§&nbsp;7a; the same wording now
        appears on the status page's backup card). Adds the reconciliation auditors need in one
        place: this policy never claims the records are free of personal detail — the personal
        fields are named (sign-in email for signed-in users; the connection log's IP address and
        browser user-agent, purged after 365 days; the file name as uploaded, which can itself name
        a person), and what the records never hold is the document or anything read from inside it
        (§&nbsp;7a, §&nbsp;8, §&nbsp;8a).
      </li>
      <li>
        <strong>v1.4 · 2026-08-05</strong> — Documents that shared-report rows are now physically
        deleted by the cleanup sweep roughly 30 days after their link expires (tool v1.51.0) — a
        total stored lifetime of about 395 days (§ 7, § 8a). Previously the link stopped working at
        365 days but the stored row was retained indefinitely, which § 7 disclosed. Also documents
        that the retention sweep now runs regardless of the optional remediation feature's on/off
        switch (§ 7); previously, disabling that feature would have silently paused the periodic
        purges.
      </li>
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

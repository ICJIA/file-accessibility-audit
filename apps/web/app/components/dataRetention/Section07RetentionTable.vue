<template>
  <!-- 7. Retention table -->
  <section id="retention-table" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      7. Retention periods by data category
    </h2>
    <div class="overflow-x-auto" tabindex="0">
      <table class="w-full text-sm">
        <caption class="sr-only">
          Retention periods by data category: where each is stored, maximum retention, and whether
          it's configurable
        </caption>
        <thead>
          <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
            <th scope="col" class="py-2 pr-4 font-medium">Data category</th>
            <th scope="col" class="py-2 pr-4 font-medium">Where stored</th>
            <th scope="col" class="py-2 pr-4 font-medium">Maximum retention</th>
            <th scope="col" class="py-2 font-medium">Configurable</th>
          </tr>
        </thead>
        <tbody class="text-[var(--text-secondary)] text-xs">
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">
              Uploaded document (audit) — PDF, Word, PowerPoint, or Excel
            </td>
            <td class="py-2.5 pr-4">
              Server memory only (a PDF additionally uses a short-lived qpdf temp copy, deleted same
              request; Word/PowerPoint/Excel analysis never touches disk)
            </td>
            <td class="py-2.5 pr-4">Seconds; discarded after HTTP response</td>
            <td class="py-2.5">No</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Uploaded PDF (remediation input)</td>
            <td class="py-2.5 pr-4">
              <code class="font-mono">data/remediation/&lt;jobId&gt;/work/input.pdf</code>
            </td>
            <td class="py-2.5 pr-4">Seconds; deleted after qpdf normalize stage</td>
            <td class="py-2.5">No</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Normalized intermediate PDF</td>
            <td class="py-2.5 pr-4">
              <code class="font-mono">data/remediation/&lt;jobId&gt;/work/normalized.pdf</code>
            </td>
            <td class="py-2.5 pr-4">Seconds; deleted after OpenDataLoader tag stage</td>
            <td class="py-2.5">No</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Remediated tagged PDF (output)</td>
            <td class="py-2.5 pr-4">
              <code class="font-mono">data/remediation/&lt;jobId&gt;.pdf</code>
            </td>
            <td class="py-2.5 pr-4">First download OR 30 minutes (whichever first)</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Remediation job row (metadata only)</td>
            <td class="py-2.5 pr-4">
              SQLite,
              <code class="font-mono">remediation_jobs</code> table
            </td>
            <td class="py-2.5 pr-4">30 days after completion</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">REMEDIATION.JOB_ROW_RETENTION_DAYS</code>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Lifecycle events (audit trail)</td>
            <td class="py-2.5 pr-4">
              SQLite,
              <code class="font-mono">remediation_events</code> table
            </td>
            <td class="py-2.5 pr-4">7 years (default)</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">REMEDIATION.EVENT_LOG_RETENTION_DAYS</code>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">
              Usage log — audits and refused-upload attempts (no file content)
            </td>
            <td class="py-2.5 pr-4">SQLite, <code class="font-mono">audit_log</code> table</td>
            <td class="py-2.5 pr-4">365 days (default)</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS</code>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">
              Nightly database backup snapshots (same metadata as the tables above — never any file
              content, because none is stored to begin with)
            </td>
            <td class="py-2.5 pr-4">
              Server filesystem, beside the application checkout but outside it (<code
                class="font-mono"
                >~/audit.icjia.app/backups</code
              >)
            </td>
            <td class="py-2.5 pr-4">The 5 newest snapshots; older ones deleted by rotation</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">BACKUP_KEEP_COUNT</code>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Shared reports (audit results only)</td>
            <td class="py-2.5 pr-4">
              SQLite,
              <code class="font-mono">shared_reports</code> table
            </td>
            <td class="py-2.5 pr-4">
              Link stops working 365 days from share creation; the stored row is deleted by the
              cleanup sweep roughly 30 days after that (≈395 days total)
            </td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">SHARED_REPORTS.EXPIRY_DAYS</code>
            </td>
          </tr>
          <tr>
            <td class="py-2.5 pr-4 font-medium">OTP authentication codes</td>
            <td class="py-2.5 pr-4">SQLite, <code class="font-mono">otp_codes</code> table</td>
            <td class="py-2.5 pr-4">15 minutes (single-use)</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">AUTH.OTP_EXPIRY_MINUTES</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
      Retention periods marked "configurable" can be adjusted in the source configuration file
      (<code class="text-xs font-mono">audit.config.ts</code>) before deployment. The defaults shown
      represent the standing posture for the production deployment; any deployment running modified
      values publishes those values in its own deployment notes.
    </p>
    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
      A <strong>periodic cleanup sweep</strong> runs every 5 minutes within the API process and on
      every API startup — regardless of whether the optional remediation feature is enabled (tool
      v1.51.0+). It performs eight tasks idempotently: expire outputs past
      <code class="text-xs font-mono">expires_at</code>; mark stuck jobs as failed; remove orphan
      directories; purge old <code class="text-xs font-mono">remediation_jobs</code> rows; purge old
      <code class="text-xs font-mono">remediation_events</code> rows; purge
      <code class="text-xs font-mono">audit_log</code> rows past their 365-day retention; purge
      expired revoked sign-in tokens; and delete
      <code class="text-xs font-mono">shared_reports</code> rows roughly 30 days after their link
      expires. Source:
      <code class="text-xs font-mono">apps/api/src/services/remediationCleanup.ts</code>.
    </p>
    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
      <strong>Backups interact with retention honestly:</strong> only the 5 newest nightly snapshots
      are kept (tool v1.49.0 and newer), so with one snapshot per night a row deleted by any purge
      above persists inside a snapshot for roughly 5 further days before it is gone everywhere.
      Snapshots contain exactly the database tables listed in this section — no file content,
      because none is ever stored in the database.
    </p>
  </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 7. Retention periods by data category. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

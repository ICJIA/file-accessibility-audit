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
            <td class="py-2.5 pr-4 font-medium">Audit log (plain audits, no file content)</td>
            <td class="py-2.5 pr-4">SQLite, <code class="font-mono">audit_log</code> table</td>
            <td class="py-2.5 pr-4">Indefinite (purgeable on request)</td>
            <td class="py-2.5">By admin request</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">Shared reports (audit results only)</td>
            <td class="py-2.5 pr-4">
              SQLite,
              <code class="font-mono">shared_reports</code> table
            </td>
            <td class="py-2.5 pr-4">365 days from share creation</td>
            <td class="py-2.5">
              Yes —
              <code class="font-mono">SHARED_REPORTS.EXPIRY_DAYS</code>
            </td>
          </tr>
          <tr>
            <td class="py-2.5 pr-4 font-medium">OTP authentication codes</td>
            <td class="py-2.5 pr-4">SQLite, <code class="font-mono">otp_codes</code> table</td>
            <td class="py-2.5 pr-4">10 minutes (single-use)</td>
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
      every API startup. It performs five tasks idempotently: expire outputs past
      <code class="text-xs font-mono">expires_at</code>; mark stuck jobs as failed; remove orphan
      directories; purge old <code class="text-xs font-mono">remediation_jobs</code> rows; purge old
      <code class="text-xs font-mono">remediation_events</code> rows. Source:
      <code class="text-xs font-mono">apps/api/src/services/remediationCleanup.ts</code>.
    </p>
  </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 7. Retention periods by data category. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

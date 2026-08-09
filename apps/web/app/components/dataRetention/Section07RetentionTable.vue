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
              On the same server, in a dedicated backups directory beside — but outside — the
              application, unreachable from the web
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

    <!-- 7a. The question this page has to answer out loud.
         A reader who has just been told "your file is never stored" and then
         meets a row about nightly backups concludes one of the two is untrue.
         The resolution is that they describe different things — the document
         versus the service's record of having checked it — which is not
         deducible from the retention table above, so it is drawn rather than
         implied. Two lanes: one ends in "discarded", one ends in "backed up". -->
    <div id="backups-explained" class="scroll-mt-8 mt-10">
      <h3 class="text-lg font-bold text-[var(--text-heading)] mb-2">
        7a. Why anything is backed up when documents aren't stored
      </h3>
      <p class="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed max-w-3xl">
        Because two different things are involved, and only one of them is kept. Your
        <strong>document</strong> is never saved. The service's <strong>record</strong> that a
        document was checked is — that record is what an agency shows when it has to prove what it
        reviewed and when. The nightly backup protects the record.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Lane A: the document. Red matches § 8's "Never stored" card, so a
             reader who has seen that section already knows what red means. -->
        <div class="rounded-xl border border-red-700/40 bg-red-950/15 p-5 flex flex-col">
          <h4 class="text-sm font-semibold uppercase tracking-wider text-red-300 mb-1">
            Your document
          </h4>
          <p class="text-xs text-[var(--text-muted)] mb-4">
            the PDF, Word, PowerPoint or Excel file
          </p>
          <ol class="space-y-3 text-xs text-[var(--text-secondary)] flex-1">
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-red-900/50 text-red-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >1</span
              >
              <span>You upload it. It is held in the server's memory only.</span>
            </li>
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-red-900/50 text-red-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >2</span
              >
              <span>It is read and scored against the accessibility rules.</span>
            </li>
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-red-900/50 text-red-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >3</span
              >
              <span>It is discarded when the response is sent — seconds later.</span>
            </li>
          </ol>
          <p
            class="mt-4 pt-3 border-t border-red-700/30 text-xs font-semibold text-red-200 leading-relaxed"
          >
            <span aria-hidden="true">✕</span> Never written to disk, so it cannot be in a backup —
            there is nothing to copy.
          </p>
        </div>

        <!-- Lane B: the record. Emerald matches § 8's "Stored" card. -->
        <div class="rounded-xl border border-emerald-700/40 bg-emerald-950/15 p-5 flex flex-col">
          <h4 class="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-1">
            The record of the audit
          </h4>
          <p class="text-xs text-[var(--text-muted)] mb-4">
            one line of metadata in the service's own logbook
          </p>
          <ol class="space-y-3 text-xs text-[var(--text-secondary)] flex-1">
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >1</span
              >
              <span
                >One row of metadata is written: date, file name, score, grade — a record
                <em>about</em> the document, never a copy of any part of it.</span
              >
            </li>
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >2</span
              >
              <span>It stays so an agency can show what it checked and when.</span>
            </li>
            <li class="flex gap-3">
              <span
                class="shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-200 font-bold flex items-center justify-center"
                aria-hidden="true"
                >3</span
              >
              <span>It is deleted on the schedule in the table above (365 days).</span>
            </li>
          </ol>
          <p
            class="mt-4 pt-3 border-t border-emerald-700/30 text-xs font-semibold text-emerald-200 leading-relaxed"
          >
            <span aria-hidden="true">✓</span> This — and only this — is what the nightly backup
            copies.
          </p>
        </div>
      </div>

      <p
        class="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/15 px-5 py-4 text-sm text-[var(--text-secondary)] leading-relaxed"
      >
        <strong class="text-[var(--text-heading)]">Bottom line:</strong> a backup could not
        reproduce one page of anyone's document. It is a copy of the logbook — audit metadata — not
        of the files that passed through it. If every snapshot were handed to a stranger, they would
        learn which file names were checked, when, and what they scored — not what any document
        said. For auditors, the precise claim matters: this policy never claims the records are free
        of personal detail. Of the metadata kept, the personal fields are named in §&nbsp;7 and
        §&nbsp;8 — the sign-in email for people who signed in, the connection log's IP address and
        browser identifier (purged after 365 days), and the file name as uploaded, which can itself
        name a person. What the records never hold is the document, or anything read from inside it.
      </p>

      <!-- The honest counterweight. A page that claimed "no personal data" here
           would be wrong in three specific ways, and being caught on any one of
           them would discredit everything else on this page. -->
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed max-w-3xl">
        <strong class="text-[var(--text-heading)]"
          >What personal details the record does contain:</strong
        >
        a sign-in email address for anyone who signed in; the routine connection log every web
        server keeps (IP address and browser name, deleted after 365 days); and the
        <em>file name</em> as uploaded — so a file named after a person stores that person's name. A
        report someone chose to <em>save or share</em> also quotes short labels from inside the
        document — image alt text, link wording, bookmark titles, the document's own title and
        author fields — because the findings have to point at what to fix (§ 8a). Never the pages
        themselves. The complete accounting is in
        <a href="#stored" class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >§ 8, What is and isn't stored</a
        >.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 7. Retention periods by data category. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

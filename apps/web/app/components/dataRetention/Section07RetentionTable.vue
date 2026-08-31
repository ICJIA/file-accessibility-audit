<template>
  <!-- 7. Retention table -->
  <section id="retention-table" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      7. Retention periods by data category
    </h2>
    <!-- v1.96.0: the one 13-row wall became three grouped tables (user
         request — clearer, more visually distinct). Grouping follows the
         page's existing color language: red = the document itself (never
         kept), emerald = the service's own records (metadata, kept on a
         schedule), sky = systems adjacent to the application. Every fact
         string is carried over verbatim — activityExportPolicy.test.ts and
         tableSemantics.test.ts pin rows and table semantics. The chip in the
         retention column is the scannable headline; the sentence beside it
         is the precise claim. -->
    <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
      Three groups, by what the data <em>is</em>: the document you upload (held seconds, never
      kept), the service's own records about audits (metadata only, kept on the schedules below),
      and systems adjacent to this application (the host's web server and ICJIA's self-hosted
      page-view counter).
    </p>

    <!-- Group 1: the document itself -->
    <div class="rounded-xl border border-red-700/40 overflow-hidden mb-4">
      <p
        class="px-4 py-2.5 bg-red-950/20 text-xs font-semibold uppercase tracking-wider text-red-300"
      >
        The document itself — held seconds to minutes, never kept
      </p>
      <div class="overflow-x-auto" tabindex="0">
        <table class="w-full text-sm">
          <caption class="sr-only">
            The uploaded document and its remediation intermediates: where each briefly exists,
            maximum retention, and whether it's configurable
          </caption>
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)] text-xs">
              <th scope="col" class="px-4 py-2 font-medium">Data category</th>
              <th scope="col" class="px-4 py-2 font-medium">Where stored</th>
              <th scope="col" class="px-4 py-2 font-medium">Maximum retention</th>
              <th scope="col" class="px-4 py-2 font-medium">Configurable</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)] text-xs">
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Uploaded document (audit) — PDF, Word, PowerPoint, or Excel
              </td>
              <td class="px-4 py-3">
                Server memory only (a PDF additionally uses a short-lived qpdf temp copy, deleted
                same request; Word/PowerPoint/Excel analysis never touches disk)
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >Seconds</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Discarded after the HTTP response</span
                >
              </td>
              <td class="px-4 py-3">No</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">Uploaded PDF (remediation input)</td>
              <td class="px-4 py-3">
                <code class="font-mono">data/remediation/&lt;jobId&gt;/work/input.pdf</code>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >Seconds</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Deleted after qpdf normalize stage</span
                >
              </td>
              <td class="px-4 py-3">No</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">Normalized intermediate PDF</td>
              <td class="px-4 py-3">
                <code class="font-mono">data/remediation/&lt;jobId&gt;/work/normalized.pdf</code>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >Seconds</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Deleted after OpenDataLoader tag stage</span
                >
              </td>
              <td class="px-4 py-3">No</td>
            </tr>
            <tr>
              <td class="px-4 py-3 font-medium">Remediated tagged PDF (output)</td>
              <td class="px-4 py-3">
                <code class="font-mono">data/remediation/&lt;jobId&gt;.pdf</code>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >≤ 30 min</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >First download OR 30 minutes (whichever first)</span
                >
              </td>
              <td class="px-4 py-3">
                Yes —
                <code class="font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Group 2: the service's own records -->
    <div class="rounded-xl border border-emerald-700/40 overflow-hidden mb-4">
      <p
        class="px-4 py-2.5 bg-emerald-950/20 text-xs font-semibold uppercase tracking-wider text-emerald-300"
      >
        Application records — metadata only, never file content
      </p>
      <div class="overflow-x-auto" tabindex="0">
        <table class="w-full text-sm">
          <caption class="sr-only">
            The service's own records about audits and remediations: where each is stored, maximum
            retention, and whether it's configurable
          </caption>
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)] text-xs">
              <th scope="col" class="px-4 py-2 font-medium">Data category</th>
              <th scope="col" class="px-4 py-2 font-medium">Where stored</th>
              <th scope="col" class="px-4 py-2 font-medium">Maximum retention</th>
              <th scope="col" class="px-4 py-2 font-medium">Configurable</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)] text-xs">
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">Remediation job row (metadata only)</td>
              <td class="px-4 py-3">
                SQLite,
                <code class="font-mono">remediation_jobs</code> table
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >30 days</span
                >
                <span class="block mt-1 text-[var(--text-muted)]">After completion</span>
              </td>
              <td class="px-4 py-3">
                Yes —
                <code class="font-mono">REMEDIATION.JOB_ROW_RETENTION_DAYS</code>
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">Lifecycle events (audit trail)</td>
              <td class="px-4 py-3">
                SQLite,
                <code class="font-mono">remediation_events</code> table
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >7 years</span
                >
                <span class="block mt-1 text-[var(--text-muted)]">(default)</span>
              </td>
              <td class="px-4 py-3">
                Yes —
                <code class="font-mono">REMEDIATION.EVENT_LOG_RETENTION_DAYS</code>
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Usage log — audits, failed audits, and refused-upload attempts (no file content)
              </td>
              <td class="px-4 py-3">SQLite, <code class="font-mono">audit_log</code> table</td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >365 days</span
                >
                <span class="block mt-1 text-[var(--text-muted)]">(default)</span>
              </td>
              <td class="px-4 py-3">
                Yes —
                <code class="font-mono">SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS</code>
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Daily activity files — one CSV per calendar day (Central time), derived from the
                usage log and holding the same fields (no file content)
              </td>
              <td class="px-4 py-3">
                On the same server, in <code class="font-mono">logs/</code> at the application's
                root — beside the code, outside the web root, unreachable from the web; not part of
                the nightly backup
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >365 days</span
                >
                <span class="mt-1 text-[var(--text-muted)]">— the usage log's window</span>
              </td>
              <td class="px-4 py-3">
                Yes — <code class="font-mono">SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS</code> (shared
                with the usage log; there is no separate setting)
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Application error log — what the service writes to its own error output: a
                timestamp, the operation that failed, the error message and stack trace (no file
                content)
              </td>
              <td class="px-4 py-3">
                On the same server, in <code class="font-mono">logs/</code> at the application's
                root, one file per day; not part of the nightly backup; never served
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >30 days</span
                >
              </td>
              <td class="px-4 py-3">
                Yes — <code class="font-mono">ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS</code>
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Nightly database backup snapshots (same metadata as the tables above — never any
                file content, because none is stored to begin with)
              </td>
              <td class="px-4 py-3">
                On the same server, in a dedicated backups directory beside — but outside — the
                application, unreachable from the web
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >5 newest</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >The 5 newest snapshots; older ones deleted by rotation</span
                >
              </td>
              <td class="px-4 py-3">
                Yes — <code class="font-mono">BACKUP_KEEP_COUNT</code> (backup script environment
                variable, default 5 — not in <code class="font-mono">audit.config.ts</code>)
              </td>
            </tr>
            <tr>
              <td class="px-4 py-3 font-medium">Shared reports (audit results only)</td>
              <td class="px-4 py-3">
                SQLite,
                <code class="font-mono">shared_reports</code> table
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >≈395 days</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Link stops working 365 days from share creation; the stored row is deleted by the
                  cleanup sweep roughly 30 days after that (≈395 days total)</span
                >
              </td>
              <td class="px-4 py-3">
                Yes — <code class="font-mono">SHARED_REPORTS.EXPIRY_DAYS</code> (the link's 365
                days) + <code class="font-mono">SHARED_REPORTS.PURGE_GRACE_DAYS</code> (the ≈30-day
                grace before the row is deleted)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Group 3: adjacent systems -->
    <div class="rounded-xl border border-sky-700/40 overflow-hidden">
      <p
        class="px-4 py-2.5 bg-sky-950/20 text-xs font-semibold uppercase tracking-wider text-sky-300"
      >
        Adjacent systems — outside this application
      </p>
      <div class="overflow-x-auto" tabindex="0">
        <table class="w-full text-sm">
          <caption class="sr-only">
            Systems adjacent to the application (the host web server and the self-hosted analytics
            counter): where each stores data, maximum retention, and whether it's configurable
          </caption>
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)] text-xs">
              <th scope="col" class="px-4 py-2 font-medium">Data category</th>
              <th scope="col" class="px-4 py-2 font-medium">Where stored</th>
              <th scope="col" class="px-4 py-2 font-medium">Maximum retention</th>
              <th scope="col" class="px-4 py-2 font-medium">Configurable</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)] text-xs">
            <tr class="border-b border-[var(--border)]/40">
              <td class="px-4 py-3 font-medium">
                Host web-server access log (nginx — outside this application; IP address, timestamp,
                URL path, status, browser user-agent; see § 8a)
              </td>
              <td class="px-4 py-3">
                <code class="font-mono">/var/log/nginx/</code> on the server, managed by the host's
                logrotate — never readable from the web
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
                  >≈52 days</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Rotated daily, 52 rotations kept (≈52 days)</span
                >
              </td>
              <td class="px-4 py-3">Yes — host logrotate config (not this application)</td>
            </tr>
            <tr>
              <td class="px-4 py-3 font-medium">
                Page-view analytics (self-hosted Plausible — outside this application; per view:
                page URL, referrer, browser and operating-system family, device type,
                country/region. Never a cookie, never a stored IP address or user-agent, never
                anything about an uploaded document; see § 8, § 9)
              </td>
              <td class="px-4 py-3">
                ICJIA's own Plausible server (<code class="font-mono">plausible.icjia.cloud</code>,
                a DigitalOcean droplet ICJIA runs itself). The visitor's browser reports directly to
                it; this application's server never receives or forwards the data, and no commercial
                analytics provider is involved
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-block whitespace-nowrap rounded-full border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300"
                  >No auto-purge</span
                >
                <span class="block mt-1 text-[var(--text-muted)]"
                  >Kept as anonymous visit statistics with no automatic purge; the salted hash
                  Plausible uses to link one day's page views rotates every 24 hours, so activity
                  can never be connected across days or across sites</span
                >
              </td>
              <td class="px-4 py-3">
                Yes — <code class="font-mono">ANALYTICS</code> in
                <code class="font-mono">audit.config.ts</code> (an empty
                <code class="font-mono">PLAUSIBLE_HOST</code> removes the counting script entirely)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
      <code class="text-xs font-mono">audit_log</code> rows past their 365-day retention; delete
      <code class="text-xs font-mono">shared_reports</code> rows roughly 30 days after their link
      expires; and write the previous day's activity file, deleting activity files past the same
      365-day window, and delete application error-log files past their 30-day window (tool
      v1.88.0+). Source:
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
        <strong>document</strong> is never saved. What is kept is
        <strong>metadata about the audit</strong> — data about the file, never the file: a note that
        a document with this name was checked on this date and received this grade. That metadata is
        what an agency shows when it has to prove what it reviewed and when, and it says nothing
        about <em>who</em> did the checking — the service has no accounts, no sign-in, and no column
        anywhere for an email address, an IP address, or a browser identifier. The nightly backup
        protects that metadata.
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
            The audit metadata
          </h4>
          <p class="text-xs text-[var(--text-muted)] mb-4">
            one line in the service's own logbook — data about the file, never the file
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
        reproduce one page of anyone's document, and could not say who audited anything. It is a
        copy of the logbook — audit metadata — not of the files or the people that passed through
        it. If every snapshot were handed to a stranger, they would learn which file names were
        checked, when, and what they scored — not what any document said, and not who brought it.
        For auditors, the precise claim matters: this policy still never claims the metadata is free
        of personal detail. The one personal thing it can carry is the
        <em>file name as uploaded</em> — a file named after a person stores that person's name — and
        a <em>saved or shared</em> report quotes short labels from inside the document (§&nbsp;8a).
        What no row can carry any more is an email address, an IP address, or a browser identifier:
        since tool v1.68.0 the database schema has no such columns, there are no accounts and no
        sign-in, and the caller's address is used only in server memory to rate-limit requests,
        written nowhere.
      </p>

      <!-- The honest counterweight. A page that claimed "no personal data" here
           would still be wrong in two specific ways, and being caught on either
           would discredit everything else on this page. -->
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed max-w-3xl">
        <strong class="text-[var(--text-heading)]"
          >What personal details the metadata can still contain:</strong
        >
        the <em>file name</em> as uploaded — so a file named after a person stores that person's
        name — and, for a report someone chose to <em>save or share</em>, short quoted labels from
        inside the document: image alt text, link wording, heading text, bookmark titles, the
        document's own title and author fields, and a short excerpt (up to 80 characters) from any
        box of text the document tags as an image — because the findings have to point at what to
        fix (§ 8a). Never the pages themselves, and never who uploaded anything: there is no account
        to record, and the schema has no email, IP-address, or browser column to fill. The complete
        accounting is in
        <a href="#stored" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
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

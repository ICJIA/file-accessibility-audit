<template>
  <!-- 8a. Storage verification (dated evidence annex for § 8) -->
  <section id="storage-verification" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      8a. Storage verification — the evidence for § 8
    </h2>

    <div class="rounded-xl border-2 border-blue-700/40 bg-blue-950/15 p-5 sm:p-6 mb-5">
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
        <strong
          >Audited 2026-08-05, against the source code at tool v1.49.0; re-verified 2026-08-09
          against tool v1.68.0</strong
        >
        after the identifier-removal release (accounts, sign-in, and every email / IP-address /
        user-agent column removed; migration 11 dropped the columns and their existing data from the
        live database). Section 8 above states what is and isn't stored. This section is the proof:
        a complete, dated inventory of every place the application can write data — every database
        table, every statement that inserts into one, every file the server creates, everything its
        process logs can contain — each verified by direct inspection of the code, with the code
        quoted. It exists so that a manager, records officer, or external auditor does not have to
        take § 8 on trust.
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        <strong>Method.</strong> The entire database schema was read (<code
          class="text-xs font-mono"
          >apps/api/src/db/migrations.ts</code
        >
        — the only file that creates tables); every
        <code class="text-xs font-mono">INSERT</code>/<code class="text-xs font-mono">UPDATE</code>
        in the server code was enumerated and traced to what flows into it; every filesystem write
        (<code class="text-xs font-mono">writeFile</code>,
        <code class="text-xs font-mono">createWriteStream</code>, temp files) was enumerated; the
        dependency list was checked for request loggers; and every
        <code class="text-xs font-mono">console.*</code> call that lands in the process log was
        reviewed. Anyone can repeat this: the repository is public, and the verification is a
        handful of <code class="text-xs font-mono">grep</code> commands over
        <code class="text-xs font-mono">apps/api/src</code>.
      </p>
    </div>

    <!-- The database -->
    <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">
      The entire database, table by table
    </h3>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
      The application has exactly <strong>four tables</strong>, all created in one file. None has a
      BLOB (binary) column — a search of the whole server codebase finds no binary column type
      anywhere, so the database is <em>structurally incapable</em> of holding file bytes. There is
      also <strong>no identity anywhere</strong>: since tool v1.68.0 there are no accounts and no
      sign-in, and no table has a column for an email address, an IP address, or a browser
      user-agent — the columns were removed from the schema itself, not merely left unwritten.
    </p>
    <div class="overflow-x-auto mb-4" tabindex="0">
      <table class="w-full text-sm">
        <caption class="sr-only">
          Every database table: name, purpose, and which columns hold user-supplied data
        </caption>
        <thead>
          <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
            <th scope="col" class="py-2 pr-4 font-medium">Table</th>
            <th scope="col" class="py-2 pr-4 font-medium">Purpose</th>
            <th scope="col" class="py-2 font-medium">User-supplied data it can hold</th>
          </tr>
        </thead>
        <tbody class="text-[var(--text-secondary)] text-xs">
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-mono">audit_log</td>
            <td class="py-2.5 pr-4">
              Usage metadata (audits + refused uploads); gates remediation
            </td>
            <td class="py-2.5">filename (sanitized, 512-char clamp), content hash</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-mono">shared_reports</td>
            <td class="py-2.5 pr-4">Reports someone chose to share, or fleet/URL audit reports</td>
            <td class="py-2.5">
              filename (or audited URL), the report itself —
              <strong>see the nuance below</strong>
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-mono">remediation_jobs</td>
            <td class="py-2.5 pr-4">Remediation job lifecycle (metadata only, 30-day rows)</td>
            <td class="py-2.5">
              filenames, content hash, before/after report JSON (same nuance below)
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-mono">remediation_events</td>
            <td class="py-2.5 pr-4">Append-only auditor receipt per job (§ 6)</td>
            <td class="py-2.5">sanitized filename + byte size on the "received" event</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
      The usage-metadata table's complete effective definition (baseline from
      <code class="text-xs font-mono">apps/api/src/db/migrations.ts</code>, plus migration 2's
      <code class="text-xs font-mono">content_hash</code> and minus the identity columns migration
      11 dropped) — note there is nowhere for document content, or for an identity, to go:
    </p>
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border)] px-4 py-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto mb-4"
      tabindex="0"
    >
CREATE TABLE audit_log (          -- shape after migration 11 (v1.68.0)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  filename TEXT,
  score INTEGER,
  grade TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  content_hash TEXT
);</pre>

    <!-- Files -->
    <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">
      Uploaded files live and die in memory
    </h3>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
      The upload handler is configured with memory storage — there is no upload directory to write
      to. Verbatim, from
      <code class="text-xs font-mono">apps/api/src/middleware/uploadMiddleware.ts</code>:
    </p>
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border)] px-4 py-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto mb-3"
      tabindex="0"
    >
const storage = multer.memoryStorage();
...
export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },</pre>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
      An exhaustive search for filesystem writes across the whole API produces
      <strong>eight sites, all accounted for</strong>: the database directory itself, the
      remediation pipeline's working files (§ 3 — deleted mid-job with deletion verified), the two
      short-lived analysis temp copies below, and the cleanup sweep's own deletions. There is no
      <code class="text-xs font-mono">createWriteStream</code> anywhere in the server code, no
      cache, and no other write. The two analysis tools that need a file path get a temp copy under
      a <em>random name</em> (the user's filename never appears on disk), deleted in a
      <code class="text-xs font-mono">finally</code> block so failure cannot leak it — from
      <code class="text-xs font-mono">packages/analyzer/src/qpdfService.ts</code> (veraPDF uses the
      identical pattern in
      <code class="text-xs font-mono">apps/api/src/services/veraPdfBuffer.ts</code>):
    </p>
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border)] px-4 py-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto mb-3"
      tabindex="0"
    >
const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
try {
  fs.writeFileSync(tmpPath, buffer);
  const stdout = await execQpdfAsync(tmpPath);
  ...
} finally {
  try { fs.unlinkSync(tmpPath); } catch {}
}</pre>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
      Word, PowerPoint, and Excel files never touch disk at all: the in-memory buffer crosses to a
      short-lived analysis child process over an inter-process channel (<code
        class="text-xs font-mono"
        >packages/analyzer/src/ooxmlRunner.ts</code
      >) — no temp file exists on that path to delete.
    </p>

    <!-- The nuance -->
    <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">
      The one nuance: a shared report quotes small parts of your document
    </h3>
    <div class="rounded-xl border border-amber-700/40 bg-amber-950/15 p-5 sm:p-6 mb-4">
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        A plain audit — upload, read the results, close the tab — stores only the metadata row shown
        above: filename, score, grade, hash. But when a report is
        <em>saved</em> (you click share, or a report is created by the URL/fleet audit paths, or a
        remediation job stores its before/after reports), the stored report includes the findings
        text — and
        <strong>findings can quote short strings copied from inside the document</strong>, because
        naming the problem requires showing it. Specifically: the document's own metadata (title,
        author, subject, keywords, creator/producer), image alt-text values, link text and link
        destinations, bookmark titles, form-field <em>names</em>, and font names. For example, the
        alt-text check quotes each image's alt text so a reader can judge it (<code
          class="text-xs font-mono"
          >packages/analyzer/src/scoring/pdf.ts</code
        >):
      </p>
      <pre
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border)] px-4 py-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto mb-3"
        tabindex="0"
      >
findings.push(`  ${label}: "${fig.altText || "(empty alt)"}"`);
...
findings.push(`  "${link.text.trim()}" → ${link.url}`);</pre>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        What is <strong>never</strong> in a stored report, verified against every finding the
        scorers can produce: page or paragraph text, images, form-field <em>values</em>, or any raw
        file bytes. Headings are recorded as levels (H1, H2 …), not their text — except where a
        heading also appears as a bookmark title. Web-page audit reports store CSS selectors for
        failing elements, never page HTML (the code deliberately drops the HTML snippet field the
        underlying engine offers).
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        A shared report is retrievable by its unguessable 128-bit random ID, its link stops working
        365 days after creation, the stored row itself is deleted by the cleanup sweep roughly 30
        days after that (§ 7, tool v1.51.0+), and remediation job rows carrying the same report JSON
        are purged after 30 days. If a document is sensitive enough that its alt text, link URLs, or
        bookmark titles are themselves confidential,
        <strong>audit it without sharing the report</strong> — the plain audit path stores none of
        this.
      </p>
    </div>

    <!-- Logs -->
    <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">
      What the server's own logs can contain
    </h3>
    <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-4">
      <li>
        <strong>No request logging exists in the application.</strong> The dependency list contains
        no request logger (no morgan, pino, winston, or bunyan), and no middleware writes
        per-request lines. The process log accumulates: startup banners, cleanup-sweep counts, and
        error stack traces. Every <code class="text-xs font-mono">console.*</code>
        call in the server was reviewed: in production, none interpolates a filename, an address, or
        any document content.
      </li>
      <li>
        <strong>No email can leave the server at all</strong> — tool v1.68.0 removed the sign-in
        system, which was the only thing that ever sent mail, along with the mail-sending code and
        its credentials. There is no mailer left to misuse.
      </li>
      <li>
        <strong>The hosting layer keeps standard web-server access logs.</strong> The site runs
        behind nginx, which — as on effectively every website — records each request's IP address,
        timestamp, URL path, status, and browser user-agent in its own log files on the server,
        outside this application. It is stated here, with its retention listed in § 7, so the phrase
        "standard web-server logs" is concrete rather than a hedge.
      </li>
    </ul>

    <!-- Verdict table -->
    <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">Verdict on each § 8 claim</h3>
    <div class="overflow-x-auto mb-4" tabindex="0">
      <table class="w-full text-sm">
        <caption class="sr-only">
          Verification verdict for each claim in section 8, with the evidence that supports it
        </caption>
        <thead>
          <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
            <th scope="col" class="py-2 pr-4 font-medium">Claim (§ 8)</th>
            <th scope="col" class="py-2 pr-4 font-medium">Verdict</th>
            <th scope="col" class="py-2 font-medium">Decisive evidence</th>
          </tr>
        </thead>
        <tbody class="text-[var(--text-secondary)] text-xs">
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">File content of audited documents is never stored</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              memory-only uploads; no BLOB column; all 8 filesystem writes accounted for
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">Remediation files deleted (download or 30-min limit)</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              input deleted mid-job, before completion; every deletion re-checked and the check
              recorded (§ 6)
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">Extracted text from documents is never stored</td>
            <td class="py-2.5 pr-4 text-amber-300 font-semibold">Qualified 2026-08-05</td>
            <td class="py-2.5">
              true for page/paragraph text; a <em>shared</em> report quotes alt text, link
              text/URLs, bookmark titles, metadata — § 8 now says so
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">Images and form-field values are never stored</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              no image bytes anywhere; form-field <em>names</em> can appear in findings, values
              never
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">No AI services, analytics, or trackers receive data</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">no such dependency or outbound call exists (§ 4)</td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">
              No email, IP address, or user-agent is stored anywhere (§ 7a's claim)
            </td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified 2026-08-09</td>
            <td class="py-2.5">
              true since tool v1.68.0 — migration 11 dropped the columns and their data; before that
              the usage log did store IP and user-agent (disclosed since policy v1.2, and still
              visible in snapshots until the keep-5 rotation ages them out, ≈5 days)
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">Filenames are sanitized before storage</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              sanitizer lives inside the writer (cannot be bypassed by a new caller) + 512-char
              clamp; remediation rows additionally keep the original name, length-limited
            </td>
          </tr>
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4">Raw tokens are never stored</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              download tokens SHA-256-hashed; raw values exist only in transit (login codes and
              API-token rows no longer exist at all — v1.68.0)
            </td>
          </tr>
          <tr>
            <td class="py-2.5 pr-4">No backups leave the server</td>
            <td class="py-2.5 pr-4 text-emerald-300 font-semibold">Verified</td>
            <td class="py-2.5">
              nightly snapshots (v1.49.0) stay on-server, outside the application directory, only
              the 5 newest kept (§ 7)
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-sm text-[var(--text-muted)] leading-relaxed">
      <strong>Limitations.</strong> This verification is a statement about the code as of tool
      v1.68.0, re-verified 2026-08-09 (first audited 2026-08-05 at v1.49.0), not a permanent
      guarantee; it is re-verified when data handling changes, and any change would appear in § 14's
      change log. The full technical evidence pack — every write site with file and line numbers —
      is preserved in the project repository's history for this release.
    </p>
  </section>
</template>

<script setup lang="ts">
// 8a. Storage verification — dated evidence annex for § 8, added 2026-08-05.
// Static content; no reactive state. Numbered "8a" deliberately: it belongs
// immediately after § 8, and renumbering §§ 9-15 (anchors, TOC, § references
// in the § 14 change-log entries) for a new section would churn the very
// cross-references corrected the same day.
</script>

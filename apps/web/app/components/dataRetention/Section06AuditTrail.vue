<template>
    <!-- 6. Audit trail -->
    <section id="audit-trail" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">6. Lifecycle audit trail</h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        Every remediation job produces an append-only series of timestamped events in the server's
        SQLite database file (<code class="text-xs font-mono">apps/api/data/audit.db</code>, table
        <code class="text-xs font-mono">remediation_events</code>). The same database also holds the
        lighter-weight audit log (<code class="text-xs font-mono">audit_log</code> table) for plain
        audit requests. Schemas:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
      >
        CREATE TABLE remediation_events ( id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT
        NULL, event TEXT NOT NULL, occurred_at INTEGER NOT NULL, -- milliseconds since Unix epoch
        details TEXT, -- JSON, content-free metadata only FOREIGN KEY (job_id) REFERENCES
        remediation_jobs(id) ); CREATE INDEX idx_remediation_events_job ON
        remediation_events(job_id, occurred_at); CREATE INDEX idx_remediation_events_event ON
        remediation_events(event); CREATE TABLE remediation_jobs ( id TEXT PRIMARY KEY, -- UUIDv4
        email TEXT, -- null when anonymous input_filename TEXT NOT NULL, content_hash TEXT, --
        SHA-256 of input bytes page_count INTEGER, status TEXT NOT NULL, --
        pending/running/complete/failed/expired step TEXT, progress_pct INTEGER DEFAULT 0,
        input_score REAL, -- pre-flight audit score output_score REAL, -- post-remediation audit
        score output_valid INTEGER, -- 1 = qpdf --check passed output_path TEXT, -- absolute path on
        disk, only when complete download_token_hash TEXT, -- SHA-256 of raw token failure_reason
        TEXT, verapdf_available INTEGER, verapdf_passed INTEGER, verapdf_summary_json TEXT,
        input_audit_json TEXT, -- full pre-flight ScoringResult output_audit_json TEXT, -- full
        post-remediation ScoringResult created_at INTEGER NOT NULL, completed_at INTEGER, expires_at
        INTEGER NOT NULL );
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 mb-3 leading-relaxed">
        <strong>The closed set of event types</strong> emitted per job is:
      </p>
      <div
        class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] font-mono mb-3"
      >
        <span>received</span>
        <span>processing_started</span>
        <span>normalize_complete</span>
        <span>input_deleted</span>
        <span>tagging_complete</span>
        <span>intermediate_deleted</span>
        <span>validation_passed</span>
        <span>validation_failed</span>
        <span>verapdf_passed</span>
        <span>verapdf_failed</span>
        <span>verapdf_unavailable</span>
        <span>output_ready</span>
        <span>downloaded</span>
        <span>output_deleted</span>
        <span class="text-emerald-400">verified_absent</span>
        <span>verify_failed</span>
        <span>expired</span>
        <span>error</span>
      </div>

      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        <strong
          >The <code class="text-xs font-mono">verified_absent</code> event is the critical
          compliance signal.</strong
        >
        It is emitted only after the worker (or the cleanup sweep, or the download handler) calls
        <code class="text-xs font-mono">fs.unlink()</code> followed by
        <code class="text-xs font-mono">fs.stat()</code> on the deleted path, and receives an
        <code class="text-xs font-mono">ENOENT</code>
        (no-such-entity) response — definitively confirming the file no longer exists on the
        filesystem. If
        <code class="text-xs font-mono">fs.stat()</code> returns any other result (file still
        present, permission error, etc.), a
        <code class="text-xs font-mono">verify_failed</code> event is recorded instead, indicating a
        compliance anomaly that must be investigated.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        File paths in event payloads are stored as
        <strong>SHA-256 hashes</strong>, not raw strings. This keeps the payload uniform-length,
        resistant to log-scraping, and ensures the audit trail cannot accidentally reveal directory
        structure or user identifiers via path strings.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        A sample event payload (the
        <code class="text-xs font-mono">details</code> JSON for a
        <code class="text-xs font-mono">verified_absent</code> event):
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
      >
        { "path_hash": "a3f5e7d2c4b6a8e9f1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7" }
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        The audit trail is intentionally <strong>append-only</strong>: no application code path
        overwrites or deletes individual event rows. Rows are purged only by the periodic cleanup
        sweep after they exceed the retention period (see § 7), which executes a single
        <code class="text-xs font-mono">DELETE</code> statement bounded by an age cutoff. Anomalies
        — for example, a job that completed without a corresponding
        <code class="text-xs font-mono">verified_absent</code>
        event — are visible to any auditor running a sentinel query.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 6. Lifecycle audit trail. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

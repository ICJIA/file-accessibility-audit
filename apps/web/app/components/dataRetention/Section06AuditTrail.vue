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
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] overflow-x-auto"
      tabindex="0"
    >
<span class="text-sky-300">CREATE TABLE</span> remediation_events (
  id          <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">PRIMARY KEY AUTOINCREMENT</span>,
  job_id      <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>,
  event       <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>,
  occurred_at <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">NOT NULL</span>,   <span class="text-[var(--text-muted)]">-- milliseconds since Unix epoch</span>
  details     <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- JSON, content-free metadata only</span>
  <span class="text-sky-300">FOREIGN KEY</span> (job_id) <span class="text-sky-300">REFERENCES</span> remediation_jobs(id)
);
<span class="text-sky-300">CREATE INDEX</span> idx_remediation_events_job   <span class="text-sky-300">ON</span> remediation_events(job_id, occurred_at);
<span class="text-sky-300">CREATE INDEX</span> idx_remediation_events_event <span class="text-sky-300">ON</span> remediation_events(event);

<span class="text-sky-300">CREATE TABLE</span> remediation_jobs (
  id                   <span class="text-purple-300">TEXT</span> <span class="text-sky-300">PRIMARY KEY</span>,   <span class="text-[var(--text-muted)]">-- UUIDv4</span>
  input_filename       <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>,      <span class="text-[var(--text-muted)]">-- sanitized</span>
  original_filename    <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- as offered, length-clamped only</span>
  content_hash         <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- SHA-256 of input bytes</span>
  page_count           <span class="text-purple-300">INTEGER</span>,
  status               <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>
    <span class="text-sky-300">CHECK</span> (status <span class="text-sky-300">IN</span> ('pending','running','complete','failed','expired')),
  step                 <span class="text-purple-300">TEXT</span>,
  progress_pct         <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">DEFAULT</span> 0,
  input_score          <span class="text-purple-300">REAL</span>,               <span class="text-[var(--text-muted)]">-- pre-flight audit score</span>
  output_score         <span class="text-purple-300">REAL</span>,               <span class="text-[var(--text-muted)]">-- post-remediation audit score</span>
  output_valid         <span class="text-purple-300">INTEGER</span>,            <span class="text-[var(--text-muted)]">-- 1 = qpdf --check passed</span>
  output_path          <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- absolute path, only while complete</span>
  download_token_hash  <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- SHA-256 of raw token</span>
  failure_reason       <span class="text-purple-300">TEXT</span>,
  input_audit_json     <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- full pre-flight report</span>
  output_audit_json    <span class="text-purple-300">TEXT</span>,               <span class="text-[var(--text-muted)]">-- full post-remediation report</span>
  verapdf_available    <span class="text-purple-300">INTEGER</span>,
  verapdf_passed       <span class="text-purple-300">INTEGER</span>,
  verapdf_summary_json <span class="text-purple-300">TEXT</span>,
  created_at           <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">NOT NULL</span>,
  completed_at         <span class="text-purple-300">INTEGER</span>,
  expires_at           <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">NOT NULL</span>
);</pre>
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
        >The <code class="text-xs font-mono">verified_absent</code> event is the critical compliance
        signal.</strong
      >
      It is emitted only after the worker (or the cleanup sweep, or the download handler) calls
      <code class="text-xs font-mono">fs.unlink()</code> followed by
      <code class="text-xs font-mono">fs.stat()</code> on the deleted path, and receives an
      <code class="text-xs font-mono">ENOENT</code>
      (no-such-entity) response — definitively confirming the file no longer exists on the
      filesystem. If
      <code class="text-xs font-mono">fs.stat()</code> returns any other result (file still present,
      permission error, etc.), a <code class="text-xs font-mono">verify_failed</code> event is
      recorded instead, indicating a compliance anomaly that must be investigated.
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
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] overflow-x-auto"
      tabindex="0"
    >
{
  "path_hash": "a3f5e7d2c4b6a8e9f1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7"
}</pre>
    <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
      The audit trail is intentionally <strong>append-only</strong>: no application code path
      overwrites or deletes individual event rows. Rows are purged only by the periodic cleanup
      sweep after they exceed the retention period (see § 7), which executes a single
      <code class="text-xs font-mono">DELETE</code> statement bounded by an age cutoff. Anomalies —
      for example, a job that completed without a corresponding
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

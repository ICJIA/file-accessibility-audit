<template>
  <!-- 11. Right to inspect -->
  <section id="inspect" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      11. Right to inspect &amp; verify
    </h2>
    <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
      Authorized agency staff — including managers, records-retention officers, and accessibility
      auditors — can inspect the lifecycle of any specific remediation job by querying the SQLite
      database directly. Sample queries for common compliance questions:
    </p>
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
      tabindex="0"
    >
<span class="text-[var(--text-muted)]">-- All remediations in a date range (jobs carry no user identity)</span>
<span class="text-sky-300">SELECT</span> id, input_filename, status, input_score, output_score,
       datetime(created_at/1000,   'unixepoch', 'localtime') <span class="text-sky-300">AS</span> started,
       datetime(completed_at/1000, 'unixepoch', 'localtime') <span class="text-sky-300">AS</span> finished
<span class="text-sky-300">FROM</span> remediation_jobs
<span class="text-sky-300">WHERE</span> created_at <span class="text-sky-300">BETWEEN</span> ? <span class="text-sky-300">AND</span> ?
<span class="text-sky-300">ORDER BY</span> created_at <span class="text-sky-300">DESC</span>;

<span class="text-[var(--text-muted)]">-- Full lifecycle of a specific job</span>
<span class="text-sky-300">SELECT</span> event, datetime(occurred_at/1000, 'unixepoch', 'localtime') <span class="text-sky-300">AS</span> at, details
<span class="text-sky-300">FROM</span> remediation_events
<span class="text-sky-300">WHERE</span> job_id = ?
<span class="text-sky-300">ORDER BY</span> occurred_at;

<span class="text-[var(--text-muted)]">-- Sentinel: any job whose output was retained past the 30-minute TTL</span>
<span class="text-sky-300">SELECT</span> j.id, j.input_filename,
       (e.max_at - j.completed_at) / 60000 <span class="text-sky-300">AS</span> extra_minutes_on_disk
<span class="text-sky-300">FROM</span> remediation_jobs j
<span class="text-sky-300">JOIN</span> (
  <span class="text-sky-300">SELECT</span> job_id, <span class="text-sky-300">MAX</span>(occurred_at) <span class="text-sky-300">AS</span> max_at
  <span class="text-sky-300">FROM</span> remediation_events
  <span class="text-sky-300">WHERE</span> event <span class="text-sky-300">IN</span> (<span class="text-purple-300">'output_deleted'</span>, <span class="text-purple-300">'verified_absent'</span>)
  <span class="text-sky-300">GROUP BY</span> job_id
) e <span class="text-sky-300">ON</span> e.job_id = j.id
<span class="text-sky-300">WHERE</span> j.status <span class="text-sky-300">IN</span> ('expired', 'complete')
  <span class="text-sky-300">AND</span> (e.max_at - j.completed_at) &gt; 30 * 60 * 1000;
<span class="text-emerald-300">-- This query should return ZERO ROWS for a properly-functioning system.</span>

<span class="text-[var(--text-muted)]">-- Sentinel: any deletion that wasn't verified absent</span>
<span class="text-sky-300">SELECT</span> job_id, occurred_at
<span class="text-sky-300">FROM</span> remediation_events
<span class="text-sky-300">WHERE</span> event = <span class="text-purple-300">'output_deleted'</span>
  <span class="text-sky-300">AND NOT EXISTS</span> (
    <span class="text-sky-300">SELECT</span> 1 <span class="text-sky-300">FROM</span> remediation_events e2
    <span class="text-sky-300">WHERE</span> e2.job_id = remediation_events.job_id
      <span class="text-sky-300">AND</span> e2.event = <span class="text-purple-300">'verified_absent'</span>
      <span class="text-sky-300">AND</span> e2.occurred_at &gt;= remediation_events.occurred_at
  );
<span class="text-emerald-300">-- This query should ALSO return ZERO ROWS.</span></pre>
    <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
      A Phase 3 roadmap item adds a
      <strong>manager-facing verification endpoint</strong> that accepts a filename or a file's
      SHA-256 hash and reports whether the file was ever audited or remediated, with full
      timestamps. The underlying <code class="text-xs font-mono">content_hash</code> column has been
      populated on every audit and remediation since v1.18.0 in preparation for that feature. Until
      that endpoint ships, equivalent information is available via direct database query as shown
      above.
    </p>
    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
      Whoever started a remediation can also see its complete receipt by returning to the result
      page with the job's download token (URL pattern:
      <code class="text-xs font-mono"
        >https://audit.icjia.app/remediate/&lt;jobId&gt;?t=&lt;token&gt;</code
      >
      — the token is issued once, when the job is created). Without the token the server answers
      404, deliberately: jobs carry no owner identity, so the token is the only key, and a wrong key
      must not even confirm the job exists. The receipt shows every lifecycle event with
      human-readable labels, including the verified-deletion event.
    </p>
  </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 11. Right to inspect & verify. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

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
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
      >
        -- All remediations a specific user performed in a date range SELECT id, input_filename,
        status, input_score, output_score, datetime(created_at/1000, 'unixepoch', 'localtime') AS
        started, datetime(completed_at/1000, 'unixepoch', 'localtime') AS finished FROM
        remediation_jobs WHERE email = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC; --
        Full lifecycle of a specific job SELECT event, datetime(occurred_at/1000, 'unixepoch',
        'localtime') AS at, details FROM remediation_events WHERE job_id = ? ORDER BY occurred_at;
        -- Sentinel: any job whose output was retained past the 30-minute TTL SELECT j.id,
        j.input_filename, (e.max_at - j.completed_at) / 60000 AS extra_minutes_on_disk FROM
        remediation_jobs j JOIN ( SELECT job_id, MAX(occurred_at) AS max_at FROM remediation_events
        WHERE event IN ('output_deleted', 'verified_absent') GROUP BY job_id ) e ON e.job_id = j.id
        WHERE j.status IN ('expired', 'complete') AND (e.max_at - j.completed_at) > 30 * 60 * 1000;
        -- This query should return ZERO ROWS for a properly-functioning system. -- Sentinel: any
        deletion that wasn't verified absent SELECT job_id, occurred_at FROM remediation_events
        WHERE event = 'output_deleted' AND NOT EXISTS ( SELECT 1 FROM remediation_events e2 WHERE
        e2.job_id = remediation_events.job_id AND e2.event = 'verified_absent' AND e2.occurred_at
        &gt;= remediation_events.occurred_at ); -- This query should ALSO return ZERO ROWS.
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        A Phase 3 roadmap item adds a
        <strong>manager-facing verification endpoint</strong> that accepts a filename or a file's
        SHA-256 hash and reports whether the file was ever audited or remediated, with full
        timestamps. The underlying <code class="text-xs font-mono">content_hash</code> column has
        been populated on every audit and remediation since v1.18.0 in preparation for that feature.
        Until that endpoint ships, equivalent information is available via direct database query as
        shown above.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        A user can also see their own complete remediation receipt by visiting the result page for
        any of their jobs (URL pattern:
        <code class="text-xs font-mono">https://audit.icjia.app/remediate/&lt;jobId&gt;</code>). The
        receipt shows every lifecycle event with human-readable labels, including the
        verified-deletion event.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 11. Right to inspect & verify. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

<template>
    <!-- 3. Remediation pipeline -->
    <section id="remediation-flow" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        3. Remediation pipeline (optional, gated)
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        The remediation pipeline is disabled by default. It can be enabled by setting
        <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code>
        in the server's environment. When enabled, a new
        <em>Attempt remediation</em> action appears on the audit results page. Clicking it triggers
        the following lifecycle:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
      >
        Client → HTTPS multipart upload (re-upload required by design) │ ▼ [validate] magic bytes,
        size cap, page count cap (500 pages) │ ▼ [create remediation_jobs row] • status: 'pending' •
        email (if logged in) • content_hash: SHA-256 of input bytes • download_token: 32-byte
        random, sha256-hashed at rest │ ▼ [write input →
        data/remediation/&lt;jobId&gt;/work/input.pdf] (mode 0600) │ ▼ [spawn detached worker: tsx
        src/jobs/remediate.ts &lt;jobId&gt;] │ ▼ (API responds 202 to client; worker runs
        independently) │ [Stage 1: preparing] • qpdf --object-streams=disable input.pdf →
        normalized.pdf • DELETE input.pdf + fs.stat verify ENOENT • Emit lifecycle event:
        'normalize_complete', 'input_deleted', 'verified_absent' │ ▼ [Stage 2: tagging] •
        OpenDataLoader convert(normalized.pdf) → tagged.pdf • DELETE normalized.pdf + fs.stat verify
        ENOENT • Emit events: 'tagging_complete', 'intermediate_deleted', 'verified_absent' │ ▼
        [Stage 3: validating] • qpdf --check tagged.pdf → must not report warnings • veraPDF
        --flavour ua1 tagged.pdf → conformance verdict (informational) • Emit: 'validation_passed'
        OR 'validation_failed' + 'verapdf_passed'/'verapdf_failed'/'verapdf_unavailable' │ ▼ [Stage
        4: comparing] • Re-audit tagged.pdf → output score • If Overall OR Strict score regresses:
        REJECT │ ▼ (success branch) [Move tagged.pdf → data/remediation/&lt;jobId&gt;.pdf (final,
        mode 0600)] [update job: status='complete', expires_at = NOW + 30 min] [Emit:
        'output_ready'] │ ▼ Client polls /api/remediate/&lt;jobId&gt;/status; sees 'complete' │ ▼
        Client downloads via single-use token: [stream output via createReadStream + pipe(res)] → on
        response 'close': DELETE output.pdf + fs.stat verify ENOENT → Emit: 'downloaded',
        'output_deleted', 'verified_absent' → job status → 'expired' (token invalidated; concurrent
        requests get 410) │ ▼ (or, if no download in 30 minutes) [Cleanup sweep deletes output.pdf +
        fs.stat verify ENOENT] [Emit: 'expired', 'output_deleted', 'verified_absent'] ALL OUTCOMES →
        final state: zero PDF artifacts on disk.
      </div>

      <div class="mt-4">
        <DiagramFigure
          name="remediation-pipeline"
          title="Remediation pipeline — visual flow"
          desc="Flowchart of the remediation pipeline. Eleven steps from upload through final delete + verify. Every intermediate file is deleted before the next stage starts, and every delete is fs.stat-verified."
        />
      </div>

      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        <strong>Key invariants of the remediation pipeline:</strong>
      </p>
      <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1.5">
        <li>
          At any instant during the pipeline,
          <strong>at most one copy of the PDF exists on disk</strong>. The input is deleted before
          the normalized intermediate is written for downstream stages; the normalized intermediate
          is deleted before the tagged output is finalized; the tagged output is deleted on first
          download or after 30 minutes.
        </li>
        <li>
          The entire scratch directory (<code class="text-xs font-mono"
            >data/remediation/&lt;jobId&gt;/work/</code
          >) is removed in a <code class="text-xs font-mono">finally</code> block regardless of
          pipeline outcome — including crashes, errors, and rejected outputs. A worker crash
          mid-pipeline triggers cleanup on API restart (see § 9).
        </li>
        <li>
          The remediated output is served via a
          <strong>one-time download token</strong>. The token is generated as 32 cryptographically
          random bytes and stored on the job row only as its SHA-256 hash (the raw token is never
          stored). A successful download invalidates the token immediately, before the file contents
          are streamed, so any concurrent or repeat request receives
          <code class="text-xs font-mono">410 Gone</code>.
        </li>
        <li>
          The remediation pipeline <strong>does not cache the PDF</strong>
          between audit and remediation. Clicking "Remediate" triggers a fresh multipart upload —
          the just-audited buffer is not preserved. This is a deliberate UX-vs-privacy trade-off
          that costs the user one extra upload click in exchange for a stricter retention posture.
        </li>
        <li>
          The pipeline runs <strong>entirely on the ICJIA-controlled server</strong>. No PDF content
          is transmitted to external services, cloud APIs, or AI models — see § 4.
        </li>
      </ul>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 3. Remediation pipeline. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

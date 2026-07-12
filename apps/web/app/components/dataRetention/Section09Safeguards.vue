<template>
    <!-- 9. Security safeguards -->
    <section id="safeguards" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        9. Security &amp; technical safeguards
      </h2>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
        <li>
          <strong>HTTPS / TLS 1.2+</strong> on all transport between client and server. The
          production deployment uses certificates issued by Let's Encrypt and renewed automatically.
        </li>
        <li>
          <strong>HTTP-only cookies</strong> for authentication, with
          <code class="text-xs font-mono">SameSite=Strict</code> set to prevent cross-site request
          forgery.
        </li>
        <li>
          <strong>Restrictive filesystem permissions</strong> on remediation data:
          <code class="text-xs font-mono">0700</code> on directories,
          <code class="text-xs font-mono">0600</code> on output files. Only the process owner can
          read these files.
        </li>
        <li>
          <strong>Unguessable identifiers</strong>: job IDs are UUIDv4 (122 bits of cryptographic
          entropy); download tokens are 32-byte random base64url-encoded strings.
        </li>
        <li>
          <strong>Constant-time-ish token comparison</strong>: download tokens are compared via
          byte-wise XOR over fixed-length SHA-256 hashes, mitigating timing side channels.
        </li>
        <li>
          <strong>Content-based file-type validation</strong> on uploads: the file's actual bytes —
          never its filename or declared MIME type — must match a supported format. A PDF must begin
          with the five bytes <code class="text-xs font-mono">%PDF-</code>; a Word, PowerPoint, or
          Excel upload must be a well-formed ZIP (OOXML) package whose internal parts confirm which
          of the three it is. Anything else is rejected immediately.
        </li>
        <li>
          <strong>File size cap</strong>: 15 MB for the audit pipeline, 50 MB for the remediation
          pipeline (configurable).
        </li>
        <li>
          <strong>Page count cap</strong>: 500 pages for remediation (configurable). Pathological
          PDFs with thousands of pages are rejected before any processing.
        </li>
        <li>
          <strong>JVM memory cap</strong> on the OpenDataLoader child process: 768 MB heap via
          <code class="text-xs font-mono">JAVA_TOOL_OPTIONS=-Xmx768m</code>
          to bound resource consumption.
        </li>
        <li>
          <strong>Wall-clock timeout</strong> on the remediation worker: 5 minutes (configurable).
          The JVM child is killed on overrun.
        </li>
        <li>
          <strong>Per-user concurrency limit</strong>: 1 remediation job at a time per user
          (configurable).
        </li>
        <li><strong>Rate limiting</strong> on upload endpoints to prevent abuse.</li>
        <li>
          <strong>Encrypted PDFs are rejected</strong> with a clear error before any analysis is
          attempted.
        </li>
        <li>
          <strong>Cleanup on startup</strong>: when the API restarts, a sweep reconciles disk vs
          database — jobs stuck in "running" for over 10 minutes are marked failed; orphan files
          with no matching database row are removed.
        </li>
        <li>
          <strong>Regression guard on remediation</strong>: the output PDF is rejected if its
          overall or Strict (WCAG + IITAA §E205.4) score regresses relative to the input. The user
          never sees an output that would make any visible metric worse.
        </li>
      </ul>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 9. Security & technical safeguards. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

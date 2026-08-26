<template>
  <!-- 2. Audit pipeline -->
  <section id="audit-flow" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      2. Audit pipeline (always available)
    </h2>
    <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
      When a user uploads a file — PDF, Word, PowerPoint, or Excel — for auditing, it is processed
      entirely in volatile server memory. No copy is written to disk at any point during the audit
      pipeline, regardless of format.
    </p>
    <pre
      class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] overflow-x-auto"
      tabindex="0"
    >
Client → HTTPS upload (multipart/form-data)
  │
  ▼
[multer.memoryStorage()] — buffer in API process memory
  │
  ▼
[validate file]
  - Content-based type check: PDF ('%PDF-' signature) or a ZIP package
    confirmed as Word / PowerPoint / Excel (OOXML) — never the filename
    or declared MIME type
  - File size limit: 25 MB (configurable; rejected if exceeded)
  │
  ▼
[analyzeDocument(buffer, filename)] — detects format, dispatches:
  ├── PDF → analyzePDF(), on the main API process
  │     • qpdf subprocess: structure tree, language, outlines, tables
  │     • pdfjs (Node.js library): text, metadata, page order
  │
  └── Word / PowerPoint / Excel → a dedicated, short-lived child
        Node.js process (buffer handed over a local, in-memory channel;
        killed if analysis runs past its timeout)
        • JSZip: unzips the OOXML container
        • fast-xml-parser: parses the XML parts
  │
  ▼
[scorer] — WCAG-aligned categories, weighted overall score
  │
  ▼
HTTP response → client (typically &lt; 10 seconds total)
  │
  ▼
Node.js garbage collector reclaims the buffer
(file no longer exists in any form, anywhere)</pre>

    <div class="mt-4">
      <DiagramFigure
        name="audit-pipeline"
        title="Audit pipeline — visual flow"
        desc="Flowchart of the audit pipeline. The uploaded file — PDF, Word, PowerPoint, or Excel — is held in memory and validated by its content, not its filename. A PDF is analyzed by qpdf (via a short-lived temp copy, deleted in the same request) and by pdfjs reading the buffer directly; a Word, PowerPoint, or Excel file is unzipped and parsed by JSZip and fast-xml-parser inside a dedicated, short-lived child process with no disk access. Results are scored across WCAG-aligned categories, and the memory buffer is discarded after the response is sent."
      />
    </div>

    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
      Once the HTTP response has been sent, the in-memory buffer is unreferenced and
      garbage-collected by the Node.js runtime in the next collection cycle. For a PDF, the qpdf
      analyzer (a command-line tool that needs a file path) works from a short-lived, randomly named
      temp copy that is deleted within the same request, even when analysis fails. When veraPDF (the
      PDF/UA validator) is configured, a PDF audit also writes its own short-lived, randomly named
      temp copy — separate from qpdf's, but following the same pattern and lifecycle — so veraPDF
      can produce the PDF/UA machine-check verdict (PDF/UA-1, or PDF/UA-2 when the document declares
      it), and that copy is likewise deleted within the same request, even when the check fails. For
      a Word, PowerPoint, or Excel file, analysis runs inside a dedicated child Node.js process —
      spawned fresh for that request and terminated immediately afterward — which unzips and parses
      the in-memory buffer directly with JSZip and fast-xml-parser (see § 5); no temporary file is
      ever created for these formats. Since v1.100.0 the web page usually drives an audit through a
      progress variant of this same pipeline (it shows per-step status while you wait); the one
      retention difference is that the finished report — the same result the synchronous path
      returns, never the file — waits in server process memory until the page collects it, for at
      most 10 minutes, and delivery removes it immediately. The uploaded file's own lifetime is
      unchanged. In every case, the uploaded content does not persist on disk, in a cache, in a log
      file, or in any other location. The only thing a browser-upload audit produces is metadata in
      the
      <code class="text-xs font-mono">audit_log</code> table — described in § 8 — data about the
      file, never the file, and nothing about the caller (event type, filename, score, grade,
      timestamp, and SHA-256 hash of the file's bytes; the schema has no email, IP-address, or
      browser column — tool v1.68.0). Since tool v1.46.0 a <em>refused</em> upload also writes one
      row: the file name it was offered under (sanitized) and a timestamp, with no content hash,
      score, or grade — the file is never accepted, so there is nothing to hash or score.
    </p>
    <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
      <strong>Encrypted PDFs are rejected.</strong> A password-protected PDF cannot be analyzed
      without the password; the tool returns a clear error before any analysis is attempted, and the
      file is discarded immediately. The same applies to formats the tool recognizes but cannot
      audit: legacy binary Office files (.doc, .xls, .ppt, .rtf) and CSV/TSV exports are refused
      with a specific explanation — detected from the file's content, so a renamed file gets the
      right message — and the file is never accepted.
    </p>
  </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 2. Audit pipeline. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

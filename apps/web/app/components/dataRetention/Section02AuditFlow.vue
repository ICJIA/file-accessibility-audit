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
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
      >
        Client → HTTPS upload (multipart/form-data) │ ▼ [multer.memoryStorage()] — buffer in API
        process memory │ ▼ [validate file] - Content-based type check: PDF ('%PDF-' signature) or a
        ZIP package confirmed as Word / PowerPoint / Excel (OOXML) — never the filename or declared
        MIME type - File size limit: 15 MB (configurable; rejected if exceeded) │ ▼
        [analyzeDocument(buffer, filename)] — detects format, dispatches: ├── PDF → analyzePDF(), on
        the main API process │ • qpdf subprocess: structure tree, language, outlines, tables │ •
        pdfjs (Node.js library): text, metadata, page order │ └── Word / PowerPoint / Excel → a
        dedicated, short-lived child Node.js process (buffer handed over a local, in-memory channel;
        killed if analysis runs past its timeout) • JSZip: unzips the OOXML container •
        fast-xml-parser: parses the XML parts │ ▼ [scorer] — WCAG-aligned categories, weighted
        overall score │ ▼ HTTP response → client (typically &lt; 10 seconds total) │ ▼ Node.js
        garbage collector reclaims the buffer (file no longer exists in any form, anywhere)
      </div>

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
        analyzer (a command-line tool that needs a file path) works from a short-lived, randomly
        named temp copy that is deleted within the same request, even when analysis fails. When
        veraPDF (the PDF/UA-1 validator) is configured, a PDF audit also writes its own short-lived,
        randomly named temp copy — separate from qpdf's, but following the same pattern and
        lifecycle — so veraPDF can produce the PDF/UA-1 machine-check verdict, and that copy is
        likewise deleted within the same request, even when the check fails. For a Word, PowerPoint, or
        Excel file, analysis runs inside a dedicated child Node.js process —
        spawned fresh for that request and terminated immediately afterward — which unzips and
        parses the in-memory buffer directly with JSZip and fast-xml-parser (see § 5); no temporary
        file is ever created for these formats. In every case, the uploaded content does not persist
        on disk, in a cache, in a log file, or in any other location. The only records produced by
        an audit are entries in the
        <code class="text-xs font-mono">audit_log</code> table — described in § 8 — which contain
        metadata only (filename, score, grade, email if logged in, timestamp, and SHA-256 hash of
        the file's bytes).
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        <strong>Encrypted PDFs are rejected.</strong> A password-protected PDF cannot be analyzed
        without the password; the tool returns a clear error before any analysis is attempted, and
        the file is discarded immediately.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 2. Audit pipeline. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

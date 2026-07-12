<template>
    <!-- 12. Glossary -->
    <section id="glossary" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        12. Glossary of technical terms
      </h2>
      <dl class="space-y-3 text-sm text-[var(--text-secondary)]">
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">Append-only audit log</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A database table whose rows are added but never modified or deleted by application code.
            Rows are removed only by an explicit retention-policy purge after a configured age.
            Append-only design ensures the audit trail is tamper-evident from inside the running
            system.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">ENOENT (Error: No such ENTity)</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            The error code returned by the operating system when a program asks for the status of a
            file that doesn't exist. The remediation worker uses an
            <code class="text-xs font-mono">fs.stat()</code> call expecting ENOENT after a delete —
            receiving any other response indicates the file is still present, which is treated as a
            compliance anomaly.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            <code class="font-mono">fs.stat()</code>
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A Node.js function that asks the operating system whether a file exists and, if so,
            returns its size, permissions, and timestamps. We use it specifically to confirm that a
            file has been deleted (we expect a "no such file" response).
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">OOXML</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            Office Open XML — the ZIP-of-XML file format used by Word (.docx), PowerPoint (.pptx),
            and Excel (.xlsx) files. The audit pipeline reads it by unzipping the container with
            <strong>JSZip</strong> and parsing its XML parts with <strong>fast-xml-parser</strong>,
            working only from the in-memory upload buffer — see § 5. No temporary file is written to
            disk.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">PDF/UA-1</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            ISO 14289-1: the technical specification for "accessible PDF." Defines the structural
            requirements (tags, language declaration, metadata) a PDF must meet to be considered
            conformant. Validated by veraPDF.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">Remediation</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            The process of taking an existing PDF and adding accessibility structure to it after the
            fact. Distinguished from accessible authoring, which produces a tagged PDF directly from
            a source document.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">SHA-256 hash</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A cryptographic function that turns any input into a fixed-length (64-character)
            hexadecimal string. The hash is one-way: you can compute the hash from the input, but
            not the input from the hash. We use it for two purposes here: (1) as a content
            fingerprint to identify whether two files are the same without storing the files
            themselves; (2) as a token comparison mechanism that resists timing attacks.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">Structure tree / tagged PDF</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            An optional second layer inside a PDF that describes the semantic role of each piece of
            content (heading, paragraph, figure, table cell). A PDF with this layer populated is
            called "tagged" and is readable by screen readers; one without it is "untagged" and is
            inaccessible. See the Technical Details dropdown on the audit page for a full primer.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">UUIDv4</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A version 4 universally unique identifier — a 36-character random string with 122 bits
            of entropy. We use UUIDv4s as job IDs so that no two remediation jobs ever share an
            identifier, and so that an attacker cannot guess a valid job ID by enumeration.
          </dd>
        </div>
      </dl>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 13. Glossary of technical terms. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

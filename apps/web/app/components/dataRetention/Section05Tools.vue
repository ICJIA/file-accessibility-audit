<template>
    <!-- 5. Tools -->
    <section id="tools" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        5. The open-source toolchain
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        Every tool involved in processing an uploaded document — PDF, Word, PowerPoint, or Excel —
        is open source, license-clear, and runs locally on the ICJIA-controlled server. No
        commercial PDF or Office-document SDK is licensed, and no per-document fees are paid. The
        tools are:
      </p>
      <div class="overflow-x-auto" tabindex="0">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
              <th class="py-2 pr-4 font-medium">Tool</th>
              <th class="py-2 pr-4 font-medium">Used for</th>
              <th class="py-2 pr-4 font-medium">License</th>
              <th class="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)]">
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-3 pr-4 font-mono text-xs">qpdf</td>
              <td class="py-3 pr-4 text-xs">
                PDF structure parsing (audit) and PDF normalization + validity checking
                (remediation)
              </td>
              <td class="py-3 pr-4 text-xs">Apache 2.0</td>
              <td class="py-3 text-xs">
                <a
                  href="https://qpdf.sourceforge.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >qpdf.sourceforge.io</a
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-3 pr-4 font-mono text-xs">pdfjs-dist</td>
              <td class="py-3 pr-4 text-xs">
                PDF text and metadata extraction (audit pipeline only)
              </td>
              <td class="py-3 pr-4 text-xs">Apache 2.0</td>
              <td class="py-3 text-xs">
                <a
                  href="https://github.com/mozilla/pdf.js"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >github.com/mozilla/pdf.js</a
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-3 pr-4 font-mono text-xs">JSZip</td>
              <td class="py-3 pr-4 text-xs">
                Unzips the Word / PowerPoint / Excel (OOXML) container (audit pipeline only)
              </td>
              <td class="py-3 pr-4 text-xs">MIT OR GPL-3.0</td>
              <td class="py-3 text-xs">
                <a
                  href="https://github.com/Stuk/jszip"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >github.com/Stuk/jszip</a
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-3 pr-4 font-mono text-xs">fast-xml-parser</td>
              <td class="py-3 pr-4 text-xs">
                Parses the XML parts inside a Word / PowerPoint / Excel file (audit pipeline only)
              </td>
              <td class="py-3 pr-4 text-xs">MIT</td>
              <td class="py-3 text-xs">
                <a
                  href="https://github.com/NaturalIntelligence/fast-xml-parser"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >github.com/NaturalIntelligence/fast-xml-parser</a
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-3 pr-4 font-mono text-xs">OpenDataLoader PDF</td>
              <td class="py-3 pr-4 text-xs">
                Rule-based PDF auto-tagging (remediation pipeline only)
              </td>
              <td class="py-3 pr-4 text-xs">Apache 2.0</td>
              <td class="py-3 text-xs">
                <a
                  href="https://github.com/opendataloader-project/opendataloader-pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >opendataloader-project</a
                >
                (ICJIA fork:
                <a
                  href="https://github.com/ICJIA/opendataloader-pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >ICJIA/opendataloader-pdf</a
                >)
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 font-mono text-xs">veraPDF</td>
              <td class="py-3 pr-4 text-xs">
                PDF/UA-1 (ISO 14289-1) conformance validation (remediation pipeline only; optional)
              </td>
              <td class="py-3 pr-4 text-xs">MPL 2.0</td>
              <td class="py-3 text-xs">
                <a
                  href="https://verapdf.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] hover:text-[var(--link-hover)]"
                  >verapdf.org</a
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        Each tool is invoked as a separate operating-system process (qpdf, OpenDataLoader, veraPDF),
        as a Node.js library running on the main API process (pdfjs-dist), or as a Node.js library
        running inside a dedicated, short-lived child process spawned for that one request (JSZip
        and fast-xml-parser, for Word, PowerPoint, and Excel). That child process receives the file
        buffer over a local, in-memory channel — never a temporary file — and is terminated if it
        exceeds its analysis timeout. None of these tools opens an outbound network connection
        during processing. Outbound network traffic from the API process during a remediation job is
        limited to the email server (Mailgun, used for OTP authentication of users only — not for
        any content transmission) and the database (local SQLite, no network).
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 5. The open-source toolchain. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

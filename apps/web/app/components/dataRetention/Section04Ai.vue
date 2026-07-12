<template>
    <!-- 4. AI usage -->
    <section id="ai" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">4. AI usage statement</h2>
      <div class="rounded-xl border-2 border-red-700/50 bg-red-950/15 p-6 sm:p-8">
        <p class="text-lg sm:text-xl font-bold text-red-300 mb-3">
          No artificial intelligence is used in this tool.
        </p>
        <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
          Specifically: no file content, no extracted text, no metadata, no filenames, no derivative
          artifacts, no diagnostic data, and no telemetry of any kind are transmitted to any
          artificial-intelligence service, large language model, vision model, or hosted machine
          learning API, including but not limited to:
        </p>
        <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1 mb-4">
          <li>OpenAI (ChatGPT, GPT-3.5, GPT-4, GPT-4o, embedding APIs)</li>
          <li>Anthropic (Claude family of models)</li>
          <li>Google (Gemini, Bard, PaLM, Vertex AI)</li>
          <li>Microsoft (Copilot, Azure OpenAI)</li>
          <li>Meta (Llama hosted endpoints)</li>
          <li>Amazon (Bedrock, SageMaker hosted endpoints)</li>
          <li>
            Any open-source model hosted by a third-party inference provider (Replicate, Modal,
            Hugging Face Inference API, etc.)
          </li>
          <li>Self-hosted machine-learning models on this server (none are loaded)</li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          The auto-remediation pipeline uses three open-source software tools (qpdf, OpenDataLoader
          PDF, veraPDF — see § 5), all of which operate on
          <strong>rule-based, deterministic algorithms</strong>. None of these tools load or run a
          machine-learning model at runtime. Their source code is publicly available and auditable.
        </p>
        <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          The audit pipeline — which covers all four supported formats — is built the same way: qpdf
          and pdfjs-dist read a PDF; JSZip and fast-xml-parser read a Word, PowerPoint, or Excel
          file (see § 5). Every one of these libraries is rule-based and deterministic; none of them
          loads or runs a machine-learning model, and none of them make an outbound network call.
        </p>
        <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          A future feature on the project roadmap (Phase 1, documented at
          <code class="text-xs font-mono"
            >docs/archive/pdf-remediation-alt-text-walkthrough-spec.md</code
          >) adds an interactive walkthrough that lets users manually author alt-text for figures in
          their remediated PDFs. This feature is
          <strong>specifically designed to be AI-free</strong> — the user types descriptions
          themselves, and the descriptions are written back into the PDF by the deterministic
          <code class="text-xs font-mono">pdf-lib</code>
          library. No AI suggestion, no autocomplete from a model, no inference of any kind.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong
            >Any future addition of AI features will be announced in this policy and in the public
            <a
              href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >changelog</a
            >
            before the feature is enabled in production</strong
          >, with a corresponding update to the policy version above.
        </p>
      </div>

      <div class="mt-5">
        <DiagramFigure
          name="no-ai"
          title="No AI services contacted"
          desc="Flowchart showing the ICJIA server talks only to local tools (qpdf, OpenDataLoader, veraPDF, SQLite) and Mailgun (for OTP codes only). It NEVER sends data to ChatGPT, Claude, Gemini, or Copilot."
        />
      </div>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 4. AI usage statement. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>

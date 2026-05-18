<script setup lang="ts">
// Public page — no auth middleware. Agency staff, auditors, lawyers,
// records-retention officers, and the general public should be able to
// read this without logging in.
import { useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'

definePageMeta({ middleware: [] })

const router = useRouter()
// When opened in a new tab from the footer link, browser history is
// empty — the back button has no useful destination. Detect that and
// link home instead.
const hasHistory = ref(false)
onMounted(() => {
  hasHistory.value = typeof window !== 'undefined' && window.history.length > 1
})

function goBack(): void {
  if (hasHistory.value) {
    router.back()
  } else {
    void router.push('/')
  }
}

useHead({
  title: 'Data Retention Policy',
  meta: [
    {
      name: 'description',
      content:
        'Auditor-ready data retention policy: how PDFs are stored, processed, and deleted; AI usage statement; lifecycle audit trail; retention periods; contact information.',
    },
  ],
})

const POLICY_VERSION = '1.0'
const POLICY_EFFECTIVE = '2026-05-18'
const TOOL_VERSION = '1.18.0'

</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10 space-y-10">
    <!-- Back navigation (works whether user opened in a new tab from
         the footer, navigated here directly, or arrived via a shared
         link). When history exists we use it; otherwise we land them
         on the home page. -->
    <nav class="-mb-4">
      <button
        type="button"
        class="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        @click="goBack"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        <span>{{ hasHistory ? 'Back' : 'Back to home' }}</span>
      </button>
    </nav>

    <!-- Header -->
    <header>
      <p
        class="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)] mb-3"
      >
        Policy · v{{ POLICY_VERSION }}
      </p>
      <h1
        class="text-3xl sm:text-5xl font-black text-[var(--text-heading)] leading-tight"
      >
        Data Retention Policy
      </h1>
      <p class="mt-4 text-sm text-[var(--text-muted)]">
        Effective <strong>{{ POLICY_EFFECTIVE }}</strong> · Applies to tool
        version <strong>{{ TOOL_VERSION }}</strong> and newer · This document is
        part of the open-source project source code and is version-controlled at
        <code class="text-xs font-mono"
          >apps/web/app/pages/data-retention.vue</code
        >.
      </p>
      <p class="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
        This policy describes how the ICJIA File Accessibility Audit tool
        ingests, processes, retains, and deletes PDF files and related
        metadata. It is intended for managers, records-retention officers,
        accessibility auditors, legal counsel, and other stakeholders who
        need a complete and accurate account of the tool's data handling.
        Technical details are included verbatim — vague language has been
        avoided in favor of precision.
      </p>
    </header>

    <!-- AT-A-GLANCE: No AI banner -->
    <section
      class="rounded-2xl border-2 border-red-700/50 bg-gradient-to-br from-red-950/30 to-red-950/10 p-6 sm:p-8 text-center"
    >
      <div
        class="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-red-700/60 bg-red-950/40 mb-4"
      >
        <svg
          class="w-8 h-8 sm:w-10 sm:h-10 text-red-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
      <p
        class="text-2xl sm:text-4xl font-black uppercase tracking-[0.15em] text-red-300 leading-tight mb-3"
      >
        No AI is used.
      </p>
      <p
        class="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto"
      >
        Your PDF is <strong>never</strong> sent to
        <strong>ChatGPT</strong>, <strong>GPT-4</strong>,
        <strong>GPT-4o</strong>, <strong>Claude</strong>,
        <strong>Gemini</strong>, <strong>Copilot</strong>, or any other
        artificial-intelligence service. No machine-learning model is loaded
        on this server. The tool uses rule-based, deterministic, open-source
        software exclusively. See § 4 below for the complete exclusion list.
      </p>
    </section>

    <!-- Infographic stats grid -->
    <section>
      <h2
        class="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4 text-center"
      >
        Key facts at a glance
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            PDFs retained after processing
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            ≤30 min
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Maximum remediation-output retention
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            AI services contacted
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Third-party data transmissions
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            100%
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Deletion verified via fs.stat
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            7 yr
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Audit-trail retention (configurable)
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            100%
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Open-source toolchain
          </p>
        </div>
        <div
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4"
        >
          <div
            class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2"
          >
            3
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Open-source tools (qpdf · ODL · veraPDF)
          </p>
        </div>
      </div>
    </section>

    <!-- Table of contents -->
    <section
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    >
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3"
      >
        Contents
      </h2>
      <ol class="space-y-1 text-sm text-[var(--text-secondary)]">
        <li><a href="#scope" class="text-[var(--link)] hover:text-[var(--link-hover)]">1. Scope &amp; applicable systems</a></li>
        <li><a href="#audit-flow" class="text-[var(--link)] hover:text-[var(--link-hover)]">2. Audit pipeline — how PDFs are handled when you click "Audit"</a></li>
        <li><a href="#remediation-flow" class="text-[var(--link)] hover:text-[var(--link-hover)]">3. Remediation pipeline — how PDFs are handled when you click "Remediate"</a></li>
        <li><a href="#ai" class="text-[var(--link)] hover:text-[var(--link-hover)]">4. AI usage statement (none)</a></li>
        <li><a href="#tools" class="text-[var(--link)] hover:text-[var(--link-hover)]">5. The open-source toolchain (qpdf · OpenDataLoader · veraPDF · pdfjs)</a></li>
        <li><a href="#audit-trail" class="text-[var(--link)] hover:text-[var(--link-hover)]">6. Lifecycle audit trail (the auditor's evidence)</a></li>
        <li><a href="#retention-table" class="text-[var(--link)] hover:text-[var(--link-hover)]">7. Retention periods by data category</a></li>
        <li><a href="#stored" class="text-[var(--link)] hover:text-[var(--link-hover)]">8. What is and isn't stored</a></li>
        <li><a href="#safeguards" class="text-[var(--link)] hover:text-[var(--link-hover)]">9. Security &amp; technical safeguards</a></li>
        <li><a href="#security-audits" class="text-[var(--link)] hover:text-[var(--link-hover)]">10. Security audit history (red/blue team reviews)</a></li>
        <li><a href="#inspect" class="text-[var(--link)] hover:text-[var(--link-hover)]">11. Right to inspect &amp; verify</a></li>
        <li><a href="#standards" class="text-[var(--link)] hover:text-[var(--link-hover)]">12. Standards &amp; compliance alignment</a></li>
        <li><a href="#glossary" class="text-[var(--link)] hover:text-[var(--link-hover)]">13. Glossary of technical terms</a></li>
        <li><a href="#change-log" class="text-[var(--link)] hover:text-[var(--link-hover)]">14. Change log for this policy</a></li>
        <li><a href="#contact" class="text-[var(--link)] hover:text-[var(--link-hover)]">15. Contact &amp; questions</a></li>
      </ol>
    </section>

    <!-- 1. Scope -->
    <section id="scope" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        1. Scope &amp; applicable systems
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        This policy applies to all PDF files processed by the ICJIA File
        Accessibility Audit tool — both the public production deployment at
        <code class="text-xs font-mono">https://audit.icjia.app</code> and any
        derivative deployment running the same source code. The infrastructure
        is hosted on <strong>DigitalOcean</strong> (a U.S.-based cloud
        provider), managed via <strong>Laravel Forge</strong>, and runs on a
        single virtual private server (VPS) located in a DigitalOcean data
        center. No content is replicated to external storage, content delivery
        networks, or backup services.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        Two distinct processing pipelines exist within the tool:
      </p>
      <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1.5">
        <li>
          The <strong>audit pipeline</strong> (always available) — analyzes a
          PDF for WCAG 2.1 AA / ADA Title II / Illinois IITAA accessibility
          conformance signals and returns a score and findings.
        </li>
        <li>
          The <strong>remediation pipeline</strong> (optional, gated by the
          server-side <code class="text-xs font-mono">REMEDIATION_ENABLED</code>
          environment flag) — produces a tagged, more-accessible version of
          the uploaded PDF.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        Both pipelines are described separately below because their data
        lifecycle differs. The audit pipeline operates entirely in memory; the
        remediation pipeline requires brief on-disk storage during processing,
        which is described in detail with corresponding deletion verification.
      </p>
    </section>

    <!-- 2. Audit pipeline -->
    <section id="audit-flow" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        2. Audit pipeline (always available)
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        When a user uploads a PDF for auditing, the file is processed entirely
        in volatile server memory. No copy is written to disk at any point
        during the audit pipeline.
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
      >Client → HTTPS upload (multipart/form-data)
       │
       ▼
[multer.memoryStorage()] — buffer in API process memory
       │
       ▼
[validate file]
  - Magic-byte check: file must start with '%PDF-'
  - File size limit: 15 MB (configurable; rejected if exceeded)
       │
       ▼
[analyzePDF(buffer, filename)] — runs synchronously
  ├── qpdf subprocess (file passed via stdin or temp pipe)
  │   • parses structure tree, language, outlines, images, tables
  └── pdfjs (Node.js library)
      • extracts text, metadata, per-page content order
       │
       ▼
[scorer] — 9 WCAG-aligned categories, weighted overall score
       │
       ▼
HTTP response → client (typically &lt; 10 seconds total)
       │
       ▼
Node.js garbage collector reclaims the buffer
(file no longer exists in any form, anywhere)</div>

      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        Once the HTTP response has been sent, the in-memory buffer is
        unreferenced and garbage-collected by the Node.js runtime in the next
        collection cycle. The PDF content does not persist on disk, in a
        cache, in a log file, or in any other location. The only records
        produced by an audit are entries in the
        <code class="text-xs font-mono">audit_log</code> table — described in
        § 8 — which contain metadata only (filename, score, grade, email if
        logged in, timestamp, and SHA-256 hash of the file's bytes).
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        <strong>Encrypted PDFs are rejected.</strong> A
        password-protected PDF cannot be analyzed without the password; the
        tool returns a clear error before any analysis is attempted, and the
        file is discarded immediately.
      </p>
    </section>

    <!-- 3. Remediation pipeline -->
    <section id="remediation-flow" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        3. Remediation pipeline (optional, gated)
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        The remediation pipeline is disabled by default. It can be enabled by
        setting <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code>
        in the server's environment. When enabled, a new
        <em>Auto-Remediate this PDF</em> action appears on the audit results
        page. Clicking it triggers the following lifecycle:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
      >Client → HTTPS multipart upload (re-upload required by design)
       │
       ▼
[validate] magic bytes, size cap, page count cap (500 pages)
       │
       ▼
[create remediation_jobs row]
  • status: 'pending'
  • email (if logged in)
  • content_hash: SHA-256 of input bytes
  • download_token: 32-byte random, sha256-hashed at rest
       │
       ▼
[write input → data/remediation/&lt;jobId&gt;/work/input.pdf]  (mode 0600)
       │
       ▼
[spawn detached worker: tsx src/jobs/remediate.ts &lt;jobId&gt;]
       │
       ▼  (API responds 202 to client; worker runs independently)
       │
[Stage 1: preparing]
  • qpdf --object-streams=disable input.pdf → normalized.pdf
  • DELETE input.pdf  +  fs.stat verify ENOENT
  • Emit lifecycle event: 'normalize_complete', 'input_deleted', 'verified_absent'
       │
       ▼
[Stage 2: tagging]
  • OpenDataLoader convert(normalized.pdf) → tagged.pdf
  • DELETE normalized.pdf  +  fs.stat verify ENOENT
  • Emit events: 'tagging_complete', 'intermediate_deleted', 'verified_absent'
       │
       ▼
[Stage 3: validating]
  • qpdf --check tagged.pdf  →  must not report warnings
  • veraPDF --flavour ua1 tagged.pdf  →  conformance verdict (informational)
  • Emit: 'validation_passed' OR 'validation_failed' + 'verapdf_passed'/'verapdf_failed'/'verapdf_unavailable'
       │
       ▼
[Stage 4: comparing]
  • Re-audit tagged.pdf  →  output score
  • If Overall, Strict, OR Practical score regresses: REJECT
       │
       ▼  (success branch)
[Move tagged.pdf → data/remediation/&lt;jobId&gt;.pdf (final, mode 0600)]
[update job: status='complete', expires_at = NOW + 30 min]
[Emit: 'output_ready']
       │
       ▼
Client polls /api/remediate/&lt;jobId&gt;/status; sees 'complete'
       │
       ▼
Client downloads via single-use token:
  [stream output via createReadStream + pipe(res)]
  → on response 'close': DELETE output.pdf + fs.stat verify ENOENT
  → Emit: 'downloaded', 'output_deleted', 'verified_absent'
  → job status → 'expired' (token invalidated; concurrent requests get 410)
       │
       ▼  (or, if no download in 30 minutes)
[Cleanup sweep deletes output.pdf + fs.stat verify ENOENT]
[Emit: 'expired', 'output_deleted', 'verified_absent']

ALL OUTCOMES → final state: zero PDF artifacts on disk.</div>

      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        <strong>Key invariants of the remediation pipeline:</strong>
      </p>
      <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1.5">
        <li>
          At any instant during the pipeline,
          <strong>at most one copy of the PDF exists on disk</strong>. The
          input is deleted before the normalized intermediate is written for
          downstream stages; the normalized intermediate is deleted before
          the tagged output is finalized; the tagged output is deleted on
          first download or after 30 minutes.
        </li>
        <li>
          The entire scratch directory
          (<code class="text-xs font-mono"
            >data/remediation/&lt;jobId&gt;/work/</code
          >)
          is removed in a <code class="text-xs font-mono">finally</code> block
          regardless of pipeline outcome — including crashes, errors, and
          rejected outputs. A worker crash mid-pipeline triggers cleanup on
          API restart (see § 9).
        </li>
        <li>
          The remediated output is served via a
          <strong>one-time download token</strong>. The token is generated as
          32 cryptographically random bytes and stored on the job row only as
          its SHA-256 hash (the raw token is never stored). A successful
          download invalidates the token immediately, before the file
          contents are streamed, so any concurrent or repeat request receives
          <code class="text-xs font-mono">410 Gone</code>.
        </li>
        <li>
          The remediation pipeline <strong>does not cache the PDF</strong>
          between audit and remediation. Clicking "Remediate" triggers a fresh
          multipart upload — the just-audited buffer is not preserved. This
          is a deliberate UX-vs-privacy trade-off that costs the user one
          extra upload click in exchange for a stricter retention posture.
        </li>
        <li>
          The pipeline runs <strong>entirely on the ICJIA-controlled
          server</strong>. No PDF content is transmitted to external services,
          cloud APIs, or AI models — see § 4.
        </li>
      </ul>
    </section>

    <!-- 4. AI usage -->
    <section id="ai" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        4. AI usage statement
      </h2>
      <div
        class="rounded-xl border-2 border-red-700/50 bg-red-950/15 p-6 sm:p-8"
      >
        <p class="text-lg sm:text-xl font-bold text-red-300 mb-3">
          No artificial intelligence is used in this tool.
        </p>
        <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
          Specifically: no PDF content, no extracted text, no metadata, no
          filenames, no derivative artifacts, no diagnostic data, and no
          telemetry of any kind are transmitted to any artificial-intelligence
          service, large language model, vision model, or hosted machine
          learning API, including but not limited to:
        </p>
        <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1 mb-4">
          <li>OpenAI (ChatGPT, GPT-3.5, GPT-4, GPT-4o, embedding APIs)</li>
          <li>Anthropic (Claude family of models)</li>
          <li>Google (Gemini, Bard, PaLM, Vertex AI)</li>
          <li>Microsoft (Copilot, Azure OpenAI)</li>
          <li>Meta (Llama hosted endpoints)</li>
          <li>Amazon (Bedrock, SageMaker hosted endpoints)</li>
          <li>Any open-source model hosted by a third-party inference provider (Replicate, Modal, Hugging Face Inference API, etc.)</li>
          <li>Self-hosted machine-learning models on this server (none are loaded)</li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          The auto-remediation pipeline uses three open-source software tools
          (qpdf, OpenDataLoader PDF, veraPDF — see § 5), all of which operate
          on <strong>rule-based, deterministic algorithms</strong>. None of
          these tools load or run a machine-learning model at runtime. Their
          source code is publicly available and auditable.
        </p>
        <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          A future feature on the project roadmap (Phase 1, documented at
          <code class="text-xs font-mono"
            >docs/pdf-remediation-alt-text-walkthrough-spec.md</code
          >)
          adds an interactive walkthrough that lets users manually author
          alt-text for figures in their remediated PDFs. This feature is
          <strong>specifically designed to be AI-free</strong> — the user
          types descriptions themselves, and the descriptions are written back
          into the PDF by the deterministic <code class="text-xs font-mono">pdf-lib</code>
          library. No AI suggestion, no autocomplete from a model, no
          inference of any kind.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>Any future addition of AI features will be announced in
          this policy and in the public
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >changelog</a
          >
          before the feature is enabled in production</strong>, with a
          corresponding update to the policy version above.
        </p>
      </div>

    </section>

    <!-- 5. Tools -->
    <section id="tools" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        5. The open-source toolchain
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        Every tool involved in processing PDFs is open source, license-clear,
        and runs locally on the ICJIA-controlled server. No commercial PDF SDK
        is licensed, and no per-document fees are paid. The tools are:
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-[var(--text-muted)] border-b border-[var(--border)]"
            >
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
                PDF structure parsing (audit) and PDF normalization
                + validity checking (remediation)
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
                PDF/UA-1 (ISO 14289-1) conformance validation
                (remediation pipeline only; optional)
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
        Each tool is invoked as a separate operating-system process
        (qpdf, OpenDataLoader, veraPDF) or as a Node.js library (pdfjs-dist),
        with input passed by file path or in-memory buffer. None of these
        tools opens an outbound network connection during processing. Outbound
        network traffic from the API process during a remediation job is
        limited to the email server (Mailgun, used for OTP authentication of
        users only — not for any content transmission) and the database
        (local SQLite, no network).
      </p>
    </section>

    <!-- 6. Audit trail -->
    <section id="audit-trail" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        6. Lifecycle audit trail
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        Every remediation job produces an append-only series of timestamped
        events in the server's SQLite database file
        (<code class="text-xs font-mono">apps/api/data/audit.db</code>, table
        <code class="text-xs font-mono">remediation_events</code>). The same
        database also holds the lighter-weight audit log
        (<code class="text-xs font-mono">audit_log</code> table) for plain
        audit requests. Schemas:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
      >CREATE TABLE remediation_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       TEXT    NOT NULL,
  event        TEXT    NOT NULL,
  occurred_at  INTEGER NOT NULL,     -- milliseconds since Unix epoch
  details      TEXT,                  -- JSON, content-free metadata only
  FOREIGN KEY (job_id) REFERENCES remediation_jobs(id)
);
CREATE INDEX idx_remediation_events_job ON remediation_events(job_id, occurred_at);
CREATE INDEX idx_remediation_events_event ON remediation_events(event);

CREATE TABLE remediation_jobs (
  id                  TEXT PRIMARY KEY,         -- UUIDv4
  email               TEXT,                      -- null when anonymous
  input_filename      TEXT NOT NULL,
  content_hash        TEXT,                      -- SHA-256 of input bytes
  page_count          INTEGER,
  status              TEXT NOT NULL,             -- pending/running/complete/failed/expired
  step                TEXT,
  progress_pct        INTEGER DEFAULT 0,
  input_score         REAL,                      -- pre-flight audit score
  output_score        REAL,                      -- post-remediation audit score
  output_valid        INTEGER,                   -- 1 = qpdf --check passed
  output_path         TEXT,                      -- absolute path on disk, only when complete
  download_token_hash TEXT,                      -- SHA-256 of raw token
  failure_reason      TEXT,
  verapdf_available   INTEGER,
  verapdf_passed      INTEGER,
  verapdf_summary_json TEXT,
  input_audit_json    TEXT,                      -- full pre-flight ScoringResult
  output_audit_json   TEXT,                      -- full post-remediation ScoringResult
  created_at          INTEGER NOT NULL,
  completed_at        INTEGER,
  expires_at          INTEGER NOT NULL
);</div>
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
        <strong>The <code class="text-xs font-mono">verified_absent</code>
        event is the critical compliance signal.</strong>
        It is emitted only after the worker (or the cleanup sweep, or the
        download handler) calls
        <code class="text-xs font-mono">fs.unlink()</code> followed by
        <code class="text-xs font-mono">fs.stat()</code> on the deleted path,
        and receives an
        <code class="text-xs font-mono">ENOENT</code>
        (no-such-entity) response — definitively confirming the file no
        longer exists on the filesystem. If
        <code class="text-xs font-mono">fs.stat()</code> returns any other
        result (file still present, permission error, etc.), a
        <code class="text-xs font-mono">verify_failed</code> event is recorded
        instead, indicating a compliance anomaly that must be investigated.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        File paths in event payloads are stored as
        <strong>SHA-256 hashes</strong>, not raw strings. This keeps the
        payload uniform-length, resistant to log-scraping, and ensures the
        audit trail cannot accidentally reveal directory structure or user
        identifiers via path strings.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        A sample event payload (the
        <code class="text-xs font-mono">details</code> JSON for a
        <code class="text-xs font-mono">verified_absent</code> event):
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
      >{
  "path_hash": "a3f5e7d2c4b6a8e9f1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7a9e1c3d5b7"
}</div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        The audit trail is intentionally <strong>append-only</strong>: no
        application code path overwrites or deletes individual event rows.
        Rows are purged only by the periodic cleanup sweep after they exceed
        the retention period (see § 7), which executes a single
        <code class="text-xs font-mono">DELETE</code> statement bounded by an
        age cutoff. Anomalies — for example, a job that completed without a
        corresponding <code class="text-xs font-mono">verified_absent</code>
        event — are visible to any auditor running a sentinel query.
      </p>
    </section>

    <!-- 7. Retention table -->
    <section id="retention-table" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        7. Retention periods by data category
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-[var(--text-muted)] border-b border-[var(--border)]"
            >
              <th class="py-2 pr-4 font-medium">Data category</th>
              <th class="py-2 pr-4 font-medium">Where stored</th>
              <th class="py-2 pr-4 font-medium">Maximum retention</th>
              <th class="py-2 font-medium">Configurable</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)] text-xs">
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">Uploaded PDF (audit)</td>
              <td class="py-2.5 pr-4">Server memory only</td>
              <td class="py-2.5 pr-4">Seconds; discarded after HTTP response</td>
              <td class="py-2.5">No</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">Uploaded PDF (remediation input)</td>
              <td class="py-2.5 pr-4">
                <code class="font-mono">data/remediation/&lt;jobId&gt;/work/input.pdf</code>
              </td>
              <td class="py-2.5 pr-4">Seconds; deleted after qpdf normalize stage</td>
              <td class="py-2.5">No</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">Normalized intermediate PDF</td>
              <td class="py-2.5 pr-4">
                <code class="font-mono">data/remediation/&lt;jobId&gt;/work/normalized.pdf</code>
              </td>
              <td class="py-2.5 pr-4">Seconds; deleted after OpenDataLoader tag stage</td>
              <td class="py-2.5">No</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">Remediated tagged PDF (output)</td>
              <td class="py-2.5 pr-4">
                <code class="font-mono">data/remediation/&lt;jobId&gt;.pdf</code>
              </td>
              <td class="py-2.5 pr-4">First download OR 30 minutes (whichever first)</td>
              <td class="py-2.5">
                Yes —
                <code class="font-mono"
                  >REMEDIATION.OUTPUT_TTL_MS</code
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">
                Remediation job row (metadata only)
              </td>
              <td class="py-2.5 pr-4">
                SQLite,
                <code class="font-mono">remediation_jobs</code> table
              </td>
              <td class="py-2.5 pr-4">30 days after completion</td>
              <td class="py-2.5">
                Yes —
                <code class="font-mono"
                  >REMEDIATION.JOB_ROW_RETENTION_DAYS</code
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">
                Lifecycle events (audit trail)
              </td>
              <td class="py-2.5 pr-4">
                SQLite,
                <code class="font-mono">remediation_events</code> table
              </td>
              <td class="py-2.5 pr-4">7 years (default)</td>
              <td class="py-2.5">
                Yes —
                <code class="font-mono"
                  >REMEDIATION.EVENT_LOG_RETENTION_DAYS</code
                >
              </td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">
                Audit log (plain audits, no PDFs)
              </td>
              <td class="py-2.5 pr-4">
                SQLite, <code class="font-mono">audit_log</code> table
              </td>
              <td class="py-2.5 pr-4">Indefinite (purgeable on request)</td>
              <td class="py-2.5">By admin request</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-medium">
                Shared reports (audit results only)
              </td>
              <td class="py-2.5 pr-4">
                SQLite,
                <code class="font-mono">shared_reports</code> table
              </td>
              <td class="py-2.5 pr-4">15 days from share creation</td>
              <td class="py-2.5">
                Yes —
                <code class="font-mono">SHARED_REPORTS.EXPIRY_DAYS</code>
              </td>
            </tr>
            <tr>
              <td class="py-2.5 pr-4 font-medium">
                OTP authentication codes
              </td>
              <td class="py-2.5 pr-4">
                SQLite, <code class="font-mono">otp_codes</code> table
              </td>
              <td class="py-2.5 pr-4">10 minutes (single-use)</td>
              <td class="py-2.5">
                Yes —
                <code class="font-mono">AUTH.OTP_EXPIRY_MINUTES</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        Retention periods marked "configurable" can be adjusted in the source
        configuration file
        (<code class="text-xs font-mono">audit.config.ts</code>) before
        deployment. The defaults shown represent the standing posture for the
        production deployment; any deployment running modified values
        publishes those values in its own deployment notes.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        A <strong>periodic cleanup sweep</strong> runs every 5 minutes within
        the API process and on every API startup. It performs five tasks
        idempotently: expire outputs past
        <code class="text-xs font-mono">expires_at</code>; mark stuck jobs as
        failed; remove orphan directories; purge old
        <code class="text-xs font-mono">remediation_jobs</code> rows; purge
        old <code class="text-xs font-mono">remediation_events</code> rows.
        Source:
        <code class="text-xs font-mono"
          >apps/api/src/services/remediationCleanup.ts</code
        >.
      </p>
    </section>

    <!-- 8. What is stored -->
    <section id="stored" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        8. What is and isn't stored
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          class="rounded-xl border border-emerald-700/40 bg-emerald-950/15 p-5"
        >
          <h3
            class="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-3"
          >
            Stored (metadata only)
          </h3>
          <ul
            class="space-y-1.5 text-xs text-[var(--text-secondary)] list-disc list-inside"
          >
            <li>Filename of the uploaded PDF (sanitized before storage)</li>
            <li>SHA-256 hash of file bytes (a 64-character hex digest)</li>
            <li>Page count (integer)</li>
            <li>Pre-flight audit score and grade (numbers + letter)</li>
            <li>Post-remediation audit score and grade</li>
            <li>
              Per-category findings and explanations (text generated by the
              scorer, never copied from the PDF)
            </li>
            <li>
              User's email address (only if logged in; tied to the user's
              own account)
            </li>
            <li>Server-side timestamps for every lifecycle event</li>
            <li>
              Job status, step name, progress percentage
            </li>
            <li>Failure reasons (string descriptions, no content)</li>
            <li>
              veraPDF verdict summary (passed/failed + rule IDs of failing
              rules, no content)
            </li>
            <li>SHA-256 hash of download token (token itself never stored)</li>
            <li>SHA-256 hash of deleted file paths (paths never stored)</li>
          </ul>
        </div>
        <div class="rounded-xl border border-red-700/40 bg-red-950/15 p-5">
          <h3
            class="text-sm font-semibold uppercase tracking-wider text-red-300 mb-3"
          >
            Never stored
          </h3>
          <ul
            class="space-y-1.5 text-xs text-[var(--text-secondary)] list-disc list-inside"
          >
            <li>PDF file content (audit pipeline)</li>
            <li>
              PDF file content after a remediation completes (output is
              deleted on download or after 30-minute TTL)
            </li>
            <li>Extracted text from inside PDFs</li>
            <li>Images extracted from PDFs (none are stored)</li>
            <li>Form-field values from PDFs</li>
            <li>
              Any data transmitted to AI services (there are none — see § 4)
            </li>
            <li>
              Any data shared with third-party analytics, ad networks, or
              tracking services
            </li>
            <li>Browser fingerprints or cross-site tracking identifiers</li>
            <li>IP addresses of users (beyond what's in standard web logs)</li>
            <li>
              Raw file paths in lifecycle events (paths are hashed before
              storage)
            </li>
            <li>
              Raw download tokens (tokens are hashed; the original 32-byte
              random token is held in the URL only)
            </li>
            <li>
              Backups of the SQLite database to external storage (the database
              is on the local filesystem only)
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 9. Security safeguards -->
    <section id="safeguards" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        9. Security &amp; technical safeguards
      </h2>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
        <li>
          <strong>HTTPS / TLS 1.2+</strong> on all transport between client
          and server. The production deployment uses certificates issued by
          Let's Encrypt and renewed automatically.
        </li>
        <li>
          <strong>HTTP-only cookies</strong> for authentication, with
          <code class="text-xs font-mono">SameSite=Strict</code> set to
          prevent cross-site request forgery.
        </li>
        <li>
          <strong>Restrictive filesystem permissions</strong> on remediation
          data: <code class="text-xs font-mono">0700</code> on directories,
          <code class="text-xs font-mono">0600</code> on output files. Only
          the process owner can read these files.
        </li>
        <li>
          <strong>Unguessable identifiers</strong>: job IDs are
          UUIDv4 (122 bits of cryptographic entropy); download tokens are
          32-byte random base64url-encoded strings.
        </li>
        <li>
          <strong>Constant-time-ish token comparison</strong>: download tokens
          are compared via byte-wise XOR over fixed-length SHA-256 hashes,
          mitigating timing side channels.
        </li>
        <li>
          <strong>Magic-byte validation</strong> on uploads: a file is
          rejected immediately if its first five bytes are not
          <code class="text-xs font-mono">%PDF-</code>.
        </li>
        <li>
          <strong>File size cap</strong>: 15 MB for the audit pipeline, 50 MB
          for the remediation pipeline (configurable).
        </li>
        <li>
          <strong>Page count cap</strong>: 500 pages for remediation
          (configurable). Pathological PDFs with thousands of pages are
          rejected before any processing.
        </li>
        <li>
          <strong>JVM memory cap</strong> on the OpenDataLoader child
          process: 768 MB heap via
          <code class="text-xs font-mono">JAVA_TOOL_OPTIONS=-Xmx768m</code>
          to bound resource consumption.
        </li>
        <li>
          <strong>Wall-clock timeout</strong> on the remediation worker: 5
          minutes (configurable). The JVM child is killed on overrun.
        </li>
        <li>
          <strong>Per-user concurrency limit</strong>: 1 remediation job at
          a time per user (configurable).
        </li>
        <li>
          <strong>Rate limiting</strong> on upload endpoints to prevent
          abuse.
        </li>
        <li>
          <strong>Encrypted PDFs are rejected</strong> with a clear error
          before any analysis is attempted.
        </li>
        <li>
          <strong>Cleanup on startup</strong>: when the API restarts, a sweep
          reconciles disk vs database — jobs stuck in "running" for over 10
          minutes are marked failed; orphan files with no matching database
          row are removed.
        </li>
        <li>
          <strong>Regression guard on remediation</strong>: the output PDF is
          rejected if its score regresses on Overall, Strict, or Practical
          profiles relative to the input. The user never sees an output that
          would make any visible metric worse.
        </li>
      </ul>
    </section>

    <!-- 10. Security audits -->
    <section id="security-audits" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        10. Security audit history (red/blue team reviews)
      </h2>

      <!-- Plain-language explainer for non-technical readers -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-5"
      >
        <h3
          class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3"
        >
          What is a red/blue team audit, in plain language?
        </h3>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          Imagine the tool is a bank vault. <strong>The red team</strong>
          plays the role of someone trying to break in — looking for unlocked
          doors, weak walls, or ways to trick the guards. They aren't actually
          attackers; they're security-minded reviewers who deliberately think
          like attackers. <strong>The blue team</strong> plays the defenders —
          documenting every lock, alarm, and procedure that's supposed to keep
          the vault safe.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          A red/blue team audit is when both teams sit down together — often
          the same person playing both roles — and systematically work through
          everything that could go wrong: <em>"What if someone uploads a
          poisoned file?" "What if two people try to download the same thing
          at once?" "What if the server runs out of memory mid-job?"</em>
          For each scenario, they identify whether existing protections are
          adequate, what could fail, and how to fix it.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          The output is a list of <strong>findings</strong>, each rated by
          severity:
        </p>
        <ul class="space-y-1.5 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-3">
          <li>
            <strong>P0 — critical:</strong> the system is broken right now and
            users are exposed. Must be fixed immediately, before any release.
          </li>
          <li>
            <strong>P1 — serious:</strong> a real vulnerability that could be
            exploited. Must be fixed before the upcoming release.
          </li>
          <li>
            <strong>P2 — moderate:</strong> a real concern, but its impact is
            bounded by other protections. Documented; sometimes accepted as
            a known limitation if mitigation is in place.
          </li>
          <li>
            <strong>P3 — minor:</strong> a small concern or theoretical risk.
            Tracked; addressed when convenient.
          </li>
        </ul>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong>Why this matters for compliance:</strong> ADA Title II,
          Illinois IITAA, and most state-agency procurement standards require
          a "reasonable" level of security. A documented red/blue team audit
          before each release is concrete evidence of due diligence — it
          demonstrates that the development team didn't just hope nothing
          would go wrong, they systematically checked. For an external
          auditor, this section IS the documentation of that diligence.
        </p>

      </div>

      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        Audit entries below are in reverse-chronological order (most recent
        first). Each entry lists the findings discovered during that
        release's review and what was done about them.
      </p>

      <!-- v1.18.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.18.0
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: PDF
            auto-remediation feature (entire new surface)
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          The remediation pipeline was the first major surface added to
          this tool. The pre-release red/blue team review covered the
          public API endpoints, the worker, the frontend, the cleanup
          sweep, the database schema, and the file lifecycle. The 15-row
          threat-model checklist documented in
          <code class="text-xs font-mono"
            >docs/pdf-remediation-integration-plan.md</code
          >
          (§ Security) was the basis of the review.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2">P1</span>
              Fixed</strong
            >
            — Memory exhaustion via large output downloads.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the download endpoint loaded
              the entire remediated PDF (up to 50 MB) into the API
              process's memory before sending it to the user's browser.
              Under several simultaneous downloads, this could exceed the
              API process's 512 MB memory cap and crash it. <br />
              <strong>How it was fixed:</strong> switched to streaming the
              file in small chunks
              (<code class="text-xs font-mono"
                >createReadStream + stream.pipe(res)</code
              >). Memory usage is now constant regardless of output size.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2">P1</span>
              Fixed</strong
            >
            — Race condition allowed concurrent double-download.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the download token was
              supposed to be single-use, but two near-simultaneous
              requests with the same token could both pass the validation
              check and both retrieve the file before either completed.
              This violated the "single-use" privacy guarantee.<br />
              <strong>How it was fixed:</strong> the job is marked
              <code class="text-xs font-mono">status='expired'</code>
              <em>before</em> the file is sent, so any concurrent second
              request immediately sees the expired status and receives a
              "410 Gone" response.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Mitigated</strong
            >
            — Auth-bypass when login is not required (dev/internal mode).
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> when the tool runs with the
              "require login" flag turned off (typical for internal
              development), the per-job email check on the status,
              download, and receipt endpoints is bypassed. Anyone who
              knows a job's UUID could read its data.<br />
              <strong>How it was handled:</strong> job UUIDs use 122 bits
              of cryptographic randomness — guessing one is
              computationally impractical. Production deployments run
              with login required, which closes the gap entirely. This
              limitation is documented in the integration plan as the
              known posture; it does not affect the production deployment.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Accepted</strong
            >
            — Legacy scoring data computed but unused.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> the Adobe Acrobat parity
              score (a 32-rule check) is still calculated on the server
              even though the user interface no longer displays it. Costs
              about 50 milliseconds per audit.<br />
              <strong>How it was handled:</strong> intentionally kept for
              data-shape stability so existing tests and audit-log
              entries continue to work. May be removed in a future
              release if the cost ever matters. Not a privacy or
              security issue — just dead code.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Accepted</strong
            >
            — Conservative PDF validation rejects borderline files.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was found:</strong> the
              <code class="text-xs font-mono">qpdf --check</code> validator
              flags some technically-valid PDF outputs as "warnings,"
              which the tool treats as failures.<br />
              <strong>How it was handled:</strong> accepted by design.
              Better to reject a borderline file (the user is told the
              remediation didn't work, can try a different path) than to
              serve a file that <em>might</em> be damaged and contaminate
              the user's records. Privacy and integrity over feature
              completion.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Pre-launch items still open
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            External penetration test on the remediation surface (planned
            before public-announce; budget tracked in Phase 4 roadmap).
          </li>
          <li>
            Full automated test coverage for the remediation pipeline
            (<code class="text-xs font-mono">remediation.test.ts</code>,
            <code class="text-xs font-mono"
              >remediation-privacy.test.ts</code
            >,
            <code class="text-xs font-mono"
              >remediation-receipt.test.ts</code
            >). Tracked in Phase 4.
          </li>
          <li>
            File the upstream OpenDataLoader object-streams bug with
            reproducer PDFs (the qpdf preprocessing workaround is in place
            in the meantime).
          </li>
        </ul>
      </article>

      <!-- Prior releases -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.17.0 and earlier
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Pre-formatted-audit era
          </span>
        </header>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          Security reviews for releases prior to v1.18.0 were not yet
          captured in this format. Earlier releases focused on the
          synchronous audit pipeline (added in v1.0) and authentication
          flow (Personal Access Tokens added in v1.16, analyze-by-URL
          added in v1.17). Review history for those releases is available
          via the
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/commits/main"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >commit history on GitHub</a
          >. Going forward — beginning with v1.18.0 — every release will
          have a corresponding entry in this section before tagging.
        </p>
      </article>
    </section>

    <!-- 11. Right to inspect -->
    <section id="inspect" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        11. Right to inspect &amp; verify
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        Authorized agency staff — including managers, records-retention
        officers, and accessibility auditors — can inspect the lifecycle of
        any specific remediation job by querying the SQLite database directly.
        Sample queries for common compliance questions:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
      >-- All remediations a specific user performed in a date range
SELECT id, input_filename, status, input_score, output_score,
       datetime(created_at/1000, 'unixepoch', 'localtime') AS started,
       datetime(completed_at/1000, 'unixepoch', 'localtime') AS finished
FROM remediation_jobs
WHERE email = ?
  AND created_at BETWEEN ? AND ?
ORDER BY created_at DESC;

-- Full lifecycle of a specific job
SELECT event,
       datetime(occurred_at/1000, 'unixepoch', 'localtime') AS at,
       details
FROM remediation_events
WHERE job_id = ?
ORDER BY occurred_at;

-- Sentinel: any job whose output was retained past the 30-minute TTL
SELECT j.id, j.input_filename,
       (e.max_at - j.completed_at) / 60000 AS extra_minutes_on_disk
FROM remediation_jobs j
JOIN (
  SELECT job_id, MAX(occurred_at) AS max_at
  FROM remediation_events
  WHERE event IN ('output_deleted', 'verified_absent')
  GROUP BY job_id
) e ON e.job_id = j.id
WHERE j.status IN ('expired', 'complete')
  AND (e.max_at - j.completed_at) > 30 * 60 * 1000;
  -- This query should return ZERO ROWS for a properly-functioning system.

-- Sentinel: any deletion that wasn't verified absent
SELECT job_id, occurred_at
FROM remediation_events
WHERE event = 'output_deleted'
  AND NOT EXISTS (
    SELECT 1 FROM remediation_events e2
    WHERE e2.job_id = remediation_events.job_id
      AND e2.event = 'verified_absent'
      AND e2.occurred_at &gt;= remediation_events.occurred_at
  );
  -- This query should ALSO return ZERO ROWS.</div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        A Phase 3 roadmap item adds a
        <strong>manager-facing verification endpoint</strong> that accepts a
        filename or a file's SHA-256 hash and reports whether the file was
        ever audited or remediated, with full timestamps. The underlying
        <code class="text-xs font-mono">content_hash</code> column has been
        populated on every audit and remediation since v1.18.0 in
        preparation for that feature. Until that endpoint ships, equivalent
        information is available via direct database query as shown above.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        A user can also see their own complete remediation receipt by visiting
        the result page for any of their jobs (URL pattern:
        <code class="text-xs font-mono"
          >https://audit.icjia.app/remediate/&lt;jobId&gt;</code
        >).
        The receipt shows every lifecycle event with human-readable labels,
        including the verified-deletion event.
      </p>
    </section>

    <!-- 11. Standards -->
    <section id="standards" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        11. Standards &amp; compliance alignment
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        The tool's design and this policy aim to align with the following
        standards and regulations. Alignment with a standard does not
        constitute certification — official conformance audits remain the
        responsibility of the user agency.
      </p>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
        <li>
          <strong>WCAG 2.1 Level AA</strong> (Web Content Accessibility
          Guidelines, W3C) — the audit scores PDFs against the nine
          categories that map to WCAG 2.1 AA success criteria for non-web
          documents.
        </li>
        <li>
          <strong>ADA Title II</strong> (U.S. federal law, effective April
          2026 for state and local government digital content) — informs the
          tool's diagnostic and remediation framing.
        </li>
        <li>
          <strong>Illinois IITAA</strong> (Information Technology
          Accessibility Act) — the tool's compliance disclaimers on the
          remediation result page link to the Illinois DOIT accessibility
          standards.
        </li>
        <li>
          <strong>PDF/UA-1 (ISO 14289-1)</strong> — the remediation pipeline
          uses veraPDF to validate output against PDF/UA-1 technical
          conformance. veraPDF's verdict is surfaced honestly on the result
          page; manual review is acknowledged as still required for full
          accessibility.
        </li>
        <li>
          <strong>State of Illinois records-retention policy</strong> — the
          default 7-year retention period for the
          <code class="text-xs font-mono">remediation_events</code> audit
          trail matches typical state-agency records-retention schedules.
          Adjust via configuration if your agency's schedule differs.
        </li>
      </ul>
    </section>

    <!-- 12. Glossary -->
    <section id="glossary" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        12. Glossary of technical terms
      </h2>
      <dl class="space-y-3 text-sm text-[var(--text-secondary)]">
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            Append-only audit log
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A database table whose rows are added but never modified or
            deleted by application code. Rows are removed only by an explicit
            retention-policy purge after a configured age. Append-only design
            ensures the audit trail is tamper-evident from inside the running
            system.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            ENOENT (Error: No such ENTity)
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            The error code returned by the operating system when a program
            asks for the status of a file that doesn't exist. The remediation
            worker uses an
            <code class="text-xs font-mono">fs.stat()</code> call expecting
            ENOENT after a delete — receiving any other response indicates
            the file is still present, which is treated as a compliance
            anomaly.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            <code class="font-mono">fs.stat()</code>
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A Node.js function that asks the operating system whether a file
            exists and, if so, returns its size, permissions, and timestamps.
            We use it specifically to confirm that a file has been deleted
            (we expect a "no such file" response).
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">PDF/UA-1</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            ISO 14289-1: the technical specification for "accessible PDF."
            Defines the structural requirements (tags, language declaration,
            metadata) a PDF must meet to be considered conformant. Validated
            by veraPDF.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            Remediation
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            The process of taking an existing PDF and adding accessibility
            structure to it after the fact. Distinguished from accessible
            authoring, which produces a tagged PDF directly from a source
            document.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            SHA-256 hash
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A cryptographic function that turns any input into a fixed-length
            (64-character) hexadecimal string. The hash is one-way: you can
            compute the hash from the input, but not the input from the
            hash. We use it for two purposes here: (1) as a content
            fingerprint to identify whether two files are the same without
            storing the files themselves; (2) as a token comparison
            mechanism that resists timing attacks.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">
            Structure tree / tagged PDF
          </dt>
          <dd class="ml-4 text-xs leading-relaxed">
            An optional second layer inside a PDF that describes the
            semantic role of each piece of content (heading, paragraph,
            figure, table cell). A PDF with this layer populated is called
            "tagged" and is readable by screen readers; one without it is
            "untagged" and is inaccessible. See the Technical Details
            dropdown on the audit page for a full primer.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-[var(--text-heading)]">UUIDv4</dt>
          <dd class="ml-4 text-xs leading-relaxed">
            A version 4 universally unique identifier — a 36-character random
            string with 122 bits of entropy. We use UUIDv4s as job IDs so
            that no two remediation jobs ever share an identifier, and so
            that an attacker cannot guess a valid job ID by enumeration.
          </dd>
        </div>
      </dl>
    </section>

    <!-- 13. Change log -->
    <section id="change-log" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        13. Change log for this policy
      </h2>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)]">
        <li>
          <strong>v1.0 · 2026-05-18</strong> — Initial publication. Covers
          tool versions v1.18.0 and newer. Documents the audit pipeline and
          the optional auto-remediation pipeline introduced in v1.18.0.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        This policy is version-controlled with the source code. Any change
        to the data-handling behavior of the tool is reflected here, with a
        corresponding version bump and a dated entry above. The complete
        change history is available via
        <code class="text-xs font-mono"
          >git log apps/web/app/pages/data-retention.vue</code
        >
        on the project's GitHub repository.
      </p>
    </section>

    <!-- Related documents (linked source-of-truth references) -->
    <section
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    >
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4"
      >
        Related documents & source code
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        Every claim in this policy is verifiable against publicly-available
        source code and documentation. Audit it yourself:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Source code
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            github.com/ICJIA/file-accessibility-audit
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            The complete TypeScript / Vue source for the API, web UI, and
            remediation worker. All claims here are verifiable against this
            repository.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Changelog
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            CHANGELOG.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Version history of every behavior change, including the
            introduction of the auto-remediation feature in v1.18.0.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Project README
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            README.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Feature overview, quick-start instructions, and the per-release
            security-audit log.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/pdf-remediation-integration-plan.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Integration plan
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            pdf-remediation-integration-plan.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Full architectural spec for the auto-remediation feature
            including threat model and the per-event audit-trail design.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/spike-remediation-results.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Feasibility spike
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            spike-remediation-results.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Results from testing OpenDataLoader against 12 representative
            ICJIA-style PDFs. Documents the rationale for the qpdf
            preprocessing step.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/pdf-remediation-alt-text-walkthrough-spec.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div
            class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1"
          >
            Alt-text walkthrough spec
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            pdf-remediation-alt-text-walkthrough-spec.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Design spec for the planned Phase 1 follow-on feature
            (interactive, AI-free alt-text authoring).
          </p>
        </a>
      </div>
    </section>

    <!-- 14. Contact -->
    <section
      id="contact"
      class="scroll-mt-8 rounded-xl border-2 border-blue-700/40 bg-blue-950/15 p-5 sm:p-7"
    >
      <h2 class="text-2xl font-bold text-blue-200 mb-3">
        14. Contact &amp; questions
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        For questions about this policy, requests for technical details
        beyond what's documented here, requests to inspect a specific job's
        audit trail, or any concern about how this tool handles data:
      </p>
      <div class="space-y-1 text-sm">
        <p class="text-[var(--text-heading)] font-semibold">
          Innovation and Digital Services (IDS)
        </p>
        <p class="text-[var(--text-secondary)]">
          Illinois Criminal Justice Information Authority
        </p>
        <p class="text-[var(--text-secondary)]">
          <a
            href="mailto:cja.info@illinois.gov"
            class="text-[var(--link)] hover:text-[var(--link-hover)] font-mono font-semibold"
            >cja.info@illinois.gov</a
          >
        </p>
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        Source code and issue tracker:
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >github.com/ICJIA/file-accessibility-audit</a
        >.
      </p>
    </section>
  </div>
</template>

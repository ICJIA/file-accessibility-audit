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

const runtimeConfig = useRuntimeConfig()

useHead({
  title: 'Data Retention Policy',
  meta: [
    {
      name: 'description',
      content:
        'Auditor-ready data retention policy: how PDFs are stored, processed, and deleted; AI usage statement; lifecycle audit trail; retention periods; contact information.',
    },
  ],
  link: [
    {
      rel: 'canonical',
      href: `${runtimeConfig.public.siteUrl}/data-retention`,
    },
  ],
})

const POLICY_VERSION = '1.0'
const POLICY_EFFECTIVE = '2026-05-18'
const TOOL_VERSION = '1.18.0'

// Mermaid diagram sources. Deliberately simple — flowchart TD only,
// short labels, no subgraphs, no HTML in labels, no special chars.
// Reliability over richness.

const auditPipelineDiagram = `flowchart TD
    A[Upload PDF] --> B[Validate file]
    B --> C[Hold in memory only]
    C --> D[qpdf + pdfjs analyze]
    D --> E[Score 9 WCAG categories]
    E --> F[Send result to browser]
    F --> G[Memory buffer discarded]`

const remediationPipelineDiagram = `flowchart TD
    A[Upload PDF] --> B[Write to scratch]
    B --> C[qpdf normalize]
    C --> D[Delete original + verify]
    D --> E[OpenDataLoader tag]
    E --> F[Delete normalized + verify]
    F --> G[qpdf check + veraPDF]
    G --> H[Re-audit, guard regressions]
    H --> I[Output ready, 30 min TTL]
    I --> J[User downloads]
    J --> K[Delete output + verify]`

const noAiDiagram = `flowchart TD
    A[Your PDF] --> B[ICJIA server]
    B --> C[qpdf local]
    B --> D[OpenDataLoader local]
    B --> E[veraPDF local]
    B --> F[SQLite local]
    B -.OTP code only.-> G[Mailgun email]
    B -.NEVER.-> X[ChatGPT, Claude, Gemini, Copilot]`

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
        tabindex="0"
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

      <div class="mt-4">
        <MermaidDiagram
          :source="auditPipelineDiagram"
          title="Audit pipeline — visual flow"
          desc="Flowchart of the audit pipeline. The uploaded PDF is held in memory, validated, analyzed by qpdf and pdfjs, scored across 9 WCAG categories, and the memory buffer is discarded after the response is sent."
        />
      </div>

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
        <em>Attempt remediation</em> action appears on the audit results
        page. Clicking it triggers the following lifecycle:
      </p>
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
        tabindex="0"
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
  • If Overall OR Strict score regresses: REJECT
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

      <div class="mt-4">
        <MermaidDiagram
          :source="remediationPipelineDiagram"
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

      <div class="mt-5">
        <MermaidDiagram
          :source="noAiDiagram"
          title="No AI services contacted"
          desc="Flowchart showing the ICJIA server talks only to local tools (qpdf, OpenDataLoader, veraPDF, SQLite) and Mailgun (for OTP codes only). It NEVER sends data to ChatGPT, Claude, Gemini, or Copilot."
        />
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
      <div class="overflow-x-auto" tabindex="0">
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
        tabindex="0"
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
        tabindex="0"
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
      <div class="overflow-x-auto" tabindex="0">
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
              <td class="py-2.5 pr-4">365 days from share creation</td>
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
          rejected if its overall or Strict (WCAG + IITAA §E205.4) score
          regresses relative to the input. The user never sees an output
          that would make any visible metric worse.
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

      <!-- v1.22.2 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.2</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-22</strong> · scope: one verdict-box
            heading string and a documentation correction. No security review
            was required — nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.2 reworks the wording shown in the conformance verdict box
          when a document does not pass, and corrects stale test counts in the
          project README. It does not change what the audit checks, what data
          is collected, where it is stored, or how long it is kept. No new
          endpoints, no authentication change, no retention change, no new
          attack surface.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Clearer next-step wording on a failing document</strong
            >
            — When a document does not pass, the verdict box heading now says
            it needs "additional manual remediation" — a plain signal that
            automated tooling has done what it can and the remaining fixes are
            hands-on (Adobe Acrobat's Accessibility Checker, or correcting the
            source document and re-exporting).
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — This release is a copy and documentation change only. No code
            path, endpoint, or data-handling behavior changed; every defensive
            control from prior releases remains in force.
          </li>
        </ul>
      </article>

      <!-- v1.22.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.1</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-22</strong> · scope: a wording and
            presentation change to the conformance verdict box. No security
            review was required — nothing about data handling changed.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.1 changes how the v1.22.0
          <strong>WCAG conformance verdict</strong> is <em>displayed</em>. It
          does not change what the audit checks, what data is collected, where
          it is stored, or how long it is kept. No new endpoints, no
          authentication change, no retention change.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Clearer, less alarming verdict wording</strong
            >
            — When a document scores well (an A or B grade) but still has a
            flagged accessibility issue, the verdict box now explains plainly
            that WCAG is judged one criterion at a time — a single gap is still
            worth fixing, but a strong grade still means the document is in good
            shape. The box is shown in green for strong documents and red for
            weak ones; every flagged issue is still listed in full, whatever
            the color.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >New</span
              >
              Links to the official standards</strong
            >
            — The verdict box now links directly to the published WCAG 2.1,
            Illinois IITAA, and ADA Title II standards, so a reader can check
            the rules the audit measures against at their source.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No new data and no new attack surface</strong
            >
            — This release is presentation only. The verdict is still computed
            from information the audit already produced, the downloadable
            reports are unchanged, and no new information is sent or stored
            anywhere. Every defensive control from prior releases remains in
            force.
          </li>
        </ul>
      </article>

      <!-- v1.22.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">v1.22.0</h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-21</strong> · scope: a scoring-methodology
            release — a new WCAG conformance verdict, recalibrated category
            weights, and clearer labels. Reviewed with an adversarial scoring
            audit, not a red/blue-team security review.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          v1.22.0 changes how the audit is <em>scored and explained</em> — it
          does not change what data is collected, where it is stored, or how
          long it is kept. No new endpoints, no authentication change, no
          retention change. The headline addition is a plain pass/fail
          <strong>WCAG 2.1 conformance verdict</strong> shown alongside the
          0–100 score, because a high score is not the same thing as passing
          WCAG. One correctness bug found during the review was fixed before
          this release was tagged.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2"
                >New</span
              >
              WCAG conformance verdict</strong
            >
            — Every audit now states plainly whether the document has
            confirmed failures against <strong>WCAG 2.1 Level AA</strong> —
            the standard the Illinois IITAA and the federal ADA Title II rule
            require. The verdict is separate from the 0–100 score and never
            claims a document is "conformant"; when the automated checks find
            nothing it says so, and still asks for manual review. Each cited
            rule links to the official W3C explanation.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >Fix</span
              >
              No false verdicts on unreadable files</strong
            >
            — The review found that a damaged or password-protected PDF could
            be handed a fabricated "fails WCAG" verdict because the analyzer
            had not actually been able to read it. That is now fixed: an
            unreadable file honestly reports that no verdict could be
            determined.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              This was a correctness defect in brand-new code, caught and
              fixed before tagging — no released version ever shipped it.
            </p>
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2"
                >Note</span
              >
              Scores shifted — by design</strong
            >
            — Category weights and some labels were recalibrated to match WCAG
            conformance levels more honestly. As a result, a score produced by
            v1.22.0 is not directly comparable to a score from an earlier
            version. An audit campaign that spans this upgrade will see numbers
            move; that movement reflects the improved methodology, not a change
            in the documents.
          </li>
          <li>
            <strong
              ><span
                class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2"
                >API</span
              >
              No security regressions</strong
            >
            — Every defensive control from prior releases remains in force. No
            schema migration. The conformance verdict is computed from data the
            audit already produced; the report exports gained a verdict section
            but send no new data anywhere.
          </li>
        </ul>
      </article>

      <!-- v1.21.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.21.1
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-19</strong> · scope: shared-report
            UI parity with the real-time audit page, plus an elevated
            analyze rate limit for the duration of the in-flight ICJIA
            fleet audit campaign.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This is a small <strong>follow-up release</strong> to v1.21.0,
          not a security change. v1.21.0 simplified the live audit page
          by removing the Adobe Acrobat parity panel, but the same
          panel was left in place on the shared-report page
          (<code class="text-xs font-mono">/report/:id</code>) — so two
          auditors looking at the same content via different URLs ended
          up seeing two different summaries. This release fixes that
          inconsistency. It also bumps the per-caller hourly analyze
          rate limit to support an in-flight fleet audit pass.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2">UX</span>
              Consistency</strong
            >
            — Shared and saved report pages now show exactly what the
            live audit page shows. No more Acrobat parity panel on
            <code class="text-xs font-mono">/report/:id</code>.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> v1.21.0 removed the
              32-rule Adobe Acrobat parity card from the live audit
              page in favor of a single WCAG-anchored Strict score,
              but the same card kept rendering on the shared-report
              page. Auditors comparing notes off a shared link saw a
              presentation that didn't match the live audit, which
              could read as a deliberate difference in scoring.
              <br />
              <strong>What this release does:</strong> the parity-card
              block was removed from the shared-report template. The
              underlying <em>data</em> is still saved in the database
              (so historic API consumers that already parse it keep
              working), but it's no longer rendered on the page.
              No schema change. The per-finding "How to Fix in Adobe
              Acrobat" remediation guidance inside each category card
              is kept — that's per-finding remediation advice, not a
              separate scoring profile, and it appears on the live
              audit page too.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">OPS</span>
              Elevated analyze rate limit for the audit campaign</strong
            >
            — The per-caller hourly analyze rate limit was raised from
            <strong>35/hour</strong> to <strong>5000/hour</strong> for
            the duration of the in-flight ICJIA fleet audit campaign.
            The ~5000-PDF inventory is being re-audited across
            multiple passes over several days as content is
            remediated and re-checked, not a single one-shot pass.
            The elevated limit will stay in place for the duration
            of the campaign and revert to a tighter number once it
            concludes.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>Why this is OK:</strong> the per-caller analyze
              limit is a fair-use throttle. The actual abuse
              mitigations live on the remediation side — the 100/day
              remediation cap per caller, the 60-minute audit-gate
              <code class="text-xs font-mono">sha256(bytes)</code>
              hash check, the SSRF allowlist, the upload size cap, and
              the auth gate are all unchanged. The audit pipeline does
              not write user-supplied content to durable storage beyond
              the lightweight <code class="text-xs font-mono">audit_log</code>
              row (no PDF bytes; just metadata).
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">API</span>
              No security regressions</strong
            >
            — Every other defensive control from v1.20.1 and v1.21.0
            remains in force. No schema migration. No change to the
            authentication layer, the SSRF allowlist, the audit-gate
            hash check, the daily remediation cap, the retention
            windows, or the URL-fetch posture.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              The two changes in this release are a 5-line UI
              deletion on the shared-report template and a single
              numeric raise on one rate-limit constant. No other code
              paths were touched.
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.21.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.21.0
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-19</strong> · scope: simplification
            release. Retired the dual Strict/Practical scoring toggle in
            favor of a single canonical Strict score; promoted veraPDF
            PDF/UA-1 verdict on the remediation result page.
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release is a <strong>UI simplification</strong>, not a
          security change. Auditors and agency staff consistently
          reported that the audit page was hard to read because it
          showed two scoring profiles at once — "Strict" and "Practical"
          — and asked users to choose between them. That cognitive load
          got in the way of the actual accessibility findings. After
          review, the team retired Practical and kept Strict, which is
          the WCAG 2.1 AA + IITAA §E205.4-anchored score that maps
          directly to Illinois accessibility law. The PDF/UA technical
          conformance signal that Practical tried to summarize is now
          surfaced more authoritatively on the remediation page via a
          dedicated <em>veraPDF</em> Pass/Fail check.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          What changed for an auditor reading this page
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2">UX</span>
              Simplified</strong
            >
            — The audit results page shows one score, anchored to WCAG
            and IITAA. No more "view by Strict / view by Practical"
            toggle. The grade you see is the legally-relevant grade.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> showing two profiles
              created an implicit "which one is correct?" question for
              the reader. The Strict view is what Illinois IITAA and
              the ADA point to; the Practical view layered a separate
              PDF/UA-flavored weighting on top, which was useful for
              tool reconciliation but not for publication decisions.
              <br />
              <strong>What this release does:</strong> the audit page
              now shows only the Strict / WCAG-anchored score. The
              underlying scoring engine is unchanged — same nine
              categories, same weights, same WCAG-anchored thresholds.
              Just less noise on the page.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-700/30 text-emerald-200 mr-2">UX</span>
              Promoted</strong
            >
            — The remediation result page now surfaces a clear
            <em>PDF/UA-1: Pass / Fail / Not run</em> badge right next to
            the post-remediation score.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the veraPDF conformance
              verdict (an open-source check against the published
              PDF/UA-1 / ISO 14289-1 standard) was already running as
              part of every remediation, but it was buried in a section
              labeled "Compliance disclaimer" further down the result
              page. Auditors needing the PDF/UA verdict had to scroll.
              <br />
              <strong>What this release does:</strong> a compact
              Pass/Fail badge appears immediately below the score; the
              detailed section below was renamed to
              "PDF/UA-1 conformance check" so its purpose is obvious;
              the badge jumps to that section for the full rule
              failure list when failures exist. When veraPDF isn't
              installed on the server, the badge clearly reads
              <em>"check not run"</em> rather than pretending the
              check ran successfully.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">API</span>
              Compatibility</strong
            >
            — Historical reports and external automation keep working
            without changes.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> a hard removal of the
              Practical profile would have broken the fleet-CSV
              integration shipped in v1.20.0, which lists both Strict
              and Practical columns per audited PDF.
              <br />
              <strong>What this release does:</strong> the
              <code class="text-xs font-mono">scoreProfiles.remediation</code>
              field and the
              <code class="text-xs font-mono">practical</code> key in
              the
              <code class="text-xs font-mono">/api/audit-url</code>
              response are kept as <strong>aliases of Strict</strong> —
              same number, same grade. External CSV consumers see both
              columns populated with the Strict score and don't need
              updates. The alias will be removed in a future release
              once we've confirmed no consumer depends on the values
              differing.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">API</span>
              No security regressions</strong
            >
            — All SSRF, rate-limit, audit-gate, daily-cap, and retention
            controls from v1.20.1 remain in force. The cleanup pass
            still purges remediation files, jobs, and audit-log rows
            on schedule.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              The simplification is a UI and scoring-presentation
              change. It does not modify the upload pipeline, the
              authentication layer, the rate limiters, the audit-gate
              hash check, the daily cap, the SSRF protections, or the
              retention windows.
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.20.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.20.1
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: post-feature
            red/blue team review of the v1.20.0 fleet-integration
            surface
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This is a dedicated security release that follows the team's
          standing practice: <strong>every feature ships through a
          fresh red/blue team review before tagging</strong>. The
          v1.20.0 release introduced the fleet-audit-by-URL endpoint;
          this review examined that new surface plus the related
          existing endpoints, found seven issues worth flagging, and
          fixed all of them before this release was tagged. The
          purpose of this entry is to document those findings so an
          auditor can see (a) what was looked at, (b) what was
          discovered, (c) what was done about it, and (d) how the
          team's iterative-review pattern works.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; what was done
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2">P1</span>
              Fixed</strong
            >
            — A DNS-based trick could have let an attacker reach the
            server's own internal network through our URL audit
            endpoint.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when someone submitted a
              URL for audit, the tool checked whether the
              <em>hostname</em> matched the allowlist of approved ICJIA
              domains before fetching it. If an attacker could control
              DNS for any subdomain of an approved domain — for
              example, by compromising a partner agency that operates a
              subdomain — they could point that hostname at the
              server's loopback address (127.0.0.1) and trick us into
              fetching our own internal services on their behalf.<br />
              <strong>How it was fixed:</strong> the tool now resolves
              the hostname's IP address itself, before fetching, and
              refuses to connect to any IP in private, loopback,
              link-local, or multicast ranges. The check repeats on
              every redirect hop so a redirector planted on an approved
              host can't chain us into a private address either. The
              fix covers both IPv4 and IPv6.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2">P1</span>
              Fixed</strong
            >
            — Redirects from approved hosts to private addresses were
            silently followed.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when the URL audit
              endpoint encountered an HTTP redirect, it followed the
              chain up to 20 hops without re-checking each hop against
              the allowlist. An attacker who could place content on an
              approved host could redirect us through to an internal
              address.<br />
              <strong>How it was fixed:</strong> redirects are now
              handled manually with the full allowlist and DNS-IP check
              on every hop, capped at three redirects total.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-700/30 text-red-200 mr-2">P1</span>
              Fixed</strong
            >
            — The bulk-inventory endpoint had no allowlist check at
            all.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> caught during the
              security review while migrating the other URL-fetch
              endpoints. The bulk-inventory endpoint accepts a list of
              PDF URLs and fetches each one. It had its own private
              fetcher with no allowlist — an authorized user could
              submit a list containing internal addresses and the tool
              would fetch them. Latent since the endpoint shipped, not
              previously discovered.<br />
              <strong>How it was fixed:</strong> the bulk endpoint now
              uses the same allowlist-plus-private-IP-block plumbing as
              the other URL endpoints.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Fixed</strong
            >
            — In no-login deployments, one user could unlock
            remediation for content audited by a different user.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> when the tool is run
              without requiring login, every user is treated as the
              same "anonymous" identity. The new
              <em>audit-before-remediation</em> check (added in this
              release — see "Added" below) would have matched any
              anonymous user's audit against any other anonymous
              user's remediation attempt.<br />
              <strong>How it was fixed:</strong> in no-login mode, the
              identity now includes the user's IP address. The
              production deployment requires login, so this issue
              never affected real users.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Fixed</strong
            >
            — The audit-history table grew without limit.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the canonical
              audit-history table had no retention policy. An attacker
              repeatedly auditing unique files could slowly fill the
              database.<br />
              <strong>How it was fixed:</strong> records older than 365
              days are now purged by the periodic cleanup sweep,
              matching the share-link retention window.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Fixed</strong
            >
            — A narrow race window let two simultaneous remediation
            requests both pass the daily limit.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the daily-limit check
              and the actual job-creation were two separate steps. Two
              perfectly-simultaneous requests at the cap boundary could
              both see "you're under the limit" and both proceed.<br />
              <strong>How it was fixed:</strong> the limit check is now
              repeated as part of the same atomic database transaction
              that creates the job, so the cap can no longer be
              exceeded by even one.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Verified clean</strong
            >
            — Browser cookie security flags.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was checked:</strong> the login session
              cookie is set with the protective flags (HttpOnly,
              Secure, SameSite-Strict) that prevent it from being
              read by client-side scripts, transmitted over plain
              HTTP, or sent with cross-site requests.<br />
              <strong>Result:</strong> all three flags are correctly
              set in production. No change needed; recorded in this
              audit trail for completeness.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Also added in this release — driven by the same security thinking
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            <strong>Audit required before remediation.</strong> Every
            request to remediate a PDF must be preceded by an audit of
            the same content within the previous 60 minutes. Any audit
            path counts — direct upload, URL audit, or fleet bulk. This
            prevents automated abuse where someone bypasses the audit
            pipeline and floods the remediation worker directly.
          </li>
          <li>
            <strong>Daily remediation cap.</strong> Up to 100
            remediations per caller per 24 hours. Sized so a normal
            agency workflow (~50 PDFs in a busy day) is unaffected,
            but a flood of thousands is blocked.
          </li>
          <li>
            <strong>Unified audit record.</strong> Every audit endpoint
            now writes a row to the canonical audit-history table with
            the content fingerprint (SHA-256 hash of the file's
            bytes). Required so the audit-before-remediation gate
            works uniformly across all audit paths. The hash is just a
            fingerprint — it doesn't expose the PDF's contents and
            can't be reversed back into the document.
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2 mt-4">
          Methodology — for the auditor record
        </h4>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
          The team follows a deliberate practice: <strong>every feature
          ships through a fresh red/blue team review before
          tagging</strong>. The review examines the newly-introduced
          surface from a sophisticated-adversary perspective, looks for
          attack patterns like DNS rebinding, race conditions, identity
          collapse, and slow-burn denial-of-service, and either fixes
          findings in the same release window or documents them for
          future work. This release (v1.20.1) is the security-followup
          to v1.20.0, which added the fleet-audit-by-URL feature. The
          pattern repeats with every feature release — earlier entries
          in this audit history list the findings from prior reviews.
        </p>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          For a manager reading this page: the intent here is
          transparency. The tool is built and reviewed iteratively, and
          this page is the auditor-readable trail of what was reviewed,
          what was found, what was fixed, and what was deliberately
          accepted with mitigation. The technical equivalent (with full
          code references) lives in
          <code class="font-mono text-xs">README.md § Security</code>
          for engineers and security reviewers who need that level of
          detail.
        </p>
      </article>

      <!-- v1.20.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.20.0
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: download
            filename dialog, PDF export, accessibility polish
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          A feature release with two material auditor-facing changes:
          remediated PDFs can now be downloaded under the
          <em>exact</em> original filename (critical for CMS file
          replacement, where existing links resolve by name), and the
          audit report can be saved as a PDF using the browser's own
          print dialog. No new data is collected, retained, or
          transmitted. The retention policy described elsewhere on
          this page is unchanged.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; changes
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Changed</strong
            >
            — Remediated PDF download now defaults to the user's exact
            original filename.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> when a user remediates a
              PDF and clicks Download, the file is now saved under the
              same filename they uploaded — including any spaces,
              unicode, or punctuation. The download dialog presents
              three options with "Keep original filename" pre-selected
              and badged Recommended. The other two ("Add a
              _remediated suffix" or "Use a different filename") are
              opt-in.<br />
              <strong>Why:</strong> the most common workflow for
              remediating an agency PDF is to replace the file in the
              CMS in place — every existing link on the website, in
              old emails, in shared documents, keeps working as long
              as the filename matches. The previous behavior
              automatically appended <em>_remediated</em> to the
              filename, which broke this workflow.<br />
              <strong>Safeguards:</strong> the "use a different
              filename" path explicitly warns the user that the change
              will break existing links and requires a second click of
              the Download button to confirm. There is no path
              traversal risk — the custom filename is treated only as
              a display name for the browser's save dialog and is
              capped, encoded, and forced to <code class="text-xs font-mono">.pdf</code>
              before being sent in the response header. The actual
              file on disk is always located by job ID, never by
              user-supplied filename.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Added</strong
            >
            — Audit reports can now be saved as PDF via the browser's
            print dialog.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the audit report page and
              the shared-report page each gained a "PDF (browser
              print)" button. Clicking it opens the browser's own
              print dialog, where the user picks "Save as PDF" as the
              destination. The page applies a print stylesheet that
              hides interactive controls, switches to black-on-white
              text, expands collapsed technical sections, and arranges
              page breaks cleanly.<br />
              <strong>What this does <em>not</em> change:</strong> no
              new server-side rendering happens — the PDF is created
              entirely by the user's own browser, on the user's own
              machine. No PDF content is transmitted to or stored on
              our server as part of this feature. The chosen filename
              is whatever the user types in the browser's save dialog
              and is not visible to us.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Fixed</strong
            >
            — Accessibility polish on the remediation result page.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the result page was
              showing layout shift after content loaded (a known
              accessibility annoyance for users on slow connections or
              with reduced-motion preferences), and result sections
              were appearing partway through the progress animation
              rather than after it. Both fixed.<br />
              <strong>Visible improvement:</strong> Lighthouse
              performance score on the result page rose from 84 to 96
              on desktop. No retention or privacy implications.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Operational improvements
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            New <code class="text-xs font-mono">AGENTS.md</code> at
            the repository root documents the load-bearing conventions
            for AI coding agents (Claude Code, Codex, Cursor, etc.) so
            engineers using those tools to extend the code base get
            oriented in one read. Not user-facing; reduces the chance
            of a misconfigured agent committing the wrong thing.
          </li>
          <li>
            The "Technical Details" expandable on the main results
            page now includes the same four pipeline diagrams already
            on the standalone
            <a
              href="/technical-details"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
              >Technical Details</a
            >
            page.
          </li>
        </ul>
      </article>

      <!-- v1.19.0 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.19.0
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: fleet
            integration + accessibility polish + retention-policy
            change
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          This release adds the fleet inventory integration (one HTTP
          call per PDF returns strict + practical grades plus a
          year-long shareable report link), expands the URL allowlist
          to cover all
          <code class="text-xs font-mono">*.illinois.gov</code>
          state-agency subdomains, bumps the shared-report retention
          window from 15 days to 365 days, and fixes seven accessibility
          rule violations across the public policy + technical-details
          pages. The most material policy change for an auditor reading
          this page is the retention bump — see the first finding below.
        </p>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Findings &amp; changes
        </h4>
        <ul class="space-y-3 text-sm text-[var(--text-secondary)] mb-4">
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Accepted</strong
            >
            — Shared-report retention window extended from 15 days to
            365 days.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> when someone creates a
              shareable audit-report link (either from the web UI's
              "Create Shareable Link" button or via the new fleet
              audit-by-URL automation), the resulting link now stays
              valid for one year instead of 15 days. This applies to
              the metadata record only — no PDF content is stored
              alongside it. After 365 days the row becomes eligible
              for the periodic cleanup sweep and the URL stops
              working.<br />
              <strong>Why:</strong> auditors and managers reviewing
              fleet-inventory reports (which list every PDF across
              ICJIA's sites) need report links that survive between
              quarterly review cycles. A 15-day TTL caused most links
              to break before the next review even happened.<br />
              <strong>Storage cost:</strong> the row holds scores,
              category findings, and timestamps — no PDF bytes. A
              100-PDF fleet at roughly 50 KB per record grows the
              database by about 5 MB per year. The tradeoff was
              evaluated and accepted in favor of usability.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Accepted</strong
            >
            — URL allowlist expanded so the fleet automation can audit
            PDFs across the full Illinois state-agency footprint.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What changed:</strong> the audit-by-URL endpoint
              previously accepted only a handful of explicit ICJIA
              subdomains. It now also accepts:
              <code class="text-xs font-mono">illinois.gov</code> (every
              state-agency subdomain),
              <code class="text-xs font-mono">icjia.cloud</code>,
              <code class="text-xs font-mono">icjia.app</code>, and
              <code class="text-xs font-mono">ilheals.com</code> (each
              including all subdomains).<br />
              <strong>Why:</strong> the ICJIA fleet audit lists PDFs
              across every site the agency operates and every partner
              agency. The previous narrow allowlist couldn't cover that
              fleet.<br />
              <strong>What it doesn't change:</strong> all of the
              existing protections still apply — the server still
              blocks private / local / loopback addresses (no SSRF
              into internal networks), still rejects oversized files
              (100 MB cap), still requires the fetched bytes to begin
              with the
              <code class="text-xs font-mono">%PDF-</code> header, and
              still rejects look-alike domains (a URL like
              <code class="text-xs font-mono">illinois.gov.evil.com</code>
              does <em>not</em> match the allowlist). The threat profile
              is the same as a person pasting any one of these URLs
              into the web interface.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Fixed</strong
            >
            — Seven accessibility rule violations on the public policy
            and technical-details pages.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> a full axe + Lighthouse
              audit found that the diagram boxes on these pages
              couldn't be reached via keyboard, that an inline link in
              this audit history section was distinguishable only by
              color (a barrier for colorblind readers), and that
              several scrollable code blocks couldn't be scrolled
              without a mouse.<br />
              <strong>How it was fixed:</strong> each scrollable region
              is now keyboard-focusable, the inline link is now
              underlined, and the diagram boxes' redundant ARIA labels
              were replaced with proper structural markup. Both pages
              now score a perfect 100 / 100 on both axe (no violations)
              and Lighthouse's accessibility audit.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Fixed</strong
            >
            — The new fleet endpoint reported the strict score in both
            the strict and practical slots of its response.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the new
              <code class="text-xs font-mono">/api/audit-url</code>
              endpoint had a key-name mismatch with the underlying
              scoring engine — what the engine internally calls
              "remediation" the user interface labels "practical." The
              endpoint looked for the wrong name, found nothing, and
              fell back to the strict score, so the practical column
              in the fleet output would have shown the strict number
              instead of the practical one.<br />
              <strong>How it was fixed:</strong> caught in the local
              smoke-test step before any caller integrated against
              the endpoint, so no production fleet report ever
              published the wrong number. The name mapping is now
              correct (verified against three test PDFs whose strict
              and practical scores genuinely differ).
            </p>
          </li>
        </ul>
      </article>

      <!-- v1.18.1 audit entry -->
      <article
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-4"
      >
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h3 class="text-lg font-bold text-[var(--text-heading)]">
            v1.18.1
          </h3>
          <span class="text-xs text-[var(--text-muted)]">
            Audited <strong>2026-05-18</strong> · scope: veraPDF
            integration correctness + remediation result-page UX
          </span>
        </header>

        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          A patch release with four operational fixes against the v1.18.0
          remediation feature. None of these findings expose private data
          or change the file-retention guarantees described elsewhere on
          this page. One finding is security-adjacent: an auditor who
          consulted the PDF/UA-1 compliance card on the remediation
          result page would have seen a silently wrong verdict in any
          deployment running a recent veraPDF version. Note: at the time
          of the fix, this feature flag was still off in production, so
          no real audit was shown the wrong verdict.
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
            — PDF/UA-1 compliance verdict was always shown as "not
            compliant," regardless of the actual PDF.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the tool calls a
              third-party validator (veraPDF) to report whether the
              remediated PDF technically conforms to the PDF/UA-1
              accessibility standard. The newest version of that
              validator changed the shape of its result data slightly
              (it now returns a list of profile results rather than a
              single one). The tool was reading the result in the old
              shape, so the verdict was always missing, and the missing
              verdict was treated as "not compliant." Any auditor
              looking at the compliance card on the result page would
              have been shown an incorrect technical verdict.<br />
              <strong>How it was fixed:</strong> the tool now handles
              both the new and old result shapes correctly. Verified
              against a live install of the latest veraPDF version. No
              production deployment had this feature enabled yet at the
              time of the fix, so no real audit was actually shown the
              wrong verdict.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-700/30 text-amber-200 mr-2">P2</span>
              Fixed</strong
            >
            — A second veraPDF shape change could have caused a crash
            inside the validation routine.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> in the same shape change
              that broke the verdict, veraPDF also moved its rule-by-rule
              detail list. A defensive fallback in the tool would have
              tried to read the new "count of failed rules" as if it
              were a list, which would have crashed the validation
              routine on certain inputs.<br />
              <strong>How it was fixed:</strong> the unsafe fallback was
              removed and the read order was updated to prefer the new
              location first. No crashes were observed in production —
              this was caught during the same review as the P1 above.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Fixed</strong
            >
            — Failure count under-reported on heavily-non-compliant
            PDFs.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> the tool reported a
              compliance-failure total based on the top 20 issues it
              displayed, rather than veraPDF's own total. On a deeply
              non-compliant PDF the displayed total would have been
              lower than reality.<br />
              <strong>How it was fixed:</strong> the tool now uses
              veraPDF's own total when available. Older veraPDF versions
              still use the "sum the displayed list" fallback.
            </p>
          </li>
          <li>
            <strong
              ><span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-700/30 text-blue-200 mr-2">P3</span>
              Fixed</strong
            >
            — The "Fix steps" links on the remediation result page were
            dead.
            <p class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
              <strong>What was wrong:</strong> clicking "Fix steps" next
              to an outstanding issue on the result page did nothing.
              The link tried to jump to a card that exists on the audit
              page but not the result page.<br />
              <strong>How it was fixed:</strong> each issue row now
              opens an inline accordion showing the detailed findings
              and numbered Adobe Acrobat fix steps right there on the
              result page — no navigation needed. Same content as the
              audit-page cards. Not a privacy or security issue, but a
              real usability problem for an auditor following up on
              outstanding items.
            </p>
          </li>
        </ul>

        <h4 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
          Operational improvements
        </h4>
        <ul class="space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
          <li>
            The Ubuntu deploy script
            (<code class="text-xs font-mono">rebuild.sh</code>) now
            auto-detects an installed veraPDF and, when it isn't
            installed, prints copy-paste install instructions including
            the persistence command so the path survives a server
            reboot. Reduces drift between development and production
            installs.
          </li>
        </ul>
      </article>

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
            class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
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
        tabindex="0"
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

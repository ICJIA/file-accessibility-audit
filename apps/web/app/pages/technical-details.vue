<script setup lang="ts">
// Public page — no auth middleware. Standalone companion to the
// Technical Details expandable on the audit page. Built for managers,
// developers, and curious staff who want an overview with diagrams
// rather than scrolling through the audit page's full prose.
import { useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'

definePageMeta({ middleware: [] })

const runtimeConfig = useRuntimeConfig()

useHead({
  title: 'Technical Details',
  meta: [
    {
      name: 'description',
      content:
        'How the ICJIA File Accessibility Audit tool analyzes and remediates PDFs — pipeline diagrams, open-source toolchain, and why PDF remediation is fundamentally limited.',
    },
  ],
  link: [
    {
      rel: 'canonical',
      href: `${runtimeConfig.public.siteUrl}/technical-details`,
    },
  ],
})

const wcag = useWcag()

const router = useRouter()
const hasHistory = ref(false)
onMounted(() => {
  hasHistory.value = typeof window !== 'undefined' && window.history.length > 1
})
function goBack(): void {
  if (hasHistory.value) router.back()
  else void router.push('/')
}

// Diagrams — kept deliberately simple: flowchart TD, short labels,
// no subgraphs, no HTML-in-labels. Reliability over richness.

const auditFlowDiagram = `flowchart TD
    A[Browser uploads PDF] --> B[Magic-byte + size check]
    B --> C[Hold in memory only]
    C --> D[qpdf analyzes structure]
    C --> E[pdfjs extracts content]
    D --> F[Combined results]
    E --> F
    F --> G[Scorer applies 9 categories]
    G --> H[A-F grade + findings]
    H --> I[Return to browser]`

const twoToolDiagram = `flowchart TD
    A[Uploaded PDF buffer] --> B[Run in parallel]
    B --> C[qpdf: structure tree, language, outlines, images, tables]
    B --> D[pdfjs: text, metadata, content order, per-page details]
    C --> E[QpdfResult]
    D --> F[PdfjsResult]
    E --> G[Scorer]
    F --> G
    G --> H[Weighted score across 9 categories]`

const remediationFlowDiagram = `flowchart TD
    A[User clicks Remediate] --> B[Re-upload PDF]
    B --> C[qpdf normalize]
    C --> D[Delete original + verify]
    D --> E[OpenDataLoader tags]
    E --> F[Delete normalized + verify]
    F --> G[qpdf check + veraPDF]
    G --> H[Re-audit + regression guard]
    H --> I[Output ready, 30 min TTL]
    I --> J[Single-use download]
    J --> K[Delete + verify ENOENT]`

const architectureDiagram = `flowchart TD
    A[Browser] --> B[Nginx reverse proxy]
    B --> C[Nuxt web app on port 5102]
    B --> D[Express API on port 5103]
    C --> D
    D --> E[qpdf binary]
    D --> F[OpenDataLoader Java]
    D --> G[veraPDF Java]
    D --> H[SQLite database]`
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10 space-y-10">
    <!-- Back nav -->
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
      <p class="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)] mb-3">
        Technical Details
      </p>
      <h1
        class="text-3xl sm:text-5xl font-black text-[var(--text-heading)] leading-tight"
      >
        How This Tool Works
      </h1>
      <p class="mt-4 text-sm text-[var(--text-secondary)] leading-relaxed">
        A diagram-led tour of the audit and auto-remediation pipelines.
        For the full prose treatment with code references, see the
        <em>Technical Details</em> expandable on the
        <NuxtLink to="/" class="text-[var(--link)] hover:text-[var(--link-hover)] underline">audit page</NuxtLink>.
        For the legal/compliance-facing version, see the
        <NuxtLink to="/data-retention" class="text-[var(--link)] hover:text-[var(--link-hover)] underline">data retention policy</NuxtLink>.
      </p>
    </header>

    <!-- 1. What this tool does -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        1. What this tool does
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        The tool answers two questions about a PDF:
      </p>
      <ul class="space-y-1.5 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-3">
        <li>
          <strong>Audit:</strong> "How accessible is this PDF, and what
          specifically is wrong?" — a weighted 0–100 score (A–F grade) across
          9 WCAG-aligned categories, a separate pass/fail
          <strong>WCAG {{ wcag.version }} conformance verdict</strong>, and category-level
          findings.
        </li>
        <li>
          <strong>Auto-remediate</strong> (optional, opt-in): "Can we add
          accessibility structure to this PDF without making it worse?" —
          runs an automated tagging pipeline, validates the output, and
          serves the improved file if every score profile holds or improves.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        Both happen on a single DigitalOcean server controlled by ICJIA.
        Nothing leaves the server. No AI service is contacted at any point.
      </p>
    </section>

    <!-- 2. Audit pipeline -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        2. The audit pipeline
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        The audit holds the uploaded PDF in memory only — never written
        to disk. Two open-source tools (qpdf for structure, pdfjs for
        content) run in parallel against the in-memory buffer; their
        combined output feeds the scorer.
      </p>

      <MermaidDiagram
        :source="auditFlowDiagram"
        title="Audit pipeline"
        :desc="`Browser uploads a PDF; the server validates magic bytes and size, holds the file in memory, runs qpdf and pdfjs in parallel against it, combines the results in the scorer, produces a grade, an independent WCAG ${wcag.version} conformance verdict, and category findings, returns to the browser, and discards the memory buffer.`"
      />

      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-4">
        Why two tools? Each is excellent at a different job. qpdf parses
        the PDF's internal object graph and structure tree — the parts a
        screen reader cares about. pdfjs (Mozilla's PDF rendering library)
        is excellent at extracting visible text and content order. Running
        both gives the scorer a richer signal than either alone.
      </p>

      <h3 class="text-lg font-semibold text-[var(--text-heading)] mt-6 mb-2">
        The score, and the conformance verdict
      </h3>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        The scorer produces <strong>two separate things</strong>, and the
        distinction matters:
      </p>
      <ul
        class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-4"
      >
        <li>
          <strong>The 0–100 score (A–F grade)</strong> is a weighted,
          partial-credit <em>prioritised-readiness</em> metric — it shows how
          close a document is and what to fix first. Weights reflect WCAG
          priority: text extractability carries the most (a scanned PDF is
          unusable, so nothing else matters), and reading order is weighted
          as a Level-A essential because out-of-order content makes a
          document unusable. Bookmarks — which map to the Level-AA "multiple
          ways" criterion and can be partly substituted by a clear heading
          structure — carry less.
        </li>
        <li>
          <strong>The WCAG {{ wcag.version }} conformance verdict</strong> is a separate,
          binary pass/fail. WCAG conformance is all-or-nothing per success
          criterion — one image without alt text fails 1.1.1 (Level A)
          outright — so a weighted score with partial credit
          <em>cannot</em> be a conformance claim. A document can score 90+
          ("A") and still fail WCAG. The verdict reports confirmed,
          machine-checkable failures; when it finds none it says exactly
          that — <em>not</em> "conformant", because color contrast,
          reading-order nuance, and the correctness of alt text and tags
          still require a human reviewer.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        Each category maps to the specific WCAG {{ wcag.version }} success criteria it
        evaluates:
      </p>
      <div class="overflow-x-auto mb-3">
        <table
          class="w-full text-xs border border-[var(--border-subtle)] rounded-lg"
        >
          <thead>
            <tr
              class="bg-[var(--surface-deep)] text-[var(--text-secondary)] uppercase tracking-wide"
            >
              <th class="text-left px-3 py-2 font-medium">Category</th>
              <th class="text-right px-3 py-2 font-medium">Weight</th>
              <th class="text-left px-3 py-2 font-medium">
                WCAG {{ wcag.version }} success criteria
              </th>
            </tr>
          </thead>
          <tbody
            class="text-[var(--text-muted)] divide-y divide-[var(--border-subtle)]"
          >
            <tr>
              <td class="px-3 py-1.5">Text Extractability</td>
              <td class="px-3 py-1.5 text-right font-mono">20%</td>
              <td class="px-3 py-1.5">1.1.1, 1.3.1 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Title &amp; Language</td>
              <td class="px-3 py-1.5 text-right font-mono">15%</td>
              <td class="px-3 py-1.5">2.4.2, 3.1.1 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Heading Structure</td>
              <td class="px-3 py-1.5 text-right font-mono">15%</td>
              <td class="px-3 py-1.5">1.3.1 (A), 2.4.6 (AA)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Alt Text on Images</td>
              <td class="px-3 py-1.5 text-right font-mono">15%</td>
              <td class="px-3 py-1.5">1.1.1 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Table Markup</td>
              <td class="px-3 py-1.5 text-right font-mono">10%</td>
              <td class="px-3 py-1.5">1.3.1 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Reading Order</td>
              <td class="px-3 py-1.5 text-right font-mono">10%</td>
              <td class="px-3 py-1.5">1.3.2 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Bookmarks / Navigation</td>
              <td class="px-3 py-1.5 text-right font-mono">5%</td>
              <td class="px-3 py-1.5">2.4.5 (AA)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Link Quality</td>
              <td class="px-3 py-1.5 text-right font-mono">5%</td>
              <td class="px-3 py-1.5">2.4.4 (A)</td>
            </tr>
            <tr>
              <td class="px-3 py-1.5">Form Accessibility</td>
              <td class="px-3 py-1.5 text-right font-mono">5%</td>
              <td class="px-3 py-1.5">1.3.1, 3.3.2, 4.1.2 (A)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        Color contrast (WCAG 1.4.3) is shown as <strong>Not assessed</strong>
        — the tool does not yet measure rendered contrast, and that is stated
        plainly rather than hidden as a passing result. A category reads
        <strong>Not applicable</strong> only when the document genuinely has
        no such content (no tables, no forms, no links); its weight is then
        redistributed across the categories that do apply.
      </p>

        <section class="mt-8">
          <h3 class="text-lg font-bold text-[var(--text-heading)] mb-2">
            WCAG 2.2 alignment
          </h3>
          <p class="text-[var(--text-muted)] leading-relaxed mb-3">
            This tool reports against <strong>WCAG {{ wcag.version }} Level AA</strong>, a strict
            superset of the WCAG 2.1 AA that IITAA 2.1 (§E205.4) and ADA Title II require. WCAG 2.2
            adds nine success criteria (six at Level A/AA) and removes one (4.1.1 Parsing, obsolete).
            The automated checks are unchanged — every machine-checkable criterion carried forward
            from 2.1. The new 2.2 criteria are interactive/manual; we never report them as automated
            failures. For documents with interactive form fields, the form-relevant new criteria
            (Target Size 2.5.8, Redundant Entry 3.3.7, Accessible Authentication 3.3.8) are listed in
            the verdict as <em>"not assessed — manual review"</em>.
          </p>
          <p class="text-[var(--text-muted)] leading-relaxed">
            For a plain-language manager summary, see
            <NuxtLink to="/wcag-2-2" class="text-[var(--link)] hover:text-[var(--link-hover)] underline">how WCAG 2.2 differs from 2.1</NuxtLink>.
            IITAA 2.1 does not yet reference WCAG 2.2, so 2.2 conformance is optional/forward-looking;
            WCAG 2.1 AA remains the legal minimum.
          </p>
        </section>
    </section>

    <!-- Two-tool parallel diagram -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        3. Why two tools?
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        Each tool sees the PDF differently. Running them in parallel lets
        the scorer reconcile a structural view (qpdf) with a content view
        (pdfjs) — useful for catching cases where a PDF claims structure
        it doesn't actually have, or vice versa.
      </p>

      <MermaidDiagram
        :source="twoToolDiagram"
        title="Two-tool parallel analysis"
        :desc="`The uploaded buffer runs through qpdf (structure tree, language, outlines, images, tables) and pdfjs (text, metadata, content order) in parallel. Their results combine in the scorer for a weighted score across 9 categories and an independent WCAG ${wcag.version} conformance verdict.`"
      />
    </section>

    <!-- 4. PDF format primer -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        4. What is a PDF, really?
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        <strong>A PDF is an export format, not a source format.</strong>
        Adobe created PDF in 1993 to solve "make a document look identical
        on every printer." You don't <em>write</em> in a PDF — you write
        in Word, InDesign, Pages, or Google Docs, and you
        <em>export to</em> PDF when you want to share the finished result.
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        That export step is where accessibility is won or lost. PDF natively
        stores <em>where every glyph appears on the page</em> — not what
        those glyphs mean. The semantic layer that makes a PDF accessible
        (the <strong>structure tree</strong>, added in PDF 1.4 in 2001) is
        optional. It only gets created if the export tool explicitly emits
        it (Word's "Document structure tags for accessibility,"
        InDesign's "Create Tagged PDF," etc.).
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        Without tags, a PDF reads like raw glyph positions to a screen
        reader — incoherent. With tags, it reads like a navigable document
        with headings, paragraphs, lists, tables, and image descriptions.
      </p>
    </section>

    <!-- 5. Why remediation is hard -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        5. Why remediation is fundamentally limited
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        Auditing is read-only — you walk the PDF's internal structure and
        report what's there. Remediation is read-modify-write — and PDFs
        make that genuinely hard:
      </p>
      <ul class="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2">
        <li>
          <strong>PDF was designed for print, not semantics.</strong> The
          structure tree was bolted on in 2001 and is optional.
        </li>
        <li>
          <strong>No canonical mapping from layout to semantics.</strong>
          Is a 14-pt bold line a heading or just emphasis? Software has
          to guess.
        </li>
        <li>
          <strong>Content stream and structure tree are coupled.</strong>
          Adding alt-text means mutating both sides coherently — most
          libraries handle one but not both.
        </li>
        <li>
          <strong>Tagged PDF spec is permissive.</strong> A PDF can satisfy
          the technical requirements for "being tagged" and still be
          inaccessible (e.g., every paragraph wrapped in &lt;P&gt; with no
          heading structure).
        </li>
        <li>
          <strong>Mistakes compound.</strong> A wrong heading misleads a
          screen reader; a corrupted cross-reference makes the entire PDF
          unreadable.
        </li>
        <li>
          <strong>Round-trip fidelity is the highest bar.</strong>
          Remediation must add semantic markup
          <em>while preserving every visual nuance</em>.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-3">
        Result: PDF auto-remediation works well for the machine-checkable
        parts of accessibility (structure presence, metadata, language
        declaration). It falls back to human judgment for the
        semantically-judged parts (alt-text quality, reading-order intent,
        decorative vs. informative classification).
      </p>
    </section>

    <!-- 6. Remediation pipeline -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        6. The remediation pipeline
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        When the optional auto-remediation feature is enabled, clicking
        <em>Remediate</em> triggers a multi-stage pipeline. Every
        intermediate file is deleted before the next stage starts, and
        every deletion is verified by an
        <code class="font-mono text-xs">fs.stat</code> ENOENT check.
      </p>

      <MermaidDiagram
        :source="remediationFlowDiagram"
        title="Remediation pipeline"
        desc="The user re-uploads the PDF. qpdf normalizes it; original deleted with verification. OpenDataLoader adds structure tags; normalized intermediate deleted with verification. qpdf check + veraPDF validate the output. A re-audit confirms no score profile regressed. If all clear, output is held for 30 minutes; user downloads via single-use token; output deleted with verification."
      />

      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-4">
        <strong>Why qpdf normalize first?</strong> OpenDataLoader's PDF
        writer corrupts the output xref table on certain modern Adobe
        InDesign 18 and Microsoft Word 365 inputs. The
        <code class="text-xs font-mono">qpdf --object-streams=disable</code>
        step decompresses object streams before ODL touches the file,
        which works around the bug entirely. This was discovered during
        the v1.18.0 feasibility spike — see
        <code class="text-xs font-mono">docs/spike-remediation-results.md</code>.
      </p>
    </section>

    <!-- 7. Application architecture -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        7. Application architecture
      </h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        Two small services run on a single DigitalOcean droplet, managed
        by PM2 and fronted by Nginx. Every external dependency is open
        source and runs locally.
      </p>

      <MermaidDiagram
        :source="architectureDiagram"
        title="Application architecture"
        desc="Browser talks to Nginx reverse proxy. Nginx routes to either the Nuxt web app (port 5102) or the Express API (port 5103). The web app makes some API calls back to Express. Express shells out to qpdf, OpenDataLoader Java, and veraPDF Java; it reads and writes SQLite locally. No external services."
      />
    </section>

    <!-- 8. The toolchain -->
    <section>
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        8. The open-source toolchain
      </h2>
      <div class="overflow-x-auto" tabindex="0">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
              <th class="py-2 pr-4 font-medium">Tool</th>
              <th class="py-2 pr-4 font-medium">Job</th>
              <th class="py-2 pr-4 font-medium">License</th>
              <th class="py-2 font-medium">Pipeline</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-secondary)] text-xs">
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-mono">qpdf</td>
              <td class="py-2.5 pr-4">Structure parsing + PDF normalization</td>
              <td class="py-2.5 pr-4">Apache 2.0</td>
              <td class="py-2.5">Audit + Remediation</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-mono">pdfjs-dist</td>
              <td class="py-2.5 pr-4">Text + metadata extraction</td>
              <td class="py-2.5 pr-4">Apache 2.0</td>
              <td class="py-2.5">Audit</td>
            </tr>
            <tr class="border-b border-[var(--border)]/40">
              <td class="py-2.5 pr-4 font-mono">OpenDataLoader PDF</td>
              <td class="py-2.5 pr-4">Rule-based PDF auto-tagging</td>
              <td class="py-2.5 pr-4">Apache 2.0</td>
              <td class="py-2.5">Remediation</td>
            </tr>
            <tr>
              <td class="py-2.5 pr-4 font-mono">veraPDF</td>
              <td class="py-2.5 pr-4">PDF/UA-1 (ISO 14289-1) validation</td>
              <td class="py-2.5 pr-4">MPL 2.0</td>
              <td class="py-2.5">Remediation</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-4">
        <strong>Why OpenDataLoader matters:</strong> commercial PDF
        auto-tagging SDKs (Apryse, Adobe PDF Services, PDFix, CommonLook)
        start at ~$1,500/year and most are enterprise-quoted opaque
        pricing. OpenDataLoader, released as Apache 2.0 in 2024, is the
        first credible open-source alternative — and it ranks #1 overall
        (0.907) in 2026 PDF-extraction benchmarks. For this tool, it
        replaces what previously cost thousands a year with an
        <code class="text-xs font-mono">apt install openjdk-17-jre-headless</code>.
      </p>
    </section>

    <!-- 9. Cross-links to other docs -->
    <section
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
        Related documents
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NuxtLink
          to="/data-retention"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Compliance
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            Data Retention Policy
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Auditor-ready document covering retention periods, lifecycle
            audit trail, AI usage statement, and red/blue team security
            audit history.
          </p>
        </NuxtLink>
        <NuxtLink
          to="/"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            App
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            Audit page
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Upload a PDF and run the audit. Full prose
            <em>Technical Details</em> dropdown at the bottom of that page
            with code references and tool-by-tool deep dives.
          </p>
        </NuxtLink>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Code
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            Source on GitHub ↗
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Full open-source repository. Every claim above is verifiable
            against the code there.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors block"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            History
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            Changelog ↗
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Per-release notes for every version, including the addition of
            the auto-remediation feature in v1.18.0.
          </p>
        </a>
      </div>
    </section>
  </div>
</template>

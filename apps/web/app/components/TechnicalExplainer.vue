<template>
  <!-- Technical Details (always visible, expandable) -->
  <details
    class="mt-12 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden group technical-details"
  >
    <summary
      class="px-3 sm:px-6 py-4 cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors select-none flex items-center gap-2"
    >
      <svg
        class="w-4 h-4 transition-transform group-open:rotate-90"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
      Technical Details: How This Tool Analyzes Documents & Remediates PDFs
    </summary>
    <div
      class="px-3 sm:px-6 pb-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border)]"
    >
      <!-- Overview -->
      <div class="pt-5">
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Overview: What This Tool Does</h3>
        <p class="text-[var(--text-muted)] mb-3">
          This tool checks whether a document — a PDF, Word (.docx), PowerPoint (.pptx), or Excel
          (.xlsx) file — can be read by people who use <strong>assistive technology</strong> —
          screen readers, braille displays, and other tools used by people with disabilities. It
          does this by examining the internal structure of the file, not just its visual appearance.
          A document that looks fine on screen may be completely unreadable to a screen reader if it
          lacks the right internal markup.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          The tool evaluates documents against
          <a
            href="https://www.w3.org/WAI/WCAG21/quickref/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >WCAG 2.1 Level AA</a
          >
          (the international standard for web content accessibility) and
          <a
            href="https://www.ada.gov/resources/title-ii-rule/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >ADA Title II</a
          >
          digital accessibility requirements (U.S. federal law requiring state and local government
          digital content to be accessible; compliance due April 26, 2027 for entities of 50,000 or
          more and April 26, 2028 for smaller ones and special districts), as adopted in Illinois by
          the IITAA 2.1 standard.
        </p>

        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          What Is a PDF, Really? (And Why It's Different from Word)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          To understand why some PDFs are accessible and others aren't — and why "fixing" an
          inaccessible PDF can be so much harder than it looks — it helps to know what a PDF
          actually <em>is</em>
          under the hood. Most people use PDFs every day without ever thinking about it. Here's the
          short version.
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          <strong>A PDF is an export, not a source document.</strong>
          Adobe created the Portable Document Format in 1993 to solve a specific problem: making a
          file that <em>looks identical</em> on every printer, every monitor, every operating
          system. You don't <em>write</em> in a PDF — you write in Word, InDesign, Pages, or Google
          Docs, and then you <em>export to</em> PDF when you want to share the finished result. PDF
          is the printed-and- mailed envelope at the end of the workflow, not the word-processor you
          used to draft the letter.
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          <strong
            >The difference between Word and PDF is about <em>what each format stores</em>:</strong
          >
        </p>
        <pre
          class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-emerald-300">Word (.docx) says:</span>
  &lt;h1&gt;Annual Report 2024&lt;/h1&gt;
  &lt;p&gt;In fiscal year 2024…&lt;/p&gt;
  &lt;img alt="Bar chart showing arrests by month" src="…" /&gt;

<span class="text-amber-300">PDF says:</span>
  Page 1, x=72, y=720, font=Arial-Bold, size=24pt: glyph 'A'
  Page 1, x=85, y=720, font=Arial-Bold, size=24pt: glyph 'n'
  Page 1, x=98, y=720, font=Arial-Bold, size=24pt: glyph 'n'
  Page 1, x=72, y=680, font=Arial,      size=11pt: glyph 'I'
  Page 1, x=78, y=680, font=Arial,      size=11pt: glyph 'n'
  Page 1, x=72, y=200, image XObject ref=42 (768 x 432 pixels)
  …</pre>
        <p class="text-[var(--text-muted)] mt-3 mb-3">
          Word stores the <em>meaning</em> of your content. The
          <code class="text-xs font-mono">&lt;h1&gt;</code> tag tells <em>any</em> program reading
          the file: "this is a top-level heading." The
          <code class="text-xs font-mono">&lt;img&gt;</code>
          tag has an
          <code class="text-xs font-mono">alt</code> attribute that describes the picture. A screen
          reader can read a Word file and navigate it like a webpage because the meaning is right
          there in the file.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          PowerPoint (.pptx) and Excel (.xlsx) files store meaning the same way Word does — all
          three are the same Office Open XML family under the hood — which is why this tool can
          audit all of them directly as source documents.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          PDF stores <em>where every glyph goes on the page</em>. That's it. A PDF doesn't natively
          know which glyphs are a heading and which are a paragraph — only that this letter is here,
          that letter is there, in this font, in this color. When you read a PDF, your brain does
          the work of recognizing "the big bold text at the top must be a heading." A screen reader
          can't do that from glyph positions alone — it would just read each glyph in sequence,
          which sounds like gibberish.
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          <strong>So how can a PDF be accessible at all?</strong>
          Starting in 2001 (PDF version 1.4), Adobe added an
          <em>optional</em> second layer to the format called the
          <strong>structure tree</strong> (or "tags"). This is a separate invisible layer that runs
          alongside the visual content and says "the glyphs that draw 'Annual Report 2024' belong to
          a <code class="text-xs font-mono">&lt;H1&gt;</code> element. The image at x=72, y=200 is a
          <code class="text-xs font-mono">&lt;Figure&gt;</code> element with alt-text 'Bar chart
          showing arrests by month'." Screen readers read the structure tree first, then jump to the
          visual content based on what the tree tells them.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          A PDF that has this layer is called a
          <strong>"tagged PDF."</strong> A PDF without it is <strong>"untagged."</strong> Whether a
          PDF gets tagged depends on how it was exported. In Word:
          <em>File → Save As → PDF → Options → "Document structure tags for accessibility"</em>
          (checked by default in recent versions, but commonly turned off on older Office installs
          or "minimum size" exports). In InDesign:
          <em>File → Export → Adobe PDF (Print) → "Create Tagged PDF"</em>. Pages and Google Docs
          are similar. If that box is unchecked, you get an untagged PDF — visually identical, but
          invisible to screen readers.
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          <strong>The structure tree itself looks like a webpage's DOM tree,</strong>
          because it borrows the same ideas:
        </p>
        <pre
          class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-sky-300">StructTreeRoot</span>
└── <span class="text-sky-300">Document</span>
    ├── <span class="text-sky-300">H1</span> "Annual Report 2024"
    ├── <span class="text-sky-300">P</span>  "In fiscal year 2024, the agency processed…"
    ├── <span class="text-sky-300">Figure</span> (<span class="text-emerald-300">/Alt</span> "Bar chart showing arrests by month")
    ├── <span class="text-sky-300">H2</span> "Methodology"
    ├── <span class="text-sky-300">P</span>  "Data was collected from…"
    └── <span class="text-sky-300">Table</span>
        ├── <span class="text-sky-300">TR</span>
        │   ├── <span class="text-sky-300">TH</span> (<span class="text-emerald-300">Scope=Col</span>) "County"
        │   ├── <span class="text-sky-300">TH</span> (<span class="text-emerald-300">Scope=Col</span>) "Arrests"
        │   └── <span class="text-sky-300">TH</span> (<span class="text-emerald-300">Scope=Col</span>) "Year"
        └── <span class="text-sky-300">TR</span>
            ├── <span class="text-sky-300">TD</span> "Cook"
            ├── <span class="text-sky-300">TD</span> "12,345"
            └── <span class="text-sky-300">TD</span> "2024"</pre>
        <p class="text-[var(--text-muted)] mt-3 mb-3">
          Standard tag types include
          <code class="text-xs font-mono">Document</code>,
          <code class="text-xs font-mono">Sect</code>,
          <code class="text-xs font-mono">H1</code> through
          <code class="text-xs font-mono">H6</code>, <code class="text-xs font-mono">P</code>,
          <code class="text-xs font-mono">L</code> / <code class="text-xs font-mono">LI</code> (list
          / list item), <code class="text-xs font-mono">Table</code> /
          <code class="text-xs font-mono">TR</code> / <code class="text-xs font-mono">TH</code> /
          <code class="text-xs font-mono">TD</code>, <code class="text-xs font-mono">Figure</code>,
          <code class="text-xs font-mono">Caption</code>,
          <code class="text-xs font-mono">Form</code>, <code class="text-xs font-mono">Link</code>,
          and <code class="text-xs font-mono">Artifact</code> (used for purely decorative content
          that screen readers should skip). Each can carry attributes like
          <code class="text-xs font-mono">/Alt</code> (alt text for figures),
          <code class="text-xs font-mono">/Lang</code>
          (language declaration), and
          <code class="text-xs font-mono">Scope</code> (whether a
          <code class="text-xs font-mono">TH</code> is a row or column header).
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          Linking these tags back to the glyphs they describe uses
          <strong>Marked Content Identifiers</strong> (MCIDs). Each chunk of content in the page's
          drawing instructions is wrapped in a marker (<code class="text-xs font-mono"
            >/MCID 7 … /EMC</code
          >), and the corresponding structure tree node points back at that marker. It's the same
          idea as <code class="font-mono">id</code>
          attributes connecting HTML elements to JavaScript handlers — a separate identifier layer
          that knits two parallel representations together.
        </p>

        <p class="text-[var(--text-muted)] mb-3">
          <strong
            >This architecture is why retrofitting accessibility into an existing PDF is so much
            harder than getting it right at export.</strong
          >
          When Word exports a tagged PDF, it already knows your headings are headings — it just
          copies that semantic information into the structure tree. When somebody hands you an
          untagged PDF and asks you to fix it, the only thing left is the glyph positions.
          Reverse-engineering "what was this heading?" from "14-pt bold text at the top of page 2"
          is what auto-remediation tools attempt, but with the same fundamental limitation a human
          would have: it's a guess based on visual cues, not a recall of authorial intent.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>The practical takeaway:</strong> the most reliable path to an accessible PDF is to
          fix accessibility issues in the <em>source document</em> (Word, InDesign, etc.) and
          re-export with tagging enabled. The next-best path — and what this tool's optional
          auto-remediation feature does — is to take an already-exported PDF and add structure tags
          after the fact. The audit results page surfaces this distinction in the "The best path to
          accessibility starts at the source" notice.
        </p>

        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">How It Works</h3>
        <p class="text-[var(--text-muted)] mb-3">
          When you upload a <strong>PDF</strong>, the server runs three independent, open-source
          checks <strong>one after another</strong> — one reads the PDF's internal structure (tags,
          bookmarks, form fields), one extracts text and metadata from every page, and veraPDF
          validates the file against the PDF/UA standard — PDF/UA-1 (ISO 14289-1), or PDF/UA-2 (ISO
          14289-2) when the document declares it — and, since v1.97.0, against its machine-testable
          WCAG 2.2 profile as an independent second opinion; each is reported on the audit as its
          own panel. The combined output of the first two feeds a scorer that evaluates nine
          accessibility categories and produces a weighted overall score.
          <strong>Word, PowerPoint, and Excel</strong> files skip that two-tool step entirely —
          they're already ZIP archives of XML, so the server unzips them with JSZip and reads the
          relevant parts with fast-xml-parser inside a dedicated, short-lived child process (no
          external binary; killed on timeout), then scores the result against a category set adapted
          for that format (see "How Scores Are Calculated" below). No data is sent to third-party
          services or AI models — all processing happens on the server (hosted on
          <a
            href="https://www.digitalocean.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >DigitalOcean</a
          >
          cloud infrastructure). The uploaded file is deleted (or discarded from memory) immediately
          after analysis — no file content is retained on the server.
        </p>
        <pre
          class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-sky-300">PDF:</span>
  File → [validate type &amp; size]
       → in order: <span class="text-emerald-300">QPDF</span> (structure) → <span class="text-emerald-300">PDF.js</span> (content) → <span class="text-emerald-300">veraPDF</span> (PDF/UA)
       → Scorer (9 categories) → Weighted Score → Report

<span class="text-sky-300">Word / PowerPoint / Excel:</span>
  File → [validate type &amp; size]
       → <span class="text-emerald-300">JSZip</span> + <span class="text-emerald-300">fast-xml-parser</span> (short-lived child process)
       → Scorer (adapted categories) → Weighted Score → Report</pre>

        <p class="text-[var(--text-muted)] mt-3">
          Since v1.100.0 the web page usually drives this pipeline through a progress variant (<code
            class="text-xs font-mono"
            >POST /api/analyze-job</code
          >
          + status polling) that runs the identical steps and reports each one's real state while
          you wait — the synchronous endpoint above remains unchanged for every other caller and as
          the page's automatic fallback.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>An audit survives leaving the page.</strong> A single-file upload runs as a
          server-side job: the browser posts the file, gets back a job identifier and a one-time
          key, and polls for progress. The audit therefore does not depend on the page staying open
          &mdash; it runs to completion on the server whether or not anyone is watching, and the
          finished report waits in memory until a page collects it or ten minutes pass. Since
          v1.147.0 the page keeps that identifier and key in the browser&rsquo;s per-tab session
          storage, so following the status link (a server route, so a real page load), reloading, or
          clicking any in-app link no longer discards the work: on return the page rejoins the same
          job and carries on, and a report that had already arrived is re-rendered from the copy the
          browser kept. Nothing is uploaded twice. A batch still cannot survive leaving &mdash; its
          queue holds the files themselves &mdash; so the warning before navigating away now appears
          only when leaving would genuinely lose something.
        </p>
        <p class="text-[var(--text-muted)] mt-3">
          Files the tool cannot audit — legacy binary Office formats (.doc, .xls, .ppt, .rtf), CSV
          exports, images — are refused up front with a specific explanation instead of a generic
          error, even when the file has been renamed (the format is detected from content, not the
          name). Service health and anonymous usage totals are published on the public
          <a
            href="/status?html"
            :target="auditInProgress ? '_blank' : undefined"
            :rel="auditInProgress ? 'noopener noreferrer' : undefined"
            class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >status page<span v-if="auditInProgress" class="sr-only">
              (opens in a new tab so your audit keeps running)</span
            ></a
          >.
        </p>

        <div class="mt-4">
          <DiagramFigure
            name="audit-flow"
            title="Audit pipeline — visual flow"
            desc="Browser uploads a file; the server validates magic bytes and size. A PDF is written to a short-lived temp copy: qpdf analyzes its structure, pdfjs then extracts its content, and veraPDF runs two checks one after the other: PDF/UA conformance (PDF/UA-1, or PDF/UA-2 when the document declares it) and its machine-testable WCAG 2.2 profile. A Word, PowerPoint, or Excel file is unzipped in memory with JSZip and parsed with fast-xml-parser instead — no temp file, no external tools. Either path feeds the scorer, which returns a grade, WCAG verdict, and findings to the browser, then discards the memory buffer."
          />
        </div>
      </div>

      <!-- App Architecture -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Application Architecture</h3>
        <p class="text-[var(--text-muted)] mb-3">
          The application is a monorepo with two components, both running on the same DigitalOcean
          droplet:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
              Frontend (port 5102)
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              A <strong>Nuxt 4</strong> (Vue 3) web application that provides the user interface —
              the upload form, progress indicators, score cards, export buttons, and shareable
              report pages. Styled with Tailwind CSS and Nuxt UI. Served as a server-rendered app
              via Nitro.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
              Backend API (port 5103)
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              An <strong>Express</strong> (Node.js/TypeScript) server that handles file uploads,
              runs QPDF/PDF.js analysis on PDFs and a child-process OOXML parser on
              Word/PowerPoint/Excel files, scores the results, and stores shared reports in a
              <strong>SQLite</strong> database (WAL mode). There are no accounts or sign-in — the
              tool is free and open to use, and stores no email addresses, IP addresses, or browser
              identifiers. Managed by PM2 in production.
            </p>
          </div>
        </div>
        <p class="text-[var(--text-muted)] mt-3">
          Both processes are managed by <strong>PM2</strong> behind an
          <strong>nginx</strong> reverse proxy on a single DigitalOcean droplet provisioned via
          <strong>Laravel Forge</strong>. The frontend proxies API requests to the backend — the
          user's browser never communicates directly with the API server.
        </p>

        <div class="mt-4">
          <DiagramFigure
            name="architecture"
            title="Application architecture"
            desc="Browser talks to Nginx reverse proxy. Nginx routes to either the Nuxt web app (port 5102) or the Express API (port 5103). The web app makes some API calls back to Express. For PDFs, Express shells out to qpdf, OpenDataLoader Java, and veraPDF Java; for Word, PowerPoint, and Excel files, it parses OOXML with JSZip and fast-xml-parser in a short-lived child process instead. Express reads and writes SQLite locally. No external services."
          />
        </div>
      </div>

      <!-- QPDF -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">
          Tool 1: QPDF (PDF Structure Extraction)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          <a
            href="https://qpdf.readthedocs.io/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >QPDF</a
          >
          is an open-source C++ command-line program for inspecting and transforming PDF files. It
          is maintained by Jay Berkenbilt and is widely used in PDF archival libraries, digital
          preservation projects, and accessibility workflows. Think of QPDF as a tool that can "open
          up" a PDF and read its internal blueprint — not just the words on the page, but the hidden
          structural information that tells assistive technology how the document is organized.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>How it's called:</strong> The server invokes QPDF as a subprocess with the
          <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded">--json</code>
          flag, which outputs the PDF's complete internal object graph as machine-readable JSON. The
          server writes the uploaded PDF to a temporary file, runs
          <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded"
            >qpdf --json /tmp/&lt;uuid&gt;.pdf</code
          >, parses the resulting JSON, and immediately deletes the temp file. The subprocess has a
          30-second timeout and a 50 MB output buffer to handle complex documents safely.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>Why QPDF?</strong> A PDF file is not a simple document — internally, it is a
          collection of numbered "objects" (text streams, images, fonts, bookmarks, form fields,
          tags) connected by cross-references. QPDF can decode and dump this entire object graph as
          structured data, which lets the tool inspect every accessibility-relevant feature without
          relying on visual rendering. No other open-source tool provides this level of structural
          access to PDFs.
        </p>
        <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">
          What QPDF extracts
        </h4>
        <div class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto">
          <table class="w-full text-xs">
            <caption class="sr-only">
              Data QPDF extracts from a PDF, its source, and what it's used for
            </caption>
            <thead>
              <tr
                class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
              >
                <th scope="col" class="text-left px-4 py-2 font-medium">Data</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">PDF Source</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">Used For</th>
              </tr>
            </thead>
            <tbody class="text-[var(--text-muted)]">
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">StructTreeRoot</td>
                <td class="px-4 py-2">Catalog <code>/StructTreeRoot</code></td>
                <td class="px-4 py-2">
                  Whether the PDF is "tagged" (has a semantic structure tree)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Language declaration</td>
                <td class="px-4 py-2">Catalog <code>/Lang</code></td>
                <td class="px-4 py-2">Language accessibility (screen reader pronunciation)</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Headings (H1–H6)</td>
                <td class="px-4 py-2">
                  Structure elements with <code>/S</code> = <code>/H</code>, <code>/H1</code>…<code
                    >/H6</code
                  >
                </td>
                <td class="px-4 py-2">
                  Heading presence, hierarchy validation, level-skip detection
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Outlines / Bookmarks</td>
                <td class="px-4 py-2">
                  <code>/Outlines</code> → <code>/First</code>/<code>/Next</code>
                  chain
                </td>
                <td class="px-4 py-2">Bookmark count for the navigation advisory</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Tables &amp; structure</td>
                <td class="px-4 py-2">
                  Structure elements <code>/Table</code>, <code>/TR</code>, <code>/TH</code>,
                  <code>/TD</code>, <code>/Caption</code>, <code>/Scope</code>,
                  <code>/Headers</code>
                </td>
                <td class="px-4 py-2">
                  Header cells, scope attributes, row structure, nesting, captions, column
                  consistency, header-data associations
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Images &amp; figures</td>
                <td class="px-4 py-2">
                  XObjects (<code>/Image</code>) + structure elements (<code>/Figure</code> with
                  <code>/Alt</code>)
                </td>
                <td class="px-4 py-2">Image detection and alt text presence</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Form fields</td>
                <td class="px-4 py-2">
                  Widget annotations + <code>/AcroForm</code> <code>/Fields</code> +
                  <code>/TU</code> tooltip
                </td>
                <td class="px-4 py-2">Whether form fields have accessible labels</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Reading order MCIDs</td>
                <td class="px-4 py-2">
                  Numeric <code>/K</code> values (Marked Content IDs) in structure tree
                </td>
                <td class="px-4 py-2">
                  Content sequence validation — detects out-of-order reading
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Lists</td>
                <td class="px-4 py-2">
                  Structure elements <code>/L</code>, <code>/LI</code>, <code>/Lbl</code>,
                  <code>/LBody</code>
                </td>
                <td class="px-4 py-2">
                  List detection, well-formedness (label + body per item), nesting depth
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Paragraphs</td>
                <td class="px-4 py-2">Structure elements with <code>/S</code> = <code>/P</code></td>
                <td class="px-4 py-2">
                  Text organization — whether body text is structurally tagged
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">MarkInfo &amp; artifacts</td>
                <td class="px-4 py-2">Catalog <code>/MarkInfo</code> → <code>/Marked</code></td>
                <td class="px-4 py-2">
                  Whether content is distinguished from artifacts (headers, footers, watermarks)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Role mapping</td>
                <td class="px-4 py-2"><code>/RoleMap</code> on Catalog or StructTreeRoot</td>
                <td class="px-4 py-2">
                  Custom tag mappings to standard PDF roles (e.g.,
                  <code>Title → H1</code>)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Tab order</td>
                <td class="px-4 py-2">Page objects <code>/Tabs</code></td>
                <td class="px-4 py-2">Whether keyboard navigation follows the structure tree</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Font embedding</td>
                <td class="px-4 py-2">
                  FontDescriptor <code>/FontFile</code>, <code>/FontFile2</code>,
                  <code>/FontFile3</code>
                </td>
                <td class="px-4 py-2">
                  Whether the fonts used to display text are embedded (non-embedded fonts can cause
                  garbled text; fonts no content stream can select, or that never display visible
                  text, are exempt)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Language spans</td>
                <td class="px-4 py-2">Structure elements with their own <code>/Lang</code></td>
                <td class="px-4 py-2">Inline language declarations for foreign-language content</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">PDF/UA identifier</td>
                <td class="px-4 py-2">XMP metadata stream (<code>pdfuaid:part</code>)</td>
                <td class="px-4 py-2">
                  Whether the document claims PDF/UA (ISO 14289) accessibility conformance
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Artifact elements</td>
                <td class="px-4 py-2">
                  Structure elements with <code>/S</code> =
                  <code>/Artifact</code>
                </td>
                <td class="px-4 py-2">
                  Decorative content (headers, footers, watermarks) distinguished from real content
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">ActualText &amp; expansion</td>
                <td class="px-4 py-2">
                  <code>/ActualText</code> and <code>/E</code> on structure elements
                </td>
                <td class="px-4 py-2">
                  Screen reader text overrides for ligatures, symbols, and abbreviation expansions
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Footnotes &amp; formulas</td>
                <td class="px-4 py-2">
                  <code>/Note</code> elements (<code>/ID</code>) and <code>/Formula</code> elements
                  (<code>/Alt</code>)
                </td>
                <td class="px-4 py-2">
                  Footnote linkability advisory (Matterhorn 19); formulas without a spoken
                  alternative reduce the alt-text score (v1.92.0)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Annotation tagging (OBJR)</td>
                <td class="px-4 py-2">
                  Structure-tree <code>/OBJR</code> references vs. visible widget, link, and markup
                  annotations
                </td>
                <td class="px-4 py-2">
                  Form-field widgets no structure element references reduce Form Accessibility;
                  comments and markup get tagging advisories (v1.94.0; Matterhorn 28)
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2">Document behaviors</td>
                <td class="px-4 py-2">
                  JavaScript actions, multimedia annotations, optional-content layers
                  (<code>/OCG</code>), reference XObjects, embedded files (<code>/EF</code> +
                  <code>/Desc</code>), signature fields
                </td>
                <td class="px-4 py-2">
                  Disclosed as behaviors advisories so nothing a reader will encounter is silently
                  skipped (v1.92.0&ndash;v1.94.0)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PDF.js -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">
          Tool 2: PDF.js (Content &amp; Metadata Extraction)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          <a
            href="https://mozilla.github.io/pdf.js/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >PDF.js</a
          >
          is Mozilla's open-source JavaScript PDF renderer — the same library that powers Firefox's
          built-in PDF viewer, used by hundreds of millions of people. While QPDF reads the internal
          blueprint, PDF.js reads the PDF the way a human would: it renders each page and extracts
          the actual text content, metadata (title, author, language), and interactive elements like
          links. It runs server-side via Node.js, processing every page of the uploaded document.
        </p>
        <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">
          What PDF.js extracts
        </h4>
        <div class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto">
          <table class="w-full text-xs">
            <caption class="sr-only">
              Data PDF.js extracts, its extraction method, and what it's used for
            </caption>
            <thead>
              <tr
                class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
              >
                <th scope="col" class="text-left px-4 py-2 font-medium">Data</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">Method</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">Used For</th>
              </tr>
            </thead>
            <tbody class="text-[var(--text-muted)]">
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Text content</td>
                <td class="px-4 py-2"><code>page.getTextContent()</code> per page</td>
                <td class="px-4 py-2">Text extractability (minimum 50 chars = "has text")</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Title, Author, Language</td>
                <td class="px-4 py-2"><code>doc.getMetadata()</code></td>
                <td class="px-4 py-2">
                  Title/language scoring (filename-like titles are rejected)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Links &amp; link text</td>
                <td class="px-4 py-2">
                  <code>page.getAnnotations()</code> + spatial text matching
                </td>
                <td class="px-4 py-2">Link quality — detects raw URLs vs. descriptive text</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Image count (approx.)</td>
                <td class="px-4 py-2">
                  <code>page.getOperatorList()</code> + image object resolution
                </td>
                <td class="px-4 py-2">
                  Fallback image detection when QPDF finds no tagged images — deduplicates per page,
                  filters out images smaller than 50px (spacers, borders). Count is approximate and
                  may include decorative graphics.
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Outlines</td>
                <td class="px-4 py-2"><code>doc.getOutline()</code></td>
                <td class="px-4 py-2">Bookmark detection (cross-referenced with QPDF)</td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Unmapped glyphs</td>
                <td class="px-4 py-2">
                  <code>getTextContent()</code> character codes in the Unicode Private Use Areas or
                  U+FFFD
                </td>
                <td class="px-4 py-2">
                  Text that renders fine but extracts as unpronounceable symbols — caps Text
                  Extractability when heavy (v1.94.0; Matterhorn 10)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Untagged visible text</td>
                <td class="px-4 py-2">
                  <code>getTextContent({includeMarkedContent})</code> marked-content stream per page
                </td>
                <td class="px-4 py-2">
                  Visible, non-artifact text painted outside every tagged run — caps Text
                  Extractability when heavy; affected pages are named (v1.94.0; Matterhorn 01)
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2">Empty pages</td>
                <td class="px-4 py-2">Per-page text length &lt; 10 chars</td>
                <td class="px-4 py-2">
                  Detects blank pages or pages with content only as images (may need OCR)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-[var(--text-muted)] mt-3">
          <strong>Link text extraction</strong> uses a spatial matching algorithm: for each link
          annotation, PDF.js finds text items whose coordinates fall within the link's bounding
          rectangle (±5px tolerance), then joins them to determine the visible link text. This is
          how the tool distinguishes descriptive links ("View the full report") from raw URLs
          ("https://example.com/report.pdf").
        </p>
      </div>

      <!-- Why two tools -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Why Two Tools?</h3>
        <p class="text-[var(--text-muted)] mb-3">
          No single open-source library can extract both the low-level PDF structure (tag trees,
          object references, XObjects) <em>and</em> the rendered text content. Each tool sees a
          different layer of the document:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">QPDF sees:</p>
            <p class="text-xs text-[var(--text-muted)]">
              Structure tags, heading hierarchy, table markup, image objects, form field labels,
              bookmark chains, reading order markers — the "skeleton" of the document.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">PDF.js sees:</p>
            <p class="text-xs text-[var(--text-muted)]">
              Rendered text content, document title and metadata, link URLs and their visible text,
              page count, image rendering operations — the "surface" of the document as a user would
              read it.
            </p>
          </div>
        </div>
        <p class="text-[var(--text-muted)] mt-3">
          By cross-referencing both outputs, the scorer can answer questions that neither tool could
          answer alone. For example: "Does this image have alt text?" requires QPDF to find the
          image object and its Figure tag, while "Is there any readable text on this page at all?"
          requires PDF.js to attempt text extraction. The two run one after the other rather than at
          once: PDF.js works through a document page by page and holds the server's attention while
          it does, which used to leave qpdf waiting long enough to be cut off as if it had stalled —
          on documents it actually reads in a second or two. Running them in order costs almost
          nothing on a long report and removes that failure entirely.
        </p>

        <div class="mt-4">
          <DiagramFigure
            name="two-tool"
            title="Two-tool analysis (PDF)"
            desc="For a PDF, the uploaded buffer runs through qpdf (structure tree, language, outlines, images, tables) and then pdfjs (text, metadata, content order); their results combine in the scorer for a weighted score across 9 categories. Word, PowerPoint, and Excel files don't need this two-tool split — a single JavaScript parser (JSZip + fast-xml-parser, in a short-lived child process) reads their XML directly."
          />
        </div>
      </div>

      <!-- How a report is presented -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">How a report is presented</h3>
        <p class="text-[var(--text-muted)] mb-3">
          Every report opens in the <strong>Visual view</strong>: the grade, then a numbered action
          plan that walks through one fix at a time in plain language, with instructions for both
          the source document and Adobe Acrobat. The <strong>Detailed view</strong> holds the
          complete technical report — every finding, the WCAG criteria each maps to, the evidence
          behind it, PDF/UA signals and methodology. The chooser sits above every report and the
          choice is <em>not</em> remembered between reports: the stepper is written for document
          authors, so it is what greets everyone, every time, including people who prefer the
          detailed view and know where the toggle is.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          Between the action plan and &ldquo;Above and beyond&rdquo; sits a
          <strong>Best practices</strong> section &mdash; {{ bpTotal }} non-scored practices in all,
          {{ bpPdf }} for PDF and {{ bpOffice }} across Word, PowerPoint and Excel. Each row shows
          the evidence found in the document itself (the heading order it actually has, the fonts it
          actually carries), both routes to fix it, and a link to the rule. Nothing in the section
          touches the grade, and the section says so.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>It is extra credit, and only extra credit</strong> (v1.148.2). A report lists a
          practice only when it has something a reader can act on or take credit for &mdash;
          <em>worth doing</em>, or <em>met</em>. Anything the grade already dealt with is left out:
          a defect that cost points belongs in the action plan, and a practice the checker could not
          judge <em>because</em> a scored failure got in the way (heading level order, on a document
          with no heading tags at all) is not something anyone could go and do. Three labels were
          tried on those rows in one afternoon &mdash; &ldquo;not applicable&rdquo; on a defect that
          had just cost points, &ldquo;counted in your score&rdquo; beside practices that are never
          scored, &ldquo;not checked&rdquo; beside a category the same page had scored zero &mdash;
          and each read as a contradiction, because the section was being asked to describe things
          that belong elsewhere. Listing fewer rows needs no label at all.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          Both views end with <strong>&ldquo;Still worth checking by hand&rdquo;</strong>, which
          appears on every report at every score — including a perfect one. These checks confirm
          that accessibility structure is <em>present</em>; almost none of them can judge whether it
          is <em>correct</em>. Alt text reading &ldquo;image&rdquo; passes. A heading describing the
          wrong section passes. So each check a document passed contributes the one judgment the
          tool could not make, and the WCAG criteria this tool does not evaluate at all are listed
          by name.
        </p>
        <p class="text-[var(--text-muted)] mb-6">
          <strong>Printer-friendly action steps</strong> opens the plan in a new tab as a
          self-contained page: every fix expanded, both routes shown, the human checks included, and
          nothing loaded from the network. Print it or save it as a PDF and work from it beside the
          document rather than behind it. The same button appears on the auto-remediation result,
          where it prints what the automatic fixes could <em>not</em> repair.
        </p>
      </div>

      <!-- Scoring -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">How Scores Are Calculated</h3>
        <p class="text-[var(--text-muted)] mb-3">
          For a <strong>PDF</strong>, the scorer weighs nine accessibility categories anchored to
          <strong>WCAG 2.1 AA</strong> and <strong>IITAA 2.1 §E205.4</strong> — the rules that
          govern non-web document accessibility in Illinois. Each category receives a score from 0
          to 100 (or N/A if the category doesn't apply to the document). The overall score is a
          <strong>weighted average</strong> across the categories. A category that
          <em>doesn't apply</em> — table markup in a document with no tables — counts as
          <strong>passing</strong>, because such a document has no table problem; one the tool
          <em>could not evaluate</em> is left out of the calculation entirely, because scoring it as
          a pass would be a claim we cannot back. Word, PowerPoint, and Excel files are graded on
          the same model, just with a category set adapted to each format (see below). A scanned
          document is the exception in the other direction: it scores zero, because nothing in it
          can be read by a screen reader at all.
        </p>
        <div
          class="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-4 mb-4"
        >
          <p class="text-[var(--text-heading)] font-semibold mb-2">
            The score is capped by the worst finding
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            A document's score may never outrank its worst unresolved finding — a Minor caps it at
            89, a Moderate at 79, a Critical at 69. The letter then comes off the same published
            scale it always has (90 = A, 80 = B, 70 = C, 60 = D, below that F), so the number and
            the letter can never disagree. A weighted average cannot express "one thing here is
            disqualifying", but accessibility conformance is pass/fail per criterion, not a mean, so
            the average alone let four perfect categories outvote one catastrophic one.
          </p>
          <ul class="space-y-1.5 text-[var(--text-muted)] mb-3">
            <li><strong class="text-[var(--text-heading)]">A</strong> — nothing found</li>
            <li><strong class="text-[var(--text-heading)]">B</strong> — only minor items remain</li>
            <li>
              <strong class="text-[var(--text-heading)]">C</strong> — at least one moderate issue
            </li>
            <li>
              <strong class="text-[var(--text-heading)]">D</strong> — at least one critical issue
              (<strong class="text-[var(--text-heading)]">F</strong> if the average is also failing)
            </li>
          </ul>
          <p class="text-[var(--text-muted)]">
            The cap only ever lowers a score, never raises one, so a document already below a
            ceiling keeps its own lower number. It also means two documents with the same defect get
            the same letter regardless of how much else was checkable in each, which was not true
            before tool v1.58.0: a one-page notice and a longer agenda missing the identical
            document title graded C and B, because the notice had only three applicable categories
            to average against and the agenda had seven. Where a score is sitting at its ceiling,
            the report says which finding is holding it there.
          </p>
        </div>
        <div class="overflow-x-auto mb-4">
          <table class="w-full text-xs border border-[var(--border-subtle)] rounded-lg">
            <caption class="sr-only">
              Scoring category weights (WCAG + IITAA §E205.4)
            </caption>
            <thead>
              <tr
                class="bg-[var(--surface-deep)] text-[var(--text-secondary)] uppercase tracking-wide"
              >
                <th scope="col" class="text-left px-3 py-2 font-medium">Category</th>
                <th scope="col" class="text-right px-3 py-2 font-medium">
                  Weight
                  <span class="block text-[9px] normal-case text-emerald-300 font-normal"
                    >WCAG + IITAA §E205.4</span
                  >
                </th>
              </tr>
            </thead>
            <tbody class="text-[var(--text-muted)] divide-y divide-[var(--border-subtle)]">
              <tr>
                <td class="px-3 py-1.5">Text Extractability</td>
                <td class="px-3 py-1.5 text-right font-mono">20%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Title &amp; Language</td>
                <td class="px-3 py-1.5 text-right font-mono">15%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Heading Structure</td>
                <td class="px-3 py-1.5 text-right font-mono">15%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Alt Text on Images</td>
                <td class="px-3 py-1.5 text-right font-mono">15%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Bookmarks / Navigation</td>
                <td class="px-3 py-1.5 text-right font-mono">5%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Table Markup</td>
                <td class="px-3 py-1.5 text-right font-mono">10%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Link Quality</td>
                <td class="px-3 py-1.5 text-right font-mono">5%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Reading Order</td>
                <td class="px-3 py-1.5 text-right font-mono">10%</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5">Form Accessibility</td>
                <td class="px-3 py-1.5 text-right font-mono">5%</td>
              </tr>
              <tr class="bg-[var(--surface-deep)] text-[var(--text-secondary)] font-semibold">
                <td class="px-3 py-1.5">Total</td>
                <td class="px-3 py-1.5 text-right font-mono">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-4 space-y-2"
        >
          <p class="font-medium text-[var(--text-secondary)]">About this score</p>
          <p class="text-xs text-[var(--text-muted)]">
            This is a <strong>WCAG-based</strong> evaluation. It aligns with
            <strong>WCAG 2.1 Level AA</strong>, <strong>ADA Title II</strong>, and Illinois
            <strong>IITAA 2.1 §E205.4</strong> — the rules that govern non-web document
            accessibility in Illinois. The scorer emphasizes
            <strong>programmatically determinable</strong> structure (real headings, real
            table-header relationships, logical reading order) because that's what assistive
            technology can actually use.
          </p>
          <p class="text-xs text-[var(--text-muted)]">
            When the veraPDF engine is configured (it is on the production deployment), every PDF
            audit also includes a formal
            <strong>PDF/UA conformance check</strong> — against PDF/UA-1 (ISO 14289-1), or PDF/UA-2
            (ISO 14289-2) when the document declares it — and, since v1.97.0, a second pass against
            veraPDF's <strong>machine-testable WCAG 2.2 profile</strong> (the subset a dedicated
            checker like PAC verifies by machine, including PDF text contrast), by
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >veraPDF</a
            >, shown as its own verdict panel on the report; the optional remediation pipeline runs
            the same check on its output. PDF/UA is referenced by IITAA only in
            <a
              href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >§504.2.2</a
            >
            for authoring-tool export capability, not for the final PDF artifact itself, so the
            WCAG-anchored score above is what governs publication decisions.
          </p>
        </div>

        <div
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-4 space-y-2"
        >
          <p class="font-medium text-[var(--text-secondary)]">
            Word, PowerPoint &amp; Excel: adapted category sets
          </p>
          <p class="text-xs text-[var(--text-muted)]">
            The nine-category table above is the PDF model. Word, PowerPoint, and Excel files are
            scored the same way — a weighted average of 0–100 category scores, grounded in the same
            WCAG 2.1 AA criteria — but each format uses its own adapted category set, because not
            every PDF category has an OOXML equivalent:
          </p>
          <ul class="text-xs text-[var(--text-muted)] list-disc list-inside space-y-1">
            <li>
              <strong>Word (.docx) — 8 scored categories:</strong> Text Extractability, Title &amp;
              Language, Heading Structure, Alt Text on Images, Table Markup, Color Contrast, List
              Structure, and Link Quality. Reading Order and Form Accessibility are shown on the
              report but are not automatically scored.
            </li>
            <li>
              <strong>PowerPoint (.pptx) — 9 scored categories:</strong> the same eight
              <em>minus Heading Structure</em> — slides carry titles, not a heading hierarchy —
              <em>plus</em> a presentation-specific <strong>Slide Titles</strong> check (every slide
              needs a distinct title placeholder so screen-reader users can tell slides apart) and a
              <strong>Reading Order</strong> category that verifies each slide's title reads first
              in tab order — reported as a clearly labelled advisory, never counted. Heading
              Structure, Bookmarks and Form Accessibility are not scored for a presentation.
            </li>
            <li>
              <strong>Excel (.xlsx) — 7 scored categories:</strong> Text Extractability, Title &amp;
              Language, <strong>Sheet Names</strong> (descriptive names vs. Excel defaults like
              "Sheet1"), Table Markup, Alt Text on Images, Color Contrast, and Link Quality. Excel
              workbooks have no document-language property, so Title &amp; Language evaluates title
              only. Heading Structure, List Structure, Reading Order, Bookmarks and Form
              Accessibility do not apply to a workbook and are not scored.
            </li>
            <li>
              <strong>Empty headings: scored for Word, reported for PDF.</strong> A Heading style on
              a <em>blank line</em> &mdash; used to make space &mdash; puts a section in the outline
              with no content in it, so someone moving by heading lands on silence. In a Word
              document that is a scored
              <a
                href="https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] underline"
                >WCAG 1.3.1</a
              >
              (Level A) failure &mdash; 10 points each, capped at 30, so it can never take Heading
              Structure past Minor. The identical defect in a <em>PDF</em> is reported and not
              scored: there the evidence is an estimate (pdf.js text attribution) rather than a
              certainty (a heading style with no text, read straight from the XML), and the PDF row
              says plainly that checkers disagree about it. A heading whose content is a
              <em>described picture</em> &mdash; an agency masthead &mdash; counts as a heading,
              using its alt text; an undescribed one is left to the alt-text check rather than
              charged twice.
            </li>
          </ul>
          <p class="text-xs text-[var(--text-muted)]">
            <strong>Color contrast</strong> is one place Office formats do <em>more</em> than PDF:
            Word, PowerPoint, and Excel all read text/fill colors directly from their XML, so
            contrast is machine-checked wherever a resolvable color pair is set — explicit colors,
            theme-based colors (all three formats since v1.95.0), and Excel's legacy indexed
            palette; only style-inherited and automatic colors stay unresolved. PDF's Color Contrast
            category, by contrast, remains N/A pending rendered-page analysis — see "Color contrast"
            under Limitations below.
          </p>
        </div>

        <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">
          Category scoring logic
        </h4>
        <div class="space-y-3">
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">
              Text Extractability (20% weight — highest)
            </p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> Can a screen reader actually read the words in this PDF? Some
              PDFs are just pictures of text (scanned documents) — they look normal on screen but
              are completely invisible to assistive technology.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>100</strong> = extractable text + structure tags.
              <strong>50</strong> = text is present but no tags (an untagged PDF).
              <strong>25</strong> = tags are present but no extractable text (partially remediated
              scan). <strong>0</strong> = no text and no tags (unremediated scanned image). Two
              text-layer censuses also cap this category, each a confirmed WCAG failure: a heavy
              share of <strong>unmapped glyphs</strong> (characters that extract as unpronounceable
              symbols — 1.1.1, Matterhorn 10) caps at 50, and
              <strong>visible text outside every tagged run</strong> (1.3.1, Matterhorn 01-005/006,
              with the affected pages named) caps at 50 or 85 by share; a handful of either stays an
              advisory. <strong>Non-embedded fonts are reported but never scored</strong> — no WCAG
              criterion requires embedding (a substituted font still renders and reads aloud);
              PDF/UA does, so they appear as a PDF/UA-only item. This category carries the highest
              weight because if text can't be extracted, nothing else matters.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Title &amp; Language (15%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> The document title is the first thing a screen reader
              announces when a user opens the PDF. The language tag controls how the screen reader
              pronounces words — without it, an English document might be read with a French accent,
              making it incomprehensible.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> 50 points for a document title — a title that cannot
              describe anything (a bare file name such as "report_final.pdf", an authoring-tool
              default such as "Microsoft Word - Cook.doc" or "Untitled", a placeholder, a pure
              timestamp or hash) earns partial credit and is a confirmed 2.4.2 failure (WCAG's own
              documented failure F25). A title that merely <em>looks</em> like a file name but
              carries real words ("Annual_Report_2024", a real title with an export timestamp glued
              on) names the document, so it earns full credit and is reported as an unscored
              advisory — whether it describes the document well is a judgment for a person (since
              2026-09-02). Plus 50 points for a usable language declaration. The language
              <em>value</em> is checked two ways, each a confirmed 3.1.1 failure at half credit: a
              declaration that is not a usable code ("english", "en_US"), and a declaration that
              <em>contradicts the text's actual language</em> (a stopword-based check with four
              guards against false accusations). The <code>DisplayDocTitle</code> viewer flag counts
              too (since 2026-09-01): a title that is set but not displayed earns half the title
              credit and is a confirmed 2.4.2 failure — W3C's own PDF technique for 2.4.2 (PDF18)
              sets the flag, and with it off every viewer shows the filename instead. Checked in
              QPDF's catalog <code>/Lang</code>
              and PDF.js metadata.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Heading Structure (15%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> Headings (H1, H2, H3, etc.) are how screen reader users
              navigate and skim documents — the same way sighted users scan bold section titles.
              Without headings, a blind user must listen to the entire document from start to finish
              to find the section they need.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>100</strong> = heading tags are present — the
              outline exists and is programmatically identifiable. <strong>0</strong> = no heading
              tags at all while the page itself shows section headings — at least two lines that
              look like section headings (uniformly larger, or uniformly bold, text sitting over
              body text), which the report names — a confirmed 1.3.1 failure: the structure a
              sighted reader sees is conveyed by presentation only. A document with no heading tags
              and no such lines has no visual structure to convey, so it is <em>not scored</em> on
              headings (since 2026-09-02; before that the failure was inferred from page and
              paragraph counts). Everything about the outline's <em>shape</em> — level skips (W3C's
              own guidance: not a WCAG failure), multiple H1s, generic <code>/H</code> tags, mixing
              conventions (PDF/UA 7.4.4 / Matterhorn 14-007), and whether the headings' text reads
              like headings — is
              <strong>reported as clearly labelled advisories and never scored</strong>.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Alt Text on Images (15%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> Every informative image in a PDF must have "alternative text"
              — a short description that a screen reader reads aloud. Without alt text, a blind user
              hears nothing when they encounter a chart, photo, or diagram.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> The percentage of detected images that have alt text. QPDF
              identifies image objects (<code>/Image</code>
              XObjects) and matches them to their
              <code>/Figure</code> structure elements, then checks whether each Figure has an
              <code>/Alt</code> attribute. If QPDF finds no tagged images, PDF.js provides a
              fallback by counting image rendering operations — if images exist but aren't tagged,
              the category scores <strong>0</strong> (Critical) instead of N/A.
              <strong>N/A</strong> only if no images are detected by either tool.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Bookmarks / Navigation (5%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> Bookmarks act as a clickable table of contents in the PDF
              viewer's sidebar — for longer documents, a real navigation aid for every reader,
              screen-reader users included. No WCAG 2.1 criterion requires them inside a single
              document, so they can never affect the score.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>It isn't.</strong> Under 10 pages the category is
              N/A; at 10+ pages a missing bookmark tree is reported as a clearly labelled advisory
              that never affects the grade — no WCAG 2.1 criterion requires bookmarks in a single
              document (2.4.5 Multiple Ways applies to sets of pages). Checked in both QPDF's
              <code>/Outlines</code> object chain and PDF.js's <code>getOutline()</code>.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Table Markup (10%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> When a sighted user looks at a data table, they can glance at
              the column headers to understand what each number means. Screen readers need explicit
              markup to provide the same context — without it, a screen reader reads a flat stream
              of numbers with no structure. This category checks seven aspects of table
              accessibility.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>N/A</strong> if no tables are detected; one-row and
              one-column constructs are layout scaffolds and are excluded (the conformance gate
              applies the identical rule, both halves mirrored since 2026-08-31). What is scored is
              what WCAG 1.3.1 requires: <strong>header cells</strong> (<code>/TH</code> present),
              <strong>row structure</strong> (cells grouped in <code>/TR</code>),
              <strong>a regular grid</strong> (consistent column counts after row/column-span
              accounting), and — <em>only</em> for tables whose headers run along more than one edge
              or contain spanned cells — a <code>/Scope</code> or <code>/Headers</code> association,
              without which the header-to-data relationship cannot be determined.
              <strong>Reported but never scored:</strong> missing <code>/Scope</code> on plain
              one-header-row tables (the shape already answers the question — a PDF/UA-only item),
              nested tables, and captions.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Link Quality (5%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> Screen reader users often navigate by tabbing through links.
              Hearing "https://www.example.com/documents/2024/report-final-v3.pdf" read aloud
              character by character is unusable. Descriptive link text like "Download the 2024
              Annual Report" tells users where the link goes.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>N/A</strong> if no links. What is scored is
              <strong>untagged links</strong> — annotations no <code>/Link</code> structure element
              claims, which a screen reader following the tags never encounters (a confirmed 1.3.1
              failure) — and <strong>links with no text at all</strong>, which reach a screen reader
              with no name to announce (a confirmed 4.1.2 Name, Role, Value failure, Level A). A
              link whose text this tool could not attribute — rotated text, image-only links — is
              flagged for hand-checking, never scored. Link <em>wording</em> — raw URLs as text, or
              vague phrases like "click here" — is
              <strong>reported as an advisory and never scored</strong>: WCAG 2.4.4 (Level A) allows
              a link's purpose to come from its surrounding context, which no text-only check can
              weigh; judging the text alone is 2.4.9, a AAA criterion. PDF.js extracts the visible
              text overlapping each link annotation using spatial coordinate matching.
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Form Accessibility (5%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> If a PDF contains fillable form fields (text boxes,
              checkboxes, dropdowns), each field needs a label that assistive technology can read.
              Without labels, a screen reader user hears "edit text" or "checkbox" with no
              indication of what the field is for.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> <strong>N/A</strong> if no form fields. Percentage of widget
              annotations (form fields) that have a <code>/TU</code> (tooltip) attribute, which
              serves as the accessible label. QPDF checks both the widget annotation and the
              <code>/AcroForm</code> fields array. Since v1.94.0, visible widgets that no structure
              element references (no <code>/OBJR</code> — a screen reader following the structure
              never reaches them) reduce the score proportionally as well, the same treatment
              untagged links get (Matterhorn 28).
            </p>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
          >
            <p class="font-medium text-[var(--text-secondary)] mb-1">Reading Order (10%)</p>
            <p class="text-xs text-[var(--text-muted)] mb-2">
              <em>What it means:</em> PDFs with multi-column layouts, sidebars, or callout boxes can
              confuse screen readers if the reading order isn't explicitly defined. A sighted user
              can see that a sidebar is separate from the main text, but a screen reader reads
              content in the order defined by the structure tree — if that order is wrong, the
              document becomes a jumble of unrelated sentences.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <em>How it's scored:</em> only one condition scores: <strong>0</strong> = no structure
              tree at all, a confirmed 1.3.2 failure — no programmatic reading sequence exists.
              Everything else is <strong>measured and reported, never scored</strong>: the tagged
              order (structure-tree MCID sequence) is compared against the order the page's content
              is painted (content-stream MCID sequence) using a longest-common-subsequence match,
              and any divergence is disclosed with the affected pages named — but divergence proves
              the two orders <em>disagree</em>, not which side is wrong (remediated documents
              re-order tags away from a bad draw order on purpose), so it cannot support a
              deduction. A flat structure tree is likewise an advisory: a single-sequence tree is
              still a programmatic reading order. Image (Figure) runs are excluded from the
              comparison — exporters paint images by z-order, which says nothing about reading
              order. Forms are never measured on this metric at all, and when the sequences are too
              short to compare, the category reports no score rather than guessing.
            </p>
          </div>
        </div>

        <h4
          class="font-medium text-[var(--text-secondary)] mb-2 mt-4 text-xs uppercase tracking-wide"
        >
          Thresholds and heuristics
        </h4>
        <div
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-3"
        >
          <p class="text-xs text-[var(--text-muted)] mb-2">
            Every scored rule that turns on a number is listed here with the number, so a reviewer
            can reproduce any accusation the report makes. The values live in the analyzer and
            <code>audit.config.ts</code>; this list is kept in step with them by a guard test.
          </p>
          <ul class="text-xs text-[var(--text-muted)] space-y-1.5 list-disc pl-5">
            <li>
              <strong>Visual headings (PDF, 1.3.1):</strong> a document with no heading tags is
              scored 0 only when at least <strong>two</strong> lines look like section headings. A
              line qualifies when it is 80 characters or shorter, every lettered run on it is at
              least 1.5 pt larger than the document's body size (the size carrying the most letters)
              or every run is bold at body size, its runs are contiguous (a gap wider than 1.5 × the
              font size marks a table row, not a heading), and a body-size, non-bold line of 40+
              characters follows it on the same page. Memo header lines ("TO: Jane Smith") and table
              header rows are excluded by construction; one qualifying line is a title, not
              sections.
            </li>
            <li>
              <strong>Title shape (PDF, 2.4.2 / F25):</strong> confirmed only for a title that ends
              in a document file extension, matches an authoring-tool default or placeholder
              ("Untitled", "Document1", "scan_001", "Microsoft Word - X.doc"), or is a pure
              timestamp / digit run / hash with fewer than two real words left once file-name
              machinery is stripped. Anything else that looks like a file name (underscores, two or
              more hyphens, a 20+ character token with digits, an export timestamp or hash beside
              real words) is an unscored advisory.
            </li>
            <li>
              <strong>Untagged visible text (PDF, 1.3.1):</strong> characters painted outside the
              tag structure and not marked as artifacts fail when they are at least 2 % of the
              visible text <em>and</em> at least 50 characters (score capped at 85); at 10 % and 200
              characters the cap is 50.
            </li>
            <li>
              <strong>Unmappable characters (PDF, 1.1.1):</strong> glyphs that extract as
              private-use symbols fail when they are at least 100 characters <em>and</em> at least 5
              % of the extracted text; smaller shares are an unscored advisory.
            </li>
            <li>
              <strong>Large text (Word / PowerPoint / Excel, 1.4.3):</strong> 18 pt or larger, or 14
              pt bold or larger, is held to 3:1 instead of 4.5:1. For Word the size is resolved
              through the paragraph style and document defaults, not only the run.
            </li>
            <li>
              <strong>Typed bullets (Word / PowerPoint, 1.3.1):</strong> a paragraph that starts
              with a hand-typed bullet or enumerator counts only when another typed or real list
              item sits within two non-empty paragraphs of it — a lone "1." is a label, not a list.
            </li>
            <li>
              <strong>Word fake headings (1.3.1 / F2):</strong> a paragraph with no Heading style,
              120 characters or shorter, whose own runs are bold at 14 pt or larger. Paragraphs
              inside data-shaped tables (two or more rows and columns) and inside text boxes are not
              counted — a title in a one-row banner table still is; "Title" and "Subtitle" styles
              are structural.
            </li>
          </ul>
        </div>

        <h4
          class="font-medium text-[var(--text-secondary)] mb-2 mt-4 text-xs uppercase tracking-wide"
        >
          How fix times are estimated
        </h4>
        <div
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-3"
        >
          <p class="text-xs text-[var(--text-muted)] mb-2">
            The action plan's minute figures count clicks, never judgment. Each estimate is the
            document's own defect count multiplied by a per-item rate, rounded up to a floor:
            headings 30 s each (floor 2 min), typed bullets 20 s (floor 2 min), contrast runs 60 s
            (floor 2 min), header rows 60 s per table (floor 1 min), unnamed links 30 s (floor 1
            min), alt text 60 s per image to <em>apply</em> — writing the description is not
            counted, so alt-text steps never contribute to a total. Title and language are a flat 2
            minutes; bookmarks a flat 5. For PDFs only the mechanical Acrobat steps (title,
            language, bookmarks, applying alt text) carry an estimate; tag surgery depends on the
            document's history, not its counts, and shows none.
          </p>
        </div>

        <h4
          class="font-medium text-[var(--text-secondary)] mb-2 mt-4 text-xs uppercase tracking-wide"
        >
          Supplementary analysis
        </h4>
        <p class="text-xs text-[var(--text-muted)] mb-3">
          In addition to the nine PDF categories scored above, the tool appends additional findings
          to relevant categories. These are informational and never move a score — the alt-text
          quality census (boilerplate descriptions such as "image" or "picture") is reported for
          review only; whitespace-only alternate text is treated as missing by the alt-text check
          itself. They provide deeper insight into the document's accessibility posture.
        </p>
        <div class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto">
          <table class="w-full text-xs">
            <caption class="sr-only">
              Supplementary analysis checks, which category they append to, and what they report
            </caption>
            <thead>
              <tr
                class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
              >
                <th scope="col" class="text-left px-4 py-2 font-medium">Check</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">Appended To</th>
                <th scope="col" class="text-left px-4 py-2 font-medium">What It Reports</th>
              </tr>
            </thead>
            <tbody class="text-[var(--text-muted)]">
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">List structure</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  Per-list breakdown of <code>&lt;LI&gt;</code>, <code>&lt;Lbl&gt;</code>,
                  <code>&lt;LBody&gt;</code> presence and nesting depth
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Marked content &amp; artifacts</td>
                <td class="px-4 py-2">Text Extractability</td>
                <td class="px-4 py-2">
                  <code>/MarkInfo</code> status, paragraph tag count, empty page detection
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Font embedding</td>
                <td class="px-4 py-2">Text Extractability</td>
                <td class="px-4 py-2">
                  Per-font embedded/not-embedded listing —
                  <strong>reported, never scored:</strong> no WCAG criterion requires embedding (a
                  substituted font still renders and reads aloud), so non-embedded fonts appear as a
                  PDF/UA-only item; fonts that never display visible text are noted as harmless
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Role mapping &amp; tab order</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  Custom tag role mappings, per-page tab order configuration
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Language spans</td>
                <td class="px-4 py-2">Title &amp; Language</td>
                <td class="px-4 py-2">
                  Inline language declarations for foreign-language content within the document
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Alt text quality</td>
                <td class="px-4 py-2">Alt Text on Images</td>
                <td class="px-4 py-2">
                  Heuristic check for non-human-readable alt text: hex-encoded data, filenames,
                  generic placeholders, long strings without spaces
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">PDF/UA identifier</td>
                <td class="px-4 py-2">Text Extractability</td>
                <td class="px-4 py-2">
                  Checks XMP metadata for <code>pdfuaid:part</code> — indicates if the document
                  claims PDF/UA (ISO 14289) conformance
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Artifact tagging</td>
                <td class="px-4 py-2">Text Extractability</td>
                <td class="px-4 py-2">
                  Counts <code>/Artifact</code> structure elements — headers, footers, and
                  watermarks should be tagged as artifacts so screen readers skip them
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">ActualText &amp; expansion</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  <code>/ActualText</code> for glyph/ligature overrides and <code>/E</code> for
                  abbreviation expansions — help screen readers pronounce content correctly
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Footnotes (<code>&lt;Note&gt;</code> IDs)</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  <code>&lt;Note&gt;</code> tags missing the unique <code>/ID</code> that lets
                  assistive technology link a footnote to its reference — advisory with the Acrobat
                  fix path (v1.92.0; Matterhorn 19)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Role-map validity</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  Circular mappings, remappings of standard tags, and custom tags that never reach a
                  standard role (resolved transitively) — advisories (v1.92.0; Matterhorn 02)
                </td>
              </tr>
              <tr class="border-b border-[var(--border-subtle)]">
                <td class="px-4 py-2">Document behaviors</td>
                <td class="px-4 py-2">Reading Order</td>
                <td class="px-4 py-2">
                  JavaScript actions, audio/video annotations, optional-content layers, reference
                  XObjects, embedded files without descriptions, and signature fields — each
                  disclosed for human review rather than silently skipped (v1.92.0&ndash;v1.94.0)
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2">Acrobat remediation guide</td>
                <td class="px-4 py-2">All PDF categories</td>
                <td class="px-4 py-2">
                  When a PDF category scores below "Pass", appends the exact Adobe Acrobat
                  Accessibility Check rule names (called Full Check in older Acrobat versions), menu
                  paths, and step-by-step fix instructions specific to that category.
                  Word/PowerPoint/Excel findings link to the relevant Microsoft accessibility help
                  article instead.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- How a category that doesn't apply is counted. This section used to
           describe weight renormalization — the pre-v1.58.3 model, removed
           because it penalized simple documents (a one-page notice scored
           WORSE than a longer agenda with the identical fault). Keep this in
           sync with aggregateScore in packages/analyzer/src/scoring/common.ts. -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Categories That Don't Apply</h3>
        <p class="text-[var(--text-muted)]">
          A category that doesn't apply to a document (a text-only file has no images, tables,
          links, or forms) counts as <strong>passing</strong> and keeps its weight in the score's
          base: a document with no tables does not have a table problem. Only a category the tool
          <em>could not assess</em> — color contrast on PDFs, where rendered-page analysis is not
          yet implemented — sits outside the weighted score, because "we don't know" must not be
          scored as a pass. Through v1.58.2 the tool instead dropped non-applicable categories and
          renormalized the remaining weights; that magnified a simple document's single fault (a
          one-page notice scored <em>worse</em> than a longer agenda carrying the identical
          missing-title defect) and was removed.
        </p>
        <p class="text-[var(--text-muted)] mt-3">
          Counting a non-applicable category as passing does <strong>not</strong> make the remaining
          categories less important. A high score can still coexist with unresolved semantic issues
          that matter for ADA/WCAG/IITAA review. For Illinois agency publication decisions, the
          score is a prioritization aid, not a substitute for the per-category findings.
        </p>
        <p class="text-[var(--text-muted)] mt-3 mb-2">A worked example makes it concrete:</p>
        <pre
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-sky-300">Example: a 12-page PDF report — no tables, no links, no form fields</span>

  Category               Weight   Score
  ─────────────────────────────────────
  Text Extractability      20%     100
  Title &amp; Language         15%      75
  Heading Structure        15%      55
  Alt Text                 15%      90
  Reading Order            10%     100
  Bookmarks                 5%     100
  Table Markup             10%     <span class="text-emerald-300">n/a → passing</span> ┐
  Link Quality              5%     <span class="text-emerald-300">n/a → passing</span> ├─ no such content =
  Form Accessibility        5%     <span class="text-emerald-300">n/a → passing</span> ┘  no such problem (counts as 100)

  Weighted sum = (100×20 + 75×15 + 55×15 + 90×15 + 100×10 + 100×5 + 100×10 + 100×5 + 100×5) ÷ 100
               = 8800 ÷ 100
               = 88 before the severity cap

  <span class="text-amber-300">Severity cap:</span> the score may never outrank the worst open finding (Minor 89 ·
  Moderate 79 · Critical 69). The broken heading hierarchy here is a Moderate
  finding, so the final score is <span class="text-emerald-300">capped at 79 · grade C</span> — and the report says
  which finding is holding it there.</pre>
      </div>

      <!-- WCAG 2.2 vs the legal 2.1 minimum — merged from the standalone
           technical-details page in v1.98.0 (the two surfaces are one
           content source now). -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">WCAG 2.2 Alignment</h3>
        <p class="text-[var(--text-muted)] mb-3">
          This tool reports against <strong>WCAG 2.1 Level AA</strong> — the version IITAA 2.1
          (§E205.4) and ADA Title II both require, and the version every verdict here names. WCAG
          2.2 is a strict superset of it: it adds nine success criteria (six at Level A/AA) and
          removes one (4.1.1 Parsing, obsolete). The automated checks are the same either way —
          every machine-checkable criterion is one carried forward from 2.1. The criteria 2.2 adds
          are interactive and manual, so they are never reported as automated failures. On a
          document with interactive form fields the form-relevant ones (Target Size 2.5.8, Redundant
          Entry 3.3.7, Accessible Authentication 3.3.8) are listed as
          <em>&ldquo;not assessed &mdash; manual review&rdquo;</em>, each saying plainly that it
          sits beyond the standard your grade measures. The rest are described on the
          <a href="/wcag-2-2" class="text-[var(--link)] underline">What&rsquo;s new in WCAG 2.2</a>
          page.
        </p>
        <p class="text-[var(--text-muted)]">
          For a plain-language manager summary, see
          <NuxtLink
            to="/wcag-2-2"
            class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
            >how WCAG 2.2 differs from 2.1</NuxtLink
          >. IITAA 2.1 does not yet reference WCAG 2.2, so 2.2 conformance is
          optional/forward-looking; WCAG 2.1 AA remains the legal minimum.
        </p>
      </div>

      <!-- Scanned detection -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Scanned Document Detection</h3>
        <p class="text-[var(--text-muted)]">
          A PDF is flagged as a scanned image when
          <strong>both</strong> conditions are true: PDF.js extracts fewer than 50 characters of
          text content (indicating no real text layer) and QPDF finds no StructTreeRoot (indicating
          no semantic tags). This combination means the document is an unremediated scanned image
          that screen readers cannot access at all.
        </p>
      </div>

      <!-- ============================================================ -->
      <!-- PDF AUTO-REMEDIATION (developer-facing technical reference)  -->
      <!-- ============================================================ -->

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          PDF Auto-Remediation: Pipeline Overview
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          As of <strong>v1.18.0</strong>, the tool also exposes an optional PDF auto-remediation
          feature behind the <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code> env
          flag. When enabled, the audit results page surfaces an <em>Attempt remediation</em> button
          further down the results page. Clicking it spawns a detached worker that runs a four-stage
          pipeline, validates the output, and either serves the remediated file to the user
          (single-use download, deleted on stream close) or rejects it and surfaces a fallback
          message. The user re-uploads to remediate; no PDF is cached between the audit and
          remediation stages.
        </p>
        <pre
          class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
POST /api/remediate (multipart PDF)
  → [magic-byte check] → [page count cap (500)] → [pre-flight audit]
  → [job row created, sha256 content_hash recorded]
  → [spawn detached child: tsx src/jobs/remediate.ts &lt;jobId&gt;]
  ◄ { jobId, downloadToken }   (HTTP 202)

<span class="text-sky-300">Worker pipeline:</span>
  <span class="text-sky-300">[Stage 1: preparing]</span>   <span class="text-emerald-300">qpdf</span> --object-streams=disable input → normalized
  <span class="text-sky-300">[Stage 2: tagging]</span>     <span class="text-emerald-300">OpenDataLoader</span> convert(normalized) → tagged-pdf
  <span class="text-sky-300">[Stage 3: validating]</span>  <span class="text-emerald-300">qpdf</span> --check tagged → validity verdict
                         <span class="text-emerald-300">verapdf</span> --flavour ua1 --format json tagged → conformance verdict
  <span class="text-sky-300">[Stage 4: comparing]</span>   re-audit tagged → output_audit
                         <span class="text-amber-300">guard: reject if Overall|Strict regresses</span>

Output finalized OR job marked failed. Scratch dir wiped in `finally`.</pre>

        <div class="mt-4">
          <DiagramFigure
            name="remediation-flow"
            title="Remediation pipeline — visual flow"
            desc="The user re-uploads the PDF. qpdf normalizes it; original deleted with verification. OpenDataLoader adds structure tags; normalized intermediate deleted with verification. qpdf check + veraPDF validate the output. A re-audit confirms no score profile regressed. If all clear, output is held for 30 minutes; user downloads via single-use token; output deleted with verification."
          />
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Why Auditing Is Easy and Remediation Is Hard
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          Auditing any supported document is a <em>read-only</em> operation: walk the file's
          internal structure and report what you find. For a PDF, that means asking "does it have a
          tagged StructTreeRoot? Are figures marked? Is the language declared?" — the PDF
          specification (<a
            href="https://www.iso.org/standard/75839.html"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >ISO 32000-2</a
          >) is unambiguous about how to <em>read</em> these structures, and the libraries that
          parse them (qpdf, pdfjs, veraPDF) are mature and battle-tested. Word, PowerPoint, and
          Excel files are audited the same read-only way, walking their OOXML parts instead. Either
          way, the answers don't change between runs: a document can be audited a thousand times and
          produce the same result every time.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          Remediation is a <em>read-modify-write</em> operation, and PDFs make that uniquely hard
          for several reasons that are baked into the format itself:
        </p>
        <ol class="space-y-2 text-xs text-[var(--text-muted)] list-decimal list-inside ml-2">
          <li>
            <strong>PDF was designed for fixed-layout printing, not semantic content.</strong>
            Adobe published it in 1993 to make "documents that look identical on every printer." The
            accessibility layer (<code class="text-xs font-mono">StructTreeRoot</code>, marked
            content, role mapping) was bolted on in <strong>PDF 1.4 (2001)</strong> and is
            <em>optional</em> — valid PDFs can have none of it. Auto-tagging means
            reverse-engineering semantic meaning from raw visual presentation, which is much harder
            than reading existing semantic markers.
          </li>
          <li>
            <strong>There is no canonical mapping from visual layout to semantic role.</strong> Is a
            14-pt bold line of text an <code class="text-xs font-mono">&lt;H2&gt;</code> or just
            emphasized body text? Is a 100×100-pixel image content (needs alt text) or decoration
            (mark as <code class="text-xs font-mono">/Artifact</code>)? A human reader judges from
            context; software guesses heuristically and is wrong some of the time.
          </li>
          <li>
            <strong>The content stream and the structure tree are coupled but separable.</strong>
            Every glyph and image in a PDF lives in a per-page content stream. Each one is wrapped
            in a "marked content" section (<code class="text-xs font-mono">/MCID 7 … /EMC</code>)
            that links it back to a node in the
            <code class="text-xs font-mono">StructTreeRoot</code>. Adding an alt-text to one image
            means mutating <em>both</em> sides coherently — write the new
            <code class="text-xs font-mono">/Alt</code> property on the Figure structure element AND
            ensure the MCID linkage stays valid. Many PDF libraries handle reading one side or the
            other, but not modifying both at once.
          </li>
          <li>
            <strong>The content layer can be in any of several representations.</strong> A scanned
            PDF has no text layer — it's just raster images, requiring OCR before any semantic
            remediation can happen. An optimized PDF compresses objects into "object streams" (a PDF
            1.5+ feature) that some libraries can't safely round-trip. An encrypted PDF requires a
            password even to read. Each case is its own engineering minefield, and they layer onto
            each other (scanned-and-encrypted is worse than either alone).
          </li>
          <li>
            <strong>No single PDF library does everything well.</strong>
            <code class="text-xs font-mono">pdf-lib</code> (JavaScript, in the Node ecosystem) reads
            and writes metadata easily but has no StructTreeRoot builder. Apache PDFBox (Java) has
            the deepest structure-tree support but is Java-only. Ghostscript can rewrite PDFs but
            silently degrades tag structure. OpenDataLoader (Java, used here) is the only
            open-source tool that produces a tagged PDF from an untagged one — and even it cannot
            judge whether the result is <em>meaningful</em>.
          </li>
          <li>
            <strong>The "tagged PDF" specification is permissive.</strong>
            You can produce a PDF that satisfies all the technical requirements of
            <em>being</em> tagged (MarkInfo=true, StructTreeRoot exists, every page has marked
            content) and is still inaccessible to screen readers (e.g., every paragraph wrapped in a
            single <code class="text-xs font-mono">&lt;P&gt;</code> with no heading structure).
            PDF/UA-1 (ISO 14289-1) narrows this somewhat but doesn't eliminate it. Automated
            remediation tools often produce tagged-but-shallow output that machine validators accept
            but assistive technology can't navigate.
          </li>
          <li>
            <strong>Mistakes compound badly.</strong> A wrong heading level might confuse a screen
            reader user. A corrupted cross-reference (xref) table makes the entire PDF unreadable by
            any viewer. Remediation tools have to be conservative — when in doubt, don't touch. The
            qpdf preprocessing step in this pipeline exists precisely because OpenDataLoader's PDF
            writer occasionally corrupts the xref on round-trip with certain inputs (the InDesign
            18.x / Word 365 case described above); we accept the cost of an extra normalization pass
            to avoid serving a damaged file.
          </li>
          <li>
            <strong>Round-trip fidelity is the highest bar.</strong>
            Remediation must <em>add</em> semantic markup while <em>preserving</em> every visual
            nuance: embedded fonts, raster + vector images, color spaces, ICC profiles, page labels,
            bookmarks, hyperlinks, form fields, digital signatures, embedded multimedia. The user
            doesn't want their report to look different after remediation; they want the
            <em>same document</em> with structure added. Read-modify-write while changing only the
            semantic layer is a class of problem the format simply wasn't designed to make easy.
          </li>
        </ol>
        <p class="text-[var(--text-muted)] mt-3">
          The result is that PDF auto-remediation works well for the machine-checkable parts of
          accessibility (structure presence, metadata, language declaration, tagged content stream)
          and falls back to human judgment for the semantically-judged parts (alt-text quality,
          reading-order intent, decorative vs. informative classification). The roadmap for this
          tool (see
          <code class="text-xs font-mono"
            >docs/archive/pdf-remediation-alt-text-walkthrough-spec.md</code
          >) is an interactive walkthrough that augments the machine-checkable foundation with
          human-authored alt text — without any AI in the loop, because the regulatory durability of
          agency-authored content is higher than the durability of AI-generated content.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Why OpenDataLoader Changes the Cost Equation
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          Until <strong>2024–2025</strong>, programmatically tagging a PDF (auto-generating
          <code class="text-xs font-mono">StructTreeRoot</code>, marking figures, tables, headings)
          was something only a handful of commercial vendors could do, and they priced accordingly.
          The economics of PDF accessibility have historically been brutal for state agencies:
          PDF/UA expertise is rare, specialized, and was locked behind commercial walls for decades.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>Commercial PDF remediation, today:</strong>
        </p>
        <ul class="space-y-1.5 text-xs text-[var(--text-muted)] mb-3">
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Apryse / PDFTron SDK:</strong> enterprise-quoted, typically
              <strong>$1,500/yr minimum</strong> for the entry SDK and considerably more for the
              auto-tagging add-on. On-prem deployable but you pay for the privilege of running their
              Java/C++ binary in your own data center.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Adobe PDF Services API:</strong> Accessibility Auto-Tag endpoint, free tier
              of 500 transactions per month (about 50 pages — exhausted by a single annual report).
              Beyond the free tier: <strong>enterprise-quoted</strong>, scaling per-document. Your
              PDF leaves your network for the API call.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>PDFix SDK, AbleDocs ADapi, CommonLook API:</strong> all enterprise-quoted,
              all opaque pricing, all aimed at large organizations.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Manual remediation services:</strong> <strong>$5–$50 per page</strong> for
              hand-remediation of tagged-and-reviewed output. A typical 50-page agency report costs
              <strong>$250–$2,500</strong> to remediate this way, and that's per document. State
              agencies producing dozens of reports per year face annual remediation bills in the
              tens of thousands.</span
            >
          </li>
        </ul>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>Why so expensive?</strong> The skill is rare — there are relatively few
          practitioners who can read a structure tree and judge whether it's correct. The labor is
          real — even with good tooling, a 50-page report can require 4–8 hours of expert work. The
          market is small, the demand is regulated (ADA Title II, IITAA, Section 508), and the
          buyers are mostly governments and large organizations that aren't price-sensitive. The
          result is a niche industry with high prices and slow innovation.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong
            >OpenDataLoader PDF, released as Apache 2.0 in 2024 and continuously developed since, is
            the first credible open-source PDF auto-tagger.</strong
          >
          It does what previously required a $1,500/year SDK subscription: takes an untagged PDF and
          produces a tagged one. It's developed by
          <a
            href="https://sdk.hancom.com/en"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >Hancom</a
          >
          (a Korean office-software vendor with deep PDF expertise) in collaboration with the
          <a
            href="https://pdfa.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >PDF Association</a
          >
          and
          <a
            href="https://www.duallab.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >Dual Lab</a
          >
          (the same people behind the veraPDF validator). It ranks #1 overall (0.907) in 2026
          PDF-extraction accuracy benchmarks — not just "as good as the commercial tools," better
          than them on the published metrics.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>For this tool, OpenDataLoader is load-bearing.</strong>
          The pipeline architecture (qpdf preprocess → ODL tag → veraPDF check → re-audit) takes the
          most expensive part of commercial PDF remediation — the auto-tagging step — and replaces
          it with an
          <code class="text-xs font-mono">apt install openjdk-17-jre-headless</code>. The other
          open-source tools we pair it with (<a
            href="https://qpdf.sourceforge.io/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >qpdf</a
          >
          for preprocessing,
          <a
            href="https://verapdf.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >veraPDF</a
          >
          for PDF/UA-1 conformance validation) are also free and mature. Together they form a
          complete pipeline that until very recently did not exist in open source.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          What ODL <em>doesn't</em> do — and no auto-tagger does — is judge whether the resulting
          structure is <em>meaningful</em>. It can mark every image as a Figure but can't write an
          alt-text. It can mark every table cell but can't decide which row is the header. Those
          remain human judgment calls. The economic shift ODL enables is from "$1,500/year +
          per-document manual labor" to "<strong
            >$0 of software + the manual labor for the parts a machine genuinely cannot do</strong
          >." That's an order-of-magnitude cost reduction for the agencies it serves, with no loss
          of output quality.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Tool 3: OpenDataLoader PDF (Auto-Tagging)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          <a
            href="https://github.com/opendataloader-project/opendataloader-pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >OpenDataLoader PDF</a
          >
          (ODL) is an Apache-2.0-licensed Java application that takes an untagged PDF and writes a
          Tagged PDF with a populated
          <code class="text-xs font-mono">StructTreeRoot</code>. It is the first open-source tool to
          offer this transformation; it ranks #1 overall (0.907) in 2026 PDF-extraction benchmarks
          across reading order, table extraction, and heading detection. ICJIA maintains a fork at
          <a
            href="https://github.com/ICJIA/opendataloader-pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >ICJIA/opendataloader-pdf</a
          >
          as a hedge against future license changes upstream.
        </p>
        <ul class="space-y-1 text-xs text-[var(--text-muted)] mb-3">
          <li>
            <strong>Invocation:</strong>
            <code class="font-mono">@opendataloader/pdf</code>
            v2.4.3 npm wrapper around a bundled JAR (<code class="font-mono"
              >lib/opendataloader-pdf-cli.jar</code
            >).
          </li>
          <li>
            <strong>Runtime:</strong> OpenJDK 17+ (<code class="font-mono">java -version</code> ≥ 11
            required; install via
            <code class="font-mono">apt install openjdk-17-jre-headless</code>
            on Ubuntu 22.x).
          </li>
          <li>
            <strong>JVM heap cap:</strong>
            <code class="font-mono">JAVA_TOOL_OPTIONS=-Xmx768m</code>
            set per-invocation by the worker as a safety rail against pathological documents.
          </li>
          <li>
            <strong>Convert options used:</strong>
            <code class="font-mono">{ outputDir, format: 'tagged-pdf', quiet: true }</code>. Hybrid
            mode (docling-fast + SmolVLM) is deliberately not used in v1 — see the spike report for
            why.
          </li>
          <li>
            <strong>Wall-clock timeout:</strong>
            <code class="font-mono">REMEDIATION.WORKER_TIMEOUT_MS</code>
            (5 min default); the JVM child is killed on overrun.
          </li>
        </ul>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>Why a Java tool</strong> in a Node.js codebase: every other open-source
          PDF/UA-targeted auto-tagger is either commercial (Apryse, Adobe PDF Services API),
          Java-only, or both. The tradeoff is one additional system dependency (JRE) on the deploy
          box in exchange for free, locally-hosted auto-tagging with no outbound API calls.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          qpdf Preprocessing: <code class="text-xs font-mono">--object-streams=disable</code>
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          Stage 1 of the remediation pipeline pipes the input through
          <code class="text-xs font-mono">qpdf --object-streams=disable INPUT NORMALIZED</code>
          before ODL ever touches it. This decompresses PDF 1.5+ compressed object streams to
          traditional uncompressed objects. Without this preprocessing, ODL's Java PDF writer
          corrupts the output xref table on certain inputs — specifically, tagged PDFs emitted by
          modern Adobe InDesign (18.x) and Microsoft Word 365.
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          This bug was discovered during the OpenDataLoader feasibility spike on the
          <code class="text-xs font-mono">FY_22_ICJIA_Annual_Report</code>
          (InDesign 18.2) and
          <code class="text-xs font-mono">2022 SFS Process Evaluation Report</code>
          (Word 365) fixtures. Without preprocessing, ODL emits a PDF that
          <code class="text-xs font-mono">qpdf --check</code> reports as damaged:
          <em>xref num N not found</em>, <em>Invalid object stream</em>,
          <em>Catalog object is wrong type (null)</em>. With preprocessing, both PDFs round-trip
          cleanly and the score moves from F to D-grade improvement. See
          <code class="font-mono">docs/archive/spike-remediation-results.md</code>
          for the full reproducer + results.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Output Validation: qpdf --check + veraPDF
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          Every remediated PDF passes through two independent validators before the worker is
          allowed to serve it. The output is rejected (job marked
          <code class="font-mono">failed</code>, file deleted) on any failure, even though the
          upstream pipeline succeeded.
        </p>
        <ul class="space-y-1 text-xs text-[var(--text-muted)] mb-3">
          <li>
            <strong><code class="font-mono">qpdf --check &lt;output&gt;</code>:</strong>
            parses the entire PDF structure and reports warnings on damaged xref tables, malformed
            object streams, broken catalogs, etc. The worker treats
            <em>"operation succeeded with warnings"</em>
            as a failure — better to discard a borderline file than serve a damaged one.
          </li>
          <li>
            <strong
              ><code class="font-mono">verapdf --flavour ua1 --format json &lt;output&gt;</code
              >:</strong
            >
            runs the
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >veraPDF</a
            >
            open-source PDF/UA-1 conformance validator (from the PDF Association + Dual Lab).
            Configured via
            <code class="font-mono">REMEDIATION_VERAPDF_PATH</code>; optional — when not configured,
            the receipt records <em>verapdf_unavailable</em> and skips this step; when the run
            itself fails (a timeout, no output) it records <em>verapdf_error</em> and stores no
            verdict at all — never a failure. veraPDF's verdict is
            <strong>informational, not blocking</strong>: even a PDF that veraPDF flags as
            non-conformant is still served if the audit score didn't regress. The result page
            surfaces this honestly in the IITAA compliance disclaimer.
          </li>
        </ul>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">Regression Guards</h3>
        <p class="text-[var(--text-muted)] mb-3">
          After successful tagging + validation, the worker re-audits the output and compares
          against the pre-flight audit stored at job creation time. Two independent comparisons run:
        </p>
        <pre
          class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-sky-300">if</span> (output.overallScore &lt; input.overallScore ||
    output.scoreProfiles.strict.overallScore &lt; input.scoreProfiles.strict.overallScore) {
  <span class="text-emerald-300">recordEvent</span>(jobId, <span class="text-purple-300">'validation_failed'</span>, { regressed_profiles: [...] })
  <span class="text-sky-300">await</span> <span class="text-amber-300">deleteAndVerify</span>(jobId, taggedPath, 'cleanup')
  <span class="text-amber-300">setFailed</span>(jobId, `auto-remediation regressed: ${regressed.join(', ')}`)
  <span class="text-sky-300">return</span>
}</pre>
        <p class="text-[var(--text-muted)] mt-3">
          <strong>Why both:</strong> the headline overall score can fall back to a stored value
          while the strict profile is the canonical scoring methodology, so either could mask a
          regression in the other. Checking both ensures the user never sees a metric that
          decreased. The <code class="font-mono">validation_failed</code> event payload records the
          input/output deltas plus the <code class="font-mono">regressed_profiles</code> array, so
          any auditor query can identify exactly which comparison failed and by how much.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Lifecycle Audit Trail: <code class="text-xs font-mono">remediation_events</code>
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          Every remediation produces an append-only series of timestamped lifecycle events in the
          <code class="font-mono">remediation_events</code> SQLite table (<code class="font-mono"
            >apps/api/data/audit.db</code
          >). The table is the canonical source for the receipt displayed on the result page, the
          auditor evidence trail, and any future compliance reporting. PDF content is never stored —
          only structural metadata.
        </p>
        <pre
          class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
<span class="text-sky-300">CREATE TABLE</span> remediation_events (
  id          <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">PRIMARY KEY AUTOINCREMENT</span>,
  job_id      <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>,
  event       <span class="text-purple-300">TEXT</span> <span class="text-sky-300">NOT NULL</span>,
  occurred_at <span class="text-purple-300">INTEGER</span> <span class="text-sky-300">NOT NULL</span>,
  details     <span class="text-purple-300">TEXT</span>,   <span class="text-[var(--text-muted)]">-- JSON, content-free metadata only</span>
  <span class="text-sky-300">FOREIGN KEY</span> (job_id) <span class="text-sky-300">REFERENCES</span> remediation_jobs(id)
);</pre>
        <p class="text-[var(--text-muted)] mt-3 mb-2">
          <strong>Event vocabulary (closed set, typed at compile time):</strong>
        </p>
        <ul
          class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] font-mono"
        >
          <li>received</li>
          <li>processing_started</li>
          <li>normalize_complete</li>
          <li>input_deleted</li>
          <li>tagging_complete</li>
          <li>intermediate_deleted</li>
          <li>validation_passed</li>
          <li>validation_failed</li>
          <li>verapdf_passed</li>
          <li>verapdf_failed</li>
          <li>verapdf_error</li>
          <li>verapdf_unavailable</li>
          <li>output_ready</li>
          <li>downloaded</li>
          <li>output_deleted</li>
          <li>verified_absent</li>
          <li>verify_failed</li>
          <li>expired</li>
          <li>error</li>
        </ul>
        <p class="text-[var(--text-muted)] mt-3">
          The <code class="font-mono">verified_absent</code> event is the critical compliance
          signal. It is emitted after the worker (or cleanup sweep, or download handler) calls
          <code class="font-mono">fs.unlink</code> on a job artifact AND
          <code class="font-mono">fs.stat</code> returns <code class="font-mono">ENOENT</code>. The
          details payload contains a SHA-256 hash of the deleted path string (not file content) so
          auditors can reconcile event entries against expected paths without storing the paths
          themselves in the log.
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Privacy & Retention (Remediation-Specific)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          The remediation pipeline (PDF-only) maintains the same posture as the audit pipeline — no
          uploaded file content is persisted — with three additional rules:
        </p>
        <ol class="space-y-2 text-xs text-[var(--text-muted)] list-decimal list-inside">
          <li>
            <strong>No between-stage cache.</strong> The just-audited PDF is <em>not</em> cached on
            disk waiting for the user to click Remediate. Clicking Remediate prompts a re-upload. UX
            cost: one extra upload. Privacy cost of caching: declined.
          </li>
          <li>
            <strong>Inputs deleted between pipeline stages.</strong> The worker writes
            <code class="font-mono">work/input.pdf</code>, normalizes it to
            <code class="font-mono">work/normalized.pdf</code>, then
            <code class="font-mono">deleteAndVerify(work/input.pdf)</code>. Once ODL produces
            <code class="font-mono">work/odl/&lt;name&gt;_tagged.pdf</code>, the normalized
            intermediate is deleted. At any moment, at most one copy of the PDF exists on disk per
            job. The entire scratch dir is wiped in a <code class="font-mono">finally</code> block
            regardless of pipeline outcome.
          </li>
          <li>
            <strong>Output deleted on first download.</strong>
            <code class="font-mono">GET /api/remediate/:id/download</code>
            streams via <code class="font-mono">createReadStream + pipe</code>
            (no memory buffering); the response
            <code class="font-mono">'close'</code> handler triggers
            <code class="font-mono">deleteAndVerify(outputPath, 'download')</code>. The job row is
            marked <code class="font-mono">status='expired'</code> <em>before</em> the stream
            begins, so a concurrent second download request sees
            <code class="font-mono">410 Gone</code>. Files not downloaded within
            <code class="font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
            (30 min default) are deleted by the cleanup sweep.
          </li>
        </ol>
        <p class="text-[var(--text-muted)] mt-3">
          Filesystem permissions are
          <code class="font-mono">0700</code> on
          <code class="font-mono">apps/api/data/remediation/</code> and
          <code class="font-mono">0600</code> on output files. Output filenames are
          <code class="font-mono">&lt;jobId&gt;.pdf</code> where
          <code class="font-mono">jobId</code> is a UUIDv4 (122 bits of entropy) — not derivable
          from the user's input. The <code class="font-mono">remediation_events</code> rows are
          retained per
          <code class="font-mono">REMEDIATION.EVENT_LOG_RETENTION_DAYS</code>
          (7 years default — typical state-agency records-retention schedule); the
          <code class="font-mono">remediation_jobs</code> row is purged separately at
          <code class="font-mono">REMEDIATION.JOB_ROW_RETENTION_DAYS</code>
          (30 days default).
        </p>
      </div>

      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
          Deploy Topology (Ubuntu 22.04 + PM2 + Nginx + DigitalOcean)
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          The API spawns the worker via
          <code class="font-mono"
            >spawn(process.execPath, ['--import', 'tsx', WORKER_PATH, jobId], { detached: true,
            stdio: 'ignore' }).unref()</code
          >. PM2 does not manage the worker — it's a transient child of the API process, killed by
          the OS when the pipeline completes or crashes. Worker stdout is suppressed; all signals
          flow through the database (<code class="font-mono">remediation_jobs.status</code>,
          <code class="font-mono">progress_pct</code>, <code class="font-mono">step</code>) which
          the frontend polls via
          <code class="font-mono">GET /api/remediate/:id/status</code>
          once per second (backing off toward 8 s if requests fail).
        </p>
        <p class="text-[var(--text-muted)] mb-3">
          <strong>System packages required on the deploy box:</strong>
          <code class="font-mono">qpdf ≥ 10.x</code>,
          <code class="font-mono">openjdk-17-jre-headless</code>, and (optional) the veraPDF CLI
          from
          <a
            href="https://verapdf.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >verapdf.org</a
          >. The <code class="font-mono">rebuild.sh</code> preflight verifies all three on every
          deploy and emits warnings if any are missing or below required version. The feature flag
          <code class="font-mono">REMEDIATION_ENABLED</code> is forwarded from the parent shell
          through <code class="font-mono">ecosystem.config.cjs</code>'s env block, so the deploy
          idiom is:
        </p>
        <pre
          class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] overflow-x-auto"
          tabindex="0"
        >
sudo apt install -y openjdk-17-jre-headless   <span class="text-[var(--text-muted)]"># one-time</span>
echo 'REMEDIATION_ENABLED=true' | sudo tee -a /etc/environment
source /etc/environment
./rebuild.sh                                  <span class="text-[var(--text-muted)]"># pulls, builds, pm2 restart</span>

<span class="text-[var(--text-muted)]"># Rollback to audit-only without redeploying:</span>
sudo sed -i '/^REMEDIATION_ENABLED=/d' /etc/environment
pm2 restart ecosystem.config.cjs</pre>
      </div>

      <!-- Limitations -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">
          Limitations &amp; What This Tool Cannot Do
        </h3>
        <p class="text-[var(--text-muted)] mb-3">
          This tool provides a thorough <em>automated</em> assessment, but no automated tool can
          fully replace manual accessibility testing. Important limitations:
        </p>
        <ul class="space-y-2 text-xs text-[var(--text-muted)]">
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">1.</span
            ><span
              ><strong>Alt text quality:</strong> For PDFs, the tool detects whether alt text exists
              and runs a heuristic check for obviously poor alt text (hex-encoded strings, filenames
              like "IMG_001.jpg", generic placeholders like "image", and long strings without
              spaces); for Word, PowerPoint, and Excel, alt text is currently checked for presence
              only, without that heuristic quality pre-filter. In neither case can the tool evaluate
              whether alt text is <em>semantically meaningful</em> — for example, "a chart"
              technically passes all automated checks, but "Bar chart showing 2024 crime rates by
              county" is far more useful. Human review is still needed to assess alt text quality
              beyond the heuristic flags.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">2.</span
            ><span
              ><strong>Color contrast (PDF only):</strong> PDF color contrast analysis requires
              rendering each page as an image and analyzing pixel colors. This tool focuses on
              structural accessibility (tags, metadata, markup) and does not currently assess color
              contrast for PDFs. Word, PowerPoint, and Excel are the exception: their colors live in
              the document XML (explicit values, theme references, and Excel's legacy indexed
              palette are all resolved), so contrast <em>is</em> machine-checked for those three
              formats.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">3.</span
            ><span
              ><strong>Natural language clarity:</strong> The tool cannot evaluate whether the text
              itself is written clearly. WCAG 3.1.5 recommends content be written at a lower
              secondary education reading level — this requires human judgment.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">4.</span
            ><span
              ><strong>Decorative images:</strong> Not all images need alt text — decorative images
              should be marked as artifacts. For PDFs, the tool cannot distinguish informative
              images from decorative ones; it reports all images without alt text as a potential
              issue. Word, PowerPoint, and Excel are the exception: the tool reads each format's own
              "mark as decorative" flag and excludes those images from the alt-text check.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">5.</span
            ><span
              ><strong>Complex layouts:</strong> While reading order is assessed via MCID sequence
              analysis, extremely complex layouts (e.g., multi-column magazine spreads, nested pull
              quotes) may have subtle ordering issues that the 20% disorder threshold doesn't
              catch.</span
            >
          </li>
        </ul>
        <p class="text-[var(--text-muted)] mt-3">
          For a complete accessibility evaluation, this tool's automated analysis should be
          supplemented with manual testing using an actual screen reader (e.g., NVDA, JAWS, or
          VoiceOver) and the
          <a
            href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >Adobe Acrobat Accessibility Checker</a
          >
          for PDFs, or the Microsoft Office Accessibility Checker for Word, PowerPoint, and Excel
          documents.
        </p>
        <p class="text-[var(--text-muted)] mt-3">
          <strong>These limitations apply to auto-remediation too.</strong>
          When the optional auto-remediation feature runs, OpenDataLoader can add a
          <code class="text-xs font-mono">/Figure</code>
          structure element for an image — but it cannot author a meaningful description. The same
          human-judgment gap applies to color contrast, reading-order ambiguity in multi-column
          layouts, distinguishing decorative from informative images, and writing text at a clear
          reading level. Auto-remediation is genuinely helpful for the machine-checkable parts of
          accessibility (structure, metadata, language declaration); it is not a substitute for the
          human-judgment parts. The result page is explicit about this in the IITAA compliance
          disclaimer.
        </p>
      </div>

      <!-- The toolchain at a glance — merged from the standalone
           technical-details page in v1.98.0. -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">
          The Open-Source Toolchain at a Glance
        </h3>
        <div class="overflow-x-auto" tabindex="0">
          <table class="w-full text-sm">
            <caption class="sr-only">
              The open-source toolchain: each tool, its job, license, and pipeline stage
            </caption>
            <thead>
              <tr class="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                <th scope="col" class="py-2 pr-4 font-medium">Tool</th>
                <th scope="col" class="py-2 pr-4 font-medium">Job</th>
                <th scope="col" class="py-2 pr-4 font-medium">License</th>
                <th scope="col" class="py-2 font-medium">Pipeline</th>
              </tr>
            </thead>
            <tbody class="text-[var(--text-secondary)] text-xs">
              <tr class="border-b border-[var(--border)]/40">
                <td class="py-2.5 pr-4 font-mono">qpdf</td>
                <td class="py-2.5 pr-4">Structure parsing + PDF normalization</td>
                <td class="py-2.5 pr-4">Apache 2.0</td>
                <td class="py-2.5">Audit + Remediation (PDF)</td>
              </tr>
              <tr class="border-b border-[var(--border)]/40">
                <td class="py-2.5 pr-4 font-mono">pdfjs-dist</td>
                <td class="py-2.5 pr-4">Text + metadata extraction</td>
                <td class="py-2.5 pr-4">Apache 2.0</td>
                <td class="py-2.5">Audit (PDF)</td>
              </tr>
              <tr class="border-b border-[var(--border)]/40">
                <td class="py-2.5 pr-4 font-mono">jszip</td>
                <td class="py-2.5 pr-4">Unzip the OOXML package (.docx / .pptx / .xlsx)</td>
                <td class="py-2.5 pr-4">MIT / GPLv3</td>
                <td class="py-2.5">Audit (Office formats)</td>
              </tr>
              <tr class="border-b border-[var(--border)]/40">
                <td class="py-2.5 pr-4 font-mono">fast-xml-parser</td>
                <td class="py-2.5 pr-4">Parse OOXML structure &amp; content</td>
                <td class="py-2.5 pr-4">MIT</td>
                <td class="py-2.5">Audit (Office formats)</td>
              </tr>
              <tr class="border-b border-[var(--border)]/40">
                <td class="py-2.5 pr-4 font-mono">OpenDataLoader PDF</td>
                <td class="py-2.5 pr-4">Rule-based PDF auto-tagging</td>
                <td class="py-2.5 pr-4">Apache 2.0</td>
                <td class="py-2.5">Remediation (PDF)</td>
              </tr>
              <tr>
                <td class="py-2.5 pr-4 font-mono">veraPDF</td>
                <td class="py-2.5 pr-4">
                  PDF/UA validation — ISO 14289-1, or ISO 14289-2 when a document declares PDF/UA-2
                  — plus its machine-testable WCAG 2.2 profile (v1.97.0)
                </td>
                <td class="py-2.5 pr-4">MPL 2.0</td>
                <td class="py-2.5">Audit + Remediation (PDF)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Security / privacy -->
      <div>
        <h3 class="font-semibold text-[var(--text-heading)] mb-2">Privacy &amp; Security</h3>
        <p class="text-[var(--text-muted)] mb-3">
          The application is hosted on <strong>DigitalOcean</strong> cloud infrastructure (managed
          via Laravel Forge). When you upload a file:
        </p>
        <ul class="space-y-1.5 text-xs text-[var(--text-muted)] mb-3">
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">1.</span
            ><span
              >A PDF is written to a temporary directory on the server, analyzed by QPDF, PDF.js,
              and veraPDF, and <strong>immediately deleted</strong>. A Word, PowerPoint, or Excel
              file never touches disk — it's held in server memory and parsed by JSZip +
              fast-xml-parser in a short-lived child process — the bytes cross over an in-memory
              channel, never a temp file. Either way, no file content is retained after analysis
              completes.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">2.</span
            ><span
              >The file exists in server memory for the duration of analysis (typically under 10
              seconds); the qpdf analyzer briefly works from a randomly named temp copy that is
              deleted in the same request.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">3.</span
            ><span
              >No PDF data is transmitted to external APIs, cloud services, or AI models — all
              analysis runs on the server itself.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">4.</span
            ><span
              >Encrypted (password-protected) PDFs are rejected with a clear error before analysis
              begins.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-secondary)] font-bold flex-shrink-0">5.</span
            ><span
              >A concurrency semaphore limits the server to two simultaneous analyses to prevent
              resource exhaustion.</span
            >
          </li>
        </ul>
        <p class="text-[var(--text-muted)] mb-2">
          <strong>Shared reports:</strong> When you click "Share Report," the analysis
          <em>results only</em> — scores, category findings, grade, metadata (title, author, page
          count) — are saved to a
          <strong>SQLite database file on the same DigitalOcean droplet</strong>. Specifically:
        </p>
        <ul class="space-y-1.5 text-xs text-[var(--text-muted)]">
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              >The <strong>original uploaded file is never saved</strong> — only the structured
              audit results (JSON) are stored.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              >Shared links expire after <strong>365 days</strong>. After expiration, the stored
              results are eligible for permanent deletion. The 365-day window is sized for the
              auditor / fleet inventory use case — fleet reports run on a multi-month cadence and
              reviewers need report links to stay valid for at least a year. Older results are
              deleted by the periodic cleanup sweep.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              >Anyone with the link can view the report. There are no accounts on this tool at all —
              nothing to sign in to, for sharing or anything else.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              >The database is stored locally on the server filesystem — it is not replicated to any
              external storage or cloud backup service. It <em>is</em> snapshotted nightly
              <strong>on that same machine</strong> (v1.49.0+), keeping the 5 newest snapshots, so a
              disk failure does not erase the audit record. A snapshot copies this database and
              nothing else: audit records, not audited files. Because no uploaded document is ever
              written to disk, no backup can contain one —
              <NuxtLink
                to="/data-retention#backups-explained"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >why that isn't a contradiction</NuxtLink
              >.</span
            >
          </li>
        </ul>

        <!-- Remediation-specific privacy details -->
        <p class="text-[var(--text-muted)] mt-5 mb-2">
          <strong>When auto-remediation is enabled</strong> (the optional v1.18.0 feature behind
          <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code>), the file lifecycle
          differs from a plain audit. The remediation worker needs the PDF on disk briefly to run
          external tools (qpdf, OpenDataLoader, veraPDF). The posture remains "as short-lived as the
          work requires, then deleted with verification":
        </p>
        <ul class="space-y-1.5 text-xs text-[var(--text-muted)]">
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>No between-stage cache.</strong> A PDF is never stored on disk waiting for
              the user to click "Remediate" after an audit. Clicking the button prompts a fresh
              multipart upload — the just-audited buffer is not preserved server-side.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Inputs deleted between pipeline stages.</strong>
              After qpdf normalizes the uploaded file, the original input is deleted. After
              OpenDataLoader produces the tagged output, the normalized intermediate is deleted. At
              any moment, at most one copy of the PDF exists on disk per job. The entire scratch
              directory is wiped in a
              <code class="text-xs font-mono">finally</code> block regardless of pipeline outcome
              (including crashes).</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Output deleted on first download.</strong> The remediated PDF is served via a
              single-use download token. The file is deleted as soon as the response stream closes,
              and an <code class="text-xs font-mono">fs.stat</code> call verifies the deletion
              succeeded (the
              <code class="text-xs font-mono">verified_absent</code>
              event in the audit log is the auditor evidence). Concurrent or repeat download
              attempts return
              <code class="text-xs font-mono">410 Gone</code>.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Maximum 30-minute output retention.</strong> If the user never downloads, a
              cleanup sweep removes the file after
              <code class="text-xs font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
              (default 30 minutes) and marks the job
              <code class="text-xs font-mono">status='expired'</code>.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Lifecycle events contain no PDF content.</strong>
              Each step (received, normalize_complete, tagging_complete, validation_passed,
              output_ready, downloaded, output_deleted, verified_absent, etc.) writes a row to
              <code class="text-xs font-mono">remediation_events</code>
              with a server-side timestamp and a JSON payload of structural metadata only. File
              paths are recorded as SHA-256 hashes rather than literal strings.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>No external API calls.</strong> The remediation pipeline runs entirely on
              this server. OpenDataLoader and veraPDF execute locally; the file never leaves the
              droplet. AI-based alt text generation (which would call a hosted vision API) is
              explicitly not used in v1 — see the
              <code class="text-xs font-mono"
                >docs/archive/pdf-remediation-alt-text-walkthrough-spec.md</code
              >
              roadmap document for the AI-free Phase 1 approach.</span
            >
          </li>
          <li class="flex gap-2">
            <span class="text-[var(--text-muted)]">•</span
            ><span
              ><strong>Per-user concurrency limit.</strong> Each user can have at most one
              remediation job in flight at a time (<code class="text-xs font-mono"
                >REMEDIATION.MAX_CONCURRENT_JOBS_PER_USER</code
              >). The 50 MB file-size cap, 500-page count cap, 5-minute wall-clock timeout, and 768
              MB JVM heap cap are additional resource-exhaustion guards.</span
            >
          </li>
        </ul>
      </div>

      <!-- Source code -->
      <div
        class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
      >
        <p class="text-[var(--text-muted)]">
          <strong class="text-[var(--text-secondary)]">Verify for yourself:</strong>
          The complete source code for the analysis
          <em>and</em> auto-remediation pipelines is open source.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/tree/main/apps/api/src/services"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
              />
            </svg>
            Analysis Services (scorer, QPDF, PDF.js, Office parsers)
            <svg
              class="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/blob/main/audit.config.ts"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
              />
            </svg>
            Configuration &amp; Weights (audit.config.ts)
            <svg
              class="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
          <a
            href="https://github.com/ICJIA/file-accessibility-audit/tree/main/apps/api/src/jobs"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
              />
            </svg>
            Remediation Services (worker, ODL, veraPDF)
            <svg
              class="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
          <a
            href="https://github.com/ICJIA/file-accessibility-audit"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
              />
            </svg>
            Full Repository
            <svg
              class="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/index.vue (Phase F, task F1:
// perf(web) lazy technical-explainer extraction). The only component
// referenced, <DiagramFigure>, is auto-imported globally the same way it was
// inside the page.
//
// COUNTED, NOT TYPED (2026-08-31). The Best-practices paragraph used to carry
// "37 … 19 … 18" as literal prose while the same three numbers were separately
// pinned as literals in the catalog tests: adding a practice turned the tests
// green and left this sentence quietly wrong. Every count on a public page is
// computed from its source or not stated at all.
import { CATALOG } from "~/utils/bestPractices";

// New tab only while leaving would destroy a running audit (this explainer is
// rendered on the audit page itself, inside a collapsible).
const auditInProgress = useAuditInProgress();
import { PDF_PRACTICES } from "~/utils/bestPractices/pdf";

const bpTotal = CATALOG.length;
const bpPdf = PDF_PRACTICES.length;
const bpOffice = bpTotal - bpPdf;
</script>

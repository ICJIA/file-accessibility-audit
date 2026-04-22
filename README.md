# ICJIA File Accessibility Audit

![ICJIA File Accessibility Audit](apps/web/public/og-image.png)

**Production URL:** https://audit.icjia.app | **Source:** https://github.com/ICJIA/file-accessibility-audit

A web tool that scores PDF accessibility readiness against [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. Upload one or more PDFs (up to 5), get instant grades (A–F) with category-by-category findings and remediation guidance.

**This tool is diagnostic only** — it identifies accessibility issues but does not fix them. The intended workflow is: upload → review findings → fix in Adobe Acrobat → re-upload to verify.

## Quick Start

### Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **pnpm 9+**
- **QPDF 11+**

```bash
# macOS
brew install qpdf node pnpm

# Ubuntu/Debian
sudo apt install -y qpdf
npm install -g pnpm
```

### Install & Run

```bash
# Install dependencies
pnpm install

# Set up environment files
cp apps/api/.env.example.local apps/api/.env
cp apps/web/.env.example.local apps/web/.env

# Start both servers (kills stale ports automatically)
pnpm dev
```

- **Frontend:** http://localhost:5102
- **API:** http://localhost:5103

That's it — the app works immediately with authentication disabled (the default). No email provider or credentials needed.

### Utility Scripts

```bash
pnpm clean      # Remove .nuxt, .output, Vite cache, and build artifacts
pnpm test       # Run all tests with summary
pnpm dev        # Start API + Web dev servers
pnpm build      # Type-check API + build Nuxt frontend
pnpm start:all  # Start both production servers (kills stale ports, API :5103, Web :5102)
pnpm rebrand    # Regenerate static files after changing BRANDING in audit.config.ts
```

## Authentication (Optional)

Authentication is **off by default**. The app can be used without any login, email provider, or credentials. This is controlled by a single toggle in `audit.config.ts`:

```ts
export const AUTH = {
  REQUIRE_LOGIN: false, // ← set to true to enable OTP authentication
  // ...
};
```

### With auth disabled (`REQUIRE_LOGIN: false` — default)

- Users go straight to the upload page — no login screen
- No email provider or SMTP credentials needed
- No audit history is recorded (no user identity to associate with analyses)
- All security protections (rate limiting, file validation, CORS) remain active

### With auth enabled (`REQUIRE_LOGIN: true`)

- Users must authenticate via a **6-digit one-time password (OTP)** sent to their email
- Only `illinois.gov` email addresses are accepted (configurable via `AUTH.ALLOWED_EMAIL_REGEX`)
- Sessions last 72 hours via JWT in an httpOnly cookie — no passwords stored
- All analyses are logged with the authenticated user's email for audit history
- **Requires an email provider** — the app needs to send OTP codes (see below)

### Why an email provider is needed

When authentication is enabled, the app sends one-time passcodes via email. This requires an SMTP relay service. The app supports two providers out of the box:

| Provider          | Docs                                                             |
| ----------------- | ---------------------------------------------------------------- |
| Mailgun (default) | [docs/07-mailgun-integration.md](docs/07-mailgun-integration.md) |
| SMTP2GO           | [docs/06-smtp2go-integration.md](docs/06-smtp2go-integration.md) |

The provider is controlled in `audit.config.ts` → `EMAIL.PROVIDER`. Credentials go in `apps/api/.env`:

```env
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password
```

**To switch providers**, change one line in `audit.config.ts`:

```ts
PROVIDER: "mailgun"; // ← change to 'smtp2go' to switch
```

Host and port are set automatically per provider.

**Dev note:** When running locally with auth enabled, OTP codes are printed to the API console — no email credentials needed for development.

## Scoring Rubric

Each PDF is assessed across named accessibility categories based on [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. Categories that don't apply to a document (e.g., tables in a document with no tables) are excluded and the remaining weights are renormalized.

### Two scoring methodologies, one document

Every audit surfaces **two score profiles side-by-side**: a **Strict semantic score** and a **Practical readiness score**. Both use WCAG guidelines to evaluate the same document; they differ in category weights and whether PDF/UA signals are scored:

> **Strict** is WCAG-based, anchored to **WCAG 2.1 Level AA** and **Illinois IITAA §E205.4** for non-web documents. Nine categories, no PDF/UA category. Emphasizes programmatically determinable structure — real `H1`–`H6` headings, real `TH`/`Scope`/`Headers` table semantics, logical reading order.
>
> **Practical** is also WCAG-based, but it uses **different category weights** than Strict and adds a dedicated **PDF/UA Compliance Signals** category (MarkInfo, tab order, PDF/UA identifiers, list/table legality). It also applies partial-credit floors on heading and table structure.

Both methodologies correctly evaluate the same document — neither is "right." They can produce different scores because they emphasize different signals. Pick whichever view (or both together) matches the question being asked.

#### Strict is the canonical score and the floor for Practical

One invariant governs the relationship between the two overall scores:

> **Strict ≤ Practical, always.**

**Strict is the canonical number.** It aligns with the three standards that actually govern non-web document accessibility in Illinois:

- **WCAG 2.1 Level AA** — the W3C Web Content Accessibility Guidelines
- **ADA Title II** — the 2024 U.S. Department of Justice rule requiring state/local government digital content to meet WCAG 2.1 AA by April 2026
- **Illinois IITAA §E205.4** — frames non-web document accessibility through WCAG 2.1 AA

Cite the Strict score for legal-compliance decisions, Illinois agency publication sign-off, ADA Title II reviews, FOIA responses, and any audit conversation with a group (e.g. DoIT) that evaluates documents against IITAA without a PDF/UA overlay.

**Practical adds a PDF/UA layer (ISO 14289-1) on top of Strict.** PDF/UA is an ISO standard for tagged-PDF structural integrity; it is *not* a legal requirement for final PDFs under Illinois accessibility rules. IITAA §504.2.2 references PDF/UA only for *authoring-tool* export capability (whether a tool can emit PDF/UA-1), not for the PDF artifact itself. Practical scores the PDF/UA signals alongside the WCAG signals because many commercial remediation tools report on them and because the signals correlate with assistive-technology behaviour — but the Practical score is a supplementary remediation-readiness view, not a legal-compliance answer.

The floor rule ties the two together: Practical starts from the same document evidence as Strict and can add points for things Strict deliberately ignores — 70-point partial-credit floors on heading and table structure when the conditions apply, and the PDF/UA Compliance Signals category (MarkInfo, tab order, PDF/UA identifiers, list/table legality). When none of those bonuses apply, Practical simply equals Strict. Practical can never drop below Strict; if the raw weighted-average math would produce a lower number (because Practical's different category weights moved scoring mass toward a category that scored low, or because a weak PDF/UA score dragged the aggregate down), the scorer lifts Practical up to Strict.

**Why this matters for auditing.** Both overall scores are always visible in the app (a dual-score audit row sits directly under the main grade circle) and in every export format (JSON, Word, HTML, Markdown). The JSON export also includes `scoreProfiles.remediation.rawOverallScore` (the pre-floor weighted-average result) and a `flooredToStrict` boolean so an auditor can reconstruct the math either way. Nothing about the per-category Practical scores changes when the floor kicks in — only the aggregate `overallScore` is lifted. That keeps the raw category math inspectable.

**Effect on the control fixtures:**

| Fixture | Strict | Practical | `rawOverallScore` | `flooredToStrict` |
|---|---|---|---|---|
| FY_22 Annual Report (baseline) | 39 | 57 | 57 | false |
| FY_22 Annual Report (remediated) | 67 | 83 | 83 | false |
| WomenInPolicing 2021 (baseline) | 65 | 65 | 65 | false |
| WomenInPolicing 2021 (remediated) | 81 | 81 | 81 | false |

In every fixture we have, `flooredToStrict` stays `false` — the Strict-floor rule is an insurance policy rather than a frequent intervention. It exists so users never encounter the counterintuitive "Practical scored 80 on a file Strict scored 81" result a future document could otherwise produce.

**What Practical is (and isn't).** Practical is not "Strict plus a bonus" — it is "Strict with different category weights plus the extra `pdf_ua_compliance` category, floored at Strict." The weight differences can push individual category contributions in either direction; the floor handles the case where those differences conspire against the overall number.

#### Why two profiles instead of one

Most accessibility tools collapse these questions into a single number and quietly disagree with each other. The result is the common frustration of "Acrobat says my PDF passes but my audit tool fails it" — or vice versa. Exposing both lenses explicitly lets you:

1. **See the whole picture at a glance.** If Strict and Practical agree, you have a high-confidence signal. If they diverge, the divergence itself is information about how the document scores under different methodologies.
2. **Pick the right score for the right conversation.** Strict is the WCAG + IITAA §E205.4 view; Practical also includes PDF/UA signals. Use Strict when the question is about WCAG / IITAA §E205.4 alignment; use Practical when the question involves PDF/UA-focused tools or remediation progress tracking.
3. **Avoid a false binary.** A PDF is rarely simply "accessible" or "not accessible." A file can improve meaningfully (more tags, more bookmarks, cleaner row structure) while still lacking the deep semantic evidence that assistive technology needs most. Strict refuses to round that up; Practical rewards the scaffolding. Both views are valid.

#### Practical methodology notes

- **Practical's weights and partial-credit floors are judgment calls built into this tool.** The 9.5% weight on PDF/UA Compliance Signals, the 70-point floors on `heading_structure` and `table_markup`, and the reading-order proxy bonuses (55 baseline + up to 40) are tool-level numbers. They are not published standards. Other tools using their own "practical" weighting will produce different numbers for the same PDF.
- **PDF/UA is referenced differently in Illinois IITAA 2.1.** IITAA §504.2.2 references PDF/UA for authoring-tool export capability; §E205.4 frames final-document accessibility through WCAG 2.1. Practical's PDF/UA category surfaces the §504.2.2-style signals alongside the §E205.4/WCAG signals; Strict only surfaces the §E205.4/WCAG signals.
- **Profile origin is machine-identifiable.** The JSON export includes an `origin` tag on each profile: `wcag.iitaa.strict` for Strict, `wcag.pdfua.practical` for Practical. Downstream consumers can filter on that when comparing against other tools.
- **Matterhorn** is worth a one-line clarification: it is _not_ a separate law or accessibility standard. It is a detailed testing protocol / checklist used by some tools to evaluate PDF/UA-style conformance. In this app it only appears as context for Practical's PDF/UA category.
- **Neither profile is a legal determination.** For a definitive compliance verdict, pair the audit with PAC 2024, an Adobe Acrobat Accessibility Full Check, and — where possible — review by a human accessibility specialist.

Every report, export (Word, HTML, Markdown, JSON), shared report, and AI-analysis payload surfaces both profiles with their origin tags. See [docs/10-scoring-reconciliation.md](docs/10-scoring-reconciliation.md) for deeper rationale on when the profiles diverge.

#### Adobe Acrobat parity panel — the third view

Every report includes an **Adobe Acrobat parity** card that mirrors Acrobat's built-in Accessibility Checker 32 rules alongside this tool's Strict and Practical verdicts. The card sits **above** Category Scores on every report so the three lenses land in a single scan: grade circle → Strict/Practical dual-score row → Acrobat parity card → Category Scores.

The card is a reconciliation view, not a scoring profile — **no aggregated "Adobe score" is exposed**, because anchoring on that number would defeat the purpose. The tallies are qualitative (passed / failed / manual / skipped / not computed) with a separate `vacuousPasses` count called out explicitly.

**Interactive tallies.** Each of the five tally pills is a button with an `aria-pressed` state. Clicking a pill filters the full 32-rule detail list to just that bucket, auto-expands the detail section, and smooth-scrolls the body into view. Clicking the active pill again clears the filter; a "Show all 32" banner in the filtered state does the same thing. Pills with zero rules are disabled. Hovering a pill shows a native-title tooltip previewing the exact rule names in that bucket — vacuous passes are marked `(vacuous)` — so auditors can see what each tally is pointing at without needing to click. All pills are keyboard-navigable (Tab / Enter / Space) and ring-highlighted when active.

**Why the card is there.** Acrobat's checker is the most visible PDF accessibility tool, so users anchor on "Acrobat says my PDF passes." In practice, Acrobat's 32 rules are mostly _existence-validators_: they check whether tags already present are well-formed, but rarely assert that a type of content _must exist_. On sparse documents most rules pass **vacuously** — no tables → 4 table rules pass, no figures → all 5 alt-text rules pass, no headings → "Appropriate nesting" passes. Acrobat reports these as "Passed" with no asterisk. On the ILHEAL control fixture Acrobat reports `28/32 passed` while ~20 of those 28 are vacuous passes against an essentially empty structure tree.

**The authority callout inside the card** names the references that actually govern Illinois electronic-document accessibility: **WCAG 2.1 AA via IITAA §E205.4** is the legal bar. **PDF/UA (ISO 14289-1)** is industry-standard for broader PDF accessibility but is not required by Illinois law; IITAA §504.2.2 references PDF/UA only for authoring-tool export capability. **Matterhorn Protocol** is the PDF Association's formal 136-condition PDF/UA test — another reminder that Acrobat's 32 rules sit well below either canonical standard. Managers and authors who read "Acrobat: 28/32 passed" and assume the file is accessible can see the fuller picture without having to ask.

Adobe's own documentation for the 32-rule checker is at [helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html); the parity card header and authority callout both link directly there so anyone can verify the rule set against Adobe's own reference with one click.

### Categories & Weights

The weights column shows both profiles. Strict weighs nine core categories. Practical renormalizes those nine _and_ adds PDF/UA Compliance Signals and Color Contrast (the latter reserved for future rendered-PDF analysis).

| Category                      |   Strict   | Practical  | WCAG Criteria | Why It Matters                                                                                                                                                                                                                   |
| ----------------------------- | :--------: | :--------: | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text Extractability           |    20%     |   17.5%    | 1.3.1, 1.4.5  | The most fundamental requirement. If a PDF is a scanned image with no real text, screen readers have nothing to read. Non-embedded fonts cap this category at 85 (Minor).                                                       |
| Title & Language              |    15%     |    13%     | 2.4.2, 3.1.1  | The document title is the first thing a screen reader announces. The language tag controls pronunciation.                                                                                                                       |
| Heading Structure             |    15%     |    13%     | 1.3.1, 2.4.6  | Headings (H1–H6) are the primary way screen reader users navigate and skim documents. Multiple H1 headings are flagged as a minor issue (75).                                                                                   |
| Alt Text on Images            |    15%     |    13%     | 1.1.1         | Every informative image must have a text alternative. Without it, blind users get no indication of what the image shows. Images are detected via QPDF tags; pdfjs-dist provides a fallback for untagged PDFs.                   |
| **PDF/UA Compliance Signals** | _Practical only_ | **9.5%** | 1.3.1, 4.1.1  | Practical-only. Aggregates PDF/UA-oriented structural signals: StructTreeRoot, `MarkInfo`/`Marked`, PDF/UA identifiers, tab order, list legality, and table legality. Not a formal PDF/UA conformance verdict — use PAC for that. |
| Bookmarks                     |    10%     |    8.5%    | 2.4.5         | For documents over 10 pages, bookmarks provide a navigable table of contents.                                                                                                                                                    |
| Table Markup                  |    10%     |    8.5%    | 1.3.1         | Without header cells (TH), screen readers read table data in a flat stream with no context.                                                                                                                                      |
| Color Contrast                | _N/A_      | _N/A (4.5% reserved)_ | 1.4.3     | Placeholder for future rendered-PDF contrast analysis. Surfaced transparently as N/A in both modes today.                                                                                                                       |
| Link Quality                  |    5%      |    4.5%    | 2.4.4         | Raw URLs are meaningless when read aloud. Descriptive link text tells users where a link goes.                                                                                                                                   |
| Reading Order                 |    5%      |    4%      | 1.3.2         | The tag structure must define a logical reading sequence.                                                                                                                                                                        |
| Form Fields                   |    5%      |    4%      | 1.3.1, 4.1.2  | Unlabeled form fields are unusable with assistive technology.                                                                                                                                                                    |
| **Total**                     | **100%**   | **100%**   |               |                                                                                                                                                                                                                                  |

### Grade Scale

| Grade | Score Range | Label             |
| :---: | :---------: | ----------------- |
| **A** |   90–100    | Excellent         |
| **B** |    80–89    | Good              |
| **C** |    70–79    | Needs Improvement |
| **D** |    60–69    | Poor              |
| **F** |    0–59     | Failing           |

### Severity Levels

Each category receives a severity based on its individual score:

| Severity | Score Range | Meaning                                                     |
| -------- | :---------: | ----------------------------------------------------------- |
| Pass     |   90–100    | Meets accessibility standards.                              |
| Minor    |    70–89    | Small improvements recommended.                             |
| Moderate |    40–69    | Should be addressed before publishing.                      |
| Critical |    0–39     | Must be fixed — represents a significant barrier to access. |

### Reference Standards

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ADA Title II Final Rule (2024)](https://www.ada.gov/resources/title-ii-rule/)
- [Section 508 Standards](https://www.section508.gov/manage/laws-and-policies/)
- [PDF/UA (ISO 14289-1)](https://pdfa.org/resource/pdfua-in-a-nutshell/)

Scoring aligns with WCAG 2.1 Level AA success criteria and ADA Title II digital accessibility requirements effective April 2026. All scoring constants live in `audit.config.ts`.

## Batch Upload

Upload up to **5 PDF files** at once. Files are analyzed in parallel (2 at a time) and results are displayed in a tab bar — click any tab to see its full report, export, or share.

### How it works

- **Drop or select multiple PDFs** — the drop zone accepts multiple files. Files are staged with a preview list before analysis begins.
- **Frontend-only orchestration** — no new API endpoints, no server-side queue. The browser calls the existing `/api/analyze` endpoint once per file with a client-side concurrency limit of 2 (matching the server's `MAX_CONCURRENT_ANALYSES`).
- **Per-file progress** — a progress view shows each file's status (queued, processing, done, error) with grade badges as they complete.
- **Tab-based results** — after processing, a horizontal tab bar lets you switch between reports. Export and share work on the active tab's result.
- **Single file unchanged** — dropping a single file works exactly as before (no tab bar, no staging step).

### Limits

| Constraint          | Value            | Enforced by                           |
| ------------------- | ---------------- | ------------------------------------- |
| Max files per batch | 5                | Frontend (`DropZone.vue`)             |
| Max file size       | 15 MB each       | Frontend + multer + nginx             |
| Concurrent uploads  | 2                | Frontend semaphore + server semaphore |
| Rate limit          | 30 analyses/hour | Server (`analyzeLimiter`)             |

**Note:** `BATCH.MAX_FILES` in `audit.config.ts` is the canonical constant (currently 5). The frontend DropZone also enforces this limit client-side.

## Report Exports

Reports can be downloaded in four formats, all with links back to [audit.icjia.app](https://audit.icjia.app):

| Format             | Contents                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Word (.docx)**   | Formatted report with score table, detailed findings, help links, and grade colors             |
| **HTML (.html)**   | Standalone dark-themed page with full report — works offline, printable                        |
| **Markdown (.md)** | Plain-text report with tables and findings — works in any text editor or docs platform         |
| **JSON (.json)**   | Machine-readable v2.0 schema with WCAG mappings, remediation plan, and LLM context (see below) |

Reports can also be shared via **shareable links** that expire after 15 days. Shared report pages include:

- **Export buttons** — download the report as Word, Markdown, or JSON directly from the shared link
- **CTA to audit tool** — "Audit Your PDF" button linking back to the live tool
- **Methodology card** — "How Scores Are Derived" section with links to QPDF and PDF.js (Mozilla) docs, WCAG 2.1 and ADA Title II references, and a link to the full scoring rubric
- **Recommendation card** — a prominent Strict vs Practical explainer near the score hero that recommends Strict for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review
- **Per-category WCAG references** — every scored category card shows a dedicated "WCAG 2.1 References" panel listing the exact success criteria the score is tied to (id, name, Level A/AA), with each row linking to the official W3C Understanding document so reviewers can verify the grade against the standard
- **Severity highlighting** — critical issue counts in red, moderate in yellow within the executive summary
- **Caveat notice** — recommendation to verify with Adobe Acrobat and make source documents accessible before PDF export

When auth is disabled, shared reports display "Shared on [date]" without exposing usernames.

## Document Metadata

Every report includes a **Document Metadata** section that surfaces embedded PDF properties. This metadata is **informational only** — it is not scored or factored into the accessibility grade. Fields that are missing from the PDF display as "Not set," which itself is useful for identifying incomplete metadata.

| Field              | Source             | What it tells you                                                      |
| ------------------ | ------------------ | ---------------------------------------------------------------------- |
| Source Application | `Creator`          | The authoring tool (e.g., Microsoft Word, Adobe InDesign, LibreOffice) |
| PDF Producer       | `Producer`         | The PDF generation engine (e.g., macOS Quartz, Adobe PDF Library)      |
| PDF Version        | `PDFFormatVersion` | PDF spec version (e.g., 1.4, 1.7, 2.0) — tagged PDF requires 1.4+      |
| Page Count         | Document           | Total number of pages                                                  |
| Author             | `Author`           | Document author metadata                                               |
| Subject            | `Subject`          | Document subject/description                                           |
| Keywords           | `Keywords`         | Embedded keywords for search and classification                        |
| Created            | `CreationDate`     | When the PDF was originally generated                                  |
| Last Modified      | `ModDate`          | When the PDF was last modified                                         |
| Encrypted          | `IsEncrypted`      | Whether the PDF has password protection or permission restrictions     |

## SEO

The app uses **[@nuxtjs/seo](https://nuxtseo.com/)** for comprehensive search engine optimization:

| Feature           | Implementation                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Sitemap**       | Auto-generated at `/sitemap.xml` — includes public pages, excludes auth/admin routes       |
| **Robots**        | Auto-generated at `/robots.txt` — blocks `/api/`, `/login`, `/my-history`, `/history`      |
| **Schema.org**    | `Organization` identity (ICJIA) via module + `WebApplication` JSON-LD in page head         |
| **Open Graph**    | Full OG tags with 1200x630 image, alt text, site name, locale                              |
| **Twitter Cards** | `summary_large_image` with title, description, image, and alt text                         |
| **Favicons**      | `favicon.ico`, `favicon.png` (32px), `apple-touch-icon.png` (180px), PWA icons (192/512px) |
| **Web Manifest**  | `site.webmanifest` for PWA install and app metadata                                        |
| **Canonical URL** | `https://audit.icjia.app`                                                                  |
| **Meta**          | `description`, `keywords`, `author`, `theme-color`, `lang="en"`                            |

## AI Readiness

The app is structured for discovery and consumption by LLMs, AI agents, and automated tools:

### LLM Discovery Files

| File                                                      | Purpose                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`/llms.txt`](https://audit.icjia.app/llms.txt)           | Concise summary: what the app does, scoring categories, grade scale, API endpoints    |
| [`/llms-full.txt`](https://audit.icjia.app/llms-full.txt) | Full documentation: per-category scoring logic, remediation steps, JSON export schema |

These follow the emerging [`llms.txt` convention](https://llmstxt.org/) — a plain-text file at the site root that tells AI crawlers what the site does and how to use it.

### JSON Export (Schema v2.0)

The JSON export is designed for machine consumption. Beyond the basic report data, it includes:

| Section                   | What it provides                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `categories[].status`     | Machine-readable `"pass"`, `"minor"`, `"moderate"`, `"fail"`, or `"not-applicable"`             |
| `categories[].wcag`       | WCAG 2.1 success criteria IDs, principle name, and tool-specific remediation steps              |
| `remediationPlan`         | Prioritized fix steps sorted by severity — each with category, score, WCAG criteria, and action |
| `llmContext.prompt`       | Pre-built prompt summarizing the audit, ready to paste into any LLM                             |
| `llmContext.standards`    | Array of applicable standards (WCAG 2.1 AA, ADA Title II, Section 508, PDF/UA)                  |
| `llmContext.scoringScale` | Score range definitions for pass/minor/moderate/fail                                            |

### Structured Data

- **WebApplication JSON-LD** in `<head>` — identifies the app type, features, author, and pricing (free) for search engines and AI agents
- **Schema.org Organization** — links ICJIA as the publisher via `@nuxtjs/seo`

## CLI Tool

The monorepo includes `a11y-audit`, a command-line PDF accessibility analyzer that uses the same scoring engine as the web app.

### Single-file audit

```bash
# Build the CLI
pnpm --filter @icjia/a11y-audit build

# Analyze a PDF
node apps/cli/dist/index.js report.pdf

# JSON output (pipe to jq, etc.)
node apps/cli/dist/index.js report.pdf --json

# CI gate — exit 1 if any file scores below 80
node apps/cli/dist/index.js docs/*.pdf --threshold 80
```

| Flag              | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `--json`          | Output results as JSON                                              |
| `--threshold <n>` | Minimum passing score (0–100) — exits with code 1 if any file fails |
| `--help`          | Show usage                                                          |
| `--version`       | Show version                                                        |

### Batch publication audit (`publist`)

Audits all ICJIA publications in bulk, generating CSV and HTML reports with grade distribution, category breakdowns, and remediation guidance.

```bash
# Audit all ICJIA publications (uses cache — fast on re-runs)
pnpm a11y-audit

# Force full re-scan (clears cache)
pnpm a11y-audit -- --force

# Clear cache only (e.g., after remediation)
pnpm a11y-audit -- --clear

# Custom concurrency
pnpm a11y-audit -- --concurrency 5
```

| Flag                    | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `--from <file>`         | Local JSON file with publication list (default: fetch from API) |
| `--output, -o <path>`   | CSV output path (default: `./publist-audit.csv`)                |
| `--force`               | Clear cache and re-audit all publications                       |
| `--clear`               | Clear cache only (no scan)                                      |
| `--concurrency, -c <n>` | Concurrent analyses, 1–10 (default: 3)                          |

**How it works:**

1. Fetches all publications from ICJIA's GraphQL API (with pagination)
2. Filters to PDF files, skips already-cached results
3. Downloads and audits each PDF with configurable concurrency
4. Caches results in `~/.a11y-audit/cache.db` (SQLite)
5. Generates CSV + HTML reports with grade distribution and assessment
6. Copies HTML report to `apps/web/public/publist.html` → accessible at `/publist`

**HTML report features:**

- Grade distribution bar chart
- Sortable columns (instant — sorts in-memory, renders 150 rows per page)
- Expandable detail rows with category breakdowns, severity badges, summary, and tags
- Embedded CSV download (no server round-trip)
- Assessment summary with remediation recommendations

**Manager access:** The report is served at `https://audit.icjia.app/publist` — a shareable URL for stakeholders. Not indexed by search engines.

## Project Structure

```
file-accessibility-audit/
├── apps/
│   ├── web/            # Nuxt 4 frontend
│   │   ├── public/     # Static assets (og-image, favicons, llms.txt, manifest)
│   │   └── app/        # Pages, components (DropZone, BatchProgress, AppTooltip, ScoreCard), composables, layouts
│   ├── api/            # Express API server
│   │   └── src/        # Routes, services, middleware, database
│   └── cli/            # a11y-audit CLI tool
│       └── src/        # Subcommand router, commands/, lib/ (cache, csv, html, graphql)
├── scripts/
│   └── rebrand.ts      # Regenerate static branding files (pnpm rebrand)
├── docs/               # Design documents (see below)
├── audit.config.ts     # Single source of truth for all constants + branding
├── og-image.svg        # OG image source (regenerated by pnpm rebrand)
├── ecosystem.config.cjs # PM2 config (production)
├── pnpm-workspace.yaml
└── .nvmrc              # Node.js version
```

## Tech Stack

| Layer        | Technology                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Frontend     | Nuxt 4 / Nuxt UI 4 / Light & dark mode / WCAG 2.1 AA compliant                     |
| SEO          | @nuxtjs/seo (sitemap, robots, Schema.org, OG)                                      |
| API          | Express / TypeScript / tsx (no build step in dev)                                  |
| PDF Analysis | QPDF (structure tree, tags) + pdfjs-dist (text/metadata, image detection fallback) |
| Database     | SQLite via better-sqlite3 (audit logs, shared reports)                             |
| Auth         | Optional email OTP → JWT (httpOnly cookie)                                         |
| Email        | Mailgun (default) / SMTP2GO (alternative) / Nodemailer                             |
| CLI          | tsup → single ESM bundle, QPDF + pdfjs-dist                                        |
| Deployment   | DigitalOcean → Laravel Forge → PM2 → nginx                                         |

## Configuration

All magic numbers, thresholds, weights, limits, and email provider settings are in **`audit.config.ts`** at the project root. This is the single source of truth — the API imports it directly, and the docs reference it.

- **Auth toggle** → `AUTH.REQUIRE_LOGIN` (`true` or `false`)
- **Scoring profiles & weights** → `SCORING_PROFILES` (`SCORING_WEIGHTS` remains the strict-profile alias)
- **Email provider** → `EMAIL.PROVIDER` (`'mailgun'` or `'smtp2go'`)
- **Share link expiry** → `SHARING.EXPIRY_DAYS` (default: 15)
- **Rate limits** → `RATE_LIMITS`
- **Dev/prod URLs** → automatic based on `NODE_ENV`

Secrets (`JWT_SECRET`, `SMTP_PASS`) stay in `.env` — never in config.

## White-Labeling / Branding

All organization-specific branding is centralized in the `BRANDING` section of **`audit.config.ts`**. Change these values to rebrand the tool for any organization:

```ts
export const BRANDING = {
  APP_NAME: "ICJIA File Accessibility Audit", // Header, page titles, SEO, exports
  APP_SHORT_NAME: "Accessibility Audit", // PWA manifest
  ORG_NAME: "Illinois Criminal Justice ...", // Schema.org, meta author, JSON-LD
  ORG_URL: "https://icjia.illinois.gov", // Schema.org identity link
  FAQS_URL: "https://accessibility.icjia.app", // Navbar FAQs link ('' to hide)
  GITHUB_URL: "https://github.com/ICJIA/...", // Footer GitHub link ('' to hide)
  DEFAULT_COLOR_MODE: "dark", // 'light' or 'dark' — user can toggle
};
```

These values flow automatically into:

| Where                   | What changes                                                 |
| ----------------------- | ------------------------------------------------------------ |
| **Header**              | App name in the top-left                                     |
| **Page titles & SEO**   | `<title>`, Open Graph, Twitter Cards, Schema.org             |
| **Color mode**          | Default light or dark mode preference                        |
| **Shared report pages** | Report title, footer attribution, CTA link                   |
| **Report exports**      | Markdown footer, JSON `reportMeta`, DOCX footer, HTML footer |
| **Navbar**              | FAQs link (hidden when `FAQS_URL` is `''`)                   |
| **Footer**              | GitHub link (hidden when `GITHUB_URL` is `''`)               |
| **API CORS**            | Uses `DEPLOY.PRODUCTION_URL` (also in `audit.config.ts`)     |

### Also update when rebranding

These values are in `audit.config.ts` but separate from `BRANDING`:

| Config                     | Section  | What it controls                                               |
| -------------------------- | -------- | -------------------------------------------------------------- |
| `DEPLOY.PRODUCTION_URL`    | `DEPLOY` | Production domain for CORS, canonical URL, shared report links |
| `EMAIL.DEFAULT_FROM`       | `EMAIL`  | Sender email address for OTP codes                             |
| `AUTH.ALLOWED_EMAIL_REGEX` | `AUTH`   | Allowed email domains for authentication                       |

### Regenerating static files

After changing `BRANDING` or `DEPLOY.PRODUCTION_URL`, run the rebrand script to regenerate all static branding files:

```bash
pnpm rebrand
```

This regenerates:

- `apps/web/public/site.webmanifest` — app name, short name
- `apps/web/public/llms.txt` — title, org, URLs
- `apps/web/public/llms-full.txt` — title, org, URLs, JSON schema examples
- `og-image.svg` — org name in the bottom bar
- `apps/web/public/og-image.png` — converted from SVG via sharp

The only file not covered by the script is `apps/cli/package.json` (package `name` field) — update manually if forking.

## Design Documents

| Doc                                                                        | Description                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [00 — Master Design](docs/00-master-design.md)                             | Architecture, scoring model, API, auth, security                                        |
| [01 — Phase 1: Core Grader](docs/01-phase-1-core-grader.md)                | Phase 1 deliverables and testing checklist                                              |
| [02 — Phase 2: Enhanced Features](docs/02-phase-2-enhanced-features.md)    | Batch upload, shareable reports                                                         |
| [03 — Phase 3: Admin & Monitoring](docs/03-phase-3-admin-monitoring.md)    | Admin dashboard, scheduled re-checks                                                    |
| [04 — Deployment Guide](docs/04-deployment-guide.md)                       | Infrastructure, env vars, nginx, firewall                                               |
| [05 — Use Cases](docs/05-use-cases.md)                                     | End-user scenarios and workflows                                                        |
| [06 — SMTP2GO Integration](docs/06-smtp2go-integration.md)                 | Email provider setup and gotchas                                                        |
| [07 — Mailgun Integration](docs/07-mailgun-integration.md)                 | Mailgun setup (default provider)                                                        |
| [08 — Phase 4: DOCX Support](docs/08-phase-4-docx-support.md)              | DOCX accessibility analysis via jszip + XML parsing                                     |
| [09 — Forge Deployment Cheatsheet](docs/09-forge-deployment-cheatsheet.md) | Step-by-step Laravel Forge deploy: nginx proxies, PM2, deploy script                    |
| [10 — Scoring Reconciliation](docs/10-scoring-reconciliation.md)           | Strict vs Practical scoring, PDF/UA rationale, WCAG/ADA interpretation, Matterhorn note |

## Tests

**473 tests** across 13 test files. Run all with a summary at the end:

```bash
pnpm test                # All tests (API + Web) with summary
pnpm test:api            # API tests only
pnpm test:web            # Web tests only
pnpm test:scoring        # Scoring model tests only
```

`pnpm test` prints a summary after all suites complete:

```
════════════════════════════════════════════════════════════
  TEST SUMMARY
════════════════════════════════════════════════════════════
  ✔ API      236 passed (5 files)
  ✔ Web      238 passed (8 files)
────────────────────────────────────────────────────────────
  ✔ 474 tests passed across 13 files
════════════════════════════════════════════════════════════
```

### API Tests (236 tests)

| File                  | Tests | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scorer.test.ts`      |   109 | All 11 named scoring categories, Strict vs Practical score profiles, grade/severity thresholds, N/A handling, weight renormalization, executive summary generation, edge cases, and supplementary findings (list markup, marked content, font embedding, empty pages, role mapping, tab order, language spans, paragraph count, PDF/UA identifier, artifact tagging, ActualText & expansion text)                                   |
| `qpdfParser.test.ts`  |    68 | QPDF JSON parsing: StructTreeRoot/Lang/Outlines/AcroForm detection, heading tags (H1–H6 + generic /H), table analysis (TH/scope/rows/nesting/caption/columns/headers), list analysis (LI/Lbl/LBody), MarkInfo, RoleMap, tab order, font embedding, paragraph/language spans, figure alt text, MCID content ordering, outline counting, tree depth, PDF/UA identifier, artifact tagging, ActualText & expansion text, malformed JSON |
| `auth.test.ts`        |    25 | JWT middleware (missing/invalid/expired/wrong-algorithm tokens), admin middleware (role checking, case sensitivity), email domain validation (illinois.gov, subdomains, rejection of non-gov domains, ALLOWED_DOMAINS dev override)                                                                                                                                                                                                 |
| `mailer.test.ts`      |     6 | Email config validation: production exits without credentials, development warns but continues, provider info logging                                                                                                                                                                                                                                                                                                               |
| `integration.test.ts` |    28 | End-to-end PDF analysis: accessible/inaccessible fixture scoring, category completeness, grade/severity validation, comparative scoring between documents                                                                                                                                                                                                                                                                           |

### Web Tests (238 tests)

| File                       | Tests | What it covers                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility.test.ts`    |    38 | WCAG 2.1 color contrast verification for dark and light modes (4.5:1 ratio for all text/bg combinations), regression guards against low-contrast classes (text-neutral-500/600), semantic HTML landmarks (main, header, footer, nav), link accessibility (rel attributes, underlines), component-level a11y (keyboard-accessible controls, caveat text, click targets) |
| `color-mode.test.ts`       |    51 | Light mode WCAG 2.1 contrast (all text/bg combos), dark mode contrast validation, CSS variable definitions in both `:root` and `html.light`, color mode toggle presence, no hardcoded dark-only colors in templates, branding configuration checks                                                                                                                     |
| `ai-analysis.test.ts`      |    12 | AI analysis export/prompt generation, Practical/Strict profile labeling, and remediation-focused output                                                                                                                                                                                                                                                                |
| `components.test.ts`       |    36 | DropZone (drag/drop, multi-file PDF validation, file size limits, batch staging), ScoreCard (grade display, profile toggle, recommendation copy, color coding for all 5 grades, score/filename/summary), CategoryRow (score bars, severity badges, expand/collapse findings, N/A display), ProcessingOverlay (spinner, stage messages)                                 |
| `login.test.ts`            |    13 | Two-step OTP flow (email → code), API call verification, error handling, back navigation                                                                                                                                                                                                                                                                               |
| `responsive.test.ts`       |    50 | Shared-report and main-page responsive layout behavior, including mode-aware score displays and mobile export behavior                                                                                                                                                                                                                                                 |
| `scoring-display.test.ts`  |    29 | Grade color mapping (A–F), N/A category rendering, severity badge colors (Pass/Minor/Moderate/Critical), and mode-aware display messaging                                                                                                                                                                                                                              |
| `scoring-profiles.test.ts` |     9 | Strict vs Practical profile selection utilities, full per-profile category override (so PDF/UA-specific findings surface in Practical mode), and fallback behavior                                                                                                                                                                                                     |

### Accessibility Compliance (WCAG 2.1 AA)

The web interface itself meets **WCAG 2.1 Level AA** standards. Both the main audit page and shared report pages score **95+** on Lighthouse accessibility audits.

**What's enforced:**

| Requirement                 | Implementation                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Color contrast**          | All text meets 4.5:1 minimum ratio in both dark and light modes. CSS custom properties ensure correct contrast for every theme. `text-neutral-500` and `text-neutral-600` are banned. |
| **Semantic landmarks**      | `<header>`, `<nav>`, `<main>`, `<footer>` in the default layout; `<main>` on standalone report pages.                                                                                 |
| **Link distinguishability** | External links use `underline` or blue-400 color (7.5:1+ contrast). All include `rel="noopener noreferrer"`.                                                                          |
| **Keyboard accessibility**  | All interactive elements are native `<button>` or `<a>` elements — no div-based click handlers.                                                                                       |
| **Click targets**           | Expand/collapse buttons span full width (WCAG 2.5.8).                                                                                                                                 |
| **Heading order**           | Valid heading hierarchy (h1 → h2 → h3) on all pages.                                                                                                                                  |

The `accessibility.test.ts` (38 tests) and `color-mode.test.ts` (51 tests) suites guard against regressions:

- **Contrast math** — verifies WCAG luminance ratios for every text color + background combination used in the UI
- **Source scanning** — reads `.vue` template sections and fails if `text-neutral-500` or `text-neutral-600` appear
- **Landmark verification** — confirms `<main>`, `<header>`, `<footer>`, `<nav>` exist in layouts and pages
- **Component-level checks** — keyboard-accessible controls, caveat text, link attributes, no low-opacity text

**Manual audits:** Full browser-based accessibility audits (axe-core, Lighthouse) are not part of the automated test suite. Run these manually against a running dev or production build using the [axe DevTools extension](https://www.deque.com/axe/devtools/) or Chrome DevTools Lighthouse panel.

## Deployment

**Target:** DigitalOcean droplet (2 vCPU / 4GB RAM, ~$24/mo) → Laravel Forge → PM2 → nginx

See [docs/04-deployment-guide.md](docs/04-deployment-guide.md) for full instructions (server setup, nginx config, firewall, SSL). Short version:

```bash
pnpm install --frozen-lockfile
pnpm build                                    # Type-check API + build Nuxt
pm2 restart ecosystem.config.cjs --update-env  # PM2 sets PORT and NODE_ENV
```

For local production testing (without PM2):

```bash
pnpm build && pnpm start:all    # Clears ports, starts API :5103 + Web :5102
```

## Security

- **Auth is optional** — all other security protections apply regardless of the auth toggle
- Files processed in memory (QPDF temp file deleted immediately)
- `execFileSync` (no shell) for QPDF invocation
- Rate limiting on all endpoints
- Helmet + nginx security headers
- CORS locked to same origin in production
- See **docs/00-master-design.md, Section 9** for the full security model

### Batch upload security

Batch processing adds **no new server-side attack surface**. Each file in a batch is an independent HTTP request to the existing `/api/analyze` endpoint, subject to all existing protections:

| Threat                         | Mitigation                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bypassing the 5-file limit** | The limit is UX (frontend). The real gate is the server rate limiter (35/hour per IP). A malicious client sending more requests just hits the rate limit faster. |
| **Memory exhaustion**          | Server semaphore caps concurrent analyses at 2 regardless of how many requests arrive. Max server memory: 2 × 15 MB = 30 MB (unchanged from single-file mode).   |
| **Filename XSS**               | Filenames render via Vue `{{ }}` text interpolation (auto-escaped). No `v-html` used anywhere. Server also sanitizes filenames before storage.                   |
| **Race conditions**            | JavaScript is single-threaded; the batch worker's `nextIndex++` cannot race. Server semaphore uses a FIFO queue.                                                 |
| **Auth bypass during batch**   | Each request carries the JWT cookie. A 401 on any request immediately navigates to login and abandons remaining items.                                           |
| **Concurrent upload flood**    | Frontend limits to 2 concurrent requests. Even if bypassed, server semaphore queues extras. Rate limiter applies per-IP.                                         |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full list of changes by version, or view [releases on GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

## License

MIT License. Copyright (c) 2026 Christopher Schweda. See [LICENSE](LICENSE) for details.

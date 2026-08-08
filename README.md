# ICJIA File Accessibility Audit

[![Version](https://img.shields.io/badge/version-1.57.0-blue)](https://github.com/ICJIA/file-accessibility-audit/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) ![Tests](https://img.shields.io/badge/tests-2027%20passing-brightgreen) ![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white) ![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Audits: WCAG 2.2 AA](https://img.shields.io/badge/audits-WCAG%202.2%20AA-blueviolet)

![ICJIA File Accessibility Audit](apps/web/public/og-image.png)

**Production URL:** https://audit.icjia.app | **Source:** https://github.com/ICJIA/file-accessibility-audit

A web tool that **audits** PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) accessibility — and **(optionally) auto-remediates** PDFs — against [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/) (a strict superset of [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/), the legal minimum under [IITAA 2.1 §E205.4](https://doit.illinois.gov/initiatives/accessibility.html) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/)), and [Illinois IITAA 2.1](https://doit.illinois.gov/initiatives/accessibility.html) — all on infrastructure you control, with no AI and no per-document fees. To revert to WCAG 2.1 labels: set `WCAG_VERSION=2.1` and redeploy (API reverts on restart; web UI on rebuild).

## What it does

| | Feature | Detail |
|---|---------|--------|
| **9** | WCAG categories audited | Each document (PDF, Word, PowerPoint, or Excel) scored across the WCAG-aligned categories that apply to its format (up to 9) — a weighted 0–100 score (A–F grade) plus a separate, binary pass/fail **WCAG 2.2 conformance verdict**. |
| **F → A** | Auto-remediation (optional) | Tag untagged PDFs in seconds: qpdf → [OpenDataLoader](https://github.com/opendataloader-project/opendataloader-pdf) → [veraPDF](https://verapdf.org/). Output is rejected if it regresses the score. Manual review still recommended for IITAA compliance. |
| **PDF/UA-1** | Standards aligned | WCAG 2.2 AA (superset of 2.1 AA), ADA Title II (April 2026), Illinois IITAA 2.1, PDF/UA-1 via veraPDF. Full lifecycle audit trail with `fs.stat`-verified deletion events for compliance reporting. |
| **0** | Files retained | Audit: in-memory only, gone in seconds. Remediation: output deleted on first download or 30-minute TTL, then verified absent. |
| **$0** | No AI, no third-party APIs | Every step runs on your own server. No data sent to vision models, hosted AI services, or commercial PDF/Office SDKs. |
| **100%** | Open source | Apache 2.0 / MIT / MPL toolchain. No per-document fees, no SDK licensing. Designed for state agencies that need control over their pipeline. |
| **3** | Files per batch | Upload up to 3 files (PDF, Word, PowerPoint, or Excel) at once; per-tab remediation for PDFs. `POST /api/analyze-url` for programmatic auditing of public documents. |
| **4** | Export formats | Text / HTML / Markdown / JSON report exports. 1-year shareable links (no login required to view). |

Auto-remediation is **disabled by default** — set `REMEDIATION_ENABLED=true` in your environment to enable. Architectural details in [docs/archive/pdf-remediation-integration-plan.md](docs/archive/pdf-remediation-integration-plan.md); the Phase 1 follow-on (interactive alt-text walkthrough) is specced in [docs/archive/pdf-remediation-alt-text-walkthrough-spec.md](docs/archive/pdf-remediation-alt-text-walkthrough-spec.md).

The intended workflow is: **upload → review findings → either auto-remediate or fix at the source (Word, InDesign, etc.) and re-export → re-upload to verify.** Manual review remains essential for full IITAA compliance regardless of which path is taken — the tool's job is to find issues and reduce the manual remediation surface, not replace human review.

## Contents

New here? The live tool is at **[audit.icjia.app](https://audit.icjia.app)**; this README is the technical companion. Jump to:

- **Overview** — [What it does](#what-it-does) · [Scoring rubric](#scoring-rubric)
- **Run it** — [Quick Start](#quick-start) · [Authentication](#authentication) · [Configuration](#configuration) · [Deployment](#deployment)
- **APIs & automation** — [Batch Upload](#batch-upload) · [Analyze from URL](#analyze-from-url) · [Fleet Document Auditing](#fleet-document-auditing) · [Bulk Inventory Scoring](#bulk-inventory-scoring) · [Personal Access Tokens](#personal-access-tokens-pats) · [CLI Tool](#cli-tool)
- **Reports & data** — [Report Exports](#report-exports) · [Document Metadata](#document-metadata) · [SEO](#seo) · [AI Readiness](#ai-readiness)
- **Project** — [Structure](#project-structure) · [Tech Stack](#tech-stack) · [Branding & White-Labeling](#branding-and-white-labeling) · [Design Documents](#design-documents) · [Tests](#tests)
- **Security & history** — [Security](#security) · [Changelog](#changelog) · [License](#license)

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

To start the dev server **with the auto-remediation feature enabled** (without having to remember the env vars each time), use the convenience wrapper:

```bash
./start-dev-server.sh
```

It auto-detects your Java install (brew openjdk on macOS, apt openjdk on Ubuntu), looks for an optional veraPDF install, and exports `REMEDIATION_ENABLED=true` before running `pnpm dev`. Safe to re-run; no sudo required.

- **Frontend:** http://localhost:5102
- **API:** http://localhost:5103

That's it — the app works immediately with authentication disabled (the default). No email provider or credentials needed.

### Utility Scripts

```bash
pnpm clean      # Remove .nuxt, .output, Vite cache, and build artifacts
pnpm test       # Run all tests with summary
pnpm lint       # ESLint across the repo
pnpm typecheck  # Type-check API + Nuxt (vue-tsc via `nuxt typecheck`)
pnpm dev        # Start API + Web dev servers
pnpm build      # Type-check API + packages/analyzer, build Nuxt frontend
pnpm start:all  # Start both production servers (kills stale ports, API :5103, Web :5102)
pnpm rebrand    # Regenerate static files after changing BRANDING in audit.config.ts
```

## Authentication

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
| Mailgun (default) | [docs/archive/07-mailgun-integration.md](docs/archive/07-mailgun-integration.md) |
| SMTP2GO           | [docs/archive/06-smtp2go-integration.md](docs/archive/06-smtp2go-integration.md) |

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

Each document is assessed across named accessibility categories based on [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) (a strict superset of [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. A category that doesn't apply (tables in a document with no tables) counts as **passing**; one the tool could not evaluate is excluded from the denominator. See [How a category that doesn't apply is counted](#how-a-category-that-doesnt-apply-is-counted).

### One score, and a separate conformance verdict

Every audit produces **two distinct things**, and the distinction is deliberate:

**A 0–100 score (A–F grade).** A weighted, partial-credit *prioritised-readiness* metric across nine WCAG-aligned categories — it shows how close a document is and what to fix first. The score is anchored to **WCAG 2.2 Level AA** (a strict superset of WCAG 2.1 AA, the legal minimum under **Illinois IITAA 2.1 §E205.4** and **ADA Title II**). Automated checks and score weights are unchanged from WCAG 2.1; the new 2.2 criteria are interactive/manual and are shown separately as "not assessed — manual review".

**A WCAG 2.2 conformance verdict.** A separate, binary pass/fail. WCAG conformance is all-or-nothing per success criterion — one image without alt text fails 1.1.1 (Level A) outright — so a weighted score with partial credit *cannot* be a conformance claim. A document can score 90+ and still fail WCAG. The verdict reports confirmed, machine-checkable failures, each linked to its W3C "Understanding" page; when it finds none it says exactly that — **not** "conformant", because color contrast and the *correctness* of alt text, headings, reading order, and tags require manual review. When an analyzer cannot process a file (encrypted or damaged), the verdict honestly reports that no verdict could be determined rather than guessing.

#### The score is capped by the worst finding (v1.58.0, corrected in v1.58.2)

**A document's score may never outrank its worst unresolved finding.** The letter is then derived from that score through the one published scale (90 = A, 80 = B, 70 = C, 60 = D, below that F), exactly as it always was — so the number and the letter can never disagree:

| Worst finding | Score ceiling | Best possible grade |
| --- | :--: | :--: |
| none | 100 | **A** |
| Minor | 89 | **B** |
| Moderate | 79 | **C** |
| Critical | 69 | **D** |

The ceilings are *derived* from `GRADE_THRESHOLDS` (`maxScoreForGrade`), so moving a band boundary moves the caps with it and the two cannot drift.

Renormalizing away N/A categories has two consequences that made the tool contradict itself in front of the people it exists to help — both confirmed against a 31-document corpus:

1. **A single failure dominates a sparse document and is diluted in a rich one.** Two Word files with the *identical* defect — no document title, language present, so Title & Language scored 50/Moderate in both — graded **B (87)** and **C (71)**, because the first had 7 of 10 applicable categories to average against and the second only 3. Same fault, different letter, no way for a reader to tell why.
2. **Four perfect categories outvoted one catastrophic one.** Two PDFs missing *both* title and language (0/Critical, two WCAG failures each) graded **B** — better than the Word file above, which had strictly the milder defect. Corpus-wide, 4 documents held an **A** while carrying an unresolved Moderate and 2 held a **B** while carrying a Critical.

An averaged score cannot express "one thing here is disqualifying", but accessibility conformance is pass/fail per criterion, not a mean. The cap restores that, and gives the letters a rule that fits in one sentence for the agency staff deciding whether to publish: **A = nothing found · B = only minor items · C = a real problem to fix · D/F = do not publish.** It also makes the grade and the publication verdict structurally incapable of disagreeing, which was the reported symptom — a reader ranking documents by letter got the opposite of the truth.

#### How a report is presented

Every report opens in the **Visual view**: the grade, then a numbered action plan that walks through one fix at a time in plain language, with instructions for both the source document and Adobe Acrobat. The **Detailed view** holds the complete technical report — every finding, the WCAG criteria it maps to, the evidence, PDF/UA signals, methodology.

The chooser sits above every report and the choice is **not remembered between reports**. It used to persist per device, which meant anyone who opened the Detailed view once got it for every report afterwards — and since the action plan exists only in the Visual view, the plan appeared to have been deleted (reported exactly that way). The cost of being wrong here is asymmetric: showing the stepper to someone who wanted detail costs one click; hiding it from someone who needed it costs them the guidance.

Both views end with **"Still worth checking by hand"**, on every report at every score, including a perfect one. These checks confirm accessibility structure is *present*; almost none can judge whether it is *correct* — alt text reading "image" passes, a heading describing the wrong section passes. Each check a document passed contributes the one judgment the tool could not make, and the WCAG criteria the tool does not evaluate at all are listed by name with links.

**Printer-friendly action steps** opens the plan in a new tab as a self-contained page — every fix expanded, both routes shown, human checks included, nothing loaded from the network — to print or save as PDF and work from beside the document. The same button appears on the auto-remediation result, printing what the automatic fixes could *not* repair.

**One publish verdict, everywhere.** The audit report and the remediation result both call `publicationVerdict`. They used to differ (`publicationVerdict` vs `grade === "A"`), and on a file graded B with only Minor findings the two said "ready to publish" and "Not ready to publish yet" about the same PDF. Readiness now **fails closed** when the audit cannot be read, rather than reporting a file publishable because it could not be assessed.

#### How a category that doesn't apply is counted

A category that **doesn't apply** counts as **passing** and stays in the denominator. A document with no tables does not have a table-markup problem — it has no tables. A category the tool **could not evaluate** (`notAssessed`, e.g. "contrast could not be resolved in this version") is excluded from the denominator instead: scoring it as a pass would be an unverified claim.

Through v1.58.2 both were dropped and the remaining weights renormalized, which **penalized simple documents**. Reported on two Word files, both missing a document title and nothing else in common: a one-page public notice scored **71** and a longer meeting agenda **79** — the notice *worse*, despite having strictly **fewer** findings. Only 3 of the notice's 10 categories could be checked at all, so its single fault was **58% of its whole score**, while the agenda's were spread across 7 checks and diluted to 20%. Both now score **79 / C**.

Two cases must not be flattered by this, and both are pinned by test:

- **Scanned documents still score 0.** Their categories come back null because there is no extractable content to check — the opposite of "nothing wrong". Without the `isScanned` guard in `aggregateScore` the scanned fixture scored **55**.
- **Unevaluable categories stay out.** See above.

Corpus impact: 2 of 31 grades moved (both F → D, on documents where fewer than half the checks applied). Both still carry Critical findings and stay capped at 69.

**Why the score and not the letter.** v1.58.0 capped the *letter* instead. That fixed both problems above and broke something more basic: it severed the letter from the number, so a report headline read `D` above `80/100`. Reported twice, in those words — *"80 and above is a B. Not a C, and certainly not a D."* On the published scale the report was simply wrong on its face, and no amount of relabelling the number fixed it (v1.58.1 tried, and a reader immediately read "81 of 100" as a percentage grade too). Any figure out of 100 beside a letter grade is read **as** the grade. Capping the score instead keeps one consistent scale and one derivation. `scorer.test.ts`'s **THE INVARIANT** test walks real scoring paths asserting `grade === gradeForScore(overallScore)` for the document *and* both score profiles — it fails on a re-introduction of the v1.58.0 bug (verified by sabotage: "score 92: expected 'C' to be 'A'"), which nothing in the suite caught the first time.

The cap **only ever lowers** a score, never raises one, so a poor average keeps its own worse number. Rule and helpers live in `packages/shared/src/scoring.ts` (`SEVERITY_GRADE_CAPS`, `maxScoreForGrade`, `capScoreBySeverity`, `scoreCapReason`) so the analyzer, web, API, and CLI share one definition.

**What the report shows.** Score and letter sit together as a matched pair again, and the "Fix progress" panel beneath them carries a plain **count** — "5 of 6 checks passed" — rather than a second figure out of 100, which would be one more thing to mistake for the grade. When the score is sitting at its ceiling the panel says which finding is holding it there ("The one check that didn't pass is critical, which holds the score at 69 — a critical issue caps a document at D until it is fixed"), because a reader watching a number stall needs to know one finding is responsible, not that the checks stopped improving. Both report views render this identically.

**Already-shared report links self-correct.** Stored reports carry every input the calculation needs (per-category `score`, `weight`, `notAssessed`, plus `isScanned`), so the API re-derives the score from them under current rules when *serving* a stored audit — recomputing, applying the ceiling, and re-deriving the letter, — shared reports and both remediation audits — rather than migrating the database. Stored rows stay byte-identical (they are an agency's evidence of what was computed on the day; deriving the display value beats rewriting the record), and a link shared before the change no longer disagrees with the same document re-audited today. The stored executive summary is *regenerated* rather than string-patched, because it branches on the grade — swapping the letter inside stale prose would leave the sentence arguing against its own grade.

> Cite the **score** for tracking remediation progress; cite the **conformance verdict** for the pass/fail compliance question. Neither replaces review by a human accessibility specialist — pair the audit with PAC 2024 and an Adobe Acrobat Accessibility Full Check for a definitive determination.

> **Note —** prior to v1.21.0 the tool surfaced a second "Practical" (PDF/UA-flavoured) score profile alongside Strict. It was retired because auditors found two profiles confusing; PDF/UA-1 conformance is now verified authoritatively by [veraPDF](https://verapdf.org/) on every PDF audit (the PDF/UA verdict panel, since v1.37.0) and again on the remediation result page. The score described here is the single canonical score.

### Categories & Weights

Nine categories, weighted by WCAG conformance level and user impact. A category that doesn't apply (no tables, no forms) counts as passing; one that could not be evaluated is excluded. Each category is mapped to the exact WCAG success criteria it evaluates — all carried forward unchanged from WCAG 2.1 into 2.2.

| Category | Weight | WCAG 2.1/2.2 SC | Why it matters |
| --- | :--: | --- | --- |
| Text Extractability | 20% | 1.1.1, 1.3.1 (A) | The most fundamental requirement — a scanned image with no real text gives a screen reader nothing to read. Non-embedded fonts cap this category at 85. |
| Title & Language | 15% | 2.4.2, 3.1.1 (A) | The document title is the first thing a screen reader announces; the language tag controls pronunciation. |
| Heading Structure | 15% | 1.3.1 (A), 2.4.6 (AA) | Headings (H1–H6) are how screen reader users navigate and skim. |
| Alt Text on Images | 15% | 1.1.1 (A) | Every informative image needs a text alternative. |
| Table Markup | 10% | 1.3.1 (A) | Without header cells (TH), screen readers read table data as a flat, context-free stream. |
| Reading Order | 10% | 1.3.2 (A) | The tag tree must define a logical reading sequence — out-of-order content makes a document unusable, so this Level-A category is weighted accordingly. |
| Bookmarks | 5% | 2.4.5 (AA) | For documents over 10 pages, bookmarks provide a navigable table of contents — one of several "ways" to navigate (a clear heading structure is a partial alternative), so it is weighted below the Level-A categories. |
| Link Quality | 5% | 2.4.4 (A) | Raw URLs and vague phrases ("click here", "read more") are meaningless read aloud. |
| Form Accessibility | 5% | 1.3.1, 3.3.2, 4.1.2 (A) | Unlabeled form fields are unusable with assistive technology. |
| Color Contrast | not scored | 1.4.3 (AA) | Rendered-PDF contrast analysis is not yet implemented, so this row applies to PDF only — surfaced as **"Not assessed"** — never as a pass — so a PDF report never implies contrast was checked. Word, PowerPoint, and Excel documents store explicit colors, so contrast *is* computed and scored directly for those formats. |
| **Total** | **100%** | | |

The published category → success-criteria map also appears on the in-app Technical Details page.

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

| Severity | Score | Meaning |
| --- | :--: | --- |
| No issues found | 100 | The automated checks for this category found nothing. Reserved for a perfect 100 — a category scoring 90–99 still has at least one finding. |
| Minor | 70–99 | Small improvements recommended. |
| Moderate | 40–69 | Should be addressed before publishing. |
| Critical | 0–39 | A significant barrier to access — must be fixed. |

### Reference Standards

- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [What's New in WCAG 2.2 (W3C)](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [ADA Title II Final Rule (2024)](https://www.ada.gov/resources/title-ii-rule/)
- [Illinois IITAA 2.1 Standards](https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html)
- [Section 508 Standards](https://www.section508.gov/manage/laws-and-policies/)
- [PDF/UA (ISO 14289-1)](https://pdfa.org/resource/pdfua-in-a-nutshell/)

Scoring aligns with WCAG 2.2 Level AA success criteria — a superset of the WCAG 2.1 AA that ADA Title II and the Illinois IITAA 2.1 standard require (WCAG 2.1 AA is the legal minimum; WCAG 2.2 is stricter and optional/forward-looking). ADA Title II digital accessibility requirements take effect April 2026. All scoring constants live in `audit.config.ts`. To revert the displayed standard to 2.1, set `WCAG_VERSION=2.1` and redeploy (API reverts on restart; the web UI reverts on rebuild).

## Batch Upload

Upload up to **3 files** (PDF, Word, PowerPoint, or Excel) at once. Files are analyzed in parallel (2 at a time) and results are displayed in a tab bar — click any tab to see its full report, export, or share.

### How it works

- **Drop or select multiple files** — the drop zone accepts multiple PDF, Word, PowerPoint, or Excel files. Files are staged with a preview list before analysis begins.
- **Frontend-only orchestration** — no new API endpoints, no server-side queue. The browser calls the existing `/api/analyze` endpoint once per file with a client-side concurrency limit of 2 (matching the server's `MAX_CONCURRENT_ANALYSES`).
- **Per-file progress** — a progress view shows each file's status (queued, processing, done, error) with grade badges as they complete.
- **Tab-based results** — after processing, a horizontal tab bar lets you switch between reports. Export and share work on the active tab's result.
- **Single file unchanged** — dropping a single file works exactly as before (no tab bar, no staging step).

### Limits

| Constraint          | Value            | Enforced by                           |
| ------------------- | ---------------- | ------------------------------------- |
| Max files per batch | 3                | Frontend (`DropZone.vue`)             |
| Max file size       | 15 MB each       | Frontend + multer + nginx             |
| Concurrent uploads  | 2                | Frontend semaphore + server semaphore |
| Rate limit          | 500/hour per IP (5000/hour with a privileged token) | Server (`analyzeLimiter`) |

**Note:** `BATCH.MAX_FILES` in `audit.config.ts` is the canonical constant (currently 3). The frontend DropZone also enforces this limit client-side.

## Analyze from URL

`POST /api/analyze-url` — audits a document (PDF, Word, PowerPoint, or Excel) by URL instead of upload. Two surfaces:

1. **API** — `POST /api/analyze-url` with body `{ "url": "..." }` returns the same `AnalysisResult` shape as `POST /api/analyze`.
2. **Web UI** — visiting `https://audit.icjia.app/?prefill=<url>` auto-fetches the file on page load and displays the result in the existing analysis UI.

This is the server-side complement to the "Audit Link" column that [filecap-cli](https://github.com/ICJIA/filecap-cli) generates in its HTML/CSV reports. Each report row produces a link like `https://audit.icjia.app/?prefill=https%3A%2F%2Fexample.com%2Freport.pdf`; clicking it now runs the audit automatically.

### Using the API

```bash
curl -X POST https://audit.icjia.app/api/analyze-url \
  -H "Authorization: Bearer fap_yourtoken" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://icjia.illinois.gov/documents/2024/annual-report.pdf"}'
```

Auth required — send the session cookie or a Bearer PAT (same as `/api/analyze`).

### URL allowlist

Only ICJIA-affiliated and Illinois state government URLs are accepted by default. Each entry matches the host exactly **or** any subdomain of it.

| Allowed host | Coverage |
| --- | --- |
| `illinois.gov` | every Illinois state agency subdomain (e.g., `icjia.illinois.gov`, `idph.illinois.gov`, `doit.illinois.gov`) |
| `icjia.cloud` | `*.icjia.cloud` (ICJIA-owned services) |
| `icjia.app` | `*.icjia.app` (production `audit.icjia.app` and siblings) |
| `icjia-api.cloud` | `*.icjia-api.cloud` (`agency`, `dvfr`, `i2i`, `vpp`, `infonet`, etc.) |
| `ilheals.com` | `*.ilheals.com` (program partner) |

Look-alike domains are rejected — `illinois.gov.evil.com` does *not* match `illinois.gov` (no dot before the allowed host) and `fakeillinois.gov` does not match either (no subdomain separator).

Operators can extend the list without a code change via the `ANALYZE_URL_ALLOWED_HOSTS` environment variable (comma-separated hostnames).

A request carrying a valid `API_PRIVILEGED_TOKEN` (`Authorization: Bearer <token>`) **bypasses the allowlist entirely** and may audit any _public_ URL — the private/reserved-IP SSRF block (below) still applies to it. See [§ Security](#security).

### SSRF protection

Even if a hostname passes the allowlist, the endpoint hard-rejects:

- `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`
- `*.local`, `*.internal`
- RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-local (`169.254.0.0/16`)

### Limits

| Constraint | Value | Note |
| --- | --- | --- |
| Max file size | 15 MB | Fetched content (matches the direct-upload cap as of v1.27.0) |
| Fetch timeout | 30 s | Same as bulk-from-inventory |
| Rate limit | shared with `/api/analyze` (`analyzeLimiter`) | |

## Fleet Document Auditing

`POST /api/audit-url` — combined "audit a document by URL **and** persist a shareable report" endpoint — designed for fleet-audit automation that emits one row per document (PDF, Word, PowerPoint, or Excel) into an HTML/CSV inventory and needs both the scores and a stable link to the full report.

The difference from `/api/analyze-url`:

| Endpoint | Returns | Persisted? | Best for |
| --- | --- | --- | --- |
| `POST /api/analyze-url` | full `AnalysisResult` (every category + finding) | no | one-off browser auditing, deep programmatic inspection |
| `POST /api/audit-url` | trimmed scalar payload + `reportUrl` | yes (365 days) | fleet inventory enrichment — CSV cells + click-through links |
| `POST /api/bulk-from-inventory` | per-file scores in a manifest | yes | when you already have a filecap NDJSON inventory |

### Request

```bash
curl -X POST https://audit.icjia.app/api/audit-url \
  -H "Authorization: Bearer fap_yourtoken" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://icjia.illinois.gov/documents/2024/annual-report.pdf"}'
```

Pass `"force": true` (body field) or `?force=true` (query) to bypass the hash dedup and force a fresh audit even if an unexpired cached report exists for the same content.

### Response (`200 OK`)

Every top-level field is a scalar or a `{ score, grade }` pair — ready to flatten into CSV without nested parsing.

```json
{
  "filename":        "annual-report.pdf",
  "pageCount":       42,
  "audited":         "2026-05-18T15:32:11.000Z",
  "strict":    { "score": 67, "grade": "D" },
  "practical": { "score": 78, "grade": "C" },
  "reportId":        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "reportUrl":       "https://audit.icjia.app/report/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "reportExpiresAt": "2027-05-18T15:32:11.000Z",
  "cached":          false
}
```

`cached: true` indicates a hash-dedup hit — same file content was previously audited by the same caller, the existing `reportUrl` is being returned, and no new audit ran. `false` indicates a fresh audit + persist.

### Hash dedup (Policy A)

After fetching the file the server computes `sha256(bytes)` and looks for an unexpired `shared_reports` row matching the same hash for the same caller. On a hit, the cached `reportId` / `reportUrl` are returned and no new audit runs — your quarterly fleet runs will return the same URL for unchanged files (clean CSV diffs).

When the file content has changed (different hash) a fresh audit runs and produces a new `reportId`. The previous report stays accessible at its URL until its 365-day TTL elapses.

### Flatten to CSV with `jq`

```bash
curl -sS https://audit.icjia.app/api/audit-url \
  -H "Authorization: Bearer fap_yourtoken" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://icjia.illinois.gov/documents/2024/annual-report.pdf"}' \
  | jq -r '[.filename, .pageCount, .strict.score, .strict.grade, .practical.score, .practical.grade, .reportUrl, .reportExpiresAt] | @csv'
```

Header row to put at the top of your inventory CSV:

```csv
url,filename,pageCount,strictScore,strictGrade,practicalScore,practicalGrade,reportUrl,reportExpiresAt
```

### Limits

Same as `/api/analyze-url` (15 MB file cap, 30-second fetch timeout, `analyzeLimiter` rate limit). Same SSRF allowlist applies — extend via `ANALYZE_URL_ALLOWED_HOSTS` env var when adding sites to the fleet inventory.

## Bulk Inventory Scoring

`POST /api/bulk-from-inventory` — accepts a [filecap](https://github.com/ICJIA/filecap-cli) NDJSON inventory and scores every file in it server-side in one request. The server fetches each file by its public URL, runs the existing `analyzeDocument` pipeline (PDF, Word, PowerPoint, or Excel — dispatched by detected content type), saves a shareable report, and returns a manifest with per-file scores, grades, and report links.

**Auth required.** Send the session cookie or an `Authorization` header as you would for `/api/analyze`.

### How it works

1. Generate an inventory with filecap: `filecap scan ... --public-url-base https://yoursite.com/uploads -o inventory.ndjson`
2. POST the inventory:

```bash
# Option A — raw NDJSON (Content-Type: text/plain, max 5 MB)
curl -X POST \
  -H "Cookie: token=<your-jwt>" \
  -H "Content-Type: text/plain" \
  --data-binary @inventory.ndjson \
  https://audit.icjia.app/api/bulk-from-inventory \
  > scores.json

# Option B — JSON body
curl -X POST \
  -H "Cookie: token=<your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "inventory": "<NDJSON string>" }' \
  https://audit.icjia.app/api/bulk-from-inventory \
  > scores.json
```

3. The response is a `{ summary, results }` manifest where each entry maps a file path to its score, grade, and a `/api/reports/:id` link.

### Limits

| Constraint              | Value    | Note                                                     |
| ----------------------- | -------- | -------------------------------------------------------- |
| Max inventory size      | 5 MB     | Total NDJSON payload                                     |
| Max files per request   | 100      | Additional entries beyond 100 are silently skipped       |
| Max file size           | 15 MB    | Per-file limit, matches `ANALYSIS.MAX_FILE_SIZE_MB`      |
| Fetch timeout           | 30 s     | Per file; timed-out entries are recorded as errors        |
| Rate limit              | shared with `/api/reports` (10/hour per user)            |

### Considerations

- **Serial processing.** Files are scored one at a time to respect the 2-at-a-time semaphore in `pdfAnalyzer.ts` (shared across all four formats). Large inventories (50+ files) can take several minutes inside a single HTTP request.
- **Auth model.** The endpoint accepts both the session cookie and a personal access token (`Authorization: Bearer fap_xxx`). See [Personal Access Tokens](#personal-access-tokens-pats) below for how to create a token for CLI use.
- **No URL allowlist.** The server will fetch any URL in the inventory. A per-deployment allowlist of permitted hostnames is recommended before exposing this endpoint publicly.

## Personal Access Tokens (PATs)

Personal access tokens let CLI tools and automation scripts authenticate against the API without an interactive browser session. They are intended for headless workflows such as the [@icjia/filecap](https://github.com/ICJIA/filecap-cli) `audit-enrich` command.

### Creating a token

Tokens can only be created from a browser session (cookie auth). Use `curl` with your session cookie, or use the **Settings → Tokens** tab once a UI is added.

```bash
# Create a token named "filecap-cli"
curl -X POST \
  -H "Cookie: token=<your-session-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "filecap-cli" }' \
  https://audit.icjia.app/api/tokens
```

Response:

```json
{
  "id": "a1b2c3d4e5f6a7b8",
  "name": "filecap-cli",
  "token": "fap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "createdAt": "2026-05-09T00:00:00.000Z",
  "note": "Save this token now. You will not be able to see it again."
}
```

**The raw token is shown only once.** Copy it immediately — the server stores only a SHA-256 hash and cannot return the original.

### Using a token

Pass the token in the `Authorization` header on any protected endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer fap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" \
  -H "Content-Type: text/plain" \
  --data-binary @inventory.ndjson \
  https://audit.icjia.app/api/bulk-from-inventory
```

Or set the environment variable used by filecap-cli:

```bash
export FILECAP_AUDIT_TOKEN="fap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
filecap audit-enrich inventory.ndjson
```

### Listing and revoking tokens

```bash
# List all tokens for your account (metadata only — raw tokens are never returned)
curl -H "Cookie: token=<your-session-jwt>" https://audit.icjia.app/api/tokens

# Revoke a token by ID
curl -X DELETE \
  -H "Cookie: token=<your-session-jwt>" \
  https://audit.icjia.app/api/tokens/<token-id>
```

### Token format and security

| Property         | Detail                                                         |
| ---------------- | -------------------------------------------------------------- |
| Format           | `fap_` prefix + 32 lowercase hex chars (128-bit entropy)       |
| Storage          | SHA-256 hash only — the raw token never persists server-side   |
| One-time display | Shown once at creation; cannot be retrieved later              |
| Revocation       | Immediate; revoked tokens are retained in the DB for audit     |
| Mint/revoke via PAT | Not allowed — only browser sessions can manage tokens (prevents a leaked token from self-replicating) |
| Per-user limit   | 10 active tokens maximum                                        |
| Audit trail      | `last_used_at` updated on each authenticated request           |

## Report Views

Since v1.54.0 every report — the live result and shared report pages alike — renders in one of two views, switched by a **Visual / Detailed** toggle in the report's upper right. The preference persists per device (localStorage; never sent to the server).

- **Visual view (default)** — an infographic-style layout written for non-technical document authors: an oversized grade circle with the score and a plain-English verdict that leads with the blocker when there is one ("Not ready to publish — 2 critical issues") and otherwise pairs the grade word with the outlook ("Excellent — ready to publish"), color-coded severity count tiles, a one-line WCAG 2.2 AA verdict strip, and a numbered **action plan** ordered by severity. One step is open at a time; each carries big severity-colored step numbers, a plain-language "why it matters," fix routes for the source document (Word / PowerPoint / Excel) and — for PDFs — an Acrobat route that prefers the report's own document-specific steps, and WCAG criterion chips linking into the evidence. "Where the score comes from" bars carry the score table's full data (score, grade, severity per category, not-scored reasons), and a single **Full technical report** expander holds the WCAG criteria detail, executive summary, audit-scope caveat, detailed findings with evidence, PDF/UA checks, methodology, and document metadata.
- **Detailed view** — the classic report, byte-identical to v1.53.0: score card with the conformance panel, issues summary, PDF/UA panels, methodology, and the full category detail.

Data parity between the views is a tested invariant: every fact visible in one view is visible in the other (possibly behind the technical expander). URL page audits stored in the same table render the grade hero only — the guards that prevent a category-less report from showing a false "nothing to fix" card are pinned by tests on all three surfaces (view, hero, HTML export).

![The Visual report view for an 18-page PDF that scored 62/100, grade D. A large glowing orange circle dominates the page with the letter D inside it, above the score "62/100" and the publication verdict (captured before v1.56.0, when the verdict read "Poor — not ready to publish"; it now leads with the blocker: "Not ready to publish — 2 critical issues"). Below are three severity tiles — 2 Critical in red, 0 Moderate muted, 3 Minor in blue — then a red strip reading "Does not meet WCAG 2.2 Level AA · 3 criteria failing — details below". The action plan begins beneath: "5 fixes, in order. № 1–2 block publication — start there, then re-upload to verify", with step 1 "Give the document a title and set its language" open, showing a green "Easiest — fix the source document" route and the start of an Acrobat route.](docs/images/report-visual-view-1.png)

![Continuation of the same Visual report: collapsed action-plan steps 2 through 5, each with a large solid severity-colored numbered circle — red for the Critical "Describe images with alt text", blue for the Minor steps — and a severity chip plus "Show how" affordance. Below, the "Where the score comes from" section lists every scored category with a grade-colored horizontal bar, numeric score, grade letter badge, and severity chip, followed by "Not scored" explanations for Color Contrast and Form Accessibility and the collapsed "Full technical report" expander.](docs/images/report-visual-view-2.png)

## Report Exports

Reports can be downloaded in four formats, all with links back to [audit.icjia.app](https://audit.icjia.app):

| Format             | Contents                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Text (.txt)**    | Plain-text report with score, conformance verdict, category scores, and detailed findings — opens in any editor, no dependencies |
| **HTML (.html)**   | Standalone dark-themed page mirroring the Visual view — severity tiles, verdict phrase, and the ordered action plan up top, every classic section retained, all accordion content forced visible — works offline, printable |
| **Markdown (.md)** | Plain-text report with tables and findings — works in any text editor or docs platform         |
| **JSON (.json)**   | Machine-readable v2.0 schema with WCAG mappings, remediation plan, and LLM context (see below) |

Reports can also be shared via **shareable links** that expire after 1 year. In Detailed view, shared report pages also include:

- **Export buttons** — download the report as Text, HTML, Markdown, or JSON directly from the shared link
- **CTA to audit tool** — "Audit Your Document" button linking back to the live tool
- **Methodology card** — "How Scores Are Derived" section with links to QPDF and PDF.js (Mozilla) docs, WCAG 2.2 and ADA Title II references, and a link to the full scoring rubric
- **Per-category WCAG references** — every scored category card shows a dedicated "WCAG 2.2 References" panel listing the exact success criteria the score is tied to (id, name, Level A/AA), with each row linking to the official W3C Understanding document so reviewers can verify the grade against the standard
- **Severity highlighting** — critical issue counts in red, moderate in yellow within the executive summary
- **Caveat notice** — for PDFs, a recommendation to verify with Adobe Acrobat and make the source document accessible before export; for Word, PowerPoint, and Excel files, a pointer to run the file's own built-in Microsoft Accessibility Checker directly on the source document

When auth is disabled, shared reports display "Shared on [date]" without exposing usernames.

## Document Metadata

Every report includes a **Document Metadata** section that surfaces embedded document properties. This metadata is **informational only** — it is not scored or factored into the accessibility grade. Fields that are missing from the document display as "Not set," which itself is useful for identifying incomplete metadata. The fields shown depend on the file type being audited — `AnalysisResult` (`apps/api/src/services/pdfAnalyzer.ts`) carries a separate `pdfMetadata` / `docxMetadata` / `pptxMetadata` / `xlsxMetadata` object per format.

### PDF

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

> **Note —** the Word/PowerPoint/Excel metadata below is computed by the analyzer, included in every JSON export, **and rendered by the live report's Document Metadata panel** (`ReportContent.vue`) — the panel shows whichever of `pdfMetadata` / `docxMetadata` / `pptxMetadata` / `xlsxMetadata` is present on the report, using each format's own field set below.

### Word (.docx)

| Field      | Source      | What it tells you                                                                                                       |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Title      | `title`     | Document title from Word's core properties                                                                              |
| Creator    | `creator`   | The document's author/creator metadata                                                                                  |
| Language   | `language`  | Resolved default document language (paragraph styles' `docDefaults`, else `dc:language`) — controls screen-reader pronunciation |
| Page Count | `pageCount` | Total pages, from Word's stored page-count property when present                                                        |
| Word Count | `wordCount` | Total word count from document statistics                                                                               |

### PowerPoint (.pptx)

| Field       | Source       | What it tells you                                                             |
| ----------- | ------------ | -------------------------------------------------------------------------------- |
| Title       | `title`      | Presentation title from core properties                                       |
| Creator     | `creator`    | The presentation's author/creator metadata                                    |
| Language    | `language`   | Default run language from the presentation part, else the first slide master  |
| Slide Count | `slideCount` | Total number of slides                                                        |

### Excel (.xlsx)

| Field       | Source       | What it tells you                      |
| ----------- | ------------ | ------------------------------------------ |
| Title       | `title`      | Workbook title from core properties     |
| Creator     | `creator`    | The workbook's author/creator metadata  |
| Sheet Count | `sheetCount` | Total number of worksheets              |

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

The monorepo includes `a11y-audit`, a command-line PDF, Word, PowerPoint, and Excel accessibility analyzer that depends directly on `@file-audit/analyzer` — the same audit engine package the API consumes — so CLI and web results come from identical scoring logic.

### Single-file audit

The CLI runs directly via `tsx` — there is no build step or `dist/` output (the old `tsup` bundle was removed; `apps/cli` depends on `@file-audit/analyzer` for the actual analysis engine).

```bash
cd apps/cli

# Analyze a PDF
pnpm exec tsx src/index.ts report.pdf

# Word, PowerPoint, and Excel work the same way
pnpm exec tsx src/index.ts slides.pptx

# JSON output (pipe to jq, etc.)
pnpm exec tsx src/index.ts report.pdf --json

# CI gate — exit 1 if any file scores below 80
pnpm exec tsx src/index.ts docs/*.pdf --threshold 80
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
2. Filters to supported document types (PDF, Word, PowerPoint, Excel), skips already-cached results
3. Downloads and audits each file with configurable concurrency
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
│   │   └── src/        # Routes, services, middleware, database (imports the audit engine from @file-audit/analyzer via thin re-export shims, so internal apps/api import paths are unchanged)
│   └── cli/            # a11y-audit CLI tool (runs via tsx — no build step)
│       └── src/        # Subcommand router, commands/, lib/ (cache, csv, html, graphql) — depends on @file-audit/analyzer directly, not on apps/api by relative path
├── packages/
│   ├── analyzer/       # @file-audit/analyzer — the audit engine (PDF/DOCX/PPTX/XLSX analyzers, qpdf integration, OOXML worker, scoring), extracted from apps/api; consumed by apps/api and apps/cli
│   └── shared/         # @file-audit/shared — scoring constants + report types shared by web/api/cli
├── scripts/
│   ├── test.ts         # `pnpm test` — runs api/web/cli suites in parallel with one summary
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
| CLI          | Runs via tsx (no build step) — depends on `@file-audit/analyzer` for QPDF + pdfjs-dist |
| Tooling      | ESLint + Prettier + editorconfig / GitHub Actions CI (lint → typecheck → build → test) |
| Deployment   | DigitalOcean → Laravel Forge → PM2 → nginx                                         |

## Configuration

All magic numbers, thresholds, weights, limits, and email provider settings are in **`audit.config.ts`** at the project root. This is the single source of truth — the API imports it directly, and the docs reference it.

- **Auth toggle** → `AUTH.REQUIRE_LOGIN` (`true` or `false`)
- **Scoring profiles & weights** → `SCORING_PROFILES` (`SCORING_WEIGHTS` remains the strict-profile alias)
- **Email provider** → `EMAIL.PROVIDER` (`'mailgun'` or `'smtp2go'`)
- **Share link expiry** → `SHARED_REPORTS.EXPIRY_DAYS` (default: 365)
- **Rate limits** → `RATE_LIMITS`
- **Dev/prod URLs** → automatic based on `NODE_ENV`

Secrets (`JWT_SECRET`, `SMTP_PASS`) stay in `.env` — never in config.

## Branding and White-Labeling

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

The app's current behavior is defined by the code and [`audit.config.ts`](audit.config.ts). The most recent design write-up is the accuracy doc below (in `docs/`); the earlier design, deployment, integration, and roadmap documents have been moved to [`docs/archive/`](docs/archive/) for reference.

| Doc                                                                        | Description                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [00 — Master Design](docs/archive/00-master-design.md) | Architecture, scoring model, API, auth, security — original design reference |
| [01 — Phase 1: Core Grader](docs/archive/01-phase-1-core-grader.md) | Core grader deliverables and testing checklist |
| [04 — Deployment Guide](docs/archive/04-deployment-guide.md) | Infrastructure, env vars, nginx, firewall |
| [06 — SMTP2GO Integration](docs/archive/06-smtp2go-integration.md) | Email provider setup (alternative provider) |
| [07 — Mailgun Integration](docs/archive/07-mailgun-integration.md) | Mailgun setup (default provider) |
| [09 — Forge Deployment Cheatsheet](docs/archive/09-forge-deployment-cheatsheet.md) | Step-by-step Laravel Forge deploy: nginx proxies, PM2, deploy script |
| [10 — Scoring Reconciliation](docs/archive/10-scoring-reconciliation.md) | Strict vs Practical scoring, PDF/UA rationale, WCAG/ADA interpretation, Matterhorn note |
| [Fleet Inventory Reporting](docs/archive/fleet-inventory-reporting.md) | The `/api/audit-url` fleet endpoint: profile scores, report URLs, hash dedup |
| [PDF Remediation Integration Plan](docs/archive/pdf-remediation-integration-plan.md) | Auto-remediation architecture, privacy, threat model, audit trail |
| [PDF Remediation — Alt-Text Walkthrough Spec](docs/archive/pdf-remediation-alt-text-walkthrough-spec.md) | Spec for the in-progress interactive alt-text walkthrough |
| [Table & Heading Accuracy Fixes](docs/table-and-heading-accuracy-fixes.md) | v1.24.1 diagnosis & fixes: table over-count, scope-based table scoring, heading order |

All but the accuracy doc now live in [`docs/archive/`](docs/archive/) — see its [README](docs/archive/README.md) for what each document is and whether it's superseded or still-accurate reference.

## Tests

**2,215 tests** across 135 test files (API 1194, Web 972, CLI 49). Run all three suites with one summary:

```bash
pnpm test                 # API + Web + CLI, with a unified summary
pnpm test:api             # API tests only
pnpm test:web             # Web tests only
pnpm test:scoring         # Scoring model tests only
cd apps/cli && pnpm test  # CLI tests only, standalone
```

`pnpm test` (`scripts/test.ts`) runs all three workspaces — `apps/api`, `apps/web`, and `apps/cli` — in parallel and prints one combined summary once every suite completes:

```
════════════════════════════════════════════════════════════
  TEST SUMMARY
════════════════════════════════════════════════════════════
  ✔ API      1185 passed (60 files)
  ✔ Web      679 passed (49 files)
  ✔ CLI      49 passed (6 files)
────────────────────────────────────────────────────────────
  ✔ 2215 tests passed across 135 files
════════════════════════════════════════════════════════════
```

### API Tests (1194 tests)

| File | Tests | What it covers |
| --- | ---: | --- |
| `severityGradeCap.test.ts` | 26 | The rule that a document's **score** may never outrank its worst unresolved finding, and that the letter is then derived from that score through the one published scale. Leads with **THE INVARIANT** — an exhaustive sweep over all 101 scores × 4 severities asserting `gradeForScore(capped)` matches 90/80/70/60 — because v1.58.0 capped the letter independently and shipped "D" above "80/100"; this makes that unshippable. Then each rung's ceiling (Critical 69, Moderate 79, Minor 89), that those ceilings are *derived* from `GRADE_THRESHOLDS` rather than hardcoded, that the cap **only lowers**, that the worst severity wins, that a never-assessed category cannot cap anything ("no images were found" is not a finding), idempotency, and pass-through on a null score or a non-array. `scoreCapReason` works from the **already-capped** score — all any consumer has — reporting the ceiling when the score sits at it. Plus `regradeStoredReport`: the stored score lowered *and* the letter re-derived from it, each profile capped against its **own** categories, the summary regenerated rather than patched (a stale one would reintroduce the "D above 80/100" mismatch verbatim), idempotency, and — because this runs on public share links — no throw on a malformed, truncated or ancient row. Closes with the four real documents that caused the change, now permanent fixtures in `controls/` |
| `scorer.test.ts` | 155 | All scoring categories, grade/severity thresholds, N/A handling, weight renormalization, executive-summary generation, the WCAG conformance gate, table header-association credit via `/Scope` or `/Headers`, table caption credited as a non-blocking note, filename-like titles earning partial credit without a false 2.4.2 failure, help-link accuracy (version-matched W3C Understanding URLs, no broken WebAIM anchors), and supplementary findings (list markup, marked content, font embedding, empty pages, role mapping, tab order, language spans, paragraph count, PDF/UA identifier, artifact tagging, ActualText & expansion text, the Acrobat fix guide) |
| `qpdfParser.test.ts` | 120 | QPDF JSON parsing: StructTreeRoot/Lang/Outlines/AcroForm detection, heading tags (H1-H6 + generic /H) collected in document/reading order, table analysis (TH/scope/rows/nesting/caption/columns/headers) with nested tables excluded from the top-level count and ColSpan/RowSpan-aware column consistency, list analysis (LI/Lbl/LBody — LBody required, Lbl advisory), multi-widget form fields (radio groups collapse to one field with /TU from the parent), MarkInfo, RoleMap, tab order, font embedding, paragraph/language spans, figure alt text, orphaned-phantom pruning (container tags — `<Figure>`, `<L>`, `<Table>` — that carry `/S` but have no `/P` parent and are named by no `/K` are excluded when a StructTreeRoot exists, but never pruned in a treeless document), MCID content ordering, outline counting, tree depth, PDF/UA identifier, artifact tagging, ActualText & expansion text, malformed JSON, qpdf exit-code-3 recovery (warnings with valid stdout JSON), and real qpdf-v2 `obj:`-key fixtures |
| `veraPdfBuffer.test.ts` | 3 | The audit-time veraPDF wrapper `runVeraPdfOnBuffer`: returns `available:false` without writing a temp file when `VERAPDF_PATH` is unset; otherwise writes a short-lived temp PDF, runs veraPDF against that path with the 30 s audit timeout, and unlinks it in `finally` (including when veraPDF rejects); never throws |
| `analyzeVeraPdf.test.ts` | 3 | The `/analyze` route attaching `pdfUaVerdict`: attached for a PDF when veraPDF is available, omitted when unavailable (`available:false`), and veraPDF not invoked for a non-PDF upload |
| `bulk-from-inventory.test.ts` | 41 | Bulk inventory scoring across all four formats: input validation, NDJSON parsing, `filterCategory` generalized beyond pdf-only (docx/pptx/xlsx), per-file content-type detection (real format sniffing, not the old blanket %PDF- gate), per-file `*_DISABLED`/`*_PARSE_FAILED`/timeout error-code mapping, and result-structure assertions (one bad entry never aborts the batch) |
| `analyze-url.test.ts` | 38 | Analyze-from-URL: SSRF prevention (private/local-address blocking), scheme validation, allowlist enforcement (against the real `services/urlPolicy.ts` exports, no longer a re-implemented copy), and route-level input/PDF validation and fetch-error handling |
| `xlsxService.test.ts` | 44 | Excel `.xlsx` parsing: workbook/sheet metadata, used-range and merged-cell counts, defined tables, picture/chart alt text and hyperlinks, cell-style contrast (large-text threshold, theme-indexed colors unresolved, empty cells excluded), and DoS hardening — a real-cell-count `MAX_CELLS` cap (not the spoofable dimension ref), pre-counted drawing/hyperlink/table caps that reject before any read fan-out, a cumulative auxiliary-part byte budget that catches large object-sparse drawing parts fast, and aggregate zip-package limits (entry-count and total-uncompressed-size caps, even when no single part exceeds `XLSX.MAX_UNCOMPRESSED_BYTES`) |
| `pdfjsTitle.test.ts` | 33 | The filename-like-title classifier: flags real filename/tool-generated titles ("report_v3_final.pdf", "Microsoft Word - …", "scan_20240115") while preserving legitimate one-word titles ("Introduction", "Budget2024", "COVID-19", "Section-508") that the old heuristic erased, plus real-pdfjs wiring tests proving the /Info title is preserved with only the advisory flag set |
| `auth.test.ts` | 32 | JWT middleware (missing/invalid/expired/wrong-algorithm tokens), admin middleware (role checking, case sensitivity), email-domain validation, and server-side JWT revocation (a token with a revoked `jti` is rejected even with a valid signature/exp, a legacy no-`jti` token is unaffected, `/verify` issues a JWT carrying a `jti`, and `/logout` writes the session's `jti` to the denylist while a legacy session's logout is a no-op) |
| `ooxml.test.ts` | 34 | The shared OOXML core (`ooxml.ts`) used by the DOCX/PPTX/XLSX checkers: namespace-agnostic XML walking (`parseXml`/`rootElement`/`textOf`/`attrOf`/`childrenOf`/`rawText`), relationship-map parsing, core-property text extraction, drawing alt-text resolution (descr → title → decorative-at-any-depth), shared contrast math (`normalizeHex`/`contrastRatio` against known WCAG reference values), the manual-bullet regex, `readCapped`'s per-part byte cap, theme scheme-color resolution (`resolveSchemeColor`/`buildSchemeColorMap`), DOCTYPE rejection with entity-expansion hardening (a part carrying `<!DOCTYPE` is parsed as empty rather than handed to the XML parser, case-insensitively, while the five built-in XML entities still decode in ordinary text), and `assertZipWithinLimits` (the aggregate entry-count and total-uncompressed-size gate shared by every OOXML format, including exact-boundary and error-message cases) |
| `integration.test.ts` | 31 | End-to-end PDF analysis: accessible/inaccessible fixture scoring, category completeness, grade/severity validation, comparative scoring, and malformed-PDF handling |
| `docxService.test.ts` | 57 | Word `.docx` parsing: title/creator/language/page-count metadata (with `dc:language` core.xml fallback), heading extraction in document order with fake-heading (bold/large/styleless paragraph) detection, image alt text and decorative flags, table header/dimension/nesting detection, link resolution via relationships, real-vs-manual-bullet list detection, run-level color contrast, format validation, `readCapped` zip-bomb resource limits, aggregate zip-package limits (entry-count and total-uncompressed-size caps even when no single part exceeds `DOCX.MAX_UNCOMPRESSED_BYTES`), and DOCTYPE/entity hardening (a DOCTYPE-bearing `document.xml` is neutralized rather than parsed, while `&amp;`/`&lt;`/`&gt;` in real heading and alt text still decode end-to-end) |
| `audit-url.test.ts` | 29 | Fleet `audit-url` endpoint: profile-score extraction (strict/remediation, with pre-scoreProfiles fallback), report-URL building, SHA-256 Policy-A hash dedup, response shape, filename derivation (`remote.<type>` fallback, not hardcoded `.pdf`), the unsupported-type 422 gate, per-format error-code→HTTP-status mapping (`*_DISABLED`→415, `*_PARSE_FAILED`→422, timeout/killed→504, and a generic 500 that never echoes `err.message`), and `sanitizeStoredReport` applied before the `shared_reports` insert |
| `pptxService.test.ts` | 42 | PowerPoint `.pptx` parsing: package/slide metadata, title-first-shape detection, picture/table/hyperlink/list/media extraction, run-level contrast (shape fill → slide background → theme scheme colors, large-text threshold), and DoS hardening — shape and text-element caps that count at any nesting depth (not just top-level, not just shape count), a linear frame/pic walk that avoids double-counting nested graphicFrames, theme-color resolution bounded per analysis rather than per run, and aggregate zip-package limits (entry-count and total-uncompressed-size caps, even when no single part exceeds `PPTX.MAX_UNCOMPRESSED_BYTES`) |
| `tokens.test.ts` | 27 | Personal access tokens: token generation, name sanitization, the PAT branch of the auth middleware, and the create/list/revoke `/api/tokens` endpoints |
| `safeFetch.test.ts` | 25 | SSRF private-IP classifier: IPv4 reserved ranges, IPv6 loopback/link-local/ULA, and the bracketed / IPv4-mapped IPv6 forms that previously failed open (`[::1]`, `[::ffff:127.0.0.1]`, hex-mapped) |
| `urlPolicy.test.ts` | 22 | The extracted URL/SSRF policy module: allowlist + subdomain matching, lookalike-suffix rejection, private/local-host blocking, `ANALYZE_URL_ALLOWED_HOSTS` env extension, the privileged public-URL validator, and `SafeFetchError`→HTTP status mapping |
| `rateLimiter.test.ts` | 22 | The privileged bearer-token tier — constant-time `isPrivilegedRequest` (missing/wrong/empty/prefix/over-length tokens, feature-off when unset), tier selection (strict per-IP vs generous shared bucket), a live limiter test proving a token exceeds the anonymous cap on the same IP — plus both global-limiter carve-outs: `isRemediationStatusRequest` and `isStatusRequest` route matching (including lookalikes like `/api/statuses` and `POST /api/status`), `isGlobalLimitExempt` exempting exactly those two and nothing else, `tieredLimiter`/`globalLimiter` skip semantics that exempt them without draining the shared bucket, and `remediationStatusLimiter`'s own generous per-IP cap |
| `status.test.ts` | 46 | The public `/api/status` payload, built against a real `:memory:` database provisioned by the actual migration runner (so the SQL meets production's real column types — `audit_log.created_at` is a UTC datetime *string* while `remediation_jobs.created_at` is an INTEGER ms epoch). Covers the document-event-type split (page audits and auth events excluded), extension-derived format buckets including `unknown_extension` for extension-less URL filenames, the 24h/30d windows, `last_audit_at` emitted as zone-marked ISO so it can't be parsed as local time, tiered failure semantics (qpdf/database → outage; veraPDF/Chromium → degraded), a corrupt database degrading to `database:"down"` rather than throwing, probe failures becoming data (`{ok:false, reason}`) instead of exceptions, a hung probe timing out under fake timers, and the two independent cache TTLs asserted by **probe invocation count** — the property that stops an uptime monitor spawning a veraPDF JVM on every poll. Also the letter-grade distribution: the A–F split, a NULL grade counted as `ungraded` rather than dropped, an unrecognized value bucketed there too without injecting a key onto the struct, a lower-case grade normalized into its letter, per-window filtering, zeroed buckets on the database-down path, and — the headline guarantee — **every window's buckets summing to that window's document total**, so the page can never print two figures that disagree. Plus refused uploads: the rejection event type asserted disjoint from the audited and page types, refusals counted without moving the audit total or the grade split, the extension buckets (`.csv`/`.tsv` sharing one, `.docx`/`.xlsx`/`.pptx` never falling into the legacy ones — a regression to an unanchored `LIKE` would reclassify every modern file), buckets summing to the refusal total, per-window filtering, zeroed shape on the database-down path, and the invariant that a refusal **cannot satisfy the remediation audit-gate** because its `content_hash` is NULL |
| `statusPrivacy.test.ts` | 7 | Privacy guard for the public, unauthenticated status document. Seeds `audit_log` and `remediation_jobs` with a distinctive filename, email, IP, user-agent, and content hash, then asserts the counts prove the row was read while none of those values — nor any `@`, nor any `/opt`-`/usr`-`/home`-`/Users`-style path — appears anywhere in the serialized JSON. Also pins probe failures to the closed reason enum (a thrown error carrying `/opt/verapdf/verapdf` must not reach the payload), engine versions to bare numbers rather than raw tool output, and the top-level key set to an allow-list so a new field can't be added by accident |
| `reportSanitize.test.ts` | 17 | `sanitizeStoredReport`, the store-boundary guard applied before every report insert: strips unsafe (`javascript:`/`data:`) help-link and conformance-finding URL schemes — including nested under `scoreProfiles.*.categories` — while preserving the finding text, rejects malformed (non-array `categories`, non-object) reports without mutating the caller's object, and tolerates malformed `conformance` shapes (string, null, missing `url`) without throwing |
| `migrations.test.ts` | 15 | The numbered SQLite migration runner (`PRAGMA user_version`-keyed): a fresh database lands at the latest version with the full schema and re-opening is a no-op; the version-selection algorithm applies exactly the `N+1..latest` migrations to a snapshotted database and bumps `user_version` after each one individually (not just at the end, so a crash mid-migration can resume); and the legacy fast-forward path — the core correctness requirement — lands an already-provisioned pre-migration-runner database at the latest version without re-running any `ALTER`, preserves its data, still runs later migrations after the fast-forward, and targets a FIXED baseline constant rather than the migration list's current length |
| `ooxmlWorker.test.ts` | 14 | The interruptible OOXML child-process worker (DOCX/PPTX/XLSX now analyze off the main event loop): results and `ParseError` codes survive the IPC round-trip, a timeout SIGKILLs the child rather than abandoning it and frees its concurrency slot, the promise only settles once the child's OS-confirmed `exit` fires (with a grace-timer fallback so it never hangs forever), and the spawn environment excludes API secrets while the child still boots and analyzes correctly |
| `uploadMiddleware.test.ts` | 20 | The multer upload filter: accepts PDF/Word/PowerPoint/Excel by MIME type or extension (case-insensitive, extension wins over a wrong mimetype), rejects unsupported files with a 400 (not the framework's default 500) whose message lists every currently-accepted format, and `acceptedFormatsMessage`'s one/two/many-way label joins (Oxford comma when all four formats are enabled) as formats are flag-disabled. Plus the recognized-but-unauditable formats: a `.doc`/`.xls`/`.ppt`/`.rtf` upload is told which modern format to produce and how, a `.csv` gets copy that never says "Save As" (converting a CSV to `.xlsx` to score better is bad advice), both still carry the 400, an unrelated type still falls back to the accepted-formats list, and none of the four modern formats is hijacked |
| `auditLogSanitize.test.ts` | 7 | The storage-hygiene guard for `audit_log`'s attacker-controlled text columns, added as the regression test for red/blue finding **R1**: markup stripped from a stored filename, an over-long name capped at `FILENAME.MAX_LENGTH` (the empirical repro was 4,040 characters), newlines removed so a filename cannot forge a second log line (**R2**, which this test is what found), a traversal attempt reduced to its basename, never an empty string, an ordinary filename left byte-identical, and idempotence — `routes/analyze.ts` sanitises before calling `recordRejectedUpload`, which sanitises again, and that must be a no-op rather than progressive mangling |
| `detectLegacyFormat.test.ts` | 15 | Content-based recognition of the file types the tool can name but not audit, so a **renamed** file (a `.doc` saved as `.docx` sails past the extension filter) is not told to check whether it is a `.zip`. Covers each OLE2 directory stream — `WordDocument`, `Workbook` (BIFF8), `Book` (BIFF5), `PowerPoint Document` — the `ole-unknown` fallback for the rest of the family (`.msg`, `.vsd`), and RTF, which is text rather than an OLE2 binary. Also the bounds that keep it cheap and safe: the scan stops after 8 KB (a name past the bound degrades to `ole-unknown`, the intended trade) while one just inside is still found, the signature must sit at offset 0 so a PDF embedding those bytes stays a PDF, and empty/truncated buffers return null rather than throwing. Fixtures are synthesized in-test — the detector reads only the 8-byte signature and a UTF-16LE name, so committing real Office binaries would assert nothing extra |
| `remediateAuthz.test.ts` | 12 | Remediation job status/receipt authorization in anonymous mode (C5): a request without the job's download token gets a 404 (not a leak-revealing 401/403), the correct token gets 200, the wrong token gets the same 404 shape as missing, an unknown job id 404s regardless of token, and the pre-existing logged-in-owner path is unchanged (an owner match succeeds with no token at all; a different logged-in user still gets 403, not 404) |
| `analyzer.test.ts` | 11 | The top-level `detectFileType`/`analyzeDocument` dispatcher: content-based format detection (PDF header, real Word/PowerPoint/Excel ZIP parts — never confused with each other or rejected as null for a non-document buffer) and routing to the correct pipeline, including that a `.docx` result omits PDF-only signals, an unsupported type is rejected cleanly, and a zip exceeding the aggregate `OOXML.MAX_ZIP_ENTRIES` cap is treated as unsupported/undetectable rather than crashing the dispatcher |
| `docxConformance.test.ts` | 13 | The Word WCAG 2.2 conformance gate: a clean document passes; confirmed failures fire for 1.1.1 (non-decorative image missing alt text, not decorative ones), 2.4.2 (no title), 3.1.1 (no declared language), 1.3.1 (a data table with no header row, but not a single-row layout-like table), and 1.4.3 (confirmed low-contrast text); 1.3.2 is always not-assessed and 1.4.3 is not-assessed only when no runs were checkable |
| `pageAuditor.test.ts` | 10 | `slimIssue`, the axe-core finding slimmer for page audits: maps id/impact/description/helpUrl/tags, caps returned nodes at 25 while `nodeCount` still reflects the true uncapped count, and tolerates missing/empty nodes, tags, or targets without throwing |
| `remediationJobs.test.ts` | 9 | Remediation job store: single-use download tokens stored hash-only and verified constant-time (tampered/cross-job tokens rejected), status transitions (pending→running→stepped→complete/failed/expired), audit-JSON round-trip, and per-user active-job counting |
| `remediationLifecycle.test.ts` | 9 | Remediation lifecycle log + cleanup sweep against a real temp SQLite DB: append-only event ordering, path-hash privacy (no raw paths in the compliance log), delete-and-verify semantics (idempotent on already-absent files), TTL expiry deleting outputs and flipping status, stuck-job failure, sweep idempotency, and opportunistic purging of expired JWT-revocation (`revoked_jtis`) rows during the same sweep |
| `docxScorer.test.ts` | 13 | `scoreDocx`: a clean document grades A with no failures, Text Extractability is an automatic pass (Word text is always extractable), Reading Order and Form Accessibility are marked not-assessed and excluded from the weighted average, the DOCX-specific `list_structure` category carries its own WCAG map, PDF-only signals (`pdfUa`, `adobeParity`) are omitted, and the executive summary uses Word-appropriate wording |
| `pageAuditGuard.test.ts` | 8 | The headless-browser SSRF interceptor's decision logic: data:/blob:/about: allowed, non-http(s) blocked, document navigations allowlist-gated (open-redirect targets rejected), subresources IP-checked but not allowlist-gated, and the private-IP check still forced when a privileged token bypasses the allowlist |
| `adobeParity.test.ts` | 7 | The Adobe Acrobat parity report builder - the 32-rule mapping is still computed and persisted for backward compatibility, though no longer surfaced in the UI |
| `audit-url-page.test.ts` | 6 | The Chromium page-audit route's error handling: a busy-semaphore 503 keeps its existing safe message, timeout and non-timeout `auditPage` failures map to 504/502 without ever echoing the raw `err.message`, a post-audit failure (e.g. the `shared_reports` insert) falls through to a generic detail-free 500, and `sanitizeStoredReport` runs on the result before that insert |
| `childSpawnEnv.test.ts` | 6 | `buildChildSpawnEnv`, the environment scrubber shared by every child-process spawn site: strips this app's known secret families plus any generic `*_SECRET`/`*_TOKEN`/`*_PASSWORD`/`*_KEY` name, preserves what the child needs to boot (including non-credential operational config like `DB_PATH` or an allowlist), never mutates the source object, and defaults to the real `process.env` |
| `conformance.test.ts` | 17 | WCAG conformance gate: version-flag switching between 2.1 and 2.2 criterion sets, form-field gating for 2.2-only criteria, and 1.3.2 Meaningful Sequence asserted only from the rigorous MCID order comparison (never from heuristic category scores) |
| `jtiDenylist.test.ts` | 6 | The `revoked_jtis` denylist store: `revokeJti`/`isJtiRevoked` round-trip, a revoked jti past its own recorded expiry no longer reports as revoked, re-revoking the same jti twice does not throw, and `purgeExpiredJtis` deletes only rows past expiry (leaving active ones) — including an opportunistic purge inside `revokeJti` itself |
| `mailer.test.ts` | 6 | Email config validation: production exits without credentials, development warns but continues, provider-info logging |
| `pptxScorer.test.ts` | 11 | PowerPoint scoring config and `scorePptx`: enabled by default with the spec's caps/weights, `slide_titles` registered in the WCAG category map and penalizing untitled or duplicate slide titles (naming the offending slide numbers), `reading_order` deducting for a title that isn't the first shape and advising on shape-heavy slides, and empty categories null-scored so they renormalize out of the weighted average |
| `xlsxScorer.test.ts` | 15 | Excel scoring config and `scoreXlsx`: enabled by default with the spec's caps/weights, `sheet_names` registered in the WCAG category map and penalizing only default-named *visible* sheets, `table_markup` deducting per issue (headerless table, a dataful sheet with no defined table, capped merge-cell penalty), and `title_language` scoring on title alone while explaining the language gap |
| `qpdfNormalize.test.ts` | 5 | Remediation normalize step: qpdf exit 3 (repaired recoverable damage, output written) counts as success, mirroring the audit's exit-3 recovery; hard failures still throw; a wall-clock timeout is passed to qpdf |
| `authConfig.test.ts` | 4 | Fail-closed startup check: the API refuses to boot when login is enabled with a missing or dev-default `JWT_SECRET` |
| `veraPdf.test.ts` | 4 | veraPDF JSON verdict extraction: rule identifiers built from clause + test number (never the "FAILED" status string), per-rule counts, and the authoritative failed-checks total |
| `pdfuaXmp.test.ts` | 3 | PDF/UA identifier detection from XMP through real pdfjs parsing — element form and RDF attribute form (`pdfuaid:part="1"`), which pdfjs's own parser misses |
| `pptxConformance.test.ts` | 3 | The PowerPoint WCAG 2.2 conformance gate: clean for a well-formed deck, fires 1.1.1/2.4.2/3.1.1/1.3.1/1.4.3 only on confirmed violations, and does not fire for untitled slides (a scoring-only deduction) or media (listed not-assessed) |
| `qpdfSpawnEnv.test.ts` | 3 | The qpdf subprocess spawn environment: both the sync (`execFileSync`) and async (`execFile`) qpdf call sites omit a planted secret (and other secret families like `JWT_SECRET`/`SMTP_PASS`) while keeping `PATH` |
| `xlsxConformance.test.ts` | 4 | The Excel WCAG 2.2 conformance gate: clean for a well-formed workbook (3.1.1 honestly not-assessed — Excel has no language property), fires 1.1.1/2.4.2/1.3.1/1.4.3 only on confirmed violations, and does not fire for merged cells or table-less data sheets (advisory-only deductions, not conformance failures) |
| `docxIntegration.test.ts` | 2 | End-to-end Word `.docx` analysis: a well-structured accessible document scores highly with no failures, and a poorly-authored one fails and cites the correct WCAG criteria |
| `pdfAnalyzerTimeout.test.ts` | 2 | The in-process pdfjs parse timeout abandons a pathological document and frees its concurrency slot |
| `pptxIntegration.test.ts` | 2 | End-to-end PowerPoint `.pptx` analysis: an accessible deck scores ≥ 90 with a clean conformance gate, and a hostile deck scores ≤ 35 citing the correct WCAG criteria |
| `xlsxIntegration.test.ts` | 2 | End-to-end Excel `.xlsx` analysis: an accessible workbook scores ≥ 90 with a clean conformance gate, and a hostile workbook scores ≤ 35 citing 1.1.1/2.4.2/1.3.1/1.4.3 |
| `remediate-spawn-env.test.ts` | 1 | The remediation worker's spawn environment excludes API secrets (`JWT_SECRET`/`API_PRIVILEGED_TOKEN`/`SMTP_PASS`) while preserving what the Java-based worker needs to run (`PATH`/`HOME`/`JAVA_HOME`/`NODE_ENV`) |

### Web Tests (972 tests)

| File | Tests | What it covers |
| --- | ---: | --- |
| `color-mode.test.ts` | 51 | Light-mode WCAG 2.1 contrast (all text/background combinations), dark-mode contrast validation, CSS variable definitions in both `:root` and `html.light`, color-mode toggle, no hardcoded dark-only colors in templates, branding-configuration checks |
| `colorTokens.test.ts` | 30 | The grade and severity palette, measured against the surfaces it is actually painted on. The dark colours run 5.3–10.3:1; the SAME colours on the light theme measured 1.9–3.8:1 — every one below the 4.5:1 WCAG AA floor, in a tool that exists to catch that. Both palettes are now asserted against all three surfaces of their own theme, which is what caught yellow-700 passing on white and the body surface but landing at 4.47:1 on `#f3f4f6`. Also pins that the two tables stay parallel (a grade in one and missing from the other would silently fall back to the dark hex), that `main.css` mirrors both for stylesheet use, and that the helpers return a plain hex rather than `var()`/`color-mix()` — load-bearing, because the test DOM drops inline styles containing either, which would blind every colour assertion in the suite. Closes with a deliberately non-vacuous check that the OLD single palette really did fail, so the file cannot quietly start passing if thresholds or surfaces drift. Plus `withAlpha`, which replaced 13 hand-written hex-alpha suffixes across 8 files |
| `serverStatusIndicator.test.ts` | 16 | The header's status light as a link with an accessible per-system tooltip. Pins the two traps: a plain `<a href="/status?html">`, never `NuxtLink` (a Nitro server route client-side-navigates into the SPA 404), and a real tooltip, never `title` (touch-invisible, screen-reader-silent). The accessibility contract each has a test: opens on keyboard focus not only hover, Escape dismisses in place and a fresh hover reopens (WCAG 1.4.13), `aria-describedby` wiring, the visible text as the link's name with no aria-label override (2.5.3), glyph **plus word** per system so state never rides on colour alone (1.4.1), `ok: null` rendered as "not yet checked" and never dressed up as up or down (including its glyph staying muted when the ✓/✕ marks gained their green/red — colour as a second channel beside the word, same measured tokens), and a dead API clearing the system list rather than asserting stale states. Then the contrast group, computed from `main.css` rather than asserted by eye: the tooltip's text tokens and the status text tokens must clear 4.5:1 on both the resting and the **hover** surface in both palettes — the hover surface is what caught green-700 at 4.46:1 and red-600 at 4.3:1 on light, and the raw `green-500`/`amber-500` this replaced measured ~2:1. Companion checks pin the component to the very tokens the arithmetic measures. Sabotage-verified: role removal, Escape un-wiring, surface-token swap, and a paled light token each fail |
| `securityAudits.test.ts` | 16 | § 10 of the data-retention page — the auditor-facing security history — after it went from 3,273 lines of hand-written markup (65 `<article>` blocks, ~46 lines and 8 duplicated class attributes each) to data plus one 161-line renderer. The migration was verified by rendering both versions and comparing the text of all 65 entries character for character; what remains here are the properties that must keep holding. The load-bearing group is the **safety argument for the renderer's `v-html`**: entries carry inline emphasis mid-sentence, so their text is markup and is rendered as markup, which is safe only because the strings are authored in this repository and compiled into the bundle. That is asserted rather than asserted-in-a-comment — only `<a>/<br>/<code>/<em>/<strong>` appear, no event handler, no `style`, no `src`, no `data:`/`javascript:` URI, no template interpolation, and every `href` is https or root-relative. Plus: every entry renders, every badge label has a colour (a typo would otherwise print a bare word mid-sentence), the notes render as markup rather than printing a literal `<strong>` (28 of them did, at first), the history stays newest-first and dated, and — the release-checklist gap that this found — **completeness**: every version in `CHANGELOG.md` at or above 1.18.0 appears in § 10 *and* in the README's Review history, with the "recorded after the fact" markers still in place. That started as a check on the shipping version alone (v1.63.1 had shipped without an entry), and was strengthened once the 27 § 10 and 29 README gaps behind it were backfilled — a per-release check cannot tell you the archive behind it is intact. Sabotage-verified by deleting a mid-history entry from each surface and by stripping the markers |
| `printablePlan.test.ts` | 22 | The printable action plan and its button. The load-bearing properties are that **both** fix routes survive into the printout — on screen they sit behind an accordion, on paper there is nothing to click and the reader may not be the person who chose the route — that document-derived strings are escaped (findings quote alt text, link labels and titles straight out of the uploaded file), and that the page is genuinely standalone: no scripts, no `<link href>`, no `src="http`, since it opens as a blob URL where a relative path resolves to nothing and a printout needing the network is useless on paper. Plus the page-break rules that keep a fix and its instructions together, the ink-friendly print styles, the human checks and unexamined criteria, the retitling the remediation page uses, and a source scan pinning the button onto **all four** surfaces that show a report — the same wiring gap that left the manual-review card missing from a whole view two releases earlier |
| `manualReview.test.ts` | 21 | The checklist a report shows an author when there is nothing left to fix. A 100 used to yield an empty action plan and a line of bare criterion numbers, leaving the obvious question unanswered. Pins that the list is built from the checks that **passed** (failing ones are already the action plan), that unscored categories contribute nothing, that the scorer's own order is preserved so the heaviest checks read first, and that malformed input on a public shared report cannot throw. Two guards carry the weight: a **completeness** check that every scoring category able to pass has a prompt — so one added to the profile later cannot silently vanish from an author's checklist — and a copy check that each prompt names a concrete action rather than restating the check it came from. Then the card itself: six entries for a perfect document, the specific judgment automation cannot make ("'image', 'logo' and a filename all pass this check"), "Nothing below is a failure" stated outright, the unexamined WCAG criteria listed by name with working links, and a different framing on a report that still has fixes so it never reads as claiming a pass |
| `gradeCapNote.test.ts` | 10 | What the report shows now that score and letter are a matched pair again, on **both** views. The pair renders together; the "Fix progress" panel carries a plain **count** ("1 of 2 checks passed") rather than a second figure out of 100, which is precisely how the v1.58.1 layout failed — a reader read "81 of 100" as a percentage grade; unassessed categories are excluded from that count; where the score sits at its ceiling the panel names the finding holding it there and the grade it caps to; and it stays silent when the score is below the ceiling or the document is clean. ScoreCard computes all of it from the **strict profile's own** categories, so it can never describe a document other than the one on screen |
| `backupsExplained.test.ts` | 13 | The answer to "why back up anything if nothing is stored?", pinned on **both** surfaces in one file — because the failure here is not a surface losing the explanation outright but the two drifting into different claims. On `/status`: the literal question is posed (not paraphrased), the ✓/✗ split names what a snapshot holds and what it cannot, the explanation survives all three backup states rather than only the healthy one, the collapsed peek says "records, not documents" so a reader who never expands it does not read "28.0 MB" as 28 MB of files, the policy link is same-origin with no script surface, the whole thing stays inside a collapsed `<details>` so the default page stays terse, and a payload with no `backup` field still renders nothing. On the retention page: § 7a exists, is anchored where `/status` links to it, is listed in the table of contents, draws both lanes to their own verdicts, and § 8 agrees. The load-bearing assertions are the **overclaim guards**: both surfaces must fail on "no personal data" / "no PII" / "anonymized", and must name the sign-in email, the IP/user-agent log, and the file name as uploaded — reassurance by omission is the regression, and sabotage confirmed each guard bites |
| `actionPlan.test.ts` | 25 | The Visual view's action-plan mapper: a plain-language dictionary entry (jargon-free title AND why) for all 13 category ids, Critical→Moderate→Minor ordering with stable ties, PDF two-route vs OOXML one-route fix instructions, preference for the report's own Acrobat steps over dictionary defaults, unknown-id and missing-fileType fallbacks, forged-report input guards, and the `verdictPhrase` publication clause |
| `reportSectionOrder.test.ts` | 16 | Report layout invariants per view, source-inspected: both pages carry the exact `VISUAL VIEW`/`DETAILED VIEW` markers (visual first), the Detailed slice preserves every pre-redesign blocking-before-informational ordering unchanged, ReportVisualView's own source pins hero → tiles → verdict → plan → bars → technical report, and TechnicalReport keeps findings above the PDF/UA panels above methodology |
| `components.test.ts` | 45 | DropZone (drag/drop, all four format validations — PDF/docx/pptx/xlsx MIME + extension, size cap, per-format enable/disable flags dropping both the accept attr and the copy), ScoreCard (grade display, recommendation copy, all five grade colors, source-app-aware conformance-fix wording, and href-stripping for `javascript:` conformance-finding URLs while keeping the finding text), ProcessingOverlay (stage messaging), and the unsupported-format copy reaching the banner — legacy Office by behaviour rather than exact phrasing (the wording is owned by `@file-audit/shared`), and CSV asserted to never say "Save As" |
| `responsive.test.ts` | 44 | Responsive layout across mobile navigation, layout padding, ScoreCard, ReportContent, the index/report/history pages, CSS transitions, and the scoring modal |
| `accessibility.test.ts` | 35 | WCAG 2.1 color-contrast verification for dark and light modes (4.5:1 minimum across all text/background combinations), regression guards against low-contrast classes, semantic HTML landmarks, link accessibility, and component-level a11y |
| `reportExportBanner.test.ts` | 20 | The exported report banners across all three export formats (Markdown/HTML/text): filename-first framing, format-aware labels (PowerPoint slides, Excel sheets, PDF pages), and stored-XSS hardening — `buildHtml`/`buildMarkdown` never emit a `javascript:` conformance-finding or help-link URL as a live link target (Markdown link or HTML `href`), while keeping the visible text |
| `report-content.test.ts` | 19 | The shared ReportContent component (score table, Document Metadata, Detailed Findings, Not Included in Scoring) rendered by both the live page and shared reports: grade/severity colors from the shared palette, score-table `scope="col"` headers and a visually-hidden `<caption>` (Task F6), N/A subsection + footnote gating, the aria-expanded export-snapshot contract, help-link href-stripping for `javascript:` URLs (stored XSS), a malformed-stored-report SSR crash guard (non-array `categories`/`findings`), and the Document Metadata panel rendering PDF/Word/PowerPoint/Excel metadata (discriminated by `fileType`, a real `0` count rendering as "0" rather than "Not set", and the panel disappearing when no metadata object is present) |
| `tableSemantics.test.ts` | 16 | Source-scans every page/component for table semantics (Task F6): every `<table>` has exactly one `<caption>`, and every `<th>` declares `scope="col"` |
| `ai-analysis.test.ts` | 15 | `buildAiAnalysis` — the AI-analysis export and prompt generation, remediation-focused output, and per-format framing (slide count and PowerPoint title for pptx, sheet count and Excel fix wording for xlsx, unchanged Pages/Acrobat wording for pdf) |
| `findings.test.ts` | 15 | Findings utilities: guidance-vs-actionable finding classification and per-card finding partitioning |
| `login.test.ts` | 15 | Two-step OTP flow (email then code), API-call verification, error handling, back navigation, and both the email-step and OTP-step error banners carrying `role="alert"` (Task F6 live-region hardening) |
| `scoring-display.test.ts` | 15 | ScoreCard grade color mapping (A-F), the conformance-verdict explanation, and the single-Strict-view guard |
| `modeDivergence.test.ts` | 13 | `naReason`, the Not-Applicable/Not-Assessed explanation text: format-scopes claims that used to read as universal — `color_contrast` and `reading_order`'s PDF/Acrobat-specific wording now says so explicitly (with a Word equivalent added for reading order), `alt_text` points to the right pane in Word/PowerPoint/Excel as well as Acrobat/PAC, `bookmarks` is stated as PDF-only rather than implying PowerPoint is scored by slide count, and unrelated categories (`table_markup`, `link_quality`, `form_accessibility`) are asserted unchanged |
| `ReportActionBanner.test.ts` | 13 | The ReportActionBanner component — the report-page severity-count banner (singular/plural critical/moderate/minor combinations, the all-pass state) and format-neutral wording that never says "PDF" for a docx/pptx/xlsx result |
| `uploadFormats.test.ts` | 19 | The `uploadFormats` composable: builds the file-input `accept` attribute and format-list copy from the PDF/docx/pptx/xlsx enable flags (Oxford comma at four, comma-free "and" at two, exactly the disabled format dropped), and `unsupportedFormatHint` — pointing a user who picks a legacy `.doc`/`.xls`/`.ppt`/`.rtf` file at the modern format and the Save As fix, case-insensitively, while returning null for modern OOXML and unrelated file types. Each legacy message must also set the expectation that converting carries content but **not** accessibility structure. CSV is asserted as the deliberate opposite: it says there is nothing to audit, that this is not a defect, and points at the page linking the file — and is pinned never to contain "Save As", because telling a CSV author to convert produces a worse artifact and a meaningless grade. `.tsv` resolves to the same message |
| `useReportExport.test.ts` | 13 | `useReportExport`'s format-neutral fixes: `baseFilename` strips the source extension for every audited format (previously left `.docx` dangling), `buildJSON`'s `llmContext.standards` includes PDF/UA only for actual PDFs (not PowerPoint/Excel, and still included for legacy fileType-less PDF reports), the LLM prompt and remediation-plan fallback no longer hardcode Adobe Acrobat, and the scanned-document wording in `buildHtml` says "document" rather than "PDF" |
| `actionPlanComponent.test.ts` | 8 | The ActionPlan timeline rail: numbered steps with step 1 auto-open, exclusive-open accordion (opening a step closes the previous; clicking the open step closes all), both fix routes and WCAG chips in an expanded step, the `show-evidence` emit, blocking-steps subtitle math, the green pass card with the manual-review reminder, and re-seeding to the new first step when the steps prop changes (batch tabs). Visibility asserted via the style attribute — vue-test-utils `isVisible()` is structurally blind under happy-dom |
| `reportHeader.test.ts` | 12 | The Visual view's header trio: ReportGradeHero (grade + score + plain-language verdict; the blocker-leads rule — a Critical drops the grade adjective, counts itself, and colours by severity so a weighted-average "A" can never render "Excellent — not ready to publish" in green — plus singular/plural, the moderate-only and clean phrasings, and NO publication clause for category-less page-audit reports), SeverityTiles (per-severity counts, icon + label + number pairing, muted zero tiles), and VerdictStrip (failing-criteria count with a technical-report link, green no-failures variant, rendering nothing without a conformance verdict) |
| `exportActionPlan.test.ts` | 6 | `buildHtml`'s Visual-view mirror: the action plan renders between hero and category table ordered Critical-first, severity tiles and the verdict phrase appear, every legacy section is retained, page-audit-shaped results get no plan/pass-card/verdict and no crash, clean reports get the pass card — and the XSS case pushes `<script>` payloads through the plan block's real dynamic paths (Acrobat-marker steps and unknown-id fallbacks), asserting the escaped forms appear |
| `reportViewToggle.test.ts` | 6 | `useReportView` (visual default, stored preference applied on mount, garbage values ignored, persistence to `far:report-view`) and the ReportViewToggle control (`aria-pressed` states, `update:modelValue` emit, plain-word labels, `data-export-exclude`) |
| `reportVisualView.test.ts` | 6 | The assembled Visual view: zone DOM order (hero → tiles → verdict → plan → bars → technical report), plan steps built from the result, warnings + notice slot, evidence clicks opening the technical expander, the page-audit guard (hero only — never tiles/plan/bars/expander/pass-card), and legacy strict-profile derivation matching the Detailed view |
| `technicalReport.test.ts` | 6 | The Full-technical-report expander: collapsed by default behind a real `aria-expanded` button, expanding to reveal the conformance detail (failing criteria, not-assessed list, standards basis), executive summary + audit-scope caveat, embedded ReportContent without its score table, and `v-model:open` for evidence links — plus ReportContent's `showScoreTable` prop defaulting to today's behavior |
| `categoryBars.test.ts` | 4 | CategoryBars score-table parity: one row per scored category with label, grade-colored bar, numeric score, grade letter, and severity chip; full-sentence `aria-label` per row; N/A rows distinguishing not-assessed from not-applicable with their `naReason`; malformed categories rendering empty rather than throwing |
| `remediateDownloadPlacement.test.ts` | 5 | The remediation results page, source-inspected: the remediated-file download controls (filename options + button) render inside the "After Remediation" card after the ScoreCard, the old standalone download section is gone, and the readiness banner is grade-gated — a fix-before-publishing warning for anything below an A (strict-profile grade, matching the card's own ScoreCard), a ready-to-publish note on exactly A |
| `exportSnapshotAccordion.test.ts` | 2 | The snapshot HTML export vs the exclusive accordion: plan-step toggles are never clicked during export (live accordion state untouched) and the exported document force-shows every `.plan-step-body` and the technical-report body regardless of captured inline styles |
| `wcag.test.ts` | 12 | `WCAG_MAP`'s remediation guidance: every fix-it category gained a Word/PowerPoint/Excel equivalent alongside its existing Acrobat steps (Styles gallery for headings, the Alt Text pane, Repeat Header Rows / Header Row, the Selection Pane and linear-flow guidance for reading order), `link_quality` no longer frames every fix as a pre-PDF-export step, `bookmarks` is clarified as PDF-specific, `color_contrast` states Office contrast is machine-checked (not a PDF-only manual step), and `pdf_ua_compliance` is confirmed untouched (it has no Office equivalent) |
| `useRemediationJob.test.ts` | 11 | `useRemediationJob`'s polling behavior: a 1-second base cadence, 429 responses treated as silent back-off feedback (not a job error) with exponential backoff capped at 8 seconds and reset on success, a previously shown error clearing once a later poll succeeds, polling stopping cleanly on a 404, a terminal status, or component unmount, and job-token passthrough (C5 anonymous-mode authorization) — `?token=` is appended (URL-encoded) to both the status and receipt requests when a token is provided, and omitted entirely when it isn't, matching the pre-C5 URL exactly |
| `ReportFileBanner.test.ts` | 9 | The ReportFileBanner component — the prominent filename banner (eyebrow label, bold filename, page/type line, scanned chip, long-name wrapping) with slide counts for PowerPoint and sheet counts for Excel |
| `scoring-profiles.test.ts` | 9 | The `scoringProfiles` utility - scoring-profile selection and per-category resolution |
| `reportBanner.test.ts` | 8 | The `reportBanner` helper: the shared eyebrow label and singular/plural `N pages · PDF` line, extended to label Word/PowerPoint/Excel results by their own noun (pages/slides/sheets) and fall back to the PDF wording for an unknown stored `fileType` |
| `ReportDownloadBar.test.ts` | 8 | The ReportDownloadBar component in both its cards (index.vue) and compact (report/[id].vue) variants: renders the original 5 buttons in their original order and labels with a descriptive `aria-label` added to each, clicking each one calls the matching `useReportExport` function with the result prop, and each variant keeps its own original PDF print-dialog title text and classes |
| `ReportsTable.test.ts` | 8 | The shared ReportsTable component: renders one row per item and one `<th>` per column, renders raw cell values by default or a `cell-<key>` scoped slot when provided (passed both `row` and `value`), every header `<th>` carries `scope="col"` with a visually-hidden `<caption>` (Task F6 folded in), and an empty `rows` array renders a table with no rows rather than the page's own empty-state message |
| `AnnouncementBanner.test.ts` | 7 | The AnnouncementBanner component - permanent dismissal per announcement id, localStorage key scoping, and re-show after clear |
| `usePaginatedReports.test.ts` | 7 | The `usePaginatedReports` composable shared by the history pages: fetches the given URL on mount at page 1 with credentials included, exposes the response under `data`, `goToPage(n)` refetches with the new page in the query (a no-op when the page is unchanged), and a fetch error sets `error` (cleared once a later page succeeds) |
| `usePrefill.test.ts` | 7 | The `usePrefill` composable: URL `?prefill` handling, happy path, error handling, and URL-decoding edge cases |
| `shared-constants.test.ts` | 6 | The `@file-audit/shared` scoring constants the web UI derives from: strict weights sum to 1.0 (and bookmarks/reading_order carry the engine's real 5%/10%), grade thresholds/colors, severity thresholds/colors, and WCAG category-map completeness |
| `announcementsArchive.test.ts` | 10 | Reachability of the `/announcements` archive, whose whole purpose is defeated if the banner can hide it. Asserts the archive is linked from both the header and the footer (surfaces that render on every page regardless of banner state), that the page never reads the banner's dismissal store or `localStorage` at all, that it renders every entry rather than only the newest, and that it applies the same WCAG-version filter and honours `linkExternal`. The load-bearing one: the header link must sit **outside** the `v-if="user"` nav — `AUTH.REQUIRE_LOGIN` is false, so a link placed inside would look correct in review while being invisible to every anonymous visitor |
| `monitorRouteMethods.test.ts` | 12 | The uptime-monitor routes (`/status`, `/healthz`) must answer **HEAD** as well as GET — several monitors, UptimeRobot included, send HEAD by default, and as `*.get.ts` files Nitro 404'd them, which would report a healthy service as down. Asserts both halves of the fix: the filename carries no method suffix (and the `.get.ts` variant is gone), and an explicit guard narrows to GET/HEAD with a `405` + `Allow` header otherwise. Also pins that HEAD still runs the real probe rather than short-circuiting — a HEAD that always returned 200 would be worse than the 404 it replaced — that `X-Robots-Tag` is set before any work, and that `publist.get.ts` was not swept up by the rename. Also pins that in-site links use a plain `<a href="/status?html">` — never a `NuxtLink`, which renders the SPA 404 without contacting the server — and that it stays in the **same tab** (a test that fails if `target=` reappears) |
| `auditLeaveWarning.test.ts` | 11 | The guard that stops a stray click discarding a running audit. The half most easily broken is the negative one, asserted first: with no audit running the prompt function is **never called** — an unconditional caution would fire on nearly every click and become a notice people dismiss unread. Also pins that a running audit is asked about with wording naming what is lost, that answering no blocks the navigation, and that all three exits are covered, since the browser treats them as unrelated: `beforeunload` for document navigations (the Status link, reload, closing the tab), a router guard for in-app links that never unload the document, and `goAnalyze` asking for itself because the site-title reset navigates to the route it is already on. Plus the flag tracking both single and batch audits, and clearing on unmount — a stuck flag would prompt on every later click |
| `statusHtml.test.ts` | 91 | The human-readable `/status` view, whose defining property is that it is **additive** — `/status` is a monitored endpoint and a keyword alert reads the JSON body, so quietly serving HTML to a monitor would disable that alarm while looking healthy. Pins that a wildcard `Accept` (UptimeRobot, curl) and a missing `Accept` both still get JSON, that only an explicit `text/html` selects HTML, and that `?json` wins even from a browser (the monitor-proof URL). Also covers the renderer: no `<script>`, no inline handlers, no `javascript:`; native `<details>` for collapsing; type-coloured scalars; arrays including the `degraded` list; empty containers rendered inline; a regression guard against an expanded object rendering as an empty `{}`; and HTML-escaping of keys, values, both hrefs and the document title. Plus the back link to the audit tool, whose label is passed in rather than hardcoded so it follows a rebrand. Plus the grade distribution: three windows rendered, thousands separators, per-window share arithmetic, a singularized one-document window, the `ungraded` row shown only when non-zero, an empty window saying so instead of dividing by zero, a malformed bucket never reaching `NaN`, colours sourced from `GRADE_THRESHOLDS`, best-first ordering, the bars marked `aria-hidden` with the meaning in a `scope`d table under a real `<h1>`, and the self-selection caveat asserted both in the section and above the JSON tree on the assembled page — plus the backward-compatibility case that a payload predating `by_grade_*` renders nothing rather than breaking. Plus the refused-uploads section: both windows, plain-language format names rather than bucket keys, per-window shares, zero rows omitted, an empty window saying so without dividing by zero, a malformed bucket never reaching `NaN`, its own `aria-labelledby` distinct from the grade section's, ordering below the grade distribution and above the JSON tree, and the "attempts, not documents" caveat. Plus the audited-format section, whose whole job is disambiguation: the catch-all labelled **Unrecognized extension** and never "Other", explained in the caveat even in a window where its row is hidden for being zero, stated plainly as *not a refusal*, ordered between the grades and the refusals, and — the point of the section — both catch-alls remaining distinguishable on one page. Plus the v1.55.0 fold-up: every card collapsed by default with its headline fact as a summary peek, the always-visible status strip (pill class per status, version, humanized uptime, degraded list, hostile status string escaped), the stale-backup card pre-opening, the never-run backup peek, the raw-JSON card wrapping a still-fully-expanded tree, and the page still shipping zero JavaScript |
| `status.test.ts` | 13 | `resolveStatus`, the Nuxt-tier aggregation behind the public `/status` URL. The monitoring-critical case: a core failure must reach the caller as **503 with the payload intact** — Express answers 503 when qpdf or the database is broken, and discarding that body in favour of a bare `api:"down"` would throw away the exact diagnosis the endpoint exists to deliver. Also covers optional-engine failures staying 200, an unreachable API returning a deliberately *minimal* rather than partial body (no fabricated zeros), a rate-limit body reported as reachable-but-unknown without leaking the limiter's message, `isOutage` treating absent engine data as "not evidence of failure", and the API payload never being able to override `web`/`api` |
| `healthz.test.ts` | 8 | `resolveHealthz`, the aggregation behind the `/healthz` liveness-fallback URL served by the Nuxt tier (superseded as the monitoring target by `/status`, but retained because it runs no probes and so still answers when `/status` cannot): 200 with both tiers ok (and the API's uptime echoed) only when the loopback `/api/health` probe answers `status:"ok"`; 503 with `api:"down"` when the probe rejects (unreachable/timeout) or returns a non-ok, empty, or null body; a 429 from the API's own rate limiter counts as alive (flooding `/healthz` can't fabricate an outage) while any other HTTP error stays down; `apiUptime` omitted when down |
| `csp.test.ts` | 5 | `buildCspHeader`: the per-request nonce lands in `script-src` with `'unsafe-inline'` dropped there (while `style-src` keeps it), the tight high-value directives are preserved, and no nonce value can cause `'unsafe-inline'` to leak into `script-src` |
| `download.test.ts` | 5 | The native `downloadBlob` helper that replaced `file-saver`: creates an object URL from the blob, clicks a detached anchor with the given filename and href, sets the `download` attribute before clicking, revokes the object URL afterward, and never leaves the anchor attached to the document |
| `escapeHtml.test.ts` | 5 | `escapeHtml`: escapes all five HTML-significant characters, neutralizes `<script>` and quote-breakout payloads, leaves benign text untouched, and escapes `&` first so entities aren't double-encoded |
| `IssuesSummary.test.ts` | 5 | The IssuesSummary component - issue-count summary |
| `shared-urls.test.ts` | 5 | `isSafeHttpUrl`/`safeHttpUrl`, the shared URL-scheme guard used across report components: accepts absolute http/https, rejects `javascript:` and other script-bearing schemes plus relative/empty/non-string input, and `safeHttpUrl` returns `undefined` (not an empty string) for unsafe input so a template's `:href` binding omits the attribute entirely |
| `SourceDocumentNotice.test.ts` | 5 | The SourceDocumentNotice component: format-specific remediation framing — the original PDF fallback text by default, Word-specific tips for docx, PowerPoint slide-title/checker steps for pptx, and Excel Format-as-Table/sheet-rename steps for xlsx (not one generic multi-app PDF list for every format) |
| `MethodologyCard.test.ts` | 4 | The MethodologyCard component: names the correct per-format toolchain description (PDF by default, Word for docx, PowerPoint for pptx, Excel for xlsx) |
| `indexA11y.test.ts` | 3 | index.vue's error and results a11y (Task F6): the analysis-failed banner carries `role="alert"`, and a successful single-file analysis produces a focusable results heading and moves DOM focus to it |
| `na-cell.test.ts` | 3 | The NaCell component - accessible "Not applicable" vs "Not assessed" rendering |
| `pdfUaSignalsCard.test.ts` | 6 | The PDF/UA-1 conformance-signals panel — signal rows, identifier presence, signals-vs-verdict framing, and the deterministic "N of 6 essentials met" readiness headline (counts the six boolean essentials only; structure depth and artifacts stay informational; count and label don't run together in text content) |
| `pdfUaFixHint.test.ts` | 11 | The `pdfUaFixHint` helper mapping each veraPDF failure to a short Acrobat-oriented fix, keyed off the rule description: untagged-content → tag/artifact hint, TH `Scope` → scope hint (matched before the generic table rule, since the scope text also mentions TH), TR/TH/TD → table hint, CIDSet/font → embedding hint, and a clause-inclusive generic fallback for unmapped rules |
| `severityTally.test.ts` | 3 | The `tallySeverity` utility - per-severity finding counts |
| `pdfUaVerdict.test.ts` | 8 | The shared `PdfUaVerdict.vue` component: renders nothing when veraPDF is unavailable; a Fail badge that never shows a bare "Conformant" and always carries the manual-review caveat; the failed-checkpoint list collapsed by default and revealed on expand; delimiter-aware ruleId suppression (an unrelated `7.1-3` is not dropped under clause `7`); a Pass badge; and a "Could not validate" state when veraPDF errored |
| `dataRetentionVersion.test.ts` | 2 | The data-retention page no longer hardcodes the stale `1.18.0` version literal — `TOOL_VERSION` now derives from `runtimeConfig.public.appVersion`, the same source the footer uses |
| `ProcessingOverlay.test.ts` | 2 | The ProcessingOverlay component's live region (Task F6): the stage text is wrapped in `role="status" aria-live="polite"`, and an updated stage is announced when the prop changes |
| `remediationGuard.test.ts` | 2 | index.vue's remediation-button guard: gates `RemediateButton` on `fileType === 'pdf'` (a positive allowlist), replacing the old negative `!== 'docx'` check that would have wrongly offered PDF-only remediation for pptx/xlsx |

### CLI Tests (49 tests)

`apps/cli` (`@icjia/a11y-audit`) has its own vitest suite. `pnpm test` at the repo root now runs it too (alongside API and Web, with the unified summary above); `cd apps/cli && pnpm test` still works standalone.

| File | Tests | What it covers |
| --- | ---: | --- |
| `graphql.test.ts` | 19 | The publications-source GraphQL/file loader: `SUPPORTED_EXTENSIONS`/`hasSupportedExtension` now matches all four audited formats (case-insensitively), and both `fetchPublications` (API) and `loadPublicationsFromFile` (local) keep all four formats and drop the rest while staying backward-compatible with PDF-only lists and the `{ publications: [...] }` wrapper shape |
| `csv.test.ts` | 12 | `escapeCsvField`'s CSV formula-injection guard: prefixes a leading `=`/`+`/`-`/`@`/tab/CR (the OWASP trigger set) with a single quote so spreadsheet apps treat it as text, composes correctly with the existing comma/quote/newline quoting, and leaves normal fields, numbers, and null/undefined untouched |
| `html.test.ts` | 8 | The `publist` HTML report's download-link scheme guard: `isSafeHttpUrl` rejects `javascript:`/`data:`/`vbscript:` and malformed URLs, the guard function is embedded verbatim into the generated page's client-side script, and the Download anchor is gated on it (not bare truthiness) while the already-safe "View Full Analysis" link is untouched, and the report's grade color palette is sourced from `@file-audit/shared`'s `GRADE_COLORS` (verified byte-identical in both the summary cards and legend) |
| `publist.test.ts` | 6 | `downloadFile`'s streaming download guard: reassembles chunked responses into a Buffer, rejects on a non-ok HTTP status, and enforces the size cap both from a `content-length` header and from cumulative streamed bytes — cancelling the reader (not draining an unbounded body) the moment either is exceeded |
| `version.test.ts` | 3 | The CLI's reported `--version` matches `apps/cli/package.json` (no longer the stale hardcoded `1.0.0`), and neither `index.ts` nor `commands/audit.ts` hardcodes its own `VERSION` literal |
| `cache.test.ts` | 1 | The result cache's round-trip: PowerPoint (`slide_titles`) and Excel (`sheet_names`) category scores/grades/severities survive `upsertResult` and render correctly in the CSV and HTML reports |

### Accessibility Compliance (WCAG 2.1 AA)

The web interface itself meets **WCAG 2.2 Level AA** standards. Measured against production on **2026-08-07** (desktop, Lighthouse via `lightcap`):

| Category | Score |
| --- | :--: |
| Accessibility | **100** |
| Best Practices | **100** |
| SEO | **100** |
| Performance | **97** (CLS 0.104 fixed in v1.61.0 — re-measure) |

The previous "95+ on Lighthouse accessibility" claim predated the v1.54 report redesign and had never been re-run — it was understating the real figure, which is the less common way for a stale number to be wrong, but stale either way.

That run surfaced one genuine failure, now fixed: the announcement banner's "See all updates" link carried the accessible name *"See all previous announcements"*, so the visible words appeared nowhere in the accessible name — a **WCAG 2.5.3 Label in Name** violation, which breaks speech input, on an accessibility tool. The remaining Performance gap is a CLS of 0.104 from header and results-region layout shifts; tracked, not yet fixed.

**What's enforced:**

| Requirement                 | Implementation                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Color contrast**          | All text meets 4.5:1 minimum ratio in both dark and light modes. CSS custom properties ensure correct contrast for every theme. `text-neutral-500` and `text-neutral-600` are banned. |
| **Semantic landmarks**      | `<header>`, `<nav>`, `<main>`, `<footer>` in the default layout; `<main>` on standalone report pages.                                                                                 |
| **Link distinguishability** | External links use `underline` or blue-400 color (7.5:1+ contrast). All include `rel="noopener noreferrer"`.                                                                          |
| **Keyboard accessibility**  | All interactive elements are native `<button>` or `<a>` elements — no div-based click handlers.                                                                                       |
| **Click targets**           | Expand/collapse buttons span full width (WCAG 2.5.8).                                                                                                                                 |
| **Heading order**           | Valid heading hierarchy (h1 → h2 → h3) on all pages.                                                                                                                                  |

The `accessibility.test.ts` (35 tests) and `color-mode.test.ts` (51 tests) suites guard against regressions:

- **Contrast math** — verifies WCAG luminance ratios for every text color + background combination used in the UI
- **Source scanning** — reads `.vue` template sections and fails if `text-neutral-500` or `text-neutral-600` appear
- **Landmark verification** — confirms `<main>`, `<header>`, `<footer>`, `<nav>` exist in layouts and pages
- **Component-level checks** — keyboard-accessible controls, caveat text, link attributes, no low-opacity text

**Manual audits:** Full browser-based accessibility audits (axe-core, Lighthouse) are not part of the automated test suite. Run these manually against a running dev or production build using the [axe DevTools extension](https://www.deque.com/axe/devtools/) or Chrome DevTools Lighthouse panel.

## Deployment

**Target:** DigitalOcean droplet (2 vCPU / 4GB RAM, ~$24/mo) → Laravel Forge → PM2 → nginx

See [docs/archive/04-deployment-guide.md](docs/archive/04-deployment-guide.md) for full instructions (server setup, nginx config, firewall, SSL). Short version:

```bash
pnpm install --frozen-lockfile
pnpm build                                    # Type-check API + analyzer, build Nuxt
pm2 restart ecosystem.config.cjs --update-env  # PM2 sets PORT and NODE_ENV
```

For local production testing (without PM2):

```bash
pnpm build && pnpm start:all    # Clears ports, starts API :5103 + Web :5102
```

### Status & uptime monitoring

**`GET /status`** (Nuxt) is the monitoring and service-visibility URL. It returns a JSON document covering both tiers, the audit engines, and usage:

```json
{
  "status": "ok",
  "version": "1.53.0",
  "uptime_seconds": 431520,
  "uptime": "4d 23h 52m 0s",
  "checked_at": "2026-08-05T16:47:03Z",
  "checked_at_chicago": "Aug 5, 2026, 11:47:03 AM CDT",
  "web": "ok",
  "api": "ok",
  "database": "ok",
  "engines": {
    "checked_at": "2026-08-05T16:46:14Z",
    "qpdf": { "ok": true, "version": "11.9.0" },
    "verapdf": { "ok": true, "version": "1.30.1" },
    "chromium": { "ok": true }
  },
  "documents_audited": {
    "last_24h": 37,
    "last_30d": 812,
    "total": 14203,
    "by_format_30d": { "pdf": 700, "docx": 84, "pptx": 18, "xlsx": 10, "unknown_extension": 0 },
    "by_format_total": { "pdf": 12010, "docx": 1600, "pptx": 380, "xlsx": 210, "unknown_extension": 3 },
    "by_grade_24h": { "A": 2, "B": 3, "C": 6, "D": 8, "F": 18, "ungraded": 0 },
    "by_grade_30d": { "A": 41, "B": 60, "C": 118, "D": 150, "F": 437, "ungraded": 6 },
    "by_grade_total": { "A": 610, "B": 840, "C": 1780, "D": 2100, "F": 8830, "ungraded": 43 }
  },
  "documents_rejected": {
    "last_24h": 3,
    "last_30d": 61,
    "total": 288,
    "by_format_30d": { "doc": 30, "xls": 10, "ppt": 2, "rtf": 1, "csv": 15, "other": 3 },
    "by_format_total": { "doc": 180, "xls": 44, "ppt": 9, "rtf": 2, "csv": 47, "other": 6 }
  },
  "last_audit_at": "2026-08-05T14:02:55Z",
  "last_audit_at_chicago": "Aug 5, 2026, 9:02:55 AM CDT",
  "remediation": { "enabled": true, "jobs_24h": { "complete": 4, "failed": 0 } },
  "backup": {
    "status": "ok",
    "finished_at": "2026-08-05T15:31:29.308Z",
    "finished_at_chicago": "Aug 5, 2026, 10:31:29 AM CDT",
    "age_hours": 1.3,
    "size_bytes": 29341552,
    "rows": 8052
  }
}
```

**Tiered failure semantics.** Not every broken dependency is an outage:

| Tier | Components | Response |
| --- | --- | --- |
| Core | `api`, `database`, `qpdf` | `503`, `"status":"down"` |
| Optional | `verapdf`, `chromium` | `200`, `"status":"degraded"`, plus a `degraded: […]` array |
| Backup | nightly DB snapshot | `stale` → `200` + `"backup"` in `degraded`; `unavailable` → stays `ok` |

veraPDF or Chromium being unavailable removes the PDF/UA verdict or page audits, but document auditing still works — returning 503 for either would page an operator over something that is not an outage. The backup row (since v1.52.0) follows the same logic one notch further: a **stale** backup — one that succeeded before but is now older than `STATUS.BACKUP_STALE_AFTER_HOURS` (30, nightly cadence plus slack) — joins `degraded`, so a silently dead backup cron pages through the same keyword alert; **unavailable** (no backup has ever completed — the expected state of a fresh deployment before its first scheduled run) deliberately does not, and the backup can never contribute to a 503. When the API is unreachable the response is deliberately minimal (`{"status":"down","web":"ok","api":"down"}`) rather than partial: without the API no count or engine result is knowable, and emitting zeros would be a false statement rather than a missing one.

Point an external monitor (e.g. UptimeRobot) at `https://audit.icjia.app/status`. A plain HTTP(S) monitor suffices for up/down; adding a **keyword alert on `degraded`** is what catches a silently broken engine — veraPDF can die and leave every other signal reporting a healthy 200.

**Caching.** Two TTLs, because the halves differ in cost by orders of magnitude: database aggregates refresh every **5s** (pure SQL — the cache only coalesces bursts), engine probes every **10 minutes**. Probes spawn processes including a veraPDF JVM, so a single short TTL would mean a monitor polling at UptimeRobot's 5-minute default misses the cache on every check — roughly 288 JVM starts a day purely to answer monitoring. With the split, probe cost is bounded by the TTL rather than by poll frequency, and `engines.checked_at` shows how stale a passing result is.

**Two representations, one payload.** Browsers get a syntax-coloured, collapsible JSON tree; everything else gets the JSON. Only an explicit `text/html` in `Accept` selects HTML — a wildcard `Accept` (UptimeRobot, curl) still receives JSON, so a keyword alert on `degraded` keeps working. `/status?json` forces JSON regardless and is the recommended monitor URL, since it states its own contract; `?html` is its mirror and is what every in-site link uses, and `?format=json|html` is also accepted. The JSON body is unchanged — the HTML view is advertised via a `Link: </status?html>; rel="alternate"` header rather than a payload field, so the top-level key allow-list stays intact. The HTML page carries **no JavaScript**: collapsing is native `<details>`, the toggle is a link, and every key and value is escaped.

The HTML view's toolbar carries the JSON toggle on the right and a link **back to the audit tool** on the left. `/status` has none of the site's chrome, so without it anyone arriving from a monitor alert, a bookmark or a pasted link has no path into the app at all. The label comes from `BRANDING.APP_SHORT_NAME` through `runtimeConfig` rather than being hardcoded, so it survives a rebrand.

**Collapsible cards + an always-visible status strip** (v1.55.0). Every section — grade distribution, format split, refusals, the backup row, and the raw JSON tree — is a native `<details>` card. The four interpretive cards are **collapsed by default**, so a first-time reader meets a stack of one-line summaries instead of a wall of tables, while the **raw JSON payload stays open**: operators and monitors come here for exactly that, so it should never cost a click. Each summary carries the card's headline fact as a right-aligned "peek" ("4,143 documents all-time · 12 in the last 24 h", "✓ 13.6 h ago · 28.0 MB of records, not documents"), so a collapsed card still answers its question without a click. Because collapsing everything would also hide the one thing visitors come for, a **status strip** sits above the cards and never folds: a colored pill (green "All systems normal" / amber "Degraded" / red for anything else), the version, humanized uptime, and the degraded list when there is one. One state overrides the default: a **stale backup arrives pre-opened** — the reader must not have to click to discover it. Still zero JavaScript — `<details>/<summary>` is native, keyboard-accessible, and invisible to the CSP.

**"Why back up anything if nothing is stored?"** (v1.58.0). The tool's headline promise — *your file is never stored* — and a card announcing a nightly backup read as a contradiction, and a real reader raised exactly that. The backup card now answers it in place: a two-column ✓/✗ split of what a snapshot contains (one line per audit; sign-in emails; saved and shared reports; the routine connection log) against what it cannot (the document itself, its pages, anything a readable copy could be rebuilt from), then the resolution in one sentence — the *document* is never saved, the *record* that it was checked is, and that is what the backup copies. Because no document is ever written to disk, no backup can hold one. The collapsed peek says "of records, not documents" so a reader who never expands the card does not read "28.0 MB" as 28 MB of files. Both this card and § 7a of the [data-retention policy](https://audit.icjia.app/data-retention#backups-explained) — which draws the same answer as two side-by-side lanes, one ending in *discarded*, one in *backed up* — deliberately state what the records **do** carry: a sign-in email, the IP/user-agent connection log, and the file name as uploaded (a file named after a person stores that name). "Contains no personal data" would be false, and `backupsExplained.test.ts` fails on that phrasing on both surfaces specifically, because reassurance by omission is the regression worth catching here.

The live production page (v1.58.0) — as it opens, and with its cards expanded:

![The /status HTML view as it opens: a toolbar with a link back to the audit tool and a "View raw JSON" toggle, the "Service status" heading, a green "All systems normal" pill beside v1.58.0 and the uptime, then five collapsed cards each reduced to a title and a one-line peek — Checking engines (all 3 ok), Grade distribution (4,172 documents all-time · 20 in the last 24 h), What was audited (mostly PDF — by file type), Files the tool could not check (1 attempt all-time), and Last successful backup (a checkmark, 19.3 h ago · 28.0 MB of records, not documents) — above the raw status payload, which alone is open, showing the syntax-coloured JSON monitors read.](docs/images/status-html-1.png)

![The same production page with its interpretive cards expanded and the raw payload folded away: Checking engines lists qpdf 11.9.0, veraPDF 1.30.1 and Chromium, each with a green dot; Grade distribution opens to the self-selection caveat, a second caveat noting that grades from before v1.58.0 are on the older scale, and three time windows (last 24 hours, last 30 days, all time) each with a proportional colour-coded bar and an exact documents/share table; What was audited splits the same documents by format (95% PDF in the last 30 days, 98% all-time); Files the tool could not check leads with its attempts-not-documents caveat; and Last successful backup shows the completion line above a two-column split — a green ✓ list headed "In a backup — the service's own records" against a red ✗ list headed "Not in a backup — never stored at all" — then the plain answer to "Why back up anything if documents aren't stored?", a green bottom-line panel, and a link to § 7a of the data-retention policy.](docs/images/status-html-2.png)

**Grade distribution.** The HTML view renders `by_grade_*` as a proportional bar plus an exact table per window (24h / 30d / all time). As six bare numbers the counts say nothing to a non-technical reader; as a proportion the same data answers the question people actually arrive with — *are the documents we audit anywhere near accessible?* Colours and labels come from `GRADE_THRESHOLDS` in `@file-audit/shared`, the same source the report UI scores against, so an `F` is the same red here as on a report.

Two properties are load-bearing:

- **The buckets reconcile.** `ungraded` is a real bucket, not a dropped row. `audit_log.grade` is nullable (failed audits, rows predating the column) and any unrecognized value funnels there too, so each window's buckets always sum to the document total printed beside it. Two numbers on one page that disagree read as a bug; a test asserts the sum for every window.
- **The sampling is stated.** The corpus is self-selected — people upload documents they already suspect have problems, alongside test files, and the same file may be uploaded repeatedly. A reader who takes "62% F" as a population statistic about their agency's document library has been misled by the page, so the caveat sits above the numbers rather than below them. It is asserted by test, in both the section and the assembled page.

The bars are `aria-hidden`; the meaning lives in a real `<table>` with `scope`d headers, and the section is a labelled `<section>` under the page's `<h1>`. An accessibility tool shipping an inaccessible chart would be its own worst advertisement.

**What was audited.** The same documents as the grades, split by file type, rendered as its own labelled section. The catch-all is `unknown_extension` — called `other` until v1.47.0 — and it means *the document was audited normally, we just could not classify its filename*, which in practice is a URL audit whose path ends in something like `download?id=123`. It is near-always zero and exists so the format split always sums to the document total.

The rename and the section both exist for one reason: `documents_audited` and `documents_rejected` each need a catch-all, they mean opposite things, and calling both of them `other` made the page genuinely confusing — a zero next to a non-zero, apparently contradicting each other. Named and labelled apart, they read as the different questions they are.

**Refused uploads.** `documents_rejected` counts what people bring that the tool cannot check at all — the legacy Office formats and CSV — split by the extension it was offered under. It answers a question the audit counts structurally cannot, because a refused file never reaches the audit path: **how much of what people try to check is in a format that can never be checked.**

It is a **sibling** of `documents_audited`, never a bucket inside it. A refusal has no score and no grade, so folding the two together would inflate the audit total and drop every refusal into the grade distribution's `ungraded` bucket, making that figure meaningless. The separation is enforced by `STATUS.REJECTION_EVENT_TYPES` being disjoint from `DOCUMENT_EVENT_TYPES`, asserted by test.

Two details worth knowing:

- **Rejection rows carry a NULL `content_hash`, deliberately.** The remediation audit-gate (`hasRecentAudit`) matches on `content_hash + email` with no `event_type` filter, so a hash on a refusal row would let *"this content was refused"* satisfy a check that means *"this content was audited"*. NULL can never match, which closes it by construction rather than by remembering to filter. Pinned by a test that probes the gate's own SQL.
- **`other` is genuinely populated here**, unlike `documents_audited`'s `unknown_extension`. It covers unrelated types (`.jpg`, `.zip`) and files whose extension lies — a `.doc` renamed to `.docx` is caught by content detection but buckets by its *stated* extension, since that is all the SQL can see. The two catch-alls are different questions and are named differently for that reason: this one means *refused, and not one of the named unauditable formats*; `unknown_extension` means *audited fine, but unclassifiable by filename*.

The caveat differs from the grade distribution's: these are **attempts, not documents**, so one person retrying the same file counts each time.

**The header indicator shares this verdict** — and is a link to this page, with a tooltip listing each system's state from `/api/health`'s `systems` array. `/api/health` reports the same `status`/`degraded` summary, computed from already-cached state — it never triggers an engine probe, and it exists precisely so the header does not poll `/status`, whose 120/min cap is shared globally (Nitro proxies it over loopback, so every browser hit is `127.0.0.1`). ~40 concurrent tabs polling `/status` would exhaust that budget and blind the uptime monitor's keyword alert.

**Last successful backup.** The `backup` key (since v1.50.0) surfaces the nightly database backup remotely: completion time (UTC + Chicago), age in hours, snapshot size, and the usage-log row count it contains. It is read from the `last-backup.json` the backup job writes **only after a snapshot passes `integrity_check`** — so the row is proof a real, verified backup ran, not merely that cron fired. A missing, unreadable, malformed, or failed-integrity status file collapses to `"unavailable"` (never a crash, never a fake success). The row count is labeled *usage-log records* rather than *documents* deliberately: `audit_log` also holds page audits, auth events, and refusals, so it is always larger than `documents_audited.total`, and the two figures must not read as contradicting each other. The source file carries two absolute server paths (`sourcePath`, `snapshotPath`); neither is copied into the payload, asserted by a dedicated unit test.

**Privacy.** The endpoint is public and unauthenticated, so everything it reports is an aggregate `COUNT(*)` or a boolean about a local engine. No filename, email, IP, user-agent, or filesystem path is ever serialized — filenames are consumed by the by-format `CASE` expression *inside SQLite* and never cross the boundary, and probe failures collapse to a fixed reason enum (`not_configured` / `not_executable` / `timeout` / `error`) because subprocess stderr routinely embeds absolute paths. `statusPrivacy.test.ts` seeds identifying values and fails the build if any reaches the payload.

Excluded by design: **page-audit counts** (the document-vs-page distinction confuses the non-technical readers this page is for) and any **report-sharing figure** (a row records that a report was *generated*, never whether its link was copied or sent — so "shared" is unmeasurable, not merely unmeasured).

Other endpoints:

- **`GET /api/health`** (Express) — `{"status":"ok","uptime":"…","systems":[{"id":"qpdf","label":"Document audits (qpdf)","ok":true,"state":"up"},…]}` (plus `degraded:[…]` when anything is). The per-tier smoke-test URL used after deploys, and the header indicator's source: `systems` names each part of the service with a tri-state — `ok: null` means *not established* (engine never probed, backup never recorded), which never degrades and is shown as its own thing.
- **`GET /healthz`** (Nuxt) — a dependency-free liveness fallback that probes the API over loopback and 503s if either tier is down. It runs no engine probes and touches no database, so it still answers when `/status` cannot.

`robots.txt` disallows `/status` and `/healthz`, and both send `X-Robots-Tag: noindex, nofollow` — robots.txt is advisory, the header is not. Neither affects uptime monitors.

## Security

The application undergoes a security review before every release plus periodic standalone comprehensive audits; the running history is in [Review history](#review-history) below. Current posture:

- **Auth is optional** — all other protections apply regardless of the auth toggle; the API fails closed at startup if login is enabled without a strong `JWT_SECRET`.
- **Files processed in memory** — PDF analysis writes a QPDF temp file under a random name, deleted in the same request even on failure; Word, PowerPoint, and Excel analysis never touches disk — the buffer stays in memory, including across the IPC channel to the interruptible OOXML child process (below).
- **Nightly database backups** (since v1.49.0) — the SQLite database is snapshotted every night using SQLite's online-backup API (WAL-safe where a plain file copy is not), integrity-checked before a snapshot is kept, and rotated so **only the five newest snapshots are retained**. Snapshots stay on the same server, in a dedicated backups directory outside both the application checkout and anything web-reachable; they never leave the machine. The last successful backup is visible on `/status`, and the restore path is scripted and drill-tested. Whole-machine loss is covered separately by the host's own droplet backups. Operator runbook: `docs/database-backups.md`. **What a snapshot contains** (v1.58.0 states this in-product, because "your file is never stored" and "nightly backups" read as a contradiction until someone says otherwise): a copy of this database and nothing else — one row per audit (date, file name, score, grade), sign-in email addresses, saved and shared reports, and the usage log. Audited documents are never written to disk at all, so no backup can contain one; a snapshot could not reproduce a page of anyone's document. Explained for non-technical readers in the `/status` backup card and in § 7a of the data-retention policy, both of which also state plainly what personal detail the records *do* carry (sign-in email, IP/user-agent connection log, and the file name as uploaded) rather than claiming none.
- **No shell** — QPDF / OpenDataLoader / veraPDF are invoked via `execFile` with array arguments; user-supplied filenames never reach a shell or a path component.
- **SSRF-hardened URL fetching** — both `/api/analyze-url` and the fleet `/api/audit-url` endpoint fetch and audit PDF, Word, PowerPoint, or Excel content by URL; each resolves DNS in-process, rejects private/reserved IPs (IPv4 + IPv6), pins the connection to the validated IP, and re-validates every redirect hop; the headless-browser page-audit path enforces the same private-IP block on every request via a Chromium interceptor.
- **Bounded work** — per-request size caps (including a per-part uncompressed-size cap on each OOXML format — `.docx`/`.pptx`/`.xlsx` — to stop decompression bombs), a 2-slot analysis semaphore shared by the PDF, Word, PowerPoint, and Excel paths, pdfjs and OOXML (docx/pptx/xlsx) parse/analysis timeouts — the latter enforced by a dedicated per-request child process that a timeout can SIGKILL outright rather than merely abandon — and an enforced wall-clock timeout (with process-group kill) on the remediation worker.
- **Two-tier rate limiting** on the audit endpoints — strict per-IP for anonymous callers (500/hr analyze, 100/min global), generous for callers presenting a valid `API_PRIVILEGED_TOKEN` (5000/hr, 1000/min) — plus **Helmet + nginx headers** on the API and a **nonce-based Content-Security-Policy** on the web app (as of v1.32.0, `script-src` carries a per-request nonce and no `'unsafe-inline'`, so injected inline scripts and `javascript:` URIs are refused); **CORS** locked to a single origin in production.
- **Privileged API token** (`API_PRIVILEGED_TOKEN`, optional) — a single static bearer token that unlocks the generous rate tier **and** lets a trusted client audit URLs outside the ICJIA / illinois.gov allowlist. It never bypasses the private/reserved-IP SSRF block, the size caps, or the concurrency semaphores; constant-time compare; unset = feature off (everyone strict).
- Full security model: **docs/archive/00-master-design.md, Section 9**.

### Batch upload security

Batch processing adds **no new server-side attack surface**. Each file in a batch is an independent HTTP request to the existing `/api/analyze` endpoint, subject to all existing protections:

| Threat                         | Mitigation                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bypassing the 3-file limit** | The limit is UX (frontend). The real server-side gates are the per-caller analyze rate limit (`RATE_LIMITS.analyze`) and the global per-IP catch-all (`RATE_LIMITS.global`); a client sending more requests just hits those faster, and the 2-slot analysis semaphore caps actual concurrent work regardless. |
| **Memory exhaustion**          | Server semaphore caps concurrent analyses at 2 regardless of how many requests arrive. Max server memory: 2 × 15 MB = 30 MB (unchanged from single-file mode).   |
| **Filename / document-text XSS** | Filenames and all PDF-, Word-, PowerPoint-, and Excel-derived text (title, alt text, link text, headings) render via Vue `{{ }}` interpolation (auto-escaped). The few `v-html` sinks are fed only by escaped or non-document data, and HTML exports run every string **and** numeric/grade field through a shared `escapeHtml` helper (verified in the 2026-06-10 and 2026-07-01 audits). Server also sanitizes filenames before storage. |
| **Race conditions**            | JavaScript is single-threaded; the batch worker's `nextIndex++` cannot race. Server semaphore uses a FIFO queue.                                                 |
| **Auth bypass during batch**   | Each request carries the JWT cookie. A 401 on any request immediately navigates to login and abandons remaining items.                                           |
| **Concurrent upload flood**    | Frontend limits to 2 concurrent requests. Even if bypassed, server semaphore queues extras. Rate limiter applies per-IP.                                         |

### Review history

Reviewed before every release, with periodic standalone comprehensive audits. Most recent first — the latest is shown in full; earlier per-release reviews are collapsed to cut visual noise. **Every release since v1.18.0 has an entry**, and `securityAudits.test.ts` fails if one is missing here or from § 10 of the data-retention page, which is the plain-language counterpart of this list.

Entries marked **(entry recorded 2026-08-08)** were reconstructed from that release's own changelog rather than written on the day. 29 releases — overwhelmingly small follow-up corrections — had been left out of this list while the change log and § 10 carried them; the backfill closed the gap and the test above prevents it reopening. The marker stays because a compliance record that quietly backdates itself is worth less than one that says which of its entries were written after the fact.

### v1.65.1 — 2026-08-08 · Coloured glyphs on the header tooltip (not a security release)

The tooltip's ✓/✕/— marks are now green/red/muted, as a second channel beside the state words — never instead of them (1.4.1). Same status tokens the header text uses, so the existing contrast measurements on `--surface-raised` (the tooltip's own background) already cover these pairs in both palettes. "Not yet checked" stays muted rather than green: the panel never presents an unverified state as known-good. Browser-verified in both themes; a sabotage check confirms painting the unknown state green fails the suite. Tests 2,214 → 2,215.

### v1.65.0 — 2026-08-08 · Header status light becomes an accessible link + per-system tooltip; light-theme contrast fix (not a security release)

The always-visible header indicator is now a plain `<a href="/status?html">` (not `NuxtLink` — `/status` is a Nitro server route and client-side navigation lands on the SPA 404) with a real on-page tooltip naming every system behind the verdict, sourced from a new `systems` array on `/api/health`. Tri-state per system, honestly: up, down/stale/low, and **not yet checked / never recorded** for anything unestablished — the header must not claim "up" about an engine nothing has probed. The `degraded` list is derived from the same array so dot and tooltip cannot disagree, and `getHealthSummary()` still never triggers an engine probe (pinned). The tooltip is not a `title` attribute (touch-invisible, screen-reader-silent): it opens on hover **and** keyboard focus, Escape dismisses without moving focus, `aria-describedby` carries the full list to screen readers, and the visible text stays the link's name (WCAG 2.5.3, 1.4.13, 1.4.1). Verifying it on both themes exposed that the status text itself was raw `green-500`/`amber-500` — **~2:1 on the light header**; it now uses the theme's status tokens, with the light success/error tokens darkened one step because they measured 4.46:1/4.3:1 on the *hover* surface. Contrast is now computed from `main.css` for both text groups against both surfaces in both palettes. Verified live in both themes: screenshots, keyboard open/Escape/reopen, the a11y tree's link description, and the click-through. Tests 2,193 → 2,214.

### v1.64.0 — 2026-08-08 · The review record backfilled to completeness, and marked as such (not a security release)

Every release since v1.18.0 now has an entry both here and in § 10 of the data-retention page. 27 § 10 entries and 29 README entries were missing — overwhelmingly small follow-up corrections — and each has been written from that release's own changelog, technical framing here and plain language there. **They are marked, not backdated**: every backfilled entry carries *(entry recorded 2026-08-08)*, and both surfaces explain why in their introduction. Those releases were reviewed at the time; this write-up of them was not, and a compliance record that quietly presents a reconstruction as contemporaneous is worth less than one that says which of its entries came later. Two are deliberate calls: **v1.58.1** records an attempt that *failed* and was replaced the same day, because a failed attempt is part of the honest history of how the scoring was corrected; and **v1.58.0**'s entry now states explicitly that its cap was on the letter and moved onto the score in v1.58.2, rather than leaving the two records to disagree. `securityAudits.test.ts` was strengthened from "does the shipping version have an entry?" to full completeness across both surfaces, plus the presence of the markers — a per-release check cannot tell you the archive behind it is intact. Sabotage-verified by deleting a mid-history entry from each and by stripping the markers. Tests 2,190 → 2,193.

### v1.63.2 — 2026-08-08 · § 10 becomes data plus one renderer; the auditor-facing entry is now enforced (not a security release)

§ 10 of the data-retention page — the security-audit history — was 3,273 lines of hand-written markup: 65 `<article>` blocks of ~46 lines each, 536 duplicated class attributes, the same card copied and re-edited every release. It is now `apps/web/app/data/securityAudits.ts` (typed records) plus a 161-line renderer. **No record changed**: verified by rendering both versions and comparing the text of all 65 entries character for character, which also surfaced two content bugs — 28 findings' follow-up notes carried inline markup but were rendered through text interpolation (a reader would have seen a literal `<strong>`), and three sub-headings kept a raw `&amp;`. The renderer uses `v-html`, which is safe for exactly one reason — the strings are authored in this repository and compiled into the bundle, the component takes no props, makes no requests and reads no database — so `securityAudits.test.ts` makes that a checked claim: only `<a>/<br>/<code>/<em>/<strong>`, no event handler, no `style`, no `src`, no `data:`/`javascript:` URI, no interpolation, every `href` https or root-relative. Each assertion sabotage-verified. The same file closes the gap that found this: a release can no longer ship without its § 10 entry, which v1.63.1 did. Tests 2,177 → 2,190.

### v1.63.1 — 2026-08-08 · Header indicator reports `/status`'s verdict (not a security release)

The header's status light polled `/api/health`, which answered only *"is this process alive"* — the one signal on every page could read a confident green "audit server online" while `/status` reported a stale backup, a low disk or a dead engine. `/api/health` now carries the same `status`/`degraded` summary and the indicator shows amber **"degraded — see status"**. Deliberately **not** by polling `/status`: that route's 120/min cap is shared *globally* (Nitro proxies it over loopback, so every browser hit arrives as `127.0.0.1` in one bucket), and ~40 concurrent tabs at 3 req/min would exhaust it, make `/status` answer `"unknown"`, and blind the uptime monitor's keyword alert. `getHealthSummary()` reads only already-cached aggregates, backup and disk state, and an *already-cached* engine snapshot — it never triggers a probe, since those spawn processes (veraPDF starts a JVM) and a 20-second poll across every open tab would make the most expensive operation the most frequent. Pinned by a test that counts probe invocations and requires zero. Also drops the dead job link from the remediation printout. Tests 2,171 → 2,177.

### v1.63.0 — 2026-08-08 · Printable action plan; one publish verdict across both surfaces (not a security release)

Every report and every remediation result gained a printer-friendly action plan, rendered entirely client-side from the report already in memory: a standalone document with one inline `<style>`, no scripts, no `<link href>`, no `src="http"`, opened as a blob URL so it inherits no CSP and fetches nothing. Every interpolated value passes `escapeHtml` — the plan quotes alt text, link labels and titles straight out of the uploaded file. Both fix routes (source document and Acrobat) are always expanded, because the person holding the printout may not be the one who chose the route. Separately, the audit report and the remediation result had two different publish rules, so one file could be "ready to publish" on one page and "not ready" on the other; both now call `publicationVerdict`, and the shared helper **fails closed** — an unreadable or empty category list yields "could not be re-checked", not "ready", which the old `grade === "A"` gate got right only by accident. Tests 2,124 → 2,171.

### v1.62.0 — 2026-08-08 · Visual/Detailed chooser made findable; remediation shows outstanding issues by default (not a security release) (entry recorded 2026-08-08)

The view chooser was two `text-xs` labels in a right-aligned strip, and it was missed — a reader looking for the step-by-step plan could not find the control that shows it and reported the plan as gone. A toggle nobody sees is a hidden setting, not a toggle. It now runs full width above the report in **both** views, asks its own question, gives each option a glyph and a sentence describing what you get, and marks the active view with the word **Showing** rather than by background colour alone (WCAG 1.4.1 — this is an accessibility tool and should not fail the criterion it checks). Separately, the remediation result page's outstanding issues moved out from behind a closed disclosure: a successful remediation is precisely when someone concludes a file is finished, and a one-line count reads as a footnote beside a green panel. `open` is an initial state, not a lock. Tests 2,141 → 2,149; the new assertions pin *findability* rather than presence — "it renders" was already true while it was being missed.

### v1.61.1 — 2026-08-08 · Report view never persists; the stepper is always the entry point (not a security release) (entry recorded 2026-08-08)

The Visual/Detailed choice persisted per device, so anyone who opened the Detailed view once got it for every subsequent report. Reported as *"the stepper is gone"*: the action plan has only ever existed in the Visual view, so a reader who had toggled once met the technical view on a fresh audit and the plan appeared deleted. The preference is no longer stored at all and the legacy `far:report-view` key is cleared on mount, so a stale value cannot linger on anyone's device. The default carries the product's intent and an asymmetric cost — showing the stepper to someone who wanted detail costs a click; hiding it from someone who needed it costs them the guidance. The data-retention policy's v1.54.0 entry, which stated the preference "is kept on your own device", was corrected in place rather than deleted, since this release *removes* one of the few things the tool kept client-side. Tests 2,140 → 2,141; the load-bearing assertion mounts with a stored "detailed" value — the exact state the reader was in — and requires Visual anyway.

### v1.61.0 — 2026-08-08 · Landing-page CLS eliminated; announcement copy and surface (not a security release) (entry recorded 2026-08-08)

CLS 0.104 → effectively zero. The announcement banner rendered only after hydration, appearing ~250px tall above everything and pushing the heading, drop zone and page down in one 0.067 shift — essentially the page's entire CLS, over Google's 0.1 threshold. The cause was a deliberate trade made the wrong way round: the banner started hidden and revealed on mount so a *dismissed* banner never flashed, which made every **first-time** visitor pay a layout shift to spare returning dismissers a frame — and a first-time visitor is who the banner is written for. It now renders during SSR and only ever hides on mount; measured 0.0698 → 0.0001. The residual is stated rather than hidden: a previous dismisser sees it for a frame. Removing that too would need the dismissal readable server-side — a **cookie** rather than localStorage, i.e. a new piece of client-side storage on a tool that documents every one it keeps, and not worth a frame. Also `scrollbar-gutter: stable` (0.0023, and unfixable by content reservation since the cause is the viewport narrowing), announcement copy capped at four or five sentences, and `--surface-announce` measured at 11.9:1 dark / 9.2:1 light. Tests 2,138 → 2,140; the regression test asserts the banner is visible in its *initial* render, deliberately without `await`, since awaiting would let `onMounted` run and pass for the wrong reason.

### v1.60.1 — 2026-08-08 · `/status` disk line scales to GB/TB (not a security release) (entry recorded 2026-08-08)

`/status` rendered *"61112.6 MB free of 78284.0 MB"* for a 76 GB volume. `formatBytes` had been written for the backup row, whose values are snapshot-sized (~28 MB), and capped there; the new disk line reused it. Technically correct, unreadable, and on the page written specifically for people who do not think in megabytes. Now *"Disk 78% (59.7 GB free of 76.4 GB)"*. Caught on production rather than by test, because nothing had asserted a gigabyte-scale value — the formatter had only ever been fed megabytes. Three tests now cover it, including that a backup-sized snapshot does not regress into "0.0 GB". The privacy contract is unchanged: percentage and size only, never a path. Tests 2,135 → 2,138.

### v1.60.0 — 2026-08-07 · Disk-space probe, PM2 restart policy, light-mode contrast — the 2026-08-05 review's carried items (not a security release) (entry recorded 2026-08-08)

**Disk-space probe on `/status`.** A full disk breaks uploads *and* the nightly backup simultaneously and silently, while every other check stays green — the audit path holds files in memory and the backup writes elsewhere, so neither surfaces a disk problem as its own failure; the first symptom would be a failed restore months later. The payload gains a `disk` section (free/total/percent) on the volume holding the database, degrading below `STATUS.DISK_LOW_FREE_PCT` (10%) where the UptimeRobot keyword alert already watches. Never a 503 — the service can still audit on a nearly-full disk, and paging about an outage that has not happened is how alerts get ignored. `unavailable` deliberately does **not** degrade: an unqueryable filesystem is a gap in our knowledge, not evidence of a problem. **No path is ever reported**; `statusPrivacy.test.ts` asserts the section contains no path separator at all. **PM2 `max_restarts` + `min_uptime`** and a log-rotation runbook (`docs/process-supervision.md`): without them a bad deploy becomes a silent hot loop burning CPU and filling the log disk while `pm2 status` reads "online" between crashes. **Light-mode contrast**: the grade/severity palette is tuned for dark (5.3–10.3:1); on light the same colours measured **1.9–3.8:1, every one below the 4.5:1 AA floor**, worst Moderate yellow at 1.92:1. Two palettes now, selected by `useTokenColors()`, verified against **all three** light surfaces — yellow-700 passes on white and the body surface but lands at 4.47:1 on `#f3f4f6`, caught by test rather than by eye. The `var(--grade-a)` implementation was built and rejected: the test DOM drops any inline style containing `var()`/`color-mix()` entirely, which would have blinded every colour assertion in the suite. Also a **WCAG 2.5.3 Label in Name** violation (the banner's "See all updates" link had accessible name *"See all previous announcements"*, so speech input matched nothing) — the site's only accessibility failure; re-measured Accessibility 100, Best Practices 100, SEO 100, Performance 97. Tests 2,099 → 2,135.

### v1.59.2 — 2026-08-07 · Unconditional human-in-the-loop statement; `/status` written for its actual audience (not a security release) (entry recorded 2026-08-08)

The manual-review card rendered only when it had passing checks or unassessed criteria to list — so a badly-failing document, the case that most needs a person, could get no such statement at all. Every report with categories now opens that card with a standing line independent of the score, and a report that still has findings additionally learns that clearing the action plan is not the finish line (a completed plan is a stronger pull toward "done" than a 100). `/status` renamed "Checking engines" → "Audit engines" and gave each engine a plain-language description: the people who open a status page are rarely developers but managers arriving sceptical, so each entry states what the program is, who maintains it, what it does here, and what its running does and does not prove — veraPDF in particular as the externally-maintained ISO 14289-1 validator that stops this being the tool marking its own homework. The strip now carries generation time; the one genuinely cached figure (engine probes, `STATUS.ENGINE_PROBE_TTL_MS`, each spawning a process) states when its reading was taken rather than implying live. Tests 2,095 → 2,099; the whole-document "prose bounded" assertion was refocused outside the collapsed card bodies rather than raised, with a companion assertion that the explanations are genuinely present so it cannot pass on a page that threw them away.

### v1.59.1 — 2026-08-07 · Manual-review card reaches the Detailed view (not a security release) (entry recorded 2026-08-08)

v1.59.0 wired the card into the Visual view only, while also changing ScoreCard's copy to point at "the manual-review list" — which in the Detailed view did not exist. Worse, `IssuesSummary` is `v-if="rows.length"`, so a document with no findings rendered **nothing at all** below the hero on that view; a reader's honest reaction was *"where are the findings?"*. The card now renders on all three report surfaces (Visual, and Detailed on both the audit page and the shared-report page) and a source-scan test pins each, including that both `categories` and `conformance` are passed — without the verdict the "not checked at all" half silently disappears, which is the half a perfect report most needs. Tests 2,091 → 2,095.

### v1.59.0 — 2026-08-07 · "Still worth checking by hand" on every report, including perfect ones (not a security release) (entry recorded 2026-08-08)

A document scoring 100 got an empty action plan and a one-line green card listing bare criterion numbers, leaving its author with the obvious question. The honest answer is that these checks confirm accessibility structure **exists**; almost none can judge whether it is **correct** — alt text of "image" passes, a heading describing the wrong section passes, a reading order tagged in the wrong sequence passes if it is tagged at all. Every check that **passed** now contributes an entry naming what was established and the judgment only a person can make, phrased as a concrete action; failing checks are deliberately absent, being already the action plan. Below that, the WCAG criteria this tool does not evaluate are listed by name with W3C links, stated as unexamined rather than failed. Tests 2,078 → 2,091, including a completeness guard that every scoring category able to pass has a prompt — so one added to the profile later cannot silently vanish from an author's checklist.

### v1.58.4 — 2026-08-07 · Stored reports recompute under current rules, not just the severity ceiling (not a security release) (entry recorded 2026-08-08)

Found by verifying v1.58.3 on production: a shared link to `Public Notice of Meeting.docx` served **71 / C** while re-uploading the identical file gave **79 / C** — precisely the "an old link and a fresh audit disagree" problem regrade-on-read exists to prevent. `regradeStoredReport` applied only `capScoreBySeverity`, a one-way ceiling: it could pick up v1.58.0 and v1.58.2 (which only lowered) but was structurally incapable of picking up v1.58.3, which *raised* simple documents. Stored reports carry every input the calculation needs (`score`, `weight`, `notAssessed`, `isScanned`), so the raw score is now re-derived under current rules with the ceiling applied afterwards; both guards travel with it, and an unusable row falls back to capping so it still gets the ceiling rather than nothing. **This can now raise a stored score** — that is the point. Stored rows remain byte-identical; they are an agency's evidence of what was computed on the day. Tests 2,075 → 2,078; the regrade fixture was replaced with the **real** production payload of the report that exposed this, since the previous two-category stub recomputed to a different number and would not have caught it.

### v1.58.3 — 2026-08-07 · Inapplicable checks count as passing — a document is not penalized for being simple (not a security release) (entry recorded 2026-08-08)

Checks that don't apply now count as **passing** and stay in the denominator instead of being dropped from it: a document with no tables does not have a table-markup problem, it has no tables. Reported from the field on two Word files — a one-page public notice and a longer meeting agenda, both missing a document title and nothing else in common — scoring **71** and **79**, the notice *worse* despite having strictly **fewer** findings, because only 3 of its 10 categories could be checked at all so its single fault was **58%** of its score against the agenda's 20%. Both now score **79 / C**. Two guards, both found by test rather than argument: `notAssessed` categories are still excluded (a null score means two different things the reports already distinguish — *"no tables were found"* versus *"contrast could not be resolved"*; scoring the second as a pass would be an unverified claim), and a scanned document still scores **0** (its categories are null because there is no extractable content, the opposite of "nothing wrong" — without the guard the scanned fixture scored 55, caught by the existing test). Corpus impact: 2 of 31 grades change, both F → D, both still carrying Critical findings and still reading "do not publish". Tests 2,074 → 2,075; distribution A:6 B:3 C:8 D:9 F:5.

### v1.58.2 — 2026-08-07 · The severity cap moves from the letter onto the score, restoring the published scale (not a security release) (entry recorded 2026-08-08)

v1.58.0 capped the *letter* at the document's worst finding and left the weighted average alone, severing the two: a report headline read `D` above `80/100`. Reported twice — *"a 'D' is not 80"*, then *"80 and above is a B. Not a C, and certainly not a D."* On the scale this tool publishes (90 A, 80 B, 70 C, 60 D, below F) the report was wrong on its face. v1.58.1 tried relabelling the number as "Fix progress"; that failed for the same reason, and a reader read "81 of 100" as a percentage grade within minutes. **Any figure out of 100 beside a letter grade is read as the grade.** The number itself had to change. The cap now lowers the **score** — Minor 89, Moderate 79, Critical 69, ceilings *derived* from `GRADE_THRESHOLDS` so they cannot drift from the published bands — and the letter comes off that score exactly as before. Across the 31-document corpus the grade distribution is byte-identical to the letter-cap version. `scorer.test.ts` gained **THE INVARIANT**: a real audit's grade always equals `gradeForScore(overallScore)`, for the document and both published profiles. Nothing in the suite had tied the score to the letter, which is why v1.58.0 shipped green; sabotage-verified by re-introducing that exact bug. Tests 2,069 → 2,074.

### v1.58.1 — 2026-08-07 · Superseded same-day attempt: relabelling the score rather than changing it (not a security release) (entry recorded 2026-08-08)

Recorded because a failed attempt is part of the honest history of how the scoring was corrected. v1.58.0 capped the letter but left the raw score rendering in bold directly beneath the grade circle, so a headline read `D` above `80/100`. This release moved the number into a labelled **Fix progress** panel with a reconciling sentence, on the theory that the two answer different questions and should be shown as different things. It did not work: a reader read "81 of 100" as a percentage grade within minutes, and v1.58.2 replaced it the same day by capping the score itself. The lesson it produced is the one that settled the design and is worth keeping written down — a figure out of 100 beside a letter grade is read *as* the grade, whatever it is labelled. Tests 2,068 → 2,069.

### v1.58.0 — 2026-08-07 · Severity cap on the grade; `/status` answers "why back up anything if nothing is stored?" (not a security release) (entry recorded 2026-08-08)

Two contradictions the tool was showing to the people it exists to help. **The grade is capped by the worst unresolved finding** — Minor at B, Moderate at C, Critical at D. Reported from the field: two shared reports "both have document title issues but look to be graded differently". They did. Renormalizing away inapplicable categories had two confirmed consequences: a single failure dominates a sparse document and is diluted in a rich one (two Word files with the *identical* defect graded B/87 and C/71, one having 7 of 10 applicable categories to average against and the other 3), and four perfect categories outvoted one catastrophic one (two PDFs missing *both* title and language graded **B**, above the Word file with strictly the milder defect). Corpus-wide, 4 documents held an A while carrying an unresolved Moderate and 2 held a B while carrying a Critical. An averaged score cannot express "one thing here is disqualifying", but conformance is pass/fail per criterion, not a mean. Already-shared links self-correct at *serve* time rather than by migration — stored rows stay byte-identical as an agency's evidence, and the stored executive summary is regenerated rather than string-patched, since it *branches* on the grade. **Note this release's cap was on the letter and was corrected onto the score in v1.58.2.** Also: the `/status` backup card and data-retention § 7a now answer why anything is backed up when documents are not stored, both stating what the records **do** carry — a sign-in email, the IP/user-agent log, the file name as uploaded — rather than claiming there is none, because "contains no personal data" would be false and being caught on it once would discredit the rest of the policy. Tests 2,027 → 2,068.

### v1.57.0 — 2026-08-07 · Review follow-through: safety-net gaps and outage legibility (not a security release)

Closes the three coverage gaps the adversarial review found, each verified rather than assumed. A contract test now ties web fixtures to real analyzer output (`apps/web` imports nothing from the analyzer, so a renamed field or changed severity casing would have broken the UI while every web test passed); both report pages' prop bindings are pinned at the source and by a real mount, after sabotage confirmed the old suite caught nothing when `:result="data.report"` became `:result="data"`; and the evidence-link focus gap is fixed, its test written so that reverting either half of the fix fails it — which surfaced that happy-dom does not gate `focus()` on `tabindex`. Operationally, the `/status` HTML view now distinguishes a core outage (qpdf down: nothing can be audited, 503) from an optional degradation (Chromium down: page audits only), via a self-opening engines card and an explicit "Outage — document auditing unavailable" strip; core membership is imported from the status service rather than restated. Tests 1,998 → 2,027.

### v1.56.0 — 2026-08-07 · Whole-app adversarial review; two render-crash guards, verdict coherence (not a security release)

Six independent adversarial reviews (UX, new-surface security, documentation currency, operations, code health, test architecture) and the fixes they produced. Two robustness defects were confirmed by end-to-end reproduction against a running server, both **pre-existing** — the pre-redesign Detailed layout crashed on the same payloads: a non-string element inside a category's `findings[]` threw in `partitionCardFindings`, and an array-like object forged into `scoreProfiles.strict.categories` passed a truthy-`.length` check and threw in `tallySeverity`. Each made a single forged report's own page return 500 permanently; blast radius is one link (the row is read by id, no listing parses stored bodies), no cross-user reach, no data exposure, and the analyzer never emits either shape. Fixed in the shared utilities so old and new components are covered at once. Also closed: the publish-readiness gate on the remediation page was asserted only as source text, so inverting its branches would have kept every test green while telling a user a bad PDF was safe to publish — it is now a pure module with executable tests. The report headline's grade/verdict contradiction (a weighted-average "A" pairing with "not ready to publish", in grade-green) was corrected by letting the blocker lead. CI now gates formatting, and `rebuild.sh` preflights the Node major version. Tests 1,973 → 1,998.

### v1.55.0 — 2026-08-07 · /status HTML cards collapse; always-visible status strip (not a security release)

The status page's HTML view folded its sections into native `<details>` cards (collapsed by default, one-line peeks in the summaries) and gained an always-visible strip — pill, version, humanized uptime, degraded list. Reviewed as zero-new-surface: the JSON body, negotiation rules, and the top-level key allow-list are byte-identically untouched (all 67 pre-existing renderer tests pass unmodified, 12 new ones pin the folds), the page still ships no JavaScript (`<details>` is native, so the nonce-based CSP is untouched), and every strip value renders through the same `escapeHtml` as the tree — including a deliberately hostile `status` string asserted escaped. The one behavioral rule worth stating: a stale backup card pre-opens, so the fold-up cannot hide the page's only actionable warning state. Tests 1,961 → 1,973.

### v1.54.1 — 2026-08-07 · Remediation download moves into the After card with a grade-gated publish warning (not a security release)

Presentation-only change to the remediation results page: the download block (filename options, rename confirm gate, one-time-token download button — all unchanged mechanically) relocated inside the "After Remediation" card beneath the grade and explanations, with a readiness banner that warns below-A results still need fixes before publishing and confirms grade-A results as ready (with an alt-text spot-check nudge). The banner's grade derives from the same strict-profile path as the adjacent ScoreCard, so the two cannot disagree. No new inputs, storage, endpoints, or token behavior; pinned by a source-inspection test. Tests 1,956 → 1,961.

### v1.54.0 — 2026-08-07 · Visual report view + Visual/Detailed toggle (not a security release)

Presentation-layer release, reviewed for new surface before shipping. The redesign is web-only — no analyzer, API, or database change — so the attack surface gained no new inputs, storage, or endpoints. The new components render stored (attacker-controllable) report JSON exclusively through Vue's escaped interpolation; the mapper and every new component array-guard their inputs (non-array `categories`/`findings` render empty rather than 500 — the established forged-report standard), and the reworked HTML-export test now proves escaping on the plan block's real dynamic paths by pushing `<script>` payloads through the Acrobat-steps and unknown-category fallbacks (sabotage-verified: removing any of the three `escapeHtml` calls fails it). URL page audits stored in the same table are structurally excluded from the document-report components, so a category-less report can never render a false "passes" card. The view preference is client-side localStorage only, never serialized to the server. The new UI itself was contrast-audited live during development (105 AA checks passing in dark mode; two step-badge failures found by measurement and fixed before merge). Detailed view remains byte-identical to v1.53.0 as a standing soft rollback, with the `pre-report-redesign` tag as the hard rollback. Tests 1,879 → 1,956.

### v1.53.0 — 2026-08-05 · Code blocks un-mangled sitewide; technical-details enriched (not a security release)

Presentation + one accuracy fix, no behavior change. Root cause worth recording: twelve "code blocks" across the data-retention sections, the homepage technical explainer, and the remediation-deploy snippet were built as `whitespace-pre` styled **divs**, and Prettier — which preserves real `<pre>` elements but knows nothing of a whitespace-sensitive class — had been reflowing their text on every format pass, collapsing SQL schemas, ASCII pipeline flows, auditor queries, and shell commands into single scrolling lines (the shell block was the worst case: comments merged into commands, hazardous to copy-paste). All twelve are now genuine `<pre>` elements (format-proof by construction), multi-line, color-coded with a consistent legend, and `tabindex="0"` keyboard-scrollable. The § 6 schema was re-derived from `migrations.ts` while restoring it, fixing drift (missing `original_filename`, comment-style status enum vs the real `CHECK` constraint). `technical-details.vue` gained four new detailed blocks: the full audit pipeline, a worked weight-renormalization scoring example, the structure-tree DOM, and the four-stage remediation flow with delete-and-verify markers. Tests unchanged at 1,879.

### v1.52.0 — 2026-08-05 · Stale backup promoted into `degraded` (monitoring, not a security release)

The follow-up the v1.50.0 entry promised, now that the nightly cadence is live. `degradedList` takes the backup status: `"stale"` (a backup that succeeded before, now older than `STATUS.BACKUP_STALE_AFTER_HOURS`) appends `"backup"` to `degraded`, flipping the payload to `status: "degraded"` — which the existing UptimeRobot keyword alert matches with **zero monitor-side changes**. The two boundaries from v1.50.0 hold, both pinned by test: `"unavailable"` still does not degrade (a fresh deployment before its first scheduled run must not page), and `isCoreFailure` never considers the backup, so a stale backup cannot produce a 503 (asserted via `payloadIsCoreFailure` under a stale fixture). Residual, documented in the code: deleting `last-backup.json` demotes stale to unavailable and silences the signal — a live nightly job rewrites the file within 24 h, so only the compound failure (file gone *and* job dead) stays quiet. Tests 1,877 → 1,879.

### v1.51.1 — 2026-08-05 · Backup documentation made standing and general (not a security release)

Documentation only. The §Security posture list above gains a standing **Nightly database backups** bullet (nightly cadence, five-newest rotation, on-server location described in general terms, `/status` visibility, drill-tested restore), AGENTS.md's repo map now lists the backup/restore scripts, and the two public surfaces that printed the literal backup directory — the data-retention § 7 row and the v1.50.0 entry below — now describe the location generally ("beside, but outside, the application; unreachable from the web"). Exact-path disclosure invites targeted probing even when the path is not web-reachable, and readers of these surfaces need the guarantee, not the directory name. The operator runbook (`docs/database-backups.md`) deliberately keeps exact paths — its commands must be copy-pasteable — and the CHANGELOG's historical entries are left as written. No code, test, or behavior change.

### v1.51.0 — 2026-08-05 · shared_reports purge + retention decoupled from the remediation flag

Closes two findings from the 2026-08-05 assessment. **Step 8 of the cleanup sweep now deletes `shared_reports` rows past `EXPIRY_DAYS + PURGE_GRACE_DAYS`** (365 + 30 days) — before this, no `DELETE FROM shared_reports` existed anywhere and rows carrying up to 1 MB of `report_json` each (including the document-derived strings § 8a documents) accumulated indefinitely. The grace window is a UX/lifecycle decision, not slack: the read gate answers an informative `410` ("link has expired") only while the row exists, so purging at expiry would collapse every expired link straight to `404`; thirty days preserves the distinction for the realistic re-click window, then the id becomes indistinguishable from one that never existed. The cutoff compares ISO-8601 TEXT lexicographically — the same convention the read gate and dedup lookups already use — and dedup is unaffected by construction (it already filters to unexpired rows).

**`startCleanupInterval()` no longer early-returns when `REMEDIATION.ENABLED` is false.** The gate's comment ("nothing to clean up") was true in v1.18 and false since v1.20.1: with remediation off, the audit_log purge, JTI backstop, and now the shared_reports purge would silently stop between process restarts — and `ecosystem.config.cjs` defaults the flag off when the shell lacks `/etc/environment`, so a bare `pm2 restart` could disable all retention as a side effect. The remediation-specific steps are no-ops when the feature is off (empty-table queries; the orphan scan guards on the output dir existing). Tests pin grace-window survival, idempotency, and the interval firing with the flag disabled. Tests 1,874 → 1,877.

### v1.50.0 — 2026-08-05 · Last-backup row on /status (not a security release)

One read-only addition to an already-public endpoint. The payload gains a top-level `backup` key — added to `statusPrivacy.test.ts`'s allow-list deliberately — read from the `last-backup.json` the backup job writes only after a snapshot passes `integrity_check`. `readBackupStatus` collapses a missing, unreadable, malformed, or failed-integrity file to `"unavailable"`, never a crash and never a fake success; the file's two absolute server paths (`sourcePath`, `snapshotPath`) are deliberately not copied, and a unit test asserts the section can never contain a path. Deliberately **not** wired into `degraded`: a server where backups have never run must not trip the UptimeRobot keyword alert the day the feature deploys — wiring `stale` into `degraded` is a sensible follow-up once the nightly cadence has a track record. The HTML row follows the additive contract (a payload predating the field renders nothing, pinned by test) and escapes every value. Default backup location moved beside the repo checkout — findable in the site folder, outside the git tree and any web root; the API and the shell wrapper derive the same path independently from their own locations, pinned by test on the API side. Tests 1,857 → 1,874.

### v1.49.0 — 2026-08-05 · Nightly DB backups + § 8a storage-verification annex

**Backups.** `apps/api/scripts/backup-db.mjs` takes a nightly snapshot via better-sqlite3's `db.backup()` (SQLite online backup — WAL-safe by construction; a `cp` cron would tear or stale-copy a WAL database, which is why the archived deploy guide's suggestion was never followed). Guards, each pinned by test: `fileMustExist` (a mispointed job can't manufacture an empty DB and back that up), an `audit_log`-presence check (backing up the wrong database fails loudly), `integrity_check` on the snapshot before it's kept, count-based rotation (newest 5, `BACKUP_KEEP_COUNT`) that touches only its own `audit-*.db.gz` files, and an atomically-written `last-backup.json` so staleness is observable. `scripts/restore-db.sh` verifies before touching anything and sets aside the current DB **with its `-wal`/`-shm`** (a stale WAL beside a restored main file corrupts it). Restore drill performed same day: 68 rows → snapshot → verified restore, planted stale-WAL case exercised. Runs via Forge Scheduler as `forge`; DO droplet backups (daily) cover machine loss separately.

**Storage verification (§ 8a).** An evidence-pack sweep of every storage claim: full schema read (7 tables, no BLOB columns anywhere), every `INSERT`/`UPDATE` enumerated and traced, every filesystem write accounted for (8 sites; no `createWriteStream` in the API), dependency check confirming **no request logger exists**, all 41 `console.*` sites reviewed (production logs carry no filenames, emails, or IPs; the dev-only OTP echo is inert under `NODE_ENV=production`), and the single outbound email path confirmed to carry only a login code. **One qualification published rather than papered over:** `shared_reports.report_json` (and remediation jobs' before/after report JSON) persists document-derived strings — metadata fields, image alt-text values, link text and URLs, bookmark titles, form-field names — so the blanket "no document content" claim was narrowed to what the code actually guarantees: no file bytes, no page/paragraph text, no images, no form values, and nothing document-derived at all on the unshared-audit path. Data-retention policy bumped to v1.3. Tests 1,848 → 1,857.

### v1.48.1 — 2026-08-05 · Documentation-accuracy release (not a security release)

No input-handling code changed — the two code edits are a display legend and a config-driven label. The release is security-*relevant* anyway, because several corrected claims were privacy statements: the data-retention policy said IP addresses are never stored (every `audit_log` row records caller IP and user-agent, and always has), claimed indefinite audit-log retention (the sweep purges at 365 days, since v1.20.1), and its § 10 audit register was six releases behind. An auditor-facing policy that under-discloses is a finding in itself; correcting the record is the fix. The policy is now v1.2 with a dated changelog entry disclosing each correction, and every surface that still described veraPDF as remediation-only now reflects the v1.37.0 PDF/UA-on-audit verdict. Tests unchanged at 1,848.

### v1.48.0 — 2026-08-05 · Full red/blue audit (security release)

A standalone audit of the whole application, not a per-release review. **Two findings, both fixed. No critical or high-severity issue.**

**Scope.** Endpoint inventory, authn/authz, injection (SQL and template), SSRF, subprocess execution, DoS and resource limits, secret handling, transport and CSP headers, and the client render path — with a focused pass on v1.44.0–v1.47.0, the least-audited code in the tree.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| R1 | Multer file filter persisted `file.originalname` verbatim — 4,040 chars with raw markup reached `audit_log.filename`, and those rows surface through admin-only `/api/logs` | Low/Medium | **Fixed** |
| R2 | `FILENAME.ALLOWED_CHARS` permits `\s`, which matches `\n`/`\r`/`\t`, so newlines survived sanitisation (pre-existing, affected the success path too) | Low | **Fixed** |

**R1** was not exploitable as stored XSS — no `v-html` renders log data, so Vue's default escaping stood in the way — but it placed untrusted, unbounded text into an authenticated UI with one control between it and execution, via the cheapest request an attacker can make (refused at the filter, so the body is never uploaded). Fixed at the **writer**: `recordRejectedUpload` sanitises internally so no future caller can reintroduce it, `recordAudit` clamps `filename`/`user_agent` to 512 chars as a backstop (length only — `audit-url-page` legitimately stores a URL there), and `routes/analyze.ts` now shares the same exported sanitiser. Confirmed by replaying the original attack against the fixed build: 4,040 → 255 characters, markup stripped, ordinary names untouched.

**R2** was found by the regression test written for R1, not by the audit sweep — a reminder that the test for one finding is a reasonable place to look for the next. Fixed by collapsing whitespace before the allow-list runs, inside the sanitiser rather than by narrowing the shared config regex that `routes/remediate.ts` also uses for on-disk names.

**Verified sound, no change needed.** Auth is fail-closed — `authMiddleware` returns the anonymous sentinel *before* JWT verification when `REQUIRE_LOGIN` is off (so the in-repo dev secret is unreachable as deployed), `adminMiddleware` rejects that sentinel explicitly, and `checkAuthConfig` refuses to boot on a missing or default `JWT_SECRET` when login is on. OTPs use `crypto.randomInt` + bcrypt; JWT verify pins `algorithms: ["HS256"]`. Share IDs are 128-bit random, access tokens 256-bit and SHA-256 hashed at rest. SSRF is defended by manual redirect walking with a private/loopback/link-local check per hop. Every subprocess uses `execFile`, never a shell. All SQL is parameterised; the only interpolations are compile-time constants. CORS is pinned to one origin; CSP carries a per-request nonce with no `script-src 'unsafe-inline'`, and `object-src`/`base-uri`/`frame-ancestors` are `'none'`. 365-day `audit_log` retention bounds the new rejection rows. Only `.env.example` files are tracked, with placeholders.

**The new /status render path is clean.** Every interpolation in the three sections added since v1.44.0 is either `escapeHtml`-wrapped or a number validated through `asCount`; the one unescaped value is a hex colour from the compile-time `GRADE_THRESHOLDS` constant. `detectLegacyFormat` compares eight signature bytes and runs one bounded `Buffer.includes` over at most 8 KB. Tests 1,841 → 1,848.

**Live probe of production + adversarial suite.** A read-only probe of the deployed service and a full adversarial suite — run against an isolated local instance so production traffic and statistics stayed untouched — extended the audit past the code. The application tier defended every attack: 10 SSRF vectors (loopback, `[::1]`, decimal/hex/octal IP encodings, `169.254.169.254`, IPv4-mapped IPv6, `file://`, `gopher://`) all blocked with per-hop redirect re-validation; a 200 MB zip bomb rejected in 0.2 s; billion-laughs entity expansion and XXE (both file-read and external-DTD SSRF callback) inert because `fast-xml-parser` ignores DOCTYPEs; 12 concurrent analyses drained cleanly; the remediation audit-gate, admin authorization, pagination clamp, and 1 MB body cap all held; a forced 500 leaked no stack or path.

Three findings, all in the Forge-managed nginx vhost, all **fixed and verified live** — no application change:

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| L1 | HSTS absent on the Nuxt frontend (helmet set it only on the Express API) | Low | `add_header Strict-Transport-Security … always` at the edge, covering both tiers |
| L2 | Conflicting `X-Frame-Options` on the frontend — `DENY` (app) vs `SAMEORIGIN` (nginx), which some browsers treat as invalid | Informational | removed the nginx line; the app's own value stands, CSP `frame-ancestors 'none'` is the authoritative control |
| L3 | Security headers missing on nginx error pages (`add_header` without `always` skips 4xx/5xx) | Low | added `always` |

The deprecated `X-XSS-Protection` line was dropped in the same edit. **The header changes are CORS- and API-neutral** — they are browser response directives that a server-to-server caller (e.g. the icjia-fleet-audit integration hitting `/api/audit-url`) ignores; the `/api/` proxy, the 110 MB body cap, and the app-level CORS were untouched, confirmed by an unchanged `204` preflight and a still-processing `POST` after the reload. Confirmed sound at the edge besides: TLS 1.3 / AES-256-GCM, API port not externally reachable, `.git`/`.env` denied, no source maps shipped, `http→https` redirect in place.

### v1.47.0 — 2026-08-05 · Status-page label disambiguation (not a security release)

Presentation and naming only. No new input, no new write path, no query or scoring change — the renamed bucket is the same `COUNT(*)` under a clearer key, and the new section renders figures the payload already carried.

The one thing worth recording is the class of defect this fixes, because it is not the kind a test catches: every number on the page was correct, every bucket reconciled, and the page was still misleading. Two catch-alls named `other`, one structurally near-zero and one genuinely populated, sat on the same page with nothing to indicate they answered different questions — so a reader's only available inference was that one of them was broken. Correct-but-unreadable is a real defect in a page whose entire purpose is to be read by people who cannot audit the query themselves, and it was reported by a reader, not by the suite. The fix is naming and labelling, and the tests added assert the *distinguishability* rather than the arithmetic. Tests 1,833 → 1,841.

### v1.46.0 — 2026-08-04 · Refused-upload counts on /status (not a security release)

One new aggregate on an already-public endpoint, plus a new write path into `audit_log`. No new input is accepted and nothing new about a file is stored — a rejection row holds the filename, the event type, and a timestamp, the same columns an audit row already used.

The finding worth recording is the one that shaped the design. `hasRecentAudit` — the gate that stops anyone remediating a document they have not audited — matches on `content_hash + email` with **no `event_type` filter**. Writing refusals into the same table with a hash would therefore have made *"this content was refused"* a valid answer to *"has this content been audited?"*. Exploitability would have been low (the remediation route independently requires a real PDF header), but the invariant would have been broken, and low-exploitability-today is how latent bugs are made. Rejection rows write `content_hash` NULL, which cannot match under SQL equality — a structural fix rather than a filter someone must remember. A test probes the gate's own query with three hashes, including the empty string, so a future `COALESCE` or `IS NOT DISTINCT FROM` there fails loudly.

The second guard is categorical: `REJECTION_EVENT_TYPES` is disjoint from `DOCUMENT_EVENT_TYPES` and `PAGE_EVENT_TYPES`, asserted directly rather than only observed, so refusals cannot inflate the audit total or contaminate the grade distribution. Privacy posture is unchanged: filenames are consumed by the bucketing `CASE` inside SQLite and never cross the module boundary, and the one new top-level key was added to the `statusPrivacy.test.ts` allow-list deliberately. Tests 1,815 → 1,833.

### v1.45.0 — 2026-08-04 · Legacy Office + CSV rejection copy (not a security release)

Rejection messages only. No new format is accepted, parsed, or scored, and no status code or response shape changed.

The one addition that touches untrusted input is `detectLegacyFormat`, and it was scoped to stay boring: it compares eight signature bytes and runs a bounded `Buffer.includes` over at most the first 8 KB, with no allocation proportional to input, no loop over attacker-controlled counts, and no container parsing. A deliberate non-goal is the obvious "improvement" — walking the CFB directory properly — which would add a real binary parser over hostile input in exchange for nothing but a more precise sentence. A name past the 8 KB bound degrades to the generic legacy-binary message, which is the intended trade and is pinned by test.

Legacy extensions are still rejected at the multer filter rather than accepted-then-sniffed, so the change does not widen how much untrusted data is buffered. The content sniff runs only on the failure path, after `detectFileType` has already returned null, so it adds nothing to a normal upload. Copy is a module constant in `@file-audit/shared` — no user input is interpolated into any of these messages. Tests 1,787 → 1,815.

### v1.44.0 — 2026-08-04 · Status-page grade distribution (not a security release)

One read-only aggregate added to an already-public endpoint. No new input is accepted, nothing new is stored, and no scored result changes.

The new `by_grade_*` fields are `GROUP BY` counts over `audit_log.grade` — the same privacy class as the `by_format_*` counts that preceded them, and subject to the same guarantee: no filename, email, IP, or user-agent participates, and grades are bucketed by a fixed `CASE` whose output is assigned only onto keys the result struct already declares, so a database value can never inject a property. The keys are nested inside `documents_audited`, so `statusPrivacy.test.ts`'s top-level allow-list is untouched and monitors read byte-identical output.

The one judgement call worth recording is editorial rather than technical: an aggregate like "62% F" invites being quoted as a population statistic about an agency's documents, which it is not — the corpus is self-selected and includes repeat uploads and test files. Publishing the number without stating the sampling would make the page a source of a misleading claim, so the caveat is rendered above the figures and pinned by test in both the section and the assembled page. Tests 1,764 → 1,787.

### v1.43.0 — 2026-08-04 · Status-page back link + leave warning (not a security release)

Two client-side UX changes, no new server surface, no change to any payload, stored value, or scored result.

The `/status` HTML view gained a link back to the audit tool, and the header **Status** link now opens in the same tab. The back link's label and both hrefs are passed into the renderer and run through the same `escapeHtml` as every other value on the page, asserted by test — they are our own config values today, which is exactly why they would be easy to leave unescaped and easy to inherit a gap from later. The machine contract is untouched: `/status`, `/status?json`, and any wildcard-`Accept` request return byte-identical JSON with the same status codes, so a monitor's keyword alert on `degraded` is unaffected. Re-verified against the built server with the API deliberately stopped so the degraded path was exercised too.

A **navigation warning** now protects an audit in progress, covering `beforeunload` (document navigations, reload, tab close), a Vue Router guard (in-app links), and `goAnalyze` (the site-title reset, which trips neither hook because it targets the route it is already on). It is silent unless an audit is actually running, and the flag clears on unmount so a confirmed departure cannot leave it stuck. The prompt is the browser's native dialog — no new markup, no focus-trap or `aria-modal` implementation to get wrong, and correct assistive-technology semantics for free. No user input is rendered by any of it: the message is a module constant. All branches verified in a live browser (idle → 0 prompts; running → cancels, blocks on "no", proceeds on "yes"). Controls corpus unchanged. Tests 1,748 → 1,764.

### v1.42.1 — 2026-08-03 · In-site `/status` links request their view explicitly (not a security release) (entry recorded 2026-08-08)

Every link to `/status` from the site — the header link and both announcement entries — now points at `/status?html`, and the in-page toggle and `Link` header use the short `?json`/`?html` forms. Browsers already received HTML through `Accept` negotiation, so nothing a visitor sees changes; it makes the intent legible in the markup and survives any future change to how negotiation works, so no header behaviour can silently hand a monitor the wrong representation and blind a keyword alert. `?format=json|html` still works. Pinned by test, including that no announcement entry links to the bare `/status`. Tests 1,747 → 1,748.

### v1.42.0 — 2026-08-03 · Human-readable HTML view of `/status`; explicit `?json` for monitors (not a security release) (entry recorded 2026-08-08)

`/status` renders as a syntax-coloured, collapsible JSON tree for browsers while machines keep exactly the JSON they had. **The machine contract is unchanged**: JSON remains the default for anything not unambiguously a browser, only an explicit `text/html` in `Accept` selects the HTML view, and a wildcard `Accept` — what UptimeRobot and curl send — still receives JSON. The payload is byte-identical and the top-level key allow-list in `statusPrivacy.test.ts` is untouched; the HTML view is advertised through a `Link: </status?format=html>; rel="alternate"` **header** rather than a payload field, because adding a field would have changed the payload every monitor reads. **The page contains no JavaScript** — collapsing uses native `<details>`/`<summary>` and the toggle is an ordinary link, which keeps it clear of the app's nonce-based CSP (`script-src` has no `'unsafe-inline'`) and works with JS disabled, plausible for someone poking at an unfamiliar status URL. Every key and value is HTML-escaped, asserted by test, even though nothing in the payload is currently attacker-shaped. Tests 1,725 → 1,747.

### v1.41.2 — 2026-08-03 · `rebuild.sh` re-execs after `git pull` so a deploy runs the code it fetched (deploy-script fix) (entry recorded 2026-08-08)

`rebuild.sh` pulled a new copy of *itself* and kept executing the old one. bash reads a script lazily by byte offset rather than reading it whole up front, so when `git pull` rewrote `rebuild.sh` mid-run, bash continued from its saved offset into the **new** contents. Observed symptom: the v1.41.1 deploy fetched the fixed smoke checks but ran the v1.41.0 ones. The worse, unobserved case is the offset landing mid-line and bash executing a fragment of a command. The script now re-execs once, immediately after the pull and only when the pull actually moved `HEAD`, with a guard variable preventing recursion and the pre-pull SHA carried across so the failure banner still prints a rollback target predating the deploy. Verified by simulation: re-execs exactly once when `HEAD` moves, not at all when it does not.

### v1.41.1 — 2026-08-03 · Post-deploy smoke checks reported false failures against a healthy deploy (deploy-script fix) (entry recorded 2026-08-08)

Both bugs were in the deploy script's self-check only; **no application code was involved and production was healthy throughout**, verified live during diagnosis. `pm2 restart` returns as soon as the process is *spawned*, not when it is accepting connections, so the probes were measuring the script's own impatience and reporting `502`; they now wait for `/healthz` to answer 200 (2s intervals, 60s ceiling) and say explicitly when they gave up, so a slow start is not mistaken for a fault. Separately, `-X HEAD` leaves curl waiting for a body a HEAD response never sends, so it blocked until `--max-time` and printed the real code *concatenated* with the `|| echo "000"` fallback — the nonsense `502000`. Now `--head`, and an absent response reads as a clean `000`. The `robots.txt`/`favicon.ico` 404s the checks reported were **real** — an nginx configuration issue on the droplet, resolved on the server the same day.

### v1.41.0 — 2026-08-03 · Header cleanup + keyboard fix + deploy smoke checks (not a security release)

Adds a **Status** link to the header (a plain `<a>`, never a `<NuxtLink>` — `/status` is a Nitro server route, and a NuxtLink renders the SPA 404 without contacting the server; pinned by test). Removes the redundant **Analyze** links from both the desktop nav and the mobile dropdown: clicking the site title clears results and starts a new file. Because that title is now the *only* reset path, it was changed from a bare `<h1>` + `@click` — no focus, no Enter activation, no role — to an `<a href="/">` inside the `<h1>`, restoring keyboard operability (**WCAG 2.1.1**). `rebuild.sh` gained non-fatal post-deploy smoke checks covering `/healthz`, `/status` (GET and HEAD), `/robots.txt` and `/favicon.ico`.

**`/robots.txt` and `/favicon.ico` 404'd in production — an nginx issue, not a repo one. RESOLVED 2026-08-03.** Working assets returned `etag`/`last-modified` (served by Nitro through the proxy); these two returned nginx's own HTML 404 with no etag — the diagnostic that identified the layer. They are exactly the two paths in Laravel Forge's default vhost template (`location = /favicon.ico`, `location = /robots.txt`): an exact-match `location =` outranks the catch-all `proxy_pass`, and with no `proxy_pass`/`try_files` inside, nginx answers 404 itself and never forwards. Both blocks were deleted from the production vhost and nginx reloaded; `/robots.txt` now serves `200 text/plain` with every `Disallow` intact. This also closed the unexplained `/favicon.ico` 404 open since v1.28.0 — same root cause.

### v1.40.3 — 2026-08-03 · `/status` and `/healthz` answer HEAD (monitoring fix, not a security release)

Both were Nitro `*.get.ts` route files, so Nitro matched only GET and returned **404 to HEAD** — the method several uptime monitors, UptimeRobot included, send by default. A monitor configured that way would report the service down while it was healthy. Both files are now unsuffixed (`status.ts`, `healthz.ts`), matching any method, with an explicit guard narrowing back to GET/HEAD and `405 Allow: GET, HEAD` for anything else. HEAD runs the **real probe** rather than short-circuiting, so the code reflects reality; verified against the built server (API down → GET and HEAD both 503; API up → both 200; POST/DELETE → 405). `X-Robots-Tag` is still set on every response. Express's `/api/status` already handled HEAD automatically, so no API change was needed.

### v1.40.2 — 2026-08-03 · Scoring moved to the footer (not a security release)

The Scoring Rubric dialog's trigger moved from the header nav to the footer link row; the dialog content is unchanged. Also corrected a comment and test rationale from v1.39.2 that wrongly claimed the header's `<nav v-if="user">` never renders for anonymous visitors — `/api/auth/me` returns `{ "email": "anonymous" }` rather than `null` while `AUTH.REQUIRE_LOGIN` is false, so `user` is truthy and the nav does render. The "What's New" placement outside that nav remains correct, but because enabling login (or changing the anonymous sentinel to `null`) would silently hide anything inside it — not for the reason originally stated.

### v1.40.1 — 2026-08-03 · Last fixable advisory cleared (`esbuild`)

Pins `esbuild` to `^0.28.1` (was 0.27.3), closing a low-severity arbitrary-file-read advisory in esbuild's *development* server — not a surface this application exposes in production. The override costs nothing: Vite 7.3.6 already declares `^0.27.0 || ^0.28.0` and 0.28.1 was present via nitropack; only `@nuxt/fonts` still held 0.27.3. The tree now resolves to one esbuild version. One advisory remains open and is **not actionable** — a medium-severity `@nuxt/ui` issue (`UAuthForm`/`UForm` SSR markup omits `method`) with no patched version published. It does not apply here: this app uses `UFormField`, not `UForm`/`UAuthForm`, and only on the login page, which is inert while `AUTH.REQUIRE_LOGIN` is false.

### v1.40.0 — 2026-08-03 · Dependency security release — every open advisory cleared

Resolves all ~25 open Dependabot advisories, including high-severity issues in `postcss`, `tar`, `brace-expansion`, `shell-quote`, `ws`, `js-yaml`, `lodash`, `linkify-it`, `picomatch`, and `vite`. Every one was **transitive** — a dependency of build tooling (nuxt, nitropack, puppeteer, `@nuxt/ui`), not of application code.

Dependabot's repeatedly-failing runs were the symptom, not a broken CI job: it reported `security_update_not_possible` (e.g. postcss `latest-resolvable-version: 8.5.8` vs `lowest-non-vulnerable-version: 8.5.18`) because it bumps a transitive package in isolation against the *locked* tree. The declared ranges already permitted the fixes; the lockfile had simply never been refreshed. Resolved with explicit `pnpm.overrides` pinning each package to its lowest non-vulnerable version, using version-scoped keys (`brace-expansion@2`/`@5`, `picomatch@2`/`@4`, `h3@1`, `vite@7`) where two major lines legitimately coexist. Direct bumps: `fast-xml-parser` 5.9.3 → 5.10.1, `sharp` 0.34.5 → 0.35.0, `svgo` 4.0.1 → 4.0.2.

**Framework versions were deliberately held.** A blanket `pnpm update -r` clears the advisories but also performs in-range minor upgrades (`nuxt` 4.4.7 → 4.5.1, `@nuxt/ui` 4.5.1 → 4.10.0); Nuxt 4.5.1 pulls `unhead` 3, which drags in `h3@2.0.1-rc.26` — a release candidate — leaving two incompatible `H3Event` types and failing `pnpm typecheck` on every Nitro route including the pre-existing `/healthz`. A Nuxt upgrade belongs in its own release with its own testing.

`fast-xml-parser` is the XML engine behind every DOCX/PPTX/XLSX check, where a behaviour change would move scores silently rather than throw. Verified by auditing the four OOXML controls on both versions — identical results (92/A, 80/B, 90/A, 90/A). Also adds `last_audit_at_chicago` to `/status`, derived from the UTC value so the two cannot disagree.

### v1.39.3 — 2026-08-03 · `/status` aggregate cache 60s → 5s (not a security release)

Auditing a document and then loading `/status` showed the count unchanged for up to a minute, which reads as the page being broken rather than cached. The 60s value had mistakenly applied the engine-probe cost reasoning to queries with no such cost — a `COUNT(*)` over a few thousand rows is sub-millisecond, and a flood is already bounded by the endpoint's own 120/min per-IP limiter. The **engine-probe cache stays at 10 minutes**: those spawn a veraPDF JVM, and their cost must remain decoupled from monitor poll frequency. No change to what is counted or published.

### v1.39.2 — 2026-08-03 · "What's New" in the header and footer (not a security release)

v1.39.1 added the `/announcements` archive but linked it only from the announcement banner, which shows one entry and is permanently dismissible — so the archive vanished at exactly the moment it became useful. "What's New" now appears in the header and footer, both of which render on every page regardless of banner state. The header link sits **outside** the `v-if="user"` nav: `AUTH.REQUIRE_LOGIN` is false, so that block never renders for ordinary visitors and a link placed inside would have been invisible to essentially everyone while looking correct in review. A test asserts the placement. No data-handling, retention, or authentication change.

### v1.39.1 — 2026-08-03 · Banner link hotfix + announcement archive (not a security release)

The v1.39.0 banner link to `/status` rendered the SPA 404. `/status` is a Nitro **server** route, so the Vue router has no match for it and an ordinary `<NuxtLink>` navigates client-side, never contacting the server — visiting the URL directly always worked, which disguised a link bug as a deploy failure. Announcement entries now carry `linkExternal`, required for any target that is a server route, with both states pinned by tests. Also adds `/announcements`, an archive of past banner entries (the banner shows one entry and is permanently dismissible, so prior updates were otherwise unreachable). No data-handling, retention, or authentication change; the archive renders only notices already published on the home page.

### v1.39.0 — 2026-08-03 · Public `/status` endpoint — reviewed for disclosure (not a security-fix release)

v1.39.0 adds one unauthenticated, read-only endpoint: `GET /status` on the web tier, reporting per-tier health, live engine checks (qpdf, veraPDF, Chromium), API uptime, and aggregate document-audit counts split by format. Because it is public, the review focused on what it discloses. Every published figure is an aggregate `COUNT(*)` or a boolean about a local engine: no filename, email, IP, user-agent, content hash, score, or grade appears, and filenames are consumed by the by-format `CASE` expression inside SQLite so they never cross the module boundary. Probe failures collapse to a closed reason enum rather than echoing subprocess stderr, which routinely embeds absolute paths — the same leak class v1.38.0 fixed for veraPDF. Both properties are enforced by `statusPrivacy.test.ts`, which seeds identifying values and fails the build if any reaches the payload, plus an allow-list assertion on the top-level key set. Rate limiting: `/api/status` is exempt from the global limiter (whose single loopback bucket ordinary traffic could exhaust, 429-ing the status page exactly when someone is checking on the service) and carries its own 120/min per-IP cap. Indexing: excluded via `robots.txt` **and** `X-Robots-Tag`, since the former is advisory and the latter is not. Two fixes landed during the review — probing `QPDF_BIN` rather than a bare `qpdf`, which would have reported a false *outage* wherever PATH lacks the fallback directories (the normal case under PM2), and passing `ignoreResponseError` so a core-failure 503 reaches the caller with its diagnosis intact instead of being flattened to `"api":"down"`. No endpoint authentication, retention window, or data-handling path otherwise changed.

### v1.38.2 — 2026-07-26 · Second PDF/UA panel moved below the blocking issues (not a security release)

Presentation only, completing v1.38.1. The "PDF/UA-1 signals (ISO 14289-1)" card is rendered by `ScoreCard`, so it sat inside the score hero — above the critical-issues banner — and was missed by the v1.38.1 reorder. Both PDF/UA surfaces are now grouped below the issues (`ScoreCard` gained `showPdfUaSignals`, default `true`, so the remediation before/after cards are unchanged), and the card now states that meeting the structural essentials does not mean the document is accessible whenever Critical issues remain. No new attack surface; the added markup interpolates an integer count derived from server-side severity labels, no user input is rendered. No network, storage or scoring change; pre-existing posture re-verified. Controls corpus unchanged. Tests 1,637 → 1,644.

### v1.38.1 — 2026-07-26 · Report ordering — blocking issues above the informational PDF/UA panel (not a security release)

Presentation only: the critical-issues banner and the issues-to-fix list moved above the PDF/UA-1 (veraPDF) panel on both the audit page and shared reports, and a veraPDF "Pass" alongside unresolved Critical WCAG issues now says so explicitly instead of rendering a bare green tick. Rationale: the two checks answer different questions — PDF/UA-1 verifies formal tagging, the WCAG grade reflects real usability — so a Pass can legitimately coexist with Critical failures, and showing it first invited authors to stop reading. No new attack surface introduced; no user input is rendered by the changed markup (the caveat interpolates an integer count derived from server-side severity labels), no network, storage, or scoring change, and pre-existing posture re-verified. Controls corpus unchanged. Tests 1,624 → 1,637.

### v1.38.0 — 2026-07-26 · Audit-algorithm review — **security release** (DoS, secret inheritance, path disclosure) + verdict-integrity fixes

A fresh-eyes review of the audit algorithms, with fixes for the five defects it confirmed. Three carry security weight:

- **Event-loop DoS via a crafted structure tree (fixed).** The structure tree is an object *graph*, so a `/K` entry may name an ancestor (cycle) or two elements may share a child (DAG). Four walkers — `calculateTreeDepth`, `analyzeList`, `analyzeTable`, `buildPageRefToNum` — resolved indirect references with no visited-set, re-expanding every *path*: cost grew exponentially in the depth cap, not linearly in the object count. Measured on the unguarded code, a **three-object** cyclic tree took `calculateTreeDepth` **9 s** at fanout 2 and never returned at fanout 3. This work runs synchronously in the main Express process — only the qpdf subprocess and pdfjs were time-boxed — so one small upload could block the event loop for every request including `/healthz`, and the semaphore slot was never released. `max_memory_restart: 512M` would **not** have caught it: a blocked loop does not grow the heap. The 15 MB upload cap is no defence — the payload is a handful of objects. All four now carry the same guard the other four walkers already had; all 23 control PDFs report byte-identical depths, so real documents are unaffected.
- **veraPDF inherited the API's secrets (fixed).** `buildChildSpawnEnv()` (RB2-d / RB3-2) is applied to qpdf and to the OOXML and remediation workers precisely because they parse attacker-controlled bytes; veraPDF — a JVM parsing hostile PDFs, and on the *main* audit path for every PDF upload since v1.37.0 — was missed, inheriting `JWT_SECRET`, `API_PRIVILEGED_TOKEN` and SMTP credentials on each one.
- **Unbounded JVM concurrency (fixed).** veraPDF runs via `Promise.all` alongside `analyzeDocument`, and only the latter takes the 2-slot analysis semaphore, so every in-flight request spawned its own JVM on a box sized for two ~50 MB analyses; the analyze limiter bounds *rate* (500/hr/IP), not *concurrency*. It now has its own budget (`REMEDIATION.VERAPDF_MAX_CONCURRENT`, default 2), acquired **before** the temp write so a queued caller costs neither a JVM nor a disk copy, and degrades to a hidden panel rather than failing the audit. PM2 runs fork mode with one instance per app, so the in-process bound is genuinely process-wide.
- **Path disclosure (fixed).** veraPDF's `Command failed: <binary path> … <temp path>` message was returned verbatim as `pdfUaVerdict.error` — serialized to the client by `routes/analyze.ts` and persisted into shared reports, which `reportSanitize` does not touch. The detail now goes to the server log only.

Verdict-integrity fixes in the same release (no security weight, but they change results): an empty `StructTreeRoot` no longer buys a clean WCAG verdict; content images never tagged as `<Figure>` are now scored and failed instead of returning N/A; a Catalog-inline `StructTreeRoot` is no longer invisible to the depth, heading-order and MCID walkers. See CHANGELOG 1.38.0 for the full reasoning and the score-change note. Controls corpus: 19 of 23 byte-identical, 4 changed. Tests 1,594 → 1,624.

### v1.37.5 — 2026-07-23 · "Don't Panic" chip attribution + keyboard/touch reach (not a security release)

UI only: the chip became a real `<button>` with `aria-expanded` that discloses an on-page Douglas Adams credit, replacing a `title`-only tooltip that was unreachable by touch and unannounced to screen readers. Static text — no user input is rendered, so no new injection surface; no network, storage, or scoring change. Controls corpus unchanged. Tests 1,591 → 1,594.

### v1.37.4 — 2026-07-23 · veraPDF panel copy polish (not a security release)

UI copy only: the veraPDF verdict reads "Additional checks could be addressed" instead of "Fail," and the "Don't Panic" reassurance badge is larger on its own line with a fuller hover reference. No new input-handling, network, storage, or scoring surface. Controls corpus unchanged. Tests unchanged at 1,591.

### v1.37.3 — 2026-07-23 · veraPDF panel reassurance + fix-hint safety (not a security release)

UI only: a grade-aware "Don't Panic" explainer reconciling a veraPDF PDF/UA-1 Fail with the WCAG grade (reassurance shown only when the grade is good), and a corrected CIDSet fix hint that no longer recommends tag-stripping re-distilling. No new input-handling, network, storage, or scoring surface — the reconciliation is a pure function of the grade + verdict already produced. Controls corpus unchanged. Tests 1,584 → 1,591.

### v1.37.2 — 2026-07-23 · veraPDF verdict number reframe (not a security release)

UI + verdict data-shape only: the veraPDF PDF/UA-1 panel now leads with the distinct-rule-type count instead of the raw per-occurrence failure sum, adds a gated Pareto callout, and sorts its failure list by count before truncation (recording an optional `distinctRuleCount`; legacy reports fall back to the shown-list length — no schema change). No new input-handling, network, storage, or scoring surface — the reframe is a pure function of the verdict already produced, and the sort/count change is internal to veraPDF result extraction. Controls corpus unchanged. Tests 1,572 → 1,584.

### v1.37.1 — 2026-07-22 · PDF/UA panel enhancements (not a security release)

UI-only follow-up to v1.37.0: per-checkpoint fix hints on the veraPDF verdict panel, and a deterministic "N of 6 PDF/UA-1 essentials met" readiness headline on the signals card. No new input-handling, network, storage, or scoring surface — the fix hints are a pure function of the rule text already in the verdict, and the readiness rollup is computed from signals the audit already produces (no veraPDF). Controls corpus unchanged. Tests 1,557 → 1,572.

### v1.37.0 — 2026-07-22 · PDF/UA-1 (veraPDF) verdict on audits (not a security release)

Adds an informational PDF/UA-1 machine-check verdict (veraPDF) to the audit and saved-report pages. Reviewed for new surface before shipping: veraPDF runs read-only against a short-lived temp copy (its own, same pattern and lifecycle as the already-disclosed qpdf temp copy — written and deleted within the same request), never throws, and is bounded by a 30 s audit-time timeout (`VERAPDF_AUDIT_TIMEOUT_MS`) so it can't stall the request. The verdict is a standalone field that does not change the Strict grade or any scored category (controls corpus 0/23 changed). The persisted verdict rides the existing whole-result JSON store and carries no URLs, so it adds no stored-XSS surface — all values render through escaped interpolation, and the only link is the server-configured veraPDF homepage. Config-gated on `REMEDIATION_VERAPDF_PATH`; absent on a tier, the panel is hidden. Tests 1,544 → 1,557.

### v1.36.3 — 2026-07-22 · Orphaned list/table phantoms (accuracy patch, not a security release)

Follow-on to v1.36.2 (same root cause, same reporter, same file). The qpdf walk collected every object carrying `/S` regardless of struct-tree reachability; v1.36.2 pruned only orphaned `<Figure>`, so `controls/2022-DVFR-Annual-Report-A0.pdf` still counted 27 orphaned `<L>` phantoms (reported as "incomplete structure", and a false WCAG 1.3.1 malformed-list conformance failure) plus 3 orphaned `<Table>` objects. The reachability gate (`structReachable` — carries a `/P` or is named in some `/K`, built in a pre-pass with a `docHasStructTree` guard so untagged documents are never pruned) now covers `<Figure>`, `<L>`, and `<Table>` alike. Signal counts (headings, paragraphs, MCIDs) are not gated — no control document carries orphaned ones. No new input-handling path or attack surface. Verified against the 23-document controls corpus: 22 byte-identical, A0 96/A → 100/A (lists 71 → 44, tables 5 → 2, `table_markup` 70 → 100, conformance failures 1 → 0). Tests 1,541 → 1,544.

### v1.36.2 — 2026-07-22 · Orphaned-figure false-positive accuracy patch (not a security release)

Prompted by a user-reported PDF (`controls/2022-DVFR-Annual-Report-A0.pdf`) that scored 89/B on a false "3 of 6 images missing alt text" finding. The qpdf walk collected every object carrying `/S /Figure`, including orphaned struct objects unreachable in the live structure tree (no `/P` parent and named by no element's `/K`) — export leftovers from InDesign/Acrobat that assistive technology never encounters. Those phantom figures are now excluded (a figure survives only if it carries a `/P` or is named in some `/K`), and a document whose only painted images all sit inside `/Artifact` runs now reports a clean "all images are decorative artifacts" N/A instead of the "images detected but no `<Figure>` tags" manual-review advisory (via pdfjs's new `nonArtifactImageCount`). No new input-handling path or attack surface — a parsing-accuracy change only. Verified against the 23-document controls corpus: 22 byte-identical, the reported file 89/B → 96/A. Tests 1,537 → 1,541.

### v1.36.1 — 2026-07-19 · Static-XFA and indirect-reference accuracy patch (not a security release)

Prompted by a real accessible static-XFA form that v1.36.0 scored 90/A with a refused verdict. The "XFA → incomplete" rule now applies only to dynamic XFA (`/NeedsRendering`) — static XFA's conventional content is what viewers display and is audited normally; indirect catalog references (`/Lang`, `/DisplayDocTitle`) are resolved instead of read as raw "N 0 R" strings; the reading-order lower bands are Moderate manual-review signals rather than Critical; and `/Headers`-associated tables no longer lose points for redundant missing `/Scope`. All 22 prior control documents unchanged; the XFA form now scores 96/A with a clean verdict. Tests 1,528 → 1,537.

### v1.36.0 — 2026-07-19 · Accuracy & verdict-integrity release across all four formats (not a security release)

v1.36.0 implements the full accuracy review of the audit algorithms (P0–P2): the conformance gate no longer asserts confirmed WCAG failures from defaulted or unresolved values, and one severe silent pass is closed. Highlights: PDFs whose legacy encryption denies assistive-technology access are now caught (they previously scored 100/A clean); short born-digital PDFs are no longer called "scanned images"; DOCX/PPTX contrast is judged only against backgrounds actually resolved from the file (dark table headers and designed slide layouts no longer fail 1.4.3 at "1:1"); Word text boxes are no longer "images missing alt text"; per-run slide languages satisfy 3.1.1; Excel link text is read from the linked cells; reading-order divergence is routed to manual review instead of a confirmed 1.3.2 (draw order is not reading order); layout-like tables, hidden sheets/slides, hidden form fields, and XFA placeholders no longer drive verdicts. Cross-format equity: one link-text doctrine (raw URLs advisory everywhere), one alt-text convention, proportional deductions with floors/caps, and title/no-headings parity. Coverage additions: headers/footers/footnotes, field-code hyperlinks, legacy VML images, chartsheets, custom heading styles (outlineLvl/basedOn), style-level and master-inherited lists, group-level alt, DisplayDocTitle. Verified against the 19-document controls corpus: PDF scores essentially unchanged (±3), decks/workbooks shed only their false confirmed failures. Tests 1,418 → 1,528.

### v1.35.0 — 2026-07-19 · /healthz aggregate uptime endpoint (not a security release)

v1.35.0 adds one unauthenticated, read-only endpoint: `GET /healthz` on the web tier loopback-probes the API's existing `/api/health` and answers 503 unless both processes are up, so a single external uptime monitor covers both. Reviewed for information disclosure and signal integrity before shipping: the response carries only per-tier up/down status and the API process's uptime string — no user data, filenames, or report contents (nothing beyond what the already-public `/api/health` exposed); the probe is read-only with a 3 s timeout and no retries; and a 429 from the API's own rate limiter counts as alive, so flooding `/healthz` cannot fabricate an "API down" alert (the probe shares the API's loopback rate bucket). No endpoint authentication, retention window, or data-handling path otherwise changed.

### v1.34.0 — 2026-07-12 · Preventive hardening: OOXML zip limits, session revocation, job-status authorization, schema migrations

A prioritized backlog from a whole-application structural and tooling review (five independent passes covering test/lint/CI gaps, code organization, and low-severity security hardening) produced five defensive improvements, covered below. None responds to a confirmed vulnerability or observed exploitation — each narrows a theoretical gap before it could be exercised. The same review also extracted the audit engine into its own `@file-audit/analyzer` package (behavior-frozen; see [Project Structure](#project-structure)) and added GitHub Actions CI running lint, typecheck, build, and all three test suites on every push/PR. **1,410 tests pass across all three workspaces (API 876 / Web 485 / CLI 49); `tsc --noEmit` (`apps/api`, `packages/analyzer`) and `nuxt build` clean.**

**Hardening applied in v1.34.0:**

- **Aggregate OOXML zip limits.** `assertZipWithinLimits()` (`packages/analyzer/src/ooxml.ts`) checks the total ZIP entry count (`OOXML.MAX_ZIP_ENTRIES`, 10,000) and the summed declared uncompressed size across every part (`OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES`, 512 MB) immediately after `JSZip.loadAsync`, before any part is read. The existing per-part `MAX_UNCOMPRESSED_BYTES` cap already bounded any ONE part; this closes the aggregate gap — many separately-legal-sized parts, or an extreme number of tiny entries — across all three OOXML formats (`.docx`/`.pptx`/`.xlsx`) uniformly.
- **DOCTYPE rejection in OOXML XML parts.** `parseXml()` (`ooxml.ts`) now returns an empty parse for any part whose raw text matches `/<!DOCTYPE/i`, before the text ever reaches `fast-xml-parser`. Real Word/PowerPoint/Excel parts never legitimately carry a DOCTYPE, so this is zero-cost for real documents; it sits belt-and-braces alongside fast-xml-parser 5.9.3's own entity-expansion defenses (verified independently: the library already throws on external/parameter entity declarations and never resolves a self-referencing internal entity).
- **Server-side JWT session revocation.** Logout now writes the session token's `jti` to a `revoked_jtis` table (migration 10); `authMiddleware` rejects any subsequently presented token whose `jti` is denylisted, even though the JWT's own signature and `exp` are otherwise still valid — closing the gap where a captured token remained usable after logout until natural expiry. Tokens issued before this shipped carry no `jti` and are simply unaffected by the new check — they still expire on their original schedule.
- **Remediation job-status/receipt authorization.** `GET /api/remediate/:id/status` and `/receipt` now require the job's own download token whenever the request is anonymous (`!AUTH.REQUIRE_LOGIN || !job.email`) — previously these reads had no authorization check in that mode. A missing or wrong token returns 404 (not 401/403) so a caller can't distinguish "wrong token" from "no such job." The logged-in owner-match path is unchanged.
- **Numbered SQLite migrations.** Schema changes are now an ordered `MIGRATIONS` array keyed on `PRAGMA user_version` (`apps/api/src/db/migrations.ts`), replacing inline probe-then-`ALTER` blocks in `sqlite.ts`. A legacy-fast-forward path detects an already-provisioned production database (one that ran the old inline code before `user_version` tracking existed) and jumps straight to the correct baseline version without re-running any `ALTER` — avoiding the exact failure mode (`ALTER TABLE ADD COLUMN` on a column that already exists throws in SQLite) that would otherwise crash the API on deploy.

<details>
<summary><strong>Previous security reviews</strong> (per-release, v1.32.0 and earlier) — click to expand</summary>

### v1.33.0 — 2026-07-03 · PowerPoint and Excel auditing — full three-team red/blue re-audit of the four-format attack surface (security release) (entry recorded 2026-08-08)

`.pptx` and `.xlsx` auditing through the same scoring engine, taking the tool to all four major document formats, with a full parser/DoS, injection/XSS and logic/bypass re-audit of the widened attack surface. Every confirmed finding was fixed test-first: **OOXML DoS hardening** (cap-before-walk on shapes/text/cells, and a cumulative byte budget on XLSX drawing parts), a **download-link scheme guard** on the `publist` CLI command, **`err.message` info-leak fixes** on the bulk and page-audit routes, **store-sanitize consistency** across every shared-report insert, a **CSV formula-injection guard**, and **stripping application secrets from every child-process environment** (OOXML, remediation, and the qpdf subprocess). OOXML analysis also moved into an interruptible child process, so an analysis timeout genuinely cancels the work rather than leaving it running. Legacy binary formats (`.xls`/`.doc`/`.ppt`) are explicitly rejected at the dropzone with guidance to re-save. The PDF and Word audit paths are unchanged, frozen for scoring calibration.

### v1.32.1 — 2026-07-02 · The remediation progress page no longer rate-limits itself (not a security release) (entry recorded 2026-08-08)

Clicking **Auto remediate this file** on any job longer than ~25 seconds made the page's own status polling (every 250 ms = 240 req/min) drain the anonymous global limit (100/min/IP), so the UI reported "Too many requests" mid-job while the remediation completed fine on the server. `GET /api/remediate/:jobId/status` is now skipped by the catch-all limiter and guarded by its own dedicated flood cap (`RATE_LIMITS.remediationStatus`, 600/min/IP — the endpoint is a single indexed SQLite read), and that dedicated limiter runs **ahead of** the remediation feature-flag gate so the cap holds even where remediation is disabled. Live-verified: 150 rapid polls produce zero 429s while other routes still throttle at exactly 100/min; 650 polls admit exactly 600. The poller also moved to 1s on a self-scheduling timer that never stacks overlapping requests, backs off exponentially on failure (2s → 4s → 8s), treats a 429 as silent back-off feedback rather than a job failure, and clears its error banner on the first successful poll — previously a transient error stuck on screen for ever.

### v1.32.0 — 2026-07-02 · Post-refactor red/blue audit + nonce-based CSP hardening

A follow-up adversarial review of the v1.32.0 structural refactor (`packages/shared`, the extracted URL-policy service, the shared `ReportContent` component), run as three parallel red-team passes with every finding verified against the code. The two headline changes were clean: the URL/SSRF-policy extraction is behaviour-preserving (a mutation test that injected an allowlist bypass broke 22 tests, proving the suite gates the real allowlist), and the new `@file-audit/shared` package is a pure data leaf — a grep of the built client bundle confirms it carries no secrets, and `workspace:*` resolution blocks dependency-confusion. **919 tests pass; `tsc --noEmit` and `nuxt build` clean.**

**Fixed in v1.32.0:**

- **Stored XSS via report help-link URLs.** `POST /api/reports` stored arbitrary caller JSON validating only `filename`/`overallScore`, so a report's `categories[].helpLinks[].url` was attacker-controlled and rendered into an `<a href>` without scheme validation — a `javascript:` URL executed on click. Unlike the v1.30.0 HTML-export sink (bounded to the downloaded file's `file://` origin), this ran in the **app origin** on the public `/report/:id` page, and CSP permitted it under the old `'unsafe-inline'`. Fixed defence-in-depth: help-link URLs are scheme-validated to `http(s)` at the store boundary (recursively, including nested `scoreProfiles.*.categories`) and again at the render sink, and the HTML export routes them through the same guard. Confirmed with a live reproduction before and after.
- **Malformed stored reports could 500 the public page.** A forged report with a non-array `categories`/`findings`, or a `conformance` object missing its arrays, crashed SSR (`reading 'length' of undefined`). The render path now coerces those to safe defaults, and the store boundary rejects a non-array `categories`.

**Hardening applied in v1.32.0:**

- **Nonce-based `script-src` CSP (the tracked v1.30.0 follow-up, now shipped).** Production `script-src` drops `'unsafe-inline'` for a per-request nonce minted in a Nitro plugin and stamped onto every script Nuxt emits, so an injected inline script or `javascript:` URI is refused at the CSP layer regardless of any app-level bug. `style-src` keeps `'unsafe-inline'` (Vue `:style` attributes can't be nonced). Verified against a production build in-browser: zero CSP violations, working hydration and color-mode, and an injected inline script blocked by the browser.

Per responsible-disclosure practice, step-by-step exploit detail is held privately.

### v1.31.1 — 2026-07-01 · HTML export drops inert toggle controls (not a security release) (entry recorded 2026-08-08)

The export is a static snapshot with everything pre-expanded, so the interactive affordances it captured — the per-category Basic/Advanced pill, the show/hide fix-steps chevron, the "click a row" hint — were visible but dead. They are now marked `data-export-exclude` and removed, while all the content they revealed stays fully expanded. Pure-CSS affordances that still function in a static file (N/A cell tooltips, native `<details>`) are left intact. Verified in-browser on a PDF export: 4 Basic/Advanced pills on the live page → 0 in the export.

### v1.31.0 — 2026-07-01 · HTML export becomes a faithful snapshot of the live report (not a security release) (entry recorded 2026-08-08)

The HTML download was a separately hand-built document (`buildHtml()`) and had drifted from the on-screen report: mismatched wording, and missing the methodology card, the disclaimer and per-category detail. It now snapshots the actual rendered results DOM (`[data-report-content]`) and inlines the app's stylesheet and colour mode so the file renders standalone, auto-expanding collapsed sections and dropping interactive-only controls. This guarantees the download can never disagree with what the author saw — load-bearing, because these downloads are what gets sent back to an author when a file fails. `buildHtml()` is retained only as a fallback where there is no live DOM. Verified end-to-end in-browser on a Word result.

### v1.30.3 — 2026-07-01 · Markdown and plain-text exports gain the scored-vs-N/A split (not a security release) (entry recorded 2026-08-08)

Extends the v1.30.2 parity fix to the two remaining formats: scored categories in the category table, a separate "Not Included in Scoring" section for the N/A ones (distinguishing "Not assessed" from "Not applicable", with the reason), and detailed findings for scored categories only. All four surfaces — live page, shared report, HTML download, Markdown/text — now present a result identically.

### v1.30.2 — 2026-07-01 · HTML-export category parity with the live page (not a security release) (entry recorded 2026-08-08)

The downloadable HTML report listed every category in one table, rendering N/A categories as a bare "N/A" and showing detailed findings for all of them, while the live page and the shared `/report/:id` page split them into a scored table plus a separate "Not Included in Scoring" section distinguishing "Not assessed" from "Not applicable". Most visible on `.docx` results, which commonly have several N/A categories: a document showing 5 scored categories on the page previously showed 10 rows in the export. The export now mirrors the page exactly.

### v1.30.1 — 2026-07-01 · Documentation and diagrams catch up with Word support — no code paths changed (entry recorded 2026-08-08)

`/technical-details`, the "What this tool does" hero and the Scoring Rubric modal referenced a PDF-only tool while `.docx` auditing had already shipped. All three now explain both formats — PDF's two-tool qpdf/pdfjs path against Word's fully in-process JSZip + fast-xml-parser path — document Word's rubric differences (contrast scored, List Structure category, Reading Order and Form Accessibility N/A), label the PDF-only sections as such, and add JSZip and fast-xml-parser to the open-source toolchain table. The audit-pipeline flowchart was redrawn to show the branch. Diagram tooling is dev-only and not shipped to the browser.

### v1.30.0 — 2026-07-01 · Word (.docx) accessibility checker + adversarial red/blue audit

The new Word (`.docx`) audit path introduced fresh untrusted-input attack surface — a `.docx` is a user-supplied ZIP of XML parsed in-process with `jszip` + `fast-xml-parser`. A three-front adversarial review (ZIP/XML parsing, denial-of-service/concurrency, and injection/XSS/dispatch/auth) drove every finding against the actual code and the installed library sources; all confirmed issues were fixed test-first before this release. 880 tests pass; `tsc --noEmit` and `nuxt build` clean.

**Headline: the classic XSS vector was already closed.** A malicious document's title, alt text, link text, and headings flow into findings and render on the live page, the shared-report page, and the exports — but every docx-derived string reaches the client only through Vue's auto-escaping `{{ }}` or the shared `escapeHtml` helper, and the raw docx link URLs / alt text are never returned to the browser at all. The v1.27.0 escaping discipline held for the new format.

**Verified already-safe in the parser** (`fast-xml-parser` 5.9.3, checked against the installed source): external-entity XXE (the library throws on `SYSTEM`/parameter entities), billion-laughs entity expansion (nested entities dropped; hard caps on entity size/count), prototype pollution (`__proto__`/`constructor` tag names throw; attribute/entity maps are null-prototype), deep-nesting stack overflow (`maxNestedTags: 100`), and zip-slip (parts are read from fixed literal paths and never written). ReDoS was cleared — the docx regexes have no catastrophic backtracking.

**Fixed in v1.30.0:**

- **Decompression-bomb DoS (the one critical).** `jszip` enforces no uncompressed-size ceiling, so a sub-1 MB upload could inflate `word/document.xml` to multiple GB and OOM the process. Every ZIP part is now read through a streaming reader that checks the ZIP's declared uncompressed size **and** enforces a hard `DOCX.MAX_UNCOMPRESSED_BYTES` (30 MB) budget *during* decompression — the declared size is attacker-controlled, so the streaming abort is the real guard. The same cap applies to the content-type sniff in `detectFileType`.
- **DOCX analysis is now resource-bounded like PDF.** The docx branch previously bypassed the audit pipeline's concurrency semaphore and wall-clock timeout; it now shares the same 2-slot `MAX_CONCURRENT_ANALYSES` semaphore and a `DOCX.ANALYSIS_TIMEOUT_MS` (20 s) timeout (routes already map 503/504), and a `DOCX.MAX_PARAGRAPHS` (100k) cap bounds the extract passes against a document that fits the byte cap but is millions of tiny elements.
- **HTML-export XSS via non-string fields.** The downloadable HTML report interpolated score / grade / overall-score / page-count / grade-label values without escaping, while `/api/reports` stored arbitrary caller JSON (`gradeLabel` echoes an unknown grade verbatim). All such sinks now run through `escapeHtml`, and the report store type-validates `filename` / `overallScore` before persisting. Bounded to the downloaded file's `file://` origin (never the app origin), so it could not reach the app session — fixed regardless. Not docx-specific, surfaced by the audit.
- **URL-route info leak.** `/api/analyze-url`'s catch-all no longer echoes the raw `err.message` to the client (it could leak library/path internals); the detail is logged server-side only, matching the upload route.

Per responsible-disclosure practice, step-by-step exploit detail is held privately. The nonce-based `script-src` follow-up (drop `'unsafe-inline'`) shipped in v1.32.0.

### v1.29.0 — 2026-06-27 · Two-tier rate limiting + privileged token (allowlist bypass)

A scoped review of the new rate-limit tiers and the privileged bearer token. The token grants only (a) the generous rate tier and (b) a bypass of the ICJIA / illinois.gov URL allowlist — it never relaxes the SSRF controls: the private/reserved-IP block runs independently of the allowlist in both the `safeFetch` path (every redirect hop, connection pinned to the resolved IP) and the headless-browser path (every request, via the Chromium interceptor), verified by tests. Size caps, the http(s)-only rule, and the 2-slot concurrency semaphores are unaffected, so a leaked token cannot reach internal services — worst case is auditing arbitrary _public_ URLs at the privileged rate, still serialized through 2 slots. Reverting the campaign-era anonymous limits (5000/hr → 500/hr analyze, 1000/min → 100/min global) tightens the public abuse surface. No new injection/XSS/auth surface; constant-time token compare; the token is read from the environment and never logged or persisted.

### v1.28.1 — 2026-06-10 · Loading-spinner icon routing fix (not a security release)

v1.28.1 fixes a missing UI icon: `@nuxt/icon`'s data endpoint defaulted to `/api/_nuxt_icon`, which this app's `/api/**` proxy forwarded to the Express backend (404), and the v1.27.0 CSP blocked the external Iconify fallback. The endpoint was moved off `/api`, the used icons were client-bundled, and the external API fallback was disabled. No endpoint, authentication, retention window, or data-handling path changed — and the CSP is now even tighter in effect (no external icon fetch attempted).

### v1.28.0 — 2026-06-10 · Front-end perf/export simplification (not a security release)

v1.28.0 replaces the Word/.docx export with a dependency-free plain-text export and pre-renders the Mermaid diagrams to static SVG, removing the `docx` (~0.5 MB) and `mermaid` (~640 KB) client libraries. No endpoint, authentication, retention window, or data-handling path changed; Lighthouse accessibility stays 100 and axe-core reports 0 WCAG AA violations across all pages.

- **No new attack surface.** Two dependencies were *removed*; the new text export is plain `String` concatenation and the diagrams are static assets. The `/history` and `/my-history` pages had their now-redundant auth-middleware declarations removed — they already passed through in the default no-auth mode, so behavior is unchanged and re-gating is a one-line restore.

### v1.27.0 — 2026-06-10 · Comprehensive adversarial red/blue audit + hardening (full app + server, audit + remediation pipelines)

A full adversarial security audit of the entire application — the Nuxt frontend, the Express API, the synchronous audit pipeline, and the optional auto-remediation pipeline — covering injection, authentication/authorization, SSRF, untrusted-document parsing, secrets handling, and denial-of-service. Conducted with a lead reviewer plus four parallel red-team passes (injection/path/process, auth/secrets, SSRF/parse/DoS, frontend XSS), with every finding verified against the code. **All identified items were fixed in v1.27.0** — test-first; 803 tests pass, `tsc --noEmit` and `nuxt build` clean.

**Headline: no live critical-severity issue.** The classic high-impact vulnerability classes were each examined adversarially and verified clean:

- **No SQL injection** — every database statement is a parameterized better-sqlite3 prepared statement; no string-built queries anywhere.
- **No command or argument injection** — all subprocess calls (qpdf, OpenDataLoader, veraPDF) use `execFile`/`spawn` with array arguments and no shell; user-supplied filenames never reach argv or a path component (scratch paths use server-generated UUIDs).
- **No path traversal** — request-supplied job/report ids are used only as parameterized database keys, never joined into filesystem paths; download paths come from the database row, not the request.
- **No insecure deserialization** — subprocess and stored data are parsed with `JSON.parse` only; no `eval`/`new Function`/`vm`.
- **No reachable stored/DOM XSS** — Vue auto-escaping covers all PDF-derived metadata; the few `v-html` sinks are fed by escaped or non-document data; URL sinks resolve to server-fixed allowlists (a malicious PDF's link/title/alt-text cannot reach an `href` or script context).
- **SSRF on the PDF-fetch paths is hardened** — in-process DNS resolution, private/reserved-range rejection (IPv4 + IPv6), connection pinned to the validated IP (closing DNS-rebinding), and per-redirect-hop re-validation.
- **Authentication primitives are sound** (when login is enabled) — OTP via CSPRNG + bcrypt with attempt-limiting and expiry; JWT with a pinned algorithm and expiry; personal access tokens are 128-bit, stored only as SHA-256, looked up by indexed hash, and cannot mint or revoke other tokens; the single-use download token is 256-bit and compared in constant time. CORS is locked to a single fixed origin; Helmet, body-size caps, upload caps, and magic-byte checks are all in place.

**Hardening applied in v1.27.0 (the identified items were denial-of-service or misconfiguration/forward-looking in nature — no live critical):**

- **Headless-browser page-audit SSRF closed** — the page-audit path now installs a Chromium request interceptor that blocks non-http(s) schemes, resolves and rejects private/reserved-IP targets on *every* request (navigation, redirect, and subresource), and re-checks document navigations against the host allowlist on each hop. Verified end-to-end: a loopback navigation is blocked, while a legitimate allowlisted page still renders. Page audits are also bounded by a concurrency cap.
- **Auto-remediation worker is now time-bounded** — every pipeline subprocess (qpdf normalize, qpdf check, veraPDF) has a wall-clock `timeout`, and the worker arms a master self-timer that SIGKILLs its entire process group (worker + the OpenDataLoader JVM) if the budget is exceeded, so a pathological PDF can no longer spin a never-ending process.
- **Resource bounds tightened** — the in-process content extractor now has a parse timeout (freeing its concurrency slot on a pathological document), and URL-fetched PDFs are capped at the same size as direct uploads instead of 6.6× larger.
- **Fail-closed startup + admin gate** — the API refuses to start if login is enabled without a strong session secret, and the admin gate now rejects the anonymous sentinel and an empty admin list unconditionally instead of by coincidence.
- **Defense-in-depth** — a Content-Security-Policy and related security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) on the web app; the IPv6 private-range classifier no longer fails open on bracketed/IPv4-mapped forms; the HTML-export escaper now covers the single quote; the public share endpoint no longer returns the sharer's email; and the dev OTP bypass is gated on an explicit opt-in flag rather than `NODE_ENV`.

Per responsible-disclosure practice, step-by-step exploit detail is held privately rather than published here. A follow-up hardening item (nonce-based `script-src` to drop `'unsafe-inline'`) is tracked for a future release.

### v1.26.1 — 2026-06-10 · Remediation exit-3 parity, filename-title discriminators, bundled icons

v1.26.1 brings the remediation pipeline in line with the v1.26.0 audit fix (qpdf normalization now accepts exit code 3 when the repaired output was written, so damaged-but-recoverable PDFs — remediation's primary input — no longer fail at step 1), tightens the filename-like-title classifier (timestamped export filenames are flagged; "COVID-19"-style titles remain protected), and bundles `@iconify-json/lucide` so Nuxt UI's default icons stop 404ing. It is not a security release: no endpoints, authentication, retention windows, or data-handling paths changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The normalize tolerance is gated on exit code 3 plus the presence of the output file qpdf itself wrote inside the job's scratch directory; hard failures (exit 2, missing output) still abort the job and clean up. The icon collection is a build-time asset bundled by `nuxt build` — no runtime fetches to external icon APIs. Every defensive control from prior releases remains in force.

### v1.26.0 — 2026-06-10 · qpdf warning recovery, JSON-v2 ref fixes, conformance-evidence gating, form/table/list/title accuracy

v1.26.0 fixes two verified extraction bugs (qpdf exit-code-3 output was discarded, falsely reporting tagged documents as untagged; the nested-table exclusion never matched on qpdf ≥ 11's `obj:`-prefixed JSON keys), removes several false-positive generators (erased titles, radio-group field counting, span-blind column checks, Lbl-required lists), tightens the conformance gate to assert 1.3.2 only from the measured MCID order comparison, and corrects the veraPDF rule-ID display plus every drifted How-to-Fix step and help link. Independently code-reviewed before tagging. It is not a security release: no endpoints, authentication, retention windows, or data-handling paths changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The exit-3 recovery parses stdout the process already captured from the same qpdf invocation, through the same `JSON.parse` path and buffer limits as the success branch, and is gated on exit code 3 plus a document-shaped payload (exit 2 — "errors" — is never recovered, so the conformance gate cannot be fed disclaimed data). The XMP fallback applies two anchored regexes to a string pdf.js already exposes. No new inputs, endpoints, persistence, or data egress; every defensive control from prior releases remains in force.

### v1.25.0 — 2026-06-05 · PDF/UA + artifact + font detection fixes, link/reading-order calibration, PDF/UA-1 signals panel

v1.25.0 corrects three findings-text false negatives (the PDF/UA identifier, artifact tagging, and Type3-font embedding — each now read from the extractor that can actually see it), recalibrates two score items (raw-URL link text is advisory rather than a 2.4.4 failure; the reading-order fidelity top band was widened to absorb extraction jitter), stops the Acrobat "How to Fix" card from rendering on perfect categories, and adds a PDF/UA-1 conformance-signals panel to every report. It is not a security release: no endpoints, authentication, retention windows, or data-handling paths changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The detection fixes read output the pdf.js / qpdf analyzers already produce, and the new panel renders booleans already computed in the analysis result. No new inputs, endpoints, persistence, or data egress; every defensive control from prior releases remains in force.

### v1.24.2 — 2026-06-05 · Table captions no longer deduct; `/docs` reorganized (not a security release) (entry recorded 2026-08-08)

A `<Caption>` is best practice, not a WCAG 2.1/2.2 requirement — no success criterion mandates one — yet a fully conformant simple table without one was capped at 95. The 5 caption points are now awarded unconditionally and a missing caption surfaces as an optional recommendation. Combined with the v1.24.1 header-association fix, a simple table conformant via `/Scope` now scores 100; expect small upward movement on documents containing uncaptioned tables. Separately, `docs/` was trimmed to the current set with everything else moved to `docs/archive/` behind a README distinguishing superseded from still-accurate reference docs, and every reference repointed. API suite 357 → 358.

### v1.24.1 — 2026-06-05 · Table-structure and heading diagnostic accuracy, reported by a user (not a security release) (entry recorded 2026-08-08)

Three defects, full write-up in `docs/table-and-heading-accuracy-fixes.md`. **Inflated table and row counts**: a table nested inside another table's cell was counted as a separate top-level table, inflating both counts ("more rows than the PDF actually has"); nested tables are now excluded from the top-level list while the parent still reports the nested-table flag. **Heading outline out of order**: headings were listed in PDF object-number order rather than reading order, so an H1 tagged late — e.g. during remediation — could appear at the *end* of the outline, which also carried a latent mis-scoring, since object-order headings could trigger a false "heading hierarchy skip". They are now collected by walking the structure tree in reading order. **A table scoring below 100 while passing every check**: the 5-point header-association check credited only `/Headers` and ignored `/Scope`, the recommended technique for simple tables. Header association is now satisfied by either, per WCAG 2.1/2.2 SC 1.3.1 — unchanged between the two versions, so this satisfies the IITAA 2.1 floor and the app's 2.2 anchor equally, with no version dependence.

### v1.24.0 — 2026-06-03 · WCAG 2.2 re-anchor, IITAA 2.1, announcement banner, /wcag-2-2

v1.24.0 re-anchors the displayed standard to **WCAG 2.2 Level AA** (a strict superset of WCAG 2.1 AA, which remains the legal minimum under IITAA 2.1 §E205.4 and ADA Title II), adds **Illinois IITAA 2.1** citations throughout, introduces a reusable announcement banner, and adds a new `/wcag-2-2` manager-guide page. No automated check changed and no score weight changed. A `WCAG_VERSION=2.1` environment flag reverts all labels, links, and 2.2 not-assessed criteria; set it and redeploy (API reverts on restart; web UI on rebuild). It is not a security release: no endpoints, authentication, retention windows, or data-handling paths changed.

- **No new attack surface introduced; pre-existing posture re-verified.** All changes are presentational — UI labels, copy, a new static page, and a dismissible banner. No new inputs, endpoints, persistence, or data egress. The `WCAG_VERSION` env flag controls text and criteria display only; it touches no data-handling or security code paths.

### v1.23.0 — 2026-06-03 · Prominent filename banner on every report

v1.23.0 adds a full-width banner across the top of every report — the live result, the shared `/report/:id` page, and the HTML / Word / Markdown exports — naming the audited file so a saved or forwarded report cannot be mistaken for another document. It is not a security release: no endpoints, authentication, retention windows, or data-handling paths changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The banner is presentational — a new `ReportFileBanner.vue` and a shared `reportBanner` helper render values (`filename`, `pageCount`) the page and exports already held. The filename is escaped in the HTML export via `escapeHtml` and auto-escaped in Vue templates; no new inputs, endpoints, dependencies, persistence, or data egress.

### v1.22.3 — 2026-05-22 · Scoring-engine follow-ups (summary reconciliation, floor rounding, dead-code removal)

v1.22.3 is a scoring-engine cleanup, not a security release — no endpoints, authentication, retention windows, or data-handling paths changed. The executive summary now honours the conformance verdict, coverage-ratio scores floor instead of round, and ~170 lines of confirmed-dead scoring code were deleted.

- **No new attack surface introduced; pre-existing posture re-verified.** Every change is internal to `scorer.ts` and `scoring/summary.ts` — pure computation over existing analyzer output. Deleting unreachable code (`scorePdfUaCompliance`, `refreshCategoryPresentation`) shrinks the attack surface rather than expanding it. No new inputs, endpoints, persistence, or data egress.
- **Operational note (not a finding).** Coverage-ratio categories (alt text, link quality, form accessibility) now floor their score, so a document whose coverage is not a whole percentage may score up to 1 point lower in those categories. Minor, and far smaller than the v1.22.0 reweight — but worth noting for an in-flight fleet audit.

### v1.22.2 — 2026-05-22 · Conformance heading copy + README test-table correction

v1.22.2 reworks the conformance verdict box copy for a failing document — both the heading and the body — and corrects stale per-file test counts in this README's Tests section. It is not a security release: no code paths, endpoints, authentication, retention windows, or data handling changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The change is UI copy in `ScoreCard.vue` plus Markdown edits to `README.md`. No new inputs, endpoints, dependencies, persistence, or data flow.

### v1.22.1 — 2026-05-22 · Conformance-verdict presentation refinement

v1.22.1 is a copy and presentation change to the WCAG conformance verdict box — the verdict color now follows the letter grade, the wording is grade-aware, and the standards named in the footer are clickable links. It is not a security release: no endpoints, authentication, retention windows, data-handling paths, or scoring logic changed.

- **No new attack surface introduced; pre-existing posture re-verified.** The conformance verdict box is pure client-side computation over the audit response the page already holds. The three new footer links are static external references (W3C, Illinois DoIT, ADA.gov) and carry `rel="noopener noreferrer"`. No new inputs, endpoints, persistence, or data egress.
- **Exports unchanged.** The softened wording is on-page only; the Word/HTML/Markdown/JSON reports keep the formal "does not meet WCAG 2.1 Level AA" verdict language. No change to what the exports contain or where they go.

### v1.22.0 — 2026-05-21 · WCAG conformance gate + scoring-rigor pass (Tier A+B)

v1.22.0 is a scoring-methodology release, not a security release — no endpoints, authentication, retention windows, or data-handling paths changed. An adversarial *scoring* review (not a red/blue-team security review) was run against the new code; one correctness defect was found and fixed before tagging.

- **P2 / fixed** — The new WCAG conformance gate evaluated structural signals (no structure tree, missing title, etc.) even when the qpdf or pdfjs analyzer had *errored*. A damaged or encrypted PDF would therefore have been issued a fabricated "Does not meet WCAG 2.1 Level AA" verdict citing specific failures the tool never actually confirmed — a false accusation against the document. **Fix:** `evaluateConformance` now returns an `"incomplete"` verdict when either analyzer errors; the UI and every export report "WCAG verdict could not be determined" instead of guessing. Regression test added.
- **No new attack surface.** The conformance gate is pure computation over existing analyzer output. The audit pipeline still holds PDFs in memory only. The export change adds a rendered section to the Word/HTML/Markdown/JSON reports — no new data egress, no new persistence.
- **Operational note (not a finding) — score discontinuity.** Category weights (Bookmarks 10%→5%, Reading Order 5%→10%), the missing-bookmarks penalty (0/Critical → 45/Moderate), and the per-category severity labels changed in this release. v1.22.0 scores are therefore **not directly comparable** to pre-v1.22.0 scores; a fleet audit spanning the upgrade will show score movement that reflects the methodology change, not the documents.

### v1.21.1 — 2026-05-19 · Saved-report UI parity + temporary analyze rate-limit bump for ICJIA fleet pass

Pre-release review focused on the post-v1.21.0 loose ends and the operational rate-limit change. No new attack surface; one UI consistency bug and one operational config change with documented rationale.

- **P3 / fixed** — Saved reports still rendered the Adobe Acrobat parity card. The v1.21.0 dual-scoring removal cleaned up the real-time audit page (`/`) but left the `<AdobeParityCard>` block in place on the shared-report page (`/report/:id`). Anyone clicking a shared-report link got the 32-rule Acrobat panel that the live audit no longer showed — same underlying data, different presentation depending on the URL. Not a security finding; a UI consistency bug that confused auditors comparing notes against shared links. **Fix:** removed the card block from `report/[id].vue` (5 lines net). The `adobeParity` field is still persisted in `shared_reports.report_json` for backward compatibility with any external consumer that already parses it; only the rendered card is gone. No schema migration.
- **Operational / accepted** — `RATE_LIMITS.analyze` elevated from `35` to `5000` per hour per email to support the in-flight ICJIA fleet audit campaign. The ~5000-PDF inventory is being re-audited across multiple passes over several days as content is remediated and re-checked, not a single one-shot pass — the elevated limit will stay in place for the duration of the campaign and revert once it concludes. Documented in `audit.config.ts`. The actual abuse mitigations live on the remediation side — the 100/day remediation cap, the 60-minute audit-gate `sha256(bytes)` hash check, the SSRF allowlist, the upload size cap, and the auth gate are all unchanged. The per-caller analyze limit is a fair-use throttle, not a defense-in-depth control.
- **Pre-launch items still open** — external penetration test on the remediation surface (Phase 4 roadmap).

#### Methodology

Same as prior releases: every release runs through a fresh red/blue team review before tagging. This patch release was a small footprint (a 5-line UI deletion and a single rate-limit constant change), so the review was correspondingly scoped — the parity-card removal was inspected for any logic change (none; pure UI removal, the underlying `adobeParity` field is still persisted), and the rate-limit bump was inspected for whether it weakens a security control (no — the per-caller analyze limit is a fair-use limit, not a defense-in-depth control; the actual abuse mitigations sit on the remediation side via the audit-gate, the 100/day cap, and the SSRF allowlist).

### v1.21.0 — 2026-05-19 · Single Strict score, veraPDF promoted on the remediation page

UI simplification release, not a security release. Pre-release red/blue team review covered the audit-page surface that was being simplified, the persisted-report schema (unchanged), the back-compat alias of `scoreProfiles.remediation` → Strict for the fleet-CSV integration shipped in v1.20.0, and the regression-guard change on the remediation worker. **No new P1/P2 findings.** One P3 was accepted with documented rationale (the dropped Practical-mode regression check on the remediation worker — net-gains-only promise still holds on Strict, and veraPDF is now the authoritative PDF/UA signal on every remediation). Full simplification rationale and API back-compat notes are in `CHANGELOG.md` and `apps/web/app/pages/data-retention.vue` § 10.

- **No security regressions.** All SSRF, rate-limit, audit-gate, daily-cap, and retention controls from v1.20.1 remain in force.
- **Schema unchanged.** `audit_log`, `shared_reports`, and `remediation_jobs` keep their existing columns; historical rows are not migrated.
- **API alias retained** — `result.scoreProfiles.remediation` and the `practical` key in `/api/audit-url` are kept as structural aliases of Strict for backward compatibility with the fleet-CSV integration. Removal tracked for a future release.

### v1.20.1 — 2026-05-18 · Security-followup release for v1.20.0 (audit-gate + SSRF hardening + 7 findings fixed)

A dedicated patch release in the "every feature gets a fresh red/blue team review before tagging" practice. The v1.20.0 release added the fleet integration surface (`/api/audit-url`); this release is the post-feature review that resulted. Six findings were identified in the initial review plus one previously-latent issue uncovered during the SSRF migration — all fixed before tagging.

**Reviewed surface:** the new `/api/audit-url` endpoint, the existing `/api/analyze-url` and `/api/bulk-from-inventory` SSRF posture, the `audit_log` table's role as a canonical record, and the remediation gate proposed by the user to slow automated abuse.

#### Fixed

- **P1.1 / fixed** — DNS rebinding bypassed the URL allowlist. `isAllowedUrl()` ran against the hostname *string* before DNS resolution. An attacker controlling DNS for any subdomain of an allowlisted apex could point it at `127.0.0.1` (or the API's loopback / internal address). `fetch()` then resolved DNS independently and connected to the private IP, turning the audit pipeline into an SSRF proxy. **Fix:** new `apps/api/src/services/safeFetch.ts` resolves DNS in-process, rejects any private/loopback/link-local/multicast IP (full IPv4 + IPv6 coverage including IPv4-mapped IPv6 forms like `::ffff:127.0.0.1`), and dials the resolved IP directly with `Host:` header preserved.
- **P1.2 / fixed** — `redirect: 'follow'` chained into private networks. Even with the allowlist, `fetch(..., { redirect: 'follow' })` followed up to 20 redirects *without re-validating*. An attacker who could plant content on an allowlisted host could 302 us to `http://10.0.0.1/...`. **Fix:** `safeFetch` handles redirects manually with the full allowlist + DNS check on every hop, capped at 3 hops.
- **P1.4 / fixed** — `/api/bulk-from-inventory` had a private `fetchWithTimeout` with NO allowlist check and no SSRF protection. Caught while migrating to `safeFetch`. Authenticated callers (PAT-bearing) could submit an NDJSON inventory containing arbitrary URLs — internal addresses included — and the server would fetch and return them. Textbook authenticated SSRF, latent since the endpoint shipped. **Fix:** replaced with the same `safeFetch + validateUrlForFetch` plumbing used by the other URL-fetch endpoints.
- **P2.1 / fixed** — Audit-gate identity collapse in anonymous mode. With `AUTH.REQUIRE_LOGIN=false`, every caller's identity was a shared `'anonymous'` bucket. User A audits PDF X → User B (different IP, different machine) could remediate PDF X because B's gate check matched A's `audit_log` row. **Fix:** new `gateIdentity()` helper returns `anon:${ip}` when not authenticated. Production (`REQUIRE_LOGIN=true`) was never affected.
- **P2.3 / fixed** — `audit_log` grew unbounded. No retention policy on the canonical audit record. Slow-burn DoS vector. **Fix:** new `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS = 365` plus a step-6 cleanup in `remediationCleanup.runCleanup()` that purges expired rows alongside the existing sweep. 365 days matches the shared-report retention so audit-related records age out together.
- **P2.4 / fixed** — Race window on the daily-cap check. Concurrent `/api/remediate` requests could both pass the same fast-path cap check during the (slow) `analyzePDF` preflight, then both create jobs. **Fix:** the cap check is now repeated inside a `db.transaction()` immediately before `createJob()`. SQLite serializes writes, so the cap-exceeding request reliably loses. Fast-path check stays as cheap early-exit.
- **P3.5 / verified clean** — Cookie security flags audit. `auth.ts` already sets `httpOnly: true`, `secure: isProduction`, `sameSite: 'strict'` in production. No change needed; recorded as part of the audit trail.

#### Added (the feature this release also brings — driven by the same security thinking)

- `POST /api/remediate` now requires a prior audit of the same content (same `sha256(bytes)`) from the same caller within `REMEDIATION.AUDIT_REQUIRED_WINDOW_MS` (default 60 minutes). Returns `403` with an explanatory body when not met. Closes the "automated thousands of remediations" vector the user flagged.
- New `REMEDIATION.MAX_JOBS_PER_DAY_PER_USER = 100` daily cap as a second layer. Sized to cover a normal agency workflow (~50 PDFs) with 2× headroom while blocking 3000+ at scale. Returns `429` with `{ limit, used }` when exceeded.
- Unified `audit_log` writes — every audit endpoint (`/api/analyze`, `/api/analyze-url`, `/api/audit-url`, `/api/bulk-from-inventory`) now writes a row with content_hash. Previously only `/api/analyze` wrote to `audit_log` (and without the hash). Required for the gate to work across all audit paths; documented in `AGENTS.md` and the integration brief.

#### P3 — Accepted with documented mitigation

Reviewed and either bounded by existing controls, theoretical, or accepted by design. Listed for the audit trail:

- **P1.3 / mitigated** — Download token in `?token=` query string ends up in nginx access logs. Mitigated by single-use enforcement (`setExpired()` runs before stream begins; replay window near-zero). Hardline fix would require POST-body auth, breaking the `<a href>` download UX. Accepted.
- **P2.2 / partial** — Daily-cap bypass via multi-account creation. Mailgun has disposable-email signals; per-IP registration throttle is future work. Not currently exploited.
- **P2.5 / mitigated** — Future CVE in OpenJDK / ODL could allow RCE in the worker via crafted PDF. Existing: JVM heap cap, 5-min timeout, detached child process, no `--hybrid` (no ODL network), pinned Java major version. Dedicated unprivileged user + egress block tracked.
- **P3.1** — SHA-256 collision in the audit-gate (2^128 work, computationally infeasible).
- **P3.2** — IPv4-mapped IPv6 SSRF — verified not exploitable against the new `isPrivateIPv6()` check which handles `::ffff:127.0.0.1` and similar forms.
- **P3.3** — Timing side-channel on the gate (response code is the larger giveaway, not query timing).
- **P3.4** — PDF embedded URLs triggering fetches — neither qpdf nor pdfjs fetches external resources; ODL doesn't in non-hybrid mode (our default).
- **P3.6** — Trust-proxy depth: production runs nginx directly behind DigitalOcean (no proxy chain).

#### Methodology

This release follows the team's standing practice: **every feature ships through a fresh red/blue team review before tagging.** The review examines the newly-introduced surface from a sophisticated-adversary perspective (DNS rebinding, redirect chaining, race conditions, identity collapse, slow-burn DoS, etc.), catalogs findings by severity, fixes everything fixable in the same release window, and documents the rest for the audit record. v1.20.0 added the surface; v1.20.1 is the security-followup that resulted. This pattern is repeated every release — see the prior entries below.

### v1.20.0 — 2026-05-18 · CMS-aware download + PDF export + agent docs

Pre-release review focused on the new download surface (the filename-choice dialog) and the print-to-PDF affordance. No new attack surface; one operational note worth flagging (the dialog's "use a different filename" path actively breaks existing references, which is why it gates behind an "are you sure?" confirm).

- **P3 / fixed** — Cumulative Layout Shift of 0.252 on `/remediate` desktop. Cause: three discrete `v-if` regions on the page made it grow ~3000px when status flipped to "complete." Fix: reserved page height via `min-h-[calc(100vh-4rem)]`. Lighthouse perf score on `/remediate` rose 84 → 96.
- **P3 / fixed** — Result-page sections appeared mid-progress-animation. New `isVisuallyComplete` computed gates all 5 result `v-if`s so the indicator finishes its arc before results paint.
- **P3 / fixed** — Download endpoint sanitized the filename, stripping spaces and unicode. Material for CMS replacement workflows where the filename is the identifier. Schema change: added `original_filename TEXT` to `remediation_jobs` via ALTER TABLE backfill (nullable; pre-v1.20.0 jobs keep their existing behavior). Download endpoint accepts `?name=<custom>` and emits RFC 6266 dual-name `Content-Disposition` so spaces and unicode survive intact in modern browsers and curl. The frontend dialog defaults to "Keep original filename" with a Recommended badge; the rename path requires a second-click confirm.
- **Defense in depth / unchanged** — `?name=` parameter is still treated as a filename, not a path. The server caps length at 250 chars, forces a `.pdf` extension, and percent-encodes for the response header. The actual on-disk file location is derived from the immutable `jobId`, never from caller-supplied input — there's no path traversal vector via the `name` param.
- **P3 / accepted** — PDF export uses `window.print()` rather than a server-side renderer (puppeteer / playwright / pdfkit, ~100 MB). The user-driven approach has zero new dependencies and produces output visually faithful to the report page. Tradeoff: fleet automation cannot fetch PDFs directly via API — they get HTML / Markdown / JSON instead and rely on user-driven printing for PDF. Acceptable given the audit-tool's UX positioning (the API surface for fleet inventory already returns scores + report URL, and the report page itself can be printed).
- **Defense in depth / unchanged** — Print stylesheet hides buttons and chrome to avoid leaking interactive controls into the saved PDF. Open `<details>` blocks expand on print so collapsed technical details are included. The page doesn't load any third-party fonts or assets during print rendering.
- **Documentation / added** — `AGENTS.md` at repo root consolidates cross-tool agent guidance previously only in private dotfiles. Lists the load-bearing conventions (no AI co-author trailers, `pnpm build` before push, `./start-dev-server.sh` requirement, `#config` path alias, ALTER TABLE migration pattern) so future agents can orient in one read rather than re-discovering through trial and error. Not security-relevant per se, but reduces the chance of a misconfigured agent committing the wrong thing.
- **Pre-launch items still open** — external penetration test on the remediation surface (Phase 4 roadmap); CLS investigation on `/remediate` complete in this release.

### v1.19.0 — 2026-05-18 · Fleet integration + a11y polish + retention-policy change

Pre-release review covered the new `/api/audit-url` surface (auth, allowlist, SSRF posture, hash-dedup logic), the URL allowlist expansion (added `illinois.gov` opens a large state-agency surface), the retention-policy bump (15 days → 365 days), and the accessibility / SEO fixes against `/data-retention` and `/technical-details`. No new attack surface findings; one operational tradeoff worth flagging (TTL bump).

- **P2 / accepted — `SHARED_REPORTS.EXPIRY_DAYS` bumped from 15 to 365.** Shared-report rows now live in SQLite for one year instead of 15 days. The `report_json` payload is content-free metadata (scores, category findings, timestamps) — no PDF bytes — so growth is bounded: a 100-PDF fleet at ~50 KiB per row adds ~5 MB per year. **Status:** intentional; the auditor / fleet-inventory use case requires year-long link stability. Documented in `audit.config.ts` and on the `/data-retention` policy page.
- **P3 / fixed — `aria-prohibited-attr` on 7 MermaidDiagram instances** (4 on `/technical-details`, 3 on `/data-retention`). Inner scroll `<div>` carried `aria-label` without a widget/landmark role. Not exploitable; a real a11y conformance issue caught by axe + Lighthouse during pre-release sweep. Fixed by dropping the duplicative attribute (figcaption already names the figure) and adding `tabindex="0"` for keyboard scrolling.
- **P3 / fixed — `scrollable-region-focusable` on 6 code-block / table containers.** Same kind of keyboard accessibility gap as the mermaid wrappers. Fixed with `tabindex="0"`.
- **P3 / fixed — `link-in-text-block` on `/data-retention` § 10 v1.17.0 article.** Inline body link relied on color alone. Added `underline`.
- **P3 / fixed — missing `rel=canonical` on `/data-retention`, `/technical-details`.** Per-page canonicals via `useHead` keyed off `runtimeConfig.public.siteUrl`. `/remediate/<id>` correctly switched to `noindex,nofollow` (private session-bound URL).
- **P3 / fixed — `/api/audit-url` returned strict score in the practical slot** because of a key-name mismatch (`scoreProfiles.practical` vs internal `scoreProfiles.remediation`). Caught in the local curl smoke test before any caller integrated against it; no production data ever exposed the wrong values. Fixed by mapping the user-facing name to the internal key in the extractor.
- **Allowlist expansion / accepted — added `illinois.gov`, `icjia.cloud`, `icjia.app`, `ilheals.com`** to the URL allowlist for `/api/analyze-url` and `/api/audit-url`. The `illinois.gov` entry is the largest surface bump — every state-agency subdomain is now reachable. Mitigated by: existing SSRF blocks (RFC1918, link-local, `*.local`, `*.internal`, IPv6 loopback), magic-bytes check, 100 MB cap, 30-second fetch timeout, look-alike-domain rejection (`illinois.gov.evil.com` does not match). Threat model summary: any fetch worker is constrained to public PDFs ≤ 100 MB on real .gov / .cloud / .com domains — the same posture as a user pasting a URL into the web UI. **Status:** intentional for fleet-audit coverage.
- **Pre-launch items still open:** external penetration test on the remediation surface (Phase 4 roadmap); full automated test coverage for the remediation pipeline; CLS 0.252 investigation on `/remediate` desktop.

### v1.18.1 — 2026-05-18 · veraPDF integration correctness

Patch release. The pre-release review focused on the veraPDF 1.30.x integration path and the remediation result page's fix-step affordance. No new attack surface; one finding is security-adjacent in that an auditor consulting the PDF/UA-1 disclaimer card would have been shown a silently wrong compliance verdict.

- **P1 / fixed**: veraPDF compliance verdict was always reported as `passed: false` on deploys running veraPDF 1.30.x or newer. In v1.30.x the validator JSON output reshapes `validationResult` from a single object into a single-element array; the v1.18.0 extractor read the array as an object, so `validation.compliant === true` was always `false` and every PDF was marked non-conformant in the result-page disclaimer card and in the persisted `verapdf_passed` column. Security-adjacent: an auditor relying on the disclaimer card to corroborate manual review would have been shown an incorrect verdict. **Fix:** detect `Array.isArray(validationResult)` and unwrap to `[0]` before extraction; older shapes pass through unchanged. The fix is verified against a live veraPDF 1.30.1 install. Note that no production deploy was shipping the wrong verdict yet — the feature flag was off in production at the time of the fix.
- **P2 / fixed**: Rule-summary extraction could throw `TypeError` on veraPDF 1.30.x output. The 1.30.x schema places per-rule detail at `details.ruleSummaries` (array) and a separate `details.failedRules` (number — count of distinct rules failed, not an array). The v1.18.0 extractor's fallback chain included `details.failedRules` as an array source; if `details.ruleSummaries` were ever missing while `details.failedRules` were present, `.map()` would throw on the number. **Fix:** removed the unsafe fallback; reordered the chain newest-first (`details.ruleSummaries` → `validation.ruleSummaries` → `validation.failedRules`).
- **P3 / fixed**: `totalFailureCount` under-reported failures on heavily-non-compliant PDFs because it summed only the displayed (top-20) rule summaries instead of using veraPDF's own aggregate. **Fix:** prefer `details.failedChecks` (server-reported total) when present; sum-the-list fallback retained for older versions.
- **P3 / fixed**: "Fix steps" links on the remediation result page were dead. The `IssuesSummary` component built `#cat-<id>` anchors that only exist on the audit pages (`index.vue`, `report/[id].vue`), so `document.getElementById()` returned `null` and clicks silently failed. Not a security finding — user-facing UX bug. **Fix:** rewrote each row as an inline accordion (`<button>` with `aria-expanded` / `aria-controls`) that reveals the findings list + numbered Acrobat fix steps directly. Same `partitionCardFindings` data source as the audit-page cards.
- **Operational hardening / added**: `rebuild.sh` preflight now auto-detects veraPDF at four common install paths and prints copy-paste Ubuntu install instructions when it isn't found, including the `/etc/environment` persistence command so PM2 inherits the path across reboots. Reduces operator drift between dev and production veraPDF installs.

### v1.18.0 — 2026-05-18 · PDF auto-remediation feature

Reviewed the full remediation surface (API routes, worker, frontend, cleanup sweep, database schema).

- **P1 / fixed**: Download endpoint loaded the full output PDF (up to 50 MB) into memory before sending. Could OOM the API process under concurrent downloads given the 512 MB PM2 cap. **Fix:** switched to `createReadStream` + `stream.pipe(res)`. Memory footprint per download is now constant regardless of output size.
- **P1 / fixed**: Concurrent download requests could both pass the token check and both retrieve the file before either completed, violating the single-use guarantee. **Fix:** `setExpired(job.id)` is now called before the response stream is started, so concurrent requests see `status='expired'` and get `410 Gone`.
- **P2 / mitigated**: When `AUTH.REQUIRE_LOGIN=false` (dev/internal mode), the per-job email guard on `/status`, `/download`, and `/receipt` is bypassed; a caller with a known UUID jobId could read job data. **Mitigation:** UUIDv4 jobIds (122 bits of entropy) make enumeration impractical; production runs with `REQUIRE_LOGIN=true`. **Status:** documented as the established posture in `docs/archive/pdf-remediation-integration-plan.md` § Security.
- **P2 / accepted**: Adobe Acrobat parity scoring is still computed server-side even though the UI no longer surfaces it. ~50 ms per audit. **Status:** intentional — keeps the data shape stable for existing tests and audit-log entries. May remove in a later release if the cost matters.
- **P3 / accepted**: `qpdf --check` can flag some borderline-valid outputs as warnings, which we treat as failures. **Status:** preferred over the alternative — better to reject a borderline file than serve a damaged one.
- **Pre-launch items still open**: external penetration test on the remediation surface; full Vitest coverage for the remediation pipeline (`remediation.test.ts`, `remediation-privacy.test.ts`, `remediation-receipt.test.ts`). Tracked in the Phase 4 roadmap.

### v1.17.0 and earlier

Security reviews for prior releases were not yet captured in this format. Going forward, every release lists findings and fixes here. Earlier releases focused on the synchronous audit pipeline and authentication flow; review history is available via commit messages on `main`.

</details>

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full list of changes by version, or view [releases on GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

## License

MIT License. Copyright (c) 2026 Christopher Schweda. See [LICENSE](LICENSE) for details.

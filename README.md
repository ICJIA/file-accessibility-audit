# ICJIA File Accessibility Audit

[![Version](https://img.shields.io/badge/version-1.27.0-blue)](https://github.com/ICJIA/file-accessibility-audit/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) ![Tests](https://img.shields.io/badge/tests-803%20passing-brightgreen) ![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white) ![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Audits: WCAG 2.2 AA](https://img.shields.io/badge/audits-WCAG%202.2%20AA-blueviolet)

![ICJIA File Accessibility Audit](apps/web/public/og-image.png)

**Production URL:** https://audit.icjia.app | **Source:** https://github.com/ICJIA/file-accessibility-audit

A web tool that **audits and (optionally) remediates** PDF accessibility against [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/) (a strict superset of [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/), the legal minimum under [IITAA 2.1 §E205.4](https://doit.illinois.gov/initiatives/accessibility.html) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/)), and [Illinois IITAA 2.1](https://doit.illinois.gov/initiatives/accessibility.html) — all on infrastructure you control, with no AI and no per-document fees. To revert to WCAG 2.1 labels: set `WCAG_VERSION=2.1` and redeploy (API reverts on restart; web UI on rebuild).

## What it does

| | Feature | Detail |
|---|---------|--------|
| **9** | WCAG categories audited | Each PDF scored across 9 accessibility categories — a weighted 0–100 score (A–F grade) plus a separate, binary pass/fail **WCAG 2.2 conformance verdict**. |
| **F → A** | Auto-remediation (optional) | Tag untagged PDFs in seconds: qpdf → [OpenDataLoader](https://github.com/opendataloader-project/opendataloader-pdf) → [veraPDF](https://verapdf.org/). Output is rejected if it regresses the score. Manual review still recommended for IITAA compliance. |
| **PDF/UA-1** | Standards aligned | WCAG 2.2 AA (superset of 2.1 AA), ADA Title II (April 2026), Illinois IITAA 2.1, PDF/UA-1 via veraPDF. Full lifecycle audit trail with `fs.stat`-verified deletion events for compliance reporting. |
| **0** | PDFs retained | Audit: in-memory only, gone in seconds. Remediation: output deleted on first download or 30-minute TTL, then verified absent. |
| **$0** | No AI, no third-party APIs | Every step runs on your own server. No data sent to vision models, hosted AI services, or commercial PDF SDKs. |
| **100%** | Open source | Apache 2.0 / MIT / MPL toolchain. No per-document fees, no SDK licensing. Designed for state agencies that need control over their pipeline. |
| **3** | PDFs per batch | Upload up to 3 PDFs at once; per-tab remediation. `POST /api/analyze-url` for programmatic auditing of public PDFs. |
| **4** | Export formats | Text / HTML / Markdown / JSON report exports. 1-year shareable links (no login required to view). |

Auto-remediation is **disabled by default** — set `REMEDIATION_ENABLED=true` in your environment to enable. Architectural details in [docs/archive/pdf-remediation-integration-plan.md](docs/archive/pdf-remediation-integration-plan.md); the Phase 1 follow-on (interactive alt-text walkthrough) is specced in [docs/archive/pdf-remediation-alt-text-walkthrough-spec.md](docs/archive/pdf-remediation-alt-text-walkthrough-spec.md).

The intended workflow is: **upload → review findings → either auto-remediate or fix at the source (Word, InDesign, etc.) and re-export → re-upload to verify.** Manual review remains essential for full IITAA compliance regardless of which path is taken — the tool's job is to find issues and reduce the manual remediation surface, not replace human review.

## Contents

New here? The live tool is at **[audit.icjia.app](https://audit.icjia.app)**; this README is the technical companion. Jump to:

- **Overview** — [What it does](#what-it-does) · [Scoring rubric](#scoring-rubric)
- **Run it** — [Quick Start](#quick-start) · [Authentication](#authentication) · [Configuration](#configuration) · [Deployment](#deployment)
- **APIs & automation** — [Batch Upload](#batch-upload) · [Analyze from URL](#analyze-from-url) · [Fleet PDF Auditing](#fleet-pdf-auditing) · [Bulk Inventory Scoring](#bulk-inventory-scoring) · [Personal Access Tokens](#personal-access-tokens-pats) · [CLI Tool](#cli-tool)
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
pnpm dev        # Start API + Web dev servers
pnpm build      # Type-check API + build Nuxt frontend
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

Each PDF is assessed across named accessibility categories based on [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) (a strict superset of [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. Categories that don't apply to a document (e.g., tables in a document with no tables) are excluded and the remaining weights are renormalized.

### One score, and a separate conformance verdict

Every audit produces **two distinct things**, and the distinction is deliberate:

**A 0–100 score (A–F grade).** A weighted, partial-credit *prioritised-readiness* metric across nine WCAG-aligned categories — it shows how close a document is and what to fix first. The score is anchored to **WCAG 2.2 Level AA** (a strict superset of WCAG 2.1 AA, the legal minimum under **Illinois IITAA 2.1 §E205.4** and **ADA Title II**). Automated checks and score weights are unchanged from WCAG 2.1; the new 2.2 criteria are interactive/manual and are shown separately as "not assessed — manual review".

**A WCAG 2.2 conformance verdict.** A separate, binary pass/fail. WCAG conformance is all-or-nothing per success criterion — one image without alt text fails 1.1.1 (Level A) outright — so a weighted score with partial credit *cannot* be a conformance claim. A document can score 90+ ("A") and still fail WCAG. The verdict reports confirmed, machine-checkable failures, each linked to its W3C "Understanding" page; when it finds none it says exactly that — **not** "conformant", because color contrast and the *correctness* of alt text, headings, reading order, and tags require manual review. When an analyzer cannot process a file (encrypted or damaged), the verdict honestly reports that no verdict could be determined rather than guessing.

> Cite the **score** for tracking remediation progress; cite the **conformance verdict** for the pass/fail compliance question. Neither replaces review by a human accessibility specialist — pair the audit with PAC 2024 and an Adobe Acrobat Accessibility Full Check for a definitive determination.

> **Note —** prior to v1.21.0 the tool surfaced a second "Practical" (PDF/UA-flavoured) score profile alongside Strict. It was retired because auditors found two profiles confusing; PDF/UA-1 conformance is now verified authoritatively by the optional [veraPDF](https://verapdf.org/) check on the remediation result page. The score described here is the single canonical score.

### Categories & Weights

Nine categories, weighted by WCAG conformance level and user impact. Categories that don't apply to a document (no tables, no forms, etc.) are excluded and the remaining weights renormalized. Each category is mapped to the exact WCAG success criteria it evaluates — all carried forward unchanged from WCAG 2.1 into 2.2.

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
| Color Contrast | not scored | 1.4.3 (AA) | Rendered-PDF contrast analysis is not yet implemented. Surfaced as **"Not assessed"** — never as a pass — so the report never implies contrast was checked. |
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

Upload up to **3 PDF files** at once. Files are analyzed in parallel (2 at a time) and results are displayed in a tab bar — click any tab to see its full report, export, or share.

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
| Rate limit          | 500/hour per IP (5000/hour with a privileged token) | Server (`analyzeLimiter`) |

**Note:** `BATCH.MAX_FILES` in `audit.config.ts` is the canonical constant (currently 5). The frontend DropZone also enforces this limit client-side.

## Analyze from URL

`POST /api/analyze-url` — audits a PDF by URL instead of upload. Two surfaces:

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
| Max PDF size | 15 MB | Fetched content (matches the direct-upload cap as of v1.27.0) |
| Fetch timeout | 30 s | Same as bulk-from-inventory |
| Rate limit | shared with `/api/analyze` (`analyzeLimiter`) | |

## Fleet PDF Auditing

`POST /api/audit-url` — combined "audit a PDF by URL **and** persist a shareable report" endpoint — designed for fleet-audit automation that emits one row per PDF into an HTML/CSV inventory and needs both the scores and a stable link to the full report.

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

`cached: true` indicates a hash-dedup hit — same PDF content was previously audited by the same caller, the existing `reportUrl` is being returned, and no new audit ran. `false` indicates a fresh audit + persist.

### Hash dedup (Policy A)

After fetching the PDF the server computes `sha256(bytes)` and looks for an unexpired `shared_reports` row matching the same hash for the same caller. On a hit, the cached `reportId` / `reportUrl` are returned and no new audit runs — your quarterly fleet runs will return the same URL for unchanged PDFs (clean CSV diffs).

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

Same as `/api/analyze-url` (15 MB PDF cap, 30-second fetch timeout, `analyzeLimiter` rate limit). Same SSRF allowlist applies — extend via `ANALYZE_URL_ALLOWED_HOSTS` env var when adding sites to the fleet inventory.

## Bulk Inventory Scoring

`POST /api/bulk-from-inventory` — accepts a [filecap](https://github.com/ICJIA/filecap-cli) NDJSON inventory and scores every PDF in it server-side in one request. The server fetches each PDF by its public URL, runs the existing `analyzePDF` pipeline, saves a shareable report, and returns a manifest with per-file scores, grades, and report links.

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
| Max PDF size            | 15 MB    | Per-file limit, matches `ANALYSIS.MAX_FILE_SIZE_MB`      |
| Fetch timeout           | 30 s     | Per PDF; timed-out entries are recorded as errors        |
| Rate limit              | shared with `/api/reports` (10/hour per user)            |

### Considerations

- **Serial processing.** PDFs are scored one at a time to respect the 2-at-a-time semaphore in `pdfAnalyzer.ts`. Large inventories (50+ PDFs) can take several minutes inside a single HTTP request.
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

## Report Exports

Reports can be downloaded in four formats, all with links back to [audit.icjia.app](https://audit.icjia.app):

| Format             | Contents                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Text (.txt)**    | Plain-text report with score, conformance verdict, category scores, and detailed findings — opens in any editor, no dependencies |
| **HTML (.html)**   | Standalone dark-themed page with full report — works offline, printable                        |
| **Markdown (.md)** | Plain-text report with tables and findings — works in any text editor or docs platform         |
| **JSON (.json)**   | Machine-readable v2.0 schema with WCAG mappings, remediation plan, and LLM context (see below) |

Reports can also be shared via **shareable links** that expire after 1 year. Shared report pages include:

- **Export buttons** — download the report as Text, Markdown, or JSON directly from the shared link
- **CTA to audit tool** — "Audit Your PDF" button linking back to the live tool
- **Methodology card** — "How Scores Are Derived" section with links to QPDF and PDF.js (Mozilla) docs, WCAG 2.2 and ADA Title II references, and a link to the full scoring rubric
- **Recommendation card** — a prominent Strict vs Practical explainer near the score hero that recommends Strict for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review
- **Per-category WCAG references** — every scored category card shows a dedicated "WCAG 2.2 References" panel listing the exact success criteria the score is tied to (id, name, Level A/AA), with each row linking to the official W3C Understanding document so reviewers can verify the grade against the standard
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

**880 tests** across 46 test files. Run all with a summary at the end:

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
  ✔ API      510 passed (20 files)
  ✔ Web      317 passed (20 files)
────────────────────────────────────────────────────────────
  ✔ 880 tests passed across 46 files
════════════════════════════════════════════════════════════
```

### API Tests (510 tests)

| File | Tests | What it covers |
| --- | ---: | --- |
| `scorer.test.ts` | 142 | All scoring categories, grade/severity thresholds, N/A handling, weight renormalization, executive-summary generation, the WCAG conformance gate, table header-association credit via `/Scope` or `/Headers`, table caption credited as a non-blocking note, filename-like titles earning partial credit without a false 2.4.2 failure, help-link accuracy (version-matched W3C Understanding URLs, no broken WebAIM anchors), and supplementary findings (list markup, marked content, font embedding, empty pages, role mapping, tab order, language spans, paragraph count, PDF/UA identifier, artifact tagging, ActualText & expansion text, the Acrobat fix guide) |
| `qpdfParser.test.ts` | 94 | QPDF JSON parsing: StructTreeRoot/Lang/Outlines/AcroForm detection, heading tags (H1-H6 + generic /H) collected in document/reading order, table analysis (TH/scope/rows/nesting/caption/columns/headers) with nested tables excluded from the top-level count and ColSpan/RowSpan-aware column consistency, list analysis (LI/Lbl/LBody — LBody required, Lbl advisory), multi-widget form fields (radio groups collapse to one field with /TU from the parent), MarkInfo, RoleMap, tab order, font embedding, paragraph/language spans, figure alt text, MCID content ordering, outline counting, tree depth, PDF/UA identifier, artifact tagging, ActualText & expansion text, malformed JSON, qpdf exit-code-3 recovery (warnings with valid stdout JSON), and real qpdf-v2 `obj:`-key fixtures |
| `analyze-url.test.ts` | 38 | Analyze-from-URL: SSRF prevention (private/local-address blocking), scheme validation, allowlist enforcement, and route-level input/PDF validation and fetch-error handling |
| `integration.test.ts` | 28 | End-to-end PDF analysis: accessible/inaccessible fixture scoring, category completeness, grade/severity validation, comparative scoring, and malformed-PDF handling |
| `tokens.test.ts` | 27 | Personal access tokens: token generation, name sanitization, the PAT branch of the auth middleware, and the create/list/revoke `/api/tokens` endpoints |
| `auth.test.ts` | 25 | JWT middleware (missing/invalid/expired/wrong-algorithm tokens), admin middleware (role checking, case sensitivity), and email-domain validation |
| `audit-url.test.ts` | 18 | Fleet `audit-url` endpoint: profile-score extraction, report-URL building, Policy-A hash dedup, response shape, and filename derivation |
| `bulk-from-inventory.test.ts` | 10 | Bulk inventory scoring: input validation, NDJSON parsing, and result-structure assertions |
| `adobeParity.test.ts` | 6 | The Adobe Acrobat parity report builder - the 32-rule mapping is still computed and persisted for backward compatibility, though no longer surfaced in the UI |
| `mailer.test.ts` | 6 | Email config validation: production exits without credentials, development warns but continues, provider-info logging |
| `pdfjsTitle.test.ts` | 33 | The filename-like-title classifier: flags real filename/tool-generated titles ("report_v3_final.pdf", "Microsoft Word - …", "scan_20240115") while preserving legitimate one-word titles ("Introduction", "Budget2024", "COVID-19", "Section-508") that the old heuristic erased, plus real-pdfjs wiring tests proving the /Info title is preserved with only the advisory flag set |
| `conformance.test.ts` | 6 | WCAG conformance gate: version-flag switching between 2.1 and 2.2 criterion sets, form-field gating for 2.2-only criteria, and 1.3.2 Meaningful Sequence asserted only from the rigorous MCID order comparison (never from heuristic category scores) |
| `qpdfNormalize.test.ts` | 5 | Remediation normalize step: qpdf exit 3 (repaired recoverable damage, output written) counts as success, mirroring the audit's exit-3 recovery; hard failures still throw; a wall-clock timeout is passed to qpdf |
| `veraPdf.test.ts` | 4 | veraPDF JSON verdict extraction: rule identifiers built from clause + test number (never the "FAILED" status string), per-rule counts, and the authoritative failed-checks total |
| `pdfuaXmp.test.ts` | 3 | PDF/UA identifier detection from XMP through real pdfjs parsing — element form and RDF attribute form (`pdfuaid:part="1"`), which pdfjs's own parser misses |
| `safeFetch.test.ts` | 25 | SSRF private-IP classifier: IPv4 reserved ranges, IPv6 loopback/link-local/ULA, and the bracketed / IPv4-mapped IPv6 forms that previously failed open (`[::1]`, `[::ffff:127.0.0.1]`, hex-mapped) |
| `pageAuditGuard.test.ts` | 8 | The headless-browser SSRF interceptor's decision logic: data:/blob:/about: allowed, non-http(s) blocked, document navigations allowlist-gated (open-redirect targets rejected), subresources IP-checked but not allowlist-gated, and the private-IP check still forced when a privileged token bypasses the allowlist |
| `rateLimiter.test.ts` | 12 | The privileged bearer-token tier: constant-time `isPrivilegedRequest` (missing / wrong / empty / prefix / over-length tokens, and feature-off when unset), tier selection (strict per-IP vs generous shared bucket), and a live limiter test proving a token exceeds the anonymous cap on the same IP |
| `authConfig.test.ts` | 4 | Fail-closed startup check: the API refuses to boot when login is enabled with a missing or dev-default `JWT_SECRET` |
| `pdfAnalyzerTimeout.test.ts` | 2 | The in-process pdfjs parse timeout abandons a pathological document and frees its concurrency slot |

### Web Tests (317 tests)

| File | Tests | What it covers |
| --- | ---: | --- |
| `color-mode.test.ts` | 51 | Light-mode WCAG 2.1 contrast (all text/background combinations), dark-mode contrast validation, CSS variable definitions in both `:root` and `html.light`, color-mode toggle, no hardcoded dark-only colors in templates, branding-configuration checks |
| `responsive.test.ts` | 50 | Responsive layout across mobile navigation, layout padding, ScoreCard, CategoryRow, the index/report/history pages, CSS transitions, and the scoring modal |
| `accessibility.test.ts` | 38 | WCAG 2.1 color-contrast verification for dark and light modes (4.5:1 minimum across all text/background combinations), regression guards against low-contrast classes, semantic HTML landmarks, link accessibility, and component-level a11y |
| `components.test.ts` | 36 | DropZone (drag/drop, multi-file PDF validation, size limits, batch staging), ScoreCard (grade display, recommendation copy, color coding for all five grades), CategoryRow (score bars, severity badges, expand/collapse findings, N/A display), ProcessingOverlay |
| `scoring-display.test.ts` | 30 | Grade color mapping (A-F), N/A category rendering, severity badges, the conformance-verdict explanation, and detailed-findings display |
| `findings.test.ts` | 14 | Findings utilities: guidance-vs-actionable finding classification and per-card finding partitioning |
| `login.test.ts` | 13 | Two-step OTP flow (email then code), API-call verification, error handling, back navigation |
| `ai-analysis.test.ts` | 12 | `buildAiAnalysis` - AI-analysis export and prompt generation, and remediation-focused output |
| `ReportActionBanner.test.ts` | 10 | The ReportActionBanner component - report-page action banner |
| `reportExportBanner.test.ts` | 11 | The exported report banners - Markdown leads with the filename as its H1, the HTML export's banner sits above the title and keeps the filename in the document title, and the plain-text export leads with the filename |
| `scoring-profiles.test.ts` | 9 | The `scoringProfiles` utility - scoring-profile selection and per-category resolution |
| `ReportFileBanner.test.ts` | 7 | The ReportFileBanner component - the prominent filename banner (eyebrow label, bold filename, page/type line, scanned chip, long-name wrapping) |
| `AnnouncementBanner.test.ts` | 7 | The AnnouncementBanner component - permanent dismissal per announcement id, localStorage key scoping, and re-show after clear |
| `usePrefill.test.ts` | 7 | The `usePrefill` composable: URL `?prefill` handling, happy path, error handling, and URL-decoding edge cases |
| `IssuesSummary.test.ts` | 5 | The IssuesSummary component - issue-count summary |
| `pdfUaSignalsCard.test.ts` | 3 | The PDF/UA-1 conformance-signals panel - signal rows, identifier presence, and signals-vs-verdict framing |
| `na-cell.test.ts` | 3 | The NaCell component - accessible "Not applicable" vs "Not assessed" rendering |
| `reportBanner.test.ts` | 3 | The `reportBanner` helper - the shared eyebrow label and the singular/plural `N pages · PDF` line |
| `severityTally.test.ts` | 3 | The `tallySeverity` utility - per-severity finding counts |

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

See [docs/archive/04-deployment-guide.md](docs/archive/04-deployment-guide.md) for full instructions (server setup, nginx config, firewall, SSL). Short version:

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

The application undergoes a security review before every release plus periodic standalone comprehensive audits; the running history is in [Review history](#review-history) below. Current posture:

- **Auth is optional** — all other protections apply regardless of the auth toggle; the API fails closed at startup if login is enabled without a strong `JWT_SECRET`.
- **Files processed in memory** — the QPDF temp file is written under a random name and deleted in the same request, even on failure.
- **No shell** — QPDF / OpenDataLoader / veraPDF are invoked via `execFile` with array arguments; user-supplied filenames never reach a shell or a path component.
- **SSRF-hardened URL fetching** — URL and fleet PDF fetches resolve DNS in-process, reject private/reserved IPs (IPv4 + IPv6), pin the connection to the validated IP, and re-validate every redirect hop; the headless-browser page-audit path enforces the same private-IP block on every request via a Chromium interceptor.
- **Bounded work** — per-request size caps (including a per-part uncompressed-size cap on `.docx` to stop decompression bombs), a 2-slot analysis semaphore shared by the PDF and Word paths, pdfjs and docx parse/analysis timeouts, and an enforced wall-clock timeout (with process-group kill) on the remediation worker.
- **Two-tier rate limiting** on the audit endpoints — strict per-IP for anonymous callers (500/hr analyze, 100/min global), generous for callers presenting a valid `API_PRIVILEGED_TOKEN` (5000/hr, 1000/min) — plus **Helmet + nginx headers** on the API and a **Content-Security-Policy** on the web app; **CORS** locked to a single origin in production.
- **Privileged API token** (`API_PRIVILEGED_TOKEN`, optional) — a single static bearer token that unlocks the generous rate tier **and** lets a trusted client audit URLs outside the ICJIA / illinois.gov allowlist. It never bypasses the private/reserved-IP SSRF block, the size caps, or the concurrency semaphores; constant-time compare; unset = feature off (everyone strict).
- Full security model: **docs/archive/00-master-design.md, Section 9**.

### Batch upload security

Batch processing adds **no new server-side attack surface**. Each file in a batch is an independent HTTP request to the existing `/api/analyze` endpoint, subject to all existing protections:

| Threat                         | Mitigation                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bypassing the 3-file limit** | The limit is UX (frontend). The real server-side gates are the per-caller analyze rate limit (`RATE_LIMITS.analyze`) and the global per-IP catch-all (`RATE_LIMITS.global`); a client sending more requests just hits those faster, and the 2-slot analysis semaphore caps actual concurrent work regardless. |
| **Memory exhaustion**          | Server semaphore caps concurrent analyses at 2 regardless of how many requests arrive. Max server memory: 2 × 15 MB = 30 MB (unchanged from single-file mode).   |
| **Filename / document-text XSS** | Filenames and all PDF- and Word-derived text (title, alt text, link text, headings) render via Vue `{{ }}` interpolation (auto-escaped). The few `v-html` sinks are fed only by escaped or non-document data, and HTML exports run every string **and** numeric/grade field through a shared `escapeHtml` helper (verified in the 2026-06-10 and 2026-07-01 audits). Server also sanitizes filenames before storage. |
| **Race conditions**            | JavaScript is single-threaded; the batch worker's `nextIndex++` cannot race. Server semaphore uses a FIFO queue.                                                 |
| **Auth bypass during batch**   | Each request carries the JWT cookie. A 401 on any request immediately navigates to login and abandons remaining items.                                           |
| **Concurrent upload flood**    | Frontend limits to 2 concurrent requests. Even if bypassed, server semaphore queues extras. Rate limiter applies per-IP.                                         |

### Review history

Reviewed before every release, with periodic standalone comprehensive audits. Most recent first — the latest is shown in full; earlier per-release reviews are collapsed to cut visual noise.

### v1.30.0 — 2026-07-01 · Word (.docx) accessibility checker + adversarial red/blue audit

The new Word (`.docx`) audit path introduced fresh untrusted-input attack surface — a `.docx` is a user-supplied ZIP of XML parsed in-process with `jszip` + `fast-xml-parser`. A three-front adversarial review (ZIP/XML parsing, denial-of-service/concurrency, and injection/XSS/dispatch/auth) drove every finding against the actual code and the installed library sources; all confirmed issues were fixed test-first before this release. 880 tests pass; `tsc --noEmit` and `nuxt build` clean.

**Headline: the classic XSS vector was already closed.** A malicious document's title, alt text, link text, and headings flow into findings and render on the live page, the shared-report page, and the exports — but every docx-derived string reaches the client only through Vue's auto-escaping `{{ }}` or the shared `escapeHtml` helper, and the raw docx link URLs / alt text are never returned to the browser at all. The v1.27.0 escaping discipline held for the new format.

**Verified already-safe in the parser** (`fast-xml-parser` 5.9.3, checked against the installed source): external-entity XXE (the library throws on `SYSTEM`/parameter entities), billion-laughs entity expansion (nested entities dropped; hard caps on entity size/count), prototype pollution (`__proto__`/`constructor` tag names throw; attribute/entity maps are null-prototype), deep-nesting stack overflow (`maxNestedTags: 100`), and zip-slip (parts are read from fixed literal paths and never written). ReDoS was cleared — the docx regexes have no catastrophic backtracking.

**Fixed in v1.30.0:**

- **Decompression-bomb DoS (the one critical).** `jszip` enforces no uncompressed-size ceiling, so a sub-1 MB upload could inflate `word/document.xml` to multiple GB and OOM the process. Every ZIP part is now read through a streaming reader that checks the ZIP's declared uncompressed size **and** enforces a hard `DOCX.MAX_UNCOMPRESSED_BYTES` (30 MB) budget *during* decompression — the declared size is attacker-controlled, so the streaming abort is the real guard. The same cap applies to the content-type sniff in `detectFileType`.
- **DOCX analysis is now resource-bounded like PDF.** The docx branch previously bypassed the audit pipeline's concurrency semaphore and wall-clock timeout; it now shares the same 2-slot `MAX_CONCURRENT_ANALYSES` semaphore and a `DOCX.ANALYSIS_TIMEOUT_MS` (20 s) timeout (routes already map 503/504), and a `DOCX.MAX_PARAGRAPHS` (100k) cap bounds the extract passes against a document that fits the byte cap but is millions of tiny elements.
- **HTML-export XSS via non-string fields.** The downloadable HTML report interpolated score / grade / overall-score / page-count / grade-label values without escaping, while `/api/reports` stored arbitrary caller JSON (`gradeLabel` echoes an unknown grade verbatim). All such sinks now run through `escapeHtml`, and the report store type-validates `filename` / `overallScore` before persisting. Bounded to the downloaded file's `file://` origin (never the app origin), so it could not reach the app session — fixed regardless. Not docx-specific, surfaced by the audit.
- **URL-route info leak.** `/api/analyze-url`'s catch-all no longer echoes the raw `err.message` to the client (it could leak library/path internals); the detail is logged server-side only, matching the upload route.

Per responsible-disclosure practice, step-by-step exploit detail is held privately. The nonce-based `script-src` follow-up (drop `'unsafe-inline'`) remains tracked.

<details>
<summary><strong>Previous security reviews</strong> (per-release, v1.29.0 and earlier) — click to expand</summary>

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

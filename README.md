# File Accessibility Audit

![File Accessibility Audit](apps/web/public/og-image.png)

**Production URL:** https://audit.icjia.app

A web tool that scores PDF accessibility readiness against [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. Upload a PDF, get an instant grade (A–F) with category-by-category findings and remediation guidance.

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

## Authentication (Optional)

Authentication is **off by default**. The app can be used without any login, email provider, or credentials. This is controlled by a single toggle in `audit.config.ts`:

```ts
export const AUTH = {
  REQUIRE_LOGIN: false,  // ← set to true to enable OTP authentication
  // ...
}
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

| Provider | Docs |
|----------|------|
| Mailgun (default) | [docs/07-mailgun-integration.md](docs/07-mailgun-integration.md) |
| SMTP2GO | [docs/06-smtp2go-integration.md](docs/06-smtp2go-integration.md) |

The provider is controlled in `audit.config.ts` → `EMAIL.PROVIDER`. Credentials go in `apps/api/.env`:

```env
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password
```

**To switch providers**, change one line in `audit.config.ts`:

```ts
PROVIDER: 'mailgun'   // ← change to 'smtp2go' to switch
```

Host and port are set automatically per provider.

**Dev note:** When running locally with auth enabled, OTP codes are printed to the API console — no email credentials needed for development.

## Scoring Rubric

Each PDF is scored across **9 accessibility categories** based on [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) and [ADA Title II](https://www.ada.gov/resources/title-ii-rule/) requirements. Categories that don't apply to a document (e.g., tables in a document with no tables) are excluded and the remaining weights are renormalized.

### Categories & Weights

| Category | Weight | Why It Matters |
|----------|:------:|----------------|
| Text Extractability | 20% | **WCAG 1.3.1** — The most fundamental requirement. If a PDF is a scanned image with no real text, screen readers have nothing to read. No other fix matters until this is resolved. |
| Title & Language | 15% | **WCAG 2.4.2 & 3.1.1** — The document title is the first thing a screen reader announces. The language tag controls pronunciation. Both are required under Title II. |
| Heading Structure | 15% | **WCAG 1.3.1 & 2.4.6** — Headings (H1–H6) are the primary way screen reader users navigate and skim documents, equivalent to how sighted users scan bold section titles. |
| Alt Text on Images | 15% | **WCAG 1.1.1** — Every informative image must have a text alternative. Without it, blind users get no indication of what the image shows. |
| Bookmarks | 10% | **WCAG 2.4.5** — For documents over 10 pages, bookmarks provide a navigable table of contents. Required under Title II for longer documents. |
| Table Markup | 10% | **WCAG 1.3.1** — Without header cells (TH), screen readers read table data in a flat stream with no way to identify which column or row a value belongs to. |
| Link Quality | 5% | **WCAG 2.4.4** — Raw URLs are meaningless when read aloud. Descriptive link text tells users where a link goes without needing to see the URL. |
| Form Fields | 5% | **WCAG 1.3.1 & 4.1.2** — Unlabeled form fields are unusable with assistive technology. Users hear "text field" with no indication of what to enter. |
| Reading Order | 5% | **WCAG 1.3.2** — The tag structure must define a logical reading sequence. Without it, screen readers may announce sidebar content before the main body. |

### Grade Scale

| Grade | Score Range | Label |
|:-----:|:----------:|-------|
| **A** | 90–100 | Excellent |
| **B** | 80–89 | Good |
| **C** | 70–79 | Needs Improvement |
| **D** | 60–69 | Poor |
| **F** | 0–59 | Failing |

### Severity Levels

Each category receives a severity based on its individual score:

| Severity | Score Range | Meaning |
|----------|:----------:|---------|
| Pass | 90–100 | Meets accessibility standards. |
| Minor | 70–89 | Small improvements recommended. |
| Moderate | 40–69 | Should be addressed before publishing. |
| Critical | 0–39 | Must be fixed — represents a significant barrier to access. |

### Reference Standards

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ADA Title II Final Rule (2024)](https://www.ada.gov/resources/title-ii-rule/)
- [Section 508 Standards](https://www.section508.gov/manage/laws-and-policies/)
- [PDF/UA (ISO 14289-1)](https://pdfa.org/resource/pdfua-in-a-nutshell/)

Scoring aligns with WCAG 2.1 Level AA success criteria and ADA Title II digital accessibility requirements effective April 2026. All scoring constants live in `audit.config.ts`.

## Project Structure

```
file-accessibility-audit/
├── apps/
│   ├── web/            # Nuxt 4 frontend
│   └── api/            # Express API server
├── docs/               # Design documents (see below)
├── tests/
│   └── fixtures/       # Known test PDFs for scoring validation
├── audit.config.ts     # Single source of truth for all constants
├── ecosystem.config.cjs # PM2 config (production)
├── pnpm-workspace.yaml
└── .nvmrc              # Node.js version
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Nuxt 4 / Nuxt UI 4 / Dark mode only |
| API | Express / TypeScript |
| PDF Analysis | QPDF (structure tree) + pdfjs-dist (text/metadata) |
| Database | SQLite via better-sqlite3 (audit logs only) |
| Auth | Optional email OTP → JWT (httpOnly cookie) |
| Email | Mailgun (default) / SMTP2GO (alternative) / Nodemailer |
| Deployment | DigitalOcean → Laravel Forge → PM2 → nginx |

## Configuration

All magic numbers, thresholds, weights, limits, and email provider settings are in **`audit.config.ts`** at the project root. This is the single source of truth — the API imports it directly, and the docs reference it.

- **Auth toggle** → `AUTH.REQUIRE_LOGIN` (`true` or `false`)
- **Scoring weights** → `SCORING_WEIGHTS`
- **Email provider** → `EMAIL.PROVIDER` (`'mailgun'` or `'smtp2go'`)
- **Rate limits** → `RATE_LIMITS`
- **Dev/prod URLs** → automatic based on `NODE_ENV`

Secrets (`JWT_SECRET`, `SMTP_PASS`) stay in `.env` — never in config.

## Design Documents

| Doc | Description |
|-----|-------------|
| [00 — Master Design](docs/00-master-design.md) | Architecture, scoring model, API, auth, security |
| [01 — Phase 1: Core Grader](docs/01-phase-1-core-grader.md) | Phase 1 deliverables and testing checklist |
| [02 — Phase 2: Enhanced Features](docs/02-phase-2-enhanced-features.md) | DOCX, batch upload, shareable reports |
| [03 — Phase 3: Admin & Monitoring](docs/03-phase-3-admin-monitoring.md) | Admin dashboard, scheduled re-checks |
| [04 — Deployment Guide](docs/04-deployment-guide.md) | Infrastructure, env vars, nginx, firewall |
| [05 — Use Cases](docs/05-use-cases.md) | End-user scenarios and workflows |
| [06 — SMTP2GO Integration](docs/06-smtp2go-integration.md) | Email provider setup and gotchas |
| [07 — Mailgun Integration](docs/07-mailgun-integration.md) | Mailgun setup (default provider) |

## Tests

**208 tests** across 7 test files. Run all with a summary at the end:

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
  ✔ API      141 passed (4 files)
  ✔ Web      67 passed (3 files)
────────────────────────────────────────────────────────────
  ✔ 208 tests passed across 7 files
════════════════════════════════════════════════════════════
```

### API Tests (141 tests)

| File | Tests | What it covers |
|------|------:|----------------|
| `scorer.test.ts` | 76 | All 9 scoring categories, grade/severity thresholds, N/A handling, weight renormalization, executive summary generation, edge cases (scanned PDFs, mixed results, hierarchy skips, partial alt text, disorder ratio) |
| `qpdfParser.test.ts` | 34 | QPDF JSON parsing: StructTreeRoot/Lang/Outlines/AcroForm detection, heading tags (H1–H6 + generic /H), table TH header detection, figure alt text, MCID content ordering, outline counting, tree depth, malformed JSON |
| `auth.test.ts` | 25 | JWT middleware (missing/invalid/expired/wrong-algorithm tokens), admin middleware (role checking, case sensitivity), email domain validation (illinois.gov, subdomains, rejection of non-gov domains, ALLOWED_DOMAINS dev override) |
| `mailer.test.ts` | 6 | Email config validation: production exits without credentials, development warns but continues, provider info logging |

### Web Tests (67 tests)

| File | Tests | What it covers |
|------|------:|----------------|
| `components.test.ts` | 33 | DropZone (drag/drop, PDF validation, file size limits), ScoreCard (grade display, color coding for all 5 grades, score/filename/summary), CategoryRow (score bars, severity badges, expand/collapse findings, N/A display), ProcessingOverlay (spinner, stage messages) |
| `login.test.ts` | 13 | Two-step OTP flow (email → code), API call verification, error handling, back navigation |
| `scoring-display.test.ts` | 21 | Grade color mapping (A–F), N/A category rendering, severity badge colors (Pass/Minor/Moderate/Critical) |

## Deployment

**Target:** DigitalOcean droplet (2 vCPU / 4GB RAM, ~$24/mo) → Laravel Forge → PM2 → nginx

See [docs/04-deployment-guide.md](docs/04-deployment-guide.md) for full instructions (server setup, nginx config, firewall, SSL). Short version:

```bash
pnpm install --frozen-lockfile
pnpm --filter api build
pnpm --filter web build
pm2 restart ecosystem.config.cjs --update-env
```

## Security

- **Auth is optional** — all other security protections apply regardless of the auth toggle
- Files processed in memory (QPDF temp file deleted immediately)
- `execFileSync` (no shell) for QPDF invocation
- Rate limiting on all endpoints
- Helmet + nginx security headers
- CORS locked to same origin in production
- See **docs/00-master-design.md, Section 9** for the full security model

## License

Internal ICJIA tool. Not licensed for external use.

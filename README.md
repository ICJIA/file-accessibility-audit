# File Accessibility Audit

![File Accessibility Audit](apps/web/public/og-image.png)

**Production URL:** https://audit.icjia.app

A private, internal web tool for ICJIA staff that scores PDF accessibility readiness. Upload a PDF, get an instant grade (A–F) with category-by-category findings and remediation guidance.

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

# Add your SMTP credentials to apps/api/.env:
#   SMTP_USER=postmaster@icjia.cloud
#   SMTP_PASS=your-password

# Start both servers (kills stale ports automatically)
pnpm dev
```

- **Frontend:** http://localhost:5102
- **API:** http://localhost:5103
- **Dev note:** OTP codes are printed to the API console — no email credentials needed locally

### Email Setup

Email provider is controlled in `audit.config.ts` → `EMAIL.PROVIDER`. Credentials go in `apps/api/.env`.

**To switch providers**, change one line in `audit.config.ts`:

```ts
PROVIDER: 'mailgun'   // ← change to 'smtp2go' to switch
```

Host and port are set automatically per provider. You only need two env vars:

```env
SMTP_USER=your-smtp-login
SMTP_PASS=your-smtp-password
```

| Provider | Docs |
|----------|------|
| Mailgun (default) | [docs/07-mailgun-integration.md](docs/07-mailgun-integration.md) |
| SMTP2GO | [docs/06-smtp2go-integration.md](docs/06-smtp2go-integration.md) |

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
| Auth | Email OTP → JWT (httpOnly cookie) |
| Email | Mailgun (default) / SMTP2GO (alternative) / Nodemailer |
| Deployment | DigitalOcean → Laravel Forge → PM2 → nginx |

## Scoring

PDFs are graded across 9 accessibility categories:

| Category | Weight |
|----------|--------|
| Text Extractability | 20% |
| Document Title & Language | 15% |
| Heading Structure | 15% |
| Alt Text on Images | 15% |
| Bookmarks / Navigation | 10% |
| Table Markup | 10% |
| Link & URL Quality | 5% |
| Form Accessibility | 5% |
| Reading Order | 5% |

Categories that don't apply (e.g., no images → alt text is N/A) are excluded and weights are renormalized. All scoring constants live in `audit.config.ts`.

See **docs/00-master-design.md, Section 5** for the full scoring rubric.

## Configuration

All magic numbers, thresholds, weights, limits, and email provider settings are in **`audit.config.ts`** at the project root. This is the single source of truth — the API imports it directly, and the docs reference it.

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

**208 tests** across 7 test files. Run all with:

```bash
pnpm test                # All tests (API + Web) in parallel
pnpm test:api            # API tests only
pnpm test:web            # Web tests only
pnpm test:scoring        # Scoring model tests only
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

See [docs/04-deployment-guide.md](docs/04-deployment-guide.md) for full deployment instructions. Short version:

```bash
pnpm install --frozen-lockfile
pnpm --filter api build
pnpm --filter web build
pm2 restart ecosystem.config.cjs --update-env
```

## Auth

- **Illinois.gov email only** — domain validated on OTP request
- **No passwords** — 6-digit OTP via email, 15-minute expiry
- **72-hour sessions** — JWT in httpOnly cookie
- **Admin access** — controlled via `ADMIN_EMAILS` env var

## Security

- Files processed in memory (QPDF temp file deleted immediately)
- `execFileSync` (no shell) for QPDF invocation
- Rate limiting on all endpoints
- Helmet + nginx security headers
- CORS locked to same origin in production
- See **docs/00-master-design.md, Section 9** for the full security model

## License

Internal ICJIA tool. Not licensed for external use.

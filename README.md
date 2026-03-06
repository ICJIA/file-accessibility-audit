# File Accessibility Audit

**Production URL:** https://audit.icjia.app

A private, internal web tool for ICJIA staff that scores PDF accessibility readiness. Upload a PDF, get an instant grade (A–F) with category-by-category findings and remediation guidance.

**This tool is diagnostic only** — it identifies accessibility issues but does not fix them. The intended workflow is: upload → review findings → fix in Adobe Acrobat → re-upload to verify.

## Quick Start

### Prerequisites

- **Node.js 20+** (see `.nvmrc`)
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
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit both .env files with your values

# Start API (Terminal 1)
cd apps/api && pnpm dev

# Start frontend (Terminal 2)
cd apps/web && pnpm dev
```

- **Frontend:** http://localhost:5102
- **API:** http://localhost:5103
- **Mailpit (dev email):** http://localhost:8025 (if running)

### Local Email Testing

Use [Mailpit](https://mailpit.axllent.org/) to capture OTP emails locally:

```bash
brew install mailpit   # macOS
mailpit                # starts SMTP on :1025, web UI on :8025
```

Set `SMTP_HOST=localhost` and `SMTP_PORT=1025` in `apps/api/.env`.

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
| Email | SMTP2GO (free plan) / Nodemailer |
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

All magic numbers, thresholds, weights, and limits are in **`audit.config.ts`** at the project root. This is the single source of truth — the API imports it directly, and the docs reference it. When changing a scoring weight or rate limit, change it in `audit.config.ts`, not in code scattered across services.

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

## Tests

```bash
pnpm --filter api test          # API unit + integration tests
pnpm --filter api test:scoring  # Scoring model against fixture PDFs
pnpm --filter web test          # Frontend component tests
```

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

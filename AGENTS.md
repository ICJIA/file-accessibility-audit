# AGENTS.md

Short, opinionated orientation for AI coding agents (Claude Code, Codex,
Cursor, Gemini CLI, etc.) working on this repository.

If something here conflicts with `docs/archive/00-master-design.md`, the master
design wins — that doc is the single source of truth for architecture
decisions. This file captures the load-bearing conventions and the
gotchas that tend to bite agents on their first contact.

---

## What this project is

ICJIA File Accessibility Audit — a PDF accessibility scoring + auto-
remediation tool. Auditors and content managers upload (or link) PDFs;
the tool scores them on 9 WCAG-aligned categories under two profiles
(strict + practical), produces shareable reports, and optionally
auto-remediates PDFs through a qpdf → OpenDataLoader → veraPDF
pipeline.

Production: <https://audit.icjia.app>
Repo: <https://github.com/ICJIA/file-accessibility-audit>

---

## Stack

- **Monorepo:** pnpm workspaces. `apps/api`, `apps/web`, `apps/cli`.
- **API:** Express + TypeScript, run via `tsx` (no compiled output;
  `tsconfig.json` has `noEmit: true`). Port **5103**.
- **Frontend:** Nuxt **4.x** (not Nuxt 3) + Nuxt UI **4.x** (not v3).
  Port **5102**. Vue 3.5+.
- **DB:** `better-sqlite3` with WAL mode. Schema defined inline in
  `apps/api/src/db/sqlite.ts`. Migrations are ALTER TABLE probes (no
  migrations framework).
- **Auth:** Optional. `AUTH.REQUIRE_LOGIN` in `audit.config.ts`. When
  on: OTP email codes (Mailgun default) plus Personal Access Tokens
  for headless / API automation. When off: anonymous-friendly.
- **Email:** Mailgun (default), SMTP2GO (alternative). Both via
  nodemailer SMTP.
- **Java tools:** OpenDataLoader (PDF auto-tagging) and veraPDF
  (PDF/UA-1 conformance) are shelled-out as Java JARs. JDK 17+
  required for the remediation feature; not needed for audit-only.
- **Node:** ≥ 22.

---

## Running locally — the only entrypoint you should use

```bash
./start-dev-server.sh
```

**Always use this script — never `pnpm dev` directly.** The wrapper:

- Sets `REMEDIATION_ENABLED=true` so the auto-remediation UI is
  reachable in dev (off by default in production).
- Auto-detects the local Java install for OpenDataLoader (handles
  brew openjdk on macOS, apt openjdk on Ubuntu, paths that differ
  by architecture).
- Optionally locates a veraPDF install and exports the path so PDF/UA
  conformance checks light up in the UI.
- Checks that qpdf is on `PATH` and reports version (must be ≥ 10.x
  for the `--object-streams=disable` preprocessing step).

Plain `pnpm dev` works but produces a feature-incomplete app —
remediation will appear hidden and Java/veraPDF integration silently
no-ops.

---

## Critical conventions

These have all been re-learned the hard way at least once. Don't
re-learn them.

### Commit messages

- **No AI co-author trailers.** Never add `Co-Authored-By: Claude <…>`
  or any other AI attribution. Every commit, every amend, every
  rebase. Overrides the default Claude Code commit template.
- End commit messages with the descriptive content; no trailer.

### Builds before push

- **Always run `pnpm build` before pushing.** Vitest uses esbuild and
  will not catch `tsc --noEmit` errors. The build is split:
    `pnpm --filter api build`  → `tsc --noEmit` (typecheck only)
    `pnpm --filter web build`  → full `nuxt build`
- A clean `pnpm --filter api test` is also helpful — currently 816
  tests, all under `apps/api/src/__tests__`.

### Path aliases

- `#config` → `audit.config.ts` (root). Registered in
  `apps/api/package.json` `imports` and `apps/api/tsconfig.json`
  `paths`. Use it from API code instead of relative paths to
  `../../audit.config.ts`.
- `~/` and `@/` → `apps/web/app/` (standard Nuxt convention).

### Database migrations

There is no migrations framework. Schema changes follow the existing
**ALTER TABLE probe** pattern in `apps/api/src/db/sqlite.ts`:

```ts
const cols = db.prepare("PRAGMA table_info(your_table)").all()
if (cols.length > 0 && !cols.some(c => c.name === 'new_column')) {
  db.exec('ALTER TABLE your_table ADD COLUMN new_column TEXT')
}
```

Also add the column to the `CREATE TABLE IF NOT EXISTS` block so fresh
installs include it. Move any `CREATE INDEX` referencing the new
column **out** of the initial CREATE block — existing tables won't
have the column yet when the initial block runs.

### `audit.config.ts` is the single source of truth

All tunables — scoring weights, retention TTLs, rate limits, batch
sizes, email-provider config, allowlists, branding, deployment URLs
— live here. Every export has a doc-comment marked `SAFE TO CHANGE`
or `DO NOT CHANGE` with the rationale. Read them before changing
anything; respect them after.

When you want a constant exposed to the frontend, add it to the
`runtimeConfig.public` block in `apps/web/nuxt.config.ts` and read it
via `useRuntimeConfig().public.<name>`.

### Versioning

Project uses semver: patch for fixes, minor for features, major for
breaking changes. Current version is in three `package.json` files
(root, `apps/web`, `apps/api`) and must stay in sync. Footer version
auto-reads from `apps/web/package.json` via
`config.public.appVersion`.

**Every version bump must update all of:**

1. `CHANGELOG.md` (root) — add entry under new version heading
2. The three `package.json` files
3. `README.md` § Security — technical-framed audit log entry
4. `apps/web/app/pages/data-retention.vue` § 10 — plain-language
   audit log entry for auditors
5. Create an annotated git tag `vX.Y.Z`

The Security / data-retention entries are the auditor-facing
historical record — they must not be skipped, even on bug-fix-only
releases (write a short "no new findings; release covered X" entry).

---

## Repository map

```
/
├── audit.config.ts           single source of truth for tunables
├── start-dev-server.sh       only way to start dev locally
├── rebuild.sh                deploy script (Ubuntu droplet)
├── ecosystem.config.cjs      PM2 process definitions
├── CHANGELOG.md
├── README.md
├── AGENTS.md                 you are here
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/       Express route handlers
│   │       ├── services/     business logic (pdfAnalyzer, scorer, etc.)
│   │       ├── db/sqlite.ts  schema + ALTER TABLE backfills
│   │       ├── middleware/   auth, rate limiting, upload
│   │       ├── jobs/         remediation worker (detached child process)
│   │       └── __tests__/    vitest, 816 tests
│   │
│   ├── web/                  Nuxt 4 frontend
│   │   ├── nuxt.config.ts    runtimeConfig + global head config
│   │   └── app/
│   │       ├── pages/        Nuxt file-based routing
│   │       ├── components/
│   │       ├── composables/
│   │       └── utils/
│   │
│   └── cli/                  the @icjia/filecap-cli alternative client
│
├── docs/
│   ├── 00-master-design.md                single source of truth
│   ├── pdf-remediation-integration-plan.md
│   ├── fleet-inventory-reporting.md       fleet-tool integration brief
│   ├── 06-smtp2go-integration.md
│   ├── 07-mailgun-integration.md          default email provider
│   └── …                                  numbered phase / topic docs
│
└── controls/                 fixture PDFs for scripts/verify-controls.ts
```

---

## API surface (current as of v1.19.0)

Public endpoints under `/api`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Upload + audit a PDF |
| `/api/analyze-url` | POST | Audit a PDF by URL — returns the full AnalysisResult, not persisted |
| `/api/audit-url` | POST | Audit by URL **and** persist a shareable report — returns trimmed CSV-friendly shape with reportUrl. Hash-dedups by content per caller. For fleet inventory automation. |
| `/api/bulk-from-inventory` | POST | Batch variant taking a filecap NDJSON inventory |
| `/api/reports` | POST/GET | Save / retrieve shareable reports (UUID id) |
| `/api/remediate` | POST | Start a remediation job (gated on `REMEDIATION_ENABLED`) |
| `/api/remediate/:id/status` | GET | Job status polling |
| `/api/remediate/:id/download` | GET | Download remediated PDF (single-use token) |
| `/api/remediate/:id/receipt` | GET | Lifecycle audit trail JSON |
| `/api/auth/*` | various | OTP email + session |
| `/api/tokens` | various | Personal access token management |

URL-fetching endpoints (`/analyze-url`, `/audit-url`, `/bulk-from-inventory`)
share a host allowlist defined in
`apps/api/src/routes/analyze-url.ts` `DEFAULT_ALLOWED_HOSTS`. The
matcher accepts exact-host and any subdomain. Operators can extend
per-deployment via `ANALYZE_URL_ALLOWED_HOSTS` env var.

---

## Common pitfalls (caught in past sessions)

- **Don't use Nuxt 3.** This project is Nuxt 4.x with Nuxt UI 4.x.
  Importing patterns from Nuxt 3 docs will compile but produce
  subtle runtime bugs.
- **Don't restart the dev server with `pnpm --filter web build`.**
  Running a production build will not kill the dev server but will
  briefly consume ports / file handles. If the dev server stops
  responding, restart via `./start-dev-server.sh`.
- **Don't add `puppeteer` / `playwright` for "small" PDF rendering
  needs.** They're ~100+ MB. The repo's image generation uses
  `sharp` (SVG → PNG). For PDF export from a Nuxt page, browser
  `window.print()` with print-friendly CSS is the lightest path.
- **`req.user!.email` is safe in dev** when `AUTH.REQUIRE_LOGIN=false`
  because `authMiddleware` sets the user to `{ email: 'anonymous' }`.
  No production-style PAT setup needed for local testing.
- **Mermaid render order matters.** Multiple `MermaidDiagram`
  instances on a single page must serialize their renders via a
  shared promise queue, otherwise mermaid's global state races and
  produces composited SVGs (see `apps/web/app/components/MermaidDiagram.vue`).
- **veraPDF JSON shape changed in 1.30.x.** `validationResult` is an
  array now, not an object. `apps/api/src/services/veraPdf.ts`
  handles both shapes. Don't "simplify" it unless you also update
  the version pin.
- **The Word export is client-side.** Don't build a server-side
  exporter unless you have a specific reason. Mirror the existing
  pattern in `apps/web/app/composables/useReportExport.ts` (uses the
  `docx` library plus file-saver).

---

## Deploy posture (production)

- DigitalOcean droplet, Ubuntu 22.04
- Managed via Laravel Forge
- Two PM2 apps: `file-audit-api` (port 5103, 512 MB cap) and
  `file-audit-web` (port 5102, 512 MB cap), defined in
  `ecosystem.config.cjs`
- nginx reverse proxy in front
- Deploy via `./rebuild.sh` on the droplet — preflight checks for
  qpdf, Java (if remediation enabled), veraPDF (optional), pnpm
- Production URL: `https://audit.icjia.app`

`REMEDIATION_ENABLED=true` is persisted in `/etc/environment` so
PM2 inherits it across reboots. To turn the feature off without a
deploy, edit that file + `pm2 restart ecosystem.config.cjs`.

---

## When in doubt

- `docs/archive/00-master-design.md` — architecture decisions, rationale, the
  full feature catalog
- `audit.config.ts` — every tunable with a SAFE TO CHANGE / DO NOT
  CHANGE label
- `CHANGELOG.md` — release-by-release history with commit references
- `README.md` § Security — pre-release red/blue-team audit findings
- `docs/archive/fleet-inventory-reporting.md` — fleet-tool integration brief

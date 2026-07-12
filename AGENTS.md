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
- **DB:** `better-sqlite3` with WAL mode. Baseline schema + numbered
  migrations live in `apps/api/src/db/migrations.ts`, keyed on
  `PRAGMA user_version`; `sqlite.ts` just calls `runMigrations(db)`.
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
- A clean `pnpm --filter api test` is also helpful — currently 876
  tests, all under `apps/api/src/__tests__`.
- **New since the 2026-07 tooling pass:** `pnpm lint` (ESLint, whole
  repo) and `pnpm typecheck` (`apps/api` `tsc --noEmit` + `apps/web`
  `nuxt typecheck`) are both real scripts now, and CI
  (`.github/workflows/ci.yml`) runs lint → typecheck → build → test
  on every push/PR to `main`. Run `pnpm lint` and `pnpm typecheck`
  locally before pushing, same as `pnpm build`.

### Path aliases

- `#config` → `audit.config.ts` (root). Registered in
  `apps/api/package.json` `imports` and `apps/api/tsconfig.json`
  `paths`. Use it from API code instead of relative paths to
  `../../audit.config.ts`.
- `~/` and `@/` → `apps/web/app/` (standard Nuxt convention).

### Database migrations

Schema changes are numbered migrations in `apps/api/src/db/migrations.ts`
(the `MIGRATIONS` array), keyed on `PRAGMA user_version` — not ad hoc
edits to `sqlite.ts`. To add one: append a new `{ version, name, up(db) }`
entry with the next integer version. Inside `up()`, keep the same
**probe-before-ALTER** guard the pre-migration-runner code used (belt
and braces alongside the version tracking — SQLite still throws if you
`ALTER TABLE ADD COLUMN` a column that already exists):

```ts
if (!hasColumn(db, "your_table", "new_column")) {
  db.exec("ALTER TABLE your_table ADD COLUMN new_column TEXT");
}
```

A brand-new table can just go in a `CREATE TABLE IF NOT EXISTS` block
inside its migration's `up()`. `runMigrations(db)` (called once from
`sqlite.ts` at startup) runs every migration whose version is greater
than the database's current `user_version`, each in its own
transaction, and bumps `user_version` immediately after — safe to call
on a fresh database, a partially-migrated one, or the existing
production database (a dedicated legacy-fast-forward path detects an
already-provisioned pre-migration-runner database and jumps straight
to the correct baseline without re-running any `ALTER`). Never bump
`LEGACY_BASELINE_VERSION` when adding a new migration — it's a fixed
historical constant, not "the latest version."

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
│   │       ├── services/     api-only business logic (auth, mailer,
│   │       │                 remediation, safeFetch/urlPolicy) plus
│   │       │                 thin re-export shims to @file-audit/analyzer
│   │       │                 for pdfAnalyzer/scorer/ooxml/etc.
│   │       ├── db/sqlite.ts  schema + numbered migrations (db/migrations.ts,
│   │       │                 PRAGMA user_version — see below)
│   │       ├── middleware/   auth, rate limiting, upload
│   │       ├── jobs/         remediation worker (detached child process)
│   │       └── __tests__/    vitest, 876 tests
│   │
│   ├── web/                  Nuxt 4 frontend
│   │   ├── nuxt.config.ts    runtimeConfig + global head config
│   │   └── app/
│   │       ├── pages/        Nuxt file-based routing
│   │       ├── components/
│   │       ├── composables/
│   │       └── utils/
│   │
│   └── cli/                  the @icjia/a11y-audit alternative client
│                              (depends on @file-audit/analyzer directly)
│
├── packages/
│   ├── analyzer/              @file-audit/analyzer — the audit engine
│   │                           (extracted from apps/api/src/services/ in
│   │                           v1.34.0); apps/api re-exports its old
│   │                           service paths as shims, apps/cli imports
│   │                           it directly
│   └── shared/                @file-audit/shared — scoring constants +
│                               report types shared by web/api/cli
│
├── docs/
│   ├── archive/00-master-design.md                single source of truth
│   ├── archive/pdf-remediation-integration-plan.md
│   ├── archive/fleet-inventory-reporting.md       fleet-tool integration brief
│   ├── archive/06-smtp2go-integration.md
│   ├── archive/07-mailgun-integration.md          default email provider
│   └── (per-fix accuracy write-ups, e.g. table-and-heading-accuracy-fixes.md,
│       live at the docs/ root — everything else historical is in archive/)
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
- **Report exports (Text/HTML/Markdown/JSON) are client-side.** There
  is no Word/.docx export (removed in v1.28.0 along with the `docx`
  library) and no `file-saver` dependency (removed in the 2026-07
  tooling pass — replaced by the native `downloadBlob` helper in
  `apps/web/app/utils/download.ts`). Don't build a server-side
  exporter unless you have a specific reason. Mirror the existing
  pattern in `apps/web/app/composables/useReportExport.ts`, which
  orchestrates the pure builder functions in
  `apps/web/app/utils/exportFormats/*.ts`.

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

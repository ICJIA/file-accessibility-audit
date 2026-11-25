# AGENTS.md

Short, opinionated orientation for AI coding agents (Claude Code, Codex,
Cursor, Gemini CLI, etc.) working on this repository.

If something here conflicts with `docs/archive/00-master-design.md`, the master
design wins — that doc is the single source of truth for architecture
decisions. This file captures the load-bearing conventions and the
gotchas that tend to bite agents on their first contact.

---

## What this project is

ICJIA File Accessibility Audit — a document accessibility scoring +
auto-remediation tool. Auditors and content managers upload (or link)
PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files; the
tool scores them on WCAG-aligned categories (9 for PDF and PPTX, 8 for
DOCX, 6 for XLSX) on the single canonical "strict" profile, produces
shareable reports, and optionally auto-remediates PDFs through a
qpdf → OpenDataLoader → veraPDF pipeline. PDF audits also carry a
veraPDF PDF/UA-1 verdict (v1.37.0+).

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
- **Auth: none — removed in v1.68.0.** No accounts, no sign-in, no
  OTP, no JWT sessions, no personal access tokens, no admin role.
  Every endpoint is public and rate-limited per IP. The database
  schema stores no identifiers (migration 11 dropped the email /
  ip_address / user_agent columns and the otp_codes / revoked_jtis /
  access_tokens tables); an `audit_log` row is metadata about the
  audit — event type, sanitized filename, score, grade, content hash,
  timestamp — never the file, never the caller. The one credential
  is the optional `API_PRIVILEGED_TOKEN` fleet **service** token
  (rate tier + URL-allowlist bypass), not a user account.
- **Email: none.** The mailer left with the OTP flow — the app sends
  no email and reads no `SMTP_*`/`MAILGUN_*` env vars (the analyzer's
  child-process env DENY-list still strips those names, kept as
  defense in depth).
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
- A clean `pnpm --filter api test` is also helpful — the API tests all
  live under `apps/api/src/__tests__`; `pnpm test` runs every suite and
  prints the current counts (a number written here only goes stale).
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
sizes, allowlists, branding, deployment URLs
— live here. Every export has a doc-comment marked `SAFE TO CHANGE`
or `DO NOT CHANGE` with the rationale. Read them before changing
anything; respect them after.

When you want a constant exposed to the frontend, add it to the
`runtimeConfig.public` block in `apps/web/nuxt.config.ts` and read it
via `useRuntimeConfig().public.<name>`.

### Versioning

Project uses semver: patch for fixes, minor for features, major for
breaking changes. Current version is in six `package.json` files
(root, `apps/web`, `apps/api`, `apps/cli`, `packages/shared`,
`packages/analyzer`) and must stay in sync. Footer version
auto-reads from `apps/web/package.json` via
`config.public.appVersion`.

**Every version bump must update all of:**

1. `CHANGELOG.md` (root) — add entry under new version heading
2. The six `package.json` files
3. `README.md` § Security — technical-framed audit log entry
4. `apps/web/app/data/securityAudits.ts` — plain-language audit log
   entry for auditors (§ 10 of the data-retention page). Prepend an
   object to `SECURITY_AUDIT_ENTRIES`; the markup is in
   `components/dataRetention/Section10SecurityAudits.vue` and needs no
   change. `securityAudits.test.ts` fails until the shipping version
   has an entry.
5. Create an annotated git tag `vX.Y.Z`

**Use `pnpm release <patch|minor|major|x.y.z>`** (`scripts/release.ts`,
documented in `docs/releasing.md`). It writes steps 1–4 from one small
input (`--title`, `--summary`, `--security-note`, `--scope`, or
`--notes-file`), runs `pnpm audit --prod` and records that run's result,
and with `--counts` runs the suite, updates the README and
`scripts/brief-stats.json` counts and runs `pnpm build-brief`. Wherever a
person must still write prose it leaves a `TODO(release)` marker, and
`--commit` refuses to commit while one remains. `--dry-run` prints the
diff and writes nothing. It never pushes, and by default neither commits
nor tags — it prints the git commands. `pnpm release --verify` checks the
result. `versionSync.test.ts` fails if any of the ten places a version is
written disagrees with the others.

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
├── scripts/
│   ├── backup-db.sh          nightly DB backup wrapper (Forge Scheduler;
│   │                         keeps the 5 newest snapshots, on-server —
│   │                         see docs/database-backups.md)
│   ├── restore-db.sh         verify-first restore for those snapshots
│   ├── release.ts            `pnpm release` — see § Versioning, docs/releasing.md
│   └── e2e-smoke.ts          `pnpm e2e` — browser upload + axe on the app's own pages
├── ops/nginx/                copy of the live reverse-proxy config (nothing reads it)
├── CHANGELOG.md
├── README.md
├── AGENTS.md                 you are here
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/       Express route handlers
│   │       ├── services/     api-only business logic (remediation incl.
│   │       │                 the in-memory remediationCap, safeFetch/
│   │       │                 urlPolicy, status) plus
│   │       │                 thin re-export shims to @file-audit/analyzer
│   │       │                 for pdfAnalyzer/scorer/ooxml/etc.
│   │       ├── db/sqlite.ts  schema + numbered migrations (db/migrations.ts,
│   │       │                 PRAGMA user_version — see below)
│   │       ├── middleware/   rate limiting, upload
│   │       ├── jobs/         remediation worker (detached child process)
│   │       └── __tests__/    vitest (run `pnpm test` for current counts)
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
│   ├── archive/06-smtp2go-integration.md          historical (mailer removed v1.68.0)
│   ├── archive/07-mailgun-integration.md          historical (mailer removed v1.68.0)
│   ├── runbook.md, deploys.md, releasing.md,      current operations docs
│   │   database-backups.md, process-supervision.md
│   └── (per-fix accuracy write-ups, e.g. table-and-heading-accuracy-fixes.md,
│       live at the docs/ root — everything else historical is in archive/)
│
└── controls/                 fixture documents (PDF + Office) for scripts/verify-controls.ts
```

---

## API surface (current as of v1.168.0)

Every endpoint under `/api` is public — no auth of any kind, rate-limited
per IP (the optional `API_PRIVILEGED_TOKEN` bearer token selects the
generous rate tier and the URL-allowlist bypass):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Upload + audit a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file |
| `/api/analyze-job` | POST | The same audit as a job with observable steps (v1.100.0) — returns 202 `{ jobId, token }`. What the web page uses; it falls back to `/api/analyze` |
| `/api/analyze-job/:id` | GET | Poll a job (`?t=<token>`): step states, then the result (or the error body `/api/analyze` would send) exactly once. Exempt from the global limiter; has its own |
| `/api/analyze-url` | POST | Audit a document (PDF/DOCX/PPTX/XLSX) by URL — returns the full AnalysisResult, not persisted |
| `/api/audit-url` | POST | Audit by URL **and** persist a shareable report — returns trimmed CSV-friendly shape with reportUrl. Hash-dedups by content (hash alone since v1.68.0). For fleet inventory automation. |
| `/api/audit-url-page` | POST | Audit a web PAGE (not a document) by URL: renders it in headless Chromium, runs axe-core, persists a shareable page report. API-only — for the fleet audit; the site has no form for it |
| `/api/bulk-from-inventory` | POST | Batch variant taking a filecap NDJSON inventory |
| `/api/reports` | POST | Save a shareable report (UUID id). Accepts only a result carrying a valid server `seal` (HMAC over the whole result, v1.168.0) — post it back exactly as received |
| `/api/reports/:id` | GET | Retrieve a saved report |
| `/api/remediate` | POST | Start a remediation job (gated on `REMEDIATION_ENABLED`; audit-gate binds to content hash; daily cap is in-memory per IP, resets on restart; jobs are QUEUED since v1.168.0 — 2 running, 10 waiting, 2 active per caller, 503/429 beyond) |
| `/api/remediate/:id/status` | GET | Job status polling (authorized by the job's download token) |
| `/api/remediate/:id/download` | GET | Download remediated PDF (single-use token) |
| `/api/remediate/:id/receipt` | GET | Lifecycle audit trail JSON (authorized by the job's download token) |
| `/api/status` | GET | Service status JSON — engines, DB, usage aggregates (public, v1.39.0+) |
| `/api/health` | GET | Always HTTP 200 while the process is up. The body carries the SAME verdict `/status` computes, read from already-cached state: `{ status: "ok" \| "degraded", uptime, degraded?: [...], systems: [...] }` — it runs no probe of its own. Also served at `/` and `/api`. `rebuild.sh`'s health gate reads only the status code |
| `/api/openapi.json` | GET | Machine-readable description of every route above (hand-written in `services/openapi.ts`, pinned to the real router by `openapi.test.ts`) |

URL-fetching endpoints (`/analyze-url`, `/audit-url`, `/audit-url-page`,
`/bulk-from-inventory`) share a host allowlist ("the approved list"). The
list is `URL_FETCH.APPROVED_HOSTS` in `audit.config.ts`; the matcher in
`apps/api/src/services/urlPolicy.ts` accepts exact-host and any subdomain,
and operators can extend it per deployment via `ANALYZE_URL_ALLOWED_HOSTS`.
An anonymous caller is REFUSED any host off the list on all four.

**The site has no field for typing a link, and must not get one back
without asking.** For one day (v1.180.0 – v1.181.3, 2026-11-25) the home
page's link field and `/analyze-url` accepted any public host; it was
red-teamed (ten findings) and the owner withdrew it in v1.182.0 — "It's only
dropped files. No links." What remains is `?prefill=<url>`, which ICJIA's
own tools use to open a document here: the web app runs it only for a host
on the approved list and otherwise sends nothing and says to upload.

The Nuxt tier additionally serves `/status` (service status as
human-readable HTML or JSON; GET/HEAD, public, keyword-monitored) and
`/healthz` (liveness; GET/HEAD) — both are server routes, not Vue
pages (link with a plain `<a href>`, never `<NuxtLink>`).

---

## Common pitfalls (caught in past sessions)

- **Don't use Nuxt 3.** This project is Nuxt 4.x with Nuxt UI 4.x.
  Importing patterns from Nuxt 3 docs will compile but produce
  subtle runtime bugs.
- **Don't restart the dev server with `pnpm --filter web build`.**
  Running a production build will not kill the dev server but will
  briefly consume ports / file handles. If the dev server stops
  responding, restart via `./start-dev-server.sh`.
- **Don't add a second browser-automation stack, and don't reach for the
  one that is here for "small" rendering needs.** `puppeteer` (with
  `@axe-core/puppeteer`) IS a dependency of `apps/api` — for exactly one
  product feature, the web-page audit service (`/api/audit-url-page`,
  `services/pageAuditor.ts`), plus two developer tools that resolve it
  from there: `scripts/e2e-smoke.ts` (`pnpm e2e`) and
  `scripts/generate-diagrams.mjs`. Do not add `playwright`, a second
  Chromium, or puppeteer to another package. For images the repo uses
  `sharp` (SVG → PNG); for PDF export from a Nuxt page, browser
  `window.print()` with print-friendly CSS is the lightest path.
- **`nuxt dev` needs `--host localhost`** (in the `dev` script of
  `apps/web/package.json` — keep it). Without a `--host` flag and with no
  `HOST` / `NUXT_HOST` / `NITRO_HOST` exported, Nuxt resolves
  `devServer.host` to an empty object and `@nuxt/cli` 4.0.1 crashes at
  start with `options.hostname.toLowerCase is not a function`. It
  reproduces from a clean shell after `pnpm install --frozen-lockfile`. If
  it comes back, also delete
  `apps/web/node_modules/.cache/nuxt/dev-server.json` (it caches
  `"hostname":{}`).
- **There is no `req.user` and no auth middleware** (both removed in
  v1.68.0) — don't reintroduce an identity object or key anything on a
  caller identity. Endpoints are public and per-IP rate-limited; the
  remediation job endpoints authorize by the job's download token, and
  the daily remediation cap lives in process memory keyed by IP
  (`services/remediationCap.ts` — transient, written nowhere).
- **Diagrams are pre-rendered; there is no Mermaid at runtime.** The
  flowcharts on the site are static SVG files in
  `apps/web/app/assets/diagrams/`, shown by
  `apps/web/app/components/DiagramFigure.vue`. After changing a diagram's
  source, regenerate them with `node scripts/generate-diagrams.mjs`
  (renders one diagram at a time in headless Chromium). Do not add the
  mermaid runtime to the web bundle.
- **No document is parsed in the API process.** Since v1.183.0 a PDF is
  analysed in a child process (`packages/analyzer/src/pdfRunner.ts` spawns
  `pdfWorker.ts`), as Office files already were (`ooxmlRunner.ts`). The
  parent keeps the clock and SIGKILLs the child's process group; a watchdog
  thread in the child handles a dead parent and a memory limit
  (`ANALYSIS.PDF_WORKER_*`). Do not move pdf.js or qpdf's JSON parse back
  into `analyzePDF`: a crafted 1.2 MB PDF froze the whole API for minutes,
  because a timeout cannot fire on the thread it is timing. Two things follow
  for tests: a `vi.mock` of `qpdfService`/`pdfjsService` does not cross the
  process boundary, so mock-driven tests call `analyzePdfInProcess` (from
  `@file-audit/analyzer/pdfWorker`), not `analyzePDF`; and a test that
  replaces `child_process.spawn` must pass the `pdfWorker.ts` spawn through
  (see `remediateDownload.test.ts`).
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
- Two PM2 apps: `file-audit-api` (port 5103, 768 MB cap) and
  `file-audit-web` (port 5102, 512 MB cap), defined in
  `ecosystem.config.cjs`
- nginx reverse proxy in front
- Deploy via `./rebuild.sh` on the droplet — preflight checks for
  node, pnpm, pm2, qpdf, Java (if remediation enabled), veraPDF
  (optional). `./rebuild.sh --check` runs the preflight alone and
  changes nothing. If the new version fails its health gate the script
  puts the previous commit and web build back automatically and exits
  non-zero (`ROLLBACK_ON_FAILURE=false` turns that off); the database is
  never rolled back. See `docs/deploys.md`.
- Pushing to `main` does **not** deploy. The maintainer runs
  `./rebuild.sh` on the server by hand.
- Everything on the server that is not in this repository — packages,
  `/etc/environment` names, PM2 modules, the Scheduler job, nginx — is
  listed in `docs/runbook.md`; `ops/nginx/audit.icjia.app.conf.example`
  is a copy of the live proxy configuration, taken 2026-11-24.
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
- `docs/runbook.md` — rebuilding the server from nothing; what to check
  when something breaks
- `docs/deploys.md` · `docs/releasing.md` · `docs/database-backups.md`

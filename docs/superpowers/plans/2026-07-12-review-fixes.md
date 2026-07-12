# 2026-07 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the prioritized backlog from the 2026-07-12 five-agent whole-app review: one user-visible fix, missing tooling (CI/lint/typecheck/coverage), low-severity security hardening, API structural refactors, the `@file-audit/analyzer` package extraction, and web maintainability + a11y fixes.

**Architecture:** Work happens on branch `chore/2026-07-review-fixes` in the main checkout (repo convention: feature branches merged locally to main; user pushes/deploys). Phases are strictly ordered; tasks within a phase run sequentially unless marked parallel-safe. Every task ends with `pnpm build` unaffected or re-verified and the relevant test suite green. Refactor tasks are behavior-preserving: existing tests must pass UNCHANGED (import-path updates only where files move).

**Tech Stack:** pnpm workspaces, Express + tsx (API — never compile, `tsc --noEmit` only), Nuxt 4.4.7 + Nuxt UI 4.5.1 (web), better-sqlite3, vitest 3.

## Global Constraints

- Node >= 22; pnpm workspace monorepo (`apps/api`, `apps/web`, `apps/cli`, `packages/shared`).
- NEVER add `Co-Authored-By` or any AI trailer to commits. Conventional-commit prefixes (`fix:`, `feat:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`, `style:`).
- API runs via tsx; `apps/api` build == `tsc --noEmit`. Do not introduce a compile step.
- PDF + Word scoring behavior is FROZEN — refactors must not change any score, message, or report field. The 1,286 existing tests (api 816 / web 426 / cli 44) are the contract; do not weaken or delete a test to make it pass.
- Dark-mode-only UI; Nuxt 4 / Nuxt UI 4 idioms only.
- Config constants belong in `audit.config.ts` (root, imported as `#config`); secrets stay in env.
- Test commands: `pnpm --filter api test`, `pnpm --filter web test`, `pnpm --filter @icjia/a11y-audit test`. Build: `pnpm build`.
- Out of scope (deliberately deferred): Git LFS for `controls/`, Chromium `--no-sandbox` removal, Astro migration, `docs/superpowers/plans` tracking decision, generic bounded-walk consolidation in OOXML collectors (PPTX/XLSX caps are behavior-sensitive; low value/risk ratio).

---

## Phase A — Quick wins (user-visible + hygiene)

### Task A1: data-retention version + dateModified from real sources

**Files:**
- Modify: `apps/web/app/pages/data-retention.vue` (~line 48: `TOOL_VERSION = '1.18.0'`)
- Modify: `apps/web/nuxt.config.ts` (hardcoded `dateModified` ISO string near top)
- Test: `apps/web/app/__tests__/` (add `dataRetentionVersion.test.ts` if a page-test pattern exists; otherwise assert via component import)

**Steps:**
- [ ] Replace the `TOOL_VERSION` literal with `useRuntimeConfig().public.appVersion` (already populated from `apps/web/package.json` — verify the exact key in `nuxt.config.ts` `runtimeConfig.public`). Keep the rendered copy identical otherwise.
- [ ] In `nuxt.config.ts`, derive `dateModified` at build time from git: `execSync('git log -1 --format=%cI', ...)` with try/catch fallback to the current hardcoded string. Keep the constant name and all consumers (JSON-LD, OG meta) unchanged.
- [ ] Add a web test asserting the data-retention page renders the runtime-config version, not `1.18.0`.
- [ ] Run: `pnpm --filter web test` → all pass. `pnpm --filter web build` → succeeds.
- [ ] Commit: `fix(web): data-retention shows real app version; dateModified derived from git`

### Task A2: gitignore `.tmp-audit/`

- [ ] Add `.tmp-audit/` to root `.gitignore` (near `.tmp-shots/`).
- [ ] Commit: `chore: gitignore .tmp-audit scratch dir`

### Task A3: CLI stops reporting v1.0.0

**Files:** `apps/cli/package.json`, `apps/cli/src/index.ts:5`, `apps/cli/src/commands/audit.ts:11`
- [ ] Bump `apps/cli/package.json` version to `1.33.0`. Replace both hardcoded `1.0.0` literals with a version read from the CLI's own `package.json` (JSON import with `assert { type: 'json' }` or `createRequire`; must work under tsx).
- [ ] Add/extend a CLI test asserting `--version` output matches the package.json version.
- [ ] Run: `pnpm --filter @icjia/a11y-audit test` → pass.
- [ ] Commit: `fix(cli): report real version from package.json`

### Task A4: remove dead `apps/api/src/spike/`

- [ ] Verify zero references: `grep -rn "spike" apps --include='*.ts' --include='*.vue' -l` (excluding the dir itself), check `package.json` scripts and `scripts/verify-controls.ts` (the monorepo agent said `controls/` fixtures are referenced by `scripts/verify-controls.ts` AND `apps/api/src/spike/*` — if `verify-controls.ts` imports from spike, move the needed helper into `scripts/` instead of deleting blind).
- [ ] `git rm -r apps/api/src/spike` (relocate anything load-bearing to `scripts/`).
- [ ] Run: `pnpm --filter api build && pnpm --filter api test` → pass.
- [ ] Commit: `chore(api): remove dead spike directory`

### Task A5: process-level rejection guards in API

**Files:** `apps/api/src/index.ts`
- [ ] Add near startup:
```ts
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  process.exitCode = 1
  server.close(() => process.exit(1))
  setTimeout(() => process.exit(1), 5000).unref()
})
```
(Log-and-continue for rejections; fail-fast-with-drain for exceptions. Match existing logger style if the app has one.)
- [ ] Run: `pnpm --filter api build && pnpm --filter api test`.
- [ ] Commit: `fix(api): add process-level unhandledRejection/uncaughtException guards`

### Task A6: CLI grade palette from shared

**Files:** `apps/cli/src/lib/html.ts:8-12`, `apps/cli/package.json`
- [ ] Add `"@file-audit/shared": "workspace:*"` to CLI deps; `pnpm install`.
- [ ] Replace the five hex literals with the exported colors from `packages/shared/src/scoring.ts` (`GRADE_THRESHOLDS` or `GRADE_COLORS` — use whichever exists; if colors live inline in thresholds, export a named mapping from shared first). Leave ANSI colors in `lib/colors.ts` untouched.
- [ ] Add a CLI test asserting html report colors === shared constants.
- [ ] Run: `pnpm --filter @icjia/a11y-audit test`.
- [ ] Commit: `fix(cli): use shared grade palette in HTML report`

### Task A7: publist GraphQL endpoint into config

**Files:** `audit.config.ts`, `apps/cli/src/lib/graphql.ts:3`, `apps/cli/src/commands/publist.ts:329`
- [ ] Add to `audit.config.ts` (SAFE TO CHANGE section, near BRANDING/deploy URLs): `PUBLIST: { GRAPHQL_ENDPOINT: 'https://agency.icjia-api.cloud/graphql', PAGE_SIZE: <current literal>, WEB_PUBLIC_DIR: '../web/public' }` with doc comments matching file style.
- [ ] Import via `#config` in `graphql.ts`/`publist.ts`; delete literals.
- [ ] Run: `pnpm --filter @icjia/a11y-audit test`.
- [ ] Commit: `refactor(cli): publist endpoint + paths from audit.config`

### Task A8: AGENTS.md stale counts

- [ ] Fix `AGENTS.md:91` "348+ tests" → current api count; scan AGENTS.md for other stale numbers. (README counts updated once, in Task G2, after suites grow.)
- [ ] Commit: `docs: correct stale test counts in AGENTS.md`

---

## Phase B — Tooling & CI

### Task B1: align @types majors with runtimes

**Files:** `apps/api/package.json`
- [ ] Pin `@types/express` to `^4.17.x` (latest 4.x). Check multer: if `multer@2` ships its own types, remove `@types/multer`; else keep and note. `pnpm install`.
- [ ] Run: `pnpm --filter api build` (tsc) → zero errors (fix any v5-typed usages that surface — they are latent bugs).
- [ ] Commit: `fix(api): align @types/express and multer types with installed majors`

### Task B2: CLI suite in root test runner

**Files:** `scripts/test.ts` (~line 55)
- [ ] Add `runSuite('CLI', 'cli')` third entry; make the count-parsing regex failure-tolerant (if counts unparseable, print "n/a" but still respect exit codes).
- [ ] Run: `pnpm test` → three suites, 1286+ tests, exit 0.
- [ ] Commit: `fix(test): include CLI suite in root test runner`

### Task B3: Prettier + ESLint + editorconfig

**Files:** Create `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs` (flat); Modify root `package.json` (devDeps + `lint`, `format` scripts)
- [ ] `.editorconfig`: utf-8, lf, final newline, 2-space indent.
- [ ] Prettier: `{ "semi": false, "singleQuote": true, "printWidth": 100 }` — **first inspect dominant existing style in `apps/api/src` and `apps/web/app` and match it**; ignore `.nuxt`, `.output`, `dist`, `controls`, `docs/archive`, `pnpm-lock.yaml`.
- [ ] ESLint flat config: `typescript-eslint` recommended (non-type-aware) for `apps/{api,cli}/src` + `packages/shared`, `eslint-plugin-vue` flat/recommended + `typescript-eslint` for `apps/web`; disable stylistic rules that fight Prettier (`eslint-config-prettier`). Keep rule set modest; prefer per-line disables with reasons over global switches for legit violations.
- [ ] Run `pnpm format` once (whole-repo style commit, no logic changes), then `pnpm lint` and fix or explicitly disable findings.
- [ ] Run: `pnpm build && pnpm test` → green (format must not break anything).
- [ ] Commit 1: `style: format repo with prettier` Commit 2: `chore: add eslint + prettier + editorconfig tooling`

### Task B4: web typecheck capability

**Files:** `apps/web/package.json`, root `package.json`
- [ ] Add `vue-tsc` devDep to web; script `"typecheck": "nuxt typecheck"`. Root script `"typecheck": "pnpm --filter api build && pnpm --filter web typecheck"`. Do NOT slow `nuxt build` (keep `typescript.typeCheck` off; CI runs typecheck explicitly).
- [ ] Run `pnpm typecheck`; fix any surfaced web type errors (expect a handful — fix genuinely, don't `as any`).
- [ ] Commit: `chore(web): add vue-tsc typecheck script (root pnpm typecheck)`

### Task B5: coverage tooling

- [ ] Add `@vitest/coverage-v8` to api/web/cli devDeps; script `test:coverage` per app + root aggregate. No thresholds yet (non-gating).
- [ ] Run one: `pnpm --filter api test:coverage` → report generates.
- [ ] Commit: `chore: add vitest v8 coverage (non-gating)`

### Task B6: GitHub Actions CI

**Files:** Create `.github/workflows/ci.yml`
- [ ] Workflow on push/PR to main: checkout → pnpm/action-setup (read version from `packageManager` field if present, else lockfile-compatible) → setup-node 22 + pnpm cache → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm build` → `pnpm test` (now includes CLI). No system binaries needed (qpdf/Java are mocked in tests).
- [ ] Validate YAML (`node -e` yaml parse or actionlint if available). Cannot run remotely until pushed — note that in the commit body.
- [ ] Commit: `ci: add GitHub Actions pipeline (lint, typecheck, build, all test suites)`

---

## Phase C — Security hardening (each with tests-first)

### Task C1: OOXML aggregate zip limits

**Files:** `audit.config.ts` (limits), `apps/api/src/services/ooxml.ts` (shared gate fn), callers in `docxService.ts`/`pptxService.ts`/`xlsxService.ts` (or the single load-entry point if one exists — prefer wiring the check right after `JSZip.loadAsync`), tests in `apps/api/src/__tests__/`
- [ ] TDD: failing tests first — a zip with > MAX_ENTRIES entries rejects with the existing invalid-document error shape; a zip whose summed declared uncompressed sizes > MAX_TOTAL_UNCOMPRESSED rejects. Build fixtures in-memory with jszip.
- [ ] Implement `assertZipWithinLimits(zip)` in `ooxml.ts` using entry count + sum of entry metadata sizes; constants in `audit.config.ts` (e.g. `OOXML.MAX_ZIP_ENTRIES: 10_000`, `OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES: 512MB` — pick values comfortably above real-world docs; document rationale). Wire into every loadAsync path (including the ooxmlWorker child if it loads independently).
- [ ] Run: `pnpm --filter api test` → all pass including new.
- [ ] Commit: `feat(api): aggregate zip limits for OOXML packages (entry count + total uncompressed)`

### Task C2: XML entity hardening

**Files:** `apps/api/src/services/ooxml.ts:26-32`, tests
- [ ] TDD: failing test — an OOXML part containing `<!DOCTYPE` + internal entity expansion is rejected/neutralized (no expansion in output).
- [ ] Set `processEntities: false` on the XMLParser options AND reject parts matching `/<!DOCTYPE/i` before parse (belt and braces; OOXML never legitimately carries DOCTYPE). Verify no existing behavior depends on entity decoding (`&amp;` etc. — fast-xml-parser handles the five XML built-ins even with processEntities false? **Verify**: if built-in entities break (e.g. alt text containing `&amp;`), keep processEntities true and rely on DOCTYPE rejection only — document whichever holds, with a test proving `&amp;` in alt text still decodes).
- [ ] Run: `pnpm --filter api test`.
- [ ] Commit: `feat(api): refuse DOCTYPE in OOXML parts; harden XML entity handling`

### Task C3: SQLite migration runner

**Files:** `apps/api/src/db/sqlite.ts:136-219`, new `apps/api/src/db/migrations.ts`, tests
- [ ] TDD: tests — fresh DB lands at latest `user_version` with full schema; a DB snapshotted at version N gets exactly the N+1..latest migrations; re-open is a no-op.
- [ ] Implement numbered migration list (array of `{ version, up(db) }`) keyed on `PRAGMA user_version`, executed in a transaction each. Convert the six existing probe+ALTER blocks into migrations 1..6 **preserving idempotence for existing prod DBs**: baseline migration must detect an already-provisioned legacy DB (probe a known column) and fast-forward `user_version` without re-running ALTERs.
- [ ] Run: `pnpm --filter api test`.
- [ ] Commit: `refactor(api): numbered sqlite migrations on PRAGMA user_version`

### Task C4: JWT revocation (jti denylist)

**Files:** `apps/api/src/routes/auth.ts`, `apps/api/src/middleware/authMiddleware.ts:63`, new migration (revoked_jtis table: jti PK, expires_at), tests
- [ ] TDD: failing tests — login issues token containing `jti`; logout inserts jti into denylist; subsequent request with that token → 401; token without jti (legacy) still accepted until expiry; expired denylist rows purged opportunistically.
- [ ] Implement: `jti: crypto.randomUUID()` at sign; middleware checks denylist when `payload.jti` present; logout writes row with token's `exp`; cleanup deletes rows past expiry (piggyback on existing cleanup interval in index.ts if present).
- [ ] Run: `pnpm --filter api test`.
- [ ] Commit: `feat(api): server-side JWT revocation via jti denylist on logout`

### Task C5: remediation status/receipt authorization (anonymous mode)

**Files:** `apps/api/src/routes/remediate.ts:374,549` (+ job creation response), `apps/web/app/composables/useRemediationJob.ts` (+ any receipt fetch), tests both apps
- [ ] READ FIRST: how the download token is minted/verified (`verifyDownloadToken`, remediate.ts:430) and what the creation response returns. Design: creation response already includes (or will include) the download token; require it (query `?token=` or `X-Job-Token` header) on status + receipt reads whenever `!AUTH.REQUIRE_LOGIN || !job.email`; keep logged-in path unchanged.
- [ ] TDD: api tests — status/receipt without token → 404 (don't leak existence), with valid token → 200, wrong token → 404; logged-in owner path unchanged. Web test — poller passes token from creation response.
- [ ] Implement API check + wire token through the web poller and receipt fetch. In-flight jobs across deploy: acceptable break (documented in commit body).
- [ ] Run: `pnpm --filter api test && pnpm --filter web test`.
- [ ] Commit: `feat: bind remediation status/receipt reads to job token in anonymous mode`

---

## Phase D — API structural refactors (behavior-frozen)

### Task D1: split scorer.ts by format

**Files:** `apps/api/src/services/scorer.ts` (~3k lines) → `apps/api/src/services/scoring/{docx,pptx,xlsx,pdf}.ts`; `scorer.ts` becomes facade re-exporting everything currently exported
- [ ] Pure move: docx lines ~242-609 → `scoring/docx.ts`, pptx ~663-1111 → `scoring/pptx.ts`, xlsx ~1166-1499 → `scoring/xlsx.ts`, PDF remainder → `scoring/pdf.ts`; shared helpers used by 2+ formats → `scoring/common.ts`. `scorer.ts` re-exports the full previous surface so NO import or test changes anywhere else.
- [ ] Run: `pnpm --filter api build && pnpm --filter api test` — 816+ tests pass UNCHANGED (this is the frozen-behavior proof).
- [ ] Commit: `refactor(api): split scorer.ts into per-format scoring modules (facade preserved)`

### Task D2: extract qpdf struct-tree walkers

**Files:** `apps/api/src/services/qpdfService.ts` (~1.4k) → new `apps/api/src/services/qpdfStructTree.ts`
- [ ] Move pure walkers (`normRef`, `resolveRef`, `collectDescendantTableRefs`, `collectHeadingsInOrder`, `analyzeTable`, and their private helpers) to `qpdfStructTree.ts`; `qpdfService.ts` keeps spawning/recovery/normalization and imports the walkers. Re-export moved names from `qpdfService.ts` if tests import them from there.
- [ ] Run: `pnpm --filter api build && pnpm --filter api test` — pass unchanged.
- [ ] Commit: `refactor(api): extract qpdf struct-tree walkers from process service`

### Task D3: shared URL-audit pipeline

**Files:** `apps/api/src/routes/analyze-url.ts`, `apps/api/src/routes/audit-url.ts:90-367`, new `apps/api/src/services/urlAuditPipeline.ts`
- [ ] Extract the shared gate→safeFetch→detectFileType→analyzeDocument sequence into `runUrlAudit(input): Promise<UrlAuditOutcome>` consumed by both routes; audit-url additionally persists (move its hash-dedup+persist block into a service fn or keep in route — route keeps only HTTP concerns). Response shapes byte-identical (tests prove).
- [ ] Run: `pnpm --filter api test` — route tests pass unchanged.
- [ ] Commit: `refactor(api): shared url-audit pipeline for analyze-url/audit-url`

### Task D4: consolidate readCapped

**Files:** `apps/api/src/services/docxService.ts:326`, `apps/api/src/services/ooxml.ts:216`
- [ ] Extend shared `readCapped` with optional error-factory arg (matching docx's local semantics); delete docx's local copy; docx imports shared.
- [ ] Run: `pnpm --filter api test` — pass unchanged.
- [ ] Commit: `refactor(api): single shared readCapped for all OOXML services`

---

## Phase E — @file-audit/analyzer package

### Task E1: create the package and move the engine

**Files:** Create `packages/analyzer/{package.json,tsconfig.json,src/index.ts}`; move from `apps/api/src/services/`: `analyzer.ts`, `pdfAnalyzer.ts`, `pdfjsService.ts`, `qpdfService.ts`, `qpdfStructTree.ts`, `qpdfNormalize.ts`, `ooxml.ts`, `ooxmlRunner.ts`, `ooxmlWorker.ts`, `docxService.ts`, `pptxService.ts`, `xlsxService.ts`, `scorer.ts` + `scoring/`, `veraPdf.ts`, `childSpawnEnv.ts` (VERIFY exact closure by tracing imports from `analyzer.ts` before moving; anything Express/db/mailer-touching stays in api)
- [ ] `packages/analyzer/package.json`: name `@file-audit/analyzer`, version `1.33.0`, `"type": "module"`, deps: `@file-audit/shared workspace:*`, `pdfjs-dist`, `jszip`, `fast-xml-parser` (move from api's deps whichever only the engine uses; api keeps ones it still uses directly), `imports: { "#config": "../../audit.config.ts" }`, exports map for `./` and the worker entry (ooxmlRunner spawns `ooxmlWorker` by path — fix the spawn path to resolve within the package).
- [ ] `apps/api`: depend on `@file-audit/analyzer`; keep thin re-export shims at old `src/services/*` paths so api tests/imports are untouched (shim = `export * from '@file-audit/analyzer/<module>'`). API-only services (safeFetch, urlPolicy, pageAuditor, reportSanitize, mailer, auditLog, remediation*, authConfig, pageAuditGuard) stay put.
- [ ] Engine tests currently in `apps/api/src/__tests__` keep running against the shims (do not move test files in this task).
- [ ] Run: `pnpm install && pnpm build && pnpm --filter api test` — 816+ unchanged. Also `pnpm --filter web build` (proxy/type imports unaffected).
- [ ] Commit: `refactor: extract @file-audit/analyzer package from api services (shims preserve api paths)`

### Task E2: CLI consumes the package; kill dead build config

**Files:** `apps/cli/package.json`, `apps/cli/src/commands/audit.ts:3-5`, `apps/cli/src/commands/publist.ts:3`, delete `apps/cli/tsup.config.ts`
- [ ] Replace `../../../api/src/services/*` imports with `@file-audit/analyzer`; declare deps: `@file-audit/analyzer`, `@file-audit/shared` (workspace), keep `better-sqlite3`; drop `pdfjs-dist` if now transitive-only… actually keep deps EXPLICIT for anything cli imports directly.
- [ ] Delete `tsup.config.ts`, `bin`, `build`, `start` scripts (CLI runs via tsx everywhere; document in cli README/AGENTS if referenced).
- [ ] Run: `pnpm --filter @icjia/a11y-audit test` (44+) and a smoke `pnpm --filter @icjia/a11y-audit dev -- --help`.
- [ ] Commit: `refactor(cli): depend on @file-audit/analyzer; remove dead tsup build`

---

## Phase F — Web maintainability + a11y

### Task F1: lazy TechnicalExplainer out of index.vue

**Files:** `apps/web/app/pages/index.vue:764-3236` → new `apps/web/app/components/TechnicalExplainer.vue`
- [ ] Move the static `<details>` block verbatim into the component; use `<LazyTechnicalExplainer />` (Nuxt auto-lazy) at the original spot, hydrated on visibility if supported (`hydrate-on-visible`). No copy changes.
- [ ] Run: `pnpm --filter web test && pnpm --filter web build`; dev-render `/` and diff visible content.
- [ ] Commit: `perf(web): extract homepage technical explainer into lazy component`

### Task F2: split data-retention.vue into section components

**Files:** `apps/web/app/pages/data-retention.vue` (3.7k lines) → `apps/web/app/components/dataRetention/SectionNN*.vue` (one per top-level numbered section)
- [ ] Mechanical, content-preserving split; page becomes a thin shell importing sections in order. Preserve heading ids/anchors (§10 is linked from release checklist).
- [ ] Run: `pnpm --filter web test && pnpm --filter web build`; render and verify section anchors + § numbering.
- [ ] Commit: `refactor(web): split data-retention prose into section components`

### Task F3: dedupe history pages

**Files:** `apps/web/app/pages/history.vue`, `apps/web/app/pages/my-history.vue`, new `apps/web/app/composables/usePaginatedReports.ts`, new `apps/web/app/components/ReportsTable.vue` + `PaginationControls.vue`, tests
- [ ] TDD: component tests for ReportsTable (rows render, date formatting) and composable (page changes refetch, query wiring) before extraction; then both pages become thin wrappers. Include Task F6's `scope="col"` + visually-hidden `<caption>` in ReportsTable from the start.
- [ ] Run: `pnpm --filter web test`.
- [ ] Commit: `refactor(web): shared paginated reports table for history pages`

### Task F4: ReportDownloadBar

**Files:** new `apps/web/app/components/ReportDownloadBar.vue`; Modify `apps/web/app/pages/report/[id].vue:166-261`, `apps/web/app/pages/index.vue:330-423`
- [ ] Component loops `[{label, format, handler}]` from `useReportExport`; replaces all 10 blocks. Buttons keep existing labels/classes (visual no-op) and get `aria-label`s if missing.
- [ ] Run: `pnpm --filter web test && pnpm --filter web build`.
- [ ] Commit: `refactor(web): single ReportDownloadBar component for export buttons`

### Task F5: split useReportExport

**Files:** `apps/web/app/composables/useReportExport.ts` (1,264 lines) → pure builders to `apps/web/app/utils/exportFormats/{markdown,json,text,html,aiAnalysis}.ts`
- [ ] Pure moves; composable becomes thin orchestrator. Existing export tests pass unchanged (update import paths only if tests import builders directly).
- [ ] Also here: replace `file-saver` with a 5-line native anchor-download helper in `app/utils/download.ts`; drop the dep; trim the ~300-char `keywords` meta in `nuxt.config.ts`.
- [ ] Run: `pnpm --filter web test && pnpm --filter web build`.
- [ ] Commit: `refactor(web): pure export builders in utils; drop file-saver`

### Task F6: a11y dogfooding fixes

**Files:** `apps/web/app/components/ProcessingOverlay.vue`, `apps/web/app/pages/index.vue` (analysisError + results focus), `apps/web/app/pages/login.vue:36,76`, `apps/web/app/components/ReportContent.vue` (score table), any remaining tables
- [ ] TDD where testable: overlay stage wrapped in `role="status" aria-live="polite"`; error banners get `role="alert"`; all `<th>` get `scope`; every data table gets visually-hidden `<caption>`; after analysis completes, `nextTick()` focus to result heading (`tabindex="-1"`). Mirror the existing correct pattern in `RemediateButton.vue:207,265`.
- [ ] Run: `pnpm --filter web test`; then `mcp axecap audit` on dev server pages (/, /history, a report page) → zero new violations.
- [ ] Commit: `fix(web): live regions, table semantics, and post-analysis focus management`

### Task F7: type the report data path

**Files:** `apps/web/app/pages/report/[id].vue` (~15 `as any`), `apps/web/app/pages/index.vue:3479-3484` (`singleResult`, `batchItems`)
- [ ] Type `useFetch<...>` and refs with the shared report types from `@file-audit/shared` (`types.ts`); remove every `as any` on this path; fix what the types surface (genuinely — no re-casting).
- [ ] Run: `pnpm --filter web test && pnpm typecheck`.
- [ ] Commit: `refactor(web): typed report data path (no more as-any casts)`

---

## Phase G — Final verification + docs

### Task G1: full gate

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green; record final per-suite counts.
- [ ] Manual smoke via dev servers: upload a PDF fixture from `controls/` → report renders; remediation status polling works with token; login/logout+revocation works.

### Task G2: docs sync

- [ ] README: final test counts, analyzer-package architecture note, CI mention, § Security additions (zip limits, DOCTYPE rejection, JWT revocation, remediation token binding). AGENTS.md: same. `apps/web/app/pages/data-retention.vue` §10 audit-log entry per release checklist (plain language).
- [ ] Commit: `docs: sync README/AGENTS/data-retention with review-fix release`

### Task G3: handoff

- [ ] Present summary; ASK user about version number (suggest 1.34.0 — features: revocation, zip limits, token binding), CHANGELOG entry, tag, merge to main, push, deploy. Do NOT push or tag unilaterally.

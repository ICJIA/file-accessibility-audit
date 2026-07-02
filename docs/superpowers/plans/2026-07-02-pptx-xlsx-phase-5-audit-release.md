# Phase 5: Red/Blue Security Audit + v1.33.0 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adversarially audit the new PPTX/XLSX surface, fix every confirmed finding test-first, then ship v1.33.0 through the full release checklist.

**Architecture:** Three parallel red-team review agents scoped to the new attack surface (this repo's custom for every feature release: v1.27.0, v1.30.0, v1.32.0 precedents), findings verified against the code and fixed via TDD, then the mechanical release train.

**Tech Stack:** Same as the repo; no new tools.

**Prerequisites:** Phases 1–4 merged and green (`pnpm build` + both suites).

## Global Constraints

- Master plan Global Constraints apply (frozen PDF/DOCX code, TDD fixes, conventional commits, **no AI-attribution trailers**).
- A finding is only "fixed" when a test reproduces it, the fix lands, and the test passes.
- Pushing is not deploying: prod requires the manual droplet `./rebuild.sh` — the release task ends with that reminder, never with "it's live."

---

### Task 1: Red/blue audit of the new surface

**Files:**
- Modify: only files with confirmed findings (plus their test files).
- Test: new regression tests per finding, in the suite closest to the fixed code.

**Interfaces:**
- Consumes: the complete Phase 1–4 diff (`git diff v1.32.1...HEAD`).
- Produces: an audit summary (docs/ not required — record findings + dispositions in the Task 3 CHANGELOG Security section), regression tests per fixed finding.

- [ ] **Step 1: Dispatch three parallel red-team reviews**

Run three independent review agents (Agent tool, or `/security-review` scoped per area), each given `git diff v1.32.1...HEAD` plus these briefs:

1. **Parser/DoS red team** — attack `ooxml.ts`, `pptxService.ts`, `xlsxService.ts`, `analyzer.ts` detection: decompression bombs in every newly-read part (slides, masters, themes, worksheets, tables, drawings, sharedStrings, styles — is EVERY `zip.file(...)` read routed through `readCapped` with the right per-format cap and error type?); element floods just under the byte cap (do `MAX_SLIDES`/`MAX_SHAPES`/`MAX_SHEETS`/`MAX_CELLS` fire before the expensive walks?); malformed/missing `[Content_Types].xml`, rels cycles, rels `Target` pointing outside the package (must be lookup-only — verify nothing joins paths to the filesystem); parser edge cases (deeply nested nodes, huge attribute values).
2. **Injection red team** — hostile strings in every new attacker-controlled field (alt text, slide titles, sheet names, hyperlink text/URLs, core-properties title/creator, contrast finding text): trace each to every render sink (Vue templates, HTML export via `escapeHtml`, markdown/text exports, shared-report store → `reportSanitize` guards) and to the conformance-finding `issue` strings. Confirm `javascript:`-URL link findings can't become clickable hrefs anywhere (the v1.32.0 helpLinks lesson).
3. **Logic/bypass red team** — flags (`PPTX_ENABLED=false` truly 404s/rejects everywhere incl. analyze-url and multer); semaphore + timeout actually wrap both new analyzers; caps use the right config constants; the remediation guard (`fileType === 'pdf'`) can't be reached with a pptx/xlsx result; gate findings can't fire from heuristic signals (spec's conservatism promises).

- [ ] **Step 2: Verify every finding against the code; fix confirmed ones test-first**

For each confirmed finding: write the failing regression test → run it (FAIL) → minimal fix → run (PASS) → commit as `fix(security): <finding>` (one commit per finding). Discard non-reproducible findings with a one-line disposition note kept for the CHANGELOG.

- [ ] **Step 3: Re-run the gate**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm build && cd apps/api && npx vitest run && cd ../web && npx vitest run
```

Expected: all green.

---

### Task 2: End-to-end verification on real files

- [ ] **Step 1: Drive the running app with real documents**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm dev
```

Then, in a browser against `http://localhost:5102`: upload a real agency `.pptx` and `.xlsx` (plus the committed accessible/inaccessible fixture pairs). Verify: score card renders with the per-format categories; N/A sections show honest reasons; conformance panel lists the expected findings; HTML/Markdown/text exports carry the new labels ("PowerPoint", "N slides"); a shared report link renders identically; the remediation button appears ONLY for PDF results; CLI: `pnpm --filter cli start audit <file.pptx>` prints the report.

Expected: fixture pair scores match the calibration targets from Phases 2–3 (accessible ≥ 90/A-range; inaccessible ≤ 35/F-range).

---

### Task 3: Release v1.33.0

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `apps/web/package.json`, `apps/api/package.json`, `README.md`, `apps/web/app/pages/data-retention.vue`, `apps/web/nuxt.config.ts`

- [ ] **Step 1: CHANGELOG entry**

Add `## [1.33.0] - <date>` at the top: narrative line (PowerPoint + Excel auditing), **Added** (the two checkers, shared OOXML core, new categories slide_titles/sheet_names, active pptx reading_order), **Fixed** (the `!== 'docx'` remediation-guard latent bug), **Security** (audit summary from Task 1 findings/dispositions).

- [ ] **Step 2: Version bumps + README + data-retention + dateModified**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
sed -i '' 's/"version": "1.32.1"/"version": "1.33.0"/' package.json apps/web/package.json apps/api/package.json
```

Then by hand: README badges (`version-1.33.0`, `tests-<new count>`), the "**N tests** across M test files" line (get the real numbers from the vitest runs), README §Security paragraph for the Task 1 audit, feature prose if Phase 4 missed any "PDF and Word" phrasing (`grep -rn "PDF and Word" README.md`); `apps/web/app/pages/data-retention.vue` §10 — add the v1.33.0 audit entry in the established plain-language style; `apps/web/nuxt.config.ts` `dateModified` → release date.

- [ ] **Step 3: Final gate, commit, tag, push**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build && (cd apps/api && npx vitest run) && (cd apps/web && npx vitest run)
git add -A && git status   # review: ONLY intended release files
git commit -m "chore(release): 1.33.0"
git tag v1.33.0
git push origin main --tags
```

- [ ] **Step 4: Deploy reminder (do not skip)**

Tell the user: pushed ≠ live. Deploy = SSH to the droplet → `./rebuild.sh`. No new env vars are required (`PPTX_ENABLED`/`XLSX_ENABLED` default on). After deploy, verify live: upload the accessible fixture pair on https://audit.icjia.app and confirm the expected grades.

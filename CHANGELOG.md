# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

## [1.24.1] - 2026-06-05

Accuracy fixes for table-structure and heading diagnostics, reported by users. Full write-up in [docs/table-and-heading-accuracy-fixes.md](docs/table-and-heading-accuracy-fixes.md).

### Fixed

- **Inflated table and row counts.** A table nested inside another table's cell was counted as a separate top-level table, inflating both the table count and the summed row count shown in the report ("more rows than the PDF actually has"). Nested tables are now excluded from the top-level list; the parent table still reports the nested-table flag.
- **Heading outline shown out of order.** Headings were listed in PDF object-number order rather than document reading order, so an H1 tagged late (e.g. during remediation) could appear at the *end* of the outline. Headings are now collected by walking the structure tree in reading order. This also removes a latent mis-scoring: object-order headings could trigger a false "heading hierarchy skip" and wrongly lower the Heading Structure category.
- **Table scored below 100 while passing every check.** The 5-point header-association check credited only the explicit `/Headers` attribute and ignored `/Scope`. A simple table correctly built with `/Scope` (the recommended technique for simple tables) was docked 5 points it should have earned. Header association is now satisfied by `/Scope` **or** `/Headers`, per **WCAG 2.1/2.2** Level AA (Success Criterion 1.3.1, Info and Relationships — unchanged between the two versions). This satisfies the IITAA 2.1 legal floor and the app's 2.2 anchor equally; no version dependence.

### Changed

- `parseQpdfJson` now collects headings and tables by traversing the structure tree (`StructTreeRoot` → `/K`) in document order, falling back to the flat object scan only when the tree yields nothing. Tables are also analyzed after the full object map is read, so custom-role tables map correctly regardless of object number.
- WCAG references in the scoring-rubric tooltips, the README category table, and the new accuracy doc now name the version explicitly ("WCAG 2.1/2.2 SC 1.3.1" rather than a bare "1.3.1"), so a reader scanning for WCAG 2.1/2.2 sees it up front. This is presentational only — the version-neutral criterion data that powers the version-aware UI and the `WCAG_VERSION` 2.1↔2.2 switch is unchanged.

### Compatibility

- No category-weight, API, schema, or export-format changes. Scores may move for affected files: a table using `/Scope` without `/Headers` gains up to 5 points in the Table Markup category (e.g. the inconsistent-columns + scope case now scores 90, was 85); documents whose headings were mis-ordered no longer incur false hierarchy-skip penalties; and table/row counts in the detail decrease where nested tables were previously over-counted.

### Tests

- API suite **354 → 357**: new coverage for document-order heading collection, nested-table exclusion, and `/Scope`-based header association; the inconsistent-columns expectation was corrected (85 → 90).

### Docs

- Added `docs/table-and-heading-accuracy-fixes.md` (diagnosis, fixes, tests, follow-ups).
- Trimmed `/docs` to the currently-applicable set; superseded and roadmap-only documents moved to `docs/archive/` (Phase 2/3/4, use-cases, the remediation feasibility spike, and the Adobe-parity note).

## [1.24.0] - 2026-06-03

### Added
- **WCAG 2.2 re-anchor.** The audit now reports against WCAG 2.2 Level AA (a strict superset of WCAG 2.1 AA). New 2.2 criteria are surfaced honestly as "not assessed — manual review"; the form-relevant ones (2.5.8 Target Size, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication) appear in the verdict only for PDFs with interactive form fields. Automated checks and score weights are unchanged.
- **Illinois IITAA 2.1** cited alongside WCAG + ADA Title II across the homepage, footer, conformance box, exports, and meta.
- **Reusable landing-page announcement banner** (permanently dismissible per announcement id).
- **New `/wcag-2-2` page** — plain-language manager guide to how WCAG 2.2 differs from 2.1.
- **`WCAG_VERSION` env flag** — set to `2.1` to revert all labels, links, and the 2.2 not-assessed criteria. The API reverts on restart; the web UI reverts on rebuild (Nuxt bakes runtimeConfig at build time). A normal redeploy does both.

### Changed
- 4.1.1 "Parsing" removed from criterion references (obsolete in WCAG 2.2).

## [1.23.0] — 2026-06-03

### Added — Prominent filename banner on every report

Every downloadable and shareable report now leads with a full-width banner across the top that names the audited file, so a saved or forwarded report can never be mistaken for another document.

- **New `ReportFileBanner` component** shows an `ACCESSIBILITY REPORT FOR` eyebrow, the filename in bold (wrapping, never truncated), and an `N pages · PDF` line. It sits at the top of the live audit result — including each batch tab — and the shared `/report/:id` page, and is inherited by the browser print / Save-as-PDF path.
- **Exports carry the same prominence.** The HTML export gains a styled banner above the title with a print-legible rule; the Word export gains a shaded, bordered filename block before the title; the Markdown export now leads with the filename as its top-level `#` heading. JSON is unchanged — it already carries `file.name`.
- **No duplicated filename.** `ScoreCard` gains a `showFilename` prop (default on); the live and shared pages turn it off so the filename is not repeated in gray beneath the new banner. The remediation before/after cards are unchanged.

### Tests

- Web suite grows to **301 tests** (from 280): new `reportBanner`, `ReportFileBanner`, and `reportExportBanner` suites plus a `ScoreCard` `showFilename` case. Project total: **651 tests** across 27 files.

## [1.22.3] — 2026-05-22

### Changed — Scoring follow-ups

A cleanup pass on the scoring engine following the v1.22.0 conformance-gate release. No category weights changed.

- **Executive summary reconciled with the conformance verdict.** `generateSummary` now takes the WCAG conformance verdict into account: a confirmed conformance failure outranks the numeric grade, so the summary no longer reads positively while the verdict box separately reports a failure. An incomplete analysis (encrypted or damaged file) is now summarised honestly as such.
- **Severity-label bug fixed in the summary.** The summary's issue-free category count filtered on the severity label `"Pass"`, which v1.22.0 renamed to `"No issues found"` — so for grade-B documents the count had silently read **0 of N** since v1.22.0. Fixed.
- **Coverage ratios floor instead of round.** Alt-text, link-quality, and form-accessibility category scores are now `floor((covered / total) × 100)`. Previously `round()` could lift a 99.5%-coverage ratio to a perfect 100 and a "No issues found" severity — a category looked flawless with an item still missing. A sub-100% ratio now always scores at most 99. Per-category impact is ≤ 1 point.

### Removed

- Deleted two confirmed-unreachable scoring functions from `scorer.ts` — `scorePdfUaCompliance` (~159 lines; the PDF/UA category was dropped from the audit in v1.21.0) and `refreshCategoryPresentation` — trimming dead, auditable surface.

### Compatibility

- No category-weight, API, schema, or export-format changes. The only score movement is the ≤ 1-point `floor` adjustment on the alt-text / link-quality / form-accessibility categories when coverage is not a whole percentage; an overall document score may therefore shift by a fraction of a point.

## [1.22.2] — 2026-05-22

### Changed

- **Conformance verdict copy for a failing document.** For a failing document (grade C/D/F), the verdict box heading now reads "This document needs **additional manual** remediation" (was "This document needs remediation"), and the body spells out the next step — the remaining fixes are hands-on: run the file through Adobe Acrobat's Accessibility Checker, or repair the source document (Word, InDesign) and re-export, then re-run the audit to confirm. It makes explicit that the automated audit and auto-remediation only go so far.

### Fixed

- **`README.md` `## Tests` section.** The per-file test tables and totals had drifted stale — they reported 236 API / 238 Web tests against an actual suite of **342 API / 280 Web (622 tests across 24 files)**. The tables now list every test file with its current count and coverage.

### Compatibility

- No API, schema, scoring, or export changes — UI copy and documentation only.

## [1.22.1] — 2026-05-22

### Changed — Conformance verdict presentation

A copy and presentation refinement of the WCAG conformance verdict introduced in v1.22.0, plus a small wording tweak to the server-status indicator. The verdict logic, the success criteria it checks, and the export wording are all unchanged — only how the on-page verdict box looks and reads.

- **The verdict box color now follows the grade**, not pass/fail: a green panel for an A or B grade, red for C/D/F, neutral grey when analysis could not complete. A strong document with a single flagged criterion is no longer shown an alarm-red box — but the box still lists every flagged criterion regardless of color, so nothing is hidden.
- **Grade-aware verdict copy.** The headline softens to "A few items still need attention" for an A/B document and "This document needs remediation" for C/D/F. For a high-scoring document the body now explains *why* a strict reading still flags it — WCAG conformance is all-or-nothing per success criterion, so a single missing tag flags the whole document — while affirming that the grade reflects a document in good shape.
- **The standards named in the verdict box footer are now clickable** — WCAG 2.1 Level AA links to the W3C quick reference, the **Illinois IITAA links to the IITAA 2.1 standards**, and ADA Title II links to the DOJ rule.
- The Word / HTML / Markdown / JSON exports keep the formal "does not meet WCAG 2.1 Level AA" wording — a downloaded report is a compliance record, where firmer language is appropriate.
- **Server status indicator** now reads "audit server online / offline" instead of "up / down".

### Compatibility

- No API, schema, or scoring changes. The `conformance` verdict data, the category fields, and all four export formats are byte-identical to v1.22.0; only the audit-page and saved-report-page rendering of the verdict box changed.

## [1.22.0] — 2026-05-21

### Added — WCAG 2.1 conformance gate

Every audit now produces a binary **WCAG 2.1 conformance verdict** alongside the 0–100 score — on the audit page, on saved-report pages, and in all four export formats (Word, HTML, Markdown, JSON). The score is a weighted, partial-credit *prioritised-readiness* metric, but WCAG conformance is all-or-nothing per success criterion, so a document can score 90+ ("A") and still fail WCAG. The gate answers that pass/fail question honestly and separately.

- **`apps/api/src/services/scoring/conformance.ts`** (new) — flags confirmed, machine-checkable WCAG 2.1 violations: untagged document (1.3.1), no extractable text (1.1.1), tagged figures missing alt text (1.1.1), no document language (3.1.1), no document title (2.4.2), malformed lists (1.3.1), tables without header cells (1.3.1), unlabeled form fields (4.1.2), and confirmed reading-order drift (1.3.2). Each failure links to its W3C "Understanding" page.
- The verdict is framed around **Level AA** — the bar the Illinois IITAA and the ADA Title II rule require. It never claims "conformant": a clean automated run reports "no automated failures detected — manual review still required." When an analyzer cannot process a file (encrypted/damaged) it reports `incomplete` rather than guessing.
- The verdict box names the standards basis in plain language (WCAG 2.1 AA / IITAA / ADA Title II) for non-technical reviewers.

### Changed — Scoring rigor

- **Reweighted** to match WCAG conformance levels: Reading Order 5% → 10% (1.3.2 is Level A — out-of-order content makes a document unusable), Bookmarks 10% → 5% (2.4.5 is Level AA and partly satisfiable by a clear heading structure). Weights still sum to 100%.
- **Missing bookmarks** softened from 0 / Critical to 45 / Moderate — an absent navigation aid for a Level-AA criterion is no longer scored as a critical failure.
- **Link Quality** now flags the canonical WCAG 2.4.4 failures — vague phrases such as "click here" and "read more" — not only raw URLs.
- **Per-category severity** "Pass" renamed to **"No issues found"** and reserved for a perfect 100; 70–99 is now "Minor". A category at 90–99 still has at least one finding, so it is no longer labelled issue-free.
- **N/A split** into "Not applicable" (the document genuinely has no tables/forms/links) and "Not assessed" (the tool did not or could not evaluate it). Color contrast now reads "Not assessed", never a silent pass.
- **Published WCAG success-criteria map** — each category declares the exact WCAG 2.1 success criteria and conformance level it evaluates; surfaced on the Technical Details page.

### Fixed

- The conformance gate emitted fabricated WCAG failures when an analyzer errored on a damaged or encrypted PDF. It now returns an honest `incomplete` verdict. Found in this release's adversarial scoring review; regression test added.

### Compatibility

- **Score discontinuity.** Because category weights, the bookmarks penalty, and the severity labels changed, **v1.22.0 scores are not directly comparable to pre-v1.22.0 scores.** A fleet audit spanning the upgrade will show score movement that reflects the methodology change, not the documents — re-baseline any in-progress campaign against v1.22.0.
- `audit_log`, `shared_reports`, and `remediation_jobs` schemas unchanged. The audit response gains a `conformance` object and each category gains optional `notAssessed` and `wcagCriteria` fields; consumers that ignore unknown fields are unaffected.
- Saved reports created before v1.22.0 carry no `conformance` data — the verdict box is simply hidden on those.

## [1.21.1] — 2026-05-19

### Fixed — Saved-report UI now matches the real-time audit page

v1.21.0 removed the Adobe Acrobat parity card from the real-time audit page when the dual Strict/Practical scoring toggle was retired, but the same card block was left behind on the shared-report page (`/report/:id`). Anyone receiving a saved-report link still saw the 32-rule Acrobat assessment that the live audit no longer showed, so two auditors comparing notes against the same content could end up looking at two different summaries depending on which URL they had.

- **`apps/web/app/pages/report/[id].vue`** — removed the `<AdobeParityCard :parity="data.report.adobeParity" />` block (5 lines net). The saved report now renders the same single Strict score, category table, and detailed findings as the real-time audit page.
- **No schema migration.** The `adobeParity` field is still persisted in `shared_reports.report_json` for backward compatibility with any external consumer that already parses it; only the rendered card is gone. Historical shared-report rows are unaffected.
- The per-finding "How to Fix in Adobe Acrobat" remediation guidance inside each category card was intentionally kept — that guidance also appears on the real-time audit page and is per-finding remediation advice, not a separate scoring profile.

### Changed — Analyze rate limit temporarily raised for the ICJIA fleet audit pass

- **`RATE_LIMITS.analyze`** raised from `35` to `5000` per hour per email (`audit.config.ts`) to support the in-flight ICJIA fleet audit campaign — the ~5000-PDF inventory is being re-audited across multiple passes over several days as content is remediated and re-checked, not a single one-shot pass. The comment in `audit.config.ts` documents the reason and the intent to revert once the campaign concludes. The daily remediation cap (`100/day/caller`), the 60-minute audit-gate hash check, the URL allowlist + SSRF protections, the upload size cap, and the auth gate are all unchanged.

### Compatibility

- `audit_log`, `shared_reports`, and `remediation_jobs` schemas unchanged.
- `result.scoreProfiles.remediation` and the `practical` key in `/api/audit-url` continue to be structural aliases of Strict (carried forward from v1.21.0); the alias will be removed in a future release once consumers have migrated.

## [1.21.0] — 2026-05-19

### Changed — Single Strict score, veraPDF promoted on the remediation page

User feedback consistently flagged the audit UI as information-dense — auditors and agency staff were toggling between two scoring profiles ("Strict" and "Practical") and trying to reconcile the difference instead of acting on the underlying findings. After review, **Practical was retired**. The remaining profile, **Strict (WCAG 2.1 AA + IITAA §E205.4)**, is the one anchored to actual legal accessibility requirements in Illinois, and is what every publication decision should be made on.

The PDF/UA signal that Practical tried to summarize (MarkInfo, tab order, PDF/UA identifiers, list/table legality, partial-credit floors on headings and tables) is now surfaced more authoritatively on the **remediation result page** via the optional **veraPDF** check (ISO 14289-1 conformance). The veraPDF verdict is a binary Pass/Fail against the published PDF/UA-1 standard, which is more useful to an auditor than a synthetic weighted readiness number.

Specifically:

- **Audit page and shared-report page**: no more Strict/Practical toggle. The score card shows a single number anchored to WCAG + IITAA §E205.4. The dual-score audit row, mode badge pill, PDF/UA signals pill, and the cross-mode `ModeCompareBox` are gone.
- **Remediation result page**: a compact **"PDF/UA-1: conformance passed / N rule failures / check not run"** badge now appears immediately below the After-remediation score, jumping to the existing veraPDF detail panel. The detail panel was renamed from "Compliance disclaimer" to "PDF/UA-1 conformance check" to match what it actually is.
- **Per-card Basic/Advanced toggle** in the audit kept as-is — it's a per-category control over how much detail to show, not a separate scoring profile.
- **`pdf_ua_compliance` category dropped from the audit** — its signals are still inspectable in the underlying audit JSON if needed, and veraPDF is the authoritative source on the remediation page.

### Compatibility / API contract

- `result.scoreProfiles.remediation` is emitted as a **structural alias of `scoreProfiles.strict`** (same score, same grade, same summary). Historical shared-report JSON, fleet CSVs, and any external `/api/audit-url` consumer keep parsing without changes — they just get the Strict number under both keys. The alias will be removed in a future release once consumers have migrated.
- `/api/audit-url` response retains both `strict` and `practical` keys (same scalar pair) for the same reason.
- `audit_log`, `shared_reports`, and `remediation_jobs` schemas are unchanged. Historical rows are not migrated.

### Removed

- `ScoreProfileBanner.vue` and `ModeCompareBox.vue` components (deleted).
- Mode-toggle plumbing on `index.vue`, `report/[id].vue`, and `remediate/[jobId].vue` (`selectedScoreMode`, `flipScoreTableMode`, `compareProps`, `hasCrossModeSignal`, `remediationModeActive`).
- `MODE_BUTTON_LABELS`, `MODE_PROFILE_DESCRIPTIONS`, `MODE_PROFILE_LABELS`, `MODE_RECOMMENDATION_*`, `CATEGORY_TABLE_PRACTICAL_*`, `STRICT_MODE_RATIONALE_TEXT`, `PRACTICAL_*` constants from `scoringProfiles.ts`.
- `DIVERGENCE_COPY`, `canCategoryDiverge`, `getDivergenceCopy` from `modeDivergence.ts`.
- `scorePdfUaCompliance` is no longer added to the audit categories list.
- The dedicated "Practical aggregate" describe blocks and the Practical-mode regression check on the remediation worker.

### Doc / changelog updates

- `apps/web/app/pages/index.vue` "How Scores Are Derived" + "How Scores Are Calculated" sections rewritten — single-mode, links to veraPDF for the PDF/UA story.
- `apps/web/app/pages/data-retention.vue` § 4 regression-guard pseudocode + § 9 regression-guard plain-language copy updated to drop the Practical reference. Historical v1.20.x audit entries left intact as the historical record at those versions.
- README, dateModified, and three `package.json` files bumped to 1.21.0.

## [1.20.1] — 2026-05-18

### Added — Remediation audit-gate, daily-cap, and unified audit_log

To address the "automated thousands-of-remediations" abuse case (and tighten the workflow generally), every call to `POST /api/remediate` now requires the same content to have been audited in the previous 60 minutes by the same caller. Identity is the authenticated email, or `anon:${ip}` in no-auth mode (see P2.1 below). The check matches on `sha256(bytes)` so any audit path counts — browser upload via `/api/analyze`, URL audit via `/api/analyze-url`, fleet bulk via `/api/bulk-from-inventory`, or persistent audit via `/api/audit-url`. Without a matching `audit_log` row in the window, the endpoint returns `403 { error: "Audit required before remediation." }` with a link back to the audit UI.

A daily cap of **100 remediations per caller per rolling 24-hour window** sits on top of the gate. Sized to comfortably cover a normal agency workflow (~50 PDFs/day) while blocking abuse at scale (3000+ PDFs would take ~30 days at the cap). Returns `429` with `{ limit, used }` when exceeded.

To make the gate work uniformly, **every audit endpoint now writes to `audit_log` with a content_hash**. Previously only the browser-upload path (`/api/analyze`) wrote to `audit_log`, and even that write omitted the hash. v1.20.1 wires `audit_log` writes — including the hash — into `/api/analyze`, `/api/analyze-url`, `/api/audit-url`, and `/api/bulk-from-inventory`. `audit_log` is now the canonical "this content has been audited by this caller" record.

A new `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS = 365` constant adds a periodic purge of `audit_log` rows older than the window — matches the shared-report retention so audit-related records age out together. Closes the slow-burn growth vector (P2.3).

### Fixed — Six security findings from the post-feature red/blue team review

The v1.20.0 release added the `/api/audit-url` endpoint and the fleet integration story. The standard practice is to follow every feature with a fresh red/blue team review *before* tagging — we found six findings worth fixing, plus one previously-latent issue uncovered during the audit. All fixed in v1.20.1.

- **P1.1 / fixed — DNS rebinding bypassed the URL allowlist.** The previous `isAllowedUrl()` check ran against the hostname *string* before DNS resolution. An attacker who controlled DNS for any subdomain of an allowlisted apex (e.g., `evil.icjia-api.cloud`) could point it at `127.0.0.1` (or the API's own internal address, or any future internal service). The hostname passed the allowlist; `fetch()` then resolved DNS and connected to loopback, turning the audit pipeline into an SSRF proxy. **Fix:** new `apps/api/src/services/safeFetch.ts` resolves DNS in-process, rejects any private/loopback/link-local/multicast IP (IPv4 + IPv6, including IPv4-mapped IPv6 variants), and dials the resolved IP directly with `Host:` header set to the original hostname.
- **P1.2 / fixed — `redirect: 'follow'` chained into private networks.** Even with a strict allowlist, `fetch(..., { redirect: 'follow' })` followed up to 20 redirects *without re-validating*. An attacker who could plant content on an allowlisted host (e.g., a redirector at `https://agency.icjia-api.cloud/redirect.php`) could 302 us to `http://10.0.0.1/anything`. **Fix:** `safeFetch` handles redirects manually with the full allowlist + DNS check on every hop, capped at 3 hops.
- **P1.4 / fixed — `/api/bulk-from-inventory` had its own private `fetchWithTimeout` with NO allowlist check.** Caught during the SSRF review while migrating the URL-fetch endpoints to `safeFetch`. Authenticated callers could submit an NDJSON inventory listing arbitrary URLs — including internal addresses — and the server would fetch them, returning the response body and timing through the per-entry result. Textbook authenticated-SSRF. **Fix:** replaced with the same `safeFetch` + `validateUrlForFetch` plumbing used by the other URL-fetch endpoints.
- **P2.1 / fixed — Audit-gate identity collapse in anonymous mode.** With `AUTH.REQUIRE_LOGIN=false`, every caller's identity was a shared `'anonymous'` bucket. User A audits PDF X → User B can remediate PDF X because B's gate check matches A's `audit_log` row. **Fix:** new `gateIdentity()` helper returns `anon:${ip}` when not authenticated, so two different anonymous callers don't share a single bucket. Production deployments with `REQUIRE_LOGIN=true` were never affected.
- **P2.3 / fixed — `audit_log` grew unbounded.** No retention policy on the canonical `audit_log` table — a slow-burn DoS where an attacker floods `/api/analyze-url` with unique-hash PDFs to bloat the table indefinitely. **Fix:** new `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS = 365` plus a step-6 cleanup pass in `remediationCleanup.runCleanup()` that purges expired rows alongside the existing remediation cleanup.
- **P2.4 / fixed — Race window on the daily-cap check.** The fast-path cap check happened before the expensive `analyzePDF` preflight; a second concurrent request could pass the same check and both create the (cap+1)th job. **Fix:** the cap check is now repeated inside a `db.transaction()` immediately before `createJob()`. SQLite serializes writes, so two concurrent requests now reliably reject the cap-exceeding one. The earlier fast-path check remains as a cheap early-exit for the obvious case.
- **P3.5 / verified clean — Cookie security flags.** `auth.ts` already sets `httpOnly: true`, `secure: isProduction`, `sameSite: 'strict'` in production. No change needed.

### P3 — Accepted with documented mitigation

These were reviewed and found to be theoretical, fully mitigated by existing controls, or accepted by design. Listed for transparency in the auditor record.

- **P1.3 / mitigated, not fixed** — Download token in query string ends up in nginx access logs. Single-use enforcement (`setExpired()` before stream) shrinks the replay window to near-zero. A hardline fix (token in POST body) would break the `<a href>` download UX. Accepted as-is.
- **P2.2 / partial mitigation** — Daily-cap bypass via multi-account creation. Mailgun has disposable-email signals; per-IP registration rate limit is reasonable future work. Not currently exploited; tracked for a future release if abuse surfaces.
- **P2.5 / mitigated, not fixed** — Future CVE in OpenJDK, OpenDataLoader, or one of ODL's deps could enable RCE in the worker via a crafted PDF. Existing mitigations: JVM heap cap, 5-min worker timeout, detached child process, no `--hybrid` (no ODL network fetches), pinned Java major version. Future hardening (dedicated unprivileged user, egress block) tracked.
- **P3.1 — SHA-256 collision in the audit-gate.** Computationally infeasible (2^128 work).
- **P3.2 — IPv4-mapped IPv6 SSRF.** Verified not exploitable against current `safeFetch` (the new `isPrivateIPv6()` check handles `::ffff:127.0.0.1` and similar forms).
- **P3.3 — Timing side-channel on gate check.** Indexed SQL SELECT is ~constant-time. Response code (200 vs 403) is the larger giveaway. Not meaningfully exploitable.
- **P3.4 — PDF embedded URLs trigger fetches.** Neither qpdf nor pdfjs fetches external resources. ODL doesn't in non-hybrid mode (our default).
- **P3.6 — Trust-proxy depth.** Production runs nginx directly behind DigitalOcean — no proxy chain to exploit.

### Methodology note (for auditors)

This release follows the team's standing practice: **every feature ships through a fresh red/blue team review before tagging**. The review examines the newly-introduced surface from a sophisticated-adversary perspective, catalogs findings by severity (P1 real-and-exploitable / P2 bounded / P3 theoretical or accepted), fixes everything that can be fixed in the same release window, and documents the rest for the audit record. v1.20.0 added the fleet-integration surface; v1.20.1 is the security-followup that resulted. The full review notes appear in `README.md` § Security and in plain language in the policy page (`/data-retention` § 10).

### Commits

(this section is filled in at commit time)

## [1.20.0] — 2026-05-18

### Added — CMS-aware remediation download dialog

Replaces the single "Download Remediated PDF" button with a three-option dialog that defaults to preserving the exact original filename — critical for CMS workflows where the file is replaced in place and existing links resolve by name.

- **"Keep original filename"** is selected by default and badged **Recommended**. Downloads the remediated PDF under the user's exact uploaded filename (spaces, unicode, every byte). Server uses RFC 6266 dual-name `Content-Disposition` (`filename="<ascii-safe>"; filename*=UTF-8''<percent-encoded>`) so the original characters survive intact in modern browsers and curl.
- **"Add a '_remediated' suffix"** is an opt-in for users who want to keep the original alongside the remediated copy (e.g., archive workflows, not CMS replacement).
- **"Use a different filename"** is the destructive path — it shows a warning explaining that a different filename breaks every existing link to the PDF and requires a second click of the Download button to actually proceed (an "are you sure?" confirm gate).
- Above the radios, an explainer paragraph states *why* keeping the name matters: CMS file replacement under the same name preserves every existing reference without redirects or fix-up.

Schema change: added `original_filename TEXT` column to `remediation_jobs` via the existing ALTER TABLE probe pattern. The upload handler captures `file.originalname` before sanitization so the exact name survives end-to-end. Pre-v1.20.0 jobs have null `originalFilename` and fall back to the existing `<basename>_remediated.pdf` behavior — no breakage for in-flight rows during the rollout.

### Added — PDF export for the audit report

Adds a "PDF (browser print)" button next to the existing Word / HTML / Markdown / JSON export buttons on `/` and `/report/:id`. Calls `window.print()` and lets the OS save the report as PDF (default destination on macOS, Windows, ChromeOS). Zero new dependencies — avoids puppeteer / playwright / pdfkit (~100 MB combined).

A print stylesheet in `apps/web/app/assets/css/main.css` (`@media print`) handles the visual switch to ink-on-paper:

- Hides site chrome (header, nav, footer, buttons)
- Switches to white background + black text
- Expands all `<details>` so collapsed Technical Details prints in full
- Scales mermaid SVGs to container width
- Avoids page breaks inside headings and card sections
- Surfaces external link `hrefs` as inline text on paper

### Added — Mermaid diagrams in the Technical Details expandable

The standalone `/technical-details` page already had four mermaid diagrams; the inline Technical Details `<details>` expandable on the main results page had none. Added matching diagrams at four subsections:

- "How It Works" → audit pipeline
- "Application Architecture" → architecture diagram
- "Why Two Tools?" → two-tool parallel analysis
- "PDF Auto-Remediation: Pipeline Overview" → remediation pipeline

Same diagram sources as the standalone page so they stay in sync.

### Added — `AGENTS.md` at repo root

Cross-tool agent orientation for Claude Code, Codex, Cursor, Gemini CLI, etc. Consolidates the conventions that previously lived only in the user's private global `~/.claude/CLAUDE.md` (stack basics, the `./start-dev-server.sh` requirement, no-AI-co-author commit rule, `pnpm build` before push, `#config` path alias, the ALTER TABLE migration pattern, current API surface, common pitfalls like Nuxt 4 not 3 and mermaid render ordering). One short read orients any agent without trial-and-error.

### Fixed — `/remediate` desktop CLS 0.252

The result page rendered three discrete `v-if` regions (loading spinner / running progress / result content) and the page height jumped roughly 3000px when the third one mounted, pushing every subsequent paragraph down. Reserved space with `min-h-[calc(100vh-4rem)]` on the page container so the layout stays consistent between status transitions. Lighthouse perf score on `/remediate` desktop went **84 → 96**; CLS dropped out of the top issues entirely.

### Fixed — Result sections appearing mid-animation

Result sections (score banner, comparison table, issues, receipt) used `v-if="status?.status === 'complete'"` and appeared as soon as the server reported done — which could be roughly halfway through the local progress animator's walk through the four stages. New `isVisuallyComplete` computed (`status === 'complete' && !isVisuallyRunning`) gates all five result-page `v-if` guards so the progress arc finishes before any result content paints. One visual beat instead of two.

### Commits

- `8ec23a5` — feat(v1.20.0-pre): AGENTS.md, CLS fix, remediation filename dialog, PDF export, tech-details diagrams

## [1.19.0] — 2026-05-18

### Added — Fleet inventory integration

The fleet-audit story is now end-to-end. ICJIA's fleet inventory tool (and any similar PDF enumerator across ICJIA / Illinois state agency sites) can enrich each PDF row in its HTML / CSV output with a strict score, a practical score, and a stable click-through link to the full audit report — one HTTP call per PDF.

- **New endpoint: `POST /api/audit-url`** — combined "analyze a PDF by URL **and** persist a shareable report" route. Returns a trimmed scalar-only response shape (filename, pageCount, audited, strict score+grade, practical score+grade, reportId, reportUrl, reportExpiresAt, cached). Designed for direct flattening into CSV columns.
- **Hash dedup (Policy A).** After fetching the PDF the server computes `sha256(bytes)` and looks for an unexpired `shared_reports` row matching `(email, content_hash)`. On a hit, the cached `reportUrl` is returned and no new audit runs (`cached: true`). On a miss, a fresh audit runs and a new report row is persisted. Re-running the fleet job for unchanged PDFs returns the same URL — quarterly CSV diffs cleanly distinguish "file changed" from "row unchanged" without client-side caching. Optional `force=true` (body field or `?force=true` query param) bypasses dedup.
- **`docs/fleet-inventory-reporting.md`** — self-contained integration brief for the fleet tool author. Covers PAT setup, request/response shape, 8 recommended CSV columns mapped to response fields, HTML grade-cell color coding, per-PDF pseudocode, status-code matrix with retry policy, dedup behavior, pacing guidance (1-2 concurrent max), URL allowlist with look-alike rejection examples, TTL recommendations (< 11-month re-run cadence), and a smoke-test plan against three known production PDFs.
- **README § "Fleet PDF Auditing (`POST /api/audit-url`)"** — endpoint comparison table vs `/api/analyze-url` and `/api/bulk-from-inventory`, the trimmed response example, hash-dedup explanation, and a jq one-liner to flatten the response into a CSV row.

### Changed — URL allowlist (broader fleet coverage)

Added four bare-domain entries to `DEFAULT_ALLOWED_HOSTS` in `apps/api/src/routes/analyze-url.ts`:

- `illinois.gov` — covers every `*.illinois.gov` state agency subdomain (large surface but exactly the fleet-audit intent)
- `icjia.cloud` — covers `*.icjia.cloud`
- `icjia.app` — covers `*.icjia.app` (production `audit.icjia.app` + future siblings)
- `ilheals.com` — covers `*.ilheals.com` (program partner)

The matcher's `host === ah || host.endsWith('.' + ah)` rule means each bare-domain entry auto-covers all subdomains. Look-alike domains (`illinois.gov.evil.com`, `fakeillinois.gov`) are still rejected. Operators can extend per-deployment via the `ANALYZE_URL_ALLOWED_HOSTS` env var.

### Changed — Shared-report TTL: 15 days → 365 days

`SHARED_REPORTS.EXPIRY_DAYS` bumped from 15 to 365 in `audit.config.ts`. The auditor / fleet-inventory use case needs report links that stay valid for at least a year between scans. Database growth cost is real but accepted — the row payload is content-free metadata, and a 100-PDF fleet at 50 KiB per report adds ~5 MB per year.

All five UI surfaces that hardcoded "15 days" were updated to "365 days" (`apps/web/app/pages/report/[id].vue`, `apps/web/app/pages/data-retention.vue`, three places in `apps/web/app/pages/index.vue`).

### Fixed — `/api/audit-url` returned strict score in the practical slot

The scoring engine emits `scoreProfiles.strict` and `scoreProfiles.remediation`; the UI labels the latter "Practical readiness score." The v1.19.0-pre `audit-url` extractor looked for `scoreProfiles.practical` (the user-facing name), found nothing, and fell back to the top-level `overallScore` — which is the strict score. Every audit-url response showed practical = strict.

Fixed by mapping the user-facing `practical` → internal `remediation` key inside the extractor. The 8 inline test cases were updated to match. Verified post-fix against three ICJIA agency PDFs:

```
NCHIP_Live_Scan_NOFO_Instructions  16 pp  strict 52/F  practical 56/F
ICJIA_Budget_Committee_Minutes     11 pp  strict 74/C  practical 74/C
Winter_2026_Newsletter              2 pp  strict 93/A  practical 95/A
```

(PDF 2's identical pair is genuine — the file has no PDF/UA signals that would split the profiles. The other two show the expected 2-4 point divergence.)

### Fixed — Accessibility violations across `/data-retention` and `/technical-details`

A full `axecap + lightcap + viewcap` sweep across mobile, tablet, and desktop viewports caught seven axe-AA violations and three missing-canonical SEO failures. All fixed:

- **`aria-prohibited-attr`** — 7 MermaidDiagram instances carried `aria-label="..."` on a plain inner `<div>`, which is prohibited per the ARIA spec when no widget/landmark role is present. Dropped the duplicative attribute (the parent `<figure>`'s `<figcaption>` already provides the accessible name) and added `tabindex="0"` so keyboard users can focus the scroll viewport.
- **`scrollable-region-focusable`** — code-block wrappers and table wrappers on `/data-retention` (5 instances) and `/technical-details` (1 instance) were keyboard-inaccessible. Added `tabindex="0"` to all of them.
- **`link-in-text-block`** — inline body link in `/data-retention` § 10 v1.17.0 article relied on color alone. Added `underline` to its class list.
- **`canonical` missing** — `/data-retention` and `/technical-details` now emit per-page canonicals via `useHead` keyed off `runtimeConfig.public.siteUrl`. `/remediate/<id>` is correctly `noindex,nofollow` (private session-bound URL).

Each MermaidDiagram instance also gets a unique `aria-describedby` target via `useId()`. Previously every diagram referenced `id="mermaid-desc"`, which produced duplicate IDs on any page with multiple diagrams (a latent a11y bug not flagged by today's audit but worth fixing).

Post-fix scores:

```
/data-retention     desktop  axe 0  a11y 100  SEO 100   (was a11y 92, SEO 92)
/data-retention     mobile   axe 0  a11y 100             (was a11y 92)
/technical-details  desktop  axe 0  a11y 100  SEO 100   (was a11y 96, SEO 92)
/technical-details  mobile   axe 0  a11y 100             (was a11y 96)
/remediate/<id>     desktop  axe 0  a11y 100  SEO 58    (SEO low is intentional —
                                                          private noindex page)
```

### Commits

- `0ba8cf2` — fix(a11y,seo): resolve 7 axe violations + 3 canonical-missing pages
- `b9e6578` — feat(api): POST /api/audit-url for fleet inventory enrichment
- `017a2a1` — fix(audit-url,web): practical score mapping + stale 15-day TTL text
- `78c2f72` — docs(fleet): integration brief + expanded URL allowlist (4 new domains)

### Deferred to a later release

- `/remediate/:id/download?name=` filename-choice option + UI dialog (CMS replacement workflow)
- Audit report export to PDF / Markdown / HTML (new format dropdown next to the existing Word export)
- `reportPdfUrl` / `reportMdUrl` / `reportHtmlUrl` fields on the `/api/audit-url` response
- `AGENTS.md` at repo root to consolidate cross-tool agent guidance
- CLS 0.252 investigation on `/remediate` (likely score-banner shift after content loads)

## [1.18.1] — 2026-05-18

### Fixed — PDF/UA-1 conformance verdict and remediation result UX

Three correctness fixes against the v1.18.0 remediation feature, plus one preflight enhancement. All issues are operational; none affect data privacy or retention guarantees.

- **veraPDF 1.30.x verdict was always reported as "not compliant"** regardless of the input PDF. In v1.30.x the validator output reshapes `validationResult` from a single object to a single-element array (`.report.jobs[0].validationResult[0]`); the v1.18.0 extractor read the array as an object, so `compliant` was always `undefined` and the truthy-check fell through to `passed: false` for every PDF. Auditors consulting the PDF/UA-1 disclaimer card on the remediation result page would have seen a silently wrong verdict in any deploy running veraPDF 1.30.x or newer. **Fixed** by detecting the array shape and unwrapping to `[0]` before extraction. Older veraPDF (≤ 1.26.x) keeps working unchanged.
- **Rule-summary extraction could crash** on veraPDF 1.30.x output. The 1.30.x schema places rule data at `validationResult[0].details.ruleSummaries` (array) and `details.failedRules` (number, count of distinct rules — not an array). The extractor's fallback chain included `details.failedRules` as an array source; a `.map()` on a number would have thrown `TypeError`. **Fixed** by removing the `details.failedRules` fallback and reordering the chain newest-first.
- **`totalFailureCount` under-reported failures on heavily-non-compliant PDFs.** Previously summed only the displayed (top-20) rule summaries. **Fixed** by preferring veraPDF's server-reported `details.failedChecks` when present; falls back to the old sum when not (older versions).
- **"Fix steps" links on the remediation result page were dead.** The `IssuesSummary` component built `href="#cat-<id>"` anchors that only exist on the audit pages, not on the remediation result page. Clicks fell through to no-ops. **Fixed** by replacing the broken anchor links with inline accordion expansion — each row now opens a panel showing the full findings list and the numbered Adobe Acrobat fix steps directly. Same data source as the audit-page cards (`partitionCardFindings`), so the remediation page stays in sync without duplicating logic.

### Added — rebuild.sh preflight auto-detects veraPDF

The Ubuntu deploy script now auto-detects veraPDF at four common install paths (`/opt/verapdf`, `/home/forge/verapdf`, `$HOME/verapdf`, `/usr/local/bin`), exports `REMEDIATION_VERAPDF_PATH` for the deploy if found, and warns when the path isn't persisted in `/etc/environment` for PM2 to inherit across reboots. When veraPDF isn't installed at all, the script now prints inline copy-paste Ubuntu install instructions (download → izpack interactive installer → cleanup → persistence command) so a fresh server can get to PDF/UA-1 conformance reporting in one operator visit.

### Commits

- `49b9cca` — feat(deploy): rebuild.sh preflight auto-detects veraPDF + prints install instructions
- `d35bc6b` — fix(remediation): handle veraPDF 1.30.x array-shaped validationResult
- `6d9e193` — fix(remediation): correct veraPDF 1.30.x rule-summary path + use server total
- `24a3cd0` — fix(remediation): inline fix-step expansion in IssuesSummary

## [1.18.0] — 2026-05-18

### Added — PDF auto-remediation feature

Optional feature that produces a tagged, more-accessible PDF from an audited one. Gated behind `REMEDIATION_ENABLED=true`; disabled by default. Full architectural spec in [`docs/pdf-remediation-integration-plan.md`](docs/pdf-remediation-integration-plan.md); feasibility data behind every decision in [`docs/spike-remediation-results.md`](docs/spike-remediation-results.md); Phase 1 follow-up spec (interactive alt-text walkthrough) in [`docs/pdf-remediation-alt-text-walkthrough-spec.md`](docs/pdf-remediation-alt-text-walkthrough-spec.md).

**Pipeline:**

```
upload → qpdf --object-streams=disable (preprocess)
       → OpenDataLoader tagged-pdf (basic mode)
       → qpdf --check (validate output is a parseable PDF)
       → veraPDF --flavour ua1 (validate PDF/UA-1 conformance, optional)
       → re-audit (verify scores didn't regress on Overall, Strict, OR Practical)
       → finalize OR reject
```

**Privacy & retention:**

- PDFs are never persistently cached between audit and remediation — re-upload required.
- Inputs deleted between pipeline stages (after qpdf normalize, after ODL tag).
- Output deleted on first successful download (single-use token) OR after a 30-minute TTL.
- Lifecycle audit trail (`remediation_events` table) records every step including post-deletion `fs.stat` ENOENT verification (`verified_absent` event) — the auditor's evidence that the file is gone.

**UI:**

- "Auto-Remediate this PDF" button under the score on the audit results page, including in batch (per-tab) mode. Greyed-out + disabled with explanation for already-A files.
- `/remediate/[jobId]` progress + result page with Before/After ScoreCards (vertical, infographic banners), Strict + Practical score comparison table, "What we fixed" / "Improved but still needs review" / "Outstanding by severity" sections, veraPDF verdict + IITAA disclaimer with manual-review-required notice + links to [verapdf.org](https://verapdf.org/) and Illinois DOIT, source-document accessibility recommendation, and a processing receipt panel.
- Adobe Acrobat parity removed from the UI on both audit + remediation pages — visible metrics that can decrease (e.g., vacuous-pass dynamics) erode user trust. Backend still computes for data-shape stability.

**Backend:**

- New API routes: `POST /api/remediate`, `GET /:id/status`, `GET /:id/download`, `GET /:id/receipt`. All gated behind `REMEDIATION.ENABLED` (`404` when off).
- Detached child worker (`apps/api/src/jobs/remediate.ts`) preserves synchronous audit-pipeline performance.
- 5-step cleanup sweep on a configurable interval + on every API startup (expired outputs, stuck jobs, orphan files, purged old job + event rows).
- Per-user concurrent-job limit (1), file-size cap (50 MB), page-count cap (500), JVM heap cap (`-Xmx768m`).
- veraPDF integration via `REMEDIATION_VERAPDF_PATH` (optional; preflight warns when missing).
- Per-profile regression guard: rejects output if Overall, Strict, or Practical scores decrease.

**Deployment:**

- `ecosystem.config.cjs` forwards `REMEDIATION_*` env vars from the parent shell so `REMEDIATION_ENABLED=true ./rebuild.sh` flips the feature on without code changes.
- `rebuild.sh` preflight checks for OpenJDK 17, `qpdf --object-streams` support, and `REMEDIATION_VERAPDF_PATH` configuration. Non-blocking warnings except `pnpm` (hard requirement).

**Security audit:** see [README § Security](README.md#security). Two P1 issues caught and fixed before tagging (download-endpoint memory exhaustion + concurrent-download token race), two P2s mitigated/accepted, no P0s.

**Spike validation:** OpenDataLoader's basic mode tested against 12 representative ICJIA-style PDFs. Untagged inputs (5/5): avg +25 score, zero damaged outputs. Tagged inputs (4): two produced damaged outputs that the discovered qpdf preprocessing step fully mitigates. Hybrid mode and SmolVLM tested but deferred to roadmap.

### Added — `content_hash` on `audit_log` and `remediation_jobs`

SHA-256 of the input PDF bytes is recorded on every audit and remediation, enabling a future "did this file go through our tool?" verification endpoint (Phase 3 roadmap). Hash is pure metadata — no PDF content stored.

## [Unreleased]

### Added — `POST /api/analyze-url` and `?prefill=` web UI parameter

New endpoint and web integration that allow a PDF to be audited by URL rather than file upload.

**API (`POST /api/analyze-url`):**

```bash
curl -X POST https://audit.icjia.app/api/analyze-url \
  -H "Authorization: Bearer fap_yourtoken" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://icjia.illinois.gov/documents/2024/annual-report.pdf"}'
```

Returns the same `AnalysisResult` JSON shape as `POST /api/analyze`.

**Web UI (`?prefill=<url>`):**

Visiting `https://audit.icjia.app/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fdocs%2Freport.pdf` auto-fetches and analyzes the file on page load, displaying the result in the existing single-file analysis UI. This makes the "Audit Link" column generated by [filecap-cli](https://github.com/ICJIA/filecap-cli) work end-to-end — click a row link and the audit runs immediately.

**Security:**

- URL allowlist: only ICJIA-owned domains accepted by default; extendable via `ANALYZE_URL_ALLOWED_HOSTS` env var.
- SSRF block: localhost, RFC1918 private ranges, link-local, `.local`/`.internal` are rejected even if allowlisted.
- 100 MB per-file cap; 30 s fetch timeout; magic-bytes PDF check.
- Auth required (same `authMiddleware` + `analyzeLimiter` as `/api/analyze`).

**Files changed:**
- `apps/api/src/routes/analyze-url.ts` — new route
- `apps/api/src/index.ts` — route mount
- `apps/api/src/__tests__/analyze-url.test.ts` — unit tests
- `apps/web/app/composables/usePrefill.ts` — new composable
- `apps/web/app/pages/index.vue` — wires `usePrefill`
- `apps/web/app/__tests__/usePrefill.test.ts` — unit tests

### Added — Personal access tokens for CLI/API authentication

New `access_tokens` table and three token management endpoints so headless clients (e.g. [@icjia/filecap](https://github.com/ICJIA/filecap-cli)) can authenticate without a browser session.

**Endpoints:**

- `POST /api/tokens` — create a named token (session auth only; returns the raw token once)
- `GET /api/tokens` — list the caller's tokens (metadata only; raw tokens never returned)
- `DELETE /api/tokens/:id` — revoke a token by ID (session auth only; row retained for audit trail)

**Token format:** `fap_<32-hex-chars>` (128-bit entropy). The server stores only the SHA-256 hash.

**Auth middleware change:** `authMiddleware` now checks for an `Authorization: Bearer fap_xxx` header before falling through to the existing cookie/JWT check. Sets `req.user.authMethod` to `'pat'` or `'session'` so downstream route handlers can distinguish.

**Security:**
- Raw token shown once at creation; never stored or retrievable.
- PAT-authenticated requests cannot mint or revoke tokens (prevents a leaked token from compounding damage).
- `last_used_at` updated on each authenticated request; `revoked_at` retained for paper trail.
- Per-user cap of 10 active tokens (configurable via `MAX_TOKENS_PER_USER`).

**Migration:** `CREATE TABLE IF NOT EXISTS access_tokens` and its indexes are added to the existing startup `db.exec(...)` block in `db/sqlite.ts` — no separate migration step required for new installs. Existing installs: the table will be created on next startup.

---

### Added — `POST /api/bulk-from-inventory` endpoint (closes #9)

New endpoint that accepts a [filecap](https://github.com/ICJIA/filecap-cli) NDJSON inventory, fetches each PDF server-side by its public URL, runs the existing `analyzePDF` scoring pipeline, persists every result via `shared_reports`, and returns a manifest with per-file scores, grades, and shareable report links.

**Request (JSON body):**

```json
{ "inventory": "<NDJSON content>", "filterCategory": "pdf" }
```

**Request (raw text — for `curl --data-binary`):**

```bash
curl -X POST \
  -H "Cookie: token=<your-jwt>" \
  -H "Content-Type: text/plain" \
  --data-binary @inventory.ndjson \
  https://audit.icjia.app/api/bulk-from-inventory
```

**Response:**

```json
{
  "summary": { "total": 10, "analyzed": 9, "failed": 1, "skipped": 3 },
  "results": [
    { "path": "2024/report.pdf", "publicUrl": "...", "overallScore": 78, "grade": "C", "reportId": "...", "reportUrl": "/api/reports/..." },
    { "path": "2024/scan.pdf",   "publicUrl": "...", "error": "not a valid PDF (header bytes: ...)" }
  ]
}
```

**Key behaviors:**

- Parses filecap NDJSON: recognizes header/footer records, reconstructs `publicUrl` from `publicUrlBase` when individual entries omit it, filters to `category === filterCategory`.
- 5 MB inventory cap; 15 MB per-PDF cap (matches `ANALYSIS.MAX_FILE_SIZE_MB`); 100 files per request maximum.
- Processing is intentionally serial to respect the existing 2-at-a-time semaphore in `pdfAnalyzer.ts`.
- Auth required. Uses existing `authMiddleware` (cookie JWT) and `reportsLimiter`.
- Adds `express.text({ limit: '5mb', type: 'text/plain' })` in `index.ts` for the raw text/plain intake mode.

## [1.17.0] - 2026-05-04

### Added — Action banner + Issues to fix punch list

Two new in-page blocks under the score hero on both the shareable-report page (`/report/:id`) and the post-upload page (`pages/index.vue`):

- A one-line **action banner** with severity-keyed copy (e.g., `2 critical issues must be fixed before publishing.`) that gives an at-a-glance verdict in plain English. Tinted red for Critical, yellow for Moderate-only, blue for Minor-only, green when the PDF passes outright.
- A severity-ordered **Issues to fix** punch list with anchor links that jump straight to the matching Detailed Findings card. Sort order is Critical → Moderate → Minor; Pass and N/A categories are excluded. Each row shows the category name, severity pill, a one-line plain-English summary derived from the category's first actionable finding, and a `↓ Fix steps` jump anchor.

Each Detailed Findings card root div now carries a stable anchor id (`cat-${cat.id}`) so the punch-list jump links — and any future linkable export — can target it.

### Changed — Detailed Findings card layout

The technical-detail lines that some categories emit (the `--- Section ---` headers and their indented data lines) are no longer interleaved with plain findings. They now group into a clearly-labeled **Technical signals** panel within each card:

- The panel only renders when the per-card `Basic` / `Advanced` toggle is on **Advanced**.
- It uses a subtle left rule, dim text, and a monospace font to visually separate the data signals from the human-readable findings above it.
- A small `N technical signals` count label sits next to the toggle so the user knows what's available before flipping. Cards with zero technical signals hide the toggle and label entirely.

The plain findings list, the guidance lines (`Fix:` / `Tip:` / `Note:`), and the Adobe Acrobat fix-steps panel are unchanged in both modes — they always render the same way regardless of Basic / Advanced.

### Refactored — utility extraction

- `isGuidanceFinding` and a new `firstActionableFinding` helper extracted into `apps/web/app/utils/findings.ts` for reuse by the Issues summary component. The two duplicate copies in `pages/report/[id].vue` and `pages/index.vue` are intentionally left in place; deduping is a separate engagement.
- New `partitionCardFindings` helper in the same util splits a category's findings array into `{ main, signals, signalCount, acrobat }` in one pass, so each Detailed Findings card no longer has to chain `splitAcrobatGuide` + `filteredFindings` + per-line conditionals during rendering.
- New `tallySeverity` utility in `apps/web/app/utils/severityTally.ts` aggregates category severity counts for the action-banner copy.

### Tests

15 new unit tests across the new utilities and components: `tallySeverity` (3 cases), `findings` helpers including `partitionCardFindings` (14 cases), and the `ReportActionBanner` and `IssuesSummary` components. Total web suite: 283 / 283 passing.

## [1.16.3] - 2026-05-04

### Fixed

- Shareable report links (`/report/:id`) returned a 500 server error in production whenever the link resolved to a real `shared_reports` row. SSR rendering threw `ReferenceError: gradeColors is not defined` from `apps/web/app/pages/report/[id].vue`'s `catColor()`. The function was rewritten in v1.12.x to look up `gradeColors[cat.grade]`, but the `gradeColors` map was only added to `pages/index.vue` — not to the shared-report page. Local development never tripped it because the local SQLite usually has no row matching the prod link, so the page rendered the `v-else-if="error"` ("Report Not Available") branch and never hit `catColor`. Vitest tests parse `.vue` source as text rather than SSR-rendering with valid data, so they passed too. Fix: declare the same five-entry `gradeColors` map (`A → #22c55e` … `F → #ef4444`) directly above `catColor()` in `pages/report/[id].vue`. Verified by seeding the prod payload into local SQLite and confirming `/report/:id` now returns 200 with the full rendered report.

## [1.16.2] - 2026-04-22

### Docs

README's "Adobe Acrobat parity panel" section brought up to date with the v1.16.1 UX changes: card renamed to "the third view," placement above Category Scores documented, interactive-tallies behaviour described (click to filter, hover for rule-name tooltip, keyboard-navigable, vacuous pass marker in the tooltip), direct link to Adobe's 32-rule documentation called out. No code changes — docs-only release so deployed instances match the README's narrative.

## [1.16.1] - 2026-04-22

### Changed — Adobe parity card: prominence and interactivity

Follow-up polish for v1.16.0, shipped same day after live review. The parity card was sitting below the Category Scores table and reading as a secondary panel — users weren't registering that Acrobat's view was a *third* lens alongside Strict and Practical. The tallies were also static summary numbers with no path to "which rules passed vs failed?"

- **Card moved above Category Scores** on both `pages/index.vue` and `pages/report/[id].vue`. Report now reads: grade circle → Strict/Practical dual row → Acrobat parity card → Category Scores. The three lenses land in a single scan.
- **Eyebrow reframed** from "Reconciliation view" to "Third view · alongside Strict & Practical" so the pattern is explicit. Card itself now uses an indigo accent border (`border-2 border-indigo-500/30`) that differentiates it from the neutral-chrome Category Scores card.
- **Tallies enlarged.** Numbers jumped from `text-lg` to `text-2xl sm:text-3xl font-bold` and pills grew in padding. The five tallies now carry the visual weight of the section.
- **Tallies are interactive.** Each pill is now a `<button>` with `aria-pressed` state. Clicking a pill filters the rule detail list to just that bucket (Passed / Failed / Manual / Skipped / Not computed) and auto-expands the detail section with a smooth scroll-into-view. Clicking the active pill again clears the filter; a "Show all 32" button in the filtered-state banner does the same. Pills with 0 rules are disabled.
- **Hover tooltips via native `title`.** Hovering a pill previews the rule names in that bucket without opening the detail view, with vacuous passes marked `(vacuous)`. Works cross-platform with no custom tooltip library.
- **Direct link to Adobe's 32-rule reference.** Header subtitle and the authority callout both link to `https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html` so managers can verify Acrobat's ruleset against Adobe's own documentation with one click.
- **Internal reorder: tallies first, authority callout below.** The numbers land first (Acrobat-view at a glance), then the one-line vacuous-watch callout, then the "Adobe is not the canonical reference" amber box with WCAG / IITAA / PDF/UA / Matterhorn context. The authority callout still stays visible when rule detail is collapsed.
- **Accessibility.** Pills are keyboard-navigable via Tab, operate via Enter/Space, announce their count and pressed state to screen readers, and are visually ring-highlighted when active. The tally grid has `role="group"` with a descriptive `aria-label`.

## [1.16.0] - 2026-04-22

### Added — Adobe Acrobat parity panel

New **Adobe Acrobat parity** card on every report, mirroring Acrobat's 32-rule built-in Accessibility Checker alongside this tool's verdict. Purpose: close the expectation gap for managers and authors who anchor on "Acrobat says my PDF passes" as a compliance answer, and to surface that Acrobat is neither the Illinois compliance bar (WCAG 2.1 AA via IITAA §E205.4) nor the PDF/UA bar — it is a lightweight subset Adobe chose to automate.

- `apps/api/src/services/scoring/adobeParity.ts` — pure function mapping QPDF + pdfjs signals onto Acrobat's 32 rules, grouped by Acrobat's native categories (Document / Page Content / Forms / Alternate Text / Tables / Lists / Headings). Each rule returns status (passed / failed / manual / skipped / not_computed) plus a `vacuous: boolean` flag and a per-rule note explaining what this tool actually saw.
- Summary tallies (`passed`, `failed`, `manual`, `skipped`, `notComputed`, `vacuousPasses`, `total`) at the top of the card. **No aggregated "Adobe score" is exposed** — anchoring on that number would defeat the purpose. Parity is qualitative and rule-by-rule.
- `apps/web/app/components/AdobeParityCard.vue` — collapsible card with an always-visible authority callout. The callout names the references that do govern Illinois electronic-document accessibility (**WCAG 2.1 AA via IITAA §E205.4**) and positions PDF/UA (ISO 14289-1) as industry-standard but not required by Illinois law (IITAA §504.2.2 covers authoring-tool export capability only). Matterhorn Protocol is cited as the PDF Association's formal 136-condition PDF/UA test so readers understand Acrobat's 32 rules are well below either canonical standard.
- **Vacuous-pass annotations.** When Acrobat's rule clears its bar only because the relevant content type does not exist in the document (no tables → 4 table rules pass, no figures → all 5 alt-text rules pass, no headings → "Appropriate nesting" passes), the card tags the row `⚠ vacuous` and the per-rule note explains why. On documents with sparse structure, vacuous passes can dominate Acrobat's "Passed" count — on the ILHEAL control fixture Acrobat reports `28/32 passed` while ~20 of those 28 are vacuous.
- **`ScoringResult.adobeParity`** added to the API / JSON-export response. Shared reports gracefully degrade on older snapshots via `v-if="data.report.adobeParity"`.

### Tests

6 new scorer tests covering: always-32-rules shape in Acrobat's native 8/9/2/5/5/2/1 grouping, ILHEAL "Potemkin-tagged" case (StructTreeRoot present but empty → `tagged_pdf` and `tagged_content` as vacuous passes, `figures_alternate_text` note surfaces painted-but-untagged images), real-structure case on a well-tagged fixture (non-vacuous passes dominate, malformed lists produce `lbl_and_lbody` failure), invariant that `Summary` is always skipped and `Logical Reading Order` / `Color contrast` are always manual, and that no aggregated Adobe score leaks into the summary shape. 255 / 255 tests pass (6 new + 249 existing).

### References

Parity UI and README point to [Adobe's official Acrobat Accessibility Checker documentation](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html) for anyone who wants to verify the 32-rule set against Adobe's own reference.

## [1.15.1] - 2026-04-20

### Fixed

- Production `tsc --noEmit` build failure introduced by v1.15.0. The new scorer invariant tests constructed `heading` fixtures with numeric `level` (`level: 1`) and `list` fixtures with non-interface properties (`hasLI`, `hasLbl`, `hasLBody`). Vitest uses esbuild which is permissive about these type mismatches, so local `pnpm test` passed, but production builds through `tsc --noEmit` in `apps/api/package.json` caught them. Fixtures are now type-correct: `level` is `"1"` / `"2"` (the canonical string-form the parser emits) and lists use `hasLabels`, `hasBodies`, `nestingDepth` matching the `ListAnalysis` interface.

## [1.15.0] - 2026-04-20

### Added

- **Always-visible dual-score audit row** under the main grade circle in `ScoreCard`. Renders `Strict X/100` in emerald and `Practical Y/100` in amber side-by-side, regardless of which mode is selected via the toggle. Auditors no longer need to flip the mode switch to confirm both numbers. `data-testid="dual-score-audit-row"`, `role="group"`, and per-pill `aria-label` attributes for screen readers.
- **Export parity.** The Markdown / AI-analysis / plain-text exports now emit both scores: `Strict score (WCAG / IITAA §E205.4): X/100 (grade)` followed by `Practical score (WCAG + PDF/UA): Y/100 (grade)`. When the Strict floor lifts Practical, the export line also includes `(raw weighted-average: Z/100; floored to Strict)` so downstream consumers can reconstruct the pre-floor math.
- **`scoreProfiles.remediation.rawOverallScore`** and **`scoreProfiles.remediation.flooredToStrict`** on the API / JSON-export response. `rawOverallScore` is always the pre-floor weighted-average number; `flooredToStrict` is true when the floor lifted the displayed `overallScore`. Strict profile mirrors `rawOverallScore = overallScore` and `flooredToStrict = false`.

### Changed — `Strict ≤ Practical, always` invariant

The scorer now guarantees `Practical.overallScore ≥ Strict.overallScore` for every document. If the raw Practical weighted-average math produces a lower number (because Practical's different category weights moved scoring mass onto a category that happened to score low, or for any reason a future document might surface), Practical is lifted up to Strict. The per-category Practical scores are unchanged — only the overall aggregate is floored — so the raw category math remains inspectable.

This subsumes the v1.14.1 bonus-only PDF/UA rule (still in place as an internal first pass) and gives users a single simple invariant to remember: "Practical can only add points to Strict, never subtract."

### Changed — clearer framing of what each score covers

- **Strict** is now positioned as **the canonical score covering WCAG 2.1 AA + ADA Title II + Illinois IITAA §E205.4** — the three rules that actually govern non-web document accessibility in Illinois. This is the number to cite in legal-compliance contexts, agency sign-off, FOIA responses, and audits with groups (e.g. Illinois DoIT) that evaluate documents against IITAA without a PDF/UA overlay.
- **Practical** adds an **ISO 14289-1 (PDF/UA) layer** on top of Strict. The description in the homepage / mode-toggle / export copy now explicitly notes that PDF/UA is *not* a legal requirement for final PDFs under Illinois rules — IITAA §504.2.2 references PDF/UA only for authoring-tool export capability, not for the PDF artifact itself.

### Simplified — user-facing explanatory text

The "Why the two scores can differ" technical-details paragraph is rewritten around the single `Strict ≤ Practical` invariant. The previous three-paragraph version (higher / lower / bonus-only) is replaced by one paragraph describing Strict's coverage and one describing the relationship. The `PDF/UA is a bonus-only contribution` subsection in the README is replaced by a fuller `Strict is the canonical score and the floor for Practical` section.

### Tests

Three new scorer invariant tests: (a) `Practical.overallScore >= Strict.overallScore` for every document, (b) `rawOverallScore` and `flooredToStrict` are always present and correctly populated, (c) non-floor cases retain `flooredToStrict = false`. 500 tests pass in total (251 web + 249 api).

## [1.14.1] - 2026-04-20

### Changed — PDF/UA becomes a bonus-only contribution in Practical

The 9.5% `pdf_ua_compliance` category used to be aggregated into Practical's weighted average like any other category, which meant a weak PDF/UA score could drag the Practical aggregate below what a WCAG-only renormalization would produce. That was counterintuitive — a "practical readiness" profile shouldn't punish a document for missing PDF/UA markers that have no bearing on WCAG conformance.

**Now:** Practical computes its overall score two ways and keeps the higher number:

1. With `pdf_ua_compliance` included in the weighted average (historical behavior).
2. With `pdf_ua_compliance` excluded and the remaining weights renormalized (WCAG-only Practical).

When the document's PDF/UA signals are strong, path (1) wins and PDF/UA lifts the aggregate as before. When they're weak, path (2) wins and the PDF/UA category is silently dropped from the aggregate, surfacing the WCAG-only Practical score instead. The `pdf_ua_compliance` row still appears in the per-category breakdown with its own score, so the signal is visible to auditors — only the aggregation step is guarded.

### Control-fixture effect

| Fixture | Strict | Practical v1.14.0 | Practical v1.14.1 |
|---|---|---|---|
| FY_22 Annual Report (baseline) | 39 | 57 | 57 (unchanged — PDF/UA 75 lifts) |
| FY_22 Annual Report (remediated) | 67 | 83 | 83 (unchanged — PDF/UA 85 lifts) |
| WomenInPolicing 2021 (baseline) | 65 | 65 | 65 (unchanged — PDF/UA 65 neutral) |
| **WomenInPolicing 2021 (remediated)** | **81** | **80** | **81** (no longer drops below Strict) |

Strict is unaffected by this rule (its `pdf_ua_compliance` weight is 0; the category is surfaced as N/A with guidance text).

### Documentation

- **Homepage "Why the two scores can differ" section** expanded to explain (1) that weight differences alone can make Practical score below Strict even without PDF/UA in the mix (different weight-mass on the same categories), and (2) the bonus-only PDF/UA rule with a plain-language explanation.
- **README "Scoring Rubric" section** rewritten with a control-fixture table showing the before/after impact on both fixture pairs and clear language that Practical is "Strict with different weights, plus an extra PDF/UA category" — not "Strict + a bonus."
- Four new scorer tests lock in the invariants: (a) Practical overall ≥ WCAG-only Practical score for every document, (b) the `pdf_ua_compliance` row is still present with its own score, (c) a strong PDF/UA signal lifts Practical above WCAG-only, (d) Strict is not affected by the bonus-only rule.

497 tests pass (251 web + 246 api).

## [1.14.0] - 2026-04-20

### Added

- **Rigorous per-page reading-order check in Strict mode.** When the analyzer can extract a structure-tree MCID sequence (logical tag order from QPDF) and a content-stream MCID sequence (visual draw order from pdfjs-dist) for the same page, it computes a longest-common-subsequence ratio, weights across pages, and produces a 0–100 Strict score with bands at 100% / 95% / 80% / 50% / <50%. When the sequences don't overlap sufficiently (fewer than 2 shared MCIDs per page), Strict falls back to an honest N/A.
- **New `QpdfResult.structTreeMcidsByPage`** (`Record<number, number[]>`) built in `qpdfService.ts`: walks the StructTreeRoot, tracks enclosing `/Pg` references, resolves MCR dicts that may override the page, and skips OBJR (non-content) kids. Cycle-guarded and depth-limited.
- **New `PdfjsResult.contentStreamMcidsByPage`** (`Record<number, number[]>`) built in `pdfjsService.ts`: piggybacks on the existing operator-list loop, captures MCIDs from `OPS.beginMarkedContentProps`, and skips `/Artifact`-tagged runs (which don't participate in logical reading order). Handles pdfjs-dist's two tag shapes (plain string vs. `{name: string}`) and the two properties shapes (bare MCID number vs. dict).
- **New `computeReadingOrderFidelity()` and `longestCommonSubsequence()` helpers** in `scorer.ts`. LCS is O(m·n) with negligible cost at typical PDF MCID counts (tens to low hundreds per page).
- **Practical mode gains an informational finding** reporting the rigorous fidelity percentage; the Practical score itself still uses its proxy formula (unchanged).
- **Six new scorer tests** cover the rigorous path: perfect match, partial drift, reverse order (worst case), N/A fallback when MCIDs don't overlap, Practical still uses proxies, fidelity finding appears in Strict output.
- Control-fixture validation: baseline annual-report → Strict reading_order 70 (C); remediated → 70 (C). Strict overall 37 → 39 / 66 → 67 (tiny uptick from the reading_order category no longer being excluded via null).
- UI copy on `ModeCompareBox` and `NaCell` updated to describe what Strict now does instead of "abstains because not yet implemented."

### Changed

- **`MAX_FILE_SIZE_MB` lowered from 50 to 15.** Updated `audit.config.ts`, the `.env.example.local` / `.env.example.production` hints, `DropZone.vue` client-side check + drop-zone copy, error messages in `apps/api/src/index.ts` (now interpolated from config), `llms.txt` / `llms-full.txt`, README table + memory-exhaustion mitigation calc, and two `components.test.ts` assertions.

### Tagged

- `revert-point-pre-reading-order` — safe restore point pinned at v1.13.8. If the reading-order work needs to be undone: `git reset --hard revert-point-pre-reading-order && git push --force-with-lease origin main`.

## [1.13.8] - 2026-04-20

### Added

- **Compact Strict / Practical mode switch in the Category Scores header.** Lets users flip the active scoring mode in place without scrolling back to the top-of-page ScoreProfileBanner toggle. Segmented pair of `<button>` elements with `aria-pressed` state and `role="group"` / `aria-label="Switch scoring mode"` for screen-reader context. Active side uses emerald (Strict) or amber (Practical) tinting; inactive side is muted with a hover state.
- **Scroll-preservation** on the switch: `categoryScoresAnchor` ref captures the card's viewport top before the flip, and `window.scrollBy` cancels the delta after `nextTick` + one `requestAnimationFrame`. The card stays visually pinned while the table rows and descriptive header copy re-render at different heights. Same pattern used in `ModeCompareBox.flipMode` (v1.13.5).
- Mirrored on `pages/index.vue` and `pages/report/[id].vue`.
- 251 web tests still pass.

## [1.13.7] - 2026-04-20

### Changed

- **ModeCompareBox's divergence badge is now visually prominent.** Bumped text from 10px to 11px, raised weight to `font-semibold`, gave it a larger pill (`px-2.5 py-1`), and added a leading glyph (`=` for matching scores, `⚠` for divergent). The "same" state uses emerald tinting (previously muted gray that faded into the background); the "diverges" state stays amber.
- **Badge label** on non-branching categories updated from "Same in both modes" to "Same score in both modes" so the badge can't be read as "same scoring mode."
- **New inline explainer** rendered immediately below the pills when scores match: "Both pills show the same score because this category scores the same under both methodologies — only the profile weight differs, which affects the overall grade. Not a bug."

## [1.13.6] - 2026-04-20

### Added

- **Accessible N/A tooltips in the Category Scores table.** Each N/A cell now renders a small focusable "i" button that exposes an `aria-describedby` tooltip explaining *why* the analyzer abstained — e.g. "Strict does not include a PDF/UA category" or "Reading Order requires per-page marked-content vs. page-stream comparison, which this analyzer doesn't yet perform." Shows on mouse hover and keyboard focus-within; screen readers announce the reason via the `aria-label` on the button plus the `role="tooltip"` element.
- **New `<NaCell>` component** (`apps/web/app/components/NaCell.vue`) drives the tooltip. Backed by a new `naReason(catId, mode)` helper in `modeDivergence.ts` with distinct copy for `pdf_ua_compliance`, `reading_order`, `color_contrast`, `bookmarks`, and the image/table/link/form "none detected" cases.
- **Footnote below the Category Scores table** spelling out that N/A is an analyzer abstention, not a WCAG/ADA/IITAA exemption, with a visual hint to hover/focus the "i" button for the specific reason per row.
- **`na-cell.test.ts`** (3 tests) locks in the a11y contract — `aria-describedby`, `aria-label`, `role="tooltip"`, and per-category reason strings. 247 web tests pass.

### Changed

- Score cells where `cat.score === null` now render the `<NaCell>` instead of an empty string (previously blank under Strict for PDF/UA and Reading Order).
- Grade / Severity em-dash placeholders for N/A rows are now `aria-hidden="true"` so the tooltip becomes the single accessible source of truth.

## [1.13.5] - 2026-04-20

### Changed

- **Clicking a Strict/Practical pill no longer causes the viewport to jump.** The ScoreProfileBanner's rationale paragraph and several mode-dependent badges re-render at different heights when the active mode flips; that shifted the clicked card up or down relative to the viewport. `ModeCompareBox.vue` now captures its own `getBoundingClientRect().top` before emitting the mode change and, after Vue has flushed the DOM and one animation frame has elapsed, calls `window.scrollBy` to cancel out any delta. The clicked card stays visually static across the flip.
- No-op when the click is for the already-active mode, and no-op in SSR contexts where `window` is undefined.

## [1.13.4] - 2026-04-20

### Changed

- **Divergent categories (PDF/UA, heading_structure, table_markup, reading_order) now stay anchored in Detailed Findings** regardless of which mode is active. Previously, flipping to Strict via the PDF/UA mode-compare pill moved the card out of Detailed Findings into "Not Included in Scoring," which shifted the viewport — the next card underneath (often Text Extractability at 100/100 in both modes) scrolled into view and looked like the pill scores had changed. They hadn't; a different card had taken the position.
- `scoredCategories` filter now keeps any category that is scored in at least one profile (via `hasCrossModeSignal`); `naCategories` only catches categories that are N/A in both profiles (currently just `color_contrast`). The Detailed Findings card header gracefully displays `N/A` when the active mode is null for that category.
- Applied to both `index.vue` and `report/[id].vue`.

## [1.13.3] - 2026-04-20

### Changed

- **ModeCompareBox now renders inside "Not Included in Scoring" cards too** when the two profiles diverge for that category (e.g. PDF/UA Compliance Signals: Strict = N/A, Practical = scored). Previously clicking the Strict pill on a PDF/UA Practical card flipped mode to Strict, which moved the card out of Detailed Findings into the N/A section — and the mode-compare pills disappeared because the N/A section didn't render ModeCompareBox. Now the pills travel with the card so Strict = N/A and Practical = its score stay visible across the toggle.
- **New `hasCrossModeSignal(catId)` helper** on both `index.vue` and `report/[id].vue` gates the N/A-card ModeCompareBox so categories that are N/A in both modes (e.g. `color_contrast` without rendered-contrast analysis) don't get a useless "N/A vs N/A" box.
- **New `mode-compare-stable.test.ts`** locks in the invariant that ModeCompareBox's two pill scores stay put when `selectedMode` flips — 244 web tests now pass.

## [1.13.2] - 2026-04-20

### Changed

- **Practical mode's rationale block is now a single paragraph** instead of two. Dropped the redundant "NOTE:" amber banner — its content ("both evaluate the same document under WCAG … pick whichever view") duplicated the top-level `mode-recommendation-summary` directly above it.
- **The remaining Practical paragraph is tightened to match Strict's word count** (~36 vs. ~35 words): "Practical adds a PDF/UA Compliance Signals category (MarkInfo, tab order, list/table legality, PDF/UA identifiers) plus partial-credit floors on heading and table structure. Useful for tracking PDF/UA tools and authoring exports referenced in IITAA §504.2.2 PDF Export."
- **Keeps the §504.2.2 PDF Export link** and the indicator that Practical is useful for tracking PDF/UA tools per IITAA guidelines.
- `data-testid="practical-disclaimer"` now points at the single remaining Practical paragraph (the element previously carrying `strict-findings-note`).
- Test assertions updated; all 243 web tests pass.

## [1.13.1] - 2026-04-20

### Changed

- **Mode-compare boxes inside Detailed Findings are now clickable.** The per-category Strict / Practical score pills in `ModeCompareBox.vue` are rendered as `<button>` elements with `aria-pressed` state. Clicking either pill emits `update:selectedMode`, which the index and report pages bind to `selectedScoreMode` so the global mode flips from any category card.
- **The active profile's rationale paragraph moves to the top** of the "Why Strict matters / Why Practical matters" stack and gets an `· active view` tail indicator. Switching modes reorders the paragraphs in place so the relevant rationale is read first.
- **All 243 web tests still pass.**

## [1.13.0] - 2026-04-20

### Changed — profile messaging rewrite (no scoring-logic changes)

This release rewrites how the two scoring profiles are described throughout the app, exports, docs, and LLM files. Scoring weights, partial-credit floors, and scoring branches are unchanged. Stored reports continue to render identically. Internal profile keys (`strict`, `remediation`) are unchanged.

Motivation: ICJIA has not yet formally adopted a rubric, so framing Strict as "ICJIA's rubric" was premature. The previous messaging also unnecessarily positioned Practical as a "developer extension" with less standing than Strict. The new framing describes both profiles neutrally as two scoring methodologies that evaluate the same document using WCAG guidelines — differing only in category weights and whether PDF/UA signals are included.

- **Removed "ICJIA's rubric" and "developer extension / developer-added" language** from all user-facing copy: `apps/web/app/pages/index.vue`, `ScoreProfileBanner.vue`, `ScoreCard.vue`, `scoringProfiles.ts`, `modeDivergence.ts`, `useReportExport.ts`, `audit.config.ts`, `public/llms.txt`, `public/llms-full.txt`, `README.md`, `docs/00-master-design.md`, `docs/10-scoring-reconciliation.md`.
- **Profile labels** changed:
  - Strict: `Strict semantic score (ICJIA rubric)` → `Strict semantic score (WCAG + IITAA §E205.4)`
  - Practical: `Practical readiness score (developer extension)` → `Practical readiness score (WCAG + PDF/UA)`
- **Origin tags** changed (this is a machine-visible JSON-export change — downstream consumers filtering on origin need to update):
  - Strict: `icjia.iitaa.wcag21` → `wcag.iitaa.strict`
  - Practical: `developer-extension.pdfua` → `wcag.pdfua.practical`
- **Origin labels** changed:
  - Strict: `ICJIA / IITAA-aligned` → `WCAG + IITAA §E205.4`
  - Practical: `Developer extension — adds PDF/UA` → `WCAG + PDF/UA signals`
- **New explanatory section on the homepage** ("Why the two scores can differ") explicitly addresses when Practical scores higher than Strict (remediation scaffolding such as 70-point floors, PDF/UA signals that Strict doesn't count) and when Practical scores lower (solid WCAG semantics combined with missing PDF/UA markers like `MarkInfo /Marked true`, PDF/UA identifier, complete tab order — the 9.5% PDF/UA Compliance Signals category drags down Practical while Strict ignores it).
- **Color Contrast row in the ScoreProfileBanner weights table** now correctly displays `4.5%` for Practical (the config has always included it; the display row was stale at `N/A`).
- **Test assertions updated** to match the new copy across `components.test.ts`, `scoring-display.test.ts`, and `responsive.test.ts`. All 243 web tests pass.
- **Profile weights verified** to sum to 100% in both profiles (Strict: 20 + 15×3 + 10×2 + 5×3 = 100%; Practical: 17.5 + 13×3 + 9.5 + 8.5×2 + 4.5×2 + 4×2 = 100%).

### Breaking

- JSON-export consumers filtering on `profile.origin` must update from `icjia.iitaa.wcag21` → `wcag.iitaa.strict` and from `developer-extension.pdfua` → `wcag.pdfua.practical`. Stored reports generated before this release retain the old tags.

## [1.12.10] - 2026-04-19

### Changed

- **`docs/00-master-design.md` updated to match v1.12.9 attribution** (doc version bumped from 1.7 → 1.8). Project Overview now states explicitly that the app computes two attributed profiles (Strict = ICJIA's rubric, Practical = developer-introduced extension) and that only Strict speaks for ICJIA. A new **Scoring Profiles & Attribution** table at the top of §5 Scoring Model pins the origin tags (`icjia.iitaa.wcag21` / `developer-extension.pdfua`), authority, weight scope, and role of each profile. Added "Attribution-first scoring" to the Core Principles list so the architectural invariant is surfaced at the top of the design doc.

## [1.12.9] - 2026-04-19

### Changed — attribution overhaul (no scoring-logic changes)

This release is entirely about **honestly attributing** the two scoring profiles. No weights, partial-credit floors, or scoring branches were altered. Stored reports continue to render identically. Internal profile keys (`strict`, `remediation`) are unchanged — only labels, disclaimers, and docs.

The correction is: **Strict is ICJIA's rubric** (anchored to WCAG 2.1 AA and Illinois IITAA §E205.4). **Practical is a developer-introduced extension** that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric — it is NOT ICJIA's rubric and NOT required by Illinois accessibility law. IITAA §504.2.2 references PDF/UA only for authoring-tool export capability; §E205.4 governs final-document accessibility through WCAG 2.1.

### Added

- **Origin tags on both profiles** in `audit.config.ts` — `strict.origin = "icjia.iitaa.wcag21"` and `remediation.origin = "developer-extension.pdfua"` — carried through the JSON export so downstream consumers can filter on rubric authority.
- **Yellow `practical-disclaimer` banner** inside the Score Profile card that appears only when Practical is selected. It explicitly states Practical is a developer extension, not ICJIA's rubric, and not required by Illinois accessibility law, with references to IITAA §504.2.2 vs §E205.4.
- **Header labels in the Strict/Practical weights table** now read "Strict weight · ICJIA rubric" and "Practical weight · developer extension" so the weight columns are self-attributing.
- **Comment header** in `audit.config.ts` above `SCORING_PROFILES` spelling out the attribution and the fact that Practical's weights and partial-credit floors are judgment calls, not published standards.

### Changed

- **All public-facing Practical copy** (MODE_PROFILE_LABELS, MODE_PROFILE_DESCRIPTIONS, MODE_RECOMMENDATION_TITLES, MODE_RECOMMENDATION_SUMMARIES, STRICT_MODE_RATIONALE_TEXT, PRACTICAL_FINDINGS_NOTE_*, CATEGORY_TABLE_* in `apps/web/app/utils/scoringProfiles.ts`) rewritten to frame Strict as ICJIA's rubric and Practical as a developer extension. Practical is no longer described as a "valid accessibility lens" — it is described as a progress / vendor-reconciliation lens that adds PDF/UA signals.
- **Mode-divergence copy** in `apps/web/app/utils/modeDivergence.ts` — every "Why Practical matters" line was rewritten to (a) identify the relevant partial-credit or weight as a developer judgment call, and (b) explicitly note that the Practical score is not an Illinois accessibility-law signal. Applies to `heading_structure`, `table_markup`, `reading_order`, and `pdf_ua_compliance` card explainers.
- **Methodology summary card** under the score hero now frames Strict as ICJIA's rubric and Practical as the developer-added extension.
- **Technical Details "Scoring modes and legal interpretation" panel** and the PDF/UA Compliance Signals per-category card rewritten with the corrected attribution.
- **AI-analysis payload** (`useReportExport.ts` → `buildAiAnalysis`) now emits a parenthetical disclaimer next to the Practical readiness score line so anything pasted into ChatGPT/Claude carries the attribution correction.
- **Export profile labels and descriptions** (`useReportExport.ts` → `profileLabel`, `profileDescription`) updated to qualify each profile with its origin. Exports to Word, HTML, Markdown, and JSON now display "Strict semantic score (ICJIA rubric)" and "Practical readiness score (developer extension)".
- **README "Two scoring modes, one document" section** renamed to "Two profiles, one document — and only one of them is ICJIA's rubric" and rewritten with a prominent attribution block, a "Caveats about Practical" checklist, and explicit guidance that Strict is the score to cite in Illinois accessibility-law contexts.
- **`docs/10-scoring-reconciliation.md`** rewritten with a new "Attribution" section at the top, rewritten profile descriptions, rewritten Matterhorn / PDF-UA note, a specific worked example (the ICJIA annual-report fixture), and stricter "Recommended usage" guidance (do not cite Practical for Illinois publication decisions).
- **`llms.txt` and `llms-full.txt`** updated so that LLMs consuming these files describe Strict as ICJIA's rubric and Practical as a developer extension — preventing downstream tools from citing Practical as an Illinois accessibility-law signal.

### Fixed

- **Two test assertions in `components.test.ts`** that pinned the old recommendation-title phrases ("Use Strict as the primary mode" / "not the primary legal/compliance score") updated to match the new attribution-first copy; added two new assertions that verify the `practical-disclaimer` banner renders and contains the key disavowals ("not ICJIA's rubric", "not required by Illinois accessibility law").

### What does NOT change

- No scoring weights moved.
- No partial-credit floor numbers moved.
- No scoring branch behavior changes.
- Internal profile keys (`strict`, `remediation`) unchanged.
- Stored reports render identically; no data migration required.

## [1.12.8] - 2026-04-19

### Added

- **Per-card "How each mode scores this category" box** in every Detailed Findings card on both the main page and the shared report. The box shows the Strict score and the Practical score side by side (highlighting the active mode), labels whether the category actually diverges between modes, and includes three short rationale lines: *Why the scores differ*, *Why Strict matters*, and *Why Practical matters*. Four categories branch on the scoring mode and get category-specific copy: `heading_structure` (Practical credits rich tagged body structure + bookmarks + role-mapped heading-like tags), `table_markup` (Practical credits well-formed row structure and consistent columns even without `<TH>` header cells), `reading_order` (Practical scores proxies when Strict defers to N/A), and `pdf_ua_compliance` (Practical-only category, framed against IITAA §504.2.2 vs §E205.4). All other categories show a "Same in both modes" label with a note that only the weight differs.
- **New `apps/web/app/utils/modeDivergence.ts`** containing a `DIVERGENCE_COPY` lookup, `getDivergenceCopy()` helper, and `canCategoryDiverge()` predicate so the rationale copy is a single source of truth reused by the box and by tests.
- **New `apps/web/app/components/ModeCompareBox.vue`** — the presentational component that renders the side-by-side score pills and the rationale text.
- **Three new tests** in `scoring-display.test.ts` (one markup check across both pages, two unit tests over `modeDivergence.ts`). Suite total: 243 web tests (up from 240).

## [1.12.7] - 2026-04-19

### Changed

- **Merged the Recommendation card and the Score Profile card into a single consolidated card** in `ScoreProfileBanner.vue`. Instead of two stacked panels with overlapping responsibilities, the report now has one visual card that contains the Illinois agency recommendation, the mode-aware title/summary, two clickable Strict/Practical cards (which act as the mode toggle), the mode-specific rationale block (emerald for Strict, amber for Practical with the §504.2.2 IITAA link), the alternate-profile score, and the collapsible category weights table. No loss of functionality: every previous data-testid is preserved (`mode-recommendation-card`, `mode-recommendation-current`, `mode-recommendation-title`, `mode-recommendation-summary`, `score-mode-strict`, `score-mode-remediation`, `strict-mode-rationale`, `strict-findings-note`, `alternate-score-summary`, `iitaa-pdfua-link`, `profile-weights-details`, `profile-weights-table`), so existing mode-switching and assertions continue to work. The removed pieces were purely duplicated: the separate "Score profile" header, the redundant `MODE_PROFILE_DESCRIPTIONS` paragraph (the clickable cards already carry equivalent copy), and the secondary pill-button toggle group (the cards themselves are now the toggle).

## [1.12.6] - 2026-04-19

### Added

- **Profile badge on every Detailed Findings card** (main page and shared report). Each card header now shows a `Strict` or `Practical` pill driven by `MODE_BUTTON_LABELS[selectedScoreMode]` — emerald tint in Strict, amber tint in Practical — so readers can see at a glance which scoring lens produced the per-category score shown on that card.
- **Dedicated `PDF/UA signals` pill on the `pdf_ua_compliance` card in Practical mode**. The extra pill appears only when `cat.id === 'pdf_ua_compliance'` and Practical is selected, using a slightly stronger amber tint to distinguish PDF/UA-oriented signals from the other scored categories.
- **Two new tests in `scoring-display.test.ts`** verifying the badge markup and conditional rendering in both `pages/index.vue` and `pages/report/[id].vue`. Suite total: 240 web tests (up from 238).

### Notes

- In Strict mode the `pdf_ua_compliance` card falls into N/A (its score is `null` by design); the PDF/UA pill is therefore intentionally not shown in Strict mode. The Practical card surfaces the full scored findings and the new pill.

## [1.12.5] - 2026-04-19

### Changed

- **Strict and Practical description cards in the Score Profile banner are now clickable** — they act as the primary mode selector in addition to the toggle buttons below. Inactive cards show a hover background and pointer cursor; the active card is tinted (emerald for Strict, amber for Practical) with an `Active` pill inside the heading. Cards are real `<button>` elements with `aria-pressed`, focus-visible rings, and native keyboard support (Enter/Space).

## [1.12.4] - 2026-04-19

### Added

- **PDF/UA Compliance Signals card now renders correctly in Practical mode** — `ScoreProfileResult` now carries a full per-profile `categories: CategoryResult[]` array (not just scores), and `categoriesForScoringMode` prefers the mode-specific array when it's supplied. The `pdf_ua_compliance` card now shows real Practical findings (tagged PDF detected, MarkInfo state, PDF/UA identifier, tab order, list/table legality) when Practical is selected, and the Strict-mode guidance text when Strict is selected.
- **Eleven-row weights comparison table in the Technical Details expandable**, showing Strict vs Practical weights side-by-side for every category, including the Practical-only PDF/UA Compliance Signals row (9.5%) and the reserved Color Contrast row.
- **Dedicated PDF/UA Compliance Signals per-category card in Technical Details** documenting what it measures, the scoring formula (+tags, +MarkInfo, +PDF/UA id, +tab order, +list legality, +table legality), and why it is Practical-only with IITAA §504.2.2 / §E205.4 context.
- **Collapsible `View category weights for both modes` table inside the Score Profile banner** so the full Strict/Practical weight breakdown is reachable from the hero without scrolling to Technical Details.
- **Extensive README "Two scoring modes, one document" section** that explains why two modes is a good thing rather than an annoyance — five concrete reasons, plus a rewritten Categories & Weights table with both modes side-by-side.
- **llms.txt and llms-full.txt updated** to surface both profiles, the new PDF/UA Compliance Signals category, and the full Strict/Practical weight split so LLMs and automated tools can cite either score correctly.
- New scoring-profile test covering the full per-profile `categories` override path (total suite: 474 tests, up from 473).

### Changed

- **Methodology summary card** under the score hero now states explicitly that Strict weighs nine core categories and Practical adds a dedicated PDF/UA Compliance Signals category (eleven scored categories total in Practical).
- **Technical Details "How Scores Are Calculated"** now reads "up to eleven" categories instead of "nine" and leads with the Strict vs Practical weights table before the per-category scoring logic cards.
- **Split `appendSupplementaryFindings` and `generateSummary` out of `scorer.ts`** into dedicated modules under `apps/api/src/services/scoring/`. `scorer.ts` is now ~390 lines shorter without changing any observable behavior.

### Fixed

- Stale "nine categories" wording in the public methodology summary and in llms.txt / llms-full.txt.

## [1.12.3] - 2026-04-19

### Added

- **Dual scoring profiles in the UI and exports** — reports now surface both a **Strict semantic score** and a **Practical readiness score**. Category tables follow the selected profile where alternate category scores are available, and exports/AI analysis include the practical-readiness label when present.
- **Prominent legal recommendation card** — the ScoreCard hero now shows a front-and-center Illinois agency guidance card explaining that **Strict** is the better primary mode for publication and ADA/WCAG/ITTAA-oriented legal accessibility review, while **Practical** is a secondary progress view.
- **Expanded methodology/legal guidance** — the Technical Details section now explains why accessibility is not always a simple binary, what each mode means, and how weight renormalization helps scoring without replacing strict semantic findings.
- **Scoring-profile utilities and tests** — added shared profile-selection helpers and dedicated tests covering category-profile switching, UI copy, and export output.
- **Dedicated Practical `pdf_ua_compliance` category** — the broader remediation-oriented profile now scores PDF/UA-oriented signals such as tagging/`StructTreeRoot`, `MarkInfo`, tab order, PDF/UA metadata, and list/table legality checks.

### Changed

- **Renamed the softer profile in user-facing copy** from "Remediation" / "Remediation-oriented" to **"Practical" / "Practical readiness"** to avoid implying that a file is already fully remediated.
- **Strict is now explicitly framed as the primary legal/compliance signal** throughout the app, shared report, and exports because it prioritizes programmatically determinable headings, table semantics, and logical structure.
- **Recommendation copy is mode-aware** — when Practical is selected, the UI now explains that the score may be higher because it rewards usable improvements even while semantic accessibility gaps remain.
- **PDF/UA guidance now cites IITAA 2.1 more precisely** — the docs and UI now explain that Illinois expressly references PDF/UA in IITAA 2.1 `504.2.2 PDF Export` for authoring-tool export capability, while `E205.4` frames non-web document accessibility through WCAG 2.1.
- **Matterhorn terminology is now explained more plainly** — README guidance now clarifies that Matterhorn is a technical PDF/UA testing protocol/checklist used by some tools, not a separate legal standard.
- **Strict vs Practical responsibilities are now more explicit** — Strict does not use PDF/UA conformance signals as the primary document-level publication/compliance score driver, while Practical does include them, to avoid overstating noncompliance or skewing remediation priorities by treating a helpful technical standard as though it were the governing rule for every final PDF.
- **Same-document lens guidance is now explicit** — the UI and docs now clarify that Strict and Practical are two valid accessibility lenses applied to the same document, not different document states; Strict is the semantics-first/publication lens, while Practical is the remediation/progress lens.
- **Extracted the Score-Profile recommendation banner into a dedicated component** (`apps/web/app/components/ScoreProfileBanner.vue`) so `ScoreCard.vue` is ~180 lines shorter and purely owns grade/verdict/summary presentation.
- **Consolidated duplicated Strict/Practical copy into shared constants** in `apps/web/app/utils/scoringProfiles.ts` (`MODE_RECOMMENDATION_TITLES`, `MODE_RECOMMENDATION_SUMMARIES`, `STRICT_MODE_RATIONALE_TEXT`, `PRACTICAL_FINDINGS_NOTE_*`, `CATEGORY_TABLE_*`). The category-table subtitle in `index.vue` now reads from the same constants instead of inlining near-duplicate paragraphs.
- **Centralized the IITAA link and mode-label lookups** (`IITAA_PDFUA_URL`, `MODE_BUTTON_LABELS`, `MODE_PROFILE_LABELS`, `MODE_PROFILE_DESCRIPTIONS`) so button labels, profile descriptions, and external links cannot drift across components.

### Fixed

- **API TypeScript build in `qpdfService`** — added a null-safety guard before recording language-span tags so `pnpm --filter api build` no longer fails when `mapToStandardTag(...)` returns `null`.
- **Duplicate `## [1.12.2]` CHANGELOG heading** — the 2026-04-19 release block is now correctly labelled `1.12.3`. Root, web, and API `package.json` versions are bumped in sync and tagged `v1.12.3`.

### Removed

- **Binary accessibility verdict banner** — removed the "This file is accessible" / "This file is not accessible" banner because the absolute phrasing overstated certainty in cases where practical improvement and stricter semantic accessibility diverge.

## [1.12.2] - 2026-04-17

### Changed

- **AI analysis prompt now instructs the LLM to verify the PDF is attached** — the prompt references the filename directly and tells the assistant to ask the user to upload the PDF if it wasn't attached to the conversation. Makes remediation guidance much more accurate by prompting the model to inspect the actual tag tree, reading order, alt text, and form fields rather than reasoning only from the audit summary.

## [1.12.1] - 2026-04-17

### Changed

- **AI analysis panel only renders when remediation is needed** — the "For Use with AI Assistants" card is hidden entirely on clean reports (no Critical or Moderate severity categories). Passing documents now go straight from Export & Share to the "Analyze More Files" button without AI copy clutter.
- **AI analysis output lists only failing items** — `buildAiAnalysis` no longer emits the "What's working" or "Not applicable" sections. When called on a clean document the function short-circuits to a compact "No remediation is needed" message. This keeps LLM context focused on what actually needs fixing.
- **Preview textarea is always visible and full-width** — removed the `<details>` collapsible wrapper and the narrow flex column that was clipping lines. The textarea now spans the full card width, uses `resize-y` so users can drag to expand, wraps long lines (no horizontal scrollbar), and is labeled "AI Analysis Preview".
- **Copy button moved beneath the preview** and centered; full-width on mobile.
- **Removed the "if I can only fix three things" remediation question** — the AI analysis now asks the LLM to help fix every failing category, not to triage.

## [1.12.0] - 2026-04-17

### Added

- **Prominent accessibility verdict banner** — ScoreCard now displays a large green "This file is accessible" or red "This file is not accessible" banner above the grade circle, with thumbs-up/thumbs-down icons, WCAG-AA-compliant contrast (`#15803d` / `#b91c1c` on white), and `role="status"` + `aria-live="polite"` for assistive technology. Grades A and B are considered accessible; C/D/F are not.
- **Verdict explanation sentence** — a new sentence under the grade label quantifies the remaining Critical and Moderate issues (e.g. "Resolving 2 critical issues and 1 moderate issue in the detailed findings below will move this document toward WCAG 2.1 AA and ADA Title II compliance"), with four wording variants covering accessible-with/without-remaining-issues and failing-with/without-counts.
- **AI-ready analysis panel** (`apps/web/app/pages/index.vue`) — new card after Export & Share with a "Copy Analysis for AI" button and a collapsible preview textarea. Clipboard payload includes verdict, grade, executive summary, passing categories, failing categories with findings and WCAG 2.1 references, N/A categories, and five remediation questions for an LLM to answer. Designed for pasting into ChatGPT, Claude, or any LLM to get plain-language explanations and step-by-step remediation guidance.
- **`buildAiAnalysis(result)` exported helper** (`apps/web/app/composables/useReportExport.ts`) — pure function that produces the AI-ready Markdown. Composable also exposes `copyAiAnalysis`, `aiCopied`, and `buildAiAnalysisText` for UI wiring.
- **Test coverage** — 15 new tests (5 verdict-explanation cases in `scoring-display.test.ts`, 10 cases in the new `ai-analysis.test.ts`). Suite is now 222 tests, all passing.

### Changed

- `ScoreCard.vue` `result` prop accepts an optional `categories` array; the verdict explanation is only rendered when categories are provided.
- `vitest.config.ts` registers `~` and `@` aliases so tests can import from `~/utils/*` the same way runtime code does.

## [1.11.0] - 2026-04-13

### Added

- **WCAG 2.1 References card in every scored category** — each basic/advanced card on the audit results page and shared report page now includes a dedicated "WCAG 2.1 References" sub-card listing the exact success criteria the score is tied to (id, name, and Level A/AA badge), with each row linking to the official W3C Understanding document. Makes the rubric externally anchored and auditable so reviewers can verify the grade against the source standard.
- **Shared WCAG utility** (`apps/web/app/utils/wcag.ts`) — single source of truth mapping each scoring category to structured `WcagCriterion` objects (`id`, `name`, `level`, W3C Understanding URL). Replaces the previous duplicate map that lived only inside the export composable.
- **JSON export enrichment** — exported reports now include `wcag.successCriteriaDetailed` (structured objects with URLs) alongside the existing `successCriteria` string array. Additive change; no breaking change to existing consumers.

### Changed

- `useReportExport.ts` now imports the WCAG map from the shared util instead of defining its own copy, keeping web UI citations and exported reports in lockstep.

## [1.10.1] - 2026-04-12

### Added

- **Responsive layout test suite** (`responsive.test.ts`) — 48 tests covering mobile navigation, responsive padding, ScoreCard/CategoryRow responsive classes, table overflow handling, CSS transitions, and scoring modal breakpoints

### Fixed

- Updated ScoreCard selectors in `scoring-display.test.ts` to match new responsive class names (`text-5xl`/`w-28` instead of `text-7xl`/`w-40`)

## [1.10.0] - 2026-04-12

### Added

- **Fully responsive layout** — mobile-first redesign across all pages and components
  - Hamburger menu with animated slide-down navigation drawer on screens below `md` breakpoint
  - CategoryRow stacks label and score bar vertically on mobile for readability
  - Grade circles scale down on small screens (`w-28`/`w-24` mobile, `w-40`/`w-32` desktop)
  - All data tables (`Category Scores`, `My History`, `Admin Logs`, `Scoring Rubric`, `QPDF`, `PDF.js`) scroll horizontally on narrow viewports with `min-width` constraints
  - Metadata rows stack vertically on mobile (`flex-col sm:flex-row`)
  - Grade scale grid adapts from 3 columns on mobile to 5 on desktop
  - Responsive padding throughout: `px-3 sm:px-6`, `p-3 sm:p-5`, `py-4 sm:py-8`
  - Heading sizes adapt: `text-xl sm:text-2xl`, `text-base sm:text-lg`
  - Info card text scales: `text-2xl sm:text-3xl`

## [1.9.1] - 2026-04-11

### Changed

- **Increased font sizes globally** — overrode Tailwind's default text size scale via `@theme` in `main.css` for improved readability across the entire UI (xs: 12→17px, sm: 14→19px, base: 16→21px, lg: 18→23px)
- Technical Details section uses `text-sm` container for balanced density in long-form content

## [1.9.0] - 2026-03-22

### Added

- **Publication batch audit CLI** (`pnpm a11y-audit`) — new `publist` subcommand that fetches all ICJIA publications via GraphQL, audits every PDF, and generates reports with grades, category scores, and remediation guidance
  - **SQLite cache** — results cached in `~/.a11y-audit/cache.db` so re-runs only audit new publications; `--force` and `--clear` flags for full re-scans
  - **CSV report** — grade distribution summary, temporal comparison (recent vs. legacy), per-file scores across all 10 categories
  - **HTML report** — interactive standalone page with:
    - Grade distribution bar chart and stacked visualization
    - Assessment summary with remediation recommendations
    - Sortable columns (instant client-side sort on all columns including grade, score, date, and category scores)
    - Pagination (150 rows per page) for fast rendering of 1,000+ publications
    - Expandable detail rows with per-category grade/score/severity cards, publication summary, tags, type, and critical findings
    - Horizontally scrollable title and critical issues columns
    - Embedded CSV download button (no server round-trip)
  - **Concurrent analysis** — configurable concurrency (1–10, default 3) with progress bar
  - **Publication metadata** — fetches summary, tags, and publication type from ICJIA API; backfills existing cached rows automatically
- **Manager report route** (`/publist`) — HTML report auto-deployed to `apps/web/public/publist.html` on each audit run, served via Nitro server route at `/publist` (no `.html` needed)
  - Blocked from search engines via `robots.txt` and `X-Robots-Tag: noindex, nofollow` header
  - Returns 404 with guidance if report hasn't been generated yet
- **Modular CLI architecture** — refactored CLI from 280-line monolith to subcommand router with extracted modules:
  - `commands/audit.ts` — original single-file audit
  - `commands/publist.ts` — batch publication audit orchestrator
  - `lib/graphql.ts` — GraphQL publication fetcher with pagination
  - `lib/cache.ts` — SQLite cache layer with migration support
  - `lib/csv.ts` — CSV generator with grade distribution and temporal comparison
  - `lib/html.ts` — client-side rendered HTML report generator
  - `lib/progress.ts` — terminal progress bar
  - `lib/colors.ts` — shared ANSI color utilities

### Changed

- CLI entry point (`src/index.ts`) reduced to 19-line subcommand router
- `better-sqlite3` added as CLI dependency; externalized in tsup build config

## [1.8.0] - 2026-03-12

### Added

- **Font embedding scoring** — non-embedded fonts now cap Text Extractability at 85 (Minor severity, never Pass), with per-font listing and Acrobat fix guidance
- **Multiple H1 detection** — documents with more than one H1 heading score 75 (Minor) for Heading Structure; combined with hierarchy gaps, score drops to 55
- **Acrobat remediation panel** — Adobe Acrobat fix instructions are now rendered in a distinct amber-bordered panel with numbered steps, separated from findings
- **Inline guidance styling** — "How to fix:", "Fix:", and "Tip:" lines now render with amber left border and background tint for visual distinction

### Changed

- Font embedding moved from informational supplementary finding to scored component of Text Extractability
- Acrobat remediation guide now always visible in Basic view (no Advanced toggle needed)

## [1.7.1] - 2026-03-12

### Added

- **Adobe Acrobat remediation guide** — every category that scores below "Pass" now includes a `--- Adobe Acrobat: How to Fix ---` section with:
  - The exact Acrobat Full Check rule name to look for (e.g., "Document → Tagged PDF", "Alternate Text → Figures alternate text")
  - Step-by-step menu paths (e.g., "File → Properties → Description tab → Title field")
  - Specific fix instructions for each issue type
  - Guidance is shown in Advanced view only (no score impact)

### Changed

- List structure analysis moved from Table Markup to Reading Order category — lists no longer appear orphaned under N/A when a document has no tables

## [1.7.0] - 2026-03-12

### Added

- **PDF/UA identifier detection** — checks XMP metadata for `pdfuaid:part` to report whether a document claims PDF/UA (ISO 14289) conformance (informational, no score impact)
- **Artifact tagging analysis** — counts `/Artifact` structure elements to verify decorative content (headers, footers, watermarks) is properly distinguished from real content (informational, no score impact)
- **ActualText & expansion text detection** — reports `/ActualText` (glyph/ligature overrides) and `/E` (abbreviation expansion) attributes that help screen readers pronounce content correctly (informational, no score impact)
- **QPDF binary string decoder** for `b:` prefixed hex strings — attempts UTF-16BE and UTF-8 decoding
- New QpdfResult fields: `hasPdfUaIdentifier`, `pdfUaPart`, `artifactCount`, `actualTextCount`, `expansionTextCount`
- 16 new tests (379 total): PDF/UA detection, artifact counting, ActualText/expansion text, scorer supplementary findings

### Changed

- Technical details section updated with 3 new QPDF extraction rows and 3 new supplementary analysis entries

## [1.6.0] - 2026-03-12

### Added

- **Per-card Basic/Advanced toggle** — each category card has its own sliding switch to show or hide detailed findings (per-table breakdowns, per-font listings, heading trees, link inventories, form field names)
- **Alt text quality heuristic** — non-scoring warning flags alt text that appears to be hex-encoded, machine-generated, a filename, or a generic placeholder (e.g., "image", "photo")
- **QPDF binary string decoding** — `b:` prefixed hex strings from QPDF are now decoded as UTF-16BE or UTF-8, producing human-readable alt text instead of raw hex
- **Detailed per-item findings** — scorer now produces per-table structure breakdowns, per-image alt text listings, per-link URL mappings, per-font embedding status, per-form-field label inventory, and compact heading hierarchy trees
- **Guidance line rendering** — "How to fix:", "Tip:", and "Fix:" lines no longer display failure icons; they render with a subtle `›` marker instead

### Changed

- Basic/Advanced toggle styling: Basic state uses emerald/green pill, Advanced uses blue pill — both visually distinct
- Supplementary findings (role mapping, tab order, language spans, font analysis) are now classified as "advanced" and hidden by default in Basic view
- Technical details section updated with alt text quality check documentation
- All `  `-prefixed detail lines in scorer output are consistently classified as advanced findings

## [1.5.0] - 2026-03-11

### Added

- **Comprehensive supplementary analysis** — 10 new detection checks appended as informational findings to existing scoring categories:
  - **List markup analysis** — detects `/L`, `/LI`, `/Lbl`, `/LBody` tags; reports well-formed vs malformed lists and nesting depth
  - **Marked content & artifact detection** — checks `/MarkInfo` dictionary for proper content/artifact distinction
  - **Font embedding analysis** — identifies embedded vs non-embedded fonts from `/FontDescriptor` objects
  - **Paragraph structure** — counts `/P` tags to assess body text tagging
  - **Role mapping** — detects `/RoleMap` on StructTreeRoot for custom-to-standard tag mappings
  - **Tab order** — checks `/Tabs /S` on page objects for keyboard navigation
  - **Natural language spans** — identifies structure elements with explicit `/Lang` attributes for multilingual content
  - **Empty page detection** — flags pages with < 10 characters of text content
- `ListAnalysis` interface with 5 fields for list structure data
- New QpdfResult fields: `lists`, `paragraphCount`, `hasMarkInfo`, `isMarkedContent`, `hasRoleMap`, `roleMapEntries`, `tabOrderPages`, `totalPageCount`, `langSpans`, `fonts`
- New PdfjsResult field: `emptyPages`
- 23 new tests (363 total): list detection, MarkInfo, RoleMap, tab order, font embedding, paragraph/language spans, and scorer supplementary findings

### Changed

- Supplementary findings appear as grouped sections (e.g., "--- Font Analysis ---") within existing scored categories, preserving scoring stability
- All new checks are **informational only** — no scoring weight changes, ensuring existing document grades remain consistent

## [1.4.0] - 2026-03-11

### Added

- **Enhanced table accessibility analysis** — six sub-checks replace the old binary header detection:
  - Header cells (TH tags) — 30 points
  - Scope attributes (/Column or /Row) — 20 points
  - Row structure (TR tags, handles THead/TBody/TFoot) — 15 points
  - Nested table detection — 10 points
  - Caption elements — 10 points
  - Column consistency across rows — 10 points
  - Header-data association bonus (/Headers attribute) — 5 points
- `TableAnalysis` interface with 12 fields for detailed table structure data
- 13 new QPDF parser tests and 7 new scorer tests (340 total)
- Changelog link and dynamic version display in footer
- `CHANGELOG.md` with historical entries for v1.0.0–v1.3.0

### Changed

- Table markup scoring now uses multi-factor weighted scoring instead of binary pass/fail
- Each table sub-check produces actionable findings with Adobe Acrobat fix instructions
- Technical details section updated with full table scoring methodology

## [1.3.0] - 2026-03-11

### Added

- **Batch PDF upload** — drop or select up to 5 PDFs at once with a staged file list and validation before analysis begins
- **Tab-based results** — grid layout shows all file tabs; click any tab to view its full report, export, or share
- **Cancel support** — AbortController-based cancel button stops remaining uploads mid-batch
- **Batch progress view** — per-file status (queued, processing, done, error, cancelled) with grade badges as they complete
- **Completion banner** — dismissible green notification when all files finish processing
- **Accessible tooltips** — custom WCAG 2.1 tooltip component (`AppTooltip.vue`) shows full filenames on hover/focus
- **Server semaphore timeout** — 60-second timeout prevents queue starvation under batch load (returns 503)
- **`BATCH.MAX_FILES`** constant in `audit.config.ts` (default 5)

### Fixed

- pdfjs document resource leak on error paths (try/finally destroy)
- File objects now nulled after upload to free browser memory
- Tab bar no longer disappears when clicking error/cancelled tabs

### Changed

- Rate limit increased from 30 to 35 analyses/hour to accommodate batch sessions with retries

## [1.2.0] - 2026-03-10

### Added

- **Document metadata section** in reports (creator, producer, dates, version, encryption status)
- **pdfjs image detection fallback** for untagged PDFs using operator list analysis
- **Expandable technical details** section explaining how the tool analyzes PDFs (QPDF + PDF.js methodology)
- **Idle-state hint** — "Analyze" nav link pulses when user is on the landing page
- Show all findings without truncation in detailed report

### Fixed

- TS2551: cast OPS to Record for pdfjs-dist type compatibility

## [1.1.0] - 2026-03-09

### Added

- **Light/dark mode toggle** with CSS variable theming and configurable default
- **a11y-audit CLI tool** for command-line PDF accessibility analysis
- **WCAG 2.1 AA compliance** — contrast fixes, accessibility tests, caveat text
- **Configurable branding** with rebrand script (`pnpm rebrand`)
- JSON download and CTA buttons on shared report page
- MIT license
- Clipboard fallback for older browsers
- `rebuild.sh` deployment script
- `datePublished`/`dateModified` in JSON-LD and OG meta tags
- Methodology card with severity highlights

### Fixed

- Scoring modal heading order a11y violation
- Robots warning for shared report pages
- Meta description length for SEO compliance
- Nitro esbuild target set to es2022 for BigInt support
- Deduplicated SEO config (removed @nuxtjs/seo, use Nuxt built-in head)

## [1.0.0] - 2026-03-07

### Added

- **Core PDF accessibility grader** — 9 categories scored against WCAG 2.1 and ADA Title II
- **Dual analysis engine** — QPDF (structure) + PDF.js (content) run in parallel
- **Report exports** — Word (.docx), HTML, Markdown, JSON
- **Shareable reports** — server-stored with 30-day expiry, public viewing without auth
- **OTP authentication** — passwordless email login via Mailgun
- **Rate limiting** — per-endpoint with IP and email keying
- **208 tests** across API and frontend
- OG image, meta tags, and structured data (JSON-LD)
- Environment-specific configuration with `.env` examples
- Deployment documentation for DigitalOcean/Forge/PM2/nginx

[1.8.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ICJIA/file-accessibility-audit/releases/tag/v1.0.0

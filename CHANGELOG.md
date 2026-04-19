# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

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

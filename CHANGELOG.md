# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

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

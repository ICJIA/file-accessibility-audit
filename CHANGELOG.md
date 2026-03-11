# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

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

[1.5.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ICJIA/file-accessibility-audit/releases/tag/v1.0.0

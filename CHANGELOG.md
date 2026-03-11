# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

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

[1.3.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ICJIA/file-accessibility-audit/releases/tag/v1.0.0

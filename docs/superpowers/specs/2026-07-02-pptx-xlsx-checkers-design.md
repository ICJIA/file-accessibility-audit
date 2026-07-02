# PPTX + XLSX Accessibility Checkers — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan
**Scope:** Add PowerPoint (`.pptx`) and Excel (`.xlsx`) accessibility auditing as first-class peers of PDF and Word, in one release (target **v1.33.0**), built on a shared OOXML core extracted from `docxService.ts`. Audit-only — auto-remediation stays PDF-only. PDF and DOCX behavior are unchanged.

## Problem

The agency's published-document estate is PDF, Word, PowerPoint, and Excel. The app audits the first two. PowerPoint and Excel files are the same container format as Word — OPC ZIP + OOXML XML (ECMA-376) — so the v1.30.0 DOCX infrastructure (content-sniffing dispatch, jszip + fast-xml-parser extraction, zip-bomb guards, shared scoring/report pipeline, conformance-gate discipline) generalizes to both. Adding them closes the estate.

## Constraints (carried over from the DOCX release)

- **The PDF pipeline is frozen**, and the DOCX pipeline is now frozen *behaviorally* too: the shared-core refactor must be a mechanical move pinned by the existing DOCX test suites (docxService / docxScorer / docxConformance / docxIntegration), which must pass unchanged.
- **Accuracy comes from the conformance gate**, not the weighted score: each gate fires only on confirmed, machine-checkable violations mapped to WCAG 2.2 AA success criteria via the same `WCAG_CATEGORY_MAP` (`WCAG_VERSION=2.1` reverts as everywhere else). The external benchmark is Microsoft's published Accessibility Checker rules for PowerPoint and Excel — the same standard the DOCX checker was validated against for Word.
- **Per-format feature flags, default ON** (`PPTX_ENABLED` / `XLSX_ENABLED`), mirroring `DOCX_ENABLED`: off means the API rejects the type cleanly and the frontend drops it from the dropzone and copy.
- **No new dependencies.** jszip + fast-xml-parser only; no external binaries.

## Approach

Considered:

1. **Copy `docxService.ts` twice** — fastest start, but the ~160 lines of generic OOXML helpers plus the contrast math would exist in triplicate and drift (the copy-drift failure mode the v1.32.0 structural release just cleaned up elsewhere).
2. **Shared OOXML core + two thin extractors** — **chosen.**
3. **Format-plugin registry** — over-engineered for four known formats; rejected (YAGNI).

### Shared core: `apps/api/src/services/ooxml.ts`

Extract from `docxService.ts`, unchanged in behavior:

- `readCapped` — the streaming per-part decompression cap (zip-bomb guard), already imported by `analyzer.ts`.
- The XML node helpers: `parseXml`, `tagOf`, `childrenOf`, `attrOf`, `firstChild`, `descendants`, `rawText`, `textOf`, `rootElement`, and the shared `XMLParser` instance config.
- A `docProps/core.xml` metadata reader (title, plus author fields already parsed) — this part is byte-identical in structure across all three formats.
- The contrast math: `normalizeHex`, `hexToRgb`, `relLuminance`, `contrastRatio`, and the WCAG thresholds (4.5:1 normal / 3.0:1 large).
- The manual-bullet regex (`MANUAL_BULLET_RE`) — reused by the PPTX list check.
- A DrawingML alt-text reader (the `descr` / `title` attributes on `cNvPr`-family elements) and a theme-color resolver (`a:clrMap` / theme palette lookup) — the `a:` DrawingML namespace is shared by all three formats.

`docxService.ts` imports from `ooxml.ts` and keeps only WordprocessingML-specific extraction. No export signatures visible to other modules change except the new module's.

## Detection & dispatch (`services/analyzer.ts`)

- `DetectedFileType` becomes `"pdf" | "docx" | "pptx" | "xlsx"`.
- `detectFileType` gains two branches inside the existing ZIP sniff, same discipline (content, never extension):
  - `[Content_Types].xml` contains `presentationml.presentation` **and** `ppt/presentation.xml` exists → `pptx`
  - `[Content_Types].xml` contains `spreadsheetml.sheet` **and** `xl/workbook.xml` exists → `xlsx`
- `FileTypeError` gains codes `PPTX_DISABLED` / `XLSX_DISABLED`; the unsupported-type message becomes "…neither a PDF, Word, PowerPoint, nor Excel document."
- `analyzeDocument` gains two branches under the **same shared semaphore and `withTimeout`** as DOCX. `AnalysisResult` (`pdfAnalyzer.ts:55`) extends its `fileType` union and gains optional `pptxMetadata` / `xlsxMetadata`.
- `pageCount` semantics: slide count for PPTX, sheet count for XLSX (drives the report banner meta line — see Frontend).
- Route error mapping in `routes/analyze.ts` and `routes/analyze-url.ts` extends the existing DOCX cases (400 unsupported / 415 disabled / 422 parse-failed) with the new codes; `middleware/uploadMiddleware.ts` multer filter accepts the two MIME types + extensions gated on their flags. `routes/remediate.ts` multer filter stays PDF-only.

## Config (`audit.config.ts`)

Two new blocks mirroring `DOCX`, one per format:

| Key | PPTX | XLSX |
|---|---|---|
| `ENABLED` | `process.env.PPTX_ENABLED !== "false"` | `process.env.XLSX_ENABLED !== "false"` |
| `MIME_TYPE` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `MAX_UNCOMPRESSED_BYTES` | 30 MB (same rationale as DOCX) | 30 MB |
| Element caps | `MAX_SLIDES` 2,000 · `MAX_SHAPES` 100,000 | `MAX_SHEETS` 200 · `MAX_CELLS` 1,000,000 |
| `ANALYSIS_TIMEOUT_MS` | 20,000 | 20,000 |

Element caps reject over-cap files exactly like `DOCX.MAX_PARAGRAPHS` (the XLSX cell cap matters most — worksheet XML is the volume driver). All values documented with the SAFE TO CHANGE convention.

**Provisional scoring weights** (renormalized across applicable categories like DOCX; calibrated against fixtures during implementation — the fixture score targets below are the acceptance test, the weights are the tuning knob):

- **PPTX:** text_extractability 0.05 · title_language 0.14 · slide_titles 0.18 · alt_text 0.18 · reading_order 0.10 · table_markup 0.10 · color_contrast 0.10 · list_structure 0.07 · link_quality 0.08
- **XLSX:** text_extractability 0.05 · title_language 0.12 · sheet_names 0.18 · table_markup 0.25 · alt_text 0.18 · color_contrast 0.12 · link_quality 0.10

## PPTX extraction (`services/pptxService.ts` → `PptxAnalysis`)

**Parts read:** `docProps/core.xml` (title); `ppt/presentation.xml` + its rels (slide order, default text style); `ppt/slides/slideN.xml` + per-slide rels (hyperlink targets, image relations); `ppt/slideMasters/*` and `ppt/theme/theme1.xml` (theme colors, default run language from `a:defRPr lang`). Speaker notes are **out of scope for v1** (stated boundary, listed under Out of scope).

**Extracted facts:**

- Per slide: title placeholder (`p:ph type="title"` / `"ctrTitle"`) presence and text; whether the title is the *first* content-bearing shape in `p:spTree` (reading-order signal); total shape count.
- Images / graphic frames / SmartArt / charts: alt text (`descr` on the `cNvPr` family via the shared DrawingML reader), decorative marking.
- Tables (`a:tbl`): `firstRow` header flag, row/column counts.
- Hyperlinks (`a:hlinkClick` `r:id` → rels target) with display text.
- Lists: paragraphs with `a:buChar`/`a:buAutoNum` vs manual bullet characters (shared regex).
- Contrast: text runs with explicit `solidFill` (or resolvable theme color) over a resolvable solid background — conservative, explicit-evidence-only, same posture as Word.

**Categories:** `text_extractability` (auto-pass 100, same rationale as Word — PowerPoint text is never a flat image), `title_language`, **`slide_titles` (new category)** — every slide has a title placeholder with text, no duplicate titles (Microsoft's highest-severity PowerPoint rule), **`reading_order` (partially active — permanently N/A for Word)** — machine-checkable title-first check plus a shape-count advisory, `alt_text`, `table_markup`, `color_contrast`, `list_structure`, `link_quality`. **Omitted** (as `bookmarks` was for Word): `heading_structure`, `form_accessibility`, `bookmarks`. A `PPTX_HELP` link map mirrors `DOCX_HELP` with Microsoft PowerPoint accessibility support URLs.

## XLSX extraction (`services/xlsxService.ts` → `XlsxAnalysis`)

**Parts read:** `docProps/core.xml` (title); `xl/workbook.xml` (sheet names, order, hidden state); `xl/worksheets/sheetN.xml` (`mergeCells`, `hyperlinks`, used range); `xl/tables/tableN.xml` (`headerRowCount`, range); `xl/drawings/drawingN.xml` (alt text on pictures/charts/shapes); `xl/sharedStrings.xml` (hyperlink display text); `xl/styles.xml` (fonts/fills for contrast).

**Extracted facts:** sheet list with default-name detection (`Sheet1`-pattern) and hidden state; per-sheet merged-range count; defined table objects with header status; a *bounded* data-region heuristic (used range beyond a size threshold with no defined table → advisory only, never a gate finding); images/charts alt text; hyperlinks with display text; contrast pairs (explicit font color on explicit cell fill only).

**Categories:** `text_extractability` (auto-pass), `title_language` — **title only**: Excel has no document-language property, so the language half is honestly *not assessed* (finding text explains this) and the category scores on the title alone, **`sheet_names` (new category)** — no default-named visible sheets (Excel already enforces name uniqueness, so unlike slide titles there is no duplicate check), `table_markup` — data as real table objects with header rows; merged cells penalize here as advisory findings, `alt_text`, `color_contrast`, `link_quality`. **Omitted:** `heading_structure`, `reading_order`, `list_structure`, `form_accessibility`. An `XLSX_HELP` link map with Microsoft Excel accessibility support URLs.

## Conformance gates (`services/scoring/conformance.ts`)

Two self-contained analogues of `evaluateDocxConformance` (the PDF and DOCX gates untouched). Same discipline: fire **only** on confirmed machine-checkable violations; heuristics stay in scoring; every finding carries app-specific fix steps ("In PowerPoint: …" / "In Excel: …").

**`evaluatePptxConformance` fires on:**

| SC | Level | Trigger |
|---|---|---|
| 1.1.1 Non-text Content | A | Non-decorative images/graphics without alt text |
| 2.4.2 Page Titled | A | No document title in core properties |
| 3.1.1 Language of Page | A | No language resolvable from presentation/master text defaults |
| 1.3.1 Info and Relationships | A | Data tables (≥2×2) without the `firstRow` header flag |
| 1.4.3 Contrast (Minimum) | AA | Confirmed contrast failures from explicit colors |

**`evaluateXlsxConformance` fires on:** 1.1.1 (alt text), 2.4.2 (document title), 1.3.1 (**defined** table objects with `headerRowCount` 0 only — never the data-region heuristic), 1.4.3 (confirmed contrast). 3.1.1 appears in `notAssessed` with the Excel-stores-no-language reason.

**Two deliberate conservatisms:**

1. **Missing slide titles are scoring-only in v1** (heavily weighted via `slide_titles`, surfaced prominently in findings). The per-slide-title → WCAG SC mapping is contestable, and the gate's credibility rests on uncontestable mappings.
2. **Merged cells are advisory-only** (scoring findings, not gate failures) — real-world false-positive risk is too high for a binary verdict.

Each gate's `notAssessed` list is honest about what isn't machine-verified (e.g. 1.3.2 reading order beyond the title-first check for PPTX; media alternatives when media is present).

## Frontend (`apps/web`)

- Extend the `fileType` union at the six mirror sites mapped from the DOCX wiring: `composables/useReportExport.ts:37`, `utils/reportBanner.ts:15` (label map gains `pptx` → "PowerPoint", `xlsx` → "Excel"; meta line says "N slides" / "N sheets"), `ScoreCard.vue:259`, `SourceDocumentNotice.vue:8`, `MethodologyCard.vue:7`, `ReportFileBanner.vue:53`, plus `ReportContent.vue:594` (already `string`).
- `DropZone.vue`: accept string, extension allowlist, and noun copy branch on the two new flags (`config.public.pptxEnabled` / `xlsxEnabled`, added in `nuxt.config.ts` `runtimeConfig.public`).
- Per-format copy in `SourceDocumentNotice` / `MethodologyCard` / `ScoreCard`: PowerPoint/Excel fix paths (their built-in Accessibility Checker, alt-text dialogs, Repeat-Header-Rows equivalents), mirroring the Word treatment.
- **Fix a latent bug en route:** `index.vue:278` shows the remediation pipeline when `result?.fileType !== 'docx'` — must become `=== 'pdf'`, or PPTX/XLSX results would offer PDF auto-remediation.
- Hero / SEO description / keywords / feature bullets in `nuxt.config.ts`, plus a new `ANNOUNCEMENTS` entry in `audit.config.ts`.
- `technical-details.vue` pipeline prose gains the two formats, and the audit-flow diagram's PDF/Word branch becomes PDF/Word/PowerPoint/Excel — regenerate via `scripts/generate-diagrams.mjs` (`INLINE_SOURCES` map; launches system Chrome).
- Scoring-rubric modal (`layouts/default.vue`) gains the per-format category differences.

## CLI (`apps/cli`)

`commands/audit.ts`: extend the extension allowlist (lines ~168–172) and help text; the `fileType` display is already generic and `analyzeDocument` handles detection. `publist.ts` is PDF-only by domain and unchanged.

## Security

- `readCapped` guards every part read, including detection (already true in `detectFileType`).
- Element caps (slides/shapes/sheets/cells) reject over-cap files before extraction passes run.
- Same shared analysis semaphore + wall-clock timeout as PDF/DOCX.
- fast-xml-parser posture (XXE, billion-laughs, prototype pollution, deep nesting) was source-verified for the installed version during the DOCX audit and carries over; rels lookups are read-only (no zip-slip surface — nothing is written to disk).
- **A red/blue audit phase precedes release** (project custom, three parallel red-team passes): decompression-bomb variants targeting the new parts, element-flood documents, malformed rels/content-types, hostile alt-text/link strings through every render/export sink.

## Testing & calibration

- **Unit:** `pptxService.test.ts` / `xlsxService.test.ts` with programmatic minimal OOXML zips per behavior (docx-suite style); scorer tests per category; conformance tests with fire *and* not-fire cases per gate row.
- **Integration:** committed fixture pairs — `accessible.pptx` / `inaccessible.pptx`, `accessible.xlsx` / `inaccessible.xlsx`. Acceptance targets (the DOCX precedent): accessible ≥ 90 / A-range and gate-clean; inaccessible ≤ ~30 / F with the expected gate findings. Weights are tuned until these hold.
- **Web:** component tests for every new `fileType` branch (DropZone accept, notices, methodology, banner labels).
- **CLI:** extension-acceptance test.
- `pnpm build` (tsc + nuxt) green before every push, per project rule.

## Release (v1.33.0)

Internal sequence: (1) `ooxml.ts` extraction — DOCX suites pass unchanged; (2) PPTX end-to-end (extractor → scorer → gate → routes → frontend); (3) XLSX end-to-end; (4) CLI + docs + diagram + SEO; (5) red/blue audit and fixes; (6) full release checklist (CHANGELOG, three package.json bumps, README badges/counts/§Security, data-retention.vue §10, `dateModified`, tag) and the manual droplet deploy.

## Out of scope

- Auto-remediation for any OOXML format (PDF-only, unchanged).
- Speaker notes, comments, and embedded-object deep inspection (v1 audits slide/sheet surfaces).
- PPTX audio/video caption *verification* (presence of media yields an advisory + notAssessed 1.2.x entry).
- `publist` ingestion of non-PDF URLs.
- Legacy binary formats (`.ppt`, `.xls`) — remain unsupported file types.

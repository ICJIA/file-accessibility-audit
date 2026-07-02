# PPTX + XLSX Accessibility Checkers — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit PowerPoint (`.pptx`) and Excel (`.xlsx`) files as first-class peers of PDF and Word, shipping both in one release (v1.33.0).

**Architecture:** Extract the format-agnostic OOXML machinery out of `docxService.ts` into a shared `services/ooxml.ts` (behavior-preserving, pinned by the existing DOCX suites), then build two thin per-format extractors + scorers + conformance gates on top of it, dispatched from the existing `analyzeDocument` content-sniffing seam. Frontend/CLI extend the existing `fileType` union at mapped touchpoints.

**Tech Stack:** TypeScript (tsx runtime, `tsc --noEmit` build gate), Express, jszip + fast-xml-parser (already installed — no new dependencies), Vitest, Nuxt 4 / Nuxt UI 4 frontend.

**Spec:** `docs/superpowers/specs/2026-07-02-pptx-xlsx-checkers-design.md` (approved 2026-07-02). The spec is the requirements authority; this plan decomposes it.

## Global Constraints

- **PDF pipeline: frozen.** No file under `services/` that is PDF-specific may change.
- **DOCX pipeline: behaviorally frozen.** `docxService.test.ts`, `docxScorer.test.ts`, `docxConformance.test.ts`, `docxIntegration.test.ts` must pass **unchanged** (no edits to those files in Phase 1; Phases 2–5 don't touch docx code).
- **No new dependencies** in any package.json.
- **Feature flags default ON:** `PPTX.ENABLED = process.env.PPTX_ENABLED !== "false"`, `XLSX.ENABLED = process.env.XLSX_ENABLED !== "false"`.
- **Conformance gates fire only on confirmed machine-checkable violations** (see spec §Conformance gates for the exact SC tables). Missing slide titles: scoring-only. Merged cells: advisory-only.
- **TDD throughout:** every task writes the failing test first, watches it fail, implements minimally, watches it pass, commits.
- **Commit style:** conventional commits (`feat:`, `test:`, `refactor:`, `docs:`). **Never add a Co-Authored-By or any AI-attribution trailer.**
- **Build gate:** `pnpm build` (repo root) green before every push; full `npx vitest run` green in both `apps/api` and `apps/web` at every phase boundary.
- Config lives in `audit.config.ts` with the SAFE TO CHANGE comment convention; API imports it via `#config`.

## Phases

Execute strictly in order; each phase ends with the full test suite + build green and is independently shippable.

| Phase | Plan file | Delivers |
|---|---|---|
| 1 | `2026-07-02-pptx-xlsx-phase-1-ooxml-core.md` | `services/ooxml.ts` extracted from docxService; docx suites pass unchanged |
| 2 | `2026-07-02-pptx-xlsx-phase-2-pptx.md` | `.pptx` audit end-to-end at the API + CLI extension allowlist (extractor, scorer, gate, dispatch, routes, fixtures) |
| 3 | `2026-07-02-pptx-xlsx-phase-3-xlsx.md` | `.xlsx` audit end-to-end at the API + CLI extension allowlist (same shape) |
| 4 | `2026-07-02-pptx-xlsx-phase-4-frontend.md` | DropZone/report UI/exports/SEO/docs for both formats; the `!== 'docx'` remediation-guard fix |
| 5 | `2026-07-02-pptx-xlsx-phase-5-audit-release.md` | Red/blue security audit + fixes; v1.33.0 release checklist |

## Cross-phase interface contracts

Later phases code against these exact names. A phase implementer sees only their own plan — this section is the source of truth for neighboring names and types.

### Phase 1 produces: `apps/api/src/services/ooxml.ts`

```ts
export type PONode = Record<string, unknown>;
export function parseXml(xml: string | null): PONode[];
export function tagOf(node: PONode): string | null;
export function childrenOf(node: PONode): PONode[];
export function attrOf(node: PONode, name: string): string | undefined;
export function firstChild(node: PONode, tag: string): PONode | undefined;
export function descendants(node: PONode, tag: string): PONode[];
export function rawText(node: PONode): string;
export function textOf(node: PONode): string; // "t" local-name text: w:t (Word), a:t (DrawingML), t (sharedStrings)
export function rootElement(nodes: PONode[], tag: string): PONode | undefined;
/** Generic OPC .rels parser: Relationship Id -> Target. */
export function parseRelationships(relsXml: string | null): Map<string, string>;
/** docProps/core.xml text property (title, creator, language, ...). */
export function corePropertyText(coreRoot: PONode | undefined, tag: string): string | null;
/** descr/title/decorative off a docPr/cNvPr-family properties node. */
export function drawingAltText(propsNode: PONode): { altText: string | null; decorative: boolean };
export const MANUAL_BULLET_RE: RegExp;
export const CONTRAST_MIN_NORMAL: 4.5;
export const CONTRAST_MIN_LARGE: 3.0;
export function normalizeHex(hex: string | undefined | null): string | null;
export function hexToRgb(hex: string): [number, number, number];
export function relLuminance(rgb: [number, number, number]): number;
export function contrastRatio(fg: string, bg: string): number;
/** Zip-bomb-guarded part read; throws makeError(message) on cap/read failure. */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
  makeError: (message: string) => Error,
): Promise<string>;
```

`docxService.ts` keeps its public surface **unchanged** (`DocxMetadata`, `DocxAnalysis`, `DocxParseError`, `readCapped(f, cap, partName)` re-exported as a thin wrapper that passes `(m) => new DocxParseError(m)`, `analyzeDocx`). `analyzer.ts` continues importing `readCapped` from `docxService.js`.

NOT in Phase 1 (new code, added where first needed): Phase 2 adds two more `ooxml.ts` exports with their own tests — `resolveSchemeColor(themeRoot, name)` (theme palette lookup, used by PPTX contrast) and `parseRelationshipEntries(relsXml): Array<{ id, target, type }>` (rels with the `Type` attr preserved, used by PPTX media detection and Phase 3's table/drawing rels). The Word-specific size thresholds `LARGE_HALF_PT`/`LARGE_BOLD_HALF_PT` stay in docxService (PPTX uses hundredths-of-a-point, XLSX uses points).

### Phase 2 produces (consumed by Phases 4–5)

```ts
// services/pptxService.ts
export interface PptxMetadata {
  title: string | null;
  creator: string | null;
  language: string | null; // presentation defaultTextStyle / slide-master a:defRPr lang
  slideCount: number;
}
export interface PptxAnalysis {
  metadata: PptxMetadata;
  slides: Array<{
    index: number;              // 1-based, presentation order
    title: string | null;       // trimmed text of the title/ctrTitle placeholder; null if absent or empty
    titleIsFirstShape: boolean; // title placeholder is the first content-bearing shape in p:spTree
    shapeCount: number;
  }>;
  images: Array<{ altText: string | null; decorative: boolean }>;
  tables: Array<{ hasHeaderRow: boolean; rowCount: number; colCount: number }>;
  links: Array<{ text: string; url: string | null }>;
  lists: { realListItems: number; manualBulletParagraphs: number };
  contrast: {
    checkedRuns: number;
    unresolvedRuns: number;
    failing: Array<{ text: string; ratio: number; foreground: string; background: string; large: boolean }>;
  };
  hasMedia: boolean;   // audio/video relationship present anywhere
  shapeCount: number;  // total across slides (cap enforcement)
}
export class PptxParseError extends Error { code: "PPTX_PARSE_FAILED" }
export function analyzePptx(buffer: Buffer): Promise<PptxAnalysis>;

// services/scorer.ts
export function scorePptx(analysis: PptxAnalysis): ScoringResult; // same return shape as scoreDocx

// services/scoring/conformance.ts
export function evaluatePptxConformance(analysis: PptxAnalysis): ConformanceVerdict;

// services/analyzer.ts — union + dispatch extended
export type DetectedFileType = "pdf" | "docx" | "pptx" | "xlsx"; // Phase 2 adds "pptx", Phase 3 adds "xlsx"
// FileTypeError codes gain "PPTX_DISABLED" (Phase 2) and "XLSX_DISABLED" (Phase 3)
// AnalysisResult (pdfAnalyzer.ts) gains optional pptxMetadata?: PptxMetadata (Phase 2), xlsxMetadata?: XlsxMetadata (Phase 3)
// pageCount = slideCount for pptx, sheetCount for xlsx
```

New category IDs Phase 2 introduces: `slide_titles` (plus `reading_order` active for pptx). New config block `PPTX` in `audit.config.ts`: `ENABLED`, `MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"`, `MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024`, `MAX_SLIDES = 2_000`, `MAX_SHAPES = 100_000`, `ANALYSIS_TIMEOUT_MS = 20_000`, `SCORING_WEIGHTS` (spec values). New category IDs must be added to the shared WCAG category map the same way docx's `list_structure` was (see how `packages/shared` maps it — follow that pattern exactly).

### Phase 3 produces (consumed by Phases 4–5)

```ts
// services/xlsxService.ts
export interface XlsxMetadata {
  title: string | null;
  creator: string | null;
  sheetCount: number; // all sheets, visible + hidden
}
export interface XlsxAnalysis {
  metadata: XlsxMetadata;
  sheets: Array<{
    name: string;
    hidden: boolean;
    defaultNamed: boolean;      // matches /^sheet ?\d+$/i
    mergedRangeCount: number;
    usedRangeCellCount: number; // rows × cols of the dimension ref; 0 for empty sheets
    hasDefinedTable: boolean;
  }>;
  tables: Array<{ sheetName: string; name: string; hasHeaderRow: boolean }>;
  images: Array<{ altText: string | null; decorative: boolean }>;
  links: Array<{ text: string; url: string | null }>;
  contrast: {
    checkedRuns: number;
    unresolvedRuns: number;
    failing: Array<{ text: string; ratio: number; foreground: string; background: string; large: boolean }>;
  };
}
export class XlsxParseError extends Error { code: "XLSX_PARSE_FAILED" }
export function analyzeXlsx(buffer: Buffer): Promise<XlsxAnalysis>;

// services/scorer.ts
export function scoreXlsx(analysis: XlsxAnalysis): ScoringResult;

// services/scoring/conformance.ts
export function evaluateXlsxConformance(analysis: XlsxAnalysis): ConformanceVerdict;
```

New category ID Phase 3 introduces: `sheet_names`. New config block `XLSX`: `ENABLED`, `MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`, `MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024`, `MAX_SHEETS = 200`, `MAX_CELLS = 1_000_000`, `ANALYSIS_TIMEOUT_MS = 20_000`, `SCORING_WEIGHTS` (spec values). `title_language` for xlsx scores on title only (language honestly not-assessed — see spec).

### Phase 4 consumes

The `fileType` union mirror sites (extend each to the 4-value union): `apps/web/app/composables/useReportExport.ts:37`, `apps/web/app/utils/reportBanner.ts:15` (labels: pptx → "PowerPoint", xlsx → "Excel"; meta line "N slides"/"N sheets"), `ScoreCard.vue:259`, `SourceDocumentNotice.vue:8`, `MethodologyCard.vue:7`, `ReportFileBanner.vue:53`. Flags surface as `runtimeConfig.public.pptxEnabled` / `xlsxEnabled` in `apps/web/nuxt.config.ts` from `PPTX.ENABLED`/`XLSX.ENABLED`. The remediation-pipeline guard in `apps/web/app/pages/index.vue` (currently `result?.fileType !== 'docx'`, ~line 278) becomes `result?.fileType === 'pdf'`. (The CLI extension allowlist in `apps/cli/src/commands/audit.ts` ~lines 168–172 is extended per-format inside Phases 2 and 3, so each format is CLI-testable end-to-end within its own phase.)

## Phase gates (run at the end of every phase)

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build                      # tsc --noEmit (api) + nuxt build (web) — must be green
cd apps/api && npx vitest run   # all API tests green
cd ../web  && npx vitest run    # all web tests green
```

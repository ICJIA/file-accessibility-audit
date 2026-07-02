# Phase 3: Excel (.xlsx) Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit `.xlsx` uploads/URLs end-to-end at the API + CLI: extractor → scorer → conformance gate → dispatch → routes → fixtures.

**Architecture:** `xlsxService.ts` (SpreadsheetML extractor on `ooxml.ts`) produces `XlsxAnalysis`; `scoreXlsx` / `evaluateXlsxConformance` mirror the docx/pptx pairs; `analyzer.ts` gains the `"xlsx"` branch (the union member and `XLSX_DISABLED` error code already exist from Phase 2 — this phase adds their behavior).

**Prerequisites:** Phases 1–2 merged and green. Where this plan touches lines Phase 2 touched (analyzer dispatch, route catch blocks, multer filter, CLI gate), the edits below are written against the **post-Phase-2** state.

## Global Constraints

Master plan Global Constraints apply (frozen PDF/DOCX, TDD, no new deps, conventional commits without AI trailers, phase-gate green).

**Phase-wide v1 boundaries (state in code comments where noted):**
- Contrast is evaluated on `xl/styles.xml` cell formats (font color × solid fill), not on resolved cell values — failing entries are labeled "cell style #N". Colors referenced by `theme`/`indexed` attributes count as unresolved; only literal `rgb` attributes resolve.
- Hyperlink text uses the `display` attribute; when absent the text is `""` (cell values are not resolved). Formula-based `HYPERLINK()` links are not detected.
- The "data region without a defined table" signal is an advisory (one workbook-level finding), never a gate item.

---

### Task 1: `XLSX` config block + WCAG map entry for `sheet_names`

**Files:**
- Modify: `audit.config.ts` (after the `PPTX` block), `packages/shared/src/scoring.ts` (after the `slide_titles` entry)
- Test: `apps/api/src/__tests__/xlsxScorer.test.ts` (created here, grows in Task 5)

- [ ] **Step 1: Write the failing test** — create `xlsxScorer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { XLSX, WCAG_CATEGORY_MAP } from '#config'

describe('XLSX config', () => {
  it('is enabled by default with the spec caps and weights', () => {
    expect(XLSX.ENABLED).toBe(true)
    expect(XLSX.MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(XLSX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024)
    expect(XLSX.MAX_SHEETS).toBe(200)
    expect(XLSX.MAX_CELLS).toBe(1_000_000)
    expect(XLSX.ANALYSIS_TIMEOUT_MS).toBe(20_000)
    const w = XLSX.SCORING_WEIGHTS
    expect(w.text_extractability).toBe(0.05)
    expect(w.title_language).toBe(0.12)
    expect(w.sheet_names).toBe(0.18)
    expect(w.table_markup).toBe(0.25)
    expect(w.alt_text).toBe(0.18)
    expect(w.color_contrast).toBe(0.12)
    expect(w.link_quality).toBe(0.1)
  })

  it('sheet_names is registered in the WCAG category map', () => {
    expect(WCAG_CATEGORY_MAP.sheet_names).toEqual([
      { sc: '2.4.6', name: 'Headings and Labels', level: 'AA' },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run src/__tests__/xlsxScorer.test.ts`. Expected: FAIL — no `XLSX` export.
- [ ] **Step 3: Implement.** In `audit.config.ts` after the `PPTX` block (mirror its comment style, SAFE TO CHANGE notes, and the DOCX budget-math note on `MAX_UNCOMPRESSED_BYTES`):

```ts
// ---------------------------------------------------------------------------
// XLSX (EXCEL) ANALYSIS
// ---------------------------------------------------------------------------

export const XLSX = {
  /** Feature flag — set XLSX_ENABLED=false to reject .xlsx and hide it in the
   *  web UI (runtimeConfig.public.xlsxEnabled). SAFE TO CHANGE: via env var. */
  ENABLED: process.env.XLSX_ENABLED !== "false",

  /** Canonical MIME type for .xlsx (SpreadsheetML). */
  MIME_TYPE:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  /** Max UNCOMPRESSED bytes per ZIP part (zip-bomb guard) — same rationale as
   *  DOCX.MAX_UNCOMPRESSED_BYTES. SAFE TO CHANGE. */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /** Max worksheets analyzed; over the cap → rejected. SAFE TO CHANGE. */
  MAX_SHEETS: 200,

  /** Max total used-range cells (worksheet XML is the volume driver — this is
   *  the MAX_PARAGRAPHS analogue). Over the cap → rejected. SAFE TO CHANGE. */
  MAX_CELLS: 1_000_000,

  /** Wall-clock timeout (ms) per analysis; route maps timeout → 504.
   *  SAFE TO CHANGE. */
  ANALYSIS_TIMEOUT_MS: 20_000,

  /**
   * XLSX category weights. Excel maps onto the shared category IDs, except:
   *   - sheet_names is Excel-specific (no default "Sheet1" names);
   *   - title_language scores on the title alone (Excel stores no document
   *     language — the gate lists 3.1.1 as not assessed);
   *   - table_markup carries the most weight: data as real table objects with
   *     header rows is THE Excel accessibility fundamental;
   *   - heading_structure / reading_order / list_structure / bookmarks are
   *     omitted; form_accessibility is a not-assessed placeholder.
   * SAFE TO CHANGE: same rules as DOCX.SCORING_WEIGHTS.
   */
  SCORING_WEIGHTS: {
    text_extractability: 0.05,
    title_language: 0.12,
    sheet_names: 0.18,
    table_markup: 0.25,
    alt_text: 0.18,
    color_contrast: 0.12,
    link_quality: 0.1,
  },
} as const;
```

In `packages/shared/src/scoring.ts` after `slide_titles`:

```ts
  sheet_names: [{ sc: "2.4.6", name: "Headings and Labels", level: "AA" }],
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** — `git add -A && git commit -m "feat(config): XLSX analysis config block + sheet_names WCAG mapping"`

---

### Task 2: `minimalXlsx` helper + xlsxService core (workbook, sheets, dimension, merges, caps)

**Files:**
- Create: `apps/api/src/__tests__/helpers/minimalXlsx.ts`, `apps/api/src/services/xlsxService.ts`
- Test: `apps/api/src/__tests__/xlsxService.test.ts`

**Interfaces:**
- Produces: `XlsxMetadata`, `XlsxAnalysis`, `XlsxParseError`, `analyzeXlsx(buffer)` (master contract); `buildXlsx(opts)` fixture builder.

- [ ] **Step 1: Write the fixture helper** — create `helpers/minimalXlsx.ts`:

```ts
/** Builds real minimal .xlsx bytes with jszip for tests — mirrors minimalDocx/minimalPptx. */
import JSZip from "jszip";

export interface SheetOpts {
  name: string;
  hidden?: boolean;
  /** dimension ref, e.g. "A1:D20"; omit for an empty sheet (no dimension). */
  dimensionRef?: string;
  /** Number of <mergeCell> entries. */
  mergeCount?: number;
  /** Hyperlinks: display may be omitted to exercise the ""-text path. */
  hyperlinks?: Array<{ id: string; target: string; display?: string }>;
  /** Defined tables attached to this sheet. headerRowCount: undefined = attr absent (header ON). */
  tables?: Array<{ name: string; headerRowCount?: 0 | 1 }>;
  /** Drawing objects on this sheet. */
  drawings?: Array<{ kind: "pic" | "chart"; descr?: string; decorative?: boolean }>;
}

export interface BuildXlsxOpts {
  sheets: SheetOpts[];
  coreXml?: string; // default carries a dc:title + dc:creator
  /** cellXfs entries: font color/size/bold × solid-fill color (both ARGB or 6-hex). */
  styles?: Array<{ fontRgb?: string; fontTheme?: boolean; sz?: number; bold?: boolean; fillRgb?: string }>;
}

const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export async function buildXlsx(opts: BuildXlsxOpts): Promise<Buffer> {
  const zip = new JSZip();
  let tableIdx = 0;
  let drawingIdx = 0;
  const overrides: string[] = [];

  zip.file(
    "docProps/core.xml",
    opts.coreXml ??
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Grant Ledger</dc:title><dc:creator>ICJIA</dc:creator></cp:coreProperties>`,
  );

  const sheetEls = opts.sheets
    .map(
      (s, i) =>
        `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? ' state="hidden"' : ""}/>`,
    )
    .join("");
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${R}><sheets>${sheetEls}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${opts.sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );

  // styles.xml — index 0 font/fill are the Excel defaults; test styles follow.
  const styles = opts.styles ?? [];
  const fonts = [`<font><sz val="11"/><name val="Calibri"/></font>`]
    .concat(
      styles.map((st) => {
        const color = st.fontTheme
          ? `<color theme="1"/>`
          : st.fontRgb
            ? `<color rgb="${st.fontRgb}"/>`
            : "";
        return `<font><sz val="${st.sz ?? 11}"/>${st.bold ? "<b/>" : ""}${color}</font>`;
      }),
    )
    .join("");
  const fills = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`]
    .concat(
      styles.map((st) =>
        st.fillRgb
          ? `<fill><patternFill patternType="solid"><fgColor rgb="${st.fillRgb}"/></patternFill></fill>`
          : `<fill><patternFill patternType="none"/></fill>`,
      ),
    )
    .join("");
  const xfs = [`<xf fontId="0" fillId="0"/>`]
    .concat(styles.map((_, i) => `<xf fontId="${i + 1}" fillId="${i + 2}"/>`))
    .join("");
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts>${fonts}</fonts><fills>${fills}</fills><cellXfs>${xfs}</cellXfs></styleSheet>`,
  );

  opts.sheets.forEach((s, i) => {
    const rels: string[] = [];
    const dim = s.dimensionRef ? `<dimension ref="${s.dimensionRef}"/>` : "";
    const merges = s.mergeCount
      ? `<mergeCells count="${s.mergeCount}">${Array.from(
          { length: s.mergeCount },
          (_, m) => `<mergeCell ref="A${m + 1}:B${m + 1}"/>`,
        ).join("")}</mergeCells>`
      : "";
    const links = s.hyperlinks?.length
      ? `<hyperlinks>${s.hyperlinks
          .map(
            (h) =>
              `<hyperlink ref="A1" r:id="${h.id}"${h.display !== undefined ? ` display="${h.display}"` : ""}/>`,
          )
          .join("")}</hyperlinks>`
      : "";
    s.hyperlinks?.forEach((h) =>
      rels.push(
        `<Relationship Id="${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${h.target}" TargetMode="External"/>`,
      ),
    );
    s.tables?.forEach((t) => {
      tableIdx++;
      const hdr = t.headerRowCount === undefined ? "" : ` headerRowCount="${t.headerRowCount}"`;
      zip.file(
        `xl/tables/table${tableIdx}.xml`,
        `<?xml version="1.0"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableIdx}" name="${t.name}" displayName="${t.name}" ref="A1:C4"${hdr}/>`,
      );
      overrides.push(
        `<Override PartName="/xl/tables/table${tableIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
      );
      rels.push(
        `<Relationship Id="rIdT${tableIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tableIdx}.xml"/>`,
      );
    });
    if (s.drawings?.length) {
      drawingIdx++;
      const parts = s.drawings
        .map((d, di) => {
          const descr = d.descr !== undefined ? ` descr="${d.descr}"` : "";
          const dec = d.decorative
            ? `<a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:ext uri="{X}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>`
            : "";
          const cNvPr = `<xdr:cNvPr id="${di + 2}" name="obj"${descr}>${dec}</xdr:cNvPr>`;
          return d.kind === "pic"
            ? `<xdr:oneCellAnchor><xdr:pic><xdr:nvPicPr>${cNvPr}<xdr:cNvPicPr/></xdr:nvPicPr></xdr:pic></xdr:oneCellAnchor>`
            : `<xdr:oneCellAnchor><xdr:graphicFrame><xdr:nvGraphicFramePr>${cNvPr}<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr></xdr:graphicFrame></xdr:oneCellAnchor>`;
        })
        .join("");
      zip.file(
        `xl/drawings/drawing${drawingIdx}.xml`,
        `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">${parts}</xdr:wsDr>`,
      );
      rels.push(
        `<Relationship Id="rIdD${drawingIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIdx}.xml"/>`,
      );
    }
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${R}>${dim}<sheetData/>${merges}${links}</worksheet>`,
    );
    if (rels.length) {
      zip.file(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
      );
    }
  });

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${opts.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  ${overrides.join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
```

- [ ] **Step 2: Write the failing extractor tests** — create `xlsxService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildXlsx } from './helpers/minimalXlsx.js'
import { analyzeXlsx, XlsxParseError } from '../services/xlsxService.js'

describe('xlsxService: workbook + sheets', () => {
  it('reads core metadata, sheet names, hidden state, default-name flags', async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: 'Sheet1', dimensionRef: 'A1:D20' },
        { name: 'FY26 Grants', dimensionRef: 'A1:B2' },
        { name: 'Sheet 3', hidden: true },
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.metadata.title).toBe('Grant Ledger')
    expect(a.metadata.sheetCount).toBe(3)
    expect(a.sheets.map((s) => s.defaultNamed)).toEqual([true, false, true])
    expect(a.sheets.map((s) => s.hidden)).toEqual([false, false, true])
  })

  it('computes used-range cell counts from the dimension ref', async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: 'A', dimensionRef: 'A1:D20' }, // 4 × 20 = 80
        { name: 'B', dimensionRef: 'A1' },     // 1
        { name: 'C' },                          // no dimension → 0
        { name: 'D', dimensionRef: 'AA10:AB11' }, // 2 × 2 = 4 (base-26 columns)
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.sheets.map((s) => s.usedRangeCellCount)).toEqual([80, 1, 0, 4])
  })

  it('counts merged ranges per sheet', async () => {
    const buf = await buildXlsx({ sheets: [{ name: 'M', dimensionRef: 'A1:B4', mergeCount: 3 }] })
    expect((await analyzeXlsx(buf)).sheets[0].mergedRangeCount).toBe(3)
  })

  it('rejects non-xlsx input', async () => {
    await expect(analyzeXlsx(Buffer.from('nope'))).rejects.toBeInstanceOf(XlsxParseError)
  })
})
```

- [ ] **Step 3: Run to verify failure** — cannot resolve `../services/xlsxService.js`.
- [ ] **Step 4: Implement** — create `services/xlsxService.ts`:

```ts
/**
 * XLSX (OOXML / SpreadsheetML) accessibility extractor on the shared
 * services/ooxml.ts core; output XlsxAnalysis feeds scoreXlsx().
 *
 * v1 boundaries (see the Phase 3 plan): contrast reads xl/styles.xml cell
 * formats (labeled "cell style #N"), not resolved cell values; hyperlink text
 * is the `display` attribute or ""; theme/indexed colors are unresolved.
 */
import JSZip from "jszip";
import { XLSX } from "#config";
import {
  type PONode,
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  rootElement,
  parseRelationshipEntries,
  corePropertyText,
  drawingAltText,
  CONTRAST_MIN_NORMAL,
  CONTRAST_MIN_LARGE,
  normalizeHex,
  contrastRatio,
  readCapped,
} from "./ooxml.js";

export interface XlsxMetadata {
  title: string | null;
  creator: string | null;
  sheetCount: number;
}

export interface XlsxAnalysis {
  metadata: XlsxMetadata;
  sheets: Array<{
    name: string;
    hidden: boolean;
    defaultNamed: boolean;
    mergedRangeCount: number;
    usedRangeCellCount: number;
    hasDefinedTable: boolean;
  }>;
  tables: Array<{ sheetName: string; name: string; hasHeaderRow: boolean }>;
  images: Array<{ altText: string | null; decorative: boolean }>;
  links: Array<{ text: string; url: string | null }>;
  contrast: {
    checkedRuns: number;
    unresolvedRuns: number;
    failing: Array<{
      text: string;
      ratio: number;
      foreground: string;
      background: string;
      large: boolean;
    }>;
  };
}

export class XlsxParseError extends Error {
  code = "XLSX_PARSE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "XlsxParseError";
  }
}

const DEFAULT_SHEET_NAME_RE = /^sheet ?\d+$/i;

/** "AA" → 27. Base-26 spreadsheet column letters. */
function colToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Cells in a dimension ref: "A1:D20" → 80, "A1" → 1, malformed → 0. */
export function cellCountOfRef(ref: string | undefined): number {
  if (!ref) return 0;
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref.trim().toUpperCase());
  if (!m) return 0;
  if (!m[3]) return 1;
  const cols = Math.abs(colToNumber(m[3]) - colToNumber(m[1])) + 1;
  const rows = Math.abs(Number(m[4]) - Number(m[2])) + 1;
  return cols * rows;
}

/** Resolve a rels Target ("worksheets/sheet1.xml", "../tables/table1.xml",
 *  "/xl/…") against the xl/ package root. Lookup only — never a filesystem path. */
function resolveXlTarget(target: string, baseDir: string): string {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("../")) return `xl/${target.slice(3)}`;
  return `${baseDir}/${target.replace(/^\.\//, "")}`;
}

export async function analyzeXlsx(buffer: Buffer): Promise<XlsxAnalysis> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new XlsxParseError("The file is not a readable ZIP/XLSX package.");
  }
  const read = (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f
      ? readCapped(f, XLSX.MAX_UNCOMPRESSED_BYTES, p, (m) => new XlsxParseError(m))
      : Promise.resolve(null);
  };

  const workbookXml = await read("xl/workbook.xml");
  if (workbookXml === null) {
    throw new XlsxParseError(
      "xl/workbook.xml is missing — the package is not an Excel workbook.",
    );
  }
  const workbookRoot = rootElement(parseXml(workbookXml), "workbook");
  const coreRoot = rootElement(parseXml(await read("docProps/core.xml")), "coreProperties");
  const workbookRels = parseRelationshipEntries(await read("xl/_rels/workbook.xml.rels"));

  const sheetEls = workbookRoot ? descendants(workbookRoot, "sheet") : [];
  if (sheetEls.length > XLSX.MAX_SHEETS) {
    throw new XlsxParseError(
      `This workbook has too many sheets (${sheetEls.length.toLocaleString()}) to analyze.`,
    );
  }

  const analysis: XlsxAnalysis = {
    metadata: {
      title: corePropertyText(coreRoot, "title"),
      creator: corePropertyText(coreRoot, "creator"),
      sheetCount: sheetEls.length,
    },
    sheets: [],
    tables: [],
    images: [],
    links: [],
    contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
  };

  let totalCells = 0;
  for (const sheetEl of sheetEls) {
    const name = attrOf(sheetEl, "name") ?? "";
    const state = attrOf(sheetEl, "state");
    const rid = attrOf(sheetEl, "id"); // r:id — removeNSPrefix strips the prefix
    const rel = workbookRels.find((r) => r.id === rid);
    const sheetPath = rel ? resolveXlTarget(rel.target, "xl") : null;
    const sheetXml = sheetPath ? await read(sheetPath) : null;
    const sheetRoot = rootElement(parseXml(sheetXml), "worksheet");

    const dimension = sheetRoot ? descendants(sheetRoot, "dimension")[0] : undefined;
    const cellCount = cellCountOfRef(dimension ? attrOf(dimension, "ref") : undefined);
    totalCells += cellCount;
    if (totalCells > XLSX.MAX_CELLS) {
      throw new XlsxParseError(
        `This workbook has too many cells (${totalCells.toLocaleString()}+) to analyze.`,
      );
    }
    const merged = sheetRoot ? descendants(sheetRoot, "mergeCell").length : 0;

    const sheetRelsPath = sheetPath
      ? sheetPath.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels")
      : null;
    const sheetRels = parseRelationshipEntries(sheetRelsPath ? await read(sheetRelsPath) : null);

    await collectSheetContent(analysis, name, sheetRoot, sheetRels, read);

    analysis.sheets.push({
      name,
      hidden: state === "hidden" || state === "veryHidden",
      defaultNamed: DEFAULT_SHEET_NAME_RE.test(name),
      mergedRangeCount: merged,
      usedRangeCellCount: cellCount,
      hasDefinedTable: sheetRels.some((r) => /\/table$/.test(r.type)),
    });
  }

  await collectStylesContrast(analysis, read);
  return analysis;
}
```

plus two stubs completed in Tasks 3–4:

```ts
async function collectSheetContent(
  _analysis: XlsxAnalysis,
  _sheetName: string,
  _sheetRoot: PONode | undefined,
  _sheetRels: Array<{ id: string; target: string; type: string }>,
  _read: (p: string) => Promise<string | null>,
): Promise<void> {
  // Filled in by the tables/drawings/links task.
}

async function collectStylesContrast(
  _analysis: XlsxAnalysis,
  _read: (p: string) => Promise<string | null>,
): Promise<void> {
  // Filled in by the contrast task.
}
```

- [ ] **Step 5: Run to verify pass**, then **Step 6: Commit** — `git add -A && git commit -m "feat(api): xlsx extractor core (workbook, sheets, dimension, merges, caps)"`

---

### Task 3: xlsxService content — tables, drawings, hyperlinks

**Files:** modify `xlsxService.ts` (fill `collectSheetContent`); append tests to `xlsxService.test.ts`.

- [ ] **Step 1: Write the failing tests** — append:

```ts
describe('xlsxService: tables, drawings, links', () => {
  it('reads defined tables: absent headerRowCount means header ON, 0 means OFF', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'Data', dimensionRef: 'A1:C4',
        tables: [{ name: 'GoodTable' }, { name: 'BadTable', headerRowCount: 0 }],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.tables).toEqual([
      { sheetName: 'Data', name: 'GoodTable', hasHeaderRow: true },
      { sheetName: 'Data', name: 'BadTable', hasHeaderRow: false },
    ])
    expect(a.sheets[0].hasDefinedTable).toBe(true)
  })

  it('reads picture and chart alt text from the drawing part', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'Viz', dimensionRef: 'A1:B2',
        drawings: [
          { kind: 'pic', descr: 'Staff photo' },
          { kind: 'chart' },
          { kind: 'pic', decorative: true },
        ],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.images).toEqual([
      { altText: 'Staff photo', decorative: false },
      { altText: null, decorative: false },
      { altText: null, decorative: true },
    ])
  })

  it('reads hyperlinks with display text, and "" when display is absent', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'L', dimensionRef: 'A1:B2',
        hyperlinks: [
          { id: 'rIdH1', target: 'https://example.gov/a', display: 'Annual report' },
          { id: 'rIdH2', target: 'https://example.gov/b' },
        ],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.links).toEqual([
      { text: 'Annual report', url: 'https://example.gov/a' },
      { text: '', url: 'https://example.gov/b' },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure** (stub yields empties). **Step 3: Implement** — replace `collectSheetContent`:

```ts
async function collectSheetContent(
  analysis: XlsxAnalysis,
  sheetName: string,
  sheetRoot: PONode | undefined,
  sheetRels: Array<{ id: string; target: string; type: string }>,
  read: (p: string) => Promise<string | null>,
): Promise<void> {
  // Defined tables (the gate's only table signal): headerRowCount attribute
  // ABSENT means 1 (header on, Excel's default); explicit "0" means off.
  for (const rel of sheetRels.filter((r) => /\/table$/.test(r.type))) {
    const tableRoot = rootElement(
      parseXml(await read(resolveXlTarget(rel.target, "xl/worksheets"))),
      "table",
    );
    if (!tableRoot) continue;
    analysis.tables.push({
      sheetName,
      name: attrOf(tableRoot, "displayName") ?? attrOf(tableRoot, "name") ?? "",
      hasHeaderRow: attrOf(tableRoot, "headerRowCount") !== "0",
    });
  }

  // Drawings: pictures + chart frames need alt text (shared DrawingML descr).
  for (const rel of sheetRels.filter((r) => /\/drawing$/.test(r.type))) {
    const drawingRoot = rootElement(
      parseXml(await read(resolveXlTarget(rel.target, "xl/worksheets"))),
      "wsDr",
    );
    if (!drawingRoot) continue;
    for (const obj of [...descendants(drawingRoot, "pic"), ...descendants(drawingRoot, "graphicFrame")]) {
      const cNvPr = descendants(obj, "cNvPr")[0];
      if (cNvPr) analysis.images.push(drawingAltText(cNvPr));
    }
  }

  // Hyperlinks: display attr or "" (cell text not resolved — v1 boundary).
  if (sheetRoot) {
    const relMap = new Map(sheetRels.map((r) => [r.id, r.target]));
    for (const link of descendants(sheetRoot, "hyperlink")) {
      const rid = attrOf(link, "id");
      analysis.links.push({
        text: (attrOf(link, "display") ?? "").trim(),
        url: rid && relMap.has(rid) ? relMap.get(rid)! : null,
      });
    }
  }
}
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** — `git commit -am "feat(api): xlsx tables, drawings alt text, hyperlinks"`

---

### Task 4: xlsxService contrast (styles.xml)

**Files:** modify `xlsxService.ts` (fill `collectStylesContrast`); append tests.

- [ ] **Step 1: Write the failing tests** — append:

```ts
describe('xlsxService: styles contrast', () => {
  it('fails a low-contrast font/fill pair and labels it by style index', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'S', dimensionRef: 'A1:B2' }],
      styles: [
        { fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }, // ≈1.35:1 → fail
        { fontRgb: 'FF000000', fillRgb: 'FFFFFFFF' }, // 21:1 → pass
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0]).toMatchObject({
      foreground: '#DDDDDD',
      background: '#FFFFFF',
      large: false,
    })
    expect(a.contrast.failing[0].text).toMatch(/cell style #\d+/)
  })

  it('large text uses the 3:1 threshold (18pt, or bold 14pt)', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'S', dimensionRef: 'A1:B2' }],
      styles: [
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 18 },            // ≈3.0:1 large → pass
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 14, bold: true }, // large-bold → pass
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 11 },            // normal → fail
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.failing).toHaveLength(1)
  })

  it('theme-indexed colors and non-solid fills count as unresolved', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'S', dimensionRef: 'A1:B2' }],
      styles: [{ fontTheme: true, fillRgb: 'FFFFFFFF' }, { fontRgb: 'FF000000' }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.unresolvedRuns).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** — replace `collectStylesContrast`:

```ts
/** ARGB "FFRRGGBB" or plain "RRGGBB" → normalized 6-hex, else null. */
function argbToHex(v: string | undefined): string | null {
  if (!v) return null;
  if (/^[0-9a-fA-F]{8}$/.test(v)) return normalizeHex(v.slice(2));
  return normalizeHex(v);
}

async function collectStylesContrast(
  analysis: XlsxAnalysis,
  read: (p: string) => Promise<string | null>,
): Promise<void> {
  const stylesRoot = rootElement(parseXml(await read("xl/styles.xml")), "styleSheet");
  if (!stylesRoot) return;
  const fontsEl = descendants(stylesRoot, "fonts")[0];
  const fillsEl = descendants(stylesRoot, "fills")[0];
  const xfsEl = descendants(stylesRoot, "cellXfs")[0];
  if (!fontsEl || !fillsEl || !xfsEl) return;
  const fonts = childrenOf(fontsEl).filter((c) => tagOf(c) === "font");
  const fills = childrenOf(fillsEl).filter((c) => tagOf(c) === "fill");
  const xfs = childrenOf(xfsEl).filter((c) => tagOf(c) === "xf");

  xfs.forEach((xf, idx) => {
    const font = fonts[Number(attrOf(xf, "fontId"))];
    const fill = fills[Number(attrOf(xf, "fillId"))];
    if (!font || !fill) return;
    const colorEl = firstChild(font, "color");
    if (!colorEl) return; // default ink — nothing explicit to check
    const fg = argbToHex(attrOf(colorEl, "rgb"));
    const pattern = firstChild(fill, "patternFill");
    const solid = pattern && attrOf(pattern, "patternType") === "solid";
    const fgColorEl = pattern ? firstChild(pattern, "fgColor") : undefined;
    const bg = solid && fgColorEl ? argbToHex(attrOf(fgColorEl, "rgb")) : null;
    if (!fg || !bg) {
      // theme=/indexed= colors and non-solid fills are unresolved in v1.
      analysis.contrast.unresolvedRuns++;
      return;
    }
    analysis.contrast.checkedRuns++;
    const szEl = firstChild(font, "sz");
    const sz = szEl ? Number(attrOf(szEl, "val")) : NaN;
    const bold = !!firstChild(font, "b");
    const large =
      (Number.isFinite(sz) && sz >= 18) || (bold && Number.isFinite(sz) && sz >= 14);
    const ratio = contrastRatio(fg, bg);
    const min = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
    if (ratio < min) {
      analysis.contrast.failing.push({
        text: `cell style #${idx}`,
        ratio: Math.round(ratio * 100) / 100,
        foreground: `#${fg}`,
        background: `#${bg}`,
        large,
      });
    }
  });
}
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** — `git commit -am "feat(api): xlsx styles.xml contrast checking"`

---

### Task 5: `scoreXlsx` + `XLSX_HELP`

**Files:** modify `scorer.ts` (after the pptx section); append tests to `xlsxScorer.test.ts`.

**Category rules (exact):**

| id | rule |
|---|---|
| `text_extractability` | Always 100 — cells are real text. |
| `title_language` | Title present → 100, else 0. Findings always include: language is not stored by Excel (the gate lists 3.1.1 not assessed); fix step "In Excel: File → Info → Properties → Title". |
| `sheet_names` | No visible sheets → null. Else 100 − 25 per default-named **visible** sheet (floor 0); findings name them ("Rename \"Sheet1\" to describe its contents — sheet names are the workbook's navigation."). Hidden sheets ignored. |
| `table_markup` | No defined tables AND no sheet with `usedRangeCellCount ≥ 12` → null. Else 100 − 30 per table with `hasHeaderRow: false` (floor 0); − 10 once workbook-wide if any sheet has data (≥ 12 cells) but `hasDefinedTable: false` (advisory-labeled finding); − 5 per sheet with `mergedRangeCount > 0` capped at −15 total (advisory-labeled findings with counts). |
| `alt_text` | No images → null. `nonDec = images.filter(i => !i.decorative)`; nonDec empty → 100; else `round(100 × (nonDec.length − missingAlt.length) / nonDec.length)`. |
| `color_contrast` | checkedRuns 0 → null ("No cell styles with explicit font and solid-fill colors were found; theme and indexed colors are not resolved."). failing 0 → 100. Else max(0, 100 − 20 × failing.length), worst pair quoted. |
| `link_quality` | No links → null. `bad = links.filter(l => !l.text \|\| /^(https?:\/\/|www\.)/i.test(l.text))`; score = round(100 × (len − bad) / len). |
| `form_accessibility` | Placeholder: null score, weight 0, `notAssessed: true` (Excel form controls not assessed). |

`XLSX_HELP` links (real Microsoft support URLs): overview `https://support.microsoft.com/en-us/office/make-your-excel-documents-accessible-to-people-with-disabilities-6cc05fc5-1314-48b5-8eb3-683e49b3e593`, alt text (same shared article as DOCX_HELP.altText), rename a sheet `https://support.microsoft.com/en-us/office/rename-a-worksheet-3f1f7148-ee83-404d-8ef0-9ff99fbad1f9`, tables `https://support.microsoft.com/en-us/office/create-and-format-tables-e81aa349-b006-4f8a-9806-5af9df0ac664`, WebAIM contrast checker (as `DOCX_HELP.contrast`).

- [ ] **Step 1: Write the failing tests** — append to `xlsxScorer.test.ts`:

```ts
import { scoreXlsx } from '../services/scorer.js'
import type { XlsxAnalysis } from '../services/xlsxService.js'

function baseAnalysis(over: Partial<XlsxAnalysis> = {}): XlsxAnalysis {
  return {
    metadata: { title: 'Ledger', creator: 'x', sheetCount: 1 },
    sheets: [{ name: 'FY26 Grants', hidden: false, defaultNamed: false, mergedRangeCount: 0, usedRangeCellCount: 80, hasDefinedTable: true }],
    tables: [{ sheetName: 'FY26 Grants', name: 'Grants', hasHeaderRow: true }],
    images: [], links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    ...over,
  }
}

describe('scoreXlsx', () => {
  it('scores a clean workbook high, in the shared result shape', () => {
    const r = scoreXlsx(baseAnalysis())
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.conformance.status).toBe('no-automated-failures')
    const ids = r.categories.map((c) => c.id)
    expect(ids).toContain('sheet_names')
    expect(ids).not.toContain('reading_order')
    expect(ids).not.toContain('heading_structure')
  })

  it('sheet_names penalizes default-named visible sheets only', () => {
    const r = scoreXlsx(baseAnalysis({
      sheets: [
        { name: 'Sheet1', hidden: false, defaultNamed: true, mergedRangeCount: 0, usedRangeCellCount: 80, hasDefinedTable: true },
        { name: 'Sheet2', hidden: true, defaultNamed: true, mergedRangeCount: 0, usedRangeCellCount: 0, hasDefinedTable: false },
      ],
    }))
    expect(r.categories.find((c) => c.id === 'sheet_names')!.score).toBe(75)
  })

  it('table_markup: headerless table −30, dataful-sheet-without-table −10, merges capped −15', () => {
    const r = scoreXlsx(baseAnalysis({
      sheets: [
        { name: 'A', hidden: false, defaultNamed: false, mergedRangeCount: 2, usedRangeCellCount: 100, hasDefinedTable: false },
        { name: 'B', hidden: false, defaultNamed: false, mergedRangeCount: 1, usedRangeCellCount: 50, hasDefinedTable: false },
        { name: 'C', hidden: false, defaultNamed: false, mergedRangeCount: 1, usedRangeCellCount: 40, hasDefinedTable: false },
        { name: 'D', hidden: false, defaultNamed: false, mergedRangeCount: 0, usedRangeCellCount: 30, hasDefinedTable: true },
      ],
      tables: [{ sheetName: 'D', name: 'T', hasHeaderRow: false }],
    }))
    // 100 − 30 (headerless) − 10 (data w/o table, once) − 15 (merges, capped) = 45
    expect(r.categories.find((c) => c.id === 'table_markup')!.score).toBe(45)
  })

  it('title_language scores on title alone and explains the language gap', () => {
    const r = scoreXlsx(baseAnalysis({ metadata: { title: null, creator: null, sheetCount: 1 } }))
    const cat = r.categories.find((c) => c.id === 'title_language')!
    expect(cat.score).toBe(0)
    expect(cat.findings.join(' ')).toMatch(/does not store a document language/i)
  })
})
```

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** in `scorer.ts`: `XLSX_HELP`, `xlsxCategory` (docxCategory clone reading `XLSX.SCORING_WEIGHTS`), one function per row above, `buildXlsxCategories` (eight categories incl. the forms placeholder) + `applyWcagCriteria`, and:

```ts
export function scoreXlsx(analysis: XlsxAnalysis): ScoringResult {
  const categories = buildXlsxCategories(analysis);
  const conformance = evaluateXlsxConformance(analysis);
  const aggregate = aggregateScore(categories, false, "strict", conformance, "Excel workbook");
  return {
    overallScore: aggregate.overallScore,
    grade: aggregate.grade,
    isScanned: false,
    executiveSummary: aggregate.executiveSummary,
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: { strict: aggregate.profile, remediation: aggregate.profile },
    conformance,
  };
}
```

(Land the Task 6 gate skeleton in the same commit if the import would otherwise break the build, exactly as Phase 2 Task 6 did.)

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** — `git commit -am "feat(api): scoreXlsx — Excel categories on the shared aggregation"`

---

### Task 6: `evaluateXlsxConformance`

**Files:** modify `services/scoring/conformance.ts`; create `apps/api/src/__tests__/xlsxConformance.test.ts`.

**Gate fires on:** 1.1.1 (non-decorative images without alt), 2.4.2 (no core title), 1.3.1 (**defined tables with `hasHeaderRow: false` only** — never the data-region advisory, never merged cells), 1.4.3 (styles contrast failures). **notAssessed always:** 3.1.1 `{ reason: "Excel workbooks do not store a document language, so assistive technology falls back to the reader's defaults — this criterion cannot be evaluated for spreadsheets." }`; 1.3.2 (reading/tab order not machine-verified); 1.4.3 when `checkedRuns === 0` (styles wording). Fix steps use Excel paths ("In Excel: right-click the image → View Alt Text", "File → Info → Properties → Title", "Select the range → Insert → Table → check 'My table has headers'"). Duplicate the docx gate's status/headline tail verbatim (same-file duplication, keeps docx/pptx gates untouched).

- [ ] **Step 1: Write the failing tests** — create `xlsxConformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateXlsxConformance } from '../services/scoring/conformance.js'
import type { XlsxAnalysis } from '../services/xlsxService.js'

function analysis(over: Partial<XlsxAnalysis>): XlsxAnalysis {
  return {
    metadata: { title: 'Ledger', creator: null, sheetCount: 1 },
    sheets: [{ name: 'Data', hidden: false, defaultNamed: false, mergedRangeCount: 0, usedRangeCellCount: 10, hasDefinedTable: true }],
    tables: [{ sheetName: 'Data', name: 'T', hasHeaderRow: true }],
    images: [], links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    ...over,
  }
}

describe('evaluateXlsxConformance', () => {
  it('is clean for a well-formed workbook, with 3.1.1 honestly not assessed', () => {
    const v = evaluateXlsxConformance(analysis({}))
    expect(v.status).toBe('no-automated-failures')
    expect(v.notAssessed.map((n) => n.sc)).toContain('3.1.1')
  })

  it('fires 1.1.1 / 2.4.2 / 1.3.1 / 1.4.3 on confirmed violations only', () => {
    const v = evaluateXlsxConformance(analysis({
      metadata: { title: null, creator: null, sheetCount: 1 },
      images: [{ altText: null, decorative: false }],
      tables: [{ sheetName: 'Data', name: 'Bad', hasHeaderRow: false }],
      contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [{ text: 'cell style #1', ratio: 1.4, foreground: '#DDDDDD', background: '#FFFFFF', large: false }] },
    }))
    expect(v.status).toBe('fail')
    expect(v.failures.map((f) => f.sc).sort()).toEqual(['1.1.1', '1.3.1', '1.4.3', '2.4.2'])
  })

  it('does NOT fire for merged cells or table-less data sheets (advisory-only)', () => {
    const v = evaluateXlsxConformance(analysis({
      sheets: [{ name: 'Data', hidden: false, defaultNamed: false, mergedRangeCount: 9, usedRangeCellCount: 500, hasDefinedTable: false }],
      tables: [],
    }))
    expect(v.status).toBe('no-automated-failures')
  })
})
```

- [ ] **Step 2: Run to verify failure** (skeleton fires nothing → second test fails). **Step 3: Implement** the rules mirroring `evaluateDocxConformance`'s structure. **Step 4: Verify pass** + docx/pptx conformance suites still green. **Step 5: Commit** — `git commit -am "feat(api): Excel conformance gate"`

---

### Task 7: Dispatch, routes, upload filter, CLI

**Files:** modify `analyzer.ts`, `pdfAnalyzer.ts` (add `xlsxMetadata?: XlsxMetadata`), `routes/analyze.ts`, `routes/analyze-url.ts`, `middleware/uploadMiddleware.ts`, `apps/cli/src/commands/audit.ts`; tests appended to `analyzer.test.ts` + route tests.

- [ ] **Step 1: Write the failing tests** — append to `analyzer.test.ts`:

```ts
import { buildXlsx } from './helpers/minimalXlsx.js'

describe('detectFileType: xlsx', () => {
  it('detects a real xlsx by content and dispatches with sheet-count pageCount', async () => {
    const buf = await buildXlsx({ sheets: [{ name: 'A' }, { name: 'B' }] })
    expect(await detectFileType(buf)).toBe('xlsx')
    const r = await analyzeDocument(buf, 'book.xlsx')
    expect(r.fileType).toBe('xlsx')
    expect(r.pageCount).toBe(2) // sheets
    expect(r.xlsxMetadata?.title).toBe('Grant Ledger')
  })
})
```

Mirror the existing route-mapping tests for `XLSX_DISABLED` → 415 (`Excel (.xlsx) auditing is currently disabled.`) and `XLSX_PARSE_FAILED` → 422 (`This Excel file could not be read.` / `The fetched Excel file could not be read.`).

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** `analyzer.ts` detection (after the pptx branch, same ZIP block):

```ts
      if (
        contentTypes.includes("spreadsheetml.sheet") &&
        zip.file("xl/workbook.xml")
      ) {
        return "xlsx";
      }
```

Dispatch branch after pptx (imports: `analyzeXlsx`, `type XlsxMetadata`, `scoreXlsx`, `XLSX` from `#config`):

```ts
  if (type === "xlsx") {
    if (!XLSX.ENABLED) {
      throw new FileTypeError(
        "XLSX_DISABLED",
        "Excel (.xlsx) auditing is currently disabled on this server.",
      );
    }
    await acquireSemaphore();
    try {
      const analysis = await withTimeout(
        analyzeXlsx(buffer),
        XLSX.ANALYSIS_TIMEOUT_MS,
        "xlsx analysis timed out",
      );
      const scoring = scoreXlsx(analysis);
      return {
        filename,
        pageCount: analysis.metadata.sheetCount,
        fileType: "xlsx",
        xlsxMetadata: analysis.metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }
```

Unsupported message becomes `"This file is not a supported document (PDF, Word .docx, PowerPoint .pptx, or Excel .xlsx)."`; the analyze.ts `UNSUPPORTED_FILE_TYPE` details list all four and change the renamed-file example to `(e.g., .zip, .jpg)`. Routes: add the two `XLSX_*` cases after the PPTX ones (Phase 2 wording pattern, Excel copy). `uploadMiddleware.ts`: `isXlsx` clause on `XLSX.ENABLED`/`XLSX.MIME_TYPE`/`.xlsx`, extend the programmatic accepted-list message. CLI gate: `.xlsx` joins the allowlist; error copy `Not a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file`; help usage `<file.pdf|.docx|.pptx|.xlsx>`; tagline `PDF & Office accessibility analyzer`.

- [ ] **Step 4: Run to verify pass** (analyzer + route suites + full API run). **Step 5: Commit** — `git commit -am "feat(api,cli): xlsx dispatch, route mapping, upload filter, CLI allowlist"`

---

### Task 8: Integration fixtures + calibration

**Files:** create `apps/api/src/__tests__/xlsxIntegration.test.ts`.

- [ ] **Step 1: Write the failing integration tests:**

```ts
import { describe, it, expect } from 'vitest'
import { buildXlsx } from './helpers/minimalXlsx.js'
import { analyzeDocument } from '../services/analyzer.js'

describe('xlsx integration: accessible workbook', () => {
  it('scores ≥ 90 with a clean gate', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'FY26 Grants', dimensionRef: 'A1:C40',
        tables: [{ name: 'Grants' }],
        drawings: [{ kind: 'chart', descr: 'Awards by county, FY26' }],
        hyperlinks: [{ id: 'rIdH1', target: 'https://example.gov/r', display: 'Methodology notes' }],
      }],
      styles: [{ fontRgb: 'FF000000', fillRgb: 'FFFFFFFF' }],
    })
    const r = await analyzeDocument(buf, 'accessible.xlsx')
    expect(r.fileType).toBe('xlsx')
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.conformance.status).toBe('no-automated-failures')
  })
})

describe('xlsx integration: inaccessible workbook', () => {
  it('fails ≤ 35 citing 1.1.1, 2.4.2, 1.3.1, 1.4.3', async () => {
    const buf = await buildXlsx({
      coreXml: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`,
      sheets: [
        {
          name: 'Sheet1', dimensionRef: 'A1:H60', mergeCount: 4,
          tables: [{ name: 'Bad', headerRowCount: 0 }],
          drawings: [{ kind: 'pic' }],
          hyperlinks: [{ id: 'rIdH1', target: 'https://example.gov/x', display: 'https://example.gov/x' }],
        },
        { name: 'Sheet2', dimensionRef: 'A1:D30' },
      ],
      styles: [{ fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }],
    })
    const r = await analyzeDocument(buf, 'inaccessible.xlsx')
    expect(r.overallScore).toBeLessThanOrEqual(35)
    expect(r.conformance.status).toBe('fail')
    expect(r.conformance.failures.map((f) => f.sc)).toEqual(
      expect.arrayContaining(['1.1.1', '2.4.2', '1.3.1', '1.4.3']),
    )
  })
})
```

- [ ] **Step 2: Run; calibrate** deductions (Task 5 table) until targets hold — never move the targets.
- [ ] **Step 3: Commit** — `git add apps/api/src/__tests__/xlsxIntegration.test.ts && git commit -m "test(api): xlsx end-to-end fixtures + calibration targets"`

---

### Task 9: Phase gate

- [ ] **Step 1:**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build && (cd apps/api && npx vitest run) && (cd apps/web && npx vitest run)
git diff v1.32.1 --stat -- apps/api/src/__tests__/docx*.test.ts   # must be empty
```

Expected: all green; docx suites untouched. Both new formats now audit end-to-end at the API and CLI; Phase 4 wires the frontend.

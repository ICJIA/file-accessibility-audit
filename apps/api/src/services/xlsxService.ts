/**
 * XLSX (OOXML / SpreadsheetML) accessibility extractor on the shared
 * services/ooxml.ts core; output XlsxAnalysis feeds scoreXlsx().
 *
 * v1 boundaries (see the Phase 3 plan): contrast reads xl/styles.xml cell
 * formats (labeled "cell style #N"), not resolved cell values; hyperlink text
 * is the `display` attribute or ""; theme/indexed colors are unresolved.
 *
 * Security/correctness hardening (fix-2, red/blue audit): worksheet `<c>`
 * cells are now parsed for three interlocking reasons — (1) the MAX_CELLS cap
 * is derived from the actually-parsed cells (any depth), never the
 * self-reported `<dimension ref>`, which is attacker-controlled; (2) contrast
 * is evaluated only for cellXfs styles applied to a non-empty cell, so
 * unused/template styles (openpyxl, PhpSpreadsheet routinely emit these)
 * can't produce a false WCAG 1.4.3 finding; (3) drawing objects and
 * hyperlinks are capped by pre-counting the source elements and checking the
 * accumulated total BEFORE the append loops (so one oversized part can't flood
 * the arrays before the check fires), bounded across all sheets — mirroring
 * pptxService's countShapesAnyDepth / countTextElementsAnyDepth cap-before-walk
 * pattern.
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

/** Value-child tags that make a `<c>` cell non-empty: `<v>` (value), `<is>`
 *  (inline string), or `<f>` (formula). A bare `<c s="N"/>` with none of
 *  these is empty. */
const CELL_VALUE_CHILD_TAGS = new Set(["v", "is", "f"]);
function cellHasValue(c: PONode): boolean {
  return childrenOf(c).some((ch) => CELL_VALUE_CHILD_TAGS.has(tagOf(ch) ?? ""));
}

/**
 * Any-depth count of `<c>` cell elements under a worksheet root. This is what
 * the MAX_CELLS cap is checked against — NOT the self-reported `<dimension
 * ref>`, which is attacker-controlled: a hostile `<dimension ref="A1:A1"/>`
 * over a multi-megabyte `<sheetData>` would otherwise bypass the cap entirely
 * while the content walks (drawings, hyperlinks, tables) still process every
 * real cell's siblings. Any-depth (not a fixed sheetData>row>c assumption) so
 * unusual nesting can't hide volume from the cap either. Exported for direct
 * unit testing (mirrors pptx's countShapesAnyDepth / countTextElementsAnyDepth).
 */
export function countCellsAnyDepth(sheetRoot: PONode): number {
  return descendants(sheetRoot, "c").length;
}

/**
 * Collect the set of cellXfs indices (`<c s="N">`) applied to a NON-EMPTY
 * cell (see cellHasValue). collectStylesContrast below restricts itself to
 * this set — a style no visible cell uses can't produce a false WCAG 1.4.3
 * finding. A cell with no explicit `s` attribute uses style index 0 (Excel's
 * default "Normal" style).
 */
function collectAppliedCellStyles(sheetRoot: PONode, applied: Set<number>): void {
  for (const c of descendants(sheetRoot, "c")) {
    if (!cellHasValue(c)) continue;
    const s = attrOf(c, "s");
    applied.add(s !== undefined ? Number(s) : 0);
  }
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
  const appliedStyleIndices = new Set<number>();
  // Cross-sheet accumulators for the drawing-object and hyperlink caps (FIX C).
  // Kept local (not on XlsxAnalysis) so the analysis OUTPUT shape is unchanged
  // for valid workbooks — mirrors pptx's local textElementCount.
  const contentCounts = { drawingObjects: 0, hyperlinks: 0 };
  for (const sheetEl of sheetEls) {
    const name = attrOf(sheetEl, "name") ?? "";
    const state = attrOf(sheetEl, "state");
    const rid = attrOf(sheetEl, "id"); // r:id — removeNSPrefix strips the prefix
    const rel = workbookRels.find((r) => r.id === rid);
    const sheetPath = rel ? resolveXlTarget(rel.target, "xl") : null;
    const sheetXml = sheetPath ? await read(sheetPath) : null;
    const sheetRoot = rootElement(parseXml(sheetXml), "worksheet");

    // usedRangeCellCount is DISPLAY/SCORING metadata only (feeds
    // scoreXlsxTableMarkup's "≥12 cells" heuristic) — still sourced from the
    // self-reported <dimension ref>, same as before. It must NEVER drive the
    // MAX_CELLS security cap below — see countCellsAnyDepth's doc comment.
    const dimension = sheetRoot ? descendants(sheetRoot, "dimension")[0] : undefined;
    const usedRangeCellCount = cellCountOfRef(dimension ? attrOf(dimension, "ref") : undefined);

    const realCellCount = sheetRoot ? countCellsAnyDepth(sheetRoot) : 0;
    totalCells += realCellCount;
    if (totalCells > XLSX.MAX_CELLS) {
      throw new XlsxParseError(
        `This workbook has too many cells (${totalCells.toLocaleString()}+) to analyze.`,
      );
    }
    if (sheetRoot) collectAppliedCellStyles(sheetRoot, appliedStyleIndices);

    const merged = sheetRoot ? descendants(sheetRoot, "mergeCell").length : 0;

    const sheetRelsPath = sheetPath
      ? sheetPath.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels")
      : null;
    const sheetRels = parseRelationshipEntries(sheetRelsPath ? await read(sheetRelsPath) : null);

    await collectSheetContent(analysis, name, sheetRoot, sheetRels, read, contentCounts);

    analysis.sheets.push({
      name,
      hidden: state === "hidden" || state === "veryHidden",
      defaultNamed: DEFAULT_SHEET_NAME_RE.test(name),
      mergedRangeCount: merged,
      usedRangeCellCount,
      hasDefinedTable: sheetRels.some((r) => /\/table$/.test(r.type)),
    });
  }

  await collectStylesContrast(analysis, read, appliedStyleIndices);
  return analysis;
}

async function collectSheetContent(
  analysis: XlsxAnalysis,
  sheetName: string,
  sheetRoot: PONode | undefined,
  sheetRels: Array<{ id: string; target: string; type: string }>,
  read: (p: string) => Promise<string | null>,
  counts: { drawingObjects: number; hyperlinks: number },
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

  // Drawings: each direct child of wsDr is an anchor (oneCellAnchor,
  // twoCellAnchor, or absoluteAnchor); an anchor may hold several drawable
  // objects when shapes are grouped (xdr:grpSp). Collect every picture and
  // chart frame so grouped/second objects are never silently dropped.
  for (const rel of sheetRels.filter((r) => /\/drawing$/.test(r.type))) {
    const drawingRoot = rootElement(
      parseXml(await read(resolveXlTarget(rel.target, "xl/worksheets"))),
      "wsDr",
    );
    if (!drawingRoot) continue;
    // FIX C (pre-count, cap-before-walk): count every would-be-added drawing
    // object on the WHOLE part and check the accumulated cap BEFORE the
    // anchor/push loop appends anything — mirroring the MAX_CELLS pre-count and
    // pptx's countShapesAnyDepth-before-collectSlideContent. A post-append
    // check leaves a single-part burst window: one malicious 30 MB drawing part
    // could push millions of entries into analysis.images before firing.
    // Counting on drawingRoot (any depth) slightly over-counts vs the
    // cNvPr-gated push below — fine for a security cap, over-counting only
    // rejects sooner. `counts` accumulates across parts AND sheets.
    counts.drawingObjects +=
      descendants(drawingRoot, "pic").length +
      descendants(drawingRoot, "graphicFrame").length;
    if (counts.drawingObjects > XLSX.MAX_DRAWING_OBJECTS) {
      throw new XlsxParseError(
        `This workbook has too many drawing objects (${counts.drawingObjects.toLocaleString()}+) to analyze.`,
      );
    }
    for (const anchor of childrenOf(drawingRoot)) {
      for (const obj of [...descendants(anchor, "pic"), ...descendants(anchor, "graphicFrame")]) {
        const cNvPr = descendants(obj, "cNvPr")[0];
        if (cNvPr) analysis.images.push(drawingAltText(cNvPr));
      }
    }
  }

  // Hyperlinks: display attr or "" (cell text not resolved — v1 boundary).
  if (sheetRoot) {
    const linkEls = descendants(sheetRoot, "hyperlink");
    // FIX C (pre-count, cap-before-walk): same guarantee for hyperlinks —
    // count the source <hyperlink> elements and check the accumulated cap
    // BEFORE the push loop, closing the same single-part burst window.
    // `counts` accumulates across sheets.
    counts.hyperlinks += linkEls.length;
    if (counts.hyperlinks > XLSX.MAX_HYPERLINKS) {
      throw new XlsxParseError(
        `This workbook has too many hyperlinks (${counts.hyperlinks.toLocaleString()}+) to analyze.`,
      );
    }
    const relMap = new Map(sheetRels.map((r) => [r.id, r.target]));
    for (const link of linkEls) {
      const rid = attrOf(link, "id");
      analysis.links.push({
        text: (attrOf(link, "display") ?? "").trim(),
        url: rid && relMap.has(rid) ? relMap.get(rid)! : null,
      });
    }
  }
}

/** ARGB "FFRRGGBB" or plain "RRGGBB" → normalized 6-hex, else null. */
function argbToHex(v: string | undefined): string | null {
  if (!v) return null;
  if (/^[0-9a-fA-F]{8}$/.test(v)) return normalizeHex(v.slice(2));
  return normalizeHex(v);
}

async function collectStylesContrast(
  analysis: XlsxAnalysis,
  read: (p: string) => Promise<string | null>,
  appliedStyleIndices: Set<number>,
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
    // FIX B: a style no NON-EMPTY cell applies produces no contrast signal at
    // all (not checked, not unresolved, not failing). openpyxl and
    // PhpSpreadsheet routinely emit unused/template cellXfs; evaluating every
    // <xf> unconditionally turned those into false WCAG 1.4.3 failures — even
    // an entirely empty <sheetData/> could "fail" contrast.
    if (!appliedStyleIndices.has(idx)) return;
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

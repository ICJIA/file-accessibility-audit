/**
 * DOCX (OOXML / WordprocessingML) accessibility extractor.
 *
 * A `.docx` is a ZIP archive of XML parts. Unlike PDF — which needs the qpdf
 * subprocess and pdfjs to recover structure from a binary format — Word's
 * structure is already explicit in the XML, so this is pure JavaScript:
 * unzip with jszip, parse the relevant parts with fast-xml-parser, and read
 * the accessibility-relevant signals directly.
 *
 * The output `DocxAnalysis` is the DOCX analogue of `QpdfResult` + `PdfjsResult`
 * and feeds `scoreDocx()` in scorer.ts.
 */
import JSZip from "jszip";
import { DOCX, OOXML } from "#config";
import {
  type PONode,
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  rawText,
  textOf,
  rootElement,
  parseRelationships,
  corePropertyText,
  drawingAltText,
  MANUAL_BULLET_RE,
  CONTRAST_MIN_NORMAL,
  CONTRAST_MIN_LARGE,
  normalizeHex,
  contrastRatio,
  readCapped as ooxmlReadCapped,
  assertZipWithinLimits,
} from "./ooxml.js";

export interface DocxMetadata {
  title: string | null;
  creator: string | null;
  /** Resolved default document language (styles docDefaults, else dc:language). */
  language: string | null;
  pageCount: number | null;
  wordCount: number | null;
}

export interface DocxAnalysis {
  metadata: DocxMetadata;
  /** Headings from real heading styles, in document order. */
  headings: Array<{ level: number; text: string }>;
  /** Bold, large, styleless paragraphs that visually read as headings. */
  fakeHeadings: Array<{ text: string }>;
  /** Heading-styled paragraphs with no text (spacing habit) — advisory. */
  emptyHeadingCount: number;
  /** Inline/anchored images with their alt text (null when missing). */
  images: Array<{ altText: string | null; decorative: boolean; titleOnly: boolean }>;
  tables: Array<{
    hasHeaderRow: boolean;
    rowCount: number;
    colCount: number;
    hasNestedTable: boolean;
    /** No table style, borders, shading, or header semantics anywhere —
     *  overwhelmingly a layout grid; the gate must not assert 1.3.1 on it. */
    looksLikeLayout?: boolean;
  }>;
  /** Hyperlinks with display text and resolved target (null if unresolved). */
  links: Array<{ text: string; url: string | null }>;
  lists: {
    /** Paragraphs that are real list items (`<w:numPr>`). */
    realListItems: number;
    /** Paragraphs that begin with a literal bullet/number but are not list items. */
    manualBulletParagraphs: number;
  };
  contrast: {
    /** Runs with a fully resolved foreground + background color. */
    checkedRuns: number;
    /** Runs whose color was `auto`/inherited and could not be resolved. */
    unresolvedRuns: number;
    failing: Array<{
      text: string;
      ratio: number;
      foreground: string;
      background: string;
      large: boolean;
    }>;
  };
  paragraphCount: number;
  /** Per-part parse outcomes, so the conformance gate can distinguish "the
   *  part said X" from "the part could not be read" (no false confirmed
   *  claims from unread parts, no false clean verdicts from unparsed ones). */
  parse: {
    documentOk: boolean;
    stylesState: "ok" | "absent" | "unparseable";
    coreState: "ok" | "absent" | "unparseable";
  };
}

/** Thrown when the buffer is not a readable WordprocessingML package. */
export class DocxParseError extends Error {
  code = "DOCX_PARSE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "DocxParseError";
  }
}

// ---------------------------------------------------------------------------
// Heading style map
// ---------------------------------------------------------------------------

interface StyleInfo {
  /** styleId → heading level 1–6. */
  headingLevels: Map<string, number>;
  /** styleIds whose resolved pPr carries real numbering (style-level lists). */
  numberedStyles: Set<string>;
}

/**
 * Resolve heading levels and style-level numbering from styles.xml.
 * A style is a heading when its NAME/ID matches the built-ins, OR when its
 * resolved `w:outlineLvl` (own pPr or inherited through the `basedOn` chain)
 * is 0–5 — the actual outline semantics Word uses for the Nav pane and for
 * H1–H6 tags on PDF export. Agency templates routinely define custom heading
 * styles (`ChapterTitle` etc.) detectable only this way; missing them made
 * real headings invisible AND re-flagged them as fake headings.
 */
function buildStyleInfo(stylesRoot: PONode | undefined): StyleInfo {
  const headingLevels = new Map<string, number>();
  const numberedStyles = new Set<string>();
  if (!stylesRoot) return { headingLevels, numberedStyles };

  const styleNodes = new Map<string, PONode>();
  for (const style of descendants(stylesRoot, "style")) {
    if (attrOf(style, "type") !== "paragraph") continue;
    const styleId = attrOf(style, "styleId");
    if (styleId) styleNodes.set(styleId, style);
  }

  const ownOutlineLevel = (style: PONode): number | null => {
    const pPr = firstChild(style, "pPr");
    const outline = pPr ? firstChild(pPr, "outlineLvl") : undefined;
    const val = outline ? Number(attrOf(outline, "val")) : NaN;
    return Number.isInteger(val) && val >= 0 && val <= 5 ? val + 1 : null;
  };
  const ownNumbering = (style: PONode): boolean => {
    const pPr = firstChild(style, "pPr");
    const numPr = pPr ? firstChild(pPr, "numPr") : undefined;
    if (!numPr) return false;
    const numId = firstChild(numPr, "numId");
    return !numId || attrOf(numId, "val") !== "0";
  };

  for (const [styleId, style] of styleNodes) {
    const nameNode = firstChild(style, "name");
    const nameVal = nameNode ? (attrOf(nameNode, "val") ?? "") : "";
    let level: number | null = null;
    const byName = /^heading\s*([1-6])$/i.exec(nameVal.trim());
    const byId = /^Heading([1-6])$/.exec(styleId);
    if (byName) level = Number(byName[1]);
    else if (byId) level = Number(byId[1]);

    // Walk the basedOn chain (cycle-guarded) for outlineLvl and numbering.
    let numbered = false;
    let cursor: PONode | undefined = style;
    const seen = new Set<string>();
    for (let hop = 0; cursor && hop < 8; hop++) {
      if (level === null) level = ownOutlineLevel(cursor);
      if (!numbered) numbered = ownNumbering(cursor);
      const basedOn = firstChild(cursor, "basedOn");
      const parentId: string | undefined = basedOn ? attrOf(basedOn, "val") : undefined;
      if (!parentId || seen.has(parentId)) break;
      seen.add(parentId);
      // The chain can also END at a built-in heading style matched by id/name.
      if (level === null) {
        const byParentId = /^Heading([1-6])$/.exec(parentId);
        if (byParentId) level = Number(byParentId[1]);
      }
      cursor = styleNodes.get(parentId);
    }

    if (level) headingLevels.set(styleId, level);
    if (numbered) numberedStyles.add(styleId);
  }
  return { headingLevels, numberedStyles };
}

/** Default document language from styles docDefaults, if declared. */
function stylesDefaultLang(stylesRoot: PONode | undefined): string | null {
  if (!stylesRoot) return null;
  const lang = descendants(stylesRoot, "lang").find((l) => attrOf(l, "val"));
  return lang ? (attrOf(lang, "val") ?? null) : null;
}

// ---------------------------------------------------------------------------
// Run properties (for fake-heading + contrast heuristics)
// ---------------------------------------------------------------------------

interface RunProps {
  bold: boolean;
  sizeHalfPt: number | null;
}

function runProps(run: PONode): RunProps {
  const rPr = firstChild(run, "rPr");
  if (!rPr) return { bold: false, sizeHalfPt: null };
  const bold = !!firstChild(rPr, "b");
  const szNode = firstChild(rPr, "sz");
  const szVal = szNode ? attrOf(szNode, "val") : undefined;
  return { bold, sizeHalfPt: szVal ? Number(szVal) : null };
}

/** A paragraph's style id, if any (`<w:pPr><w:pStyle w:val>`). */
function paragraphStyleId(p: PONode): string | undefined {
  const pPr = firstChild(p, "pPr");
  const pStyle = pPr ? firstChild(pPr, "pStyle") : undefined;
  return pStyle ? attrOf(pStyle, "val") : undefined;
}

const FAKE_HEADING_MAX_LEN = 120;
const FAKE_HEADING_MIN_HALF_PT = 28; // 14pt

/** A paragraph's OWN runs — not runs hosted inside a nested drawing/text
 *  box, whose paragraphs are walked in their own right. Without this, a
 *  paragraph hosting a text box was judged by the text box's content and the
 *  same words were evaluated twice. */
function ownRuns(p: PONode): PONode[] {
  const out: PONode[] = [];
  const walk = (node: PONode): void => {
    for (const c of childrenOf(node)) {
      const t = tagOf(c);
      if (t === "drawing" || t === "pict" || t === "txbxContent") continue;
      if (t === "r") {
        out.push(c);
        continue;
      }
      walk(c); // hyperlink / smartTag / ins wrappers
    }
  };
  walk(p);
  return out;
}

function ownRunText(p: PONode): string {
  return ownRuns(p)
    .map((r) =>
      childrenOf(r)
        .filter((c) => tagOf(c) === "t")
        .map((t) => rawText(t))
        .join(""),
    )
    .join("");
}

/** Bold + large + short + styleless → looks like a heading but isn't tagged. */
function isFakeHeading(p: PONode, headingStyles: Map<string, number>): boolean {
  const styleId = paragraphStyleId(p);
  if (styleId && headingStyles.has(styleId)) return false;
  const text = ownRunText(p).trim();
  if (!text || text.length > FAKE_HEADING_MAX_LEN) return false;
  return ownRuns(p).some((r) => {
    const { bold, sizeHalfPt } = runProps(r);
    return bold && sizeHalfPt !== null && sizeHalfPt >= FAKE_HEADING_MIN_HALF_PT;
  });
}

// ---------------------------------------------------------------------------
// Images, tables, links
// ---------------------------------------------------------------------------

function extractImages(body: PONode): DocxAnalysis["images"] {
  const images: DocxAnalysis["images"] = [];
  for (const drawing of descendants(body, "drawing")) {
    const docPr = descendants(drawing, "docPr")[0];
    if (!docPr) continue;
    // Classify the drawing by its graphicData payload URI. A
    // wordprocessingShape (or group) whose payload is TEXT — a text box,
    // pull quote, sidebar — is not non-text content: assistive technology
    // reads its words directly, and this analyzer's text walks already cover
    // them. Requiring alt on it (and failing 1.1.1 without it) was a false
    // positive. Shapes with no text still count as images: a meaningful
    // graphic needs alt or the decorative mark, matching Word's own checker.
    // A missing/unknown URI falls through to "image" (the safe default);
    // anything containing an actual picture stays an image regardless.
    const graphicData = descendants(drawing, "graphicData")[0];
    const uri = graphicData ? (attrOf(graphicData, "uri") ?? "") : "";
    if (uri.endsWith("/wordprocessingShape") || uri.endsWith("/wordprocessingGroup")) {
      const hasText = descendants(drawing, "txbxContent").some((tb) => textOf(tb).trim() !== "");
      const hasPicture = descendants(drawing, "pic").length > 0;
      if (hasText && !hasPicture) continue;
    }
    images.push(drawingAltText(docPr));
  }
  // Legacy VML images (w:pict / v:imagedata) — compat-mode and old-template
  // documents store images this way with alt on the v:shape. (AlternateContent
  // fallback picts never reach here — the walker flattens to the Choice
  // branch — so these are genuine standalone legacy images.)
  for (const pict of descendants(body, "pict")) {
    for (const shape of descendants(pict, "shape")) {
      if (descendants(shape, "imagedata").length === 0) continue;
      const alt = attrOf(shape, "alt")?.trim();
      images.push({ altText: alt ? alt : null, decorative: false, titleOnly: false });
    }
  }
  return images;
}

/** Top-level tables only — a `<w:tbl>` not contained in another `<w:tbl>`. */
function topLevelTables(node: PONode): PONode[] {
  const out: PONode[] = [];
  const visit = (n: PONode): void => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === "tbl") out.push(c);
      else visit(c);
    }
  };
  visit(node);
  return out;
}

/** ST_OnOff: absent = on; "0"/"false"/"off" = off. */
function onOffEnabled(node: PONode): boolean {
  const val = attrOf(node, "val");
  return val === undefined || !/^(0|false|off)$/i.test(val);
}

function extractTables(body: PONode): DocxAnalysis["tables"] {
  return topLevelTables(body).map((tbl) => {
    const rows = childrenOf(tbl).filter((c) => tagOf(c) === "tr");
    let cellCols = 0;
    let hasHeaderRow = false;
    let anyTblHeaderMark = false;
    let hasNestedTable = false;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const cells = childrenOf(row).filter((c) => tagOf(c) === "tc");
      cellCols = Math.max(cellCols, cells.length);
      const trPr = firstChild(row, "trPr");
      const tblHeader = trPr ? firstChild(trPr, "tblHeader") : undefined;
      if (tblHeader) {
        anyTblHeaderMark = true;
        // Word honors repeat-header only on the top row(s), and w:val="0"
        // means the user explicitly UNCHECKED it — both previously counted
        // as "has header row".
        if (rowIdx === 0 && onOffEnabled(tblHeader)) hasHeaderRow = true;
      }
      if (cells.some((tc) => descendants(tc, "tbl").length > 0)) hasNestedTable = true;
    }
    const tblPr = firstChild(tbl, "tblPr");
    const looksLikeLayout =
      !anyTblHeaderMark &&
      !(tblPr && firstChild(tblPr, "tblStyle")) &&
      !(tblPr && firstChild(tblPr, "tblBorders")) &&
      descendants(tbl, "shd").length === 0;
    const grid = firstChild(tbl, "tblGrid");
    const gridCols = grid ? childrenOf(grid).filter((c) => tagOf(c) === "gridCol").length : 0;
    return {
      hasHeaderRow,
      rowCount: rows.length,
      colCount: Math.max(cellCols, gridCols),
      hasNestedTable,
      looksLikeLayout,
    };
  });
}

const HYPERLINK_INSTR_RE = /HYPERLINK\s+"([^"]+)"/i;

function extractLinks(body: PONode, relMap: Map<string, string>): DocxAnalysis["links"] {
  const links: DocxAnalysis["links"] = descendants(body, "hyperlink").map((h) => {
    const text = textOf(h).trim();
    const id = attrOf(h, "id");
    const url = id && relMap.has(id) ? relMap.get(id)! : null;
    return { text, url };
  });

  // Field-code hyperlinks — legacy documents and mail-merge output store
  // links as fields, not w:hyperlink elements. Two serializations:
  //   simple  — <w:fldSimple w:instr=' HYPERLINK "url" '>display runs</w:fldSimple>
  //   complex — runs bracketed by <w:fldChar begin/separate/end>, with the
  //             instruction in <w:instrText> runs and the display text
  //             between separate and end.
  for (const fld of descendants(body, "fldSimple")) {
    const instr = attrOf(fld, "instr") ?? "";
    const m = HYPERLINK_INSTR_RE.exec(instr);
    if (m) links.push({ text: textOf(fld).trim(), url: m[1] });
  }
  for (const p of descendants(body, "p")) {
    let state: "idle" | "instr" | "display" = "idle";
    let instr = "";
    let display = "";
    for (const run of descendants(p, "r")) {
      const fldChar = firstChild(run, "fldChar");
      const charType = fldChar ? attrOf(fldChar, "fldCharType") : undefined;
      if (charType === "begin") {
        state = "instr";
        instr = "";
        display = "";
        continue;
      }
      if (charType === "separate") {
        state = state === "instr" ? "display" : state;
        continue;
      }
      if (charType === "end") {
        const m = HYPERLINK_INSTR_RE.exec(instr);
        if (m) links.push({ text: display.trim(), url: m[1] });
        state = "idle";
        continue;
      }
      if (state === "instr") {
        for (const it of descendants(run, "instrText")) instr += rawText(it);
      } else if (state === "display") {
        display += textOf(run);
      }
    }
  }
  return links;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Direct paragraph numbering — numId="0" is Word's explicit "numbering
 *  removed" marker and must NOT count as a real list item. */
function hasDirectNumbering(p: PONode): boolean {
  const pPr = firstChild(p, "pPr");
  const numPr = pPr ? firstChild(pPr, "numPr") : undefined;
  if (!numPr) return false;
  const numId = firstChild(numPr, "numId");
  return !numId || attrOf(numId, "val") !== "0";
}

function extractLists(paragraphs: PONode[], styleInfo: StyleInfo): DocxAnalysis["lists"] {
  let realListItems = 0;
  let manualBulletParagraphs = 0;
  for (const p of paragraphs) {
    const styleId = paragraphStyleId(p);
    // Built-in List Bullet / List Number carry their numbering on the STYLE,
    // not the paragraph — the most common real-list form in agency documents.
    const styleNumbered = !!styleId && styleInfo.numberedStyles.has(styleId);
    if (hasDirectNumbering(p) || styleNumbered) {
      realListItems++;
    } else if (styleId && styleInfo.headingLevels.has(styleId)) {
      // A numbered HEADING ("1. Introduction") is outline numbering, not a
      // hand-typed list — counting it as a manual bullet zeroed the list
      // category on properly structured policy documents.
      continue;
    } else if (MANUAL_BULLET_RE.test(textOf(p))) {
      manualBulletParagraphs++;
    }
  }
  return { realListItems, manualBulletParagraphs };
}

// ---------------------------------------------------------------------------
// Color contrast (WCAG 1.4.3)
// ---------------------------------------------------------------------------
// 4.5:1 / 3:1 are the fixed definition of SC 1.4.3, not tunable policy, so they
// live here rather than in audit.config.ts.

const LARGE_HALF_PT = 36; // ≥18pt
const LARGE_BOLD_HALF_PT = 28; // ≥14pt bold

/** Background fill of a run/paragraph properties node, if an explicit color. */
function shdFill(propsNode: PONode | undefined): string | null {
  if (!propsNode) return null;
  const shd = firstChild(propsNode, "shd");
  return shd ? normalizeHex(attrOf(shd, "fill")) : null;
}

function isLargeRun(rPr: PONode | undefined): boolean {
  if (!rPr) return false;
  const szNode = firstChild(rPr, "sz");
  const sz = szNode ? Number(attrOf(szNode, "val")) : NaN;
  if (!Number.isFinite(sz)) return false;
  const bold = !!firstChild(rPr, "b");
  return sz >= LARGE_HALF_PT || (bold && sz >= LARGE_BOLD_HALF_PT);
}

/**
 * Background context carried down the document tree during the contrast walk.
 * `unresolved: true` means the effective background genuinely cannot be
 * determined from the file in v1 (table-style banding, shape/text-box fills) —
 * such runs are counted as unresolved and are NEVER compared against an
 * assumed white. Assuming white here produced confirmed 1.4.3 failures at
 * "1:1" for the canonical accessible pattern: white text on dark-shaded
 * table header cells.
 */
interface BgContext {
  bg: string | null;
  unresolved: boolean;
  styledTable: boolean;
}

function extractContrast(
  body: PONode | undefined,
  documentBg: string | null,
): DocxAnalysis["contrast"] {
  let checkedRuns = 0;
  let unresolvedRuns = 0;
  const failing: DocxAnalysis["contrast"]["failing"] = [];
  if (!body) return { checkedRuns, unresolvedRuns, failing };

  // A run's own visible text is its direct <w:t> children only — descendants
  // would pull in text-box content hosted inside the run's <w:drawing>,
  // which is walked separately (with its own unresolved background context).
  const runOwnText = (run: PONode): string =>
    childrenOf(run)
      .filter((c) => tagOf(c) === "t")
      .map((t) => rawText(t))
      .join("");

  const processRun = (run: PONode, pPr: PONode | undefined, ctx: BgContext): void => {
    const text = runOwnText(run).trim();
    if (!text) return;
    const rPr = firstChild(run, "rPr");
    const colorNode = rPr ? firstChild(rPr, "color") : undefined;
    const fg = colorNode ? normalizeHex(attrOf(colorNode, "val")) : null;
    if (!fg) {
      // No explicit color (inherits style/default) — not resolvable in v1.
      unresolvedRuns++;
      return;
    }
    // Run/paragraph shading beats the inherited context; an unresolved
    // context without local shading means the pair cannot be judged.
    const localBg = shdFill(rPr) ?? shdFill(pPr);
    const bg = localBg ?? (ctx.unresolved ? null : (ctx.bg ?? documentBg ?? "FFFFFF"));
    if (!bg) {
      unresolvedRuns++;
      return;
    }
    checkedRuns++;
    const ratio = contrastRatio(fg, bg);
    const large = isLargeRun(rPr);
    const min = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
    if (ratio < min) {
      failing.push({
        text,
        ratio: Math.round(ratio * 100) / 100,
        foreground: `#${fg}`,
        background: `#${bg}`,
        large,
      });
    }
  };

  const visitParagraph = (p: PONode, ctx: BgContext): void => {
    const pPr = firstChild(p, "pPr");
    const walkInline = (node: PONode, c: BgContext): void => {
      for (const child of childrenOf(node)) {
        const t = tagOf(child);
        if (t === "r") {
          processRun(child, pPr, c);
          walkInline(child, c); // the run may host a drawing (text box)
        } else if (t === "drawing" || t === "pict") {
          visitBlock(child, { bg: null, unresolved: true, styledTable: false });
        } else {
          walkInline(child, c); // hyperlink / ins / smartTag wrappers
        }
      }
    };
    walkInline(p, ctx);
  };

  const visitBlock = (node: PONode, ctx: BgContext): void => {
    const t = tagOf(node);
    if (t === "p") {
      visitParagraph(node, ctx);
      return;
    }
    if (t === "tbl") {
      // A table style can band-shade rows/columns; without resolving the
      // style part that background is unknown, so cells of a styled table
      // (lacking their own explicit fill) become unresolved. An explicit
      // table-level shd is resolvable and becomes the cells' default.
      const tblPr = firstChild(node, "tblPr");
      const tableBg = shdFill(tblPr);
      const styled = !!(tblPr && firstChild(tblPr, "tblStyle"));
      const tableCtx: BgContext = {
        bg: tableBg ?? ctx.bg,
        unresolved: ctx.unresolved || (styled && !tableBg),
        styledTable: styled,
      };
      for (const c of childrenOf(node)) visitBlock(c, tableCtx);
      return;
    }
    if (t === "tc") {
      const cellFill = shdFill(firstChild(node, "tcPr"));
      const cellCtx: BgContext = cellFill
        ? { bg: cellFill, unresolved: false, styledTable: ctx.styledTable }
        : ctx;
      for (const c of childrenOf(node)) visitBlock(c, cellCtx);
      return;
    }
    if (t === "drawing" || t === "pict") {
      const shapeCtx: BgContext = { bg: null, unresolved: true, styledTable: false };
      for (const c of childrenOf(node)) visitBlock(c, shapeCtx);
      return;
    }
    for (const c of childrenOf(node)) visitBlock(c, ctx);
  };

  visitBlock(body, { bg: documentBg, unresolved: false, styledTable: false });
  return { checkedRuns, unresolvedRuns, failing };
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

/**
 * DOCX-flavored wrapper over the shared capped ZIP reader — errors surface
 * as DocxParseError by default so route-level DOCX_PARSE_FAILED mapping
 * keeps working. (analyzer.ts imports this for [Content_Types].xml
 * detection reads too, though it discards the specific error type.) The
 * error factory is overridable — matching the shared readCapped's own
 * optional makeError — for any future caller that wants a different error
 * subclass from this exact byte-cap/read logic.
 */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
  makeError: (message: string) => Error = (m) => new DocxParseError(m),
): Promise<string> {
  return ooxmlReadCapped(f, cap, partName, makeError);
}

export async function analyzeDocx(buffer: Buffer): Promise<DocxAnalysis> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxParseError("The file is not a readable ZIP/DOCX package.");
  }

  // Aggregate zip-package limits (entry count + total declared uncompressed
  // size) — checked once, right after loadAsync, before any part is read.
  // See OOXML in #config for rationale; this closes the gap DOCX.
  // MAX_UNCOMPRESSED_BYTES leaves open (it only bounds any ONE part, not the
  // sum across every part a legal .docx can contain).
  assertZipWithinLimits(
    zip,
    {
      maxEntries: OOXML.MAX_ZIP_ENTRIES,
      maxTotalUncompressedBytes: OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES,
    },
    (m) => new DocxParseError(m),
  );

  const read = (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f ? readCapped(f, DOCX.MAX_UNCOMPRESSED_BYTES, p) : Promise.resolve(null);
  };

  const documentXml = await read("word/document.xml");
  if (documentXml === null) {
    throw new DocxParseError("word/document.xml is missing — the package is not a Word document.");
  }
  const stylesXml = await read("word/styles.xml");
  const coreXml = await read("docProps/core.xml");
  const appXml = await read("docProps/app.xml");
  const relsXml = await read("word/_rels/document.xml.rels");

  const docRoot = rootElement(parseXml(documentXml), "document");
  const body = docRoot ? firstChild(docRoot, "body") : undefined;
  const stylesRoot = rootElement(parseXml(stylesXml), "styles");
  const coreRoot = rootElement(parseXml(coreXml), "coreProperties");
  const appRoot = rootElement(parseXml(appXml), "Properties");

  const relMap = parseRelationships(relsXml);

  const styleInfo = buildStyleInfo(stylesRoot);
  const headingStyles = styleInfo.headingLevels;

  // --- metadata ---
  const coreText = (tag: string): string | null => corePropertyText(coreRoot, tag);
  const language = stylesDefaultLang(stylesRoot) ?? coreText("language");
  const numFromApp = (tag: string): number | null => {
    if (!appRoot) return null;
    const node = firstChild(appRoot, tag);
    if (!node) return null;
    const n = Number(rawText(node).trim());
    return Number.isFinite(n) ? n : null;
  };

  const headings: DocxAnalysis["headings"] = [];
  const fakeHeadings: DocxAnalysis["fakeHeadings"] = [];
  const paragraphs = body ? descendants(body, "p") : [];

  // Bound the extract passes: a doc within the size cap but made of millions of
  // tiny elements would still burn CPU/heap across the ~10 tree walks below.
  if (paragraphs.length > DOCX.MAX_PARAGRAPHS) {
    throw new DocxParseError(
      `This document has too many paragraphs (${paragraphs.length.toLocaleString()}) to analyze.`,
    );
  }

  let emptyHeadingCount = 0;
  const directOutlineLevel = (p: PONode): number | undefined => {
    const pPr = firstChild(p, "pPr");
    const outline = pPr ? firstChild(pPr, "outlineLvl") : undefined;
    const val = outline ? Number(attrOf(outline, "val")) : NaN;
    return Number.isInteger(val) && val >= 0 && val <= 5 ? val + 1 : undefined;
  };
  for (const p of paragraphs) {
    const styleId = paragraphStyleId(p);
    const level = (styleId ? headingStyles.get(styleId) : undefined) ?? directOutlineLevel(p);
    if (level) {
      const text = textOf(p).trim();
      // An empty Heading-styled paragraph (spacing habit) is not a heading —
      // it would inflate the outline and could satisfy "starts at H1" with
      // nothing. Counted for an advisory instead.
      if (text) headings.push({ level, text });
      else emptyHeadingCount++;
    } else if (isFakeHeading(p, headingStyles)) {
      fakeHeadings.push({ text: textOf(p).trim() });
    }
  }

  const bgNode = docRoot ? firstChild(docRoot, "background") : undefined;
  const documentBg = bgNode ? normalizeHex(attrOf(bgNode, "color")) : null;

  const images = body ? extractImages(body) : [];
  const links = body ? extractLinks(body, relMap) : [];
  const contrast = extractContrast(body, documentBg);

  // Auxiliary story parts — headers/footers (letterhead logos are the most
  // common image in agency documents), footnotes, and endnotes. Their
  // images, hyperlinks (each part has its OWN rels), and contrast runs were
  // previously invisible. Text-box content inside them is walked by the same
  // extractors.
  const auxPartNames = Object.keys(zip.files)
    .filter(
      (p) => /^word\/(header|footer)\d+\.xml$/.test(p) || /^word\/(footnotes|endnotes)\.xml$/.test(p),
    )
    .sort();
  for (const partName of auxPartNames) {
    const partXml = await read(partName);
    const roots = parseXml(partXml);
    const partRoot =
      rootElement(roots, "hdr") ??
      rootElement(roots, "ftr") ??
      rootElement(roots, "footnotes") ??
      rootElement(roots, "endnotes");
    if (!partRoot) continue;
    const partRels = parseRelationships(
      await read(partName.replace(/^word\/([^/]+)$/, "word/_rels/$1.rels")),
    );
    images.push(...extractImages(partRoot));
    links.push(...extractLinks(partRoot, partRels));
    const partContrast = extractContrast(partRoot, documentBg);
    contrast.checkedRuns += partContrast.checkedRuns;
    contrast.unresolvedRuns += partContrast.unresolvedRuns;
    contrast.failing.push(...partContrast.failing);
  }

  const partState = (
    xml: string | null,
    root: PONode | undefined,
  ): "ok" | "absent" | "unparseable" => (xml === null ? "absent" : root ? "ok" : "unparseable");

  return {
    metadata: {
      title: coreText("title"),
      creator: coreText("creator"),
      language,
      pageCount: numFromApp("Pages"),
      wordCount: numFromApp("Words"),
    },
    headings,
    fakeHeadings,
    emptyHeadingCount,
    images,
    tables: body ? extractTables(body) : [],
    links,
    lists: extractLists(paragraphs, styleInfo),
    contrast,
    paragraphCount: paragraphs.length,
    parse: {
      documentOk: !!body,
      stylesState: partState(stylesXml, stylesRoot),
      coreState: partState(coreXml, coreRoot),
    },
  };
}

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
import { XMLParser } from "fast-xml-parser";

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
  /** Inline/anchored images with their alt text (null when missing). */
  images: Array<{ altText: string | null; decorative: boolean }>;
  tables: Array<{
    hasHeaderRow: boolean;
    rowCount: number;
    colCount: number;
    hasNestedTable: boolean;
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
// preserveOrder walker utilities
// ---------------------------------------------------------------------------
// fast-xml-parser's preserveOrder mode returns each element as an object with
// a single tag key mapping to its ordered child array, plus an optional `:@`
// attribute bag. removeNSPrefix strips `w:`/`wp:`/etc. so we match local names.

type PONode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  preserveOrder: true,
  trimValues: false,
});

function parseXml(xml: string | null): PONode[] {
  if (!xml) return [];
  try {
    return parser.parse(xml) as PONode[];
  } catch {
    return [];
  }
}

function tagOf(node: PONode): string | null {
  for (const k of Object.keys(node)) {
    if (k === ":@" || k === "#text") continue;
    return k;
  }
  return "#text" in node ? "#text" : null;
}

function childrenOf(node: PONode): PONode[] {
  const t = tagOf(node);
  if (!t || t === "#text") return [];
  const v = node[t];
  return Array.isArray(v) ? (v as PONode[]) : [];
}

function attrOf(node: PONode, name: string): string | undefined {
  const bag = node[":@"] as Record<string, unknown> | undefined;
  const v = bag?.[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}

/** First direct child with the given local tag name. */
function firstChild(node: PONode, tag: string): PONode | undefined {
  return childrenOf(node).find((c) => tagOf(c) === tag);
}

/** All descendants (any depth) with the given local tag name. */
function descendants(node: PONode, tag: string): PONode[] {
  const out: PONode[] = [];
  const visit = (n: PONode): void => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === tag) out.push(c);
      visit(c);
    }
  };
  visit(node);
  return out;
}

/** Concatenate every `#text` under a node. */
function rawText(node: PONode): string {
  let s = "";
  const visit = (n: PONode): void => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === "#text") s += String(c["#text"] ?? "");
      else visit(c);
    }
  };
  visit(node);
  return s;
}

/** Text of a node from its `<w:t>` descendants only (ignores field codes). */
function textOf(node: PONode): string {
  return descendants(node, "t")
    .map((t) => rawText(t))
    .join("");
}

/** The single root element of a parsed part (skips the xml declaration node). */
function rootElement(nodes: PONode[], tag: string): PONode | undefined {
  return nodes.find((n) => tagOf(n) === tag);
}

// ---------------------------------------------------------------------------
// Heading style map
// ---------------------------------------------------------------------------

/** Map a style's id -> heading level (1-6) from styles.xml. */
function buildHeadingStyleMap(stylesRoot: PONode | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!stylesRoot) return map;
  for (const style of descendants(stylesRoot, "style")) {
    if (attrOf(style, "type") !== "paragraph") continue;
    const styleId = attrOf(style, "styleId");
    if (!styleId) continue;
    const nameNode = firstChild(style, "name");
    const nameVal = nameNode ? attrOf(nameNode, "val") ?? "" : "";
    let level: number | null = null;
    const byName = /^heading\s*([1-6])$/i.exec(nameVal.trim());
    const byId = /^Heading([1-6])$/.exec(styleId);
    if (byName) level = Number(byName[1]);
    else if (byId) level = Number(byId[1]);
    if (level) map.set(styleId, level);
  }
  return map;
}

/** Default document language from styles docDefaults, if declared. */
function stylesDefaultLang(stylesRoot: PONode | undefined): string | null {
  if (!stylesRoot) return null;
  const lang = descendants(stylesRoot, "lang").find((l) => attrOf(l, "val"));
  return lang ? attrOf(lang, "val") ?? null : null;
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

/** Bold + large + short + styleless → looks like a heading but isn't tagged. */
function isFakeHeading(p: PONode, headingStyles: Map<string, number>): boolean {
  const styleId = paragraphStyleId(p);
  if (styleId && headingStyles.has(styleId)) return false;
  const text = textOf(p).trim();
  if (!text || text.length > FAKE_HEADING_MAX_LEN) return false;
  return descendants(p, "r").some((r) => {
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
    const descr = attrOf(docPr, "descr")?.trim();
    const title = attrOf(docPr, "title")?.trim();
    let altText: string | null = null;
    if (descr) altText = descr;
    else if (title) altText = title;
    const decorative = descendants(docPr, "decorative").some(
      (d) => attrOf(d, "val") === "1",
    );
    images.push({ altText, decorative });
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

function extractTables(body: PONode): DocxAnalysis["tables"] {
  return topLevelTables(body).map((tbl) => {
    const rows = childrenOf(tbl).filter((c) => tagOf(c) === "tr");
    let cellCols = 0;
    let hasHeaderRow = false;
    let hasNestedTable = false;
    for (const row of rows) {
      const cells = childrenOf(row).filter((c) => tagOf(c) === "tc");
      cellCols = Math.max(cellCols, cells.length);
      const trPr = firstChild(row, "trPr");
      if (trPr && firstChild(trPr, "tblHeader")) hasHeaderRow = true;
      if (cells.some((tc) => descendants(tc, "tbl").length > 0))
        hasNestedTable = true;
    }
    const grid = firstChild(tbl, "tblGrid");
    const gridCols = grid
      ? childrenOf(grid).filter((c) => tagOf(c) === "gridCol").length
      : 0;
    return {
      hasHeaderRow,
      rowCount: rows.length,
      colCount: Math.max(cellCols, gridCols),
      hasNestedTable,
    };
  });
}

function extractLinks(
  body: PONode,
  relMap: Map<string, string>,
): DocxAnalysis["links"] {
  return descendants(body, "hyperlink").map((h) => {
    const text = textOf(h).trim();
    const id = attrOf(h, "id");
    const url = id && relMap.has(id) ? relMap.get(id)! : null;
    return { text, url };
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

// A paragraph that starts with a literal bullet or "1." / "2)" enumerator.
const MANUAL_BULLET_RE = /^\s*([••‣◦⁃∙*-]|\d+[.)])\s+/;

function hasNumPr(p: PONode): boolean {
  const pPr = firstChild(p, "pPr");
  return !!(pPr && firstChild(pPr, "numPr"));
}

function extractLists(paragraphs: PONode[]): DocxAnalysis["lists"] {
  let realListItems = 0;
  let manualBulletParagraphs = 0;
  for (const p of paragraphs) {
    if (hasNumPr(p)) {
      realListItems++;
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

const CONTRAST_MIN_NORMAL = 4.5;
const CONTRAST_MIN_LARGE = 3.0;
const LARGE_HALF_PT = 36; // ≥18pt
const LARGE_BOLD_HALF_PT = 28; // ≥14pt bold

function normalizeHex(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? m[1].toUpperCase() : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relLuminance(hexToRgb(fg));
  const l2 = relLuminance(hexToRgb(bg));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

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

function extractContrast(
  paragraphs: PONode[],
  documentBg: string | null,
): DocxAnalysis["contrast"] {
  let checkedRuns = 0;
  let unresolvedRuns = 0;
  const failing: DocxAnalysis["contrast"]["failing"] = [];

  for (const p of paragraphs) {
    const pPr = firstChild(p, "pPr");
    for (const run of descendants(p, "r")) {
      const text = textOf(run).trim();
      if (!text) continue;
      const rPr = firstChild(run, "rPr");
      const colorNode = rPr ? firstChild(rPr, "color") : undefined;
      const fg = colorNode ? normalizeHex(attrOf(colorNode, "val")) : null;
      if (!fg) {
        // No explicit color (inherits style/default) — not resolvable in v1.
        unresolvedRuns++;
        continue;
      }
      const bg = shdFill(rPr) ?? shdFill(pPr) ?? documentBg ?? "FFFFFF";
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
    }
  }
  return { checkedRuns, unresolvedRuns, failing };
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export async function analyzeDocx(buffer: Buffer): Promise<DocxAnalysis> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxParseError("The file is not a readable ZIP/DOCX package.");
  }

  const read = async (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f ? f.async("string") : null;
  };

  const documentXml = await read("word/document.xml");
  if (documentXml === null) {
    throw new DocxParseError(
      "word/document.xml is missing — the package is not a Word document.",
    );
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

  const relMap = new Map<string, string>();
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (relsRoot) {
    for (const rel of childrenOf(relsRoot)) {
      if (tagOf(rel) !== "Relationship") continue;
      const id = attrOf(rel, "Id");
      const target = attrOf(rel, "Target");
      if (id && target) relMap.set(id, target);
    }
  }

  const headingStyles = buildHeadingStyleMap(stylesRoot);

  // --- metadata ---
  const coreText = (tag: string): string | null => {
    if (!coreRoot) return null;
    const node = firstChild(coreRoot, tag);
    const t = node ? rawText(node).trim() : "";
    return t.length > 0 ? t : null;
  };
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

  for (const p of paragraphs) {
    const styleId = paragraphStyleId(p);
    const level = styleId ? headingStyles.get(styleId) : undefined;
    if (level) {
      headings.push({ level, text: textOf(p).trim() });
    } else if (isFakeHeading(p, headingStyles)) {
      fakeHeadings.push({ text: textOf(p).trim() });
    }
  }

  const bgNode = docRoot ? firstChild(docRoot, "background") : undefined;
  const documentBg = bgNode ? normalizeHex(attrOf(bgNode, "color")) : null;

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
    images: body ? extractImages(body) : [],
    tables: body ? extractTables(body) : [],
    links: body ? extractLinks(body, relMap) : [],
    lists: extractLists(paragraphs),
    contrast: extractContrast(paragraphs, documentBg),
    paragraphCount: paragraphs.length,
  };
}

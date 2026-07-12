/**
 * PPTX (OOXML / PresentationML) accessibility extractor. Pure JS on the
 * shared services/ooxml.ts core; output PptxAnalysis feeds scorePptx().
 *
 * v1 boundaries (see the Phase 2 plan): slide numbering follows the
 * ppt/slides/slide<N>.xml filenames (sldIdLst's id/r:id attributes collide
 * under removeNSPrefix); default master-inherited bullets are not resolved;
 * speaker notes are not read.
 */
import JSZip from "jszip";
import { PPTX } from "#config";
import {
  type PONode,
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  textOf,
  rootElement,
  parseRelationships,
  parseRelationshipEntries,
  corePropertyText,
  drawingAltText,
  MANUAL_BULLET_RE,
  CONTRAST_MIN_NORMAL,
  CONTRAST_MIN_LARGE,
  normalizeHex,
  contrastRatio,
  buildSchemeColorMap,
  readCapped,
} from "./ooxml.js";

export interface PptxMetadata {
  title: string | null;
  creator: string | null;
  /** Default run language from the presentation part, else the first master. */
  language: string | null;
  slideCount: number;
}

export interface PptxAnalysis {
  metadata: PptxMetadata;
  slides: Array<{
    index: number;
    title: string | null;
    titleIsFirstShape: boolean;
    shapeCount: number;
  }>;
  images: Array<{ altText: string | null; decorative: boolean }>;
  tables: Array<{ hasHeaderRow: boolean; rowCount: number; colCount: number }>;
  links: Array<{ text: string; url: string | null }>;
  lists: { realListItems: number; manualBulletParagraphs: number };
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
  hasMedia: boolean;
  shapeCount: number;
}

export class PptxParseError extends Error {
  code = "PPTX_PARSE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "PptxParseError";
  }
}

// PowerPoint run sizes are hundredths of a point (sz="1800" = 18pt).
const LARGE_HUNDREDTHS = 1800;
const LARGE_BOLD_HUNDREDTHS = 1400;

const CONTENT_SHAPE_TAGS = new Set(["sp", "pic", "graphicFrame", "grpSp", "cxnSp"]);

function isTitlePlaceholder(sp: PONode): boolean {
  const nv = firstChild(sp, "nvSpPr");
  const nvPr = nv ? firstChild(nv, "nvPr") : undefined;
  const ph = nvPr ? firstChild(nvPr, "ph") : undefined;
  const t = ph ? attrOf(ph, "type") : undefined;
  return t === "title" || t === "ctrTitle";
}

/** A shape the reading order cares about: any sp/pic/graphicFrame etc. */
function contentShapes(spTree: PONode): PONode[] {
  return childrenOf(spTree).filter((c) => CONTENT_SHAPE_TAGS.has(tagOf(c) ?? ""));
}

/**
 * Total shape-tag elements under spTree at ANY depth. contentShapes() above
 * (direct children only) is the correct semantic for reading order — a
 * grouped shape is one unit in the top-level flow — but it is the wrong
 * input for the MAX_SHAPES cap: wrapping arbitrarily many shapes inside one
 * top-level <p:grpSp> makes contentShapes() report a single shape while
 * collectSlideContent still walks every one of them (descendants() does not
 * stop at group boundaries). This any-depth tally is what the cap checks
 * against, so grouping can no longer hide unbounded work from it. Exported
 * for direct unit testing (see pptxService.test.ts).
 */
export function countShapesAnyDepth(spTree: PONode): number {
  let total = 0;
  for (const tag of CONTENT_SHAPE_TAGS) total += descendants(spTree, tag).length;
  return total;
}

/**
 * Any-depth count of the text elements — paragraphs (<a:p>) and text runs
 * (<a:r>) — under spTree. countShapesAnyDepth above bounds shape CONTAINERS,
 * but a single legal <p:sp> can hold an unbounded txBody, and it is these
 * paragraphs/runs (not the containers) that drive the expensive work:
 * collectSlideContrast walks every run, and the list pass walks every
 * paragraph. So MAX_SHAPES alone leaves a wide-open sibling vector — one
 * shape, a million runs. This tally is checked against PPTX.MAX_TEXT_ELEMENTS
 * (the MAX_PARAGRAPHS analogue). Exported for direct unit testing.
 */
export function countTextElementsAnyDepth(spTree: PONode): number {
  return descendants(spTree, "p").length + descendants(spTree, "r").length;
}

export async function analyzePptx(buffer: Buffer): Promise<PptxAnalysis> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PptxParseError("The file is not a readable ZIP/PPTX package.");
  }
  const read = (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f
      ? readCapped(f, PPTX.MAX_UNCOMPRESSED_BYTES, p, (m) => new PptxParseError(m))
      : Promise.resolve(null);
  };

  const presentationXml = await read("ppt/presentation.xml");
  if (presentationXml === null) {
    throw new PptxParseError(
      "ppt/presentation.xml is missing — the package is not a PowerPoint presentation.",
    );
  }
  const presRoot = rootElement(parseXml(presentationXml), "presentation");
  const coreRoot = rootElement(parseXml(await read("docProps/core.xml")), "coreProperties");
  // Resolve every scheme color ONCE per analysis (not once per text run —
  // see buildSchemeColorMap's doc comment) and drop the theme AST once the
  // map is built so a large theme part isn't retained across the slide loop.
  let themeRoot: PONode | undefined = rootElement(
    parseXml(await read("ppt/theme/theme1.xml")),
    "theme",
  );
  const schemeColorMap = buildSchemeColorMap(themeRoot);
  // Intentional: drop the (potentially large) parsed theme AST so it isn't
  // retained by closures across the slide loop below (see comment above).
  // eslint-disable-next-line no-useless-assignment
  themeRoot = undefined;

  // Slide parts in filename order (v1 boundary — see module doc comment).
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(
      (a, b) => Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]),
    );
  if (slidePaths.length > PPTX.MAX_SLIDES) {
    throw new PptxParseError(
      `This presentation has too many slides (${slidePaths.length.toLocaleString()}) to analyze.`,
    );
  }

  // Language: presentation defaultTextStyle a:defRPr lang, else first master.
  let language: string | null = null;
  if (presRoot) {
    const defRPr = descendants(presRoot, "defRPr").find((d) => attrOf(d, "lang"));
    language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
  }
  if (!language) {
    const masterXml = await read("ppt/slideMasters/slideMaster1.xml");
    const masterRoot = rootElement(parseXml(masterXml), "sldMaster");
    if (masterRoot) {
      const defRPr = descendants(masterRoot, "defRPr").find((d) => attrOf(d, "lang"));
      language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
    }
  }

  const analysis: PptxAnalysis = {
    metadata: {
      title: corePropertyText(coreRoot, "title"),
      creator: corePropertyText(coreRoot, "creator"),
      language,
      slideCount: slidePaths.length,
    },
    slides: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 0,
  };

  // Running any-depth text-element (paragraph + run) tally across all slides,
  // checked against MAX_TEXT_ELEMENTS. Kept local (not on PptxAnalysis) so the
  // analysis OUTPUT shape is unchanged for valid documents.
  let textElementCount = 0;

  for (let i = 0; i < slidePaths.length; i++) {
    const slideXml = await read(slidePaths[i]);
    const slideRoot = rootElement(parseXml(slideXml), "sld");
    const relsXml = await read(
      slidePaths[i].replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"),
    );
    const relMap = parseRelationships(relsXml);
    const relEntries = parseRelationshipEntries(relsXml);
    if (relEntries.some((r) => /\/(audio|video)$/.test(r.type))) {
      analysis.hasMedia = true;
    }
    if (!slideRoot) {
      analysis.slides.push({ index: i + 1, title: null, titleIsFirstShape: false, shapeCount: 0 });
      continue;
    }
    const spTree = descendants(slideRoot, "spTree")[0];
    const shapes = spTree ? contentShapes(spTree) : [];
    // Counted on slideRoot (not spTree) because image/table extraction —
    // walkPicsAndFrames(slideRoot) and the pic/frame descendants walks — runs
    // on the whole slide and pushes into the UNCAPPED analysis.images/tables.
    // Bare shape-tag elements (e.g. <p:pic> with no runs, so the text cap
    // can't catch them) placed under <p:sld> but OUTSIDE <p:spTree> (a cSld
    // sibling, or a no-spTree slide) would otherwise grow those arrays
    // unbounded while shapeCount stayed 0. For any valid deck all shapes live
    // in spTree, so this counts the same elements. contentShapes() above is
    // unchanged (direct children, reading-order/title-first) — only the cap
    // tally's root changes.
    analysis.shapeCount += countShapesAnyDepth(slideRoot);
    if (analysis.shapeCount > PPTX.MAX_SHAPES) {
      throw new PptxParseError(
        `This presentation has too many shapes (${analysis.shapeCount.toLocaleString()}+) to analyze.`,
      );
    }
    // Bound the per-run/per-paragraph extract passes below: one shape can hold
    // an unbounded txBody, so the shape cap alone doesn't stop a "one shape,
    // millions of runs" DoS. Counted on slideRoot (not spTree) because the
    // walks it bounds — the links loop descendants(slideRoot,"r") and the list
    // loop descendants(slideRoot,"p") — run on the whole slide; p/r placed
    // under <p:sld> but OUTSIDE <p:spTree> (a cSld sibling, or a slide with no
    // spTree) would otherwise be walked but uncounted. For any valid deck all
    // p/r live inside spTree, so this counts the same elements. Must fire
    // before collectSlideContent runs.
    textElementCount += countTextElementsAnyDepth(slideRoot);
    if (textElementCount > PPTX.MAX_TEXT_ELEMENTS) {
      throw new PptxParseError(
        `This presentation has too many text elements (${textElementCount.toLocaleString()}+) to analyze.`,
      );
    }

    const titleSp = shapes.find((s) => tagOf(s) === "sp" && isTitlePlaceholder(s));
    const titleText = titleSp ? textOf(titleSp).trim() : "";
    const contentBearing = shapes.filter((s) => {
      const t = tagOf(s);
      if (t === "pic" || t === "graphicFrame") return true;
      return t === "sp" && textOf(s).trim().length > 0;
    });
    analysis.slides.push({
      index: i + 1,
      title: titleText.length > 0 ? titleText : null,
      titleIsFirstShape: !!titleSp && contentBearing.length > 0 && contentBearing[0] === titleSp,
      shapeCount: shapes.length,
    });

    collectSlideContent(analysis, slideRoot, relMap, schemeColorMap, spTree);
  }

  return analysis;
}

interface FrameAcc {
  tbl?: PONode;
  cNvPr?: PONode;
}

/**
 * Single linear pass over a slide collecting (a) pics that are NOT nested
 * inside any graphicFrame ("standalone" pics — a frame-nested pic is the
 * OLE-object fallback preview, not counted separately) and (b) each
 * graphicFrame's own nearest table and cNvPr.
 *
 * This replaces the old `for (frame of descendants(root,"graphicFrame")) for
 * (x of descendants(frame, tag))` pattern, which re-walks each frame's whole
 * subtree from scratch — O(frames x subtree size), quadratic when
 * graphicFrames are nested inside each other (never true of real PowerPoint
 * output, but not something a hostile ZIP has to respect). Every node is now
 * visited once; a tbl/cNvPr found while multiple frames are open is
 * attributed to the innermost one, matching `descendants(frame, tag)[0]`'s
 * "first at any depth" semantics for the realistic (non-nested) case.
 */
function walkPicsAndFrames(
  node: PONode,
  frameStack: FrameAcc[],
  standalonePics: PONode[],
  frames: FrameAcc[],
): void {
  const tag = tagOf(node);
  if (tag === "graphicFrame") {
    const acc: FrameAcc = {};
    frames.push(acc);
    frameStack.push(acc);
    for (const c of childrenOf(node)) walkPicsAndFrames(c, frameStack, standalonePics, frames);
    frameStack.pop();
    return;
  }
  if (tag === "pic") {
    if (frameStack.length === 0) {
      standalonePics.push(node);
      return; // its own cNvPr is resolved separately below; nothing enclosing cares about its subtree
    }
    // Frame-nested (e.g. an OLE fallback preview) — fall through so its
    // internal cNvPr can still satisfy the enclosing frame's "not a table" lookup.
  } else if (tag === "tbl") {
    const top = frameStack[frameStack.length - 1];
    if (top && !top.tbl) top.tbl = node;
  } else if (tag === "cNvPr") {
    const top = frameStack[frameStack.length - 1];
    if (top && !top.cNvPr) top.cNvPr = node;
  }
  for (const c of childrenOf(node)) walkPicsAndFrames(c, frameStack, standalonePics, frames);
}

function collectSlideContent(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  relMap: Map<string, string>,
  schemeColorMap: Map<string, string>,
  spTree: PONode | undefined,
): void {
  // Images: pictures always — except a pic nested inside a graphicFrame,
  // which is the OLE-object fallback preview; the frame itself is the one
  // visual object (counted below), so counting its inner pic too would
  // double-bill a single object's missing alt text.
  const standalonePics: PONode[] = [];
  const frames: FrameAcc[] = [];
  walkPicsAndFrames(slideRoot, [], standalonePics, frames);
  for (const pic of standalonePics) {
    const cNvPr = descendants(pic, "cNvPr")[0];
    if (cNvPr) analysis.images.push(drawingAltText(cNvPr));
  }
  for (const frame of frames) {
    if (frame.tbl) {
      const tbl = frame.tbl;
      const rows = descendants(tbl, "tr").length;
      const grid = firstChild(tbl, "tblGrid");
      const cols = grid ? childrenOf(grid).filter((c) => tagOf(c) === "gridCol").length : 0;
      const tblPr = firstChild(tbl, "tblPr");
      analysis.tables.push({
        hasHeaderRow: !!tblPr && attrOf(tblPr, "firstRow") === "1",
        rowCount: rows,
        colCount: cols,
      });
    } else if (frame.cNvPr) {
      analysis.images.push(drawingAltText(frame.cNvPr));
    }
  }

  // Links: any run whose rPr carries a:hlinkClick with an r:id.
  for (const run of descendants(slideRoot, "r")) {
    const rPr = firstChild(run, "rPr");
    const hlink = rPr ? firstChild(rPr, "hlinkClick") : undefined;
    if (!hlink) continue;
    const id = attrOf(hlink, "id");
    analysis.links.push({
      text: textOf(run).trim(),
      url: id && relMap.has(id) ? relMap.get(id)! : null,
    });
  }

  // Lists: explicit bullet evidence only (v1 boundary — master defaults not
  // resolved). Title paragraphs are excluded; they're headings, not list items.
  const titleParagraphs = new Set<PONode>();
  if (spTree) {
    for (const sp of contentShapes(spTree)) {
      if (tagOf(sp) === "sp" && isTitlePlaceholder(sp)) {
        for (const p of descendants(sp, "p")) titleParagraphs.add(p);
      }
    }
  }
  for (const p of descendants(slideRoot, "p")) {
    if (titleParagraphs.has(p)) continue;
    const pPr = firstChild(p, "pPr");
    const hasExplicitBullet =
      !!pPr && (!!firstChild(pPr, "buChar") || !!firstChild(pPr, "buAutoNum"));
    if (hasExplicitBullet) analysis.lists.realListItems++;
    else if (MANUAL_BULLET_RE.test(textOf(p))) analysis.lists.manualBulletParagraphs++;
  }

  collectSlideContrast(analysis, slideRoot, schemeColorMap, spTree);
}

/** Explicit solidFill color off a properties node: srgbClr or theme schemeClr
 *  (looked up in a pre-resolved map — see buildSchemeColorMap — instead of
 *  re-walking the theme part on every call). */
function explicitFill(
  node: PONode | undefined,
  schemeColorMap: Map<string, string>,
): string | null {
  if (!node) return null;
  const fill = firstChild(node, "solidFill");
  if (!fill) return null;
  const srgb = firstChild(fill, "srgbClr");
  if (srgb) return normalizeHex(attrOf(srgb, "val"));
  const scheme = firstChild(fill, "schemeClr");
  if (scheme) {
    const name = attrOf(scheme, "val");
    return name ? (schemeColorMap.get(name) ?? null) : null;
  }
  return null;
}

function collectSlideContrast(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  schemeColorMap: Map<string, string>,
  spTree: PONode | undefined,
): void {
  // Slide background: explicit solid fill on p:bg, else white.
  const bgNode = descendants(slideRoot, "bg")[0];
  const bgPr = bgNode ? firstChild(bgNode, "bgPr") : undefined;
  const slideBg = explicitFill(bgPr, schemeColorMap) ?? "FFFFFF";

  if (!spTree) return;
  for (const sp of contentShapes(spTree)) {
    if (tagOf(sp) !== "sp") continue;
    const spPr = firstChild(sp, "spPr");
    const shapeBg = explicitFill(spPr, schemeColorMap) ?? slideBg;
    for (const run of descendants(sp, "r")) {
      const text = textOf(run).trim();
      if (!text) continue;
      const rPr = firstChild(run, "rPr");
      const fg = rPr ? explicitFill(rPr, schemeColorMap) : null;
      if (!fg) {
        analysis.contrast.unresolvedRuns++;
        continue;
      }
      analysis.contrast.checkedRuns++;
      const sz = rPr ? Number(attrOf(rPr, "sz")) : NaN;
      const bold = rPr ? attrOf(rPr, "b") === "1" : false;
      const large =
        (Number.isFinite(sz) && sz >= LARGE_HUNDREDTHS) ||
        (bold && Number.isFinite(sz) && sz >= LARGE_BOLD_HUNDREDTHS);
      const ratio = contrastRatio(fg, shapeBg);
      const min = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
      if (ratio < min) {
        analysis.contrast.failing.push({
          text,
          ratio: Math.round(ratio * 100) / 100,
          foreground: `#${fg}`,
          background: `#${shapeBg}`,
          large,
        });
      }
    }
  }
}

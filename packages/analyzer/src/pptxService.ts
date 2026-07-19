/**
 * PPTX (OOXML / PresentationML) accessibility extractor. Pure JS on the
 * shared services/ooxml.ts core; output PptxAnalysis feeds scorePptx().
 *
 * Boundaries: speaker notes are not read; slide numbering resolves through
 * p:sldIdLst + presentation rels (filename order as fallback); master
 * bodyStyle bullets are inherited for body-placeholder paragraphs.
 */
import JSZip from "jszip";
import { PPTX, OOXML } from "#config";
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
  assertZipWithinLimits,
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
    /** Slide is hidden (p:sld show="0") — excluded from title judgment. */
    hidden?: boolean;
    index: number;
    title: string | null;
    titleIsFirstShape: boolean;
    shapeCount: number;
  }>;
  images: Array<{ altText: string | null; decorative: boolean; titleOnly: boolean }>;
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

  // Aggregate zip-package limits (entry count + total declared uncompressed
  // size) — checked once, right after loadAsync, before any part is read.
  // See OOXML in #config for rationale; this closes the gap PPTX.
  // MAX_UNCOMPRESSED_BYTES leaves open (it only bounds any ONE part, not the
  // sum across every part a legal .pptx can contain).
  assertZipWithinLimits(
    zip,
    {
      maxEntries: OOXML.MAX_ZIP_ENTRIES,
      maxTotalUncompressedBytes: OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES,
    },
    (m) => new PptxParseError(m),
  );

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

  // Slide parts in PRESENTATION order — resolved from p:sldIdLst through the
  // presentation rels, so findings point at the slides the author actually
  // sees after reordering. Filename order is only the fallback when the id
  // list or rels are missing/unresolvable.
  const filenameOrdered = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(
      (a, b) => Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]),
    );
  let slidePaths = filenameOrdered;
  if (presRoot) {
    const presRels = parseRelationshipEntries(await read("ppt/_rels/presentation.xml.rels"));
    const relTargets = new Map(
      presRels.map((r) => [r.id, `ppt/${r.target.replace(/^\.\//, "").replace(/^\//, "")}`]),
    );
    // <p:sldId id="256" r:id="rId2"/> — with removeNSPrefix, r:id serializes
    // after id and lands in the same "id" attribute slot, so attrOf yields
    // the RELATIONSHIP id (matching how xlsxService reads sheet r:id).
    const orderedPaths = descendants(presRoot, "sldId")
      .map((sldId) => relTargets.get(attrOf(sldId, "id") ?? ""))
      .filter((p): p is string => !!p && filenameOrdered.includes(p));
    if (orderedPaths.length > 0) {
      const remainder = filenameOrdered.filter((p) => !orderedPaths.includes(p));
      slidePaths = [...orderedPaths, ...remainder];
    }
  }
  if (slidePaths.length > PPTX.MAX_SLIDES) {
    throw new PptxParseError(
      `This presentation has too many slides (${slidePaths.length.toLocaleString()}) to analyze.`,
    );
  }

  // Master part — used for the language fallback AND the body list styles
  // (PowerPoint-native decks inherit their bullets from bodyStyle, with no
  // explicit bu* on the slide paragraphs).
  const masterRoot = rootElement(
    parseXml(await read("ppt/slideMasters/slideMaster1.xml")),
    "sldMaster",
  );

  // Language: presentation defaultTextStyle a:defRPr lang, else first master.
  let language: string | null = null;
  if (presRoot) {
    const defRPr = descendants(presRoot, "defRPr").find((d) => attrOf(d, "lang"));
    language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
  }
  if (!language && masterRoot) {
    const defRPr = descendants(masterRoot, "defRPr").find((d) => attrOf(d, "lang"));
    language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
  }

  // Per-level body bullet defaults from the master's bodyStyle: lvlNpPr with
  // buChar/buAutoNum = bulleted level; buNone = explicitly unbulleted.
  const masterBodyBullets = new Map<number, "bullet" | "none">();
  if (masterRoot) {
    const bodyStyle = descendants(masterRoot, "bodyStyle")[0];
    if (bodyStyle) {
      for (const child of childrenOf(bodyStyle)) {
        const m = /^lvl(\d)pPr$/.exec(tagOf(child) ?? "");
        if (!m) continue;
        const lvl = Number(m[1]);
        if (firstChild(child, "buChar") || firstChild(child, "buAutoNum")) {
          masterBodyBullets.set(lvl, "bullet");
        } else if (firstChild(child, "buNone")) {
          masterBodyBullets.set(lvl, "none");
        }
      }
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

  // Run-level language tally. PresentationML stores language on each run's
  // a:rPr@lang; deck-level defaults are frequently ABSENT (Google Slides
  // exports systematically omit them) while every run still declares its
  // language. Used after the slide loop as a fallback for
  // metadata.language, so 3.1.1 is only ever asserted when no language
  // exists anywhere in the file.
  const runLangTally = new Map<string, number>();

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
      if (t === "pic") {
        // A decorative picture (full-bleed background wash, ornament) is
        // skipped by assistive technology — it must not void "the title
        // reads first" just because it precedes the title in z-order.
        const cNvPr = descendants(s, "cNvPr")[0];
        return !(cNvPr && drawingAltText(cNvPr).decorative);
      }
      if (t === "graphicFrame") return true;
      return t === "sp" && textOf(s).trim().length > 0;
    });
    analysis.slides.push({
      index: i + 1,
      hidden: attrOf(slideRoot, "show") === "0",
      title: titleText.length > 0 ? titleText : null,
      titleIsFirstShape: !!titleSp && contentBearing.length > 0 && contentBearing[0] === titleSp,
      shapeCount: shapes.length,
    });

    for (const rPr of descendants(slideRoot, "rPr")) {
      const runLang = attrOf(rPr, "lang");
      if (runLang) runLangTally.set(runLang, (runLangTally.get(runLang) ?? 0) + 1);
    }

    collectSlideContent(analysis, slideRoot, relMap, schemeColorMap, spTree, masterBodyBullets);
  }

  if (!analysis.metadata.language && runLangTally.size > 0) {
    analysis.metadata.language = [...runLangTally.entries()].sort((a, b) => b[1] - a[1])[0][0];
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
  coveredGroups: PONode[],
): void {
  const tag = tagOf(node);
  if (tag === "grpSp") {
    // Alt text (or the decorative mark) set on the GROUP — the pattern
    // Microsoft's Alt Text UI applies to grouped objects — covers its
    // members: AT announces the group as one object. Counting each member
    // as alt-less produced false confirmed 1.1.1 failures.
    const groupPr = descendants(node, "cNvPr")[0]; // nvGrpSpPr precedes members
    if (groupPr) {
      const alt = drawingAltText(groupPr);
      if (alt.altText || alt.decorative) {
        coveredGroups.push(groupPr);
        return;
      }
    }
    // No group-level alt — fall through and walk members individually.
  }
  if (tag === "graphicFrame") {
    const acc: FrameAcc = {};
    frames.push(acc);
    frameStack.push(acc);
    for (const c of childrenOf(node)) walkPicsAndFrames(c, frameStack, standalonePics, frames, coveredGroups);
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
  for (const c of childrenOf(node)) walkPicsAndFrames(c, frameStack, standalonePics, frames, coveredGroups);
}

function collectSlideContent(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  relMap: Map<string, string>,
  schemeColorMap: Map<string, string>,
  spTree: PONode | undefined,
  masterBodyBullets: Map<number, "bullet" | "none">,
): void {
  // Images: pictures always — except a pic nested inside a graphicFrame,
  // which is the OLE-object fallback preview; the frame itself is the one
  // visual object (counted below), so counting its inner pic too would
  // double-bill a single object's missing alt text. Groups carrying their
  // own alt/decorative cover their members (one announced object).
  const standalonePics: PONode[] = [];
  const frames: FrameAcc[] = [];
  const coveredGroups: PONode[] = [];
  walkPicsAndFrames(slideRoot, [], standalonePics, frames, coveredGroups);
  for (const groupPr of coveredGroups) {
    analysis.images.push(drawingAltText(groupPr));
  }
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
      // ST_Boolean admits "true" as well as "1".
      const firstRow = tblPr ? (attrOf(tblPr, "firstRow") ?? "") : "";
      analysis.tables.push({
        hasHeaderRow: firstRow === "1" || firstRow.toLowerCase() === "true",
        rowCount: rows,
        colCount: cols,
      });
    } else if (frame.cNvPr) {
      analysis.images.push(drawingAltText(frame.cNvPr));
    }
  }

  // Text links. PowerPoint splits one hyperlink across several runs on any
  // formatting boundary — CONSECUTIVE runs sharing one r:id within a
  // paragraph are ONE link (fragments inflated counts and diluted ratios).
  for (const p of descendants(slideRoot, "p")) {
    let currentId: string | null = null;
    let buf = "";
    const flush = (): void => {
      if (currentId !== null) {
        analysis.links.push({
          text: buf.trim(),
          url: relMap.get(currentId) ?? null,
        });
      }
      currentId = null;
      buf = "";
    };
    for (const run of childrenOf(p).filter((c) => tagOf(c) === "r")) {
      const rPr = firstChild(run, "rPr");
      const hlink = rPr ? firstChild(rPr, "hlinkClick") : undefined;
      const id = hlink ? (attrOf(hlink, "id") ?? "") : undefined;
      if (id === undefined) {
        flush();
        continue;
      }
      if (currentId !== null && id !== currentId) flush();
      currentId = id;
      buf += textOf(run);
    }
    flush();
  }
  // Shape/picture-level links (image buttons): a:hlinkClick on the cNvPr.
  // The object's alt text is its accessible name, so it doubles as link text.
  for (const cNvPr of descendants(slideRoot, "cNvPr")) {
    const hlink = firstChild(cNvPr, "hlinkClick");
    if (!hlink) continue;
    const id = attrOf(hlink, "id");
    const alt = drawingAltText(cNvPr);
    analysis.links.push({
      text: (alt.altText ?? "").trim(),
      url: id && relMap.has(id) ? relMap.get(id)! : null,
    });
  }

  // Lists. Real items are explicit buChar/buAutoNum, OR — the PowerPoint-
  // native pattern — paragraphs in a BODY PLACEHOLDER whose level inherits a
  // bullet from the master's bodyStyle (no explicit bu* on the slide at
  // all). Title paragraphs are excluded; explicit buNone opts a paragraph
  // out of inheritance.
  const titleParagraphs = new Set<PONode>();
  const placeholderParagraphs = new Set<PONode>();
  if (spTree) {
    for (const sp of contentShapes(spTree)) {
      if (tagOf(sp) !== "sp") continue;
      if (isTitlePlaceholder(sp)) {
        for (const p of descendants(sp, "p")) titleParagraphs.add(p);
      } else if (descendants(sp, "ph").length > 0) {
        for (const p of descendants(sp, "p")) placeholderParagraphs.add(p);
      }
    }
  }
  for (const p of descendants(slideRoot, "p")) {
    if (titleParagraphs.has(p)) continue;
    const pPr = firstChild(p, "pPr");
    const hasExplicitBullet =
      !!pPr && (!!firstChild(pPr, "buChar") || !!firstChild(pPr, "buAutoNum"));
    const hasExplicitNone = !!pPr && !!firstChild(pPr, "buNone");
    const level = pPr ? Number(attrOf(pPr, "lvl") ?? "0") + 1 : 1;
    const inheritsBullet =
      !hasExplicitNone &&
      placeholderParagraphs.has(p) &&
      masterBodyBullets.get(level) === "bullet" &&
      textOf(p).trim().length > 0;
    if (hasExplicitBullet || inheritsBullet) analysis.lists.realListItems++;
    else if (!hasExplicitNone && MANUAL_BULLET_RE.test(textOf(p))) {
      analysis.lists.manualBulletParagraphs++;
    }
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
  // Background PROVENANCE: only two backgrounds are treated as resolved —
  // an explicit solid fill on the shape itself, or an explicit solid fill
  // on the slide's own p:bg/p:bgPr. Everything else (p:bgRef theme
  // references, layout/master-inherited backgrounds, gradient/picture
  // fills, shapes stacked over cards) is genuinely unknown at this layer.
  // The previous "else white" default failed white-titled dark-template
  // decks at "1:1" as a CONFIRMED 1.4.3 violation; unresolved runs are
  // counted and honestly reported as not-assessed instead.
  const bgNode = descendants(slideRoot, "bg")[0];
  const bgPr = bgNode ? firstChild(bgNode, "bgPr") : undefined;
  const slideBg: string | null = explicitFill(bgPr, schemeColorMap);

  if (!spTree) return;
  for (const sp of contentShapes(spTree)) {
    if (tagOf(sp) !== "sp") continue;
    const spPr = firstChild(sp, "spPr");
    const shapeBg: string | null = explicitFill(spPr, schemeColorMap) ?? slideBg;
    for (const run of descendants(sp, "r")) {
      const text = textOf(run).trim();
      if (!text) continue;
      const rPr = firstChild(run, "rPr");
      const fg = rPr ? explicitFill(rPr, schemeColorMap) : null;
      if (!fg || !shapeBg) {
        analysis.contrast.unresolvedRuns++;
        continue;
      }
      const sz = rPr ? Number(attrOf(rPr, "sz")) : NaN;
      const sizeKnown = Number.isFinite(sz);
      const bold = rPr ? attrOf(rPr, "b") === "1" : false;
      const large =
        (sizeKnown && sz >= LARGE_HUNDREDTHS) || (bold && sizeKnown && sz >= LARGE_BOLD_HUNDREDTHS);
      const ratio = contrastRatio(fg, shapeBg);
      // Font size is frequently inherited from the placeholder/layout/master
      // chain (no sz on the run). A ratio in the 3.0–4.5 band passes as
      // large text and fails as normal text — with the size unknown, which
      // bar applies cannot be determined, so the run is unresolved rather
      // than failed (master-sized 36pt titles were being held to 4.5:1).
      if (!sizeKnown && ratio >= CONTRAST_MIN_LARGE && ratio < CONTRAST_MIN_NORMAL) {
        analysis.contrast.unresolvedRuns++;
        continue;
      }
      analysis.contrast.checkedRuns++;
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

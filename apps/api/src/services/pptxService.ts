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
  resolveSchemeColor,
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
  const themeRoot = rootElement(parseXml(await read("ppt/theme/theme1.xml")), "theme");

  // Slide parts in filename order (v1 boundary — see module doc comment).
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(
      (a, b) =>
        Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]),
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
    analysis.shapeCount += shapes.length;
    if (analysis.shapeCount > PPTX.MAX_SHAPES) {
      throw new PptxParseError(
        `This presentation has too many shapes (${analysis.shapeCount.toLocaleString()}+) to analyze.`,
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
      titleIsFirstShape:
        !!titleSp && contentBearing.length > 0 && contentBearing[0] === titleSp,
      shapeCount: shapes.length,
    });

    collectSlideContent(analysis, slideRoot, relMap, themeRoot, spTree);
  }

  return analysis;
}

function collectSlideContent(
  _analysis: PptxAnalysis,
  _slideRoot: PONode,
  _relMap: Map<string, string>,
  _themeRoot: PONode | undefined,
  _spTree: PONode | undefined,
): void {
  // Filled in by the images/tables/links/lists and contrast tasks.
}

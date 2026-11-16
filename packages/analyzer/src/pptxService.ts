/**
 * PPTX (OOXML / PresentationML) accessibility extractor. Pure JS on the
 * shared services/ooxml.ts core; output PptxAnalysis feeds scorePptx().
 *
 * Boundaries: speaker notes are not read; slide numbering resolves through
 * p:sldIdLst + presentation rels (filename order as fallback); master
 * bodyStyle bullets are inherited for body-placeholder paragraphs.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import JSZip from "jszip";
import { PPTX, OOXML } from "#config";
import {
  type PONode,
  parseXml,
  parseMainXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  textOf,
  rawText,
  languageSample,
  addLanguagePrimary,
  LANGUAGE_SAMPLE_CHARS,
  predominantLanguage,
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
  xsdBoolean,
  relationshipIdsOf,
  resolveRelTarget,
  TEXTLESS_SHAPE_NEEDS_ALT,
  hasPictureFill,
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
  /** Whether docProps/core.xml (title) was present and readable (2026-10-05,
   *  the guard Word has had since 2026-09-01): "could not be read" must never
   *  score or gate as "no title". Optional so stored payloads stay valid. */
  parse?: { coreState: "ok" | "absent" | "unparseable" };
  slides: Array<{
    /** Slide is hidden (p:sld show="0"). A hidden slide is not presented, so
     *  it contributes to NO scored category (2026-11-12 — until then only
     *  its title, typed heading and language were left out, while its
     *  images, tables, links, lists and colours were still scored; Excel has
     *  skipped hidden sheets wholesale since v1.95.0). */
    hidden?: boolean;
    /** The slide part is missing or could not be parsed, so nothing on it
     *  was checked (2026-11-12). See unparsedSlides. */
    unparsed?: boolean;
    index: number;
    title: string | null;
    titleIsFirstShape: boolean;
    shapeCount: number;
  }>;
  /** Slides whose heading is TYPED rather than placed: a slide with no title
   *  placeholder, carrying a short line of explicitly large or bold text in an
   *  ordinary shape. Word has scored this since the start (docxService's
   *  fakeHeadings, WCAG 1.3.1 / failure F2); PowerPoint had no equivalent, so
   *  a slide whose heading is a floating 32pt text box was a Level A failure
   *  the report never mentioned. Distinct from a slide with NO heading at all,
   *  which is 2.4.10 Section Headings — Level AAA, outside what the law asks
   *  and deliberately unscored. */
  fakeHeadings: Array<{ slide: number; text: string }>;
  images: Array<{
    altText: string | null;
    decorative: boolean;
    titleOnly: boolean;
    /** Only a file name or placeholder word (WCAG F30) — see drawingAltText. */
    placeholderAlt?: string;
    /** A plain drawn shape with no text and no picture fill (2026-11-12) —
     *  see TEXTLESS_SHAPE_NEEDS_ALT in ooxml.ts. Absent on pictures. */
    drawnShape?: boolean;
  }>;
  tables: Array<{
    hasHeaderRow: boolean;
    rowCount: number;
    colCount: number;
    /** A bare grid — no table style (or "No Style, No Grid"), no visible cell
     *  border or fill, no header row: Word's looksLikeLayout rule, adopted
     *  2026-10-05. Never scored or gated. Optional for stored payloads. */
    looksLikeLayout?: boolean;
    /** The header row is marked but every one of its cells is empty
     *  (2026-10-06). Reported, never scored. Absent on older payloads. */
    emptyHeaderRow?: boolean;
  }>;
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
  /** 1-based numbers of slides whose part is missing or unparseable
   *  (2026-11-12). They were skipped without a word, so a deck with an
   *  unread slide could be graded as clean. Absent/empty = every slide read. */
  unparsedSlides?: number[];
  /** Every readable slide is hidden (2026-11-12). With nothing else to
   *  judge, the slides are audited as they are — none carries `hidden` —
   *  and the report says they are all hidden. */
  allSlidesHidden?: boolean;
  /** Characters of run text on visible slides (2026-11-12) — the evidence
   *  behind the text-extractability claim, as Excel's totalCellsWithValue
   *  is. Absent on older payloads, where the claim stays as it was. */
  textCharCount?: number;
  /** True when the deck sets no default language and `metadata.language` is
   *  the one declared on most of its visible text (2026-10-06). */
  languageFromText?: boolean;
  /** The first ~4,000 characters of visible slides' text, in slide order —
   *  the sample the declared language is checked against (2026-10-05, as
   *  PDF's textSample). Never leaves the worker. */
  textSample?: string;
  /** Every language (primary subtag) declared anywhere — on visible slides'
   *  runs and paragraph defaults, the presentation, or the master. A
   *  mismatch is never asserted for a language listed here. */
  declaredLanguages?: string[];
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
/** Longest a typed heading may be. Same 120 as the Word rule: past that it is
 *  a paragraph that happens to be emphasised, not a heading. */
const FAKE_HEADING_MAX_LEN = 120;

/**
 * Is this shape a heading someone typed instead of placing?
 *
 * DELIBERATELY NARROW, because a false accusation here costs more than a miss:
 * it must be a shape with NO placeholder role at all (a floating text box —
 * text in a body placeholder is content, and its size is usually inherited),
 * short, and set large or bold EXPLICITLY on its runs. Inherited sizes are
 * the false-positive trap this file already warns about ("frequently
 * inherited from the placeholder/layout/master"), so an inherited large size
 * proves nothing and is not read here.
 *
 * EVERY run that carries text must qualify (2026-11-16). Until then one
 * qualifying run was enough, so a sentence whose first few words are bold —
 * "Understand what data you need to most effectively use the law" — was a
 * heading, and so was a body-size sentence with one figure set large. Both
 * are emphasis inside a sentence. A heading is styled as a whole.
 *
 * Returns the text and the largest run size, so the caller can choose
 * between several boxes on one slide.
 */
function typedHeading(sp: PONode): { text: string; size: number } | null {
  if (tagOf(sp) !== "sp") return null;
  const nv = firstChild(sp, "nvSpPr");
  const nvPr = nv ? firstChild(nv, "nvPr") : undefined;
  if (nvPr && firstChild(nvPr, "ph")) return null; // any placeholder: not floating
  const text = textOf(sp).trim();
  if (!text || text.length > FAKE_HEADING_MAX_LEN) return null;
  let size = 0;
  for (const r of descendants(sp, "r")) {
    if (!textOf(r).trim()) continue; // a space between two runs says nothing
    const rPr = firstChild(r, "rPr");
    const raw = rPr ? attrOf(rPr, "sz") : undefined;
    const sz = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(sz)) return null; // inherited size — proves nothing
    const bold = !!rPr && xsdBoolean(attrOf(rPr, "b")) === true;
    if (!(sz >= LARGE_HUNDREDTHS || (bold && sz >= LARGE_BOLD_HUNDREDTHS))) return null;
    size = Math.max(size, sz);
  }
  return size > 0 ? { text, size } : null;
}

function contentShapes(spTree: PONode): PONode[] {
  return childrenOf(spTree).filter((c) => CONTENT_SHAPE_TAGS.has(tagOf(c) ?? ""));
}

// ---------------------------------------------------------------------------
// Where a placeholder paragraph's bullet comes from (2026-10-06). PowerPoint
// resolves it through a chain — the paragraph, its shape's own list style,
// the matching placeholder on the slide's LAYOUT, then the master's text
// style — and the parser read the master alone. The Title Slide layout's
// subtitle (bullets off in the layout, as in PowerPoint's and python-pptx's
// default template) and every footer, date and slide-number placeholder (the
// master's bullet-free "other" style) were counted as list items.
// ---------------------------------------------------------------------------

type BulletMark = "bullet" | "none";

/** Bullet marks per outline level (1–9) a txBody's own a:lstStyle sets. */
function lstStyleBullets(txBody: PONode | undefined): Map<number, BulletMark> {
  const out = new Map<number, BulletMark>();
  const lst = txBody ? firstChild(txBody, "lstStyle") : undefined;
  if (!lst) return out;
  for (const child of childrenOf(lst)) {
    const m = /^lvl(\d)pPr$/.exec(tagOf(child) ?? "");
    if (!m) continue;
    if (firstChild(child, "buChar") || firstChild(child, "buAutoNum"))
      out.set(Number(m[1]), "bullet");
    else if (firstChild(child, "buNone")) out.set(Number(m[1]), "none");
  }
  return out;
}

/** A shape's placeholder: its type (absent = "obj", the schema default) and idx. */
function placeholderKey(sp: PONode): { type: string; idx: string | undefined } | null {
  const ph = descendants(sp, "ph")[0];
  return ph ? { type: attrOf(ph, "type") ?? "obj", idx: attrOf(ph, "idx") } : null;
}

/** A layout's placeholders' list-style bullet marks, found the way PowerPoint
 *  matches a slide placeholder to its layout's: by idx, else by type. */
interface LayoutBullets {
  byIdx: Map<string, Map<number, BulletMark>>;
  byType: Map<string, Map<number, BulletMark>>;
}
const NO_LAYOUT: LayoutBullets = { byIdx: new Map(), byType: new Map() };

function layoutBullets(layoutRoot: PONode | undefined): LayoutBullets {
  const out: LayoutBullets = { byIdx: new Map(), byType: new Map() };
  const spTree = layoutRoot ? descendants(layoutRoot, "spTree")[0] : undefined;
  if (!spTree) return out;
  for (const sp of contentShapes(spTree)) {
    if (tagOf(sp) !== "sp") continue;
    const key = placeholderKey(sp);
    if (!key) continue;
    const marks = lstStyleBullets(firstChild(sp, "txBody"));
    if (key.idx !== undefined && !out.byIdx.has(key.idx)) out.byIdx.set(key.idx, marks);
    if (!out.byType.has(key.type)) out.byType.set(key.type, marks);
  }
  return out;
}

/** Placeholder types that take the master's "other" text style — never the
 *  body style's bullets. */
const OTHER_STYLE_PLACEHOLDERS = new Set(["dt", "ftr", "sldNum", "hdr"]);

/** At most this many distinct layout parts are read per deck; slides past
 *  it fall back to the master alone, as every slide did before. */
const MAX_LAYOUTS_READ = 256;

// ---------------------------------------------------------------------------
// The slide's background, followed to its layout and master (2026-10-06,
// user decision "follow it"), and the fills its shapes inherit. Every colour
// here is read STRICTLY: one stated colour, no modifiers (lumMod, tint,
// alpha …), no gradient or picture — anything else is unknown, never guessed.
// ---------------------------------------------------------------------------

/** At most this many distinct slide masters (and themes) are read per deck;
 *  slides past it use the first master, as every slide did before. */
const MAX_MASTERS_READ = 64;

/** The small part of a theme the background walk needs: the colour slots,
 *  and the two fill-style lists a fill or background reference indexes. */
interface ThemeInfo {
  slots: Map<string, string>;
  fills: PONode[];
  bgFills: PONode[];
}
const NO_THEME: ThemeInfo = { slots: new Map(), fills: [], bgFills: [] };

function themeInfo(themeRoot: PONode | undefined): ThemeInfo {
  if (!themeRoot) return NO_THEME;
  const list = (tag: string): PONode[] => {
    const el = descendants(themeRoot, tag)[0];
    return el ? childrenOf(el).filter((c) => tagOf(c) !== "#text") : [];
  };
  return {
    slots: buildSchemeColorMap(themeRoot),
    fills: list("fillStyleLst"),
    bgFills: list("bgFillStyleLst"),
  };
}

const CLR_MAP_KEYS = [
  "bg1",
  "tx1",
  "bg2",
  "tx2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];

/** A p:clrMap or a:overrideClrMapping as name → theme slot, or null. A dark
 *  template maps bg1 to dk1 and tx1 to lt1. */
function clrMapOf(el: PONode | undefined): Record<string, string> | null {
  if (!el) return null;
  const out: Record<string, string> = {};
  for (const k of CLR_MAP_KEYS) {
    const v = attrOf(el, k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The theme's colours under a colour map. */
function schemeFor(theme: ThemeInfo, clrMap: Record<string, string> | null): Map<string, string> {
  const m = new Map(theme.slots);
  for (const [name, slot] of Object.entries(clrMap ?? {})) {
    const hex = theme.slots.get(slot);
    if (hex) m.set(name, hex);
    else m.delete(name);
  }
  return m;
}

interface MasterInfo {
  root: PONode | undefined;
  theme: ThemeInfo;
  clrMap: Record<string, string> | null;
}
interface LayoutInfo {
  bullets: LayoutBullets;
  root: PONode | undefined;
  masterPath: string;
}

const COLOR_TAGS = new Set(["srgbClr", "schemeClr", "sysClr", "scrgbClr", "hslClr", "prstClr"]);
const firstColor = (node: PONode): PONode | undefined =>
  childrenOf(node).find((c) => COLOR_TAGS.has(tagOf(c) ?? ""));

/** The darkest and lightest a COMPUTED colour may honestly be drawn as. A
 *  shaded or blended channel rarely lands on a whole number and programs
 *  round differently (PowerPoint shows "Accent 1, Darker 50%" as #1F3864
 *  where the arithmetic gives 32.0 for the first channel), so a computed
 *  colour carries a range and judgeRun gives a verdict only when it holds
 *  across it. Kept per analysis, keyed by the colour: an analysis awaits,
 *  and two must never read each other's. */
interface ColourRange {
  dark: string;
  light: string;
}
const computedColours = new AsyncLocalStorage<Map<string, ColourRange>>();
const rangeOf = (hex: string | null | undefined): ColourRange | undefined =>
  hex ? computedColours.getStore()?.get(hex) : undefined;
function rememberRange(hex: string, range: ColourRange): void {
  if (range.dark === hex && range.light === hex) return;
  const store = computedColours.getStore();
  if (!store) return;
  const seen = store.get(hex);
  // The same colour reached two ways keeps the wider of the two ranges.
  store.set(hex, {
    dark: seen && seen.dark < range.dark ? seen.dark : range.dark,
    light: seen && seen.light > range.light ? seen.light : range.light,
  });
}

const hexOf = (rgb: number[], round: (n: number) => number): string =>
  rgb
    .map((v) =>
      Math.min(255, Math.max(0, round(Number(v.toFixed(6)))))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    )
    .join("");
const channelsOf = (hex: string): number[] =>
  [0, 1, 2].map((i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));

/** "75000" (thousandths of a percent) or "75%" (Strict), as a fraction. */
function fractionOf(v: string | undefined): number | null {
  const raw = (v ?? "").trim();
  if (raw === "") return null;
  const n = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw) / 100000;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** PowerPoint's "lighter / darker NN%" (2026-11-16, user decision): lumMod
 *  multiplies a colour's HSL lightness and lumOff adds to it, in the order
 *  written; hue and saturation are untouched. "Darker 25%" is lumMod 75%;
 *  "Lighter 40%" is lumMod 60% + lumOff 40%. Returns the colour to the
 *  nearest step, with one step either side as its range. */
function shadeColour(
  hex: string,
  steps: ReadonlyArray<{ kind: "lumMod" | "lumOff"; value: number }>,
): { color: string } & ColourRange {
  const [r, g, b] = channelsOf(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  for (const step of steps) {
    l = step.kind === "lumMod" ? l * step.value : l + step.value;
    l = Math.min(1, Math.max(0, l));
  }
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const rgb = [r1, g1, b1].map((v) => (v + m) * 255);
  return {
    color: hexOf(rgb, Math.round),
    dark: hexOf(
      rgb.map((v) => v - 0.5),
      Math.floor,
    ),
    light: hexOf(
      rgb.map((v) => v + 0.5),
      Math.ceil,
    ),
  };
}

/** A colour element read as far as it can be COMPUTED: its base colour, any
 *  lumMod / lumOff applied, and — only as the last modifier, the form
 *  PowerPoint writes — an opacity returned for the caller to blend. Any
 *  other modifier (tint, shade, satMod, hueMod …) is not guessed at: null. */
function colourOf(
  el: PONode | undefined,
  scheme: Map<string, string>,
  phClr: string | null = null,
): { color: string; alpha: number | null } | null {
  if (!el) return null;
  const base = baseColor(el, scheme, phClr);
  if (!base) return null;
  const steps: Array<{ kind: "lumMod" | "lumOff"; value: number }> = [];
  let alpha: number | null = null;
  for (const mod of childrenOf(el)) {
    const tag = tagOf(mod);
    if (tag === "#text") continue;
    if (alpha !== null) return null; // nothing may follow the opacity
    const value = fractionOf(attrOf(mod, "val"));
    if (value === null) return null;
    if (tag === "lumMod" || tag === "lumOff") steps.push({ kind: tag, value });
    else if (tag === "alpha" && value <= 1) alpha = value;
    else return null;
  }
  if (steps.length === 0) return { color: base, alpha };
  const shaded = shadeColour(base, steps);
  rememberRange(shaded.color, shaded);
  return { color: shaded.color, alpha };
}

/** One colour element resolved to ONE opaque colour, or null. A plain colour
 *  is itself; a shaded one (lumMod / lumOff) is computed; a see-through one,
 *  or one carrying any other modifier, is not guessed at. phClr is the
 *  colour a style reference supplies. */
function strictColor(
  el: PONode | undefined,
  scheme: Map<string, string>,
  phClr: string | null = null,
): string | null {
  const colour = colourOf(el, scheme, phClr);
  return colour && colour.alpha === null ? colour.color : null;
}

/** The colour an element names, before any modifier it carries. */
function baseColor(
  el: PONode,
  scheme: Map<string, string>,
  phClr: string | null = null,
): string | null {
  const tag = tagOf(el);
  if (tag === "srgbClr") return normalizeHex(attrOf(el, "val"));
  if (tag === "sysClr") return normalizeHex(attrOf(el, "lastClr"));
  if (tag === "schemeClr") {
    const v = attrOf(el, "val");
    if (v === "phClr") return phClr;
    return v ? (scheme.get(v) ?? null) : null;
  }
  return null;
}

/** A fill or background REFERENCE into the theme (fillRef, bgRef): idx
 *  1–999 is the fill-style list, 1001+ the background list, 0 no fill. A
 *  solid entry painted in the placeholder colour resolves to the colour the
 *  reference gives; anything else is unknown. */
function referencedFill(
  ref: PONode,
  scheme: Map<string, string>,
  theme: ThemeInfo,
): string | "unknown" | null {
  const idx = Number(attrOf(ref, "idx"));
  if (idx === 0) return null;
  const entry =
    idx >= 1001 ? theme.bgFills[idx - 1001] : idx >= 1 ? theme.fills[idx - 1] : undefined;
  if (!entry || tagOf(entry) !== "solidFill") return "unknown";
  return strictColor(firstColor(entry), scheme, strictColor(firstColor(ref), scheme)) ?? "unknown";
}

/** What a shape's own properties say it is filled with: a colour,
 *  "unknown" (gradient, picture, pattern, modified or unreadable colour),
 *  null (explicitly no fill), or undefined (it says nothing — a placeholder
 *  then inherits).
 *
 *  A shape marked useBgFill shows the slide's background (`background`,
 *  null when that is not one stated colour) over its theme style's fill:
 *  the full-slide rectangle PowerPoint's designer lays under the content
 *  still names the accent fill it would otherwise use (LibreOffice draws
 *  the background — verified on a real deck). One that ALSO states a fill
 *  of its own is drawn in that fill by LibreOffice; what PowerPoint draws
 *  is not certain, so the two must agree to be known. */
function shapeFill(
  sp: PONode,
  scheme: Map<string, string>,
  theme: ThemeInfo,
  background: string | null,
): string | "unknown" | null | undefined {
  const spPr = firstChild(sp, "spPr");
  let stated: string | "unknown" | null | undefined;
  if (spPr) {
    const solid = firstChild(spPr, "solidFill");
    if (solid) stated = strictColor(firstColor(solid), scheme) ?? "unknown";
    else if (firstChild(spPr, "noFill")) stated = null;
    else if (hasUnresolvableFill(spPr)) stated = "unknown";
  }
  if (xsdBoolean(attrOf(sp, "useBgFill")) === true) {
    const bg = background ?? "unknown";
    return stated === undefined || stated === bg ? bg : "unknown";
  }
  if (stated !== undefined) return stated;
  const style = firstChild(sp, "style");
  const fillRef = style ? firstChild(style, "fillRef") : undefined;
  return fillRef ? referencedFill(fillRef, scheme, theme) : undefined;
}

/** A part's own background (p:cSld/p:bg): undefined when it declares none —
 *  the next part up decides — null when it declares one that is not a single
 *  stated colour. */
function backgroundOf(
  root: PONode | undefined,
  scheme: Map<string, string>,
  theme: ThemeInfo,
): string | null | undefined {
  const cSld = root ? firstChild(root, "cSld") : undefined;
  const bg = cSld ? firstChild(cSld, "bg") : undefined;
  if (!bg) return undefined;
  const bgPr = firstChild(bg, "bgPr");
  if (bgPr) {
    const solid = firstChild(bgPr, "solidFill");
    return solid ? strictColor(firstColor(solid), scheme) : null;
  }
  const ref = firstChild(bg, "bgRef");
  if (!ref) return null;
  const fill = referencedFill(ref, scheme, theme);
  return fill === "unknown" ? null : fill;
}

/** What a layout or master paints on every slide that shows it: its shapes
 *  that are not placeholders (a placeholder is a template, never drawn). */
function paintersOfPart(
  root: PONode | undefined,
  scheme: Map<string, string>,
  theme: ThemeInfo,
  background: string | null,
): Painter[] {
  const cSld = root ? firstChild(root, "cSld") : undefined;
  const spTree = cSld ? firstChild(cSld, "spTree") : undefined;
  if (!spTree) return [];
  const out: Painter[] = [];
  for (const sp of contentShapes(spTree)) {
    if (descendants(sp, "ph").length > 0) continue;
    const painter = painterOf(sp, scheme, theme, background);
    if (painter) out.push(painter);
  }
  return out;
}

/** A part's placeholder shapes, findable the way PowerPoint matches them. */
function placeholderIndex(root: PONode | undefined): {
  byIdx: Map<string, PONode>;
  byType: Map<string, PONode>;
} {
  const out = { byIdx: new Map<string, PONode>(), byType: new Map<string, PONode>() };
  const cSld = root ? firstChild(root, "cSld") : undefined;
  const spTree = cSld ? firstChild(cSld, "spTree") : undefined;
  for (const sp of spTree ? contentShapes(spTree) : []) {
    const key = placeholderKey(sp);
    if (!key) continue;
    if (key.idx !== undefined && !out.byIdx.has(key.idx)) out.byIdx.set(key.idx, sp);
    if (!out.byType.has(key.type)) out.byType.set(key.type, sp);
  }
  return out;
}

/** The master placeholder a slide placeholder of this type inherits from. */
const masterPlaceholderType = (type: string): string =>
  type === "title" || type === "ctrTitle"
    ? "title"
    : OTHER_STYLE_PLACEHOLDERS.has(type)
      ? type
      : "body";

// ---------------------------------------------------------------------------
// A run's colour, size and weight, followed through the text styles
// (2026-10-06, user decision "follow it"). PowerPoint resolves each through a
// chain: the run, its paragraph, its shape's own list style, then — for a
// placeholder — the layout's and the master's matching placeholder and the
// master's title, body or "other" text style; for any other shape, its theme
// style's font colour, then the master's "other" style or the presentation's
// defaults. Colours are read by the backgrounds' strict rule. Where
// PowerPoint's precedence is not certain, sources that disagree leave the
// property unknown — never a guess.
// ---------------------------------------------------------------------------

/** What a run-properties element (a:rPr, a:defRPr) states about what the
 *  contrast check needs: undefined = says nothing (inherit), "unknown" =
 *  says something that is not one readable value. */
interface RunLook {
  fill?: string | "unknown";
  size?: number | "unknown";
  bold?: boolean | "unknown";
  highlight?: string | "unknown";
}
const LOOK_KEYS = ["fill", "size", "bold", "highlight"] as const;
const UNKNOWN_LOOK: RunLook = {
  fill: "unknown",
  size: "unknown",
  bold: "unknown",
  highlight: "unknown",
};

function runLookOf(el: PONode | undefined, scheme: Map<string, string>): RunLook {
  const look: RunLook = {};
  if (!el) return look;
  const solid = firstChild(el, "solidFill");
  if (solid) look.fill = strictColor(firstColor(solid), scheme) ?? "unknown";
  // Invisible (noFill), gradient, picture or pattern text has no one colour.
  else if (firstChild(el, "noFill") || hasUnresolvableFill(el)) look.fill = "unknown";
  const sz = attrOf(el, "sz");
  if (sz !== undefined) look.size = Number(sz) > 0 ? Number(sz) : "unknown";
  const b = attrOf(el, "b");
  if (b !== undefined) look.bold = xsdBoolean(b) ?? "unknown";
  const highlight = firstChild(el, "highlight");
  if (highlight) look.highlight = strictColor(firstColor(highlight), scheme) ?? "unknown";
  return look;
}

/** Each property from the higher source when it states one, else the lower. */
function over(high: RunLook, low: RunLook): RunLook {
  return {
    fill: high.fill ?? low.fill,
    size: high.size ?? low.size,
    bold: high.bold ?? low.bold,
    highlight: high.highlight ?? low.highlight,
  };
}

/** A property's value as drawn: text no source makes bold is not bold. */
const drawn = (k: (typeof LOOK_KEYS)[number], v: RunLook[(typeof LOOK_KEYS)[number]]) =>
  k === "bold" ? (v ?? false) : v;

/** A source PowerPoint may or may not honour, over the chain beneath it: a
 *  property it states that the chain does not give alike is unknown. */
function ifAgreeing(maybe: RunLook, chain: RunLook): RunLook {
  const out = { ...chain };
  for (const k of LOOK_KEYS)
    if (maybe[k] !== undefined && drawn(k, maybe[k]) !== drawn(k, chain[k])) out[k] = "unknown";
  return out;
}

/** Two sources, either of which may be the one PowerPoint uses: a property
 *  is known only when both give it alike. */
function eitherOf(a: RunLook, b: RunLook): RunLook {
  const out = over(a, b);
  for (const k of LOOK_KEYS) if (drawn(k, a[k]) !== drawn(k, b[k])) out[k] = "unknown";
  return out;
}

/** What a list style (a shape's a:lstStyle, a master's title/body/other
 *  style, the presentation's defaults) sets for an outline level (1–9):
 *  that level's run defaults, else the style's default paragraph's. */
function listStyleLook(
  list: PONode | undefined,
  level: number,
  scheme: Map<string, string>,
): RunLook {
  if (!list) return {};
  const at = (tag: string): RunLook => {
    const pPr = firstChild(list, tag);
    return runLookOf(pPr ? firstChild(pPr, "defRPr") : undefined, scheme);
  };
  return over(at(`lvl${level}pPr`), at("defPPr"));
}

const ownListStyle = (sp: PONode | undefined): PONode | undefined => {
  const txBody = sp ? firstChild(sp, "txBody") : undefined;
  return txBody ? firstChild(txBody, "lstStyle") : undefined;
};

/** The text colour a shape's theme style gives it (p:style/a:fontRef). */
function fontRefFill(
  sp: PONode | undefined,
  scheme: Map<string, string>,
): string | "unknown" | undefined {
  const style = sp ? firstChild(sp, "style") : undefined;
  const ref = style ? firstChild(style, "fontRef") : undefined;
  const color = ref ? firstColor(ref) : undefined;
  return color ? (strictColor(color, scheme) ?? "unknown") : undefined;
}

/** "62500" (transitional, thousandths of a percent) or "62.5%" (Strict). */
function percentOf(v: string | undefined): number | null {
  if (v === undefined) return 1;
  const n = v.trim().endsWith("%") ? Number(v.trim().slice(0, -1)) / 100 : Number(v) / 100000;
  return n > 0 && n <= 1 ? n : null;
}

/** The share of its stated size a shape's text is drawn at. PowerPoint's
 *  shrink-text-on-overflow writes it on the slide (a:normAutofit
 *  fontScale); null when it cannot be told — the slide states no autofit of
 *  its own while its layout or master placeholder carries a shrink. */
function fontScaleOf(sp: PONode, inheritedFrom: (PONode | undefined)[]): number | null {
  const bodyPrOf = (s: PONode | undefined) => {
    const txBody = s ? firstChild(s, "txBody") : undefined;
    return txBody ? firstChild(txBody, "bodyPr") : undefined;
  };
  const own = bodyPrOf(sp);
  const fit = own ? firstChild(own, "normAutofit") : undefined;
  if (fit) return percentOf(attrOf(fit, "fontScale"));
  if (own && (firstChild(own, "noAutofit") || firstChild(own, "spAutoFit"))) return 1;
  for (const s of inheritedFrom) {
    const b = bodyPrOf(s);
    const f = b ? firstChild(b, "normAutofit") : undefined;
    if (f && attrOf(f, "fontScale") !== undefined) return null;
  }
  return 1;
}

/** Only the colours two readings of a part's colour map give alike. */
function agreedScheme(a: Map<string, string>, b: Map<string, string>): Map<string, string> {
  return new Map([...a].filter(([k, v]) => b.get(k) === v));
}

const overrideMapOf = (part: PONode | undefined): Record<string, string> | null => {
  const ovr = part ? firstChild(part, "clrMapOvr") : undefined;
  return clrMapOf(ovr ? firstChild(ovr, "overrideClrMapping") : undefined);
};

interface ContrastContext {
  /** The theme's colours under the slide's colour map. */
  scheme: Map<string, string>;
  theme: ThemeInfo;
  /** The slide's own background, else its layout's, else its master's; null
   *  when that is not one stated colour. */
  background: string | null;
  /** What the master and layout paint beneath the slide's own shapes. */
  inherited: Painter[];
  /** A placeholder's inherited position and fill (layout, then master). */
  placeholder: (sp: PONode) => { bounds: ShapeRect | null; fill: string | "unknown" | null };
  /** What a slide shape's text inherits at an outline level (1–9) — its
   *  own list style and everything beneath it. */
  textLook: (sp: PONode) => (level: number) => RunLook;
  /** The share of its stated size a shape's text is drawn at; null = unknown. */
  fontScale: (sp: PONode) => number | null;
}

function contrastContextFor(
  slideRoot: PONode,
  layoutRoot: PONode | undefined,
  master: MasterInfo,
  defaultTextStyle: PONode | undefined,
): ContrastContext {
  // The slide's colours: its own override's; else the master's — unless its
  // layout re-maps them, when the slide may show either mapping and only the
  // colours both give alike are known. The text on the slide is drawn under
  // the slide's mapping (that is what an override is for: a dark slide turns
  // the master's tx1 text light). Whether what the layout and master DRAW
  // there is re-mapped too is not certain, so their backgrounds, shapes and
  // placeholder fills keep only the colours both readings give alike.
  const masterOwn = schemeFor(master.theme, master.clrMap);
  const layoutMap = overrideMapOf(layoutRoot);
  const layoutOwn = layoutMap ? schemeFor(master.theme, layoutMap) : masterOwn;
  const slideMap = overrideMapOf(slideRoot);
  const scheme = slideMap ? schemeFor(master.theme, slideMap) : agreedScheme(masterOwn, layoutOwn);
  const layoutScheme = agreedScheme(scheme, layoutOwn);
  const masterScheme = agreedScheme(scheme, masterOwn);

  let background = backgroundOf(slideRoot, scheme, master.theme);
  if (background === undefined) background = backgroundOf(layoutRoot, layoutScheme, master.theme);
  if (background === undefined) background = backgroundOf(master.root, masterScheme, master.theme);

  // showMasterSp="0" on the slide hides what its layout (and so its master)
  // paints; on the layout, what the master paints.
  const shows = (el: PONode | undefined): boolean =>
    xsdBoolean(el ? attrOf(el, "showMasterSp") : undefined) !== false;
  const inherited = !shows(slideRoot)
    ? []
    : [
        ...(shows(layoutRoot)
          ? paintersOfPart(master.root, masterScheme, master.theme, background ?? null)
          : []),
        ...paintersOfPart(layoutRoot, layoutScheme, master.theme, background ?? null),
      ];

  const layoutPh = placeholderIndex(layoutRoot);
  const masterPh = placeholderIndex(master.root);
  const matched = (sp: PONode) => {
    const key = placeholderKey(sp);
    if (!key) return null;
    const lp =
      key.idx !== undefined && layoutPh.byIdx.has(key.idx)
        ? layoutPh.byIdx.get(key.idx)
        : (layoutPh.byType.get(key.type) ??
          (key.type === "ctrTitle" ? layoutPh.byType.get("title") : undefined));
    return { key, lp, mp: masterPh.byType.get(masterPlaceholderType(key.type)) };
  };
  const placeholder = (sp: PONode) => {
    const m = matched(sp);
    if (!m) return { bounds: null, fill: null };
    const { lp, mp } = m;
    const bounds =
      (lp ? xfrmRect(firstChild(lp, "spPr")) : null) ??
      (mp ? xfrmRect(firstChild(mp, "spPr")) : null);
    const fromLayout = lp
      ? shapeFill(lp, layoutScheme, master.theme, background ?? null)
      : undefined;
    const fill =
      fromLayout !== undefined
        ? fromLayout
        : ((mp ? shapeFill(mp, masterScheme, master.theme, background ?? null) : undefined) ??
          null);
    return { bounds, fill };
  };

  const txStyles = master.root ? firstChild(master.root, "txStyles") : undefined;
  const txStyle = (name: string) => (txStyles ? firstChild(txStyles, name) : undefined);
  const textLook = (sp: PONode) => {
    const m = matched(sp);
    const ownFontRef = fontRefFill(sp, scheme);
    return (level: number): RunLook => {
      const own = listStyleLook(ownListStyle(sp), level, scheme);
      let below: RunLook;
      if (m) {
        // A placeholder: the layout's, then the master's placeholder, then
        // the master's text style for its kind.
        const style =
          m.key.type === "title" || m.key.type === "ctrTitle"
            ? "titleStyle"
            : OTHER_STYLE_PLACEHOLDERS.has(m.key.type)
              ? "otherStyle"
              : "bodyStyle";
        below = over(
          listStyleLook(ownListStyle(m.lp), level, scheme),
          over(
            listStyleLook(ownListStyle(m.mp), level, scheme),
            listStyleLook(txStyle(style), level, scheme),
          ),
        );
        // A theme-style font colour on a placeholder has no certain place in
        // that chain.
        for (const ref of [fontRefFill(m.mp, scheme), fontRefFill(m.lp, scheme), ownFontRef])
          if (ref !== undefined) below = ifAgreeing({ fill: ref }, below);
      } else {
        // Any other shape: PowerPoint's own files give the master's "other"
        // style and the presentation's defaults alike; when they differ it
        // is not certain which a text box takes. An inserted shape's theme
        // style colours its text over both (white on the accent fill).
        below = eitherOf(
          listStyleLook(txStyle("otherStyle"), level, scheme),
          listStyleLook(defaultTextStyle, level, scheme),
        );
        if (ownFontRef !== undefined) below = { ...below, fill: ownFontRef };
      }
      const look = over(own, below);
      // The shape's own list style against its theme-style font colour:
      // which wins is not certain.
      if (ownFontRef !== undefined && own.fill !== undefined && own.fill !== ownFontRef)
        look.fill = "unknown";
      return look;
    };
  };
  const fontScale = (sp: PONode) => {
    const m = matched(sp);
    return fontScaleOf(sp, m ? [m.lp, m.mp] : []);
  };

  return {
    scheme,
    theme: master.theme,
    background: background ?? null,
    inherited,
    placeholder,
    textLook,
    fontScale,
  };
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

/** PowerPoint's "No Style, No Grid" table style — style present, nothing drawn. */
const NO_STYLE_NO_GRID = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}";
const FILL_TAGS = ["solidFill", "gradFill", "pattFill", "blipFill"];

/** Word's looksLikeLayout rule for a PowerPoint table (2026-10-05): no table
 *  style (or "No Style, No Grid"), no visible cell border, no cell fill. Every
 *  table Insert → Table creates carries a style, so a bare grid is one an
 *  author stripped down to line things up — overwhelmingly a layout
 *  construct, which Word has never scored or gated. */
function tableLooksBare(tbl: PONode, tblPr: PONode | undefined): boolean {
  const styleEl = tblPr ? firstChild(tblPr, "tableStyleId") : undefined;
  const styleId = styleEl ? rawText(styleEl).trim().toUpperCase() : "";
  if (styleId && styleId !== NO_STYLE_NO_GRID) return false;
  for (const tcPr of descendants(tbl, "tcPr")) {
    if (FILL_TAGS.some((t) => firstChild(tcPr, t))) return false;
    for (const side of ["lnL", "lnR", "lnT", "lnB"]) {
      const ln = firstChild(tcPr, side);
      if (ln && !firstChild(ln, "noFill") && FILL_TAGS.some((t) => firstChild(ln, t))) return false;
    }
  }
  return true;
}

export function analyzePptx(buffer: Buffer): Promise<PptxAnalysis> {
  // One store of computed colours per analysis (see ColourRange).
  return computedColours.run(new Map(), () => analyzePptxPackage(buffer));
}

async function analyzePptxPackage(buffer: Buffer): Promise<PptxAnalysis> {
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
  // A text box's text defaults (with the master's "other" style).
  const defaultTextStyle = presRoot ? firstChild(presRoot, "defaultTextStyle") : undefined;
  const coreXml = await read("docProps/core.xml");
  const coreRoot = rootElement(parseXml(coreXml), "coreProperties");
  const coreState: "ok" | "absent" | "unparseable" =
    coreXml === null ? "absent" : coreRoot ? "ok" : "unparseable";
  // Resolve every scheme color ONCE per analysis (not once per text run —
  // see buildSchemeColorMap's doc comment) and drop the theme AST once the
  // map is built so a large theme part isn't retained across the slide loop.
  // themeInfo keeps only the slot map and the two small fill-style lists a
  // background reference (p:bgRef) points into — never the theme AST.
  const themeCache = new Map<string, ThemeInfo>();
  const readTheme = async (path: string): Promise<ThemeInfo> => {
    const cached = themeCache.get(path);
    if (cached) return cached;
    const info =
      themeCache.size < MAX_MASTERS_READ
        ? themeInfo(rootElement(parseXml(await read(path)), "theme"))
        : NO_THEME;
    themeCache.set(path, info);
    return info;
  };
  const deckTheme = await readTheme("ppt/theme/theme1.xml");

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
    // Resolved the OPC way (2026-10-06): an absolute target such as
    // "/ppt/slides/slide1.xml" became "ppt/ppt/slides/…", matched no slide,
    // and the order silently fell back to file names.
    const relTargets = new Map(presRels.map((r) => [r.id, resolveRelTarget("ppt", r.target)]));
    // A slide the deck LISTS (p:sldIdLst → a slide relationship) is a slide
    // of the deck even when its part is missing from the package
    // (2026-11-12): it stays in the list, cannot be read, and is recorded as
    // an unparsed slide. It was dropped here, so the deck graded as whole.
    const slideRelIds = new Set(presRels.filter((r) => /\/slide$/.test(r.type)).map((r) => r.id));
    // <p:sldId id="256" r:id="rId2"/> carries two ids, and with prefixes
    // stripped only the LAST one written survives — so r:id written first
    // lost the slide. relationshipIdsOf reads the relationship id itself.
    const orderedPaths = [
      ...new Set(
        relationshipIdsOf(presentationXml, "sldId")
          .map((rid) =>
            rid && (slideRelIds.has(rid) || filenameOrdered.includes(relTargets.get(rid) ?? ""))
              ? relTargets.get(rid)
              : undefined,
          )
          .filter((p): p is string => !!p),
      ),
    ];
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

  // Declared-language plausibility inputs (2026-10-05) — see ooxml.ts.
  // PowerPoint declares language on runs (a:rPr), paragraph defaults
  // (a:defRPr) and paragraph ends (a:endParaRPr); every one counts.
  const LANG_CARRIERS = ["rPr", "defRPr", "endParaRPr"];
  const declaredLanguageSet = new Set<string>();
  const collectLangs = (root: PONode | undefined): void => {
    if (!root) return;
    for (const tag of LANG_CARRIERS) {
      for (const el of descendants(root, tag))
        addLanguagePrimary(declaredLanguageSet, attrOf(el, "lang"));
    }
  };
  collectLangs(presRoot);
  collectLangs(masterRoot);
  let textSample = "";

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
    parse: { coreState },
    fakeHeadings: [],
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

  // Run-level language tally, by characters of text. PresentationML stores
  // language on each run's a:rPr@lang; deck-level defaults are frequently
  // ABSENT (Google Slides exports systematically omit them) while every run
  // still declares its language. With no deck default, the language declared
  // on MORE THAN HALF of the visible text is the deck's language
  // (predominantLanguage — 2026-10-06, Word's rule too). Until then ANY run's
  // language stood in for the deck, so one stray marked word could.
  const textLangChars = new Map<string, number>();
  let textChars = 0;
  let fieldChars = 0;
  const layoutCache = new Map<string, LayoutInfo>();
  const masterCache = new Map<string, MasterInfo>();
  const DECK_MASTER = "ppt/slideMasters/slideMaster1.xml";
  const relsPathOf = (part: string) => part.replace(/([^/]+)$/, "_rels/$1.rels");
  const dirOf = (part: string) => part.replace(/\/[^/]+$/, "");
  const readMaster = async (path: string): Promise<MasterInfo> => {
    const cached = masterCache.get(path);
    if (cached) return cached;
    if (masterCache.size >= MAX_MASTERS_READ && path !== DECK_MASTER)
      return readMaster(DECK_MASTER);
    const root =
      path === DECK_MASTER ? masterRoot : rootElement(parseXml(await read(path)), "sldMaster");
    const themeRel = parseRelationshipEntries(await read(relsPathOf(path))).find((r) =>
      /\/theme$/.test(r.type),
    );
    const theme = themeRel
      ? await readTheme(resolveRelTarget(dirOf(path), themeRel.target))
      : deckTheme;
    const info: MasterInfo = {
      root,
      theme,
      clrMap: clrMapOf(root ? firstChild(root, "clrMap") : undefined),
    };
    masterCache.set(path, info);
    return info;
  };

  // EVERY SLIDE HIDDEN (2026-11-12): a hidden slide is skipped because the
  // visible ones are the presentation — but a deck whose slides are ALL
  // hidden has nothing else to judge, and skipping them graded it 100/A,
  // "cleared every automated check", unread. Such a deck is audited as it
  // is. Decided before the walk from each slide's root tag, stopping at the
  // first slide that is shown (normally the first).
  let allSlidesHidden = slidePaths.length > 0;
  let anySlideTag = false;
  for (const path of slidePaths) {
    const head = /<(?:[\w.-]+:)?sld\b[^>]*>/.exec(((await read(path)) ?? "").slice(0, 8192));
    if (!head) continue; // unreadable here is unreadable below
    anySlideTag = true;
    const show = /\sshow\s*=\s*["']([^"']*)["']/.exec(head[0]);
    if (xsdBoolean(show?.[1]) !== false) {
      allSlidesHidden = false;
      break;
    }
  }
  allSlidesHidden = allSlidesHidden && anySlideTag;
  if (allSlidesHidden) analysis.allSlidesHidden = true;

  for (let i = 0; i < slidePaths.length; i++) {
    const slideXml = await read(slidePaths[i]);
    // parseMainXml: a slide cut short is unparseable, not a shorter slide.
    const slideRoot = rootElement(parseMainXml(slideXml, ["sld"]), "sld");
    const relsXml = await read(relsPathOf(slidePaths[i]));
    const relMap = parseRelationships(relsXml);
    const relEntries = parseRelationshipEntries(relsXml);
    const slideHasMedia = relEntries.some((r) => /\/(audio|video)$/.test(r.type));
    if (!slideRoot) {
      // Recorded, never skipped silently (2026-11-12): the scorer and the
      // gate withhold a clean result for a deck with a slide nobody read.
      if (slideHasMedia) analysis.hasMedia = true;
      analysis.slides.push({
        index: i + 1,
        unparsed: true,
        title: null,
        titleIsFirstShape: false,
        shapeCount: 0,
      });
      (analysis.unparsedSlides ??= []).push(i + 1);
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

    // show is an xsd:boolean: "false" hides a slide exactly as "0" does.
    const shown = allSlidesHidden || xsdBoolean(attrOf(slideRoot, "show")) !== false;
    // A hidden slide's media is not presented either.
    if (slideHasMedia && shown) analysis.hasMedia = true;
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
      hidden: !shown,
      title: titleText.length > 0 ? titleText : null,
      titleIsFirstShape: !!titleSp && contentBearing.length > 0 && contentBearing[0] === titleSp,
      shapeCount: shapes.length,
    });

    // Only when the slide has no title placeholder text of its own. With a
    // real title present the heading IS marked up, and a big bold line
    // elsewhere on the slide is just emphasis.
    if (titleText.length === 0 && shown) {
      // One per slide: the finding is about the slide, not each box. Where
      // several boxes qualify the LARGEST is the heading, and the first in
      // reading order at the same size (2026-11-16). It was simply the first
      // until then, so a one-page flyer was told its heading was a line of
      // body text, with the 28-point heading stacked a few shapes later.
      let best: { text: string; size: number } | null = null;
      for (const sp of shapes) {
        const typed = typedHeading(sp);
        if (typed && (!best || typed.size > best.size)) best = typed;
      }
      if (best) analysis.fakeHeadings.push({ slide: i + 1, text: best.text });
    }

    if (shown) {
      for (const p of descendants(slideRoot, "p")) {
        const pPr = firstChild(p, "pPr");
        const pDefRPr = pPr ? firstChild(pPr, "defRPr") : undefined;
        const paragraphLang = (pDefRPr ? (attrOf(pDefRPr, "lang") ?? "") : "").trim();
        // Text that lives in a field (a date, a slide number, a footer) is
        // text a screen reader gets — counted for the extractability claim,
        // not for the language tally, which is about what the author wrote.
        for (const fld of childrenOf(p).filter((c) => tagOf(c) === "fld")) {
          fieldChars += textOf(fld).trim().length;
        }
        for (const r of childrenOf(p).filter((c) => tagOf(c) === "r")) {
          const n = textOf(r).trim().length;
          if (n === 0) continue;
          textChars += n;
          const rPr = firstChild(r, "rPr");
          const lang = (rPr ? (attrOf(rPr, "lang") ?? "") : "").trim() || paragraphLang;
          if (lang) textLangChars.set(lang, (textLangChars.get(lang) ?? 0) + n);
        }
      }
    }
    // Hidden slides are not presented, so they neither feed the sample nor
    // vouch for a language.
    if (shown) {
      collectLangs(slideRoot);
      if (textSample.length < LANGUAGE_SAMPLE_CHARS) {
        const more = languageSample(descendants(slideRoot, "p"));
        if (more)
          textSample = (textSample ? `${textSample} ${more}` : more).slice(
            0,
            LANGUAGE_SAMPLE_CHARS,
          );
      }
    }

    // A HIDDEN SLIDE IS NOT CHECKED (2026-11-12). It is not presented to any
    // reader — the reason its title, typed heading and language were already
    // left out — yet its images, tables, links, lists and colours were still
    // scored, so a backup slide nobody sees could fail a deck. Excel skips
    // hidden sheets wholesale; so does this now. The slide record above
    // carries `hidden`, and the report says how many were not checked.
    if (!shown) continue;

    // The slide's layout and master, each read once per distinct part (capped).
    let layout: LayoutInfo = { bullets: NO_LAYOUT, root: undefined, masterPath: DECK_MASTER };
    const layoutRel = relEntries.find((r) => /\/slideLayout$/.test(r.type));
    if (layoutRel) {
      const layoutPath = resolveRelTarget(dirOf(slidePaths[i]), layoutRel.target);
      const cached = layoutCache.get(layoutPath);
      if (cached) layout = cached;
      else if (layoutCache.size < MAX_LAYOUTS_READ) {
        const root = rootElement(parseXml(await read(layoutPath)), "sldLayout");
        const masterRel = parseRelationshipEntries(await read(relsPathOf(layoutPath))).find((r) =>
          /\/slideMaster$/.test(r.type),
        );
        layout = {
          bullets: layoutBullets(root),
          root,
          masterPath: masterRel
            ? resolveRelTarget(dirOf(layoutPath), masterRel.target)
            : DECK_MASTER,
        };
        layoutCache.set(layoutPath, layout);
      }
    }
    const master = await readMaster(layout.masterPath);
    collectSlideContent(
      analysis,
      slideRoot,
      relMap,
      contrastContextFor(slideRoot, layout.root, master, defaultTextStyle),
      spTree,
      masterBodyBullets,
      layout.bullets,
    );
  }

  if (!analysis.metadata.language) {
    const fromText = predominantLanguage(textLangChars, textChars);
    if (fromText) {
      analysis.metadata.language = fromText;
      analysis.languageFromText = true;
    }
  }
  analysis.textSample = textSample;
  analysis.declaredLanguages = [...declaredLanguageSet].sort();
  // Slide text only — runs and fields. Layout and master text (footers,
  // placeholders' prompts) is page furniture, as headers and footers are in
  // Word and Excel, and is not counted.
  analysis.textCharCount = textChars + fieldChars;

  // NOT ONE SLIDE COULD BE READ (2026-11-12) — PDF's rule that both analyzers
  // failing never reaches scoring. A partly unread deck is still scored on
  // what was read, with its unread slides withheld (scoring/pptx.ts).
  if (slidePaths.length > 0 && (analysis.unparsedSlides?.length ?? 0) === slidePaths.length) {
    throw new PptxParseError(
      "None of this presentation's slides could be read — the slide parts are missing, damaged, incomplete, or not valid XML.",
    );
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
  shapeImages: PONode[],
): void {
  const tag = tagOf(node);
  if (tag === "sp") {
    // A drawn shape that is an image (2026-11-12, the one rule in ooxml.ts):
    // no text, no placeholder role, not an (empty) text box — and either
    // filled with a picture, or plain under TEXTLESS_SHAPE_NEEDS_ALT. These
    // were never looked at here, while Word has always counted them.
    const cNvPr = shapeImageProps(node);
    if (cNvPr && frameStack.length === 0) shapeImages.push(node);
    return; // nothing a shape holds is a picture or a frame
  }
  if (tag === "cxnSp") {
    // A connector or line is a drawn shape like any other (2026-11-12).
    if (TEXTLESS_SHAPE_NEEDS_ALT && frameStack.length === 0 && connectorProps(node)) {
      shapeImages.push(node);
    }
    return;
  }
  if (tag === "grpSp") {
    // Alt text (or the decorative mark) set on the GROUP — the pattern
    // Microsoft's Alt Text UI applies to grouped objects — covers its
    // members: AT announces the group as one object. Counting each member
    // as alt-less produced false confirmed 1.1.1 failures.
    const groupPr = descendants(node, "cNvPr")[0]; // nvGrpSpPr precedes members
    if (groupPr) {
      const alt = drawingAltText(groupPr);
      if (alt.altText || alt.decorative) {
        // …unless every member is a text box (2026-11-12): a group of text
        // boxes is text, in every format — its alt text is harmless, but
        // there is no image to count.
        if (!groupIsOnlyText(node)) coveredGroups.push(groupPr);
        return;
      }
    }
    // No group-level alt — fall through and walk members individually.
  }
  if (tag === "graphicFrame") {
    const acc: FrameAcc = {};
    frames.push(acc);
    frameStack.push(acc);
    for (const c of childrenOf(node))
      walkPicsAndFrames(c, frameStack, standalonePics, frames, coveredGroups, shapeImages);
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
  for (const c of childrenOf(node))
    walkPicsAndFrames(c, frameStack, standalonePics, frames, coveredGroups, shapeImages);
}

/** Whether every member of a p:grpSp (nested groups included) is a shape
 *  that carries text. A picture, frame, connector or textless shape makes it
 *  a drawing; an empty group is not text either. */
function groupIsOnlyText(group: PONode): boolean {
  let members = 0;
  const allText = (g: PONode): boolean => {
    for (const member of childrenOf(g)) {
      const tag = tagOf(member);
      if (tag === "grpSp") {
        if (!allText(member)) return false;
      } else if (tag === "sp") {
        members++;
        if (textOf(member).trim().length === 0) return false;
      } else if (tag === "pic" || tag === "graphicFrame" || tag === "cxnSp") {
        return false;
      }
    }
    return true;
  };
  return allText(group) && members > 0;
}

/** The cNvPr of a p:cxnSp that is drawn (not hidden), else null. */
function connectorProps(cxn: PONode): PONode | null {
  const nv = firstChild(cxn, "nvCxnSpPr");
  const cNvPr = nv ? firstChild(nv, "cNvPr") : undefined;
  if (!cNvPr || xsdBoolean(attrOf(cNvPr, "hidden")) === true) return null;
  return cNvPr;
}

/** The cNvPr of a p:sp that is an image by the shared drawn-shape rule
 *  (ooxml.ts TEXTLESS_SHAPE_NEEDS_ALT), else null. */
function shapeImageProps(sp: PONode): PONode | null {
  const nv = firstChild(sp, "nvSpPr");
  const cNvPr = nv ? firstChild(nv, "cNvPr") : undefined;
  if (!nv || !cNvPr) return null;
  const nvPr = firstChild(nv, "nvPr");
  if (nvPr && firstChild(nvPr, "ph")) return null; // an (empty) placeholder
  if (xsdBoolean(attrOf(cNvPr, "hidden")) === true) return null; // not drawn
  const cNvSpPr = firstChild(nv, "cNvSpPr");
  if (cNvSpPr && xsdBoolean(attrOf(cNvSpPr, "txBox")) === true) return null; // an empty text box draws nothing
  if (textOf(sp).trim().length > 0) return null; // text is text
  if (!hasPictureFill(firstChild(sp, "spPr")) && !TEXTLESS_SHAPE_NEEDS_ALT) return null;
  return cNvPr;
}

function collectSlideContent(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  relMap: Map<string, string>,
  contrast: ContrastContext,
  spTree: PONode | undefined,
  masterBodyBullets: Map<number, "bullet" | "none">,
  layout: LayoutBullets = NO_LAYOUT,
): void {
  // Images: pictures always — except a pic nested inside a graphicFrame,
  // which is the OLE-object fallback preview; the frame itself is the one
  // visual object (counted below), so counting its inner pic too would
  // double-bill a single object's missing alt text. Groups carrying their
  // own alt/decorative cover their members (one announced object).
  const standalonePics: PONode[] = [];
  const frames: FrameAcc[] = [];
  const coveredGroups: PONode[] = [];
  const shapeImages: PONode[] = [];
  walkPicsAndFrames(slideRoot, [], standalonePics, frames, coveredGroups, shapeImages);
  for (const groupPr of coveredGroups) {
    analysis.images.push(drawingAltText(groupPr));
  }
  for (const shape of shapeImages) {
    const isConnector = tagOf(shape) === "cxnSp";
    const cNvPr = isConnector ? connectorProps(shape) : shapeImageProps(shape);
    if (!cNvPr) continue;
    const plain = isConnector || !hasPictureFill(firstChild(shape, "spPr"));
    analysis.images.push({ ...drawingAltText(cNvPr), ...(plain ? { drawnShape: true } : {}) });
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
      const hasHeaderRow = firstRow === "1" || firstRow.toLowerCase() === "true";
      const firstTr = childrenOf(tbl).find((c) => tagOf(c) === "tr");
      const firstCells = firstTr ? childrenOf(firstTr).filter((c) => tagOf(c) === "tc") : [];
      analysis.tables.push({
        hasHeaderRow,
        rowCount: rows,
        colCount: cols,
        looksLikeLayout: !hasHeaderRow && tableLooksBare(tbl, tblPr),
        ...(hasHeaderRow &&
        firstCells.length > 0 &&
        firstCells.every((tc) => textOf(tc).trim() === "")
          ? { emptyHeaderRow: true }
          : {}),
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
  // The object's alt text is its accessible name, so it doubles as link text
  // — and with no alt text, a shape's OWN TEXT is its name (2026-11-12): a
  // linked text box reading "Visit the grants portal" was an unnamed link, a
  // confirmed 4.1.2 failure, for want of alt text it does not need.
  // A linked GROUP is named the same way: its alt text, else the text of
  // the shapes inside it.
  //
  // ONE LINK, COUNTED ONCE: PowerPoint lets the same box carry the link on
  // the shape AND on its text; where a run inside the object already links
  // to the same target, that run-level link (with its text) is the link.
  const ownerByProps = new Map<PONode, PONode>();
  for (const [tag, nvTag] of [
    ["sp", "nvSpPr"],
    ["grpSp", "nvGrpSpPr"],
  ] as const) {
    for (const obj of descendants(slideRoot, tag)) {
      const nv = firstChild(obj, nvTag);
      const cNvPr = nv ? firstChild(nv, "cNvPr") : undefined;
      if (cNvPr) ownerByProps.set(cNvPr, obj);
    }
  }
  const targetOf = (hlink: PONode): string => {
    const id = attrOf(hlink, "id") ?? "";
    return relMap.get(id) ?? `#${id}`;
  };
  for (const cNvPr of descendants(slideRoot, "cNvPr")) {
    const hlink = firstChild(cNvPr, "hlinkClick");
    if (!hlink) continue;
    const id = attrOf(hlink, "id");
    const owner = ownerByProps.get(cNvPr);
    if (
      owner &&
      descendants(owner, "rPr").some((rPr) => {
        const inner = firstChild(rPr, "hlinkClick");
        return !!inner && targetOf(inner) === targetOf(hlink);
      })
    ) {
      continue;
    }
    const alt = drawingAltText(cNvPr);
    analysis.links.push({
      text: (alt.altText ?? "").trim() || (owner ? textOf(owner).trim() : ""),
      url: id && relMap.has(id) ? relMap.get(id)! : null,
    });
  }

  // Lists. Real items are explicit buChar/buAutoNum, OR — the PowerPoint-
  // native pattern — paragraphs in a BODY PLACEHOLDER whose level inherits a
  // bullet from the master's bodyStyle (no explicit bu* on the slide at
  // all). Title paragraphs are excluded; explicit buNone opts a paragraph
  // out of inheritance.
  const titleParagraphs = new Set<PONode>();
  // Each placeholder paragraph's inherited bullet, by outline level: its
  // shape's own list style, then the layout's matching placeholder, then the
  // master (body style; "none" for the other-style placeholder types).
  const placeholderParagraphs = new Map<PONode, (level: number) => BulletMark | undefined>();
  if (spTree) {
    for (const sp of contentShapes(spTree)) {
      if (tagOf(sp) !== "sp") continue;
      if (isTitlePlaceholder(sp)) {
        for (const p of descendants(sp, "p")) titleParagraphs.add(p);
        continue;
      }
      const key = placeholderKey(sp);
      if (!key) continue;
      const own = lstStyleBullets(firstChild(sp, "txBody"));
      const fromLayout =
        key.idx !== undefined && layout.byIdx.has(key.idx)
          ? layout.byIdx.get(key.idx)
          : layout.byType.get(key.type);
      const inherited = (level: number): BulletMark | undefined =>
        own.get(level) ??
        fromLayout?.get(level) ??
        (OTHER_STYLE_PLACEHOLDERS.has(key.type) ? "none" : masterBodyBullets.get(level));
      for (const p of descendants(sp, "p")) placeholderParagraphs.set(p, inherited);
    }
  }
  // Two passes, mirroring the Word walk (2026-09-01): classify every
  // paragraph, then count typed enumerators only when ADJACENT to another —
  // a list has at least two items, and a lone "- see appendix" line is a
  // label, not visual list structure.
  const paraStatus: Array<"real" | "manual" | "text" | "transparent"> = [];
  for (const p of descendants(slideRoot, "p")) {
    if (titleParagraphs.has(p)) {
      paraStatus.push("text");
      continue;
    }
    const pPr = firstChild(p, "pPr");
    const hasExplicitBullet =
      !!pPr && (!!firstChild(pPr, "buChar") || !!firstChild(pPr, "buAutoNum"));
    const hasExplicitNone = !!pPr && !!firstChild(pPr, "buNone");
    const level = pPr ? Number(attrOf(pPr, "lvl") ?? "0") + 1 : 1;
    const inheritsBullet =
      !hasExplicitNone &&
      placeholderParagraphs.get(p)?.(level) === "bullet" &&
      textOf(p).trim().length > 0;
    if (hasExplicitBullet || inheritsBullet) paraStatus.push("real");
    else if (!hasExplicitNone && MANUAL_BULLET_RE.test(textOf(p))) paraStatus.push("manual");
    else if (!textOf(p).trim()) paraStatus.push("transparent");
    else paraStatus.push("text");
  }
  const isListEvidence = (v: string | null) => v === "real" || v === "manual";
  const nearEvidence = (i: number): boolean => {
    for (const dir of [-1, 1]) {
      let steps = 0;
      for (let j = i + dir; j >= 0 && j < paraStatus.length; j += dir) {
        const v = paraStatus[j];
        if (v === "transparent") continue; // empties/images don't consume distance
        steps++;
        if (isListEvidence(v)) return true;
        if (steps >= 2) break;
      }
    }
    return false;
  };
  for (let i = 0; i < paraStatus.length; i++) {
    if (paraStatus[i] === "real") analysis.lists.realListItems++;
    // Same neighborhood rule as the Word walk (see docxService.extractLists):
    // a typed enumerator counts only with another typed item or a real list
    // item within two non-transparent paragraphs.
    else if (paraStatus[i] === "manual" && nearEvidence(i)) {
      analysis.lists.manualBulletParagraphs++;
    }
  }

  collectSlideContrast(analysis, contrast, spTree);
}

/** A shape's placement in EMU, from its own a:xfrm (a:off + a:ext). null =
 *  not declared on the slide (inherited from the layout/master chain). */
interface ShapeRect {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

function xfrmRect(props: PONode | undefined): ShapeRect | null {
  const xfrm = props ? firstChild(props, "xfrm") : undefined;
  if (!xfrm) return null;
  const off = firstChild(xfrm, "off");
  const ext = firstChild(xfrm, "ext");
  const x = Number(off ? attrOf(off, "x") : NaN);
  const y = Number(off ? attrOf(off, "y") : NaN);
  const cx = Number(ext ? attrOf(ext, "cx") : NaN);
  const cy = Number(ext ? attrOf(ext, "cy") : NaN);
  if (![x, y, cx, cy].every(Number.isFinite)) return null;
  return { x, y, cx, cy };
}

function rectsIntersect(a: ShapeRect, b: ShapeRect): boolean {
  return a.x < b.x + b.cx && b.x < a.x + a.cx && a.y < b.y + b.cy && b.y < a.y + a.cy;
}

function rectContains(outer: ShapeRect, inner: ShapeRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.cx >= inner.x + inner.cx &&
    outer.y + outer.cy >= inner.y + inner.cy
  );
}

/** What an earlier-in-z-order shape contributes to the pixels beneath a later
 *  text shape. "solid" carries a resolved color; "opaque" means it paints
 *  something we cannot reduce to one color (gradient, picture, chart, theme
 *  fill reference); absence from the painter list means it paints nothing. */
interface Painter {
  bounds: ShapeRect | null;
  kind: "solid" | "opaque";
  color: string | null;
}

const UNRESOLVABLE_FILL_TAGS = ["gradFill", "blipFill", "pattFill", "grpFill"] as const;

function hasUnresolvableFill(props: PONode | undefined): boolean {
  if (!props) return false;
  return UNRESOLVABLE_FILL_TAGS.some((t) => !!firstChild(props, t));
}

/** A shape's contribution as a background painter, or null when it paints
 *  nothing (no fill / noFill / a connector line). Conservative by design:
 *  anything visual that cannot be reduced to a single solid color — a
 *  modified colour included, by the backgrounds' strict rule — is "opaque",
 *  which downstream turns intersecting runs into unresolved, never into a
 *  confirmed failure. */
function painterOf(
  shape: PONode,
  schemeColorMap: Map<string, string>,
  theme: ThemeInfo,
  background: string | null,
): Painter | null {
  const tag = tagOf(shape);
  if (tag === "pic" || tag === "graphicFrame") {
    const props = tag === "pic" ? firstChild(shape, "spPr") : undefined;
    // graphicFrame keeps its xfrm as a direct child, not inside spPr.
    const bounds = tag === "pic" ? xfrmRect(props) : xfrmRect(shape);
    return { bounds, kind: "opaque", color: null };
  }
  if (tag === "grpSp") {
    const grpPr = firstChild(shape, "grpSpPr");
    const bounds = xfrmRect(grpPr);
    const solidFill = grpPr ? firstChild(grpPr, "solidFill") : undefined;
    if (solidFill) {
      const color = strictColor(firstColor(solidFill), schemeColorMap);
      return color ? { bounds, kind: "solid", color } : { bounds, kind: "opaque", color: null };
    }
    if (hasUnresolvableFill(grpPr)) return { bounds, kind: "opaque", color: null };
    // No group-level fill: the group paints whatever its members paint.
    // If anything inside carries a fill or an image, the group is a visual
    // block we cannot reduce to one color.
    const paintsInside =
      descendants(shape, "blip").length > 0 ||
      descendants(shape, "solidFill").length > 0 ||
      descendants(shape, "gradFill").length > 0 ||
      descendants(shape, "pattFill").length > 0;
    return paintsInside ? { bounds, kind: "opaque", color: null } : null;
  }
  if (tag === "sp") {
    // Read exactly as the shape's own text background is: its fill, else
    // the theme fill its style references.
    const fill = shapeFill(shape, schemeColorMap, theme, background);
    const bounds = xfrmRect(firstChild(shape, "spPr"));
    if (fill === "unknown") return { bounds, kind: "opaque", color: null };
    return fill ? { bounds, kind: "solid", color: fill } : null; // no fill — transparent.
  }
  return null; // cxnSp connectors and anything unknown paint no background.
}

/** A shape's own solid fill when it is SEE-THROUGH AND NOTHING ELSE: one
 *  colour whose only modifier is `alpha` (2026-11-16, user decision). A
 *  fill at 20% opacity draws one colour wherever what lies beneath it is
 *  one colour, so it can be computed instead of guessed. Any other modifier
 *  beside or instead of alpha (lumMod, tint, shade …) is still unknown, and
 *  so is a theme style's fill or a placeholder's inherited one. */
function seeThroughFill(
  sp: PONode,
  scheme: Map<string, string>,
): { color: string; alpha: number } | null {
  if (xsdBoolean(attrOf(sp, "useBgFill")) === true) return null;
  const spPr = firstChild(sp, "spPr");
  const solid = spPr ? firstChild(spPr, "solidFill") : undefined;
  // The colour may be shaded first ("Accent 1, Darker 25%" at 20% opacity);
  // the opacity is the last modifier, and 0 is legal — the fill is then
  // invisible and what lies beneath shows unchanged.
  const colour = solid ? colourOf(firstColor(solid), scheme) : null;
  return colour && colour.alpha !== null ? { color: colour.color, alpha: colour.alpha } : null;
}

/** A colour drawn at `alpha` over another: each channel is top·α +
 *  under·(1−α). The result rarely lands on a whole number, and programs
 *  round differently (50% black over white is #7F7F7F in one and #808080 in
 *  another), so the darkest and lightest it can honestly be travel with it
 *  (see ColourRange): a verdict that differs between them is not known. */
function blendOver(top: string, alpha: number, under: string): { color: string } & ColourRange {
  const mix = (t: string, u: string, round: (n: number) => number) =>
    hexOf(
      channelsOf(t).map((v, i) => v * alpha + (channelsOf(u)[i] ?? 0) * (1 - alpha)),
      round,
    );
  // Either colour may itself be computed: the darkest blend is the darkest
  // of each, rounded down, and the lightest the lightest, rounded up.
  const topRange = rangeOf(top);
  const underRange = rangeOf(under);
  return {
    color: mix(top, under, Math.round),
    dark: mix(topRange?.dark ?? top, underRange?.dark ?? under, Math.floor),
    light: mix(topRange?.light ?? top, underRange?.light ?? under, Math.ceil),
  };
}

/** The background behind a text shape with no fill of its own. Walks the
 *  shapes painted BENEATH it (earlier in spTree order): the topmost one that
 *  overlaps decides — a solid card that fully contains the text shape IS the
 *  background; anything else that overlaps (partial cover, gradient,
 *  picture, unknown geometry) makes the background unresolvable. Only when
 *  nothing beneath overlaps does the slide's own background apply. */
function stackedBackground(
  textBounds: ShapeRect | null,
  beneath: readonly Painter[],
  slideBg: string | null,
): string | null {
  if (beneath.length === 0) return slideBg;
  if (!textBounds) return null; // unresolvable — occlusion cannot be ruled out
  let top: Painter | null = null;
  let anyUnknownBounds = false;
  for (const p of beneath) {
    if (p.bounds === null) {
      anyUnknownBounds = true;
      top = p; // later shapes overwrite — the last possible occluder wins
      continue;
    }
    if (rectsIntersect(p.bounds, textBounds)) top = p;
  }
  if (top === null) return slideBg; // nothing beneath overlaps the text shape
  if (
    !anyUnknownBounds &&
    top.kind === "solid" &&
    top.color !== null &&
    top.bounds !== null &&
    rectContains(top.bounds, textBounds)
  ) {
    return top.color;
  }
  // An unknown-bounds painter may sit above a resolvable card; a partial
  // cover splits the background in two; gradients and pictures have no one
  // color. All of these are honestly unknown — never a confirmed pair.
  return null;
}

function collectSlideContrast(
  analysis: PptxAnalysis,
  ctx: ContrastContext,
  spTree: PONode | undefined,
): void {
  // Background PROVENANCE: a background is treated as resolved only when it
  // is one solid colour the file states — an explicit fill on the shape, a
  // fill its placeholder inherits from the layout or master, a solid shape
  // stacked beneath that fully contains it (the banner/card pattern real
  // decks put white titles on), or the slide's background: its own, else its
  // layout's, else its master's (2026-10-06, user decision "follow it" — the
  // default in PowerPoint's, Google Slides' and python-pptx's templates), a
  // theme reference resolved through the theme's fill styles and the
  // master's colour map. Everything else (gradients, pictures, colour
  // modifiers, partial covers, unknown geometry) is genuinely unknown. The
  // old "else white" default failed white-titled dark-template decks at
  // "1:1" as a CONFIRMED 1.4.3 violation (2026-09-01); unresolved runs are
  // counted and honestly reported as not-assessed instead.
  const slideBg = ctx.background;

  if (!spTree) return;
  // What the master and layout paint lies beneath everything on the slide.
  const beneath: Painter[] = [...ctx.inherited];
  for (const sp of contentShapes(spTree)) {
    if (tagOf(sp) !== "sp") {
      const painter = painterOf(sp, ctx.scheme, ctx.theme, slideBg);
      if (painter) beneath.push(painter);
      // Text in a table's cells or in a grouped shape is not judged — its
      // background is the cell's or the member's, which this walk does not
      // resolve — but it IS text whose contrast nobody checked, so it counts
      // as unresolved (2026-11-12). It was not counted at all, so a deck
      // whose words all sit in a table read as having no text to check.
      for (const p of descendants(sp, "p")) {
        for (const run of childrenOf(p)) {
          if (tagOf(run) === "r" && textOf(run).trim()) analysis.contrast.unresolvedRuns++;
        }
      }
      continue;
    }
    // A placeholder takes its position and fill from the layout's matching
    // placeholder, else the master's, when it states none of its own.
    const inherited = ctx.placeholder(sp);
    const own = shapeFill(sp, ctx.scheme, ctx.theme, slideBg);
    let fill = own !== undefined ? own : inherited.fill;
    const bounds = xfrmRect(firstChild(sp, "spPr")) ?? inherited.bounds;
    // A see-through fill over ONE stated colour is one colour (2026-11-16):
    // the slide's background, or a solid shape that fully contains this one
    // — exactly what stackedBackground resolves for text. Over anything else
    // it stays unknown, as every modified colour was until then.
    if (own === "unknown") {
      const glass = seeThroughFill(sp, ctx.scheme);
      const under = glass ? stackedBackground(bounds, beneath, slideBg) : null;
      if (glass && under) {
        const blend = blendOver(glass.color, glass.alpha, under);
        fill = blend.color;
        rememberRange(blend.color, blend);
      }
    }
    const shapeBg: string | null =
      fill === "unknown" ? null : (fill ?? stackedBackground(bounds, beneath, slideBg));
    // The shape paints over what was beneath it for LATER shapes — with the
    // fill it shows, its own or the one its placeholder inherits.
    if (fill === "unknown") beneath.push({ bounds, kind: "opaque", color: null });
    else if (fill) beneath.push({ bounds, kind: "solid", color: fill });
    const inheritedAt = ctx.textLook(sp);
    const scale = ctx.fontScale(sp);
    for (const p of descendants(sp, "p")) {
      const pPr = firstChild(p, "pPr");
      const lvl = Number(pPr ? (attrOf(pPr, "lvl") ?? "0") : "0");
      const fromStyles =
        Number.isInteger(lvl) && lvl >= 0 && lvl <= 8 ? inheritedAt(lvl + 1) : UNKNOWN_LOOK;
      // A paragraph's own run defaults: whether PowerPoint honours them over
      // the styles is not certain, so they count only where they agree.
      const paragraph = ifAgreeing(
        runLookOf(pPr ? firstChild(pPr, "defRPr") : undefined, ctx.scheme),
        fromStyles,
      );
      for (const run of childrenOf(p)) {
        if (tagOf(run) !== "r") continue;
        const text = textOf(run).trim();
        if (!text) continue;
        const rPr = firstChild(run, "rPr");
        const look = over(runLookOf(rPr, ctx.scheme), paragraph);
        const link = rPr
          ? (firstChild(rPr, "hlinkClick") ?? firstChild(rPr, "hlinkMouseOver"))
          : undefined;
        // A link that may be drawn in either of two colours is judged in both.
        const drawnAs = link ? linkFill(link, look.fill, ctx.scheme) : null;
        if (drawnAs) look.fill = drawnAs.fill;
        judgeRun(analysis, text, look, shapeBg, scale, drawnAs?.other);
      }
    }
  }
}

/** Link text is drawn in the theme's hyperlink colour, whatever colour the
 *  run states — unless the link carries PowerPoint 2019's "use the text
 *  colour" mark (the 2018 hlinkClr extension, val="tx"), which earlier
 *  versions ignore. Such a link is drawn in one of TWO colours, depending on
 *  who opens it: `fill` is what current PowerPoint draws and `other` what an
 *  older one does. It was unknown unless the two were equal; judgeRun now
 *  also accepts it where both give the same verdict (2026-11-16). */
function linkFill(
  link: PONode,
  textFill: RunLook["fill"],
  scheme: Map<string, string>,
): { fill: string | "unknown"; other?: string } {
  const hlink = scheme.get("hlink");
  const usesText = descendants(link, "hlinkClr").some((e) => attrOf(e, "val") === "tx");
  if (!usesText) return { fill: hlink ?? "unknown" };
  if (!hlink || textFill === undefined || textFill === "unknown") return { fill: "unknown" };
  return textFill === hlink ? { fill: hlink } : { fill: textFill, other: hlink };
}

/** One run against what is behind it — its highlight, else its shape's.
 *
 *  A pair may honestly be drawn in more than one way: a link has a second
 *  colour (`otherForeground`), and a computed colour — shaded, or blended
 *  through a see-through fill — has a darkest and a lightest (rangeOf). The
 *  run is judged in every combination, and counted only when they all
 *  agree: pass in all, or fail in all. */
function judgeRun(
  analysis: PptxAnalysis,
  text: string,
  look: RunLook,
  shapeBg: string | null,
  scale: number | null,
  otherForeground?: string,
): void {
  const fg = look.fill;
  const bg =
    look.highlight === undefined ? shapeBg : look.highlight === "unknown" ? null : look.highlight;
  if (fg === undefined || fg === "unknown" || !bg) {
    analysis.contrast.unresolvedRuns++;
    return;
  }
  const size = typeof look.size === "number" && scale !== null ? look.size * scale : null;
  const bold = look.bold ?? false;
  // Large text is 18 pt, or 14 pt bold; null = it cannot be told (no size
  // anywhere on the chain, or a weight that is not certain at 14–18 pt).
  const large: boolean | null =
    size === null
      ? null
      : size >= LARGE_HUNDREDTHS
        ? true
        : size >= LARGE_BOLD_HUNDREDTHS
          ? bold === "unknown"
            ? null
            : bold
          : false;
  const min = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
  // A ratio between the two bars passes as large text and fails as normal
  // text — with largeness unknown, which bar applies cannot be determined,
  // so the pair is unknown rather than failed.
  const verdictOf = (f: string, b: string): "pass" | "fail" | "unknown" => {
    const r = contrastRatio(f, b);
    if (large === null && r >= CONTRAST_MIN_LARGE && r < CONTRAST_MIN_NORMAL) return "unknown";
    return r < min ? "fail" : "pass";
  };
  const withRange = (hex: string): string[] => {
    const range = rangeOf(hex);
    return range ? [hex, range.dark, range.light] : [hex];
  };
  const foregrounds = [...withRange(fg), ...(otherForeground ? withRange(otherForeground) : [])];
  const backgrounds = withRange(bg);
  const verdict = verdictOf(fg, bg);
  const agreed = foregrounds.every((f) => backgrounds.every((b) => verdictOf(f, b) === verdict));
  if (verdict === "unknown" || !agreed) {
    analysis.contrast.unresolvedRuns++;
    return;
  }
  analysis.contrast.checkedRuns++;
  if (verdict === "fail") {
    analysis.contrast.failing.push({
      text,
      ratio: Math.round(contrastRatio(fg, bg) * 100) / 100,
      foreground: `#${fg}`,
      background: `#${bg}`,
      large: large === true,
    });
  }
}

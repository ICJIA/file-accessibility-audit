/**
 * Shared OOXML (Office Open XML / OPC) machinery used by the docx, pptx,
 * and xlsx extractors. Everything here is format-agnostic: ZIP part reading
 * with a decompression-bomb cap, fast-xml-parser preserveOrder walking,
 * OPC relationship + core-properties parsing, the DrawingML alt-text
 * convention, and WCAG contrast math.
 *
 * Extracted verbatim from docxService.ts in v1.33.0 — behavior is pinned by
 * ooxml.test.ts and, transitively, by the docx suites which must pass
 * unchanged against the extraction.
 */
import JSZip from "jszip";
import { XMLParser, type X2jOptions } from "fast-xml-parser";
import type { Readable } from "node:stream";
import { placeholderAltOf } from "./placeholderAlt.js";

// ---------------------------------------------------------------------------
// preserveOrder walker utilities
// ---------------------------------------------------------------------------
// fast-xml-parser's preserveOrder mode returns each element as an object with
// a single tag key mapping to its ordered child array, plus an optional `:@`
// attribute bag. removeNSPrefix strips `w:`/`a:`/`p:`/`xdr:`/etc. so we match
// local names across every OOXML vocabulary.

export type PONode = Record<string, unknown>;

// processEntities is left at its library default (true) — DELIBERATELY, not
// an oversight. Investigated for C2 (XML entity hardening) against the
// installed fast-xml-parser@5.9.3: setting processEntities:false makes
// replaceEntitiesValue() (src/xmlparser/OrderedObjParser.js) short-circuit
// ALL entity decoding, including the five built-in XML entities (&amp; &lt;
// &gt; &apos; &quot;) — it would corrupt ordinary document text and alt text
// that happens to contain one of them (e.g. "Smith &amp; Co."). Verified with
// a throwaway probe script and pinned by the "&amp; still decodes" test in
// ooxml.test.ts. DOCTYPE rejection (below) is the actual defense instead.
//
// NUMERIC CHARACTER REFERENCES (2026-10-06). The library's own decoder
// handles &#…; only when its deprecated htmlEntities switch is on, so
// "&#xA;" stayed in the text literally — and real PowerPoint writes every line
// break inside alt text that way ("icon&#xA;&#xA;Description automatically
// generated"). XML requires them decoded. This decoder does exactly what XML
// 1.0 defines, in ONE pass so "&amp;#233;" stays the literal text "&#233;":
// the five predefined entities and numeric references to characters XML
// allows. A reference to a forbidden character (&#0;, a lone surrogate, past
// U+10FFFF) is left as written rather than invented. Nothing else is
// expanded: a DOCTYPE never reaches the parser, so no entity is ever declared.
const XML_PREDEFINED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const ENTITY_RE = /&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g;
const isXmlChar = (cp: number): boolean =>
  cp === 0x9 ||
  cp === 0xa ||
  cp === 0xd ||
  (cp >= 0x20 && cp <= 0xd7ff) ||
  (cp >= 0xe000 && cp <= 0xfffd) ||
  (cp >= 0x10000 && cp <= 0x10ffff);
export function decodeXmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY_RE, (ref, dec?: string, hex?: string, name?: string) => {
    if (name) return XML_PREDEFINED[name]!;
    const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex!, 16);
    return isXmlChar(cp) ? String.fromCodePoint(cp) : ref;
  });
}
const xmlEntityDecoder: NonNullable<X2jOptions["entityDecoder"]> = {
  decode: decodeXmlEntities,
  setExternalEntities: () => {},
  addInputEntities: () => {},
  reset: () => {},
  setXmlVersion: () => {},
};

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  processEntities: true,
  entityDecoder: xmlEntityDecoder,
} as const;
const parser = new XMLParser({ ...PARSER_OPTIONS, removeNSPrefix: true });
// The same parse with namespace prefixes KEPT, for the one place a local name
// is ambiguous once they are stripped — see relationshipIdsOf.
const prefixedParser = new XMLParser({ ...PARSER_OPTIONS, removeNSPrefix: false });

// DOCTYPE_RE matches a literal "<!DOCTYPE" (case-insensitive) anywhere in a
// part's raw XML text, BEFORE it is ever handed to fast-xml-parser. OOXML
// parts (document.xml, presentation.xml, workbook.xml, or any other part in
// a docx/pptx/xlsx) never legitimately carry a DOCTYPE, so this has zero cost
// for real documents. It is belt-and-braces alongside fast-xml-parser
// v5.9.3's own DocTypeReader, which already (independent of processEntities):
//   - unconditionally throws on SYSTEM (external) and "%" (parameter)
//     entity declarations ("External/Parameter entities are not
//     supported"), closing the classic file-read/SSRF XXE vector, and
//   - never registers an internal <!ENTITY> whose value itself contains
//     "&" (i.e. references another entity), so a recursive "billion
//     laughs" expansion chain can never be assembled in the first place.
// But a construct with no legitimate reason to appear in an OOXML part
// should not rely SOLELY on a third-party parser's internal security
// posture — hence rejecting it outright, here, before parse.
const DOCTYPE_RE = /<!DOCTYPE/i;

/**
 * Parse a part's raw XML into fast-xml-parser's preserveOrder node array.
 * Returns [] for null/empty input, for a part containing a <!DOCTYPE
 * declaration (see DOCTYPE_RE above — treated exactly like any other
 * unparseable input, not a distinct error shape), and for XML that
 * fast-xml-parser itself fails to parse.
 */
export function parseXml(xml: string | null): PONode[] {
  if (!xml || DOCTYPE_RE.test(xml)) return [];
  try {
    return parser.parse(xml) as PONode[];
  } catch {
    return [];
  }
}

export function tagOf(node: PONode): string | null {
  for (const k of Object.keys(node)) {
    if (k === ":@" || k === "#text") continue;
    return k;
  }
  return "#text" in node ? "#text" : null;
}

export function childrenOf(node: PONode): PONode[] {
  const t = tagOf(node);
  if (!t || t === "#text") return [];
  const v = node[t];
  if (!Array.isArray(v)) return [];
  // mc:AlternateContent serializes the same content twice — a modern
  // mc:Choice branch plus a legacy mc:Fallback (VML) duplicate. Walking both
  // double-counted text-box text, images, list items, and contrast runs
  // everywhere. Flatten to the FIRST Choice (matching how modern Office
  // consumes it), falling back to Fallback only when no Choice exists.
  if (!(v as PONode[]).some((c) => tagOf(c) === "AlternateContent")) {
    return v as PONode[];
  }
  const out: PONode[] = [];
  for (const c of v as PONode[]) {
    if (tagOf(c) === "AlternateContent") {
      const branches = (c["AlternateContent"] as PONode[]) ?? [];
      const branch =
        branches.find((k) => tagOf(k) === "Choice") ??
        branches.find((k) => tagOf(k) === "Fallback");
      if (branch) out.push(...childrenOf(branch));
      continue;
    }
    out.push(c);
  }
  return out;
}

export function attrOf(node: PONode, name: string): string | undefined {
  const bag = node[":@"] as Record<string, unknown> | undefined;
  const v = bag?.[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}

// ---------------------------------------------------------------------------
// Switches, read the way the schemas define them (2026-10-06). The same file
// must not read two ways because one producer writes "1" and another "true".
// ---------------------------------------------------------------------------

/** An xsd:boolean attribute — DrawingML and PresentationML (b, show,
 *  firstRow, the decorative mark): "1"/"true" → true, "0"/"false" → false,
 *  absent or anything else → undefined. Office writes "1"/"0"; the schema
 *  admits both spellings, and other producers use the other one. */
export function xsdBoolean(value: string | undefined): boolean | undefined {
  const v = value?.trim();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

/** A WordprocessingML ST_OnOff / SpreadsheetML boolean-property ELEMENT that
 *  is present (<w:b/>, <w:tblHeader/>, Excel's <b/>): on unless its val says
 *  "0", "false" or "off". python-docx writes run.bold = False as
 *  <w:b w:val="0"/>, so presence alone does not mean bold. */
export function onOffEnabled(node: PONode): boolean {
  const val = attrOf(node, "val");
  return val === undefined || !/^\s*(0|false|off)\s*$/i.test(val);
}

/** The relationship id (r:id) on every element with local name `localName`,
 *  in document order — e.g. the slides of p:sldIdLst. With prefixes stripped,
 *  <p:sldId id="256" r:id="rId2"/> keeps whichever of its two id attributes
 *  comes LAST, so attribute order (which carries no meaning in XML) decided
 *  which value the parser saw (2026-10-06). This parses with prefixes kept and
 *  takes the attribute whose prefix is bound to the relationships namespace
 *  (transitional or Strict). An element with none yields undefined. */
const RELATIONSHIPS_NS = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
]);
export function relationshipIdsOf(
  xml: string | null,
  localName: string,
): Array<string | undefined> {
  if (!xml || DOCTYPE_RE.test(xml)) return [];
  let nodes: PONode[];
  try {
    nodes = prefixedParser.parse(xml) as PONode[];
  } catch {
    return [];
  }
  const out: Array<string | undefined> = [];
  const visit = (list: PONode[], scope: Map<string, string>): void => {
    for (const node of list) {
      const tag = tagOf(node);
      if (!tag || tag === "#text" || tag.startsWith("?")) continue;
      const bag = (node[":@"] as Record<string, unknown> | undefined) ?? {};
      let inner = scope;
      for (const [k, v] of Object.entries(bag)) {
        const m = /^@_xmlns:(.+)$/.exec(k);
        if (m) {
          if (inner === scope) inner = new Map(scope);
          inner.set(m[1]!, String(v));
        }
      }
      if (tag.replace(/^[^:]*:/, "") === localName) {
        const relAttr = Object.keys(bag).find((k) => {
          const m = /^@_([^:]+):id$/.exec(k);
          return !!m && RELATIONSHIPS_NS.has(inner.get(m[1]!) ?? "");
        });
        out.push(relAttr ? String(bag[relAttr]) : undefined);
      }
      const kids = node[tag];
      if (Array.isArray(kids)) visit(kids as PONode[], inner);
    }
  };
  visit(nodes, new Map());
  return out;
}

/** A relationship target resolved to a ZIP entry name, the OPC way: an
 *  absolute target ("/ppt/slides/slide1.xml") is a part name from the
 *  package root; a relative one resolves against the source part's folder,
 *  with "." and ".." segments. */
export function resolveRelTarget(sourceDir: string, target: string): string {
  const segs = target.startsWith("/") ? [] : sourceDir.split("/").filter(Boolean);
  for (const s of target.split("/")) {
    if (s === "..") segs.pop();
    else if (s !== "." && s !== "") segs.push(s);
  }
  return segs.join("/");
}

/** First direct child with the given local tag name. */
export function firstChild(node: PONode, tag: string): PONode | undefined {
  return childrenOf(node).find((c) => tagOf(c) === tag);
}

/** All descendants (any depth) with the given local tag name. */
export function descendants(node: PONode, tag: string): PONode[] {
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
export function rawText(node: PONode): string {
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

/**
 * Text of a node from its local-name `t` descendants. Covers `w:t` (Word),
 * `a:t` (DrawingML — PowerPoint text runs), and `t` (Excel shared strings).
 */
export function textOf(node: PONode): string {
  return descendants(node, "t")
    .map((t) => rawText(t))
    .join("");
}

// ---------------------------------------------------------------------------
// Declared-language plausibility inputs (2026-10-05) — what PDF has checked
// since 2026-08-29 (languagePlausibility.ts), gathered for Word and
// PowerPoint. The sample never leaves the OOXML worker: only metadata and
// scoring cross the IPC boundary, so no document text is stored.
// ---------------------------------------------------------------------------

/** Characters of text sampled — the same size PDF takes. */
export const LANGUAGE_SAMPLE_CHARS = 4000;

/** The first LANGUAGE_SAMPLE_CHARS characters of the paragraphs' text, in
 *  order, one space between paragraphs. */
export function languageSample(paragraphs: PONode[]): string {
  let out = "";
  for (const p of paragraphs) {
    if (out.length >= LANGUAGE_SAMPLE_CHARS) break;
    const t = textOf(p).trim();
    if (t) out += (out ? " " : "") + t;
  }
  return out.slice(0, LANGUAGE_SAMPLE_CHARS);
}

/** Adds a declared language's primary subtag ("es" from "es-ES") to `into`.
 *  Values not shaped like a language code are dropped, and the set is
 *  bounded — a forged file must not grow it without limit. */
export function addLanguagePrimary(into: Set<string>, value: string | undefined): void {
  const primary = (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (/^[a-z]{2,3}$/.test(primary) && into.size < 32) into.add(primary);
}

/**
 * The language declared on MORE THAN HALF of a file's text, for a file with
 * no document-wide default (2026-10-06 — one rule for Word and PowerPoint, a
 * user decision). `chars` maps each run-level tag to the characters of text
 * it covers; `totalChars` counts ALL the text, declared or not. The majority
 * is taken by LANGUAGE — en-US and en-GB together are English — and the
 * most-used tag of that language is returned. A value that is not a language
 * code ("english") still counts as a declaration, grouped by its own text, so
 * the scorer can report it as unusable rather than as missing.
 *
 * Why a majority: Review → Language → Set Proofing Language on a selection
 * (Microsoft's documented route, and this report's advice) marks every run,
 * so the text's language IS programmatically determined even though no
 * document default exists — while one stray marked word is not the language
 * of the whole file.
 */
export function predominantLanguage(chars: Map<string, number>, totalChars: number): string | null {
  if (!(totalChars > 0)) return null;
  const groups = new Map<string, { total: number; bestTag: string; bestChars: number }>();
  for (const [rawTag, n] of chars) {
    const tag = rawTag.trim();
    if (!tag || !(n > 0)) continue;
    const key = (/^([a-z]{2,3})(?:[-_]|$)/i.exec(tag)?.[1] ?? tag).toLowerCase();
    const g = groups.get(key) ?? { total: 0, bestTag: tag, bestChars: 0 };
    g.total += n;
    if (n > g.bestChars) {
      g.bestTag = tag;
      g.bestChars = n;
    }
    groups.set(key, g);
  }
  let winner: { total: number; bestTag: string } | null = null;
  for (const g of groups.values()) if (!winner || g.total > winner.total) winner = g;
  return winner && winner.total * 2 > totalChars ? winner.bestTag : null;
}

/** The single root element of a parsed part (skips the xml declaration node). */
export function rootElement(nodes: PONode[], tag: string): PONode | undefined {
  return nodes.find((n) => tagOf(n) === tag);
}

// ---------------------------------------------------------------------------
// OPC conventions shared by every OOXML package
// ---------------------------------------------------------------------------

/** Parse an OPC `.rels` part into a Relationship Id -> Target map. */
export function parseRelationships(relsXml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (!relsRoot) return map;
  for (const rel of childrenOf(relsRoot)) {
    if (tagOf(rel) !== "Relationship") continue;
    const id = attrOf(rel, "Id");
    const target = attrOf(rel, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Trimmed text of a `docProps/core.xml` property (title, creator, …), or null. */
export function corePropertyText(coreRoot: PONode | undefined, tag: string): string | null {
  if (!coreRoot) return null;
  const node = firstChild(coreRoot, tag);
  const t = node ? rawText(node).trim() : "";
  return t.length > 0 ? t : null;
}

/**
 * Alt text + decorative flag from a DrawingML properties node — `wp:docPr`
 * (Word), `p:cNvPr` (PowerPoint), or `xdr:cNvPr` (Excel drawings). All three
 * carry the same `descr` / `title` attributes and `adec:decorative` extension.
 */
export function drawingAltText(propsNode: PONode): {
  altText: string | null;
  decorative: boolean;
  /** True when only the Title property is filled — assistive technology
   *  reads the Description (descr) field, so a Title alone is NOT alt text
   *  (Word-2010-era documents commonly have only Title filled). */
  titleOnly: boolean;
  /** The description, when it is only a file name or a placeholder word —
   *  "GA details.png", "Picture" — which is not a description (WCAG F30;
   *  2026-10-06). altText is then null. Absent otherwise. */
  placeholderAlt?: string;
} {
  const descr = attrOf(propsNode, "descr")?.trim();
  const title = attrOf(propsNode, "title")?.trim();
  const placeholderAlt = placeholderAltOf(descr);
  const altText = descr && !placeholderAlt ? descr : null;
  const decorative = descendants(propsNode, "decorative").some(
    (d) => xsdBoolean(attrOf(d, "val")) === true,
  );
  return {
    altText,
    decorative,
    titleOnly: !descr && !!title,
    ...(placeholderAlt ? { placeholderAlt } : {}),
  };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** A paragraph that starts with a literal bullet or "1." / "2)" enumerator. */
export const MANUAL_BULLET_RE = /^\s*([••‣◦⁃∙*-]|\d+[.)])\s+/;

// ---------------------------------------------------------------------------
// Color contrast (WCAG 1.4.3)
// ---------------------------------------------------------------------------
// 4.5:1 / 3:1 are the fixed definition of SC 1.4.3, not tunable policy, so they
// live here rather than in audit.config.ts.

export const CONTRAST_MIN_NORMAL = 4.5;
export const CONTRAST_MIN_LARGE = 3.0;

export function normalizeHex(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? m[1].toUpperCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relLuminance([r, g, b]: [number, number, number]): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relLuminance(hexToRgb(fg));
  const l2 = relLuminance(hexToRgb(bg));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Capped ZIP part reading
// ---------------------------------------------------------------------------

/**
 * Read a ZIP entry to a string with a HARD uncompressed-byte cap enforced
 * during decompression, so a "zip bomb" (a tiny compressed part that inflates
 * to gigabytes) is aborted early instead of OOM-ing the process. The ZIP's
 * declared uncompressed size is checked first as a cheap fast-reject, but it is
 * attacker-controlled, so the streaming cap is the real guard.
 *
 * `makeError` supplies the per-format error type (DocxParseError,
 * PptxParseError, XlsxParseError) so route-level error mapping keeps working.
 * Optional — callers that don't need a specific error subclass (or that
 * discard the error entirely, like analyzer.ts's format-detection probe) can
 * omit it and get a plain Error.
 */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
  makeError: (message: string) => Error = (m) => new Error(m),
): Promise<string> {
  const declared =
    (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  const overLimit = (): Error =>
    makeError(
      `A document part (${partName}) exceeds the ${Math.round(
        cap / (1024 * 1024),
      )} MB uncompressed size limit.`,
    );
  if (declared > cap) return Promise.reject(overLimit());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // jszip types nodeStream as NodeJS.ReadableStream (no destroy); the runtime
    // object is a Node Readable, so cast to get the abort method.
    const stream = f.nodeStream("nodebuffer") as unknown as Readable;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > cap) {
        stream.destroy();
        reject(overLimit());
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", () => reject(makeError(`A document part (${partName}) could not be read.`)));
    stream.on("end", () => resolve(decodeXmlBytes(Buffer.concat(chunks))));
  });
}

/**
 * A part's bytes as text. OPC allows XML parts in UTF-8 or UTF-16, and XML
 * requires a UTF-16 entity to begin with a byte order mark, which is how
 * the encoding is told apart (2026-10-06: every part was decoded as UTF-8,
 * so a UTF-16 package was rejected as "not a supported document"). A UTF-8
 * byte order mark is dropped rather than left at the start of the text.
 */
export function decodeXmlBytes(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)).toString("utf16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)))
      .swap16()
      .toString("utf16le");
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf-8");
  }
  return bytes.toString("utf-8");
}

// ---------------------------------------------------------------------------
// Aggregate ZIP-package limits (entry count + total declared size)
// ---------------------------------------------------------------------------

/**
 * Reject a package outright — before any part is read — if it has more
 * entries than `limits.maxEntries`, or if the SUM of every entry's declared
 * uncompressed size exceeds `limits.maxTotalUncompressedBytes`. Complements
 * readCapped's PER-PART streaming cap: that guards any one part from
 * inflating past its own limit, but says nothing about a package built from
 * many separately-legal-sized parts (styles, dozens of slides/sheets, media,
 * drawings, tables, rels, theme, core/app props) whose total would still
 * cost an unbounded amount of cumulative decompression work across a single
 * analysis. A package with an enormous number of tiny entries is its own
 * (smaller but real) cost center — JSZip's central-directory parse is
 * O(entries) — so the entry-count check is independent of size and runs
 * first.
 *
 * Declared sizes come straight from the ZIP central directory (no
 * decompression yet, so this is cheap), but — like readCapped's fast-reject
 * check — they are attacker-controlled metadata. This function is a fast
 * fail on obviously-abusive packages; readCapped's streaming byte cap
 * remains the authoritative per-part defense regardless of what a package
 * declares.
 *
 * `makeError` mirrors readCapped's pattern so callers get their own
 * format-specific error type (DocxParseError, PptxParseError,
 * XlsxParseError, ...) — existing route-level `err.code` mapping keeps
 * working unchanged.
 */
export function assertZipWithinLimits(
  zip: JSZip,
  limits: { maxEntries: number; maxTotalUncompressedBytes: number },
  makeError: (message: string) => Error,
): void {
  const entries = Object.values(zip.files);
  if (entries.length > limits.maxEntries) {
    throw makeError(
      `This package contains too many entries (${entries.length.toLocaleString()}) to analyze.`,
    );
  }
  let total = 0;
  for (const f of entries) {
    total +=
      (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  }
  if (total > limits.maxTotalUncompressedBytes) {
    throw makeError(
      `This package's total uncompressed content (${Math.round(
        total / (1024 * 1024),
      )} MB) exceeds the ${Math.round(limits.maxTotalUncompressedBytes / (1024 * 1024))} MB limit.`,
    );
  }
}

/** Rels entries with their Type preserved (media / table detection needs it). */
export function parseRelationshipEntries(
  relsXml: string | null,
): Array<{ id: string; target: string; type: string }> {
  const out: Array<{ id: string; target: string; type: string }> = [];
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (!relsRoot) return out;
  for (const rel of childrenOf(relsRoot)) {
    if (tagOf(rel) !== "Relationship") continue;
    const id = attrOf(rel, "Id");
    const target = attrOf(rel, "Target");
    const type = attrOf(rel, "Type") ?? "";
    if (id && target) out.push({ id, target, type });
  }
  return out;
}

// a:schemeClr aliases: text/background names map onto the dark/light slots.
const SCHEME_ALIASES: Record<string, string> = {
  tx1: "dk1",
  bg1: "lt1",
  tx2: "dk2",
  bg2: "lt2",
};

/** Resolve one scheme-color name against an already-located clrScheme node.
 *  Split out of resolveSchemeColor so buildSchemeColorMap can walk to the
 *  clrScheme ONCE and reuse it across every name instead of re-walking the
 *  theme per name. */
function resolveSchemeEntry(scheme: PONode, name: string): string | null {
  const entry = firstChild(scheme, SCHEME_ALIASES[name] ?? name);
  if (!entry) return null;
  const srgb = firstChild(entry, "srgbClr");
  if (srgb) return normalizeHex(attrOf(srgb, "val"));
  const sys = firstChild(entry, "sysClr");
  if (sys) return normalizeHex(attrOf(sys, "lastClr"));
  return null;
}

/** Resolve a DrawingML scheme-color name to a 6-digit hex via the theme part. */
export function resolveSchemeColor(themeRoot: PONode | undefined, name: string): string | null {
  if (!themeRoot) return null;
  const scheme = descendants(themeRoot, "clrScheme")[0];
  if (!scheme) return null;
  return resolveSchemeEntry(scheme, name);
}

/** Every DrawingML scheme-color name a:schemeClr@val can carry: the 12
 *  clrScheme slots (dk1/lt1/dk2/lt2/accent1..6/hlink/folHlink) plus the
 *  tx1/bg1/tx2/bg2 aliases real documents commonly reference directly
 *  (a:schemeClr val="tx1", not "dk1") — resolveSchemeColor() already maps
 *  each alias onto its dk/lt slot, so resolving both forms here just means
 *  callers can look up whatever name actually appears in the XML. */
const SCHEME_COLOR_NAMES = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
  "tx1",
  "bg1",
  "tx2",
  "bg2",
] as const;

/**
 * Resolve every DrawingML scheme-color name to its hex value ONCE, so
 * per-run contrast checks become an O(1) Map lookup instead of calling
 * resolveSchemeColor() — which walks descendants(themeRoot, "clrScheme")
 * from scratch — once per text run. That per-run re-walk is O(runs x theme
 * size): a large theme part (tens of MB is valid ZIP content) combined with
 * a few hundred runs can hold the event loop for tens of seconds, past a
 * timeout that can't interrupt synchronous work.
 *
 * Walks to the clrScheme ONCE and resolves every known name against it (via
 * the same resolveSchemeEntry() resolveSchemeColor() uses), so the whole map
 * costs a single theme walk per analysis — not once per name, and certainly
 * not once per run.
 */
export function buildSchemeColorMap(themeRoot: PONode | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!themeRoot) return map;
  const scheme = descendants(themeRoot, "clrScheme")[0];
  if (!scheme) return map;
  for (const name of SCHEME_COLOR_NAMES) {
    const hex = resolveSchemeEntry(scheme, name);
    if (hex) map.set(name, hex);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Theme-color application helpers (v1.95.0) — shared by the DOCX and XLSX
// contrast upgrades so both formats resolve the same theme the same way.
// ---------------------------------------------------------------------------

/** WordprocessingML's ST_ThemeColor names → clrScheme slots. Word's attr
 *  values ("dark1", "background2", "hyperlink") differ from DrawingML's
 *  slot names; text1/background1 alias the dk/lt slots exactly like
 *  DrawingML's tx1/bg1 (SCHEME_ALIASES). */
export const WORD_THEME_COLOR_MAP: Record<string, string> = {
  dark1: "dk1",
  light1: "lt1",
  dark2: "dk2",
  light2: "lt2",
  text1: "dk1",
  background1: "lt1",
  text2: "dk2",
  background2: "lt2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
  hyperlink: "hlink",
  followedHyperlink: "folHlink",
};

/**
 * Apply Word's themeTint / themeShade to a 6-hex color. Both are a hex BYTE
 * ("99" = 0x99/255): shade multiplies each channel toward black, tint blends
 * each channel toward white — the WordprocessingML per-channel formulas, not
 * DrawingML's HSL variant. Invalid inputs return the base color unchanged
 * (never null: a bad modifier must not erase a resolved color).
 */
export function applyWordTintShade(hex: string, tint?: string, shade?: string): string {
  const parse = (b?: string): number | null =>
    b && /^[0-9a-fA-F]{1,2}$/.test(b) ? parseInt(b, 16) / 255 : null;
  const channels = [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
  if (channels.some((c) => Number.isNaN(c))) return hex;
  const shadeV = parse(shade);
  const tintV = parse(tint);
  let out = channels;
  if (shadeV !== null) out = out.map((c) => c * shadeV);
  if (tintV !== null) out = out.map((c) => c * tintV + 255 * (1 - tintV));
  return out
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

/**
 * Apply SpreadsheetML's `tint` attribute (a double in [-1, 1]) to a 6-hex
 * color, per the documented HSL-luminance formula: negative darkens
 * (L' = L·(1+tint)), positive lightens (L' = L·(1−tint) + tint). Zero or
 * invalid → unchanged.
 */
export function applyExcelTint(hex: string, tint: number): string {
  if (!Number.isFinite(tint) || tint === 0) return hex;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((c) => Number.isNaN(c))) return hex;
  // RGB → HSL
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  let h = 0;
  const l0 = (max + min) / 2;
  const d = max - min;
  let sat = 0;
  if (d !== 0) {
    sat = l0 > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const l = tint < 0 ? l0 * (1 + tint) : l0 * (1 - tint) + tint;
  // HSL → RGB
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let ro: number, go: number, bo: number;
  if (sat === 0) {
    ro = go = bo = l;
  } else {
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const pp = 2 * l - q;
    ro = hue2rgb(pp, q, h + 1 / 3);
    go = hue2rgb(pp, q, h);
    bo = hue2rgb(pp, q, h - 1 / 3);
  }
  return [ro, go, bo]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c * 255)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

/** SpreadsheetML theme-INDEX order (`<color theme="N"/>`). Indices 0–3 are
 *  the lt1/dk1/lt2/dk2 pairs in EXCEL's order (light first — the classic
 *  gotcha: theme1.xml lists dk1 before lt1, but Excel's index puts the
 *  background first, which is why theme="0" fills are white and theme="1"
 *  text is black in every stock workbook); 4–9 the accents; 10–11 the link
 *  colors. Verified empirically against Excel-authored controls in
 *  xlsxThemeContrast tests. */
export const EXCEL_THEME_INDEX_ORDER: readonly string[] = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];

/** The SpreadsheetML legacy indexed-color palette (`<color indexed="N"/>`),
 *  per ECMA-376 §18.8.27 — the fixed default table (0–7 duplicate 8–15;
 *  64/65 are the system foreground/background, resolved as black/white).
 *  Workbooks may override it via styles.xml <colors><indexedColors>. */
export const EXCEL_INDEXED_PALETTE: readonly string[] = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
  "000000",
  "FFFFFF",
];

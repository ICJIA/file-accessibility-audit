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
import { XMLParser } from "fast-xml-parser";
import type { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// preserveOrder walker utilities
// ---------------------------------------------------------------------------
// fast-xml-parser's preserveOrder mode returns each element as an object with
// a single tag key mapping to its ordered child array, plus an optional `:@`
// attribute bag. removeNSPrefix strips `w:`/`a:`/`p:`/`xdr:`/etc. so we match
// local names across every OOXML vocabulary.

export type PONode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  preserveOrder: true,
  trimValues: false,
});

export function parseXml(xml: string | null): PONode[] {
  if (!xml) return [];
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
  return Array.isArray(v) ? (v as PONode[]) : [];
}

export function attrOf(node: PONode, name: string): string | undefined {
  const bag = node[":@"] as Record<string, unknown> | undefined;
  const v = bag?.[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
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
export function corePropertyText(
  coreRoot: PONode | undefined,
  tag: string,
): string | null {
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
} {
  const descr = attrOf(propsNode, "descr")?.trim();
  const title = attrOf(propsNode, "title")?.trim();
  let altText: string | null = null;
  if (descr) altText = descr;
  else if (title) altText = title;
  const decorative = descendants(propsNode, "decorative").some(
    (d) => attrOf(d, "val") === "1",
  );
  return { altText, decorative };
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
 */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
  makeError: (message: string) => Error,
): Promise<string> {
  const declared =
    (f as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize ?? 0;
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
    stream.on("error", () =>
      reject(makeError(`A document part (${partName}) could not be read.`)),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
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
export function resolveSchemeColor(
  themeRoot: PONode | undefined,
  name: string,
): string | null {
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

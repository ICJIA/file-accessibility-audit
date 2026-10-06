/**
 * scripts/office-encoding-invariance.ts — the same Office document, written
 * every legal way.
 *
 *   pnpm office-encoding-invariance
 *
 * WHY THIS EXISTS (2026-10-06). The PDF gate (encoding-invariance.ts) was
 * built after five author disputes in two days that had one shape: the same
 * meaning, encoded a legal way the checker did not anticipate. Word,
 * PowerPoint and Excel files have the same problem in a different form.
 * ECMA-376 lets one document be written many ways: a heading by a built-in
 * style, a localized style id, or an outline level; a link as an element or a
 * field; a colour as a value or a theme slot; a switch as 1, true or on; text
 * as raw UTF-8 or as numeric character references. Every producer (Word,
 * Google Docs, LibreOffice, openpyxl, the Open XML SDK, …) picks differently,
 * and each new document can bring a form nobody tested.
 *
 * So this gate builds ONE Word document, ONE deck and ONE workbook, re-emits
 * each in every legal encoding of the same meaning, and requires an identical
 * verdict within each family. The verdict is the score, the grade and every
 * category's score and severity, AND a fingerprint of what the parser read:
 * headings, slide titles in presentation order, alt text, link text, table
 * headers and contrast pairs. A fingerprint catches a misread that happens not
 * to move a score this time, such as alt text with "&#xA;" left in it.
 *
 * Each baseline is built so that misreading any encoded property changes the
 * verdict. For example, the contrast runs sit on both sides of the large-text
 * line, so a misread bold flag flips one of them.
 *
 * Deliberately out of scope: renaming parts (word/document.xml,
 * ppt/slideMasters/slideMaster1.xml …). OPC allows any part name, but every
 * producer we have seen, and every real file in controls/, uses the
 * conventional names, which the parsers read directly.
 *
 * Exit code is non-zero if any encoding disagrees with its family's baseline.
 */
import { createRequire } from "node:module";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";
import { analyzeDocx } from "../apps/api/src/services/docxService.js";
import { analyzePptx } from "../apps/api/src/services/pptxService.js";
import { analyzeXlsx } from "../apps/api/src/services/xlsxService.js";

// jszip lives in the analyzer package's dependency tree, not the root's.
const requireAnalyzer = createRequire(
  new URL("../packages/analyzer/package.json", import.meta.url),
);
const JSZip = requireAnalyzer("jszip");

// ---------------------------------------------------------------------------
// Packages as parts, so whole-package re-encodings apply to every family.
// ---------------------------------------------------------------------------
type Parts = Record<string, string | Buffer>;
type Bytes = Parts;
interface PackOpts {
  compression?: "DEFLATE" | "STORE";
  /** false = no directory entries in the ZIP — how Office itself writes it. */
  createFolders?: boolean;
}
interface Encoding {
  name: string;
  why: string;
  build: () => Bytes;
  pack?: PackOpts;
}

const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = {
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  pr: "http://schemas.openxmlformats.org/package/2006/relationships",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  x: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  v: "urn:schemas-microsoft-com:vml",
  o: "urn:schemas-microsoft-com:office:office",
};
const REL = `${NS.r}/`;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The texts every family shares. The non-ASCII characters (an em dash, a
 *  curly apostrophe) are there so the numeric-character-reference encoding
 *  has something to encode. */
const TEXT = {
  title: "Grant Program Report — FY 2026",
  alt: "Bar chart of awards by program — fiscal year 2026",
  link: "the program’s full results",
  url: "https://example.org/results",
  body: "The grant program funded job training and housing support across six counties this year, and every award was reviewed by program staff before the board approved it.",
  body2:
    "Results are reported by program, with the number of sites each award supports and the amount the board approved for the fiscal year.",
  // Contrast runs: 595959 passes (7.0:1); 999999 fails (2.85:1); 808080
  // (3.95:1) passes only as large text, so the bold flag decides it.
  passes: "Program staff reviewed every award.",
  fails: "Figures in gray are estimates.",
  largeBold:
    "Bold notes such as this one are set at fourteen points, which makes them large text under the contrast rule, so a lighter gray is acceptable here.",
  notBold: "Totals exclude pending awards.",
};
const HEX = { passes: "595959", fails: "999999", band: "808080" };
/** Alt Text → "Mark as decorative", as Office 365 writes it on a drawing's
 *  properties. The value is an xsd:boolean: "1" or "true". */
const decorativeExt = (val: "1" | "true") =>
  `<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="${val}"/></a:ext></a:extLst>`;

function relsXml(rels: Array<{ id: string; type: string; target: string; external?: boolean }>) {
  return `${XMLDECL}<Relationships xmlns="${NS.pr}">${rels
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="${r.type.startsWith("http") ? r.type : REL + r.type}" Target="${r.target}"${r.external ? ' TargetMode="External"' : ""}/>`,
    )
    .join("")}</Relationships>`;
}

function coreXml(title: string): string {
  return `${XMLDECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${title}</dc:title><dc:creator>Program Office</dc:creator></cp:coreProperties>`;
}

/** One theme for all three families: accent1–3 hold the three contrast
 *  colours, so a run coloured by theme slot means exactly what a run
 *  coloured by value does. */
const THEME_XML = `${XMLDECL}<a:theme xmlns:a="${NS.a}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="${HEX.passes}"/></a:accent1><a:accent2><a:srgbClr val="${HEX.fails}"/></a:accent2><a:accent3><a:srgbClr val="${HEX.band}"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

function contentTypes(overrides: Array<[string, string]>, extraDefaults: string[] = []): string {
  return `${XMLDECL}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${extraDefaults.join("")}${overrides
    .map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`)
    .join("")}</Types>`;
}
const CT = {
  core: "application/vnd.openxmlformats-package.core-properties+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
  docMain: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  docStyles: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
  docNumbering: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
  pptMain: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  pptSlide: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  pptMaster: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
  xlMain: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  xlSheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  xlStyles: "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
  xlStrings: "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
  xlTable: "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
  xlDrawing: "application/vnd.openxmlformats-officedocument.drawing+xml",
};

// ---------------------------------------------------------------------------
// Whole-package re-encodings — each legal for every OOXML family.
// ---------------------------------------------------------------------------
const isXmlPart = (name: string) => /\.(xml|rels)$/.test(name);
const mapXml = (parts: Bytes, f: (xml: string, name: string) => string | Buffer): Bytes =>
  Object.fromEntries(
    Object.entries(parts).map(([n, c]) => [n, typeof c === "string" && isXmlPart(n) ? f(c, n) : c]),
  );

/** Newlines and indentation between elements. Whitespace between elements
 *  is insignificant in OOXML; text sits only in text-only elements (w:t,
 *  a:t, t, v, dc:title …), which this never splits — nothing is inserted
 *  next to a text token, or between an element's open and close tags. */
function prettyPrint(xml: string): string {
  const tokens = xml.split(/(<[^>]+>)/).filter((t) => t !== "");
  let out = "";
  let depth = 0;
  let prev: string | null = null;
  for (const tok of tokens) {
    const isTag = tok.startsWith("<");
    if (!isTag) {
      out += tok;
      prev = tok;
      continue;
    }
    const closing = tok.startsWith("</");
    const selfClosing = tok.endsWith("/>") || tok.startsWith("<?") || tok.startsWith("<!");
    if (closing) depth--;
    const prevIsTag = prev !== null && prev.startsWith("<");
    const prevOpensThis =
      prevIsTag &&
      closing &&
      !prev!.startsWith("</") &&
      !prev!.endsWith("/>") &&
      !prev!.startsWith("<?");
    if (prevIsTag && !prevOpensThis) out += "\n" + "  ".repeat(Math.max(0, depth));
    out += tok;
    if (!closing && !selfClosing) depth++;
    prev = tok;
  }
  return out;
}

/** Every non-ASCII character written as a numeric character reference — what
 *  an ASCII-only XML writer emits (Python's ElementTree with its default
 *  encoding, for one), and how PowerPoint writes a line break inside alt
 *  text (&#xA;). */
const numericRefs = (xml: string): string =>
  xml.replace(
    /[\u0080-\u{10FFFF}]/gu,
    (ch) => `&#x${ch.codePointAt(0)!.toString(16).toUpperCase()};`,
  );

/** Every namespace prefix renamed (w → ns0, a → ns1 …) and every
 *  default-namespace element given an explicit prefix — what an XML writer
 *  that does not know the conventional prefixes produces (ElementTree's ns0:,
 *  the Open XML SDK's x:). Prefixes are names, not meaning. */
function renamePrefixes(xml: string): string {
  const declared = [...new Set([...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=/g)].map((m) => m[1]!))]
    .filter((p) => p !== "xml")
    .sort((a, b) => b.length - a.length);
  let out = xml;
  declared.forEach((p, i) => {
    const n = `ns${i}`;
    out = out
      .replace(new RegExp(`xmlns:${p}=`, "g"), `xmlns:${n}=`)
      .replace(new RegExp(`<(/?)${p}:`, "g"), `<$1${n}:`)
      .replace(new RegExp(`(\\s)${p}:(?=[\\w.-]+=)`, "g"), `$1${n}:`)
      .replace(/(Requires|Ignorable)="([^"]*)"/g, (_m, attr: string, list: string) => {
        const renamed = list
          .split(/\s+/)
          .map((x) => (x === p ? n : x))
          .join(" ");
        return `${attr}="${renamed}"`;
      });
  });
  if (/\sxmlns="/.test(out)) {
    out = out
      .replace(/\sxmlns="/, ' xmlns:nsd="')
      .replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, "<$1nsd:$2");
  }
  return out;
}

/** ISO/IEC 29500 Strict: the purl.oclc.org namespaces and relationship types
 *  (Word, PowerPoint and Excel all offer "Strict Open XML" in Save As). */
function strictNamespaces(xml: string): string {
  const map: Array<[string, string]> = [
    [NS.r, "http://purl.oclc.org/ooxml/officeDocument/relationships"],
    [NS.w, "http://purl.oclc.org/ooxml/wordprocessingml/main"],
    [NS.wp, "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing"],
    [NS.pic, "http://purl.oclc.org/ooxml/drawingml/picture"],
    [NS.a, "http://purl.oclc.org/ooxml/drawingml/main"],
    [NS.p, "http://purl.oclc.org/ooxml/presentationml/main"],
    [NS.x, "http://purl.oclc.org/ooxml/spreadsheetml/main"],
    [NS.xdr, "http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing"],
  ];
  let out = xml;
  for (const [from, to] of map) out = out.split(from).join(to);
  return out
    .replace(/<w:document /, '<w:document w:conformance="strict" ')
    .replace(/<p:presentation /, '<p:presentation conformance="strict" ')
    .replace(/<workbook /, '<workbook conformance="strict" ');
}

/** Every internal relationship target written as an absolute part name
 *  ("/xl/worksheets/sheet1.xml") — openpyxl writes its worksheets so. */
function absoluteTargets(xml: string, partName: string): string {
  if (!partName.endsWith(".rels")) return xml;
  const sourceDir = partName.replace(/(^|\/)_rels\/[^/]*$/, "");
  return xml.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
    if (/TargetMode="External"/.test(rel)) return rel;
    return rel.replace(/Target="([^"]+)"/, (_m, target: string) => {
      if (target.startsWith("/")) return `Target="${target}"`;
      const segs = sourceDir ? sourceDir.split("/") : [];
      for (const s of target.split("/")) {
        if (s === "..") segs.pop();
        else if (s !== "." && s !== "") segs.push(s);
      }
      return `Target="/${segs.join("/")}"`;
    });
  });
}

const withBom = (xml: string): Buffer =>
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(xml, "utf-8")]);
const asUtf16 = (xml: string): Buffer =>
  Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'), "utf16le"),
  ]);

/** The package-level encodings, applied to a family's baseline. */
function packageEncodings(base: () => Parts): Encoding[] {
  return [
    {
      name: "pretty-printed",
      why: "every part indented, one element per line — whitespace between elements carries no meaning in OOXML, but a walker that counts or indexes children sees text nodes it never expected",
      build: () => mapXml(base(), prettyPrint),
    },
    {
      name: "utf8-byte-order-mark",
      why: "every part starts with a UTF-8 byte order mark, as .NET's default XmlWriter encoding writes it",
      build: () => mapXml(base(), withBom),
    },
    {
      name: "utf16-parts",
      why: "every part encoded as UTF-16 with a byte order mark — OPC allows UTF-8 or UTF-16, and a reader that assumes UTF-8 sees garbage",
      build: () => mapXml(base(), asUtf16),
    },
    {
      name: "numeric-character-references",
      why: "every non-ASCII character written as &#x…; — an ASCII-only writer's output, and how PowerPoint writes a line break inside alt text",
      build: () => mapXml(base(), numericRefs),
    },
    {
      name: "renamed-namespace-prefixes",
      why: "every prefix renamed (w: → ns0:) and default-namespace elements prefixed — ElementTree's ns0:, the Open XML SDK's x:; prefixes are names, not meaning",
      build: () => mapXml(base(), renamePrefixes),
    },
    {
      name: "strict-ooxml-namespaces",
      why: "ISO/IEC 29500 Strict, Save As → Strict Open XML: purl.oclc.org namespaces and relationship types",
      build: () => mapXml(base(), strictNamespaces),
    },
    {
      name: "absolute-relationship-targets",
      why: 'every internal relationship target absolute ("/ppt/slides/slide1.xml") — openpyxl writes its worksheets this way (verified, openpyxl 3.1.5)',
      build: () => mapXml(base(), absoluteTargets),
    },
    {
      name: "stored-uncompressed",
      why: "ZIP entries STORED rather than deflated",
      build: () => base(),
      pack: { compression: "STORE" },
    },
    {
      name: "no-directory-entries",
      why: "a ZIP with file entries only and no folder entries, as Office itself writes it",
      build: () => base(),
      pack: { createFolders: false },
    },
  ];
}

async function pack(parts: Bytes, opts: PackOpts = {}): Promise<Buffer> {
  const z = new JSZip();
  // [Content_Types].xml first, as OPC writers conventionally do.
  const names = Object.keys(parts).sort((a, b) =>
    a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0,
  );
  for (const n of names) z.file(n, parts[n], { createFolders: opts.createFolders ?? true });
  return z.generateAsync({ type: "nodebuffer", compression: opts.compression ?? "DEFLATE" });
}

// ---------------------------------------------------------------------------
// WORD — one report, every legal way to say the same things.
// ---------------------------------------------------------------------------
interface WordOpts {
  language?: "docDefaults" | "normalStyle" | "runs";
  headings?:
    "builtin" | "localizedIds" | "basedOnHeading" | "outlineLevelStyle" | "directOutlineLevel";
  list?: "direct" | "style";
  headerRow?: "repeatHeader" | "repeatHeaderTrue" | "lookAttribute" | "lookHex";
  decorative?: "1" | "true";
  borders?: "table" | "style" | "cells";
  image?: "inline" | "vml" | "alternateContent";
  link?: "element" | "simpleField" | "complexField";
  color?: "value" | "themeWithValue" | "themeWithAuto";
  boldOn?: "bare" | "1" | "true" | "on";
  boldOff?: "absent" | "0" | "false" | "off";
  /** The 14-pt grey line's "not bold" from its paragraph style: a style
   *  based on a bold one that switches bold off again. */
  boldOffViaStyle?: "0" | "off";
}

function wordParts(o: WordOpts = {}): Parts {
  const language = o.language ?? "docDefaults";
  const runLang = language === "runs" ? '<w:lang w:val="en-US"/>' : "";
  const run = (text: string, props = "") =>
    `<w:r>${props || runLang ? `<w:rPr>${props}${runLang}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const para = (text: string, pPr = "") =>
    `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${run(text)}</w:p>`;

  // Headings.
  const headings = o.headings ?? "builtin";
  const headingStyleId = (level: 1 | 2): string | null =>
    ({
      builtin: `Heading${level}`,
      localizedIds: `berschrift${level}`,
      basedOnHeading: `ReportHeading${level}`,
      outlineLevelStyle: `SectionTitle${level}`,
      directOutlineLevel: null,
    })[headings];
  const heading = (level: 1 | 2, text: string) => {
    const id = headingStyleId(level);
    return para(text, id ? `<w:pStyle w:val="${id}"/>` : `<w:outlineLvl w:val="${level - 1}"/>`);
  };
  const styleRun = (level: 1 | 2) =>
    `<w:rPr><w:b/><w:sz w:val="${level === 1 ? 32 : 26}"/></w:rPr>`;
  const builtinHeadingStyle = (level: 1 | 2, id = `Heading${level}`, outline = true) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/>${outline ? `<w:outlineLvl w:val="${level - 1}"/>` : ""}</w:pPr>${styleRun(level)}</w:style>`;
  const headingStyles = {
    builtin: builtinHeadingStyle(1) + builtinHeadingStyle(2),
    // German Word: the style ID is localized, the built-in NAME stays
    // "heading 1" — and the outline level is the built-in's own.
    localizedIds:
      builtinHeadingStyle(1, "berschrift1", false) + builtinHeadingStyle(2, "berschrift2", false),
    // An agency template's own heading styles, based on the built-ins.
    basedOnHeading:
      builtinHeadingStyle(1) +
      builtinHeadingStyle(2) +
      [1, 2]
        .map(
          (l) =>
            `<w:style w:type="paragraph" w:customStyle="1" w:styleId="ReportHeading${l}"><w:name w:val="Report Heading ${l}"/><w:basedOn w:val="Heading${l}"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="1F3864"/></w:rPr></w:style>`,
        )
        .join(""),
    // A custom style that is a heading only by its outline level.
    outlineLevelStyle: [1, 2]
      .map(
        (l) =>
          `<w:style w:type="paragraph" w:customStyle="1" w:styleId="SectionTitle${l}"><w:name w:val="Section Title ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${l - 1}"/></w:pPr>${styleRun(l as 1 | 2)}</w:style>`,
      )
      .join(""),
    directOutlineLevel: "",
  }[headings];

  // List.
  const listItem = (text: string) =>
    (o.list ?? "direct") === "direct"
      ? para(
          text,
          '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
        )
      : para(text, '<w:pStyle w:val="ListNumber"/>');

  // Table.
  const headerRow = o.headerRow ?? "repeatHeader";
  const borders = o.borders ?? "table";
  const SIDES = ["top", "left", "bottom", "right", "insideH", "insideV"];
  const tblBorders = `<w:tblBorders>${SIDES.map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("")}</w:tblBorders>`;
  const tcBorders = `<w:tcBorders>${["top", "left", "bottom", "right"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("")}</w:tcBorders>`;
  const look = {
    // The header row marked by Repeat Header Rows; the Header Row box off.
    repeatHeader:
      '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>',
    repeatHeaderTrue:
      '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>',
    // Table Design → Header Row, as the explicit attribute alone.
    lookAttribute:
      '<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>',
    // The same box as Word 2007 stored it: bit 0x0020 of the hex value.
    lookHex: '<w:tblLook w:val="0020"/>',
  }[headerRow];
  const cell = (t: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>${borders === "cells" ? tcBorders : ""}</w:tcPr>${para(t)}</w:tc>`;
  const rows = [
    ["Program", "Award", "Sites"],
    ["Job Training", "412,000", "6"],
    ["Housing Support", "268,000", "4"],
  ];
  const table =
    `<w:tbl><w:tblPr>${borders === "style" ? '<w:tblStyle w:val="TableGrid"/>' : ""}<w:tblW w:w="9000" w:type="dxa"/>${borders === "table" ? tblBorders : ""}${look}</w:tblPr>` +
    `<w:tblGrid>${rows[0]!.map(() => '<w:gridCol w:w="3000"/>').join("")}</w:tblGrid>` +
    rows
      .map(
        (r, i) =>
          `<w:tr>${i === 0 && headerRow === "repeatHeader" ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${i === 0 && headerRow === "repeatHeaderTrue" ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : ""}${r.map(cell).join("")}</w:tr>`,
      )
      .join("") +
    "</w:tbl>";

  // Image.
  const drawing = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1905000" cy="1905000"/><wp:docPr id="1" name="Picture 1" descr="${TEXT.alt}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="chart.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="1905000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  // A rule line marked decorative — present in every variant, so the mark's
  // own encoding is the only thing that can change.
  const decorativeRun = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5486400" cy="95250"/><wp:docPr id="2" name="Picture 2">${decorativeExt(o.decorative ?? "1")}</wp:docPr><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="rule.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="95250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const vml = `<w:pict><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:150pt;height:150pt" alt="${TEXT.alt}"><v:imagedata r:id="rIdImg" o:title=""/></v:shape></w:pict>`;
  const imageRun = {
    inline: `<w:r>${drawing}</w:r>`,
    vml: `<w:r>${vml}</w:r>`,
    alternateContent: `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${drawing}</mc:Choice><mc:Fallback>${vml}</mc:Fallback></mc:AlternateContent></w:r>`,
  }[o.image ?? "inline"];

  // Link.
  const linkStyle = '<w:rStyle w:val="Hyperlink"/>';
  const linkRuns = {
    element: `<w:hyperlink r:id="rIdLink" w:history="1">${run(TEXT.link, linkStyle)}</w:hyperlink>`,
    simpleField: `<w:fldSimple w:instr=" HYPERLINK &quot;${TEXT.url}&quot; ">${run(TEXT.link, linkStyle)}</w:fldSimple>`,
    complexField:
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${TEXT.url}" </w:instrText></w:r>` +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run(TEXT.link, linkStyle) +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  }[o.link ?? "element"];

  // Contrast runs.
  const color = (hex: string, slot: string) =>
    ({
      value: `<w:color w:val="${hex}"/>`,
      themeWithValue: `<w:color w:val="${hex}" w:themeColor="${slot}"/>`,
      themeWithAuto: `<w:color w:val="auto" w:themeColor="${slot}"/>`,
    })[o.color ?? "value"];
  const boldOn = {
    bare: "<w:b/>",
    "1": '<w:b w:val="1"/>',
    true: '<w:b w:val="true"/>',
    on: '<w:b w:val="on"/>',
  }[o.boldOn ?? "bare"];
  const boldOff = {
    absent: "",
    "0": '<w:b w:val="0"/>',
    false: '<w:b w:val="false"/>',
    off: '<w:b w:val="off"/>',
  }[o.boldOff ?? "absent"];
  const contrast = [
    `<w:p>${run(TEXT.passes, color(HEX.passes, "accent1"))}</w:p>`,
    `<w:p>${run(TEXT.fails, color(HEX.fails, "accent2"))}</w:p>`,
    `<w:p>${run(TEXT.largeBold, `${boldOn}${color(HEX.band, "accent3")}<w:sz w:val="28"/>`)}</w:p>`,
    // Short, 14 pt and NOT bold: neither large text nor a typed heading.
    `<w:p>${o.boldOffViaStyle ? '<w:pPr><w:pStyle w:val="NoteText"/></w:pPr>' : ""}${run(TEXT.notBold, `${boldOff}${color(HEX.band, "accent3")}<w:sz w:val="28"/>`)}</w:p>`,
  ].join("");

  const body = [
    heading(1, TEXT.title),
    para(TEXT.body),
    heading(2, "Program results"),
    para(TEXT.body2),
    listItem("Job training sites opened in six counties."),
    listItem("Housing support reached four hundred families."),
    listItem("Every award was reviewed before approval."),
    table,
    `<w:p>${imageRun}</w:p>`,
    `<w:p>${decorativeRun}</w:p>`,
    `<w:p>${run("Read ")}${linkRuns}${run(".")}</w:p>`,
    contrast,
  ].join("");

  const docDefaultsLang =
    language === "docDefaults" ? '<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>' : "";
  const normalLang = language === "normalStyle" ? '<w:rPr><w:lang w:val="en-US"/></w:rPr>' : "";
  const styles = `${XMLDECL}<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>${docDefaultsLang}</w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${normalLang}</w:style>${headingStyles}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>${o.boldOffViaStyle ? `<w:style w:type="paragraph" w:customStyle="1" w:styleId="BoldBase"><w:name w:val="Bold Base"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="NoteText"><w:name w:val="Note Text"/><w:basedOn w:val="BoldBase"/><w:rPr><w:b w:val="${o.boldOffViaStyle}"/></w:rPr></w:style>` : ""}<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr>${tblBorders}</w:tblPr></w:style></w:styles>`;
  const numbering = `${XMLDECL}<w:numbering xmlns:w="${NS.w}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const docRels = [
    { id: "rIdStyles", type: "styles", target: "styles.xml" },
    { id: "rIdNumbering", type: "numbering", target: "numbering.xml" },
    { id: "rIdTheme", type: "theme", target: "theme/theme1.xml" },
    { id: "rIdImg", type: "image", target: "media/image1.png" },
    ...((o.link ?? "element") === "element"
      ? [{ id: "rIdLink", type: "hyperlink", target: TEXT.url, external: true }]
      : []),
  ];
  return {
    "[Content_Types].xml": contentTypes([
      ["/word/document.xml", CT.docMain],
      ["/word/styles.xml", CT.docStyles],
      ["/word/numbering.xml", CT.docNumbering],
      ["/word/theme/theme1.xml", CT.theme],
      ["/docProps/core.xml", CT.core],
    ]),
    "_rels/.rels": relsXml([
      { id: "rId1", type: "officeDocument", target: "word/document.xml" },
      {
        id: "rId2",
        type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
        target: "docProps/core.xml",
      },
    ]),
    "docProps/core.xml": coreXml(TEXT.title),
    "word/document.xml": `${XMLDECL}<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}" xmlns:v="${NS.v}" xmlns:o="${NS.o}" xmlns:mc="${NS.mc}" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    "word/_rels/document.xml.rels": relsXml(docRels),
    "word/styles.xml": styles,
    "word/numbering.xml": numbering,
    "word/theme/theme1.xml": THEME_XML,
    "word/media/image1.png": PNG_1X1,
  };
}

// ---------------------------------------------------------------------------
// POWERPOINT — one five-slide deck. Slide parts are deliberately NOT in
// presentation order (slide3.xml is shown second), as in a deck whose slides
// were reordered: only the presentation's own slide list says which is which.
// ---------------------------------------------------------------------------
interface PptOpts {
  titleType?: "title" | "ctrTitle";
  language?: "presentationDefault" | "presentationLevel1" | "masterOnly" | "runs";
  colors?: "srgb" | "scheme";
  picture?: "plain" | "group" | "alternateContent";
  firstRow?: "1" | "true";
  bold?: "1" | "true";
  hidden?: "0" | "false";
  slideIdAttributeOrder?: "idFirst" | "relationshipFirst";
  decorative?: "1" | "true";
}

function pptParts(o: PptOpts = {}): Parts {
  const language = o.language ?? "presentationDefault";
  const runLang = language === "runs" ? ' lang="en-US"' : "";
  const run = (text: string, attrs = "", inner = "") =>
    `<a:r><a:rPr${runLang}${attrs} dirty="0">${inner}</a:rPr><a:t>${text}</a:t></a:r>`;
  const sp = (id: number, name: string, ph: string, paragraphs: string, xfrm = "") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr>${ph ? '<a:spLocks noGrp="1"/>' : ""}</p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
  const title = (text: string, type = "title") =>
    sp(2, "Title 1", `<p:ph type="${type}"/>`, `<a:p>${run(text)}</a:p>`);
  const fill = (hex: string, slot: string) =>
    (o.colors ?? "srgb") === "srgb"
      ? `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`
      : `<a:solidFill><a:schemeClr val="${slot}"/></a:solidFill>`;
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 3" descr="${TEXT.alt}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="6096000" y="1825625"/><a:ext cx="4572000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const placedPicture = {
    plain: picture,
    group: `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Group 4"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="6096000" y="1825625"/><a:ext cx="4572000" cy="3429000"/><a:chOff x="6096000" y="1825625"/><a:chExt cx="4572000" cy="3429000"/></a:xfrm></p:grpSpPr>${picture}</p:grpSp>`,
    alternateContent: `<mc:AlternateContent xmlns:mc="${NS.mc}"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14">${picture}</mc:Choice><mc:Fallback>${picture}</mc:Fallback></mc:AlternateContent>`,
  }[o.picture ?? "plain"];
  const bullets = [
    "Job training sites opened in six counties.",
    "Housing support reached four hundred families.",
    "Every award was reviewed before approval.",
  ]
    .map(
      (t) =>
        `<a:p><a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>${run(t)}</a:p>`,
    )
    .join("");
  const tableRows = [
    ["Program", "Award", "Sites"],
    ["Job Training", "412,000", "6"],
    ["Housing Support", "268,000", "4"],
  ];
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Table 5"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1800000"/><a:ext cx="7800000" cy="1110000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${o.firstRow ?? "1"}" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr><a:tblGrid>${tableRows[0]!.map(() => '<a:gridCol w="2600000"/>').join("")}</a:tblGrid>${tableRows.map((r) => `<a:tr h="370000">${r.map((t) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${run(t)}</a:p></a:txBody><a:tcPr/></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const contactBody = [
    `<a:p>${run("Read ")}${run(TEXT.link, "", '<a:hlinkClick r:id="rIdLink"/>')}${run(".")}</a:p>`,
    `<a:p>${run(TEXT.passes, ' sz="1100"', fill(HEX.passes, "accent1"))}</a:p>`,
    `<a:p>${run(TEXT.fails, ' sz="1100"', fill(HEX.fails, "accent2"))}</a:p>`,
    `<a:p>${run(TEXT.largeBold, ` sz="1400" b="${o.bold ?? "1"}"`, fill(HEX.band, "accent3"))}</a:p>`,
    `<a:p>${run(TEXT.notBold, ' sz="1400"', fill(HEX.band, "accent3"))}</a:p>`,
  ].join("");
  const whiteBg =
    (o.colors ?? "srgb") === "srgb"
      ? '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
      : '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
  const slide = (shapes: string, opts: { bg?: string; show?: string } = {}) =>
    `${XMLDECL}<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"${opts.show !== undefined ? ` show="${opts.show}"` : ""}><p:cSld>${opts.bg ?? ""}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const BODY_PH = '<p:ph idx="1"/>';
  // Presentation order: A, B, C, D, E = slide1, slide3, slide2, slide4, slide5.
  const slides: Record<string, string> = {
    "slide1.xml": slide(
      title("Grant Program Update", o.titleType ?? "title") +
        sp(
          3,
          "Subtitle 2",
          '<p:ph type="subTitle" idx="1"/>',
          `<a:p>${run("Fiscal year 2026 results for the board")}</a:p>`,
        ),
    ),
    "slide3.xml": slide(
      title("Program results") +
        sp(3, "Content Placeholder 2", BODY_PH, bullets) +
        placedPicture +
        `<p:pic><p:nvPicPr><p:cNvPr id="7" name="Picture 6">${decorativeExt(o.decorative ?? "1")}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="838200" y="6400800"/><a:ext cx="10515600" cy="95250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
    ),
    "slide2.xml": slide(title("Awards by program") + table),
    "slide4.xml": slide(
      title("Contact and notes") +
        sp(
          3,
          "Content Placeholder 2",
          BODY_PH,
          contactBody,
          '<a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm>',
        ),
      { bg: whiteBg },
    ),
    // Hidden, untitled, with a typed heading: neither may count against the deck.
    "slide5.xml": slide(
      sp(
        3,
        "TextBox 2",
        "",
        `<a:p>${run("Draft notes for the board", ' sz="3200" b="1"')}</a:p>`,
        '<a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm>',
      ),
      { show: o.hidden ?? "0" },
    ),
    // Visible and untitled, with a 16-pt bold line typed into a text box: a
    // typed heading only while its bold reads as bold (16 pt is not large
    // enough without it), whichever spelling the bold takes.
    "slide6.xml": slide(
      sp(
        3,
        "TextBox 2",
        "",
        `<a:p>${run("Questions for the board", ` sz="1600" b="${o.bold ?? "1"}"`)}</a:p>`,
        '<a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm>',
      ),
    ),
  };
  const order = [
    "slide1.xml",
    "slide3.xml",
    "slide2.xml",
    "slide4.xml",
    "slide5.xml",
    "slide6.xml",
  ];
  const sldId = (i: number, file: string) => {
    const rid = `rId${file.replace(/\D/g, "")}`;
    return (o.slideIdAttributeOrder ?? "idFirst") === "idFirst"
      ? `<p:sldId id="${256 + i}" r:id="${rid}"/>`
      : `<p:sldId r:id="${rid}" id="${256 + i}"/>`;
  };
  const presLang = {
    presentationDefault:
      '<a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400"><a:defRPr sz="1800"/></a:lvl1pPr>',
    presentationLevel1:
      '<a:lvl1pPr marL="0" algn="l" defTabSz="914400"><a:defRPr sz="1800" lang="en-US"/></a:lvl1pPr>',
    masterOnly: '<a:lvl1pPr marL="0" algn="l" defTabSz="914400"><a:defRPr sz="1800"/></a:lvl1pPr>',
    runs: '<a:lvl1pPr marL="0" algn="l" defTabSz="914400"><a:defRPr sz="1800"/></a:lvl1pPr>',
  }[language];
  const masterOtherLang =
    language === "masterOnly" ? '<a:defPPr><a:defRPr lang="en-US"/></a:defPPr>' : "";
  const parts: Parts = {
    "[Content_Types].xml": contentTypes([
      ["/ppt/presentation.xml", CT.pptMain],
      ...order.map((f) => [`/ppt/slides/${f}`, CT.pptSlide] as [string, string]),
      ["/ppt/slideMasters/slideMaster1.xml", CT.pptMaster],
      ["/ppt/theme/theme1.xml", CT.theme],
      ["/docProps/core.xml", CT.core],
    ]),
    "_rels/.rels": relsXml([
      { id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" },
      {
        id: "rId2",
        type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
        target: "docProps/core.xml",
      },
    ]),
    "docProps/core.xml": coreXml(TEXT.title),
    "ppt/presentation.xml": `${XMLDECL}<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${order.map((f, i) => sldId(i, f)).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${presLang}</p:defaultTextStyle></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": relsXml([
      ...order.map((f) => ({
        id: `rId${f.replace(/\D/g, "")}`,
        type: "slide",
        target: `slides/${f}`,
      })),
      { id: "rIdMaster", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
      { id: "rIdTheme", type: "theme", target: "theme/theme1.xml" },
    ]),
    "ppt/slideMasters/slideMaster1.xml": `${XMLDECL}<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle>${masterOtherLang}<a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsXml([
      { id: "rId1", type: "theme", target: "../theme/theme1.xml" },
    ]),
    "ppt/theme/theme1.xml": THEME_XML,
    "ppt/media/image1.png": PNG_1X1,
  };
  for (const [file, xml] of Object.entries(slides)) {
    parts[`ppt/slides/${file}`] = xml;
    parts[`ppt/slides/_rels/${file}.rels`] = relsXml([
      { id: "rIdMaster", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" },
      ...(file === "slide3.xml"
        ? [{ id: "rIdImg", type: "image", target: "../media/image1.png" }]
        : []),
      ...(file === "slide4.xml"
        ? [{ id: "rIdLink", type: "hyperlink", target: TEXT.url, external: true }]
        : []),
    ]);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// EXCEL — one workbook: a defined table, a linked cell, a described chart
// picture, a hidden lookup sheet, and contrast styles on both sides of the
// large-text line.
// ---------------------------------------------------------------------------
interface XlsxOpts {
  strings?: "shared" | "inline" | "richShared";
  headerRowCount?: "absent" | "explicit";
  colors?: "rgb" | "theme" | "indexed";
  boldOn?: "bare" | "1" | "true";
  boldOff?: "absent" | "0" | "false";
  cellReferences?: "present" | "absent";
  dimension?: "present" | "absent";
  decorative?: "1" | "true";
}

function xlsxParts(o: XlsxOpts = {}): Parts {
  const strings = o.strings ?? "shared";
  const sst: string[] = [];
  const str = (text: string, style = 0): { t: string; v: string; s: number } => {
    if (strings === "inline") return { t: "inlineStr", v: text, s: style };
    let i = sst.indexOf(text);
    if (i < 0) i = sst.push(text) - 1;
    return { t: "s", v: String(i), s: style };
  };
  const num = (n: number) => ({ t: "", v: String(n), s: 0 });
  const LINK_CELL = `Read ${TEXT.link}`;
  const grid: Array<Array<ReturnType<typeof str> | null>> = [
    [str("Program"), str("Award"), str("Sites")],
    [str("Job Training"), num(412000), num(6)],
    [str("Housing Support"), num(268000), num(4)],
    [],
    [str(LINK_CELL)],
    [str(TEXT.passes, 1)],
    [str(TEXT.fails, 2)],
    [str(TEXT.largeBold, 3)],
    [str(TEXT.notBold, 4)],
  ];
  const refs = (o.cellReferences ?? "present") === "present";
  const cellXml = (c: ReturnType<typeof str>, col: number, row: number) => {
    const r = refs ? ` r="${String.fromCharCode(65 + col)}${row}"` : "";
    const s = c.s ? ` s="${c.s}"` : "";
    if (c.t === "inlineStr") return `<c${r}${s} t="inlineStr"><is><t>${c.v}</t></is></c>`;
    return `<c${r}${s}${c.t ? ` t="${c.t}"` : ""}><v>${c.v}</v></c>`;
  };
  const sheetData = grid
    .map((cells, i) =>
      cells.length === 0
        ? refs
          ? ""
          : "<row/>"
        : `<row${refs ? ` r="${i + 1}"` : ""}>${cells.map((c, col) => cellXml(c!, col, i + 1)).join("")}</row>`,
    )
    .join("");
  const sheet1 = `${XMLDECL}<worksheet xmlns="${NS.x}" xmlns:r="${NS.r}">${(o.dimension ?? "present") === "present" ? '<dimension ref="A1:C9"/>' : ""}<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetData}</sheetData><hyperlinks><hyperlink ref="A5" r:id="rIdLink"/></hyperlinks><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><drawing r:id="rIdDrawing"/><tableParts count="1"><tablePart r:id="rIdTable"/></tableParts></worksheet>`;
  const lookup = str("Internal lookup values", 2);
  const sheet2 = `${XMLDECL}<worksheet xmlns="${NS.x}" xmlns:r="${NS.r}"><sheetData><row${refs ? ' r="1"' : ""}>${cellXml(lookup, 0, 1)}</row></sheetData></worksheet>`;

  const fontColor = (hex: string, themeIdx: number, indexed: number) =>
    ({
      rgb: `<color rgb="FF${hex}"/>`,
      theme: `<color theme="${themeIdx}"/>`,
      indexed: `<color indexed="${indexed}"/>`,
    })[o.colors ?? "rgb"];
  const boldOn = { bare: "<b/>", "1": '<b val="1"/>', true: '<b val="true"/>' }[o.boldOn ?? "bare"];
  const boldOff = { absent: "", "0": '<b val="0"/>', false: '<b val="false"/>' }[
    o.boldOff ?? "absent"
  ];
  // Theme indices 4, 5, 6 are accent1–3 (Excel's order puts the light/dark
  // pairs first); indexed 40–42 are overridden in the workbook's palette.
  const fonts = [
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
    `<font><sz val="11"/>${fontColor(HEX.passes, 4, 40)}<name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="11"/>${fontColor(HEX.fails, 5, 41)}<name val="Calibri"/><family val="2"/></font>`,
    `<font>${boldOn}<sz val="14"/>${fontColor(HEX.band, 6, 42)}<name val="Calibri"/><family val="2"/></font>`,
    `<font>${boldOff}<sz val="14"/>${fontColor(HEX.band, 6, 42)}<name val="Calibri"/><family val="2"/></font>`,
  ];
  // The default legacy palette with three slots overridden — how a workbook
  // carries custom indexed colours.
  const DEFAULT_PALETTE = [
    "000000",
    "FFFFFF",
    "FF0000",
    "00FF00",
    "0000FF",
    "FFFF00",
    "FF00FF",
    "00FFFF",
  ];
  const palette = Array.from({ length: 56 }, (_, i) => DEFAULT_PALETTE[i % 8]!);
  palette[40] = HEX.passes;
  palette[41] = HEX.fails;
  palette[42] = HEX.band;
  const colorsEl =
    (o.colors ?? "rgb") === "indexed"
      ? `<colors><indexedColors>${palette.map((h) => `<rgbColor rgb="FF${h}"/>`).join("")}</indexedColors></colors>`
      : "";
  const styles = `${XMLDECL}<styleSheet xmlns="${NS.x}"><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${fonts.length}">${fonts.map((_, i) => `<xf numFmtId="0" fontId="${i}" fillId="0" borderId="0" xfId="0"${i ? ' applyFont="1"' : ""}/>`).join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${colorsEl}</styleSheet>`;
  const sstXml = `${XMLDECL}<sst xmlns="${NS.x}" count="${sst.length}" uniqueCount="${sst.length}">${sst
    .map((t) => {
      if (strings === "richShared") {
        // Rich-text form: the same string split into unformatted runs.
        const cut = Math.ceil(t.length / 2);
        return `<si><r><t xml:space="preserve">${t.slice(0, cut)}</t></r><r><t xml:space="preserve">${t.slice(cut)}</t></r></si>`;
      }
      return `<si><t>${t}</t></si>`;
    })
    .join("")}</sst>`;
  const table = `${XMLDECL}<table xmlns="${NS.x}" id="1" name="Awards" displayName="Awards" ref="A1:C3"${(o.headerRowCount ?? "absent") === "explicit" ? ' headerRowCount="1"' : ""} totalsRowShown="0"><autoFilter ref="A1:C3"/><tableColumns count="3"><tableColumn id="1" name="Program"/><tableColumn id="2" name="Award"/><tableColumn id="3" name="Sites"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
  const drawing = `${XMLDECL}<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Picture 1" descr="${TEXT.alt}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="1905000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="3" name="Picture 2">${decorativeExt(o.decorative ?? "1")}</xdr:cNvPr><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="95250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  const shared = strings !== "inline";
  return {
    "[Content_Types].xml": contentTypes([
      ["/xl/workbook.xml", CT.xlMain],
      ["/xl/worksheets/sheet1.xml", CT.xlSheet],
      ["/xl/worksheets/sheet2.xml", CT.xlSheet],
      ["/xl/styles.xml", CT.xlStyles],
      ...(shared ? [["/xl/sharedStrings.xml", CT.xlStrings] as [string, string]] : []),
      ["/xl/theme/theme1.xml", CT.theme],
      ["/xl/tables/table1.xml", CT.xlTable],
      ["/xl/drawings/drawing1.xml", CT.xlDrawing],
      ["/docProps/core.xml", CT.core],
    ]),
    "_rels/.rels": relsXml([
      { id: "rId1", type: "officeDocument", target: "xl/workbook.xml" },
      {
        id: "rId2",
        type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
        target: "docProps/core.xml",
      },
    ]),
    "docProps/core.xml": coreXml(TEXT.title),
    "xl/workbook.xml": `${XMLDECL}<workbook xmlns="${NS.x}" xmlns:r="${NS.r}"><bookViews><workbookView/></bookViews><sheets><sheet name="Awards" sheetId="1" r:id="rId1"/><sheet name="Lookup" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": relsXml([
      { id: "rId1", type: "worksheet", target: "worksheets/sheet1.xml" },
      { id: "rId2", type: "worksheet", target: "worksheets/sheet2.xml" },
      { id: "rId3", type: "theme", target: "theme/theme1.xml" },
      { id: "rId4", type: "styles", target: "styles.xml" },
      ...(shared ? [{ id: "rId5", type: "sharedStrings", target: "sharedStrings.xml" }] : []),
    ]),
    "xl/worksheets/sheet1.xml": sheet1,
    "xl/worksheets/_rels/sheet1.xml.rels": relsXml([
      { id: "rIdTable", type: "table", target: "../tables/table1.xml" },
      { id: "rIdLink", type: "hyperlink", target: TEXT.url, external: true },
      { id: "rIdDrawing", type: "drawing", target: "../drawings/drawing1.xml" },
    ]),
    "xl/worksheets/sheet2.xml": sheet2,
    "xl/styles.xml": styles,
    ...(shared ? { "xl/sharedStrings.xml": sstXml } : {}),
    "xl/theme/theme1.xml": THEME_XML,
    "xl/tables/table1.xml": table,
    "xl/drawings/drawing1.xml": drawing,
    "xl/drawings/_rels/drawing1.xml.rels": relsXml([
      { id: "rIdImg", type: "image", target: "../media/image1.png" },
    ]),
    "xl/media/image1.png": PNG_1X1,
  };
}

// ---------------------------------------------------------------------------
// The families.
// ---------------------------------------------------------------------------
interface Family {
  name: string;
  ext: "docx" | "pptx" | "xlsx";
  encodings: Encoding[];
  fingerprint: (buf: Buffer) => Promise<Record<string, unknown>>;
}

const contrastPrint = (c: {
  checkedRuns: number;
  failing: Array<{ text: string; ratio: number; large: boolean }>;
}) => ({
  checked: c.checkedRuns,
  failing: c.failing.map((f) => `${f.text} @ ${f.ratio}${f.large ? " (large)" : ""}`).sort(),
});
/** Images as a set. No finding reports an image's position (the alt-text
 *  categories count), and Word collects VML pictures after DrawingML ones,
 *  so the list's order is the parser's, not the document's. */
const imagesPrint = (
  imgs: Array<{ altText: string | null; decorative: boolean; titleOnly: boolean }>,
) =>
  imgs
    .map(
      (i) =>
        `${JSON.stringify(i.altText)}${i.decorative ? " decorative" : ""}${i.titleOnly ? " title-only" : ""}`,
    )
    .sort();

const WORD: Family = {
  name: "Word",
  ext: "docx",
  fingerprint: async (buf) => {
    const a = await analyzeDocx(buf);
    return {
      title: a.metadata.title,
      language: a.metadata.language,
      headings: a.headings.map((h) => `H${h.level} ${h.text}`),
      fakeHeadings: a.fakeHeadings.map((f) => f.text),
      emptyHeadings: a.emptyHeadingCount,
      images: imagesPrint(a.images),
      tables: a.tables.map(
        (t) => `${t.rowCount}x${t.colCount} header=${t.hasHeaderRow} layout=${t.looksLikeLayout}`,
      ),
      links: a.links.map((l) => `${JSON.stringify(l.text)} -> ${l.url}`),
      lists: `${a.lists.realListItems} real, ${a.lists.manualBulletParagraphs} typed`,
      contrast: contrastPrint(a.contrast),
    };
  },
  encodings: [
    { name: "baseline", why: "Word's own defaults", build: () => wordParts() },
    {
      name: "language-on-normal-style",
      why: "the document language on the Normal style instead of the document defaults",
      build: () => wordParts({ language: "normalStyle" }),
    },
    {
      name: "language-on-every-run",
      why: "no document default; every run marked English — Set Proofing Language on a selection",
      build: () => wordParts({ language: "runs" }),
    },
    {
      name: "headings-localized-style-ids",
      why: 'German Word: style ids berschrift1/2, built-in names still "heading 1/2", no outline level of their own',
      build: () => wordParts({ headings: "localizedIds" }),
    },
    {
      name: "headings-template-styles-based-on-built-ins",
      why: "an agency template's Report Heading 1/2, based on Heading 1/2",
      build: () => wordParts({ headings: "basedOnHeading" }),
    },
    {
      name: "headings-by-outline-level-style",
      why: "custom styles that are headings only by their outline level",
      build: () => wordParts({ headings: "outlineLevelStyle" }),
    },
    {
      name: "headings-by-direct-outline-level",
      why: "no heading style at all; the outline level set on each paragraph",
      build: () => wordParts({ headings: "directOutlineLevel" }),
    },
    {
      name: "list-numbering-on-the-style",
      why: "the built-in List Number style carries the numbering, not each paragraph",
      build: () => wordParts({ list: "style" }),
    },
    {
      name: "header-row-repeat-as-val-true",
      why: '<w:tblHeader w:val="true"/> rather than the bare element',
      build: () => wordParts({ headerRow: "repeatHeaderTrue" }),
    },
    {
      name: "decorative-as-val-true",
      why: 'the decorative mark as val="true" (xsd:boolean) rather than "1"',
      build: () => wordParts({ decorative: "true" }),
    },
    {
      name: "header-row-by-table-design-box",
      why: "Table Design → Header Row (w:tblLook firstRow) instead of Repeat Header Rows",
      build: () => wordParts({ headerRow: "lookAttribute" }),
    },
    {
      name: "header-row-by-legacy-hex-look",
      why: "the same box as Word 2007 stored it: bit 0x0020 of w:tblLook's hex value, no attributes",
      build: () => wordParts({ headerRow: "lookHex" }),
    },
    {
      name: "borders-from-table-style",
      why: "the borders come from the Table Grid style, not the table's own properties",
      build: () => wordParts({ borders: "style" }),
    },
    {
      name: "borders-on-every-cell",
      why: "the borders set on each cell rather than on the table",
      build: () => wordParts({ borders: "cells" }),
    },
    {
      name: "image-as-legacy-vml",
      why: "the picture as VML (w:pict / v:shape alt) — documents converted from .doc keep this form",
      build: () => wordParts({ image: "vml" }),
    },
    {
      name: "image-in-alternate-content",
      why: "the picture inside mc:AlternateContent, a DrawingML choice with a VML fallback",
      build: () => wordParts({ image: "alternateContent" }),
    },
    {
      name: "link-as-simple-field",
      why: "the hyperlink as a HYPERLINK field in w:fldSimple",
      build: () => wordParts({ link: "simpleField" }),
    },
    {
      name: "link-as-complex-field",
      why: "the hyperlink as a HYPERLINK field between w:fldChar begin/separate/end — mail merge and older documents",
      build: () => wordParts({ link: "complexField" }),
    },
    {
      name: "colors-by-theme-slot-with-cached-value",
      why: "each colour as a theme slot plus its cached value, as Word writes theme colours",
      build: () => wordParts({ color: "themeWithValue" }),
    },
    {
      name: "colors-by-theme-slot-with-auto-value",
      why: 'each colour as a theme slot with w:val="auto" — the theme colour applies',
      build: () => wordParts({ color: "themeWithAuto" }),
    },
    { name: "bold-as-val-1", why: '<w:b w:val="1"/>', build: () => wordParts({ boldOn: "1" }) },
    {
      name: "bold-as-val-true",
      why: '<w:b w:val="true"/>',
      build: () => wordParts({ boldOn: "true" }),
    },
    {
      name: "bold-as-val-on",
      why: '<w:b w:val="on"/> (transitional ST_OnOff)',
      build: () => wordParts({ boldOn: "on" }),
    },
    {
      name: "not-bold-as-val-0",
      why: '<w:b w:val="0"/> — bold explicitly off, as python-docx writes run.bold = False (verified, python-docx 1.2.0)',
      build: () => wordParts({ boldOff: "0" }),
    },
    {
      name: "not-bold-as-val-false",
      why: '<w:b w:val="false"/>',
      build: () => wordParts({ boldOff: "false" }),
    },
    {
      name: "not-bold-from-a-style-as-val-0",
      why: 'the line\'s paragraph style is based on a bold style and switches bold off with w:val="0"',
      build: () => wordParts({ boldOffViaStyle: "0" }),
    },
    {
      name: "not-bold-from-a-style-as-val-off",
      why: 'the same, switched off with w:val="off" (transitional ST_OnOff)',
      build: () => wordParts({ boldOffViaStyle: "off" }),
    },
    {
      name: "not-bold-as-val-off",
      why: '<w:b w:val="off"/> (transitional ST_OnOff)',
      build: () => wordParts({ boldOff: "off" }),
    },
    ...packageEncodings(() => wordParts()),
  ],
};

const POWERPOINT: Family = {
  name: "PowerPoint",
  ext: "pptx",
  fingerprint: async (buf) => {
    const a = await analyzePptx(buf);
    return {
      title: a.metadata.title,
      language: a.metadata.language,
      slides: a.slides.map(
        (s) =>
          `${s.index}: ${JSON.stringify(s.title)}${s.hidden ? " hidden" : ""}${s.titleIsFirstShape ? " title-first" : ""}`,
      ),
      fakeHeadings: a.fakeHeadings.map((f) => `${f.slide}: ${f.text}`),
      images: imagesPrint(a.images),
      tables: a.tables.map(
        (t) => `${t.rowCount}x${t.colCount} header=${t.hasHeaderRow} layout=${!!t.looksLikeLayout}`,
      ),
      links: a.links.map((l) => `${JSON.stringify(l.text)} -> ${l.url}`),
      lists: `${a.lists.realListItems} real, ${a.lists.manualBulletParagraphs} typed`,
      contrast: contrastPrint(a.contrast),
    };
  },
  encodings: [
    { name: "baseline", why: "PowerPoint's own defaults", build: () => pptParts() },
    {
      name: "title-slide-centered-title",
      why: "the first slide's title in a ctrTitle placeholder, as the Title Slide layout writes it",
      build: () => pptParts({ titleType: "ctrTitle" }),
    },
    {
      name: "language-on-level-1-defaults",
      why: "the deck language on defaultTextStyle's lvl1pPr rather than defPPr",
      build: () => pptParts({ language: "presentationLevel1" }),
    },
    {
      name: "language-on-the-master-only",
      why: "no presentation default; the slide master's text styles carry the language",
      build: () => pptParts({ language: "masterOnly" }),
    },
    {
      name: "language-on-every-run",
      why: "no default anywhere; every run marked English — Google Slides exports",
      build: () => pptParts({ language: "runs" }),
    },
    {
      name: "colors-by-scheme-slot",
      why: "text colours and the slide background as theme scheme slots instead of RGB values",
      build: () => pptParts({ colors: "scheme" }),
    },
    {
      name: "picture-inside-a-group",
      why: "the described picture inside a group that has no alt text of its own",
      build: () => pptParts({ picture: "group" }),
    },
    {
      name: "picture-in-alternate-content",
      why: "the picture inside mc:AlternateContent, a p14 choice with a plain fallback",
      build: () => pptParts({ picture: "alternateContent" }),
    },
    {
      name: "header-row-as-true",
      why: 'the table\'s header row as firstRow="true" (xsd:boolean) rather than "1"',
      build: () => pptParts({ firstRow: "true" }),
    },
    {
      name: "bold-as-true",
      why: 'bold as b="true" (xsd:boolean) rather than "1" — on 14-pt grey text and on a 16-pt typed heading',
      build: () => pptParts({ bold: "true" }),
    },
    {
      name: "hidden-slide-as-false",
      why: 'the hidden slide as show="false" (xsd:boolean) rather than "0"',
      build: () => pptParts({ hidden: "false" }),
    },
    {
      name: "decorative-as-val-true",
      why: 'the decorative mark as val="true" (xsd:boolean) rather than "1"',
      build: () => pptParts({ decorative: "true" }),
    },
    {
      name: "slide-id-attribute-order",
      why: "<p:sldId r:id=… id=…/> — attribute order carries no meaning in XML",
      build: () => pptParts({ slideIdAttributeOrder: "relationshipFirst" }),
    },
    ...packageEncodings(() => pptParts()),
  ],
};

const EXCEL: Family = {
  name: "Excel",
  ext: "xlsx",
  fingerprint: async (buf) => {
    const a = await analyzeXlsx(buf);
    return {
      title: a.metadata.title,
      sheets: a.sheets.map(
        (s) =>
          `${s.name}${s.hidden ? " hidden" : ""} table=${s.hasDefinedTable} first=${s.firstDataRow},${s.firstDataCol}`,
      ),
      tables: a.tables.map(
        (t) =>
          `${t.name} header=${t.hasHeaderRow} cols=${t.columnCount} defaults=${(t.defaultHeaderNames ?? []).join("|")}`,
      ),
      images: imagesPrint(a.images),
      links: a.links.map(
        (l) => `${JSON.stringify(l.text)} -> ${l.url}${l.resolved ? "" : " unresolved"}`,
      ),
      cellsWithValue: a.totalCellsWithValue,
      contrast: contrastPrint(a.contrast),
    };
  },
  encodings: [
    {
      name: "baseline",
      why: "Excel's own defaults (shared strings, headerRowCount omitted)",
      build: () => xlsxParts(),
    },
    {
      name: "inline-strings",
      why: "every string inline in its cell, with no shared-strings part — openpyxl's default (verified, openpyxl 3.1.5)",
      build: () => xlsxParts({ strings: "inline" }),
    },
    {
      name: "rich-text-shared-strings",
      why: "shared strings stored as rich-text runs",
      build: () => xlsxParts({ strings: "richShared" }),
    },
    {
      name: "header-row-count-explicit",
      why: 'the table\'s header row stated as headerRowCount="1" rather than left to the default',
      build: () => xlsxParts({ headerRowCount: "explicit" }),
    },
    {
      name: "colors-by-theme-index",
      why: "font colours as theme indices instead of ARGB values",
      build: () => xlsxParts({ colors: "theme" }),
    },
    {
      name: "colors-by-indexed-palette",
      why: "font colours as legacy palette indices, with the palette overridden in the workbook",
      build: () => xlsxParts({ colors: "indexed" }),
    },
    { name: "bold-as-val-1", why: '<b val="1"/>', build: () => xlsxParts({ boldOn: "1" }) },
    {
      name: "bold-as-val-true",
      why: '<b val="true"/>',
      build: () => xlsxParts({ boldOn: "true" }),
    },
    {
      name: "not-bold-as-val-0",
      why: '<b val="0"/> — bold explicitly switched off; CT_BooleanProperty allows it',
      build: () => xlsxParts({ boldOff: "0" }),
    },
    {
      name: "not-bold-as-val-false",
      why: '<b val="false"/>',
      build: () => xlsxParts({ boldOff: "false" }),
    },
    {
      name: "decorative-as-val-true",
      why: 'the decorative mark as val="true" (xsd:boolean) rather than "1"',
      build: () => xlsxParts({ decorative: "true" }),
    },
    {
      name: "cells-without-references",
      why: "rows and cells with no r attribute, positioned by order — the attribute is optional",
      build: () => xlsxParts({ cellReferences: "absent" }),
    },
    {
      name: "no-dimension-element",
      why: "no <dimension> — an optional cached hint that streaming writers omit",
      build: () => xlsxParts({ dimension: "absent" }),
    },
    ...packageEncodings(() => xlsxParts()),
  ],
};

// ---------------------------------------------------------------------------
function scores(r: AnalysisResult): string {
  const cats = [...r.categories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}=${c.score === null ? "null" : c.score}|${c.severity ?? "none"}`)
    .join(" ");
  return `${r.overallScore}/${r.grade} ${cats}`;
}

interface Outcome {
  name: string;
  why: string;
  scores: string;
  print: Record<string, unknown>;
}

async function runFamily(f: Family): Promise<number> {
  const results: Outcome[] = [];
  for (const e of f.encodings) {
    try {
      const buf = await pack(e.build(), e.pack);
      const r = await analyzeDocument(buf, `${e.name}.${f.ext}`);
      results.push({
        name: e.name,
        why: e.why,
        scores: scores(r),
        print: await f.fingerprint(buf),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: e.name, why: e.why, scores: `THREW ${msg}`, print: {} });
    }
  }
  const base = results[0]!;
  console.log(`\n${f.name} — ${f.encodings.length} encodings of one document`);
  console.log(`baseline:\n  ${base.scores}`);
  for (const [k, v] of Object.entries(base.print)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  let diverged = 0;
  for (const r of results.slice(1)) {
    const changed = Object.keys({ ...base.print, ...r.print }).filter(
      (k) => JSON.stringify(base.print[k]) !== JSON.stringify(r.print[k]),
    );
    const same = r.scores === base.scores && changed.length === 0;
    if (!same) diverged++;
    console.log(`${same ? "SAME     " : "DIVERGED "} ${r.name}`);
    if (same) continue;
    console.log(`          ${r.why}`);
    if (r.scores !== base.scores) console.log(`          scores: ${r.scores}`);
    for (const k of changed) console.log(`          ${k}: ${JSON.stringify(r.print[k])}`);
  }
  return diverged;
}

async function main() {
  let diverged = 0;
  for (const f of [WORD, POWERPOINT, EXCEL]) diverged += await runFamily(f);
  if (diverged > 0) {
    console.error(
      `\n${diverged} ENCODING(S) CHANGED THE VERDICT — the checker is reading the encoding, not the document.`,
    );
    process.exit(1);
  }
  console.log("\nEVERY LEGAL ENCODING PRODUCED THE IDENTICAL VERDICT");
}
main();

/**
 * scripts/synthetic-office-controls.ts — adversarial traps for the OTHER
 * three formats.
 *
 *   pnpm synthetic-office-controls
 *
 * WHY (2026-08-29): the 100-trap battery proved the PDF checker against
 * designed answers — but Word, PowerPoint, and Excel checking was guarded
 * only by four real controls and unit tests. Three of the four supported
 * formats had no adversarial coverage at all. These seventeen close that:
 * hand-built .docx/.pptx/.xlsx files, each around one designed truth,
 * modeled on the habits those programs actually produce (bold-instead-of-
 * Heading-1, alt panels never opened, header rows that are only styled,
 * "Sheet1"), plus the done-right twins that must pass clean.
 *
 * Same contract as scripts/synthetic-controls.ts: regenerated
 * deterministically into controls/ (synthetic-101… onward, beside the PDF
 * traps), pushed through the production analyzer, designed truths asserted,
 * twin orderings enforced (the flawed twin must never outscore the correct
 * one), and a reader-facing manifest written for the trust page's modal —
 * scripts/trap-manifest-office.json, merged with the PDF manifest by
 * build-brief. Exit is non-zero if any truth is violated.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";
import { twinViolations } from "./gateLogic.mjs";

// jszip lives in the analyzer package's dependency tree, not the root's.
const requireAnalyzer = createRequire(
  new URL("../packages/analyzer/package.json", import.meta.url),
);
const JSZip = requireAnalyzer("jszip");

const OUT_DIR = path.resolve(import.meta.dirname, "..", "controls");

// ---------------------------------------------------------------------------
// Minimal OOXML assemblers — the smallest zips the real parsers accept.
// ---------------------------------------------------------------------------
const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

async function zip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const z = new JSZip();
  for (const [name, content] of Object.entries(files)) z.file(name, content);
  return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function corePropsXml(title: string | null, language: string | null = "en-US"): string {
  // `language: null` omits <dc:language> entirely — a READABLE core.xml that
  // simply declares no language, which is the case WCAG 3.1.1 is about. It
  // must not be confused with an unparseable part: conformance.ts suppresses
  // the 3.1.1 claim when the part could not be read, precisely so "said
  // nothing" and "could not be read" never produce the same accusation.
  return `${XMLDECL}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${title === null ? "" : `<dc:title>${title}</dc:title>`}${language === null ? "" : `<dc:language>${language}</dc:language>`}</cp:coreProperties>`;
}

// Word resolves a heading's LEVEL from styles.xml, never from the styleId
// alone, so a document.xml full of `w:pStyle w:val="Heading1"` has no
// headings at all without this part. Opt-in (`styles: true`) so every
// sample written before it keeps producing the same bytes.
const HEADING_STYLES_XML = `${XMLDECL}
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${[
  1, 2, 3, 4, 5, 6,
]
  .map(
    (n) =>
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:pPr><w:outlineLvl w:val="${n - 1}"/></w:pPr></w:style>`,
  )
  .join("")}</w:styles>`;

function docx(
  bodyXml: string,
  opts: {
    title?: string | null;
    styles?: boolean;
    language?: string | null;
    /** Emits word/_rels/document.xml.rels so LINK()'s r:id values resolve to
     *  real destinations — docxService reads link TEXT either way, but these
     *  controls are also meant to open correctly in Word. */
    hyperlinks?: Array<{ id: string; target: string }>;
  } = {},
): Promise<Buffer> {
  return zip({
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${opts.styles ? '\n<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' : ""}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    // After [Content_Types].xml, never before it: OPC readers are forgiving,
    // but these controls are also meant to be opened by hand in Word, and
    // the content-types part conventionally leads the package.
    ...(opts.styles ? { "word/styles.xml": HEADING_STYLES_XML } : {}),
    "_rels/.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    "docProps/core.xml": corePropsXml(
      opts.title === undefined ? "Synthetic Office Control" : opts.title,
      opts.language === undefined ? "en-US" : opts.language,
    ),
    ...(opts.hyperlinks && opts.hyperlinks.length > 0
      ? {
          "word/_rels/document.xml.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${opts.hyperlinks.map((h) => `<Relationship Id="${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${h.target}" TargetMode="External"/>`).join("\n")}
</Relationships>`,
        }
      : {}),
    "word/document.xml": `${XMLDECL}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${bodyXml}</w:body>
</w:document>`,
  });
}

/** A run carrying an EXPLICIT color, which is what the contrast walk needs:
 *  style-inherited colors resolve to "unresolved" and are reported as
 *  un-evaluated rather than as failures. Background falls back to white. */
const COLORED_P = (text: string, hex: string) =>
  `<w:p><w:r><w:rPr><w:color w:val="${hex}"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
/** A paragraph that TYPES its bullet character instead of using Word's list
 *  formatting — no w:numPr, so nothing announces it as a list. */
const TYPED_BULLET_P = (text: string) => `<w:p><w:r><w:t>\u2022 ${text}</w:t></w:r></w:p>`;
/** A real list item: direct numbering properties, the form agency documents
 *  most often carry. */
const REAL_LIST_P = (text: string) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
/** A hyperlink run. `text: ""` produces a link with NO accessible name — the
 *  one link-text defect that is scored (WCAG 4.1.2); any other text is
 *  reported at most. */
const LINK = (id: string, text: string) =>
  `<w:p><w:r><w:t>See </w:t></w:r><w:hyperlink r:id="${id}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink><w:r><w:t> for details.</w:t></w:r></w:p>`;
const P = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const HEADING = (level: number, text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const FAKE_HEADING = (text: string) =>
  `<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const DRAWING = (id: number, descr?: string) =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="1905000"/><wp:docPr id="${id}" name="Picture ${id}"${descr === undefined ? "" : ` descr="${descr}"`}/></wp:inline></w:drawing></w:r></w:p>`;
const BODY_TEXT =
  "This paragraph carries enough ordinary running prose to count as real document body text for the analyzer, with plain words continuing along in an unremarkable way.";

const EMPTY_P = "<w:p/>";
/** A Heading style on a blank line — no run, so docxService's textOf() is
 *  empty and it lands in emptyHeadingCount rather than in `headings`. */
const EMPTY_HEADING = (level: number) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr></w:p>`;
/** A heading whose content is a described picture — the agency-letterhead
 *  pattern — and one whose content is a symbol glyph. Neither has a w:t, so
 *  both looked "blank" to the empty-heading count until it was guarded. */
const IMAGE_HEADING = (level: number, id: number, descr: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="381000"/><wp:docPr id="${id}" name="Picture ${id}" descr="${descr}"/></wp:inline></w:drawing></w:r></w:p>`;
const SYMBOL_HEADING = (level: number) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:sym w:font="Wingdings" w:char="F0E0"/></w:r></w:p>`;

/** A real data table (borders + a marked header row) whose top row is one
 *  cell spanning both columns — the merged-header habit Word encourages. */
function docxMergedHeaderTable(): string {
  const cell = (t: string, span?: number) =>
    `<w:tc>${span ? `<w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>` : ""}<w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const borders =
    '<w:tblPr><w:tblBorders><w:top w:val="single"/><w:bottom w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>';
  return (
    "<w:tbl>" +
    borders +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("Enrollment by county", 2)}</w:tr>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("County")}${cell("Enrolled")}</w:tr>` +
    `<w:tr>${cell("Adams")}${cell("412")}</w:tr>` +
    `<w:tr>${cell("Brown")}${cell("318")}</w:tr>` +
    "</w:tbl>"
  );
}

function docxTable(withHeader: boolean): string {
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const row = (cells: string[], header: boolean) =>
    `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map(cell).join("")}</w:tr>`;
  // tblBorders makes this a REAL data table to the analyzer: a bare grid
  // with no style/borders/shading is classified looksLikeLayout and is
  // (correctly) neither scored nor gated — which would defang trap 105.
  const borders =
    '<w:tblPr><w:tblBorders><w:top w:val="single"/><w:bottom w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>';
  return `<w:tbl>${borders}${row(["Category", "Amount"], withHeader)}${row(["Training", "12,400"], false)}${row(["Outreach", "9,100"], false)}</w:tbl>`;
}

function pptx(
  slides: string[],
  opts: { title?: string | null; slideBgHex?: string } = {},
): Promise<Buffer> {
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n")}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    "_rels/.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    "docProps/core.xml": corePropsXml(
      opts.title === undefined ? "Synthetic Office Control" : opts.title,
    ),
    "ppt/presentation.xml": `${XMLDECL}
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst>
<p:defaultTextStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:lvl1pPr><a:defRPr lang="en-US"/></a:lvl1pPr></p:defaultTextStyle>
</p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n")}
</Relationships>`,
  };
  slides.forEach((spTree, i) => {
    // An explicit slide background is what gives the contrast walk resolved
    // provenance — without it every run is unresolved and a contrast trap
    // proves nothing (traps 150/151 need the same white ground on both).
    const bg = opts.slideBgHex
      ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${opts.slideBgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
      : "";
    files[`ppt/slides/slide${i + 1}.xml`] = `${XMLDECL}
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld>${bg}<p:spTree>${spTree}</p:spTree></p:cSld>
</p:sld>`;
  });
  return zip(files);
}

const SLIDE_TITLE = (text: string) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const SLIDE_BODY = (text: string) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** A heading TYPED into a floating text box: no <p:ph>, so it carries no
 *  placeholder role at all, with the size set explicitly on the run (an
 *  inherited size proves nothing and the detector ignores it). */
const SLIDE_FAKE_HEADING = (text: string, sz = 3200) =>
  `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:rPr sz="${sz}" b="1"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** A BODY placeholder carrying explicitly large text — the commonest real
 *  pattern on an untitled slide: a statistic or pull-quote set big for
 *  emphasis. It is content, already marked up as content, and must never be
 *  mistaken for a typed heading. Fifteen slides of one real agency deck look
 *  exactly like this. */
const SLIDE_BIG_BODY = (text: string, sz = 3600) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:rPr sz="${sz}" b="1"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const SLIDE_PIC = (id: number, descr?: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${descr === undefined ? "" : ` descr="${descr}"`}/><p:nvPr/></p:nvPicPr></p:pic>`;
/** A text-free solid rectangle with explicit bounds — the banner/card real
 *  decks paint beneath a white title. Bounds in EMU. */
const SLIDE_BANNER = (fillHex: string, x: number, y: number, cx: number, cy: number) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="30" name="Banner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`;
/** A title placeholder at explicit bounds whose run carries an explicit
 *  color and size — everything the contrast walk needs resolved. */
const SLIDE_COLORED_TITLE = (
  text: string,
  colorHex: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  sz = 3200,
) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="31" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="${sz}" b="1"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** A body placeholder whose run carries an explicit color and size. */
/** A body placeholder whose paragraphs are REAL list items (explicit
 *  buChar), and one whose "bullets" are typed characters. */
const SLIDE_REAL_LIST = (items: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="33" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${items
    .map((t) => `<a:p><a:pPr><a:buChar char="\u2022"/></a:pPr><a:r><a:t>${t}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
const SLIDE_TYPED_LIST = (items: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="34" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${items
    .map((t) => `<a:p><a:r><a:t>- ${t}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
const SLIDE_COLORED_BODY = (text: string, colorHex: string, sz = 1800) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="32" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="4000000"/><a:ext cx="10000000" cy="2000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="${sz}"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

/** A defined Table (Insert -> Table in Excel), the thing xlsxService counts.
 *  `headerRowCount: 0` is Excel's "my table has no headers": the range is a
 *  table, but no row is marked as its header, so nothing tells assistive
 *  technology which cells label the columns. */
interface XlsxTable {
  name: string;
  ref: string;
  headerRowCount: 0 | 1;
}

function xlsx(
  sheets: { name: string; rows: string[][]; table?: XlsxTable }[],
  opts: { title?: string | null } = {},
): Promise<Buffer> {
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
${sheets
  .map((sh, i) =>
    sh.table
      ? `<Override PartName="/xl/tables/table${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
      : "",
  )
  .filter(Boolean)
  .join("\n")}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    "_rels/.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    "docProps/core.xml": corePropsXml(
      opts.title === undefined ? "Synthetic Office Control" : opts.title,
    ),
    "xl/workbook.xml": `${XMLDECL}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
</Relationships>`,
  };
  sheets.forEach((s, i) => {
    const rows = s.rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${String.fromCharCode(65 + ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
      )
      .join("");
    // xlsxService finds tables by walking the SHEET's rels for a /table
    // relationship, so the rels part is what makes the table real; <tableParts>
    // is emitted too because that is what Excel writes.
    files[`xl/worksheets/sheet${i + 1}.xml`] = `${XMLDECL}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${s.table ? `<tableParts count="1"><tablePart r:id="rIdT1"/></tableParts>` : ""}</worksheet>`;
    if (s.table) {
      files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdT1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${i + 1}.xml"/>
</Relationships>`;
      files[`xl/tables/table${i + 1}.xml`] = `${XMLDECL}
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${i + 1}" name="${s.table.name}" displayName="${s.table.name}" ref="${s.table.ref}" headerRowCount="${s.table.headerRowCount}"/>`;
    }
  });
  return zip(files);
}

// ---------------------------------------------------------------------------
interface Sample {
  file: string;
  truth: string;
  build: () => Promise<Buffer>;
  check: (r: AnalysisResult) => string | null;
}

const cat = (id: string) => (r: AnalysisResult) => r.categories.find((c) => c.id === id);
const allFindings = (r: AnalysisResult) => r.categories.flatMap((c) => c.findings).join("\n");
const noAccusation = (r: AnalysisResult): string | null => {
  const bad = r.categories.filter((c) => c.severity === "Critical" || c.severity === "Moderate");
  return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
};

/** The Best Practices claim, asserted the same way in both batteries: a
 *  document can satisfy WCAG 2.1 completely and still have work worth doing.
 *  Nothing Critical or Moderate, an A-band score, no conformance failure —
 *  and at least three findings that carry a not-scored prefix. The floor is
 *  safe only because EVERY designed defect is also named in `needles` —
 *  without that, an unrelated future advisory could hold the count at three
 *  while one of the designed ones quietly stopped firing. Any defect added
 *  to one of these samples must get a needle of its own too. */
const bestPracticeDebtCheck = (r: AnalysisResult, needles: string[]): string | null => {
  const bad = r.categories.filter((c) => c.severity === "Critical" || c.severity === "Moderate");
  if (bad.length)
    return `WCAG-clean document accused of ${bad.map((c) => `${c.id}(${c.severity})`).join(", ")}`;
  if (r.overallScore < 90)
    return `score ${r.overallScore} is below the A band (90) — best-practice debt must not move the grade`;
  // The /trust chip for these traps reads "HELD · SCORED 100" — a literal
  // the gate must back, or the trust page states a number nothing checks.
  if (r.overallScore !== 100)
    return `scored ${r.overallScore}, but the trust-page chip claims SCORED 100`;
  const failures = r.conformance?.failures ?? [];
  if (failures.length)
    return `conformance failures present: ${failures.map((f) => f.sc).join(", ")}`;
  const notScored = r.categories
    .flatMap((c) => c.findings)
    .filter((f) => /^(pdf\/ua only|advisory|note) — not scored/i.test(f.trim()));
  if (notScored.length < 3)
    return `expected at least 3 not-scored items, found ${notScored.length}`;
  const all = notScored.join("\n").toLowerCase();
  for (const needle of needles) {
    if (!all.includes(needle)) return `missing the designed advisory: ${needle}`;
  }
  return null;
};

const SAMPLES: Sample[] = [
  {
    file: "synthetic-101-docx-bold-fake-headings.docx",
    truth:
      "The Word classic: section titles that are just bold 16-point text, never a Heading style. Invisible to a screen reader's outline — must be named as fake headings.",
    build: () =>
      docx(
        [
          FAKE_HEADING("Introduction"),
          P(BODY_TEXT),
          FAKE_HEADING("Findings"),
          P(BODY_TEXT),
          FAKE_HEADING("Recommendations"),
          P(BODY_TEXT),
        ].join(""),
      ),
    check: (r) =>
      /formatted to look like headings/i.test(allFindings(r))
        ? null
        : "bold fake headings not named",
  },
  {
    file: "synthetic-102-docx-styles-good-twin.docx",
    truth:
      "The same document using real Heading styles. Word used the way the training says must earn a clean report.",
    build: () =>
      docx(
        [
          HEADING(1, "Introduction"),
          P(BODY_TEXT),
          HEADING(2, "Findings"),
          P(BODY_TEXT),
          HEADING(2, "Recommendations"),
          P(BODY_TEXT),
        ].join(""),
      ),
    check: (r) => {
      if (!/Heading/i.test(allFindings(r)) && cat("heading_structure")(r)?.score !== 100)
        return `heading category ${cat("heading_structure")(r)?.score}`;
      return noAccusation(r);
    },
  },
  {
    file: "synthetic-103-docx-images-no-alt.docx",
    truth: "Two pictures whose alt-text panel was never opened. The census must read 0 of 2.",
    build: () => docx([P(BODY_TEXT), DRAWING(1), DRAWING(2)].join("")),
    check: (r) =>
      /0 of 2 meaningful image\(s\) have alt text/i.test(allFindings(r))
        ? null
        : "census did not read 0 of 2",
  },
  {
    file: "synthetic-104-docx-images-alt-twin.docx",
    truth:
      "The same two pictures, both described. The census must read 2 of 2, with no accusation.",
    build: () =>
      docx(
        [
          P(BODY_TEXT),
          DRAWING(1, "A bar chart of program enrollment by county."),
          DRAWING(2, "Staff photo from the annual training day."),
        ].join(""),
      ),
    check: (r) => {
      if (!/2 of 2 meaningful image\(s\) have alt text/i.test(allFindings(r)))
        return "census did not read 2 of 2";
      const alt = cat("alt_text")(r);
      if (alt && (alt.severity === "Critical" || alt.severity === "Moderate"))
        return `described images still accused: ${alt.severity}`;
      return null;
    },
  },
  {
    file: "synthetic-105-docx-table-headerless.docx",
    truth:
      "A data table whose header row is not marked as one — Word's repeat-header checkbox never ticked. The table must lose points.",
    build: () => docx([P(BODY_TEXT), docxTable(false)].join("")),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table category unscored";
      return c.score < 100 ? null : "unmarked header row scored 100";
    },
  },
  {
    file: "synthetic-106-docx-table-header-twin.docx",
    truth: "The same table with the header row properly marked. Must pass clean.",
    build: () => docx([P(BODY_TEXT), docxTable(true)].join("")),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (c && c.score !== null && c.score < 100) return `marked header still docked (${c.score})`;
      return null;
    },
  },
  {
    file: "synthetic-107-docx-untitled.docx",
    truth:
      "A document that was never given a title — screen readers announce the filename instead. The missing title must be named.",
    build: () => docx([HEADING(1, "Contents Inside"), P(BODY_TEXT)].join(""), { title: null }),
    check: (r) =>
      /No document title is set/i.test(allFindings(r)) ? null : "missing title not named",
  },
  {
    file: "synthetic-108-docx-titled-twin.docx",
    truth: "The same document with a proper title set. Must not be accused of missing one.",
    build: () =>
      docx([HEADING(1, "Contents Inside"), P(BODY_TEXT)].join(""), {
        title: "Program Guidance Memo",
      }),
    check: (r) =>
      /No document title is set/i.test(allFindings(r)) ? "a set title was reported missing" : null,
  },
  {
    file: "synthetic-109-pptx-untitled-slides.pptx",
    truth:
      "Slides with no title placeholder. NOT a confirmed WCAG 2.1 A/AA failure — no A/AA criterion requires a heading to EXIST (that is 2.4.10 Section Headings, Level AAA), and this battery's own conformance gate has always declined to assert 1.3.1 here — so since the legal-only sweep (2026-08-29) it must score 100 while the advisory still names every untitled slide.",
    build: () => pptx([SLIDE_BODY(BODY_TEXT), SLIDE_BODY(BODY_TEXT)]),
    check: (r) => {
      const t = allFindings(r);
      if (!/Advisory — not scored:.*no title\b/is.test(t))
        return "untitled slides not reported as advisory";
      const c = cat("slide_titles")(r);
      if (c && c.score !== null && c.score < 100)
        return `untitled slides docked (${c.score}) — not a confirmed WCAG failure`;
      return null;
    },
  },
  {
    file: "synthetic-110-pptx-titled-twin.pptx",
    truth: "The same two slides with real title placeholders. Slide titles must pass clean.",
    build: () =>
      pptx([
        SLIDE_TITLE("Program Overview") + SLIDE_BODY(BODY_TEXT),
        SLIDE_TITLE("Next Steps") + SLIDE_BODY(BODY_TEXT),
      ]),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (c && c.score !== null && c.score < 100) return `titled slides docked (${c.score})`;
      return null;
    },
  },
  {
    file: "synthetic-111-pptx-image-no-alt.pptx",
    truth: "A slide picture with no description. The presentation's alt-text check must ding it.",
    build: () => pptx([SLIDE_TITLE("Our Team") + SLIDE_BODY(BODY_TEXT) + SLIDE_PIC(7)]),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score === null) return "alt_text unscored despite an image";
      return c.score < 100 ? null : "undescribed slide picture scored 100";
    },
  },
  {
    file: "synthetic-112-pptx-image-alt-twin.pptx",
    truth: "The same picture, described. Must pass clean.",
    build: () =>
      pptx([
        SLIDE_TITLE("Our Team") +
          SLIDE_BODY(BODY_TEXT) +
          SLIDE_PIC(7, "The outreach team at the county fair booth."),
      ]),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (c && c.score !== null && c.score < 100) return `described picture docked (${c.score})`;
      return null;
    },
  },
  {
    file: "synthetic-113-xlsx-default-sheet-names.xlsx",
    truth:
      "Workbook keeping Excel's default sheet names. Whether 'Sheet1' fails 2.4.6 is a judgment about label quality, not a mechanical WCAG 2.1 failure — so since the legal-only sweep (2026-08-29) it must score 100 while the advisory still tells the author to rename every default-named sheet.",
    build: () =>
      xlsx([
        {
          name: "Sheet1",
          rows: [
            ["Category", "Amount"],
            ["Training", "12400"],
          ],
        },
        { name: "Sheet2", rows: [["Notes"], ["See sheet one"]] },
      ]),
    check: (r) => {
      const t = allFindings(r);
      if (!/Advisory — not scored:.*rename "Sheet1"/is.test(t))
        return "default sheet names not reported as advisory";
      const c = cat("sheet_names")(r);
      if (c && c.score !== null && c.score < 100)
        return `default names docked (${c.score}) — label quality is not a WCAG 2.1 failure`;
      return null;
    },
  },
  {
    file: "synthetic-114-xlsx-named-sheets-twin.xlsx",
    truth: "The same workbook with descriptive sheet names. Must pass clean.",
    build: () =>
      xlsx([
        {
          name: "Budget 2026",
          rows: [
            ["Category", "Amount"],
            ["Training", "12400"],
          ],
        },
        { name: "Reading Notes", rows: [["Notes"], ["See the budget sheet"]] },
      ]),
    check: (r) => {
      const c = cat("sheet_names")(r);
      if (c && c.score !== null && c.score < 100) return `descriptive names docked (${c.score})`;
      return null;
    },
  },
  {
    file: "synthetic-115-xlsx-untitled.xlsx",
    truth:
      "A workbook with no document title set. The title check must notice, exactly as it does for Word and PDF.",
    build: () =>
      xlsx(
        [
          {
            name: "Budget 2026",
            rows: [
              ["Category", "Amount"],
              ["Training", "12400"],
            ],
          },
        ],
        {
          title: null,
        },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      return c.score < 100 ? null : "missing workbook title scored 100";
    },
  },
  {
    file: "synthetic-126-docx-wcag-clean-bp-debt.docx",
    truth:
      "A Word document that satisfies WCAG 2.1 outright — titled, language-declared, real Heading styles, a bordered data table with its header row marked, no images to describe — and still carries best-practice work: the outline skips a level (Heading 1 -> Heading 3), the header row is one merged cell spanning both columns, and three blank paragraphs stand in for spacing. None of the three is a WCAG 2.1 failure, so none may move the score; each must still be reported with a not-scored prefix.",
    build: () =>
      docx(
        [
          HEADING(1, "Annual Program Report"),
          P(BODY_TEXT),
          HEADING(3, "Program Enrollment"),
          P(BODY_TEXT),
          docxMergedHeaderTable(),
          EMPTY_P,
          EMPTY_P,
          EMPTY_P,
          HEADING(3, "Next Steps"),
          P(BODY_TEXT),
        ].join(""),
        { title: "Annual Program Report 2026", styles: true },
      ),
    check: (r) =>
      bestPracticeDebtCheck(r, [
        "skip a heading level",
        "merged cell(s)",
        "consecutive empty paragraphs",
      ]),
  },
  {
    file: "synthetic-128-docx-empty-headings.docx",
    truth:
      "Three Heading-styled blank lines used as spacing, among real headings. SCORED since 2026-08-31: a heading style applied to a blank line announces a section that does not exist — structure conveyed by presentation that represents no real relationship, which is WCAG 1.3.1 (Level A) itself. heading_structure must lose points AND the conformance verdict must name 1.3.1. Reporting it without scoring it, or scoring it without naming the criterion, both fail this trap. (Deliberately NOT cited as W3C failure F43: every F43 example is heading markup on VISIBLE text, and W3C publishes no failure technique for an empty heading — the scorer says so in its own comment, and this truth must not contradict it.)",
    build: () =>
      docx(
        [
          HEADING(1, "Annual Program Report"),
          P(BODY_TEXT),
          EMPTY_HEADING(2),
          HEADING(2, "Program Enrollment"),
          P(BODY_TEXT),
          EMPTY_HEADING(2),
          EMPTY_HEADING(3),
          HEADING(2, "Next Steps"),
          P(BODY_TEXT),
        ].join(""),
        { title: "Annual Program Report 2026", styles: true },
      ),
    check: (r) => {
      const c = cat("heading_structure")(r);
      if (!c || c.score === null) return "heading_structure unscored";
      if (c.score >= 100) return `empty headings did not move the score (got ${c.score})`;
      // Not a proof of the 30-point cap: three empty headings cost exactly 30
      // with or without it. The cap is covered at n=3/8/40 in docxScorer.test.
      if (c.score < 70) return `three empty headings cost more than 30 points (got ${c.score})`;
      if (!/contain no text/i.test(allFindings(r))) return "the empty headings are not named";
      // Only a named criterion may move a score (the legal-basis rule).
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "heading_structure",
      );
      return failing ? null : "score moved with no 1.3.1 failure attributed to heading_structure";
    },
  },
  {
    file: "synthetic-130-docx-picture-headings-not-blank.docx",
    truth:
      "Headings whose content is a described picture (an agency letterhead) or a symbol glyph. Neither carries a w:t element, so both LOOK empty to a naive text check — and on 2026-08-31 the newly scored empty-heading rule accused exactly this document of a WCAG 1.3.1 failure while grading it A and reporting no headings at all. A heading holding real content must never be called a blank line: no accusation, and no points lost.",
    build: () =>
      docx(
        [
          IMAGE_HEADING(1, 1, "County Health Department bulletin masthead"),
          P(BODY_TEXT),
          HEADING(2, "Enrollment"),
          P(BODY_TEXT),
          SYMBOL_HEADING(2),
          P(BODY_TEXT),
        ].join(""),
        { title: "Agency Bulletin", styles: true },
      ),
    check: (r) => {
      if (/contain no text/i.test(allFindings(r)))
        return "a heading holding a picture or a symbol was called a blank line";
      const fails =
        (
          r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
        ).conformance?.failures?.filter((f) => String(f.category ?? "") === "heading_structure") ??
        [];
      if (fails.length > 0)
        return `accused of ${fails.length} heading failure(s) it did not commit`;
      const c = cat("heading_structure")(r);
      // The scorer and the verdict must agree the category was assessed.
      if (c && c.score !== null && c.score < 100)
        return `lost points for headings that carry content (${c.score})`;
      // Not merely unaccused: the picture heading must be USED. Its alt text
      // becomes the heading's text, so the outline starts at level 1 with the
      // masthead's description — proving the heading was counted as a heading
      // rather than quietly dropped, which would make the outline read as
      // starting one level down.
      const f = allFindings(r);
      if (!/County Health Department bulletin masthead/.test(f))
        return "the described picture heading is missing from the outline — its alt text never became the heading's text";
      return null;
    },
  },
  {
    file: "synthetic-142-docx-vague-link-text.docx",
    truth:
      'Two links reading "click here" and "read more". THIS MUST NOT MOVE THE SCORE. WCAG 2.4.4 Link Purpose (Level A) is satisfied by the link text together with its programmatically determined context — the sentence around it — which no text-only check can weigh; judging the text alone is 2.4.9, Level AAA, outside the legal minimum. The PDF scorer adopted that rule in the 2026-08-29 legal-only sweep and the three Office scorers did not, so until 2026-08-31 this exact document scored link_quality 0, severity Critical, capping the whole file at D, with the verdict naming NO criterion at all — against the promise that every finding names the WCAG rule behind it. Neither corpus gate could see it: legal-basis needs a control document with weak link text (there was none, until this one) and best-practice-basis needs a failing criterion (there was none). link_quality must score 100, the advisory must still name the links, and no criterion may be asserted.',
    build: () =>
      docx(
        [HEADING(1, "How to Apply"), LINK("rH1", "click here"), LINK("rH2", "read more")].join(""),
        {
          title: "How to Apply",
          styles: true,
          hyperlinks: [
            { id: "rH1", target: "https://example.illinois.gov/apply" },
            { id: "rH2", target: "https://example.illinois.gov/eligibility" },
          ],
        },
      ),
    check: (r) => {
      const c = cat("link_quality")(r);
      if (!c || c.score === null) return "link_quality unscored";
      if (c.score !== 100)
        return `weak link TEXT took ${100 - c.score} points; 2.4.4 lets context supply a link's purpose, so it may only be reported`;
      const f = allFindings(r);
      if (!/Advisory — not scored against you: 2 link\(s\) use non-descriptive text/.test(f))
        return "the weak link text is not reported at all — unscored must never mean unmentioned";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.filter((x) => String(x.category ?? "") === "link_quality");
      return failing && failing.length > 0
        ? `asserted ${failing.map((x) => x.sc).join(", ")} against link text a machine cannot judge`
        : null;
    },
  },
  {
    file: "synthetic-143-docx-unnamed-link.docx",
    truth:
      "One link with NO link text at all beside one descriptive link. This IS scored: a link is a user interface component, and WCAG 4.1.2 Name, Role, Value (Level A) requires every one of them to carry a programmatically determinable name — with no text there is no name, and no surrounding sentence can supply one, which is what separates this from the vague-text case in trap 142. link_quality must lose points (one of two links, so 50) and the verdict must name 4.1.2.",
    build: () =>
      docx(
        [HEADING(1, "How to Apply"), LINK("rH1", ""), LINK("rH2", "the eligibility rules")].join(
          "",
        ),
        {
          title: "How to Apply",
          styles: true,
          hyperlinks: [
            { id: "rH1", target: "https://example.illinois.gov/apply" },
            { id: "rH2", target: "https://example.illinois.gov/eligibility" },
          ],
        },
      ),
    check: (r) => {
      const c = cat("link_quality")(r);
      if (!c || c.score === null) return "link_quality unscored";
      if (c.score !== 50)
        return `one unnamed link of two scored ${c.score}, not 50 — a link with no name is the one text defect that IS confirmable`;
      if (!/have no link text/i.test(allFindings(r))) return "the unnamed link is not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (x) => String(x.sc ?? "") === "4.1.2" && String(x.category ?? "") === "link_quality",
      );
      return failing ? null : "points lost with no 4.1.2 failure attributed to link_quality";
    },
  },
  {
    file: "synthetic-144-docx-descriptive-links-twin.docx",
    truth:
      "The same page with both links given descriptive text. link_quality must score a clean 100, no criterion may be asserted, and it must never score below either flawed twin.",
    build: () =>
      docx(
        [
          HEADING(1, "How to Apply"),
          LINK("rH1", "the application form"),
          LINK("rH2", "the eligibility rules"),
        ].join(""),
        {
          title: "How to Apply",
          styles: true,
          hyperlinks: [
            { id: "rH1", target: "https://example.illinois.gov/apply" },
            { id: "rH2", target: "https://example.illinois.gov/eligibility" },
          ],
        },
      ),
    check: (r) => {
      const c = cat("link_quality")(r);
      if (!c || c.score === null) return "link_quality unscored";
      if (c.score !== 100) return `two descriptive links scored ${c.score}, not 100`;
      const f = allFindings(r);
      // Match the PROBLEM lines, not the census line, which always reads
      // "N link(s) found; 0 with no link text at all".
      if (/link\(s\) have no link text/i.test(f))
        return "a described link was reported as having no link text";
      return /Advisory — not scored against you: \d+ link\(s\) use non-descriptive/.test(f)
        ? "descriptive links were reported as non-descriptive"
        : null;
    },
  },
  {
    file: "synthetic-138-docx-low-contrast.docx",
    truth:
      "Ten explicitly coloured runs, nine of them near-black and ONE in yellow (#FFFF00) on Word's default white page — about 1.07:1 against a WCAG minimum of 4.5:1. The proportional score would be 90, so the category's 85 cap is what decides the number: a single unreadable line may never leave the category in the A band. Both halves must hold — exactly 85, and WCAG 1.4.3 Contrast (Minimum), Level AA named in the verdict. Remove the cap and this trap fails, which is the whole point: a fixture that already scores below 85 proves nothing about it. The colours are EXPLICIT, so this is a resolved measurement, not the 'could not be evaluated' branch.",
    build: () =>
      docx(
        [
          HEADING(1, "Program Notice"),
          ...Array.from({ length: 9 }, (_, i) =>
            COLORED_P(`Readable paragraph number ${i + 1} of the notice.`, "1A1A1A"),
          ),
          COLORED_P("Applications are due by the fifteenth of March.", "FFFF00"),
        ].join(""),
        { title: "Program Notice", styles: true },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null)
        return "color_contrast was not assessed — the explicit run colors should have resolved";
      // EXACTLY 85: nine of ten runs pass, so the proportional score is 90 and
      // only the cap can bring it here. `<= 85` would pass with the cap gone.
      if (c.score !== 85)
        return `one unreadable run in ten scored ${c.score}; the proportional 90 must be capped to 85`;
      if (!/Lowest contrast/i.test(allFindings(r))) return "the measured ratio is not reported";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.4.3" && String(f.category ?? "") === "color_contrast",
      );
      return failing
        ? null
        : "contrast points lost with no 1.4.3 failure attributed to the category";
    },
  },
  {
    file: "synthetic-139-docx-contrast-good-twin.docx",
    truth:
      "The same notice in near-black (#1A1A1A) on white — about 16:1. color_contrast must score a clean 100, no 1.4.3 may be asserted, and it must never score below its flawed twin.",
    build: () =>
      docx(
        [
          HEADING(1, "Program Notice"),
          COLORED_P("Applications are due by the fifteenth of March.", "1A1A1A"),
          COLORED_P("Late applications cannot be accepted.", "1A1A1A"),
        ].join(""),
        { title: "Program Notice", styles: true },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null) return "color_contrast was not assessed";
      if (c.score !== 100) return `near-black on white scored ${c.score}, not 100`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.sc ?? "") === "1.4.3");
      return failing ? "1.4.3 asserted against 16:1 text" : null;
    },
  },
  {
    file: "synthetic-140-docx-typed-bullets.docx",
    truth:
      "A ten-item list, nine built with Word's numbering and ONE typed by hand as an ordinary paragraph beginning with a bullet character. The proportional score would be 90, so the category's 85 cap is what decides the number: even a single hand-typed item leaves the list boundaries and item count unannounced, and may not leave the category in the A band. Both halves must hold — exactly 85, and WCAG 1.3.1 (Level A) named in the verdict. Remove the cap and this trap fails, which is the point: a fixture that already scores below 85 proves nothing about it.",
    build: () =>
      docx(
        [
          HEADING(1, "Eligibility"),
          ...Array.from({ length: 9 }, (_, i) => REAL_LIST_P(`Requirement number ${i + 1}`)),
          TYPED_BULLET_P("A completed application form"),
        ].join(""),
        { title: "Eligibility", styles: true },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null) return "list_structure unscored";
      // EXACTLY 85: nine of ten items are real, so the proportional score is 90
      // and only the cap can bring it here.
      if (c.score !== 85)
        return `one typed bullet in ten scored ${c.score}; the proportional 90 must be capped to 85`;
      if (!/typed bullets or numbers/i.test(allFindings(r)))
        return "the typed bullets are not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "list_structure",
      );
      return failing ? null : "list points lost with no 1.3.1 failure attributed to list_structure";
    },
  },
  {
    file: "synthetic-141-docx-real-list-twin.docx",
    truth:
      "The same list built with Word's numbering properties on every item. list_structure must score a clean 100, no 1.3.1 may be asserted against it, and it must never score below its flawed twin.",
    build: () =>
      docx(
        [
          HEADING(1, "Eligibility"),
          REAL_LIST_P("Illinois residency"),
          REAL_LIST_P("Proof of income"),
          REAL_LIST_P("A current photo ID"),
          REAL_LIST_P("A completed application form"),
        ].join(""),
        { title: "Eligibility", styles: true },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null) return "list_structure unscored";
      if (c.score !== 100) return `a list built with real numbering scored ${c.score}, not 100`;
      return /typed bullets or numbers/i.test(allFindings(r))
        ? "a real list was reported as typed bullets"
        : null;
    },
  },
  {
    file: "synthetic-136-xlsx-headerless-table.xlsx",
    truth:
      'A workbook with one defined Table (Insert -> Table) created with Excel\'s "my table has no headers" box left ticked: headerRowCount="0". The range is a real table with named columns of data, but no row is marked as its header, so nothing tells assistive technology which cells label the columns beneath them. table_markup loses 30 points per headerless table — exactly 70 — and the verdict must name WCAG 1.3.1 (Level A). Trap 127 has no defined table at all, so nothing in either battery exercised this deduction until now.',
    build: () =>
      xlsx(
        [
          {
            name: "Enrollment",
            rows: [
              ["Program", "Participants"],
              ["Job Training", "412"],
              ["Housing Support", "268"],
            ],
            table: { name: "EnrollmentTable", ref: "A1:B3", headerRowCount: 0 },
          },
        ],
        { title: "Program Enrollment 2026" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 70)
        return `a single headerless defined table scored ${c.score}, not the 100 - 30 the rule defines`;
      if (!/no header row/i.test(allFindings(r))) return "the headerless table is not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "table_markup",
      );
      return failing ? null : "30 points lost with no 1.3.1 failure attributed to table_markup";
    },
  },
  {
    file: "synthetic-137-xlsx-header-table-twin.xlsx",
    truth:
      'The same workbook with the table\'s header row marked (headerRowCount="1"). table_markup must score a clean 100, no 1.3.1 may be asserted against it, and it must never score below its flawed twin.',
    build: () =>
      xlsx(
        [
          {
            name: "Enrollment",
            rows: [
              ["Program", "Participants"],
              ["Job Training", "412"],
              ["Housing Support", "268"],
            ],
            table: { name: "EnrollmentTable", ref: "A1:B3", headerRowCount: 1 },
          },
        ],
        { title: "Program Enrollment 2026" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `a table with a marked header row scored ${c.score}, not 100`;
      return /no header row/i.test(allFindings(r))
        ? "a table with a marked header row was reported as headerless"
        : null;
    },
  },
  {
    file: "synthetic-132-docx-no-language.docx",
    truth:
      "A titled Word document that declares NO language — core.xml is perfectly readable and simply carries no dc:language, and styles.xml declares no default either. title_language is worth 50 for the title and 50 for the language, so it must score exactly 50, and the verdict must name WCAG 3.1.1 Language of Page (Level A): without a declared language a screen reader applies the wrong pronunciation rules to the whole document. Scoring the half without naming the criterion would breach the legal-basis rule; naming it without scoring would file a Level A failure under 'not scored'.",
    build: () =>
      docx([HEADING(1, "Annual Report"), P(BODY_TEXT)].join(""), {
        title: "Annual Report 2026",
        styles: true,
        language: null,
      }),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 50)
        return `a titled document with no language scored ${c.score}, not the 50 that a title alone earns`;
      if (!/no document language/i.test(allFindings(r))) return "the missing language is not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "3.1.1" && String(f.category ?? "") === "title_language",
      );
      return failing ? null : "50 points lost with no 3.1.1 failure attributed to title_language";
    },
  },
  {
    file: "synthetic-133-docx-language-good-twin.docx",
    truth:
      "The same document with the document language declared. title_language must score a clean 100, no 3.1.1 may be asserted, and it must never score below its flawed twin.",
    build: () =>
      docx([HEADING(1, "Annual Report"), P(BODY_TEXT)].join(""), {
        title: "Annual Report 2026",
        styles: true,
      }),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 100) return `a titled, language-declared document scored ${c.score}, not 100`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.sc ?? "") === "3.1.1");
      return failing ? "3.1.1 asserted against a document that declares its language" : null;
    },
  },
  {
    file: "synthetic-148-pptx-big-text-in-placeholder.pptx",
    truth:
      "An untitled slide whose large bold text sits in a BODY PLACEHOLDER — a statistic set at 36 point for emphasis. Drawn from life: fifteen slides of a real agency deck (Dynamics of Domestic Violence) look exactly like this, and every one of them must stay unflagged. The text is already marked up as content, so nothing is conveyed by presentation alone and there is no WCAG failure; the slide simply has no heading, which is 2.4.10 Section Headings, Level AAA. If the typed-heading detector is ever widened to look inside placeholders, this trap fails and fifteen slides of one real deck become false accusations.",
    build: () =>
      pptx([SLIDE_BIG_BODY("More than 1 in 3 women have experienced intimate partner violence.")], {
        title: "Dynamics",
      }),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 100)
        return `large text inside a body placeholder cost ${100 - c.score} points — it is content, already marked up, and no WCAG 2.1 criterion is breached`;
      return /typed into an ordinary text box/i.test(allFindings(r))
        ? "text in a body placeholder was called a typed heading"
        : null;
    },
  },
  {
    file: "synthetic-149-pptx-long-line-not-a-heading.pptx",
    truth:
      "An untitled slide with a floating text box holding a long sentence — over 120 characters — set large and bold. Emphasis, not a heading: a heading is short by nature, and treating a whole paragraph as one would turn every emphasised pull-quote into a WCAG accusation. slide_titles must stay at 100. This is the other half of the typed-heading boundary, and it is the half a reader never sees until it goes wrong.",
    build: () =>
      pptx(
        [
          SLIDE_FAKE_HEADING(
            "Domestic violence affects people of every age, income, race and background, and the effects reach far beyond the household in which it happens.",
          ),
        ],
        { title: "Dynamics" },
      ),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 100)
        return `a 140-character sentence was scored as a typed heading (${c.score}) — a heading is short, and a paragraph set large is emphasis`;
      return null;
    },
  },
  {
    file: "synthetic-152-pptx-typed-bullets.pptx",
    truth:
      "A titled slide whose three agenda points are typed with a leading dash instead of PowerPoint's bullet formatting — visual list structure with no programmatic list, the same WCAG 1.3.1 Level A class Word has scored since the start. Until 2026-09-01 the deck lost the points with NO criterion in the verdict: the pptx gate had no list rule at all, so a deck capped at D named nothing — invisible to legal-basis because no control exercised it. list_structure must score 0 (no real items among three typed ones), and the verdict must name 1.3.1 against list_structure.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Agenda") +
            SLIDE_TYPED_LIST(["Call to order", "Budget review", "Adjournment"]),
        ],
        { title: "Board Agenda" },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null) return "list_structure unscored";
      if (c.score !== 0) return `three typed bullets with no real item scored ${c.score}, not 0`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (x) => String(x.sc ?? "") === "1.3.1" && String(x.category ?? "") === "list_structure",
      );
      return failing ? null : "points lost with no 1.3.1 failure attributed to list_structure";
    },
  },
  {
    file: "synthetic-153-pptx-real-list-twin.pptx",
    truth:
      "The same agenda with the three points as real bulleted paragraphs. list_structure must score a clean 100, no criterion may be asserted for it, and the deck must never score below its typed twin.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Agenda") +
            SLIDE_REAL_LIST(["Call to order", "Budget review", "Adjournment"]),
        ],
        { title: "Board Agenda" },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null) return "list_structure unscored";
      if (c.score !== 100) return `three real list items scored ${c.score}`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((x) => String(x.category ?? "") === "list_structure");
      return failing ? "a criterion is asserted against a clean list" : null;
    },
  },
  {
    file: "synthetic-150-pptx-white-on-white.pptx",
    truth:
      "A slide with an explicit white background whose title is typed in explicit white at an explicit 32-point size — genuinely invisible text, nothing stacked beneath it to change what a viewer sees. This is the REAL 1:1 case and it must stay caught: color_contrast must score 50 (one failing run of two checked), the findings must report the 1:1 ratio, and WCAG 1.4.3 Contrast (Minimum), Level AA must be named in the verdict against color_contrast. This trap exists as the flawed twin of synthetic-151: the two slides differ only in the banner painted beneath the title, which is exactly the difference between invisible text and a false accusation.",
    build: () =>
      pptx(
        [
          SLIDE_COLORED_TITLE("Quarterly Update", "FFFFFF", 1000000, 700000, 10000000, 1300000) +
            SLIDE_COLORED_BODY("Enrollment rose 12 percent across all regions.", "1A1A1A"),
        ],
        { title: "Quarterly Update", slideBgHex: "FFFFFF" },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null) return "color_contrast was not assessed";
      if (c.score !== 50) return `one invisible run of two checked scored ${c.score}, not 50`;
      const f = allFindings(r);
      if (!/Lowest contrast 1:1/i.test(f)) return "the 1:1 ratio is not reported";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (x) => String(x.sc ?? "") === "1.4.3" && String(x.category ?? "") === "color_contrast",
      );
      return failing ? null : "contrast points lost with no 1.4.3 failure attributed";
    },
  },
  {
    file: "synthetic-151-pptx-white-on-banner-twin.pptx",
    truth:
      "The same slide with one addition: a solid dark banner rectangle painted BENEATH the title, fully containing it — the pattern three real agency decks use for every section header. What a viewer sees is white-on-dark at about 11:1. Before 2026-09-01 the contrast walk resolved the title against the slide's white background and confirmed it as a 1.4.3 Level AA failure at 1:1 — a false accusation in the scored tier on real documents. The background behind a text shape is the topmost shape stacked beneath it: color_contrast must score a clean 100, the findings must say every checked run meets the minimum, no 1.4.3 may be asserted, and no category may accuse this deck of anything.",
    build: () =>
      pptx(
        [
          SLIDE_BANNER("1F3864", 400000, 500000, 11200000, 1700000) +
            SLIDE_COLORED_TITLE("Quarterly Update", "FFFFFF", 1000000, 700000, 10000000, 1300000) +
            SLIDE_COLORED_BODY("Enrollment rose 12 percent across all regions.", "1A1A1A"),
        ],
        { title: "Quarterly Update", slideBgHex: "FFFFFF" },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null)
        return "color_contrast was not assessed — the banner's solid fill should resolve the pair";
      if (c.score !== 100) return `white on a dark banner scored ${c.score} — the false 1:1 is back`;
      const f = allFindings(r);
      if (!/all meet the WCAG contrast minimum/i.test(f))
        return "the clean contrast result is not stated";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((x) => String(x.sc ?? "") === "1.4.3");
      if (failing) return "a 1.4.3 failure is asserted against a readable title";
      return noAccusation(r);
    },
  },
  {
    file: "synthetic-145-pptx-typed-heading.pptx",
    truth:
      "Two slides whose heading is typed into a floating 32-point bold text box instead of the slide's title placeholder — no <p:ph> on the shape at all, and the size set explicitly on the run. The heading EXISTS and is simply not marked up, which is WCAG 1.3.1 Level A, the same failure Word has scored since the start. PowerPoint had no equivalent check until 2026-08-31: this was a real Level A failure the report never mentioned in any form. slide_titles must lose points (15 per slide, capped at 40) AND the verdict must name 1.3.1. Deliberately NOT the same question as a slide with no heading at all, which is 2.4.10 Section Headings — Level AAA — and stays unscored.",
    build: () =>
      pptx(
        [
          SLIDE_FAKE_HEADING("Quarterly Results") + SLIDE_BODY("Enrollment rose 12 percent."),
          SLIDE_FAKE_HEADING("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { title: "Quarterly Review" },
      ),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 70)
        return `two typed headings scored ${c.score}, not the 100 - 2x15 the rule defines`;
      const f = allFindings(r);
      if (!/typed into an ordinary text box/i.test(f)) return "the typed headings are not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (x) => String(x.sc ?? "") === "1.3.1" && String(x.category ?? "") === "slide_titles",
      );
      return failing ? null : "points lost with no 1.3.1 failure attributed to slide_titles";
    },
  },
  {
    file: "synthetic-146-pptx-real-title-twin.pptx",
    truth:
      "The same two slides with the heading moved into the title placeholder. slide_titles must score a clean 100, no 1.3.1 may be asserted, and it must never score below its flawed twin.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Quarterly Results") + SLIDE_BODY("Enrollment rose 12 percent."),
          SLIDE_TITLE("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { title: "Quarterly Review" },
      ),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 100) return `a deck with real titles scored ${c.score}, not 100`;
      return /typed into an ordinary text box/i.test(allFindings(r))
        ? "a real title was called a typed heading"
        : null;
    },
  },
  {
    file: "synthetic-147-pptx-no-heading-at-all.pptx",
    truth:
      "A slide with NO title placeholder and NO heading-like text either — just body copy at ordinary size. This is the case that must NOT be scored: requiring a slide to HAVE a heading is WCAG 2.4.10 Section Headings, Level AAA, outside the standard the grade measures. slide_titles must stay at 100 and no 1.3.1 may be asserted. Without this twin, the typed-heading rule above could be satisfied by simply penalising every untitled slide, which is the over-reach the 2026-08-29 legal-only sweep removed.",
    build: () =>
      pptx([SLIDE_BODY("Enrollment rose 12 percent across all programs this year.")], {
        title: "Quarterly Review",
      }),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 100)
        return `an untitled slide with no visual heading scored ${c.score} — that is 2.4.10, Level AAA, and may not move the grade`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((x) => String(x.category ?? "") === "slide_titles");
      return failing ? "asserted a criterion against a slide that simply has no heading" : null;
    },
  },
  {
    file: "synthetic-134-pptx-title-not-first.pptx",
    truth:
      "A three-slide deck where slide 2 carries a real title placeholder that is NOT the first shape in the slide's tree — the body text is read out before the heading that was supposed to orient the listener. NOT SCORED since 2026-08-31: the PPTX conformance gate has always ruled the title-first heuristic is not a confirmed WCAG violation (1.3.2 asks that a correct sequence be programmatically DETERMINABLE, and the shape tree states it exactly), so reading_order must stay at 100 while the advisory names slide 2 with a not-scored prefix. This trap is the reason the rule was found: it deducted 15 points per slide for two days, which legal-basis catches the moment any document exercises it.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Quarterly Review") + SLIDE_BODY("Opening remarks."),
          SLIDE_BODY("Enrollment rose 12 percent.") + SLIDE_TITLE("Enrollment"),
          SLIDE_TITLE("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { title: "Quarterly Review" },
      ),
    check: (r) => {
      const c = cat("reading_order")(r);
      if (!c || c.score === null) return "reading_order unscored";
      if (c.score !== 100)
        return `a title-order heuristic the conformance gate declines to call a WCAG failure took ${100 - c.score} points`;
      const f = allFindings(r);
      if (!/not the first shape in reading order/i.test(f))
        return "the out-of-order slide is not reported at all";
      if (!/Advisory — not scored: slide 2\b/.test(f))
        return "the advisory does not name slide 2 with a not-scored prefix";
      // Titled slides must not also be reported as missing their titles.
      const st = cat("slide_titles")(r);
      if (st && st.score !== null && st.score < 100)
        return `slide_titles lost points (${st.score}) on a deck where every slide has a title`;
      return null;
    },
  },
  {
    file: "synthetic-135-pptx-title-first-twin.pptx",
    truth:
      "The same deck with slide 2's title placeholder restored to the front of the shape tree. reading_order must score a clean 100, and must never score below its flawed twin.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Quarterly Review") + SLIDE_BODY("Opening remarks."),
          SLIDE_TITLE("Enrollment") + SLIDE_BODY("Enrollment rose 12 percent."),
          SLIDE_TITLE("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { title: "Quarterly Review" },
      ),
    check: (r) => {
      const c = cat("reading_order")(r);
      if (!c || c.score === null) return "reading_order unscored";
      return c.score === 100 ? null : `a title-first deck scored ${c.score}, not 100`;
    },
  },
  {
    file: "synthetic-131-docx-only-empty-headings.docx",
    truth:
      'A Word document whose ONLY Heading-styled paragraphs are blank lines — no real heading anywhere. This is the document that produced the 2026-08-31 contradiction: the scorer\'s early return fired on `no headings found` and reported heading_structure as NOT ASSESSED, while the conformance verdict simultaneously named a WCAG 1.3.1 Level A failure about those very paragraphs. The report then read grade A, "No headings were found", "Nothing — this document passed every automated check" and "1 criterion failing" at once. The scorer and the verdict must agree that this category was assessed: heading_structure must be SCORED (not null), must lose points, must name 1.3.1 — and must never also claim the document has no headings.',
    build: () =>
      docx(
        [
          P(BODY_TEXT),
          EMPTY_HEADING(1),
          P(BODY_TEXT),
          EMPTY_HEADING(2),
          P(BODY_TEXT),
          EMPTY_HEADING(2),
          P(BODY_TEXT),
        ].join(""),
        { title: "Quarterly Update", styles: true },
      ),
    check: (r) => {
      const c = cat("heading_structure")(r);
      // The whole point of the trap: Not Assessed here is the bug.
      if (!c) return "heading_structure is missing from the report";
      if (c.score === null)
        return "heading_structure came back NOT ASSESSED — the scorer's early return fired on a document whose only headings are blank, which is what let a 1.3.1 failure sit beside grade A";
      if (c.score >= 100) return `blank-only headings did not move the score (got ${c.score})`;
      if (!/contain no text/i.test(allFindings(r))) return "the empty headings are not named";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "heading_structure",
      );
      if (!failing) return "score moved with no 1.3.1 failure attributed to heading_structure";
      // Scorer and verdict must not contradict each other on the same screen.
      if (/no headings were found/i.test(allFindings(r)))
        return 'the report says "No headings were found" while naming a 1.3.1 failure about those headings';
      return null;
    },
  },
  {
    file: "synthetic-129-docx-empty-headings-good-twin.docx",
    truth:
      "The same document with the blank Heading-styled lines removed — spacing done with ordinary empty paragraphs instead. The correct twin must score a clean 100 on heading structure, and must never score below its flawed twin.",
    build: () =>
      docx(
        [
          HEADING(1, "Annual Program Report"),
          P(BODY_TEXT),
          EMPTY_P,
          HEADING(2, "Program Enrollment"),
          P(BODY_TEXT),
          EMPTY_P,
          HEADING(2, "Next Steps"),
          P(BODY_TEXT),
        ].join(""),
        { title: "Annual Program Report 2026", styles: true },
      ),
    check: (r) => {
      const c = cat("heading_structure")(r);
      if (!c || c.score === null) return "heading_structure unscored";
      if (c.score !== 100) return `a document with no empty headings scored ${c.score}, not 100`;
      return /contain no text/i.test(allFindings(r))
        ? "accused of empty headings it does not have"
        : null;
    },
  },
  {
    file: "synthetic-127-xlsx-wcag-clean-bp-debt.xlsx",
    truth:
      "An Excel workbook that satisfies WCAG 2.1 outright — titled, every value extractable, no images and no headerless defined table to fault — and still carries best-practice work: both sheets keep Excel's default names, and the data sits in plain cell ranges with no defined Table anywhere. Neither is a WCAG 2.1 failure, so neither may move the score; both must still be reported with a not-scored prefix.",
    build: () =>
      xlsx(
        [
          {
            name: "Sheet1",
            rows: [
              ["County", "Enrolled", "Completed"],
              ["Adams", "412", "377"],
              ["Brown", "318", "301"],
              ["Clark", "265", "244"],
              ["Dane", "199", "180"],
              ["Edgar", "154", "141"],
              ["Fayette", "121", "118"],
            ],
          },
          { name: "Sheet2", rows: [["Note"], ["Counts come from the quarterly intake export."]] },
        ],
        { title: "Enrollment Counts 2026" },
      ),
    check: (r) =>
      bestPracticeDebtCheck(r, [
        'rename "sheet1"',
        'rename "sheet2"',
        "no defined excel table anywhere",
      ]),
  },
];

// Twin orderings, same contract as the PDF battery's.
const TWIN_ORDERINGS: { bad: string; good: string; category: string }[] = [
  {
    bad: "synthetic-128-docx-empty-headings.docx",
    good: "synthetic-129-docx-empty-headings-good-twin.docx",
    category: "heading_structure",
  },
  {
    bad: "synthetic-131-docx-only-empty-headings.docx",
    good: "synthetic-129-docx-empty-headings-good-twin.docx",
    category: "heading_structure",
  },
  {
    bad: "synthetic-132-docx-no-language.docx",
    good: "synthetic-133-docx-language-good-twin.docx",
    category: "title_language",
  },
  {
    bad: "synthetic-134-pptx-title-not-first.pptx",
    good: "synthetic-135-pptx-title-first-twin.pptx",
    category: "reading_order",
  },
  {
    bad: "synthetic-145-pptx-typed-heading.pptx",
    good: "synthetic-146-pptx-real-title-twin.pptx",
    category: "slide_titles",
  },
  {
    bad: "synthetic-150-pptx-white-on-white.pptx",
    good: "synthetic-151-pptx-white-on-banner-twin.pptx",
    category: "color_contrast",
  },
  {
    bad: "synthetic-152-pptx-typed-bullets.pptx",
    good: "synthetic-153-pptx-real-list-twin.pptx",
    category: "list_structure",
  },
  {
    bad: "synthetic-136-xlsx-headerless-table.xlsx",
    good: "synthetic-137-xlsx-header-table-twin.xlsx",
    category: "table_markup",
  },
  {
    bad: "synthetic-138-docx-low-contrast.docx",
    good: "synthetic-139-docx-contrast-good-twin.docx",
    category: "color_contrast",
  },
  {
    bad: "synthetic-140-docx-typed-bullets.docx",
    good: "synthetic-141-docx-real-list-twin.docx",
    category: "list_structure",
  },
  {
    bad: "synthetic-143-docx-unnamed-link.docx",
    good: "synthetic-144-docx-descriptive-links-twin.docx",
    category: "link_quality",
  },
  {
    bad: "synthetic-101-docx-bold-fake-headings.docx",
    good: "synthetic-102-docx-styles-good-twin.docx",
    category: "heading_structure",
  },
  {
    bad: "synthetic-103-docx-images-no-alt.docx",
    good: "synthetic-104-docx-images-alt-twin.docx",
    category: "alt_text",
  },
  {
    bad: "synthetic-105-docx-table-headerless.docx",
    good: "synthetic-106-docx-table-header-twin.docx",
    category: "table_markup",
  },
  {
    bad: "synthetic-107-docx-untitled.docx",
    good: "synthetic-108-docx-titled-twin.docx",
    category: "title_language",
  },
  {
    bad: "synthetic-109-pptx-untitled-slides.pptx",
    good: "synthetic-110-pptx-titled-twin.pptx",
    category: "slide_titles",
  },
  {
    bad: "synthetic-111-pptx-image-no-alt.pptx",
    good: "synthetic-112-pptx-image-alt-twin.pptx",
    category: "alt_text",
  },
  {
    bad: "synthetic-113-xlsx-default-sheet-names.xlsx",
    good: "synthetic-114-xlsx-named-sheets-twin.xlsx",
    category: "sheet_names",
  },
];

type TrapChip = "caught" | "held";
const TRAP_MANIFEST: Record<string, { label: string; chip: TrapChip; chipText?: string }> = {
  "synthetic-130-docx-picture-headings-not-blank.docx": {
    label: "Word: headings made of a letterhead picture and a symbol — not blank lines",
    chip: "held",
  },
  "synthetic-142-docx-vague-link-text.docx": {
    label: "Word: links reading \u201cclick here\u201d and \u201cread more\u201d",
    chip: "held",
  },
  "synthetic-143-docx-unnamed-link.docx": {
    label: "Word: a link with no link text at all",
    chip: "caught",
  },
  "synthetic-144-docx-descriptive-links-twin.docx": {
    label: "Word: the same page with both links described",
    chip: "held",
  },
  "synthetic-138-docx-low-contrast.docx": {
    label: "Word: body text in yellow on a white page",
    chip: "caught",
  },
  "synthetic-139-docx-contrast-good-twin.docx": {
    label: "Word: the same notice in near-black on white",
    chip: "held",
  },
  "synthetic-140-docx-typed-bullets.docx": {
    label: "Word: a list typed with bullet characters instead of list formatting",
    chip: "caught",
  },
  "synthetic-141-docx-real-list-twin.docx": {
    label: "Word: the same list built with Word's numbering",
    chip: "held",
  },
  "synthetic-136-xlsx-headerless-table.xlsx": {
    label: "Excel: a defined table created with \u201cmy table has no headers\u201d ticked",
    chip: "caught",
  },
  "synthetic-137-xlsx-header-table-twin.xlsx": {
    label: "Excel: the same table with its header row marked",
    chip: "held",
  },
  "synthetic-132-docx-no-language.docx": {
    label: "Word: a titled document that declares no language at all",
    chip: "caught",
  },
  "synthetic-133-docx-language-good-twin.docx": {
    label: "Word: the same document with its language declared",
    chip: "held",
  },
  "synthetic-148-pptx-big-text-in-placeholder.pptx": {
    label: "PowerPoint: a big statistic in a body placeholder — content, not a heading",
    chip: "held",
  },
  "synthetic-149-pptx-long-line-not-a-heading.pptx": {
    label: "PowerPoint: a long sentence set large — emphasis, not a heading",
    chip: "held",
  },
  "synthetic-152-pptx-typed-bullets.pptx": {
    label: "PowerPoint: agenda points typed with dashes instead of real bullets",
    chip: "caught",
  },
  "synthetic-153-pptx-real-list-twin.pptx": {
    label: "PowerPoint: the same agenda as a real bulleted list",
    chip: "held",
  },
  "synthetic-150-pptx-white-on-white.pptx": {
    label: "PowerPoint: a white title on a white slide — genuinely invisible text",
    chip: "caught",
  },
  "synthetic-151-pptx-white-on-banner-twin.pptx": {
    label: "PowerPoint: the same white title on a dark banner — readable, and no longer accused",
    chip: "held",
  },
  "synthetic-145-pptx-typed-heading.pptx": {
    label: "PowerPoint: headings typed into text boxes instead of title placeholders",
    chip: "caught",
  },
  "synthetic-146-pptx-real-title-twin.pptx": {
    label: "PowerPoint: the same slides with real title placeholders",
    chip: "held",
  },
  "synthetic-147-pptx-no-heading-at-all.pptx": {
    label: "PowerPoint: a slide with no heading at all — AAA, and not scored",
    chip: "held",
  },
  "synthetic-134-pptx-title-not-first.pptx": {
    label: "PowerPoint: a slide whose title is read after its body text",
    chip: "caught",
  },
  "synthetic-135-pptx-title-first-twin.pptx": {
    label: "PowerPoint: the same deck with every title read first",
    chip: "held",
  },
  "synthetic-131-docx-only-empty-headings.docx": {
    label: "Word: a document whose only headings are blank lines — nothing else",
    chip: "caught",
  },
  "synthetic-128-docx-empty-headings.docx": {
    label: "Word: heading styles on blank lines, used as spacing",
    chip: "caught",
  },
  "synthetic-129-docx-empty-headings-good-twin.docx": {
    label: "Word: the same document spaced with ordinary blank paragraphs",
    chip: "held",
  },
  "synthetic-101-docx-bold-fake-headings.docx": {
    label: "Word: bold 16-point text instead of Heading styles",
    chip: "caught",
  },
  "synthetic-102-docx-styles-good-twin.docx": {
    label: "Word: the same document with real Heading styles",
    chip: "held",
  },
  "synthetic-103-docx-images-no-alt.docx": {
    label: "Word: two pictures, alt panel never opened",
    chip: "caught",
  },
  "synthetic-104-docx-images-alt-twin.docx": {
    label: "Word: the same pictures, both described",
    chip: "held",
  },
  "synthetic-105-docx-table-headerless.docx": {
    label: "Word: a table whose header row was never marked",
    chip: "caught",
  },
  "synthetic-106-docx-table-header-twin.docx": {
    label: "Word: the same table, header row marked",
    chip: "held",
  },
  "synthetic-107-docx-untitled.docx": {
    label: "Word: no document title — readers hear the filename",
    chip: "caught",
  },
  "synthetic-108-docx-titled-twin.docx": {
    label: "Word: the same document, properly titled",
    chip: "held",
  },
  "synthetic-109-pptx-untitled-slides.pptx": {
    label: "PowerPoint: slides with no titles at all",
    chip: "caught",
  },
  "synthetic-110-pptx-titled-twin.pptx": {
    label: "PowerPoint: the same slides, properly titled",
    chip: "held",
  },
  "synthetic-111-pptx-image-no-alt.pptx": {
    label: "PowerPoint: a slide picture with no description",
    chip: "caught",
  },
  "synthetic-112-pptx-image-alt-twin.pptx": {
    label: "PowerPoint: the same picture, described",
    chip: "held",
  },
  "synthetic-113-xlsx-default-sheet-names.xlsx": {
    label: "Excel: sheets still named 'Sheet1' and 'Sheet2'",
    chip: "caught",
  },
  "synthetic-114-xlsx-named-sheets-twin.xlsx": {
    label: "Excel: the same workbook, sheets named for people",
    chip: "held",
  },
  "synthetic-115-xlsx-untitled.xlsx": {
    label: "Excel: a workbook with no document title",
    chip: "caught",
  },
  "synthetic-126-docx-wcag-clean-bp-debt.docx": {
    label: "Word: passes WCAG 2.1, and still skips a heading level and merges a header cell",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-127-xlsx-wcag-clean-bp-debt.xlsx": {
    label: 'Excel: passes WCAG 2.1, and is still called "Sheet1" with no defined Tables',
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
};

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const resultsByFile = new Map<string, AnalysisResult>();
  let hardFailures = 0;
  const rows: string[] = [];
  for (const s of SAMPLES) {
    const buf = await s.build();
    fs.writeFileSync(path.join(OUT_DIR, s.file), buf);
    let verdict: string;
    try {
      const r = await analyzeDocument(buf, s.file);
      resultsByFile.set(s.file, r);
      const problem = s.check(r);
      if (problem === null) verdict = `PASS    ${String(r.overallScore).padStart(3)}/${r.grade}`;
      else {
        verdict = `FAIL    ${String(r.overallScore).padStart(3)}/${r.grade}  ${problem}`;
        hardFailures++;
      }
    } catch (e: any) {
      verdict = `THREW   ${e?.message ?? e}`;
      hardFailures++;
    }
    rows.push(`${verdict.padEnd(72)} ${s.file}`);
    rows.push(`        truth: ${s.truth}`);
  }
  console.log(
    `\nSynthetic OFFICE adversarial controls — ${SAMPLES.length} documents in ${OUT_DIR}\n`,
  );
  for (const row of rows) console.log(row);

  for (const t of TWIN_ORDERINGS) {
    const bad = resultsByFile.get(t.bad);
    const good = resultsByFile.get(t.good);
    if (!bad || !good) {
      console.error(`twin ordering: missing result for ${t.bad} / ${t.good}`);
      hardFailures++;
      continue;
    }
    const problems = twinViolations(bad, good, t.category);
    if (problems.length) {
      console.error(`TWIN ORDER VIOLATED ${t.bad} vs ${t.good}: ${problems.join("; ")}`);
      hardFailures++;
    }
  }
  console.log(
    `twin orderings: ${TWIN_ORDERINGS.length} pairs — flawed twin never outscored the correct one`,
  );

  // ------------------------------------------------------------------
  // BATTERY-WIDE INVARIANT (v1.149.1): a category that scored a perfect 100
  // may not claim "No issues found" while carrying a finding the analyzer
  // itself marks as reported-but-never-counted.
  //
  // Written as an invariant over every document rather than as one more trap,
  // because the defect it guards was never about a particular file: it was a
  // label derived from the score alone. It shipped twice in one day — first
  // by looking only at the score (v1.149.0 fixed that), then by running the
  // relabel one line too early, before appendSupplementaryFindings, so six
  // controls carrying "Advisory — not scored" lines kept the wrong chip. A
  // single trap document would have caught neither reliably; this catches
  // both, on all every document, and on every document added after today.
  // ------------------------------------------------------------------
  {
    let overstated = 0;
    for (const [file, r] of resultsByFile) {
      for (const c of r.categories ?? []) {
        if (c.score !== 100 || c.severity !== "No issues found") continue;
        const advisory = (c.findings ?? []).find((f: string) =>
          /\bnot (scored|penali[sz]ed)\b/i.test(String(f)),
        );
        if (advisory) {
          console.error(
            `OVERSTATED  ${file}: ${c.id} scored 100 and reads "No issues found", but reports:\n            ${String(advisory).trim().slice(0, 140)}`,
          );
          overstated++;
          hardFailures++;
        }
      }
    }
    console.log(
      `advisory labels: every 100 that reported something says so (${overstated} overstatement(s))`,
    );
  }

  const missing = SAMPLES.filter((x) => !TRAP_MANIFEST[x.file]).map((x) => x.file);
  const extra = Object.keys(TRAP_MANIFEST).filter((f) => !SAMPLES.some((x) => x.file === f));
  if (missing.length || extra.length) {
    console.error(
      `manifest drift — missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
    hardFailures++;
  } else if (hardFailures === 0) {
    fs.writeFileSync(
      path.join(import.meta.dirname, "trap-manifest-office.json"),
      JSON.stringify(
        {
          count: SAMPLES.length,
          generated: new Date().toISOString().slice(0, 10),
          items: SAMPLES.map((x) => ({ file: x.file, ...TRAP_MANIFEST[x.file] })),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`trap-manifest-office.json refreshed (${SAMPLES.length} entries)`);
  }
  console.log(`\n${hardFailures === 0 ? "ALL TRUTHS HELD" : `${hardFailures} TRUTH(S) VIOLATED`}`);
  process.exit(hardFailures === 0 ? 0 : 1);
}
main();

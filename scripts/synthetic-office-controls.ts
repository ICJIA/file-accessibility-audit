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
import { TYPED_LIST_FLOOR, UNHEADERED_DATA_TABLE_SCORE } from "@file-audit/shared";

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

/** The same package with its XML parts passed through `f` — for the
 *  encoding traps (2026-10-06), where the document is identical and only how
 *  it is written changes. */
async function rewritePackage(
  buf: Buffer,
  f: (name: string, xml: string) => string | Buffer,
): Promise<Buffer> {
  const src = await JSZip.loadAsync(buf);
  const files: Record<string, string | Buffer> = {};
  for (const [name, entry] of Object.entries(src.files) as Array<[string, any]>) {
    if (entry.dir) continue;
    files[name] = /\.(xml|rels)$/.test(name)
      ? f(name, await entry.async("string"))
      : await entry.async("nodebuffer");
  }
  return zip(files);
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
    /** Extra <w:style> definitions appended to the heading styles part (table
     *  styles, for the table traps); implies `styles: true`. */
    stylesExtra?: string;
    /** Inner XML of a default page header (word/header1.xml), wired the way
     *  Word writes it: a header relationship plus a w:headerReference in the
     *  body's closing w:sectPr — so the control opens with its letterhead. */
    headerXml?: string;
  } = {},
): Promise<Buffer> {
  const rels = [
    ...(opts.hyperlinks ?? []).map(
      (h) =>
        `<Relationship Id="${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${h.target}" TargetMode="External"/>`,
    ),
    ...(opts.headerXml !== undefined
      ? [
          '<Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
        ]
      : []),
  ];
  const sectPr =
    opts.headerXml !== undefined
      ? '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/></w:sectPr>'
      : "";
  return zip({
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${opts.styles || opts.stylesExtra ? '\n<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' : ""}${opts.headerXml !== undefined ? '\n<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    // After [Content_Types].xml, never before it: OPC readers are forgiving,
    // but these controls are also meant to be opened by hand in Word, and
    // the content-types part conventionally leads the package.
    ...(opts.styles || opts.stylesExtra
      ? {
          "word/styles.xml": HEADING_STYLES_XML.replace(
            "</w:styles>",
            `${opts.stylesExtra ?? ""}</w:styles>`,
          ),
        }
      : {}),
    "_rels/.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    "docProps/core.xml": corePropsXml(
      opts.title === undefined ? "Synthetic Office Control" : opts.title,
      opts.language === undefined ? "en-US" : opts.language,
    ),
    ...(rels.length > 0
      ? {
          "word/_rels/document.xml.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join("\n")}
</Relationships>`,
        }
      : {}),
    ...(opts.headerXml !== undefined
      ? {
          "word/header1.xml": `${XMLDECL}
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${opts.headerXml}</w:hdr>`,
        }
      : {}),
    "word/document.xml": `${XMLDECL}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${bodyXml}${sectPr}</w:body>
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
/** DRAWING marked decorative the way Word 365 writes Alt Text → "Mark as
 *  decorative": an adec:decorative extension on the drawing's docPr. */
const DECORATIVE_DRAWING = (id: number) =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="1905000"/><wp:docPr id="${id}" name="Picture ${id}"><a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst></wp:docPr></wp:inline></w:drawing></w:r></w:p>`;
const BODY_TEXT =
  "This paragraph carries enough ordinary running prose to count as real document body text for the analyzer, with plain words continuing along in an unremarkable way.";

const EMPTY_P = "<w:p/>";

// A Spanish public notice — enough plain prose for the declared-language
// check (60+ words, overwhelmingly Spanish function words). Traps 173/174.
const SPANISH_NOTICE = [
  "La comisión celebrará una reunión pública el martes en la sala de conferencias del edificio principal.",
  "Todas las personas que deseen participar pueden asistir en persona o por teléfono.",
  "La agenda incluye el informe del presupuesto, las solicitudes de subvenciones y los comentarios del público.",
  "Los documentos de la reunión están disponibles en el sitio web de la comisión.",
  "Las personas que necesiten un intérprete o una adaptación deben comunicarse con la oficina por lo menos dos días antes de la reunión.",
];
/** P / HEADING with the run marked in a language — what Word's autodetect,
 *  or Review → Language → Set Proofing Language on a selection, writes. */
const P_LANG = (text: string, lang: string) =>
  `<w:p><w:r><w:rPr><w:lang w:val="${lang}"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const HEADING_LANG = (level: number, text: string, lang: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:rPr><w:lang w:val="${lang}"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
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

/** The roll-call grid from a real agency meeting agenda (2026-10-05), built
 *  the way Word wrote it after the content was pasted in: a bold first row of
 *  column labels, Present/Absent cells left blank to tick at the meeting, and
 *  the paste's `<w:shd w:val="clear" w:color="auto" w:fill="auto"/>` — the
 *  explicit "no shading" mark — on every cell and run. `look` is the table's
 *  w:tblLook, where Table Design → Header Row lives; `repeatHeader` sets
 *  Table Layout → Repeat Header Rows on the first row; `borders: false`
 *  strips every border, leaving the bare pasted grid. Names are roles. */
function docxRollCallTable(opts: {
  look: string;
  repeatHeader: boolean;
  borders?: boolean;
}): string {
  const noFill = '<w:shd w:val="clear" w:color="auto" w:fill="auto"/>';
  const edge = (side: string) => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="auto"/>`;
  const tcBorders =
    opts.borders === false
      ? ""
      : `<w:tcBorders>${["top", "left", "bottom", "right"].map(edge).join("")}</w:tcBorders>`;
  const cell = (text: string, bold = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="3100" w:type="dxa"/>${tcBorders}${noFill}</w:tcPr>` +
    (text
      ? `<w:p><w:r><w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}${noFill}</w:rPr><w:t>${text}</w:t></w:r></w:p>`
      : "<w:p/>") +
    "</w:tc>";
  const members = [
    "Chair",
    "Vice Chair",
    "Member, State Police",
    "Member, Sheriffs Association",
    "Member, Department of Public Health",
    "Member, Public Defender",
  ];
  const tblBorders =
    opts.borders === false
      ? ""
      : `<w:tblBorders>${["top", "left", "bottom", "right"]
          .map((s) => `<w:${s} w:val="outset" w:sz="6" w:space="0" w:color="auto"/>`)
          .join("")}</w:tblBorders>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/>${tblBorders}${opts.look}</w:tblPr>` +
    '<w:tblGrid><w:gridCol w:w="3100"/><w:gridCol w:w="3100"/><w:gridCol w:w="3100"/></w:tblGrid>' +
    `<w:tr>${opts.repeatHeader ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${["Task Force Member", "Present", "Absent"].map((t) => cell(t, true)).join("")}</w:tr>` +
    members.map((m) => `<w:tr>${cell(m)}${cell("")}${cell("")}</w:tr>`).join("") +
    "</w:tbl>"
  );
}
/** w:tblLook exactly as Word writes it: 04A0 is every new table's default —
 *  Header Row and First Column ticked. 0480 is the same with Header Row
 *  unticked. Both forms are written, as current Word does. */
const LOOK_HEADER_ROW_ON =
  '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
const LOOK_HEADER_ROW_OFF =
  '<w:tblLook w:val="0480" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
/** The agenda around the table: a titled document with a real H1/H2 outline. */
const agendaDocx = (table: string) =>
  docx(
    [
      HEADING(1, "Uniform Statewide Crime Statistics Task Force"),
      P(
        "Public notice is hereby given that the task force will conduct a public meeting. All interested parties are invited to attend and will be given the opportunity for public comment.",
      ),
      P("Date: October 13, 2026"),
      P("Location: online meeting"),
      table,
      HEADING(2, "Meeting Agenda"),
      P(BODY_TEXT),
    ].join(""),
    { title: "Task Force Meeting Agenda", styles: true },
  );

/** A Word table for the 2026-10-06 table traps: `rows` of plain cells, with
 *  the table-level and cell-level properties under test passed in verbatim. */
function wordGrid(
  rows: string[][],
  opts: { tblPr?: string; tcPr?: string; look?: string } = {},
): string {
  const cell = (t: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>${opts.tcPr ?? ""}</w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${opts.tblPr ?? ""}${opts.look ?? ""}</w:tblPr>` +
    `<w:tblGrid>${rows[0]!.map(() => '<w:gridCol w:w="3000"/>').join("")}</w:tblGrid>` +
    rows.map((r) => `<w:tr>${r.map(cell).join("")}</w:tr>`).join("") +
    "</w:tbl>"
  );
}
const SIDES = ["top", "left", "bottom", "right", "insideH", "insideV"];
/** Explicit "no border" on every edge — what Google Docs, LibreOffice and
 *  pasted web content write for an invisible grid. */
const NIL_BORDERS = `<w:tblBorders>${SIDES.map((s) => `<w:${s} w:val="nil"/>`).join("")}</w:tblBorders>`;
const CELL_BORDERS = `<w:tcBorders>${["top", "left", "bottom", "right"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("")}</w:tcBorders>`;
/** Table styles as their producers define them: Word's default "Normal
 *  Table", a Google Docs-style "a" based on it that draws nothing, and Word's
 *  "Table Grid", which draws every border. */
const TABLE_STYLES = `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="a"><w:name w:val="a"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblStyleRowBandSize w:val="1"/><w:tblStyleColBandSize w:val="1"/></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders>${SIDES.map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("")}</w:tblBorders></w:tblPr></w:style>`;
const AGENDA_ROWS = [
  ["9:00", "Welcome and roll call"],
  ["9:15", "Budget update"],
  ["10:00", "Public comment"],
];
const DATA_ROWS = [
  ["Program", "Award", "Sites"],
  ["Job Training", "412,000", "6"],
  ["Housing Support", "268,000", "4"],
];
const tableMemo = (table: string, stylesExtra?: string) =>
  docx([HEADING(1, "Program Grants"), P(BODY_TEXT), table, P(BODY_TEXT)].join(""), {
    title: "Program Grants",
    styles: true,
    stylesExtra,
  });
/** The bare-grid truth (Word's rule since 2026-08-29): never scored or
 *  gated, the advisory reported, the document 100/A. */
const layoutGridHeld = (r: AnalysisResult): string | null => {
  const c = cat("table_markup")(r);
  if (!c || c.score === null) return "table_markup unscored";
  if (c.score !== 100) return `a layout grid was scored ${c.score} as a data table`;
  if (!/bare grid/i.test(allFindings(r))) return "the bare-grid advisory did not fire";
  if (accused(r, "table_markup")) return "1.3.1 asserted against a layout grid";
  return r.overallScore === 100 ? null : `the document scored ${r.overallScore}/${r.grade}`;
};

function pptx(
  slides: string[],
  opts: {
    title?: string | null;
    slideBgHex?: string;
    /** Replaces docProps/core.xml verbatim — e.g. a part that cannot be parsed. */
    coreXml?: string;
    /** false = no deck-wide default language in presentation.xml (Google
     *  Slides exports omit it); the runs' own marks are then all there is. */
    declareLanguage?: boolean;
    /** Extra parts — masters, layouts, a theme — with their content types,
     *  and a relationships part per slide (1-based, e.g. the slide's layout):
     *  the producer-shaped traps (2026-10-06) need a deck's layout and master
     *  chain, as real producers write it. */
    parts?: Record<string, string>;
    partTypes?: Array<[string, string]>;
    slideRels?: Record<number, string>;
  } = {},
): Promise<Buffer> {
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n")}${(opts.partTypes ?? []).map(([part, type]) => `\n<Override PartName="${part}" ContentType="${type}"/>`).join("")}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    "_rels/.rels": `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    "docProps/core.xml":
      opts.coreXml ??
      corePropsXml(opts.title === undefined ? "Synthetic Office Control" : opts.title),
    "ppt/presentation.xml": `${XMLDECL}
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst>
${opts.declareLanguage === false ? "" : '<p:defaultTextStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:lvl1pPr><a:defRPr lang="en-US"/></a:lvl1pPr></p:defaultTextStyle>'}
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
    const rels = opts.slideRels?.[i + 1];
    if (rels) {
      files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
    }
  });
  Object.assign(files, opts.parts ?? {});
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
/** A real PowerPoint table (Insert → Table) on a graphic frame. PowerPoint
 *  has exactly one way to mark a header row — Table Design → Header Row,
 *  which writes `firstRow="1"` on <a:tblPr> — so `withHeader` toggles only
 *  that attribute; the cells are identical either way. Insert → Table always
 *  writes a table style (the default Medium Style 2 – Accent 1 GUID), so the
 *  style is present either way; `bare: true` strips it, which is what an
 *  author does to use a table as an invisible layout grid. */
const PPT_DEFAULT_TABLE_STYLE = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";
const SLIDE_TABLE = (rows: string[][], withHeader: boolean, bare = false) =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1800000"/><a:ext cx="8000000" cy="2400000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${withHeader ? ' firstRow="1"' : ""} bandRow="1">${bare ? "" : `<a:tableStyleId>${PPT_DEFAULT_TABLE_STYLE}</a:tableStyleId>`}</a:tblPr><a:tblGrid>${rows[0]
    .map(() => '<a:gridCol w="2600000"/>')
    .join(
      "",
    )}</a:tblGrid>${rows.map((r) => `<a:tr h="370000">${r.map((t) => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></a:txBody></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
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
  /** The header names Excel stores in the table part (<tableColumns>) —
   *  written only when given, so earlier traps keep their exact bytes. */
  columns?: string[];
}

function xlsx(
  sheets: {
    name: string;
    rows: string[][];
    table?: XlsxTable;
    /** Hyperlinks on cells, written as Excel writes them: no display
     *  attribute, the cell's own text is the link's text. */
    links?: Array<{ ref: string; url: string }>;
    /** Pictures, by description, in one drawing part — written the way
     *  openpyxl writes them (2026-10-06): a default-namespace wsDr whose
     *  every picture carries descr="Picture" unless the author changes it. */
    pictures?: string[];
  }[],
  opts: {
    title?: string | null;
    /** Give every cell an explicit font color (ARGB) and NO fill — Home →
     *  Font Color on the plain grid. Writes xl/styles.xml with that one cell
     *  format; otherwise no styles part is written, as before. */
    fontArgb?: string;
    /** The coloured font's size/weight elements, replacing <sz val="11"/>
     *  (2026-10-06) — e.g. '<b val="0"/><sz val="14"/>'. */
    fontProps?: string;
    /** false = rows and cells carry no r= reference — legal, positioned by
     *  order (2026-10-06). */
    cellRefs?: boolean;
  } = {},
): Promise<Buffer> {
  const styled = opts.fontArgb !== undefined;
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${styled ? '\n<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : ""}
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
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}${styled ? `\n<Relationship Id="rIdS1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` : ""}
</Relationships>`,
  };
  if (styled) {
    // Excel's own two leading fills (none, gray125) and default font, then the
    // one test format: the colored font on fill 0 — no fill at all.
    files["xl/styles.xml"] = `${XMLDECL}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font>${opts.fontProps ?? '<sz val="11"/>'}<color rgb="${opts.fontArgb}"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>`;
  }
  sheets.forEach((s, i) => {
    const refs = opts.cellRefs !== false;
    const rows = s.rows
      .map(
        (r, ri) =>
          `<row${refs ? ` r="${ri + 1}"` : ""}>${r.map((v, ci) => `<c${refs ? ` r="${String.fromCharCode(65 + ci)}${ri + 1}"` : ""}${styled ? ' s="1"' : ""} t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`,
      )
      .join("");
    const links = s.links ?? [];
    const pictures = s.pictures ?? [];
    // xlsxService finds tables by walking the SHEET's rels for a /table
    // relationship, so the rels part is what makes the table real; <tableParts>
    // is emitted too because that is what Excel writes.
    files[`xl/worksheets/sheet${i + 1}.xml`] = `${XMLDECL}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${links.length ? `<hyperlinks>${links.map((l, k) => `<hyperlink ref="${l.ref}" r:id="rIdL${k + 1}"/>`).join("")}</hyperlinks>` : ""}${pictures.length ? '<drawing r:id="rIdD1"/>' : ""}${s.table ? `<tableParts count="1"><tablePart r:id="rIdT1"/></tableParts>` : ""}</worksheet>`;
    if (pictures.length) {
      files[`xl/drawings/drawing${i + 1}.xml`] = `${XMLDECL}
<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">${pictures
        .map(
          (descr, k) =>
            `<oneCellAnchor><from><col>${4 + k * 3}</col><colOff>0</colOff><row>1</row><rowOff>0</rowOff></from><ext cx="1905000" cy="1143000"/><pic><nvPicPr><cNvPr id="${k + 1}" name="Image ${k + 1}" descr="${descr}"/><cNvPicPr/></nvPicPr><blipFill/><spPr><a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="rect"/></spPr></pic><clientData/></oneCellAnchor>`,
        )
        .join("")}</wsDr>`;
    }
    if (s.table || links.length || pictures.length) {
      files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = `${XMLDECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${s.table ? `<Relationship Id="rIdT1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${i + 1}.xml"/>` : ""}${links.map((l, k) => `<Relationship Id="rIdL${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${l.url}" TargetMode="External"/>`).join("")}${pictures.length ? `<Relationship Id="rIdD1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="/xl/drawings/drawing${i + 1}.xml"/>` : ""}
</Relationships>`;
    }
    if (s.table) {
      files[`xl/tables/table${i + 1}.xml`] = `${XMLDECL}
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${i + 1}" name="${s.table.name}" displayName="${s.table.name}" ref="${s.table.ref}" headerRowCount="${s.table.headerRowCount}"${s.table.columns ? `><tableColumns count="${s.table.columns.length}">${s.table.columns.map((c, k) => `<tableColumn id="${k + 1}" name="${c}"/>`).join("")}</tableColumns></table>` : "/>"}`;
    }
  });
  return zip(files);
}

// ---------------------------------------------------------------------------
// Producer-shaped decks and documents (plan step 3, 2026-10-06): a master,
// layouts and a theme written the way PowerPoint, Google Slides and
// python-pptx write them, and the markup docx.js and LibreOffice produce —
// each shape taken from files generated with that producer.
// ---------------------------------------------------------------------------
const P_NS_ALL =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const PPT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** Office's theme colours (dk1 overridable, for a dark template) and the
 *  background fill style a bgRef idx="1001" names: solid, in its colour. */
const OFFICE_THEME = (dk1 = "000000") =>
  `${XMLDECL}<a:theme ${P_NS_ALL} name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="${dk1}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const STD_CLRMAP =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
/** PowerPoint's (and python-pptx's) master background: a theme reference. */
const BGREF_BG1 = '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>';
const SOLID_BG = (hex: string) =>
  `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
/** A master whose body text style bullets level 1, as PowerPoint's does.
 *  Its text styles set sizes only, unless `txStyles` replaces them. */
const PPT_MASTER = (opts: { bg: string; shapes?: string; clrMap?: string; txStyles?: string }) =>
  `${XMLDECL}<p:sldMaster ${P_NS_ALL}><p:cSld>${opts.bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${opts.shapes ?? ""}</p:spTree></p:cSld><p:clrMap ${opts.clrMap ?? STD_CLRMAP}/><p:txStyles>${opts.txStyles ?? '<p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>'}</p:txStyles></p:sldMaster>`;
/** The master text styles PowerPoint's default template writes — sizes AND
 *  colours (tx1) — with the body text's fill replaceable. */
const TX1_FILL = '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>';
const COLOURED_TX_STYLES = (bodyFill = TX1_FILL) =>
  `<p:titleStyle><a:lvl1pPr><a:defRPr sz="4400">${TX1_FILL}</a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="•"/><a:defRPr sz="2800">${bodyFill}</a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800">${TX1_FILL}</a:defRPr></a:lvl1pPr></p:otherStyle>`;
/** A text box at explicit bounds with one run: rPr is the run's properties
 *  XML after its attributes (">" + fills, highlight, link …). */
const RUN_BOX = (text: string, rPr: string, bounds = XFRM(838200, 2000000, 6000000, 800000)) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="5" name="TextBox 4"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${bounds}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"${rPr}</a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** The look PowerPoint gives a shape it inserts: the accent fill (theme
 *  fill style 1) and white (lt1) text. */
const INSERTED_SHAPE_STYLE =
  '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>';
const PPT_LAYOUT = (shapes: string, bg = "") =>
  `${XMLDECL}<p:sldLayout ${P_NS_ALL}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const XFRM = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const LAYOUT_PH = (ph: string, opts: { xfrm?: string; lstStyle?: string } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Placeholder"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${opts.xfrm ?? ""}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle>${opts.lstStyle ?? ""}</a:lstStyle><a:p/></p:txBody></p:sp>`;
/** A slide placeholder holding plain paragraphs — no bullet marks of its own. */
const PH_SP = (id: number, ph: string, paragraphs: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Placeholder ${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs.map((t) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
/** A text box at explicit bounds with one run in an explicit colour and size. */
const COLOR_BOX = (text: string, hex: string, sz: number) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="5" name="TextBox 4"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${XFRM(838200, 2000000, 6000000, 800000)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="${sz}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** A deck's theme, master and layouts; slideLayouts maps each slide (in
 *  order) to a layout (1-based). */
const deckChain = (opts: {
  master: string;
  layouts: string[];
  slideLayouts: number[];
  theme?: string;
}) => {
  const relsOf = (type: string, target: string) =>
    `${XMLDECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${PPT_REL}/${type}" Target="${target}"/></Relationships>`;
  const parts: Record<string, string> = {
    "ppt/slideMasters/slideMaster1.xml": opts.master,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsOf("theme", "../theme/theme1.xml"),
    "ppt/theme/theme1.xml": opts.theme ?? OFFICE_THEME(),
  };
  const partTypes: Array<[string, string]> = [
    [
      "/ppt/slideMasters/slideMaster1.xml",
      "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
    ],
    ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
  ];
  opts.layouts.forEach((xml, k) => {
    parts[`ppt/slideLayouts/slideLayout${k + 1}.xml`] = xml;
    parts[`ppt/slideLayouts/_rels/slideLayout${k + 1}.xml.rels`] = relsOf(
      "slideMaster",
      "../slideMasters/slideMaster1.xml",
    );
    partTypes.push([
      `/ppt/slideLayouts/slideLayout${k + 1}.xml`,
      "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
    ]);
  });
  const slideRels = Object.fromEntries(
    opts.slideLayouts.map((l, i) => [
      i + 1,
      `<Relationship Id="rIdLayout" Type="${PPT_REL}/slideLayout" Target="../slideLayouts/slideLayout${l}.xml"/>`,
    ]),
  );
  return { parts, partTypes, slideRels };
};
/** docx.js's heading styles (verified, docx 9.8.1): named "Heading 1/2",
 *  with NO outline level of their own — a heading by name alone. */
const DOCXJS_STYLES = `${XMLDECL}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[
  1, 2,
]
  .map(
    (n) =>
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="Heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="2E74B5"/><w:sz w:val="${n === 1 ? 32 : 26}"/><w:szCs w:val="${n === 1 ? 32 : 26}"/></w:rPr></w:style>`,
  )
  .join("")}</w:styles>`;
/** A PowerPoint table as LibreOffice 26.2 writes it back (verified): the
 *  Header Row mark and table style gone — an empty tblPr — and every cell's
 *  borders baked in as solid black lines. */
const LIBREOFFICE_TABLE = (rows: string[][]) => {
  const ln = (side: string) =>
    `<a:${side} w="12240"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/></a:${side}>`;
  const cell = (t: string) =>
    `<a:tc><a:txBody><a:bodyPr anchor="t"><a:noAutofit/></a:bodyPr><a:p><a:r><a:rPr lang="en-US" sz="1800" b="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr anchor="t" marL="91440" marR="91440" marT="45720" marB="45720">${["lnL", "lnR", "lnT", "lnB"].map(ln).join("")}<a:noFill/></a:tcPr></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1800000"/><a:ext cx="7800000" cy="1110000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr></a:tblPr><a:tblGrid>${rows[0]!.map(() => '<a:gridCol w="2599920"/>').join("")}</a:tblGrid>${rows.map((r) => `<a:tr h="369720">${r.map(cell).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
};

// ---------------------------------------------------------------------------
interface Sample {
  file: string;
  truth: string;
  build: () => Promise<Buffer>;
  check: (r: AnalysisResult) => string | null;
}

const cat = (id: string) => (r: AnalysisResult) => r.categories.find((c) => c.id === id);
/** Does the verdict name `sc` against `category`? */
const names = (r: AnalysisResult, sc: string, category: string): boolean =>
  !!(
    r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
  ).conformance?.failures?.some(
    (f) => String(f.sc ?? "") === sc && String(f.category ?? "") === category,
  );
/** Does the verdict name ANY criterion against `category`? */
const accused = (r: AnalysisResult, category: string): boolean =>
  !!(
    r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
  ).conformance?.failures?.some((f) => String(f.category ?? "") === category);
const allFindings = (r: AnalysisResult) => r.categories.flatMap((c) => c.findings).join("\n");
const noAccusation = (r: AnalysisResult): string | null => {
  const bad = r.categories.filter((c) => c.severity === "Critical" || c.severity === "Moderate");
  return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
};

/** THE TABLE-HEADER PARITY TRUTH (2026-10-05), asserted identically on every
 *  format's unheadered-table trap — the PDF battery's included. A data table
 *  whose header row is not marked fails WCAG 1.3.1 the same way in any
 *  format, so it must score exactly UNHEADERED_DATA_TABLE_SCORE (Moderate),
 *  an otherwise-clean file must therefore cap at 79/C, and the verdict must
 *  name 1.3.1 against table_markup. Until that date the same table scored
 *  30/Critical in Word and PowerPoint (→ 69/D), 45 in PDF (→ 79/C) and 70/
 *  Minor in Excel (→ 89/B) — found when a real Word agenda graded D for one
 *  unheadered roll-call table. `wholeDocument: false` for a trap that carries
 *  other designed defects, where only the table's own numbers are comparable. */
const unheaderedTableParity = (
  r: AnalysisResult,
  opts: { wholeDocument: boolean },
): string | null => {
  const c = cat("table_markup")(r);
  if (!c || c.score === null) return "table_markup unscored";
  if (c.score !== UNHEADERED_DATA_TABLE_SCORE)
    return `an unheadered data table scored ${c.score}, not the ${UNHEADERED_DATA_TABLE_SCORE} every format must give it`;
  if (c.severity !== "Moderate") return `table_markup severity ${c.severity}, not Moderate`;
  if (opts.wholeDocument && (r.overallScore !== 79 || r.grade !== "C"))
    return `an otherwise-clean file graded ${r.overallScore}/${r.grade}, not the Moderate ceiling 79/C`;
  const failing = (
    r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
  ).conformance?.failures?.some(
    (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "table_markup",
  );
  return failing ? null : "points lost with no 1.3.1 failure attributed to table_markup";
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
      "A data table whose header row is not marked as one — Word's repeat-header checkbox never ticked. The table must score exactly the one value every format gives an unheadered data table (Moderate), the otherwise-clean file must cap at 79/C, and the verdict must name WCAG 1.3.1. Until 2026-10-05 it scored 30/Critical here and capped the file at 69/D — a grade the same table never reached as a PDF.",
    build: () => docx([P(BODY_TEXT), docxTable(false)].join("")),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
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
      'A workbook with one defined Table (Insert -> Table) created with Excel\'s "my table has no headers" box left ticked: headerRowCount="0". The range is a real table with named columns of data, but no row is marked as its header, so nothing tells assistive technology which cells label the columns beneath them. table_markup must score exactly the one value every format gives an unheadered data table (Moderate) — until 2026-10-05 Excel subtracted 30 per table, so this read 70/Minor and capped at 89/B while the identical table capped at 79/C as a PDF and 69/D in Word — the otherwise-clean workbook must cap at 79/C, and the verdict must name WCAG 1.3.1 (Level A). Trap 127 has no defined table at all, so nothing in either battery exercised this deduction until now.',
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
      if (!/no header row/i.test(allFindings(r))) return "the headerless table is not named";
      return unheaderedTableParity(r, { wholeDocument: true });
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
      "A titled slide whose three agenda points are typed with a leading dash instead of PowerPoint's bullet formatting — visual list structure with no programmatic list, the same WCAG 1.3.1 Level A class Word has scored since the start. Until 2026-09-01 the deck lost the points with NO criterion in the verdict: the pptx gate had no list rule at all, so a deck capped at D named nothing — invisible to legal-basis because no control exercised it. Since 2026-10-05 a list typed entirely by hand floors at the Moderate band (TYPED_LIST_FLOOR — every word present and in order, only the structure missing; it scored 0 and capped the deck at D until then): list_structure must score exactly that floor, the otherwise-clean deck must cap at 79/C, and the verdict must name 1.3.1 against list_structure.",
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
      if (c.score !== TYPED_LIST_FLOOR)
        return `three typed bullets with no real item scored ${c.score}, not the Moderate floor ${TYPED_LIST_FLOOR}`;
      if (r.overallScore !== 79) return `the deck graded ${r.overallScore}/${r.grade}, not 79/C`;
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
      if (c.score !== 100)
        return `white on a dark banner scored ${c.score} — the false 1:1 is back`;
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
      "Two slides whose heading is typed into a floating 32-point bold text box instead of the slide's title placeholder — no <p:ph> on the shape at all, and the size set explicitly on the run. The heading EXISTS and is simply not marked up, which is WCAG 1.3.1 Level A, the same failure Word has scored since the start. PowerPoint had no equivalent check until 2026-08-31: this was a real Level A failure the report never mentioned in any form. slide_titles must lose points AND the verdict must name 1.3.1 — and since 2026-10-05 (user decision) at Word's severity: with no titled slide anywhere, two typed headings are sections that exist only visually, so the category drops to 30 (Critical), the same as Word's 30 and PDF's 0 for the same defect. It read 70 (Minor) until then. Deliberately NOT the same question as a slide with no heading at all, which is 2.4.10 Section Headings — Level AAA — and stays unscored.",
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
      if (c.score !== 30)
        return `two typed headings in an untitled deck scored ${c.score}, not Word's 30 (Critical)`;
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
  {
    file: "synthetic-163-docx-one-bold-title-line.docx",
    truth:
      "A one-page memo whose only heading-like line is its title, set in bold 16-point type rather than a Heading style, above three paragraphs of body text. One line that looks like a heading is the document's title, not sections whose structure the markup fails to convey — the rule PDF has applied since 2026-09-02. Until 2026-10-05 Word subtracted 70 for it and graded the memo D, while the same memo saved as a PDF graded A. heading_structure must not be scored, no criterion may be asserted against it, and the memo must be 100/A.",
    build: () =>
      docx(
        [FAKE_HEADING("Quarterly Program Memo"), P(BODY_TEXT), P(BODY_TEXT), P(BODY_TEXT)].join(""),
        { title: "Quarterly Program Memo" },
      ),
    check: (r) => {
      const c = cat("heading_structure")(r);
      if (!c) return "heading_structure missing";
      if (c.score !== null) return `a lone title line was scored ${c.score}`;
      if (!/single title does not make sections/i.test(c.findings.join(" ")))
        return "the lone title is not explained";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "heading_structure");
      if (failing) return "1.3.1 asserted against a single title line";
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-164-docx-two-bold-section-lines.docx",
    truth:
      "The other side of the threshold: two bold 16-point lines over body text and no Heading styles anywhere — sections, not a title, and nothing marks them. A WCAG 1.3.1 failure (W3C F2): heading_structure must lose points and the verdict must name 1.3.1 against it.",
    build: () =>
      docx(
        [FAKE_HEADING("Findings"), P(BODY_TEXT), FAKE_HEADING("Next Steps"), P(BODY_TEXT)].join(""),
        { title: "Program Review" },
      ),
    check: (r) => {
      const c = cat("heading_structure")(r);
      if (!c || c.score === null) return "two section lines were not scored";
      if (c.score >= 100) return "two unmarked section headings scored 100";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "heading_structure",
      );
      return failing ? null : "points lost with no 1.3.1 failure attributed to heading_structure";
    },
  },
  {
    file: "synthetic-165-pptx-one-typed-title-no-titled-slides.pptx",
    truth:
      "A one-slide deck whose only heading is typed into a 32-point bold text box, with no title placeholder on any slide. The same rule as PDF and Word: with no heading markup anywhere, one heading-like line is a title, not sections. Until 2026-10-05 this cost 15 points (Minor, capping the deck at 89/B). slide_titles must stay at 100 with the lone title reported as an advisory, no criterion may be asserted against it, and the deck must be 100/A. Trap 145 — two typed headings — must still be caught.",
    build: () =>
      pptx(
        [
          SLIDE_FAKE_HEADING("Program Update") +
            SLIDE_BODY("Enrollment rose 12 percent this quarter."),
        ],
        { title: "Program Update" },
      ),
    check: (r) => {
      const c = cat("slide_titles")(r);
      if (!c || c.score === null) return "slide_titles unscored";
      if (c.score !== 100) return `a lone typed title cost ${100 - c.score} points`;
      if (!c.findings.some((f) => /^Advisory — not scored:.*single title/i.test(f)))
        return "the lone typed title is not reported as an advisory";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "slide_titles");
      if (failing) return "1.3.1 asserted against a single typed title";
      return r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-166-docx-typed-list-only.docx",
    truth:
      "A titled Word memo whose only list is three bullets typed by hand — no Bullets/Numbering formatting anywhere. A WCAG 1.3.1 failure, and the Word twin of PowerPoint's trap 152: since 2026-10-05 a list typed entirely by hand floors at the Moderate band in both (it scored 0, Critical, until then). list_structure must score exactly TYPED_LIST_FLOOR, the otherwise-clean memo must cap at 79/C, and the verdict must name 1.3.1 against list_structure.",
    build: () =>
      docx(
        [
          HEADING(1, "Application Checklist"),
          P(BODY_TEXT),
          TYPED_BULLET_P("A completed application form"),
          TYPED_BULLET_P("Two letters of support"),
          TYPED_BULLET_P("A signed budget summary"),
        ].join(""),
        { title: "Application Checklist" },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null) return "list_structure unscored";
      if (c.score !== TYPED_LIST_FLOOR)
        return `a wholly typed list scored ${c.score}, not the Moderate floor ${TYPED_LIST_FLOOR}`;
      if (r.overallScore !== 79) return `the memo graded ${r.overallScore}/${r.grade}, not 79/C`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "1.3.1" && String(f.category ?? "") === "list_structure",
      );
      return failing ? null : "points lost with no 1.3.1 failure attributed to list_structure";
    },
  },
  {
    file: "synthetic-167-pptx-default-title.pptx",
    truth:
      "A clean, titled deck whose document title is still \"PowerPoint Presentation\" — PowerPoint's own default, which every deck made from a template carrying it inherits (the agency template in the control corpus does). It names the program, not the document: WCAG failure F25 for 2.4.2. Until 2026-10-05 no format caught it — PDF's tool-default list lacked it, and Word, PowerPoint and Excel never checked titles at all. title_language must lose half the title credit (75), the verdict must name 2.4.2, and the deck must cap at 89/B.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Update") + SLIDE_BODY("Enrollment rose 12 percent this quarter."),
          SLIDE_TITLE("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { title: "PowerPoint Presentation" },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 75) return `PowerPoint's default title scored ${c.score}, not 75`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "2.4.2" && String(f.category ?? "") === "title_language",
      );
      if (!failing) return "the default title cost points with no 2.4.2 failure named";
      return r.overallScore === 89
        ? null
        : `the deck graded ${r.overallScore}/${r.grade}, not 89/B`;
    },
  },
  {
    file: "synthetic-168-docx-filename-title.docx",
    truth:
      'A Word memo whose title property is its own file name, "Final_Report_v3.docx" — F25\'s own example, "filenames that are not descriptive in their own right." PDF has scored this since the legal-only sweep; Word now does too (2026-10-05). title_language must lose half the title credit (75), the verdict must name 2.4.2, and the memo must cap at 89/B.',
    build: () =>
      docx([HEADING(1, "Contents Inside"), P(BODY_TEXT)].join(""), {
        title: "Final_Report_v3.docx",
      }),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 75) return `a file-name title scored ${c.score}, not 75`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some(
        (f) => String(f.sc ?? "") === "2.4.2" && String(f.category ?? "") === "title_language",
      );
      if (!failing) return "the file-name title cost points with no 2.4.2 failure named";
      return r.overallScore === 89
        ? null
        : `the memo graded ${r.overallScore}/${r.grade}, not 89/B`;
    },
  },
  {
    file: "synthetic-169-xlsx-filename-shaped-title.xlsx",
    truth:
      'A workbook titled "Grant_Ledger_FY26": file-name machinery (underscores) around real words that still name the workbook. As in PDF since 2026-09-02, that is a judgment for a person, not F25 — title_language must keep full credit with the title reported as an advisory, no criterion may be asserted, and the workbook must be 100/A.',
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Grants",
            rows: [
              ["Program", "Award"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
            table: { name: "Grants", ref: "A1:B3", headerRowCount: 1 },
          },
        ],
        { title: "Grant_Ledger_FY26" },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 100) return `a title that still names the workbook scored ${c.score}`;
      if (!c.findings.some((f) => /^Advisory — not scored:.*reads like a filename/i.test(f)))
        return "the file-name-shaped title is not reported as an advisory";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "title_language");
      if (failing) return "2.4.2 asserted against a title that names the workbook";
      return r.overallScore === 100 ? null : `the workbook graded ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-160-pptx-table-headerless.pptx",
    truth:
      "A titled slide carrying a real PowerPoint table whose Table Design → Header Row box is unticked, so no row is marked as the header (PowerPoint's only header mechanism). The first PowerPoint table trap: until 2026-10-05 this scored 30/Critical and capped the deck at 69/D, while the same table capped at 79/C as a PDF and 89/B in Excel. It must now score exactly the one value every format gives an unheadered data table (Moderate), the otherwise-clean deck must cap at 79/C, and the verdict must name WCAG 1.3.1 against table_markup.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Enrollment") +
            SLIDE_TABLE(
              [
                ["Program", "Participants", "Sites"],
                ["Job Training", "412", "6"],
                ["Housing Support", "268", "4"],
              ],
              false,
            ),
        ],
        { title: "Program Enrollment 2026" },
      ),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
  },
  {
    file: "synthetic-161-pptx-table-header-twin.pptx",
    truth:
      "The same slide and table with Table Design → Header Row ticked. table_markup must score a clean 100, the deck must be 100/A, no criterion may be asserted against table_markup, and it must never score below its unheadered twin.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Enrollment") +
            SLIDE_TABLE(
              [
                ["Program", "Participants", "Sites"],
                ["Job Training", "412", "6"],
                ["Housing Support", "268", "4"],
              ],
              true,
            ),
        ],
        { title: "Program Enrollment 2026" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `a table with Header Row ticked scored ${c.score}, not 100`;
      if (r.overallScore !== 100) return `the clean deck scored ${r.overallScore}/${r.grade}`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "table_markup");
      return failing ? "a criterion is asserted against a marked header row" : null;
    },
  },
  {
    file: "synthetic-157-docx-agenda-header-row-box.docx",
    truth:
      "Modeled on a real agency meeting agenda that graded D on 2026-10-05: a bordered roll-call table (bold first row of column labels, blank Present/Absent cells) with Table Design → Header Row ticked — Word's default for every table — and Repeat Header Rows never set. The checkbox is how Microsoft tells authors to mark a header row; its own Accessibility Checker accepts it and Word 365 tags that row <TH> in a saved PDF. This checker accepted only Repeat Header Rows, so the agenda lost its grade for following Microsoft's instructions. table_markup must score 100, the document must be 100/A, and no criterion may be asserted against table_markup.",
    build: () => agendaDocx(docxRollCallTable({ look: LOOK_HEADER_ROW_ON, repeatHeader: false })),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `Header Row ticked, yet the table scored ${c.score}`;
      if (r.overallScore !== 100) return `the clean agenda scored ${r.overallScore}/${r.grade}`;
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "table_markup");
      return failing
        ? "1.3.1 asserted against a header row marked the way Microsoft documents"
        : null;
    },
  },
  {
    file: "synthetic-158-docx-agenda-header-row-unticked.docx",
    truth:
      "The same agenda with Table Design → Header Row unticked and no Repeat Header Rows — the roll-call table's header row is marked by nothing at all, only bolded. A real WCAG 1.3.1 failure: it must score exactly the one value every format gives an unheadered data table (Moderate), the otherwise-clean agenda must cap at 79/C, and the verdict must name 1.3.1 against table_markup.",
    build: () => agendaDocx(docxRollCallTable({ look: LOOK_HEADER_ROW_OFF, repeatHeader: false })),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
  },
  {
    file: "synthetic-159-docx-agenda-repeat-header-rows.docx",
    truth:
      "The same agenda with Header Row unticked but Table Layout → Repeat Header Rows set on the first row — the older route, and the one Word 2016 and earlier needed before a saved PDF would mark the row. Either route marks the header: table_markup must score 100, the document must be 100/A, and it must never score below the unmarked twin.",
    build: () => agendaDocx(docxRollCallTable({ look: LOOK_HEADER_ROW_OFF, repeatHeader: true })),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `Repeat Header Rows set, yet the table scored ${c.score}`;
      return r.overallScore === 100 ? null : `the clean agenda scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-162-docx-pasted-borderless-grid.docx",
    truth:
      'The same grid pasted from a web page with every border stripped and Header Row unticked: a bare layout grid, except that every cell and run still carries the paste\'s <w:shd w:fill="auto"/> — the explicit mark for NO shading. Counting that element as shading made such grids read as styled data tables, which are scored and accused of WCAG 1.3.1 (found 2026-10-05). It must stay a layout grid: table_markup at 100 with the bare-grid advisory, no criterion asserted against table_markup, and the document 100/A.',
    build: () =>
      agendaDocx(
        docxRollCallTable({ look: LOOK_HEADER_ROW_OFF, repeatHeader: false, borders: false }),
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `a pasted layout grid was scored ${c.score} as a data table`;
      if (!/bare grid/i.test(allFindings(r))) return "the bare-grid advisory did not fire";
      const failing = (
        r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } }
      ).conformance?.failures?.some((f) => String(f.category ?? "") === "table_markup");
      if (failing) return "1.3.1 asserted against a layout grid";
      return r.overallScore === 100 ? null : `the document scored ${r.overallScore}/${r.grade}`;
    },
  },
  // ---- v1.160.0: the smaller cross-format inconsistencies (2026-10-05) ----
  {
    file: "synthetic-170-pptx-bare-layout-grid.pptx",
    truth:
      "A titled agenda slide whose times and items are lined up in a table stripped bare — no table style, no borders, no fill, Header Row unticked — the way an author uses an invisible table to line things up. Word has never scored or gated a bare grid like this (looksLikeLayout); PowerPoint scored it as an unheadered data table — 45, WCAG 1.3.1 asserted, the deck capped at 79/C (found 2026-10-05 by comparing the same defect across all four formats). It must stay a layout grid: table_markup at 100 with the bare-grid advisory, no criterion asserted against table_markup, and the deck 100/A. Trap 160 — a styled table with no header row — must still be caught.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Meeting Agenda") +
            SLIDE_TABLE(
              [
                ["9:00", "Welcome and roll call"],
                ["9:15", "Budget update"],
                ["10:00", "Public comment"],
              ],
              false,
              true,
            ),
        ],
        { title: "Task Force Meeting Agenda" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score === null) return "table_markup unscored";
      if (c.score !== 100) return `a bare layout grid was scored ${c.score} as a data table`;
      if (!/bare grid/i.test(allFindings(r))) return "the bare-grid advisory did not fire";
      if (accused(r, "table_markup")) return "1.3.1 asserted against a layout grid";
      return r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-171-xlsx-light-text-no-fill.xlsx",
    truth:
      "A grant ledger typed in light grey (#BFBFBF — 1.8:1 against white) straight onto the plain grid, with no cell fill. A cell with no fill shows Excel's white grid, just as unshaded Word text sits on the white page — and Word has always checked that text against white. Excel left every no-fill cell unresolved, so this confirmed WCAG 1.4.3 failure was never caught in a workbook (until 2026-10-05). Every checked cell format fails, so color_contrast must score 0, the finding must name white as the background, and the verdict must name 1.4.3 against color_contrast.",
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Grants",
            rows: [
              ["Program", "Award"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
            table: { name: "Grants", ref: "A1:B3", headerRowCount: 1 },
          },
        ],
        { title: "FY26 Grant Ledger", fontArgb: "FFBFBFBF" },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null)
        return "color_contrast was not assessed — the plain grid is white";
      if (c.score !== 0) return `light grey on every cell scored ${c.score}, not 0`;
      if (!/#BFBFBF on #FFFFFF/i.test(c.findings.join(" ")))
        return "the finding does not name white as the background";
      return names(r, "1.4.3", "color_contrast")
        ? null
        : "points lost with no 1.4.3 failure attributed to color_contrast";
    },
  },
  {
    file: "synthetic-172-xlsx-dark-text-no-fill-twin.xlsx",
    truth:
      "The same ledger typed in near-black (#1F1F1F — 16.6:1) on the same plain grid. Now that a no-fill cell is checked against white, this must be checked and pass: color_contrast 100, nothing asserted against it, the workbook 100/A — and it must never score below its light-grey twin.",
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Grants",
            rows: [
              ["Program", "Award"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
            table: { name: "Grants", ref: "A1:B3", headerRowCount: 1 },
          },
        ],
        { title: "FY26 Grant Ledger", fontArgb: "FF1F1F1F" },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null)
        return "color_contrast was not assessed — the plain grid is white";
      if (c.score !== 100) return `near-black on white scored ${c.score}`;
      if (accused(r, "color_contrast")) return "1.4.3 asserted against 16.6:1 text";
      return r.overallScore === 100 ? null : `the workbook scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-173-docx-spanish-declared-english.docx",
    truth:
      "A public notice written entirely in Spanish whose only declared language is English (en-US) — no run, style or default marks any Spanish. A screen reader follows the declaration and reads every Spanish word with English pronunciation: WCAG 3.1.1 failing in the most literal way. PDF has caught this since 2026-08-29 (trap 118); Word and PowerPoint gave any declaration full credit (until 2026-10-05). title_language must lose half the language credit (75), the finding must say the text reads as Spanish, and the verdict must name 3.1.1 against title_language.",
    build: () =>
      docx([HEADING(1, "Aviso de reunión pública"), ...SPANISH_NOTICE.map(P)].join(""), {
        title: "Aviso de reunión pública",
        styles: true,
      }),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 75) return `Spanish declared as English scored ${c.score}, not 75`;
      if (!/reads as Spanish/.test(c.findings.join(" ")))
        return "the finding does not say the text reads as Spanish";
      return names(r, "3.1.1", "title_language")
        ? null
        : "points lost with no 3.1.1 failure attributed to title_language";
    },
  },
  {
    file: "synthetic-174-docx-spanish-marked-es-twin.docx",
    truth:
      "The same notice, still declared en-US at document level, with its text marked Spanish (es-ES) — what Word's automatic language detection, or Review → Language → Set Proofing Language on the selection, writes. A screen reader switches to Spanish wherever the file says so, so nothing is wrong: title_language 100, nothing asserted against it, the document 100/A, and never below the unmarked twin. This is the guard that keeps the check from accusing every document Word's autodetect has already handled.",
    build: () =>
      docx(
        [
          HEADING_LANG(1, "Aviso de reunión pública", "es-ES"),
          ...SPANISH_NOTICE.map((t) => P_LANG(t, "es-ES")),
        ].join(""),
        { title: "Aviso de reunión pública", styles: true },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 100) return `Spanish marked Spanish scored ${c.score}`;
      if (accused(r, "title_language")) return "3.1.1 asserted against text marked in its language";
      return r.overallScore === 100 ? null : `the notice scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-175-pptx-corrupt-core.pptx",
    truth:
      'A clean two-slide deck whose document-properties part (docProps/core.xml) is damaged and cannot be parsed. A part that cannot be read says nothing about the title — Word has scored that half as not assessed since 2026-09-01 — but PowerPoint and Excel read the same part with no such guard, so a damaged part became a confirmed "no presentation title" and a WCAG 2.4.2 failure about a title the checker never saw (found 2026-10-05). title_language must keep the title half (100), the finding must say the title could not be read, no 2.4.2 may be asserted, and the deck must be 100/A.',
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Update") + SLIDE_BODY("Enrollment rose 12 percent this quarter."),
          SLIDE_TITLE("Next Steps") + SLIDE_BODY("Budget review in March."),
        ],
        { coreXml: "<cp:coreProperties <<< damaged in transit" },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 100) return `an unreadable title was scored as missing (${c.score})`;
      if (!/could not be read/i.test(c.findings.join(" ")))
        return "the report does not say the title could not be read";
      if (names(r, "2.4.2", "title_language"))
        return "2.4.2 asserted against a title the checker never saw";
      return r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-176-docx-header-logo-no-alt.docx",
    truth:
      "A memo with a described chart in the body and the agency logo in the page header with no alt text — the commonest image in an agency document. An undescribed logo is still an undescribed image, so it stays scored (alt_text 50: one of two images described, 1.1.1 named), but since 2026-10-05 the report says it is in the header and how to clear a purely decorative logo — mark it decorative — and why the PDF of the same memo may not flag it: Word's PDF export marks header content as page decoration.",
    build: () =>
      docx(
        [
          HEADING(1, "Quarterly Program Report"),
          P(BODY_TEXT),
          DRAWING(2, "Bar chart of enrollment by quarter, rising from 120 to 180"),
        ].join(""),
        { title: "Quarterly Program Report", styles: true, headerXml: DRAWING(1) },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score === null) return "alt_text unscored";
      if (c.score !== 50) return `one of two images described scored ${c.score}, not 50`;
      const f = c.findings.join(" ");
      if (!/1 of them is in a page header or footer/.test(f))
        return "the header logo is not located in the report";
      if (!/Mark as decorative/.test(f)) return "the decorative route is not explained";
      return names(r, "1.1.1", "alt_text")
        ? null
        : "points lost with no 1.1.1 failure attributed to alt_text";
    },
  },
  {
    file: "synthetic-177-docx-header-logo-decorative-twin.docx",
    truth:
      "The same memo with the header logo marked decorative (Alt Text → Mark as decorative). A decorative image needs no description: alt_text 100 with no header advice, nothing asserted against it, the memo 100/A, and never below its undescribed twin.",
    build: () =>
      docx(
        [
          HEADING(1, "Quarterly Program Report"),
          P(BODY_TEXT),
          DRAWING(2, "Bar chart of enrollment by quarter, rising from 120 to 180"),
        ].join(""),
        { title: "Quarterly Program Report", styles: true, headerXml: DECORATIVE_DRAWING(1) },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score === null) return "alt_text unscored";
      if (c.score !== 100) return `a decorative header logo still cost ${100 - c.score} points`;
      if (/header or footer/.test(c.findings.join(" ")))
        return "header advice given for a logo already marked decorative";
      if (accused(r, "alt_text")) return "1.1.1 asserted against a decorative logo";
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-178-docx-16-of-23-images-described.docx",
    truth:
      "A report with 23 images, 16 of them described — 69.6 percent. PDF has always floored that share to 69: Moderate, a C ceiling. Word, PowerPoint and Excel rounded it to 70 — Minor, a B ceiling — and capped any failing share at 85, so the same images graded a letter apart by format (found 2026-10-05). Every format now scores alt text and link names by one rule (shareScore): alt_text must be exactly 69, the otherwise-clean report must cap at 79/C, and the verdict must name 1.1.1 against alt_text.",
    build: () =>
      docx(
        [
          HEADING(1, "Annual Program Report"),
          P(BODY_TEXT),
          ...Array.from({ length: 23 }, (_, i) =>
            DRAWING(i + 1, i < 16 ? `Chart ${i + 1}: enrollment by county` : undefined),
          ),
        ].join(""),
        { title: "Annual Program Report", styles: true },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score === null) return "alt_text unscored";
      if (c.score !== 69) return `16 of 23 described scored ${c.score}, not PDF's 69`;
      if (r.overallScore !== 79) return `the report graded ${r.overallScore}/${r.grade}, not 79/C`;
      return names(r, "1.1.1", "alt_text")
        ? null
        : "points lost with no 1.1.1 failure attributed to alt_text";
    },
  },
  // ---- table traps, written before any fix (2026-10-06) ----
  {
    file: "synthetic-186-docx-borders-explicitly-none.docx",
    truth:
      'An agenda lined up in a Word table whose every border is explicitly switched off — <w:tblBorders> with w:val="nil" on each edge, the way Google Docs, LibreOffice and pasted web content write an invisible grid. No style, no header row, nothing drawn: a bare layout grid. The marks mean NO border, exactly as v1.157.0\'s "no shading" marks meant no shading, and counting them as styling made the grid a data table accused of 1.3.1. It must stay a layout grid: table_markup 100 with the bare-grid advisory, nothing asserted, 100/A.',
    build: () => tableMemo(wordGrid(AGENDA_ROWS, { tblPr: NIL_BORDERS })),
    check: layoutGridHeld,
  },
  {
    file: "synthetic-187-docx-style-draws-nothing.docx",
    truth:
      'The same agenda grid carrying a named table style that draws nothing — "a", based on Word\'s own Normal Table, the shape Google Docs exports. No border, no shading, no header row anywhere: on the page it is a bare grid. Any named style used to make a table a data table; a style that draws nothing is no style. It must stay a layout grid: table_markup 100 with the bare-grid advisory, nothing asserted, 100/A.',
    build: () =>
      tableMemo(wordGrid(AGENDA_ROWS, { tblPr: '<w:tblStyle w:val="a"/>' }), TABLE_STYLES),
    check: layoutGridHeld,
  },
  {
    file: "synthetic-188-docx-cell-borders-no-header.docx",
    truth:
      "A data table drawn with borders on every CELL (<w:tcBorders>) instead of at table level, no table style, and no header row marked. It is a visible grid of data on the page, but only table-level borders were ever checked, so it passed as a layout grid and its missing header row — a real WCAG 1.3.1 failure — was never reported. It must score exactly the one value every format gives an unheadered data table (Moderate), cap the memo at 79/C, and name 1.3.1 against table_markup.",
    build: () => tableMemo(wordGrid(DATA_ROWS, { tcPr: CELL_BORDERS })),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
  },
  {
    file: "synthetic-189-docx-cell-borders-header-twin.docx",
    truth:
      "The same cell-bordered data table with Table Design → Header Row ticked. table_markup must score a clean 100, nothing may be asserted against it, the memo must be 100/A, and it must never score below its unmarked twin.",
    build: () => tableMemo(wordGrid(DATA_ROWS, { tcPr: CELL_BORDERS, look: LOOK_HEADER_ROW_ON })),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score !== 100) return `a marked header row scored ${c?.score}`;
      if (accused(r, "table_markup")) return "1.3.1 asserted against a marked header row";
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-190-docx-table-grid-style-no-header.docx",
    truth:
      "A data table whose borders come from Word's own Table Grid style — the style every Insert → Table uses — with no header row marked. The table carries no border of its own; the style draws them. A style that draws nothing is no style, but this one draws a full grid, so the table is data and its missing header row is a WCAG 1.3.1 failure: the one unheadered-table value (Moderate), 79/C, 1.3.1 named. The guard that keeps the style rule from exempting real tables.",
    build: () =>
      tableMemo(wordGrid(DATA_ROWS, { tblPr: '<w:tblStyle w:val="TableGrid"/>' }), TABLE_STYLES),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
  },
  // ---- table traps round 2: headers that label nothing (2026-10-06) ----
  {
    file: "synthetic-196-docx-empty-header-row.docx",
    truth:
      "A bordered Word data table with Table Design → Header Row ticked — but every cell of that header row empty. The header structure exists, so WCAG 1.3.1 is met on paper and nothing is scored (user decision, 2026-10-06), but a screen reader announces no header for those columns. table_markup stays 100, the advisory names the empty header row, nothing is asserted, 100/A.",
    build: () =>
      tableMemo(
        wordGrid(
          [
            ["", "", ""],
            ["Job Training", "412,000", "6"],
            ["Housing Support", "268,000", "4"],
          ],
          { tcPr: CELL_BORDERS, look: LOOK_HEADER_ROW_ON },
        ),
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score !== 100) return `an empty header row changed the score (${c?.score})`;
      if (
        !/Advisory — not scored:.*header row whose cells are all empty/.test(c.findings.join(" "))
      )
        return "the empty header row was not reported";
      if (accused(r, "table_markup")) return "a criterion asserted against a marked header row";
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-197-pptx-empty-header-row.pptx",
    truth:
      "A PowerPoint table with Header Row ticked and every cell of that row empty. Reported, not scored (user decision, 2026-10-06): table_markup 100, the advisory names the empty header row, nothing asserted, 100/A.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Enrollment") +
            SLIDE_TABLE(
              [
                ["", "", ""],
                ["Job Training", "412", "6"],
                ["Housing Support", "268", "4"],
              ],
              true,
            ),
        ],
        { title: "Program Enrollment 2026" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score !== 100) return `an empty header row changed the score (${c?.score})`;
      if (
        !/Advisory — not scored:.*header row whose cells are all empty/.test(c.findings.join(" "))
      )
        return "the empty header row was not reported";
      if (accused(r, "table_markup")) return "a criterion asserted against a marked header row";
      return r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-198-xlsx-default-column-names.xlsx",
    truth:
      'A defined Excel table whose header row still carries the names Excel invents when a range becomes a table without one — "Column1", "Column2". The header row exists, so WCAG 1.3.1 is met on paper and nothing is scored (user decision, 2026-10-06), but the names say nothing about the columns. table_markup stays 100, the advisory names the default names, nothing is asserted, 100/A.',
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Grants",
            rows: [
              ["Column1", "Column2"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
            table: {
              name: "Grants",
              ref: "A1:B3",
              headerRowCount: 1,
              columns: ["Column1", "Column2"],
            },
          },
        ],
        { title: "FY26 Grant Ledger" },
      ),
    check: (r) => {
      const c = cat("table_markup")(r);
      if (!c || c.score !== 100) return `default header names changed the score (${c?.score})`;
      if (!/Advisory — not scored:.*default header names.*Column1/.test(c.findings.join(" ")))
        return "the default header names were not reported";
      if (accused(r, "table_markup")) return "a criterion asserted against a marked header row";
      return r.overallScore === 100 ? null : `the workbook scored ${r.overallScore}/${r.grade}`;
    },
  },
  // ---- the Office encoding gate's finds (2026-10-06) ----
  // scripts/office-encoding-invariance.ts re-writes one Word document, one
  // deck and one workbook in every legal encoding of the same meaning. Its
  // first run found these seven; each trap pins one, in the form a real file
  // carries it.
  {
    file: "synthetic-199-pptx-alt-text-only-line-breaks.pptx",
    truth:
      'Two pictures on one slide. The first is described the way PowerPoint writes a description that contains line breaks — "A bar chart of awards by program&#xA;&#xA;Description automatically generated", each break as the character reference &#xA;. The second picture\'s description is NOTHING but two line breaks. XML requires character references decoded; the parser kept them as literal text, so every such description carried "&#xA;", and a description made only of line breaks counted as a description (found by the Office encoding-invariance gate, 2026-10-06). One of the two pictures is described: alt_text 50, and 1.1.1 is named.',
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Photos") +
            SLIDE_PIC(
              4,
              "A bar chart of awards by program&#xA;&#xA;Description automatically generated",
            ) +
            SLIDE_PIC(5, "&#xA;&#xA;"),
        ],
        { title: "Program Photos 2026" },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score !== 50)
        return `alt_text ${c?.score}, not 50 — a description of only line breaks counted, or the real one did not`;
      return names(r, "1.1.1", "alt_text")
        ? null
        : "the undescribed picture was not named under 1.1.1";
    },
  },
  {
    file: "synthetic-200-docx-utf16-parts.docx",
    truth:
      'An accessible Word memo — titled, in English, with a real heading and plain prose — whose every XML part is encoded as UTF-16 with a byte order mark. The Open Packaging Conventions allow UTF-8 or UTF-16, and Word reads both; the checker decoded every part as UTF-8, so the file was refused outright as "not a supported document" (found by the Office encoding-invariance gate, 2026-10-06). It must be read exactly as its UTF-8 self is: title and language found, 100/A.',
    build: async () =>
      rewritePackage(
        await docx([HEADING(1, "Program Update"), P(BODY_TEXT), P(BODY_TEXT)].join(""), {
          title: "Program Update",
          styles: true,
        }),
        (_n, xml) =>
          Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'), "utf16le"),
          ]),
      ),
    check: (r) => {
      const t = cat("title_language")(r);
      if (!t || t.score !== 100)
        return `title_language ${t?.score} — the UTF-16 parts were not read`;
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-201-docx-bold-switched-off.docx",
    truth:
      'A Word memo with a short 14-pt line that is NOT bold, written the way python-docx writes run.bold = False: <w:b w:val="0"/>, bold switched off (verified against python-docx 1.2.0). The parser took the element\'s presence for bold, so every such line was reported as a heading typed as text, a 1.3.1 deduction on a document with nothing wrong (found by the Office encoding-invariance gate, 2026-10-06). Not bold, so not a typed heading: heading_structure 100, 100/A.',
    build: () =>
      docx(
        [
          HEADING(1, "Program Update"),
          P(BODY_TEXT),
          '<w:p><w:r><w:rPr><w:b w:val="0"/><w:sz w:val="28"/></w:rPr><w:t>Questions? Call the program office.</w:t></w:r></w:p>',
          P(BODY_TEXT),
        ].join(""),
        { title: "Program Update", styles: true },
      ),
    check: (r) => {
      const h = cat("heading_structure")(r);
      if (!h || h.score !== 100)
        return `heading_structure ${h?.score} — a line with bold switched off was read as a typed heading`;
      return r.overallScore === 100 ? null : `the memo scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-202-xlsx-bold-switched-off.xlsx",
    truth:
      "A workbook whose every cell is set in 14-pt grey (#808080, 3.95:1 on the white grid), with bold explicitly switched OFF: <b val=\"0\"/>. Fourteen-point text is large only when it is bold, so this is normal text and fails WCAG 1.4.3's 4.5:1. The parser took the element's presence for bold and passed it as large text, so a contrast failure was missed — the more damaging direction (found by the Office encoding-invariance gate, 2026-10-06). The failure is scored and 1.4.3 is named.",
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Awards",
            rows: [
              ["Program", "Award"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
          },
        ],
        { title: "FY26 Awards", fontArgb: "FF808080", fontProps: '<b val="0"/><sz val="14"/>' },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null || c.score >= 100)
        return `color_contrast ${c?.score} — 14-pt text with bold switched off passed as large`;
      return names(r, "1.4.3", "color_contrast") ? null : "1.4.3 was not named";
    },
  },
  {
    file: "synthetic-203-pptx-true-and-false-spelled-out.pptx",
    truth:
      'A two-slide deck that spells its switches the schema\'s other way: a rule picture marked decorative with val="true" (not "1"), and a second slide hidden with show="false" (not "0") — untitled, holding a 32-pt bold text box of draft notes. Both are xsd:boolean values and mean exactly what "1" and "0" mean. The parser compared against "1" and "0" only, so the decorative picture read as an undescribed image and the hidden slide was judged for its missing title and typed heading (found by the Office encoding-invariance gate, 2026-10-06). Neither may count: nothing asserted, 100/A.',
    build: async () =>
      rewritePackage(
        await pptx(
          [
            SLIDE_TITLE("Program Update") +
              SLIDE_BODY(BODY_TEXT) +
              '<p:pic><p:nvPicPr><p:cNvPr id="6" name="Picture 5"><a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="true"/></a:ext></a:extLst></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr></p:pic>',
            SLIDE_FAKE_HEADING("Draft notes for the board"),
          ],
          { title: "Program Update 2026" },
        ),
        (n, xml) =>
          n === "ppt/slides/slide2.xml" ? xml.replace("<p:sld ", '<p:sld show="false" ') : xml,
      ),
    check: (r) =>
      noAccusation(r) ??
      (r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`),
  },
  {
    file: "synthetic-204-pptx-slide-order-written-differently.pptx",
    truth:
      "A three-slide deck whose slide parts are not stored in the order shown: slide2.xml is shown first and the untitled slide3.xml second. Its slide list is written r:id before id, and its relationship targets are absolute part names (/ppt/slides/slide3.xml). Attribute order means nothing in XML, and OPC allows absolute targets, but with namespace prefixes stripped only the last of a slide's two ids survived, and an absolute target resolved to ppt/ppt/…. Either way the checker silently fell back to file-name order and named the wrong slide (found by the Office encoding-invariance gate, 2026-10-06). The untitled slide is the second one shown: the advisory names slide 2, never slide 3.",
    build: async () =>
      rewritePackage(
        await pptx(
          [
            SLIDE_TITLE("Budget") + SLIDE_BODY(BODY_TEXT),
            SLIDE_TITLE("Welcome") + SLIDE_BODY(BODY_TEXT),
            SLIDE_BODY(BODY_TEXT),
          ],
          { title: "Board Briefing 2026" },
        ),
        (n, xml) => {
          if (n === "ppt/presentation.xml")
            return xml.replace(
              /<p:sldIdLst>.*<\/p:sldIdLst>/s,
              '<p:sldIdLst><p:sldId r:id="rId2" id="256"/><p:sldId r:id="rId3" id="257"/><p:sldId r:id="rId1" id="258"/></p:sldIdLst>',
            );
          if (n === "ppt/_rels/presentation.xml.rels")
            return xml.replace(/Target="slides\//g, 'Target="/ppt/slides/');
          return xml;
        },
      ),
    check: (r) => {
      const t = allFindings(r);
      if (/slide 3 has/i.test(t))
        return "the report named slide 3 — file-name order, not the order shown";
      return /slide 2 has/i.test(t)
        ? null
        : "the untitled slide was not named as slide 2, the one shown second";
    },
  },
  {
    file: "synthetic-205-xlsx-no-cell-references.xlsx",
    truth:
      'A workbook written without the optional r= references on its rows and cells, which is legal: each row follows the last, and each cell the one before. Its one link sits on a cell reading "Click here". The parser located cells only by their r= attribute, so it never found the link\'s cell, and link quality went unassessed (found by the Office encoding-invariance gate, 2026-10-06). The cell is found by its position: the link is assessed, and its vague text is reported as the not-scored advisory every format gives it.',
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Awards",
            rows: [["Program", "Award"], ["Job Training", "412,000"], ["Click here"]],
            links: [{ ref: "A3", url: "https://example.org/guidelines" }],
          },
        ],
        { title: "FY26 Awards", cellRefs: false },
      ),
    check: (r) => {
      const c = cat("link_quality")(r);
      if (!c || c.score === null) return "link_quality unassessed — the link's cell was not found";
      return /Advisory — not scored.*"Click here"/.test(c.findings.join(" "))
        ? null
        : "the vague link text was not reported";
    },
  },
  // ---- plan step 3: producer-shaped traps (2026-10-06) ----
  // Each is built in the shape a real producer writes, taken from files
  // generated with it — LibreOffice 26.2, python-docx 1.2.0, python-pptx
  // 1.0.2, openpyxl 3.1.5, docx.js 9.8.1 — or from a real Google Slides
  // export in the test set.
  {
    file: "synthetic-206-pptx-typed-bullets-layout-bullets-off.pptx",
    truth:
      'A slide whose points are TYPED — a "•" and a tab before each line — in a placeholder whose LAYOUT switches bullets off (<a:buNone/> in the layout\'s list style): the pattern of a real agency deck in the test set. PowerPoint shows no automatic bullet there, so this is a hand-typed list that a screen reader does not announce as one. The parser read the master alone, whose body style bullets every level, and counted the four lines as real list items — list_structure 100, a typed list missed (found building the plan step 3 decks, 2026-10-06). Read through the layout, it is a typed list: list_structure loses points and 1.3.1 is named.',
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Requests to watch for") +
            PH_SP(3, '<p:ph sz="quarter" idx="15"/>', [
              "•\tRequests to alter the language of grant applications.",
              "•\tRequests to alter the scope of programs.",
              "•\tRequests to sign a certification of compliance.",
              "•\tRequests to include new conditions in agreements.",
            ]),
        ],
        {
          title: "Federal Communications Guidance",
          ...deckChain({
            master: PPT_MASTER({ bg: BGREF_BG1 }),
            layouts: [
              PPT_LAYOUT(
                LAYOUT_PH('<p:ph sz="quarter" idx="15"/>', {
                  lstStyle: '<a:lvl1pPr marL="0" indent="0"><a:buNone/></a:lvl1pPr>',
                }),
              ),
            ],
            slideLayouts: [1],
          }),
        },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!c || c.score === null || c.score >= 100)
        return `list_structure ${c?.score} — typed bullets under a layout's buNone were counted as a real list`;
      return names(r, "1.3.1", "list_structure") ? null : "1.3.1 was not named";
    },
  },
  {
    file: "synthetic-207-pptx-python-pptx-default-template.pptx",
    truth:
      "A deck on python-pptx's default template — PowerPoint's own layouts: a Title Slide whose subtitle placeholder has bullets switched off in its layout, a Title and Content slide whose three body lines inherit the master's bullets, and a slide-number placeholder, which takes the master's bullet-free \"other\" style. The parser read the master alone and counted the subtitle and the slide number as list items too — five where there are three (found building the python-pptx report, 2026-10-06). Exactly three real list items, nothing typed, 100/A.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Grant Program Update").replace('type="title"', 'type="ctrTitle"') +
            PH_SP(3, '<p:ph type="subTitle" idx="1"/>', ["Fiscal year 2026 results for the board"]),
          SLIDE_TITLE("Program results") +
            PH_SP(3, '<p:ph idx="1"/>', [
              "Job training sites opened in six counties.",
              "Housing support reached four hundred families.",
              "Every award was reviewed before approval.",
            ]) +
            PH_SP(4, '<p:ph type="sldNum" sz="quarter" idx="12"/>', ["2"]),
        ],
        {
          title: "Grant Program Update 2026",
          ...deckChain({
            master: PPT_MASTER({ bg: BGREF_BG1 }),
            layouts: [
              PPT_LAYOUT(
                LAYOUT_PH('<p:ph type="ctrTitle"/>') +
                  LAYOUT_PH('<p:ph type="subTitle" idx="1"/>', {
                    lstStyle: '<a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/></a:lvl1pPr>',
                  }),
              ),
              PPT_LAYOUT(
                LAYOUT_PH('<p:ph type="title"/>') +
                  LAYOUT_PH('<p:ph idx="1"/>') +
                  LAYOUT_PH('<p:ph type="sldNum" sz="quarter" idx="12"/>'),
              ),
            ],
            slideLayouts: [1, 2],
          }),
        },
      ),
    check: (r) => {
      const c = cat("list_structure")(r);
      if (!/\b3 real list item/.test(c?.findings.join(" ") ?? ""))
        return `the list census reads "${c?.findings[0]}" — the subtitle or slide number was counted`;
      return r.overallScore === 100 ? null : `the deck scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-208-pptx-google-slides-file-name-alt.pptx",
    truth:
      'Two slide pictures as Google Slides exports them when nobody described them: each "description" is the uploaded file\'s name ("GA details.png", "GA real time events.png") — a real Google Slides deck in the test set carries nine. A file name is not a description (WCAG failure F30; user decision 2026-10-06, "count it as missing"): alt_text 0, 1.1.1 named, and the finding quotes the file names.',
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Google Analytics reports") +
            SLIDE_PIC(4, "GA details.png") +
            SLIDE_PIC(5, "GA real time events.png"),
        ],
        { title: "Analytics Training" },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score !== 0)
        return `alt_text ${c?.score}, not 0 — a file name counted as a description`;
      if (!/GA details\.png/.test(c.findings.join(" ")))
        return "the finding does not name the file name";
      return names(r, "1.1.1", "alt_text") ? null : "1.1.1 was not named";
    },
  },
  {
    file: "synthetic-209-xlsx-openpyxl-picture-alt.xlsx",
    truth:
      'A workbook with a chart image added by openpyxl, which writes descr="Picture" on every image it saves (its own source, 3.1.5) — so every openpyxl or pandas report reads as described until someone writes a description. "Picture" is a placeholder, not a description (WCAG failure F30; user decision 2026-10-06): alt_text 0, 1.1.1 named, and the finding quotes "Picture".',
    build: () =>
      xlsx(
        [
          {
            name: "FY26 Awards",
            rows: [
              ["Program", "Award"],
              ["Job Training", "412,000"],
              ["Housing Support", "268,000"],
            ],
            pictures: ["Picture"],
          },
        ],
        { title: "FY26 Awards" },
      ),
    check: (r) => {
      const c = cat("alt_text")(r);
      if (!c || c.score !== 0)
        return `alt_text ${c?.score}, not 0 — "Picture" counted as a description`;
      if (!/"Picture"/.test(c.findings.join(" ")))
        return "the finding does not name the placeholder";
      return names(r, "1.1.1", "alt_text") ? null : "1.1.1 was not named";
    },
  },
  {
    file: "synthetic-211-pptx-grey-text-on-the-masters-white.pptx",
    truth:
      "Grey text (#999999, 2.85:1) in a text box on a slide that declares no background of its own: it shows its master's — a theme reference (bgRef 1001, bg1) that resolves to white, the default in PowerPoint's and python-pptx's templates. Contrast on such slides was never assessed (user decision 2026-10-06: follow the background to the layout and master). It is now, and the failure is caught: 1.4.3 named.",
    build: () =>
      pptx([SLIDE_TITLE("Notes") + COLOR_BOX("Figures in gray are estimates.", "999999", 1800)], {
        title: "Program Notes",
        ...deckChain({
          master: PPT_MASTER({ bg: BGREF_BG1 }),
          layouts: [
            PPT_LAYOUT(
              LAYOUT_PH('<p:ph type="title"/>', { xfrm: XFRM(838200, 365125, 10515600, 1325563) }),
            ),
          ],
          slideLayouts: [1],
        }),
      }),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null || c.score >= 100)
        return `color_contrast ${c?.score} — grey text on the master's white was not caught`;
      return names(r, "1.4.3", "color_contrast") ? null : "1.4.3 was not named";
    },
  },
  {
    file: "synthetic-212-pptx-white-text-dark-template.pptx",
    truth:
      "White text on a dark template: the master's colour map sends bg1 to the theme's dark colour (bg1=\"dk1\", a navy #1F3864), and its background references bg1, so every slide is navy. Following the background must resolve it through the colour map — reading bg1 as white would accuse the white text of 1:1, the false failure the 2026-09-01 fix ended. The white text passes: color_contrast 100, nothing asserted.",
    build: () =>
      pptx([SLIDE_TITLE("Program Update") + COLOR_BOX("Questions for the board", "FFFFFF", 1800)], {
        title: "Program Update 2026",
        ...deckChain({
          master: PPT_MASTER({
            bg: BGREF_BG1,
            clrMap: STD_CLRMAP.replace('bg1="lt1" tx1="dk1"', 'bg1="dk1" tx1="lt1"'),
          }),
          theme: OFFICE_THEME("1F3864"),
          layouts: [
            PPT_LAYOUT(
              LAYOUT_PH('<p:ph type="title"/>', { xfrm: XFRM(838200, 365125, 10515600, 1325563) }),
            ),
          ],
          slideLayouts: [1],
        }),
      }),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score !== 100)
        return `color_contrast ${c?.score} — white text on the dark template was misjudged or not assessed`;
      return noAccusation(r);
    },
  },
  {
    file: "synthetic-213-pptx-title-in-the-bands-own-colour.pptx",
    truth:
      "A Google Slides layout paints a blue band (#304FFE) across the top of every slide; on this slide a second title is typed in the band's own blue on top of it, beside the visible white one — the pattern of a real Google Slides deck in the test set, whose screen-reader title differs from the one on screen. Text the colour of what lies beneath it is the real 1:1 case (trap 150 pins the same), and following the background through the layout now sees the band: 1.4.3 named, the 1:1 run reported.",
    build: () => {
      const title = (text: string, hex: string, id: number) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Google Shape;${id};p15"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${XFRM(311700, 170820, 8520600, 572700)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en" sz="3600" b="1"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
      const band = `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Google Shape;9;p2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${XFRM(-11200, -37824, 9155100, 1018500)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="304FFE"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
      return pptx(
        [
          title("Progressive Enhancement", "304FFE", 76) +
            title("Discoverability and progressive web apps", "FAFAFA", 77),
        ],
        {
          title: "Web Strategy",
          ...deckChain({
            master: PPT_MASTER({ bg: SOLID_BG("FFFFFF") }),
            layouts: [
              PPT_LAYOUT(
                band +
                  LAYOUT_PH('<p:ph type="title"/>', {
                    xfrm: XFRM(311700, 170820, 8520600, 572700),
                  }),
              ),
            ],
            slideLayouts: [1],
          }),
        },
      );
    },
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null || c.score >= 100)
        return `color_contrast ${c?.score} — the title in the band's own colour was not caught`;
      if (!/\b1:1\b|Lowest contrast 1:1/.test(c.findings.join(" ")))
        return "the 1:1 run was not reported";
      return names(r, "1.4.3", "color_contrast") ? null : "1.4.3 was not named";
    },
  },
  {
    file: "synthetic-214-docx-docxjs-no-language.docx",
    truth:
      'A report built with docx.js (npm "docx" 9.8.1): its heading styles are named "Heading 1" and "Heading 2" with no outline level of their own, its table carries Repeat Header Rows and borders, its picture is described — and, as docx.js writes every document unless told otherwise (verified), it declares no language anywhere: no w:lang, no theme language, no dc:language. The headings, table and picture are all read; the missing language is caught: title_language loses points and 3.1.1 is named.',
    build: async () =>
      rewritePackage(
        await docx(
          [
            HEADING(1, "Program Report"),
            P(BODY_TEXT),
            HEADING(2, "Program results"),
            P(BODY_TEXT),
            docxTable(true),
            DRAWING(1, "Bar chart of awards by program"),
          ].join(""),
          { title: "Program Report", styles: true, language: null },
        ),
        (n, xml) => (n === "word/styles.xml" ? DOCXJS_STYLES : xml),
      ),
    check: (r) => {
      const h = cat("heading_structure")(r);
      if (!h || h.score !== 100)
        return `heading_structure ${h?.score} — docx.js headings were not read`;
      const t = cat("table_markup")(r);
      if (!t || t.score !== 100)
        return `table_markup ${t?.score} — docx.js's header row was not read`;
      const l = cat("title_language")(r);
      if (!l || l.score === null || l.score >= 100)
        return `title_language ${l?.score} — no language, not caught`;
      return names(r, "3.1.1", "title_language") ? null : "3.1.1 was not named";
    },
  },
  {
    file: "synthetic-215-pptx-libreoffice-table-header-lost.pptx",
    truth:
      "A PowerPoint table as LibreOffice 26.2 writes it back (verified by round-tripping a headed table): its Header Row mark and table style are dropped — an empty <a:tblPr/> — and every cell's borders are baked in as solid black lines. The file no longer says which row is the header, exactly as PowerPoint would show it, so the checker must not guess one: a data table (it draws lines) with no header row — 45, 1.3.1 named, 79/C.",
    build: () =>
      pptx([SLIDE_TITLE("Awards by program") + LIBREOFFICE_TABLE(DATA_ROWS)], {
        title: "Grant Program Update",
      }),
    check: (r) => unheaderedTableParity(r, { wholeDocument: true }),
  },
  {
    file: "synthetic-216-docx-python-docx-report.docx",
    truth:
      'A report as python-docx 1.2.0 builds it with no extra recipes: headings from its default template; a "Table Grid" table — python-docx has no way to mark a header row, so it has none; a picture from add_picture, which writes no description; and a 14-pt line with bold switched off (<w:b w:val="0"/>, python-docx\'s bold = False). The two defects python-docx makes easy are caught — the missing header row (45, 1.3.1) and the undescribed picture (alt_text 0, 1.1.1) — and the bold-off line is no typed heading (heading_structure 100).',
    build: () =>
      docx(
        [
          HEADING(1, "Program Report"),
          P(BODY_TEXT),
          wordGrid(DATA_ROWS, { tblPr: '<w:tblStyle w:val="TableGrid"/>' }),
          DRAWING(1),
          '<w:p><w:r><w:rPr><w:b w:val="0"/><w:sz w:val="28"/></w:rPr><w:t>Questions? Call the program office.</w:t></w:r></w:p>',
        ].join(""),
        { title: "Program Report", styles: true, stylesExtra: TABLE_STYLES },
      ),
    check: (r) => {
      const t = cat("table_markup")(r);
      if (!t || t.score !== UNHEADERED_DATA_TABLE_SCORE)
        return `table_markup ${t?.score}, not ${UNHEADERED_DATA_TABLE_SCORE}`;
      if (!names(r, "1.3.1", "table_markup")) return "1.3.1 not named against the table";
      const a = cat("alt_text")(r);
      if (!a || a.score !== 0)
        return `alt_text ${a?.score} — the undescribed picture was not caught`;
      if (!names(r, "1.1.1", "alt_text")) return "1.1.1 not named against the picture";
      const h = cat("heading_structure")(r);
      return h && h.score === 100
        ? null
        : `heading_structure ${h?.score} — the bold-off line was read as a heading`;
    },
  },
  // ---- v1.166.0: text colour and size followed through the text styles ----
  {
    file: "synthetic-218-pptx-grey-body-text-from-the-master.pptx",
    truth:
      "Body text that sets no colour of its own takes the master's body text style — here a light grey (#999999, 2.85:1 on the white background), the way a template might soften its body text. PowerPoint resolves a run's colour and size through its shape, the layout's placeholder and the master's text styles; the check read only a colour set on the run itself, so text like this — most of the text in a real deck — was never assessed (user decision 2026-10-06: follow it). It is now, and the failure is caught: 1.4.3 named.",
    build: () =>
      pptx(
        [
          PH_SP(2, '<p:ph type="title"/>', ["Program Notes"]) +
            PH_SP(3, '<p:ph idx="1"/>', ["Figures in gray are estimates."]),
        ],
        {
          title: "Program Notes",
          ...deckChain({
            master: PPT_MASTER({
              bg: BGREF_BG1,
              txStyles: COLOURED_TX_STYLES('<a:solidFill><a:srgbClr val="999999"/></a:solidFill>'),
            }),
            layouts: [
              PPT_LAYOUT(
                LAYOUT_PH('<p:ph type="title"/>', {
                  xfrm: XFRM(838200, 365125, 10515600, 1325563),
                }) +
                  LAYOUT_PH('<p:ph idx="1"/>', { xfrm: XFRM(838200, 1825625, 10515600, 4351338) }),
              ),
            ],
            slideLayouts: [1],
          }),
        },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null || c.score >= 100)
        return `color_contrast ${c?.score} — the master's grey body text was not caught`;
      if (!/#999999/.test(c.findings.join(" "))) return "the finding does not name #999999";
      return names(r, "1.4.3", "color_contrast") ? null : "1.4.3 was not named";
    },
  },
  {
    file: "synthetic-219-pptx-white-title-on-a-darker-band.pptx",
    truth:
      "White titles on a band PowerPoint shades 25% darker than the theme's blue (accent 5, #5B9BD5 → about #2F75B5) — a real survey-results deck in the test set has six of them. The check read the shading off the band and judged the titles against the plain, lighter blue: 2.96:1, six failures that were not there (the shaded band gives about 4.85:1). A shaded colour is not one stated colour, so by the backgrounds' strict rule the band is not guessed at: the titles are not assessed, the black text beside them is, and nothing is asserted — color_contrast 100.",
    build: () => {
      const band = `<p:sp><p:nvSpPr><p:cNvPr id="16" name="Rectangle 15"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${XFRM(832385, 0, 3218914, 6858000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent5"><a:lumMod val="75000"/></a:schemeClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
      const title = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${XFRM(992206, 1608667, 2823275, 4501127)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4000" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Overview</a:t></a:r></a:p></p:txBody></p:sp>`;
      return pptx(
        [
          band +
            title +
            RUN_BOX(
              "Survey results for all staff",
              ` sz="2400"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>`,
              XFRM(4547698, 1608667, 3421958, 4501127),
            ),
        ],
        {
          title: "Climate Survey Results",
          ...deckChain({
            master: PPT_MASTER({ bg: BGREF_BG1 }),
            layouts: [PPT_LAYOUT("")],
            slideLayouts: [1],
          }),
        },
      );
    },
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score !== 100)
        return `color_contrast ${c?.score} — the titles on the shaded band were judged against the plain colour`;
      return noAccusation(r);
    },
  },
  {
    file: "synthetic-220-pptx-link-in-the-themes-link-colour.pptx",
    truth:
      "A link on a navy slide whose run says white — but PowerPoint draws link text in the theme's hyperlink colour (#0563C1, Office's), whatever colour the run states, unless the link carries PowerPoint 2019's \"use the text colour\" mark (the 2018 hlinkClr extension), which this one does not. LibreOffice draws it the same way (verified on two real decks in the test set). The check judged the run's white — 11.6:1, a pass — while what is drawn is blue on navy, 1.97:1. Link text is now judged in the colour it is drawn in: 1.4.3 named, the failure reported in #0563C1.",
    build: () => {
      const chain = deckChain({
        master: PPT_MASTER({ bg: BGREF_BG1 }),
        layouts: [PPT_LAYOUT("")],
        slideLayouts: [1],
      });
      return pptx(
        [
          SLIDE_TITLE("Annual Report") +
            RUN_BOX(
              "Read the full report",
              ` sz="1800"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:hlinkClick xmlns:r="${PPT_REL}" r:id="rIdLink"/>`,
            ),
        ],
        {
          title: "Annual Report",
          slideBgHex: "1F3864",
          ...chain,
          slideRels: {
            1:
              chain.slideRels[1] +
              `<Relationship Id="rIdLink" Type="${PPT_REL}/hyperlink" Target="https://icjia.illinois.gov/" TargetMode="External"/>`,
          },
        },
      );
    },
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score === null || c.score >= 100)
        return `color_contrast ${c?.score} — the link was judged in the run's white, not the colour it is drawn in`;
      if (!/#0563C1/.test(c.findings.join(" "))) return "the finding does not name #0563C1";
      return names(r, "1.4.3", "color_contrast") ? null : "1.4.3 was not named";
    },
  },
  {
    file: "synthetic-221-pptx-highlighted-text-on-a-dark-slide.pptx",
    truth:
      "Black text on a yellow highlight, on a navy slide. A highlight is painted behind the text, so the text's background is the yellow (19.6:1); the check ignored highlights and judged the black text against the navy slide — 1.81:1, a failure that is not there. Highlighted text is now judged against its highlight: nothing asserted, color_contrast 100.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Deadlines") +
            RUN_BOX(
              "Applications close March 31.",
              ` sz="1800"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:highlight><a:srgbClr val="FFFF00"/></a:highlight>`,
            ),
        ],
        {
          title: "Deadlines",
          slideBgHex: "1F3864",
          ...deckChain({
            master: PPT_MASTER({ bg: BGREF_BG1 }),
            layouts: [PPT_LAYOUT("")],
            slideLayouts: [1],
          }),
        },
      ),
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score !== 100)
        return `color_contrast ${c?.score} — highlighted text was judged against the slide, not its highlight`;
      return noAccusation(r);
    },
  },
  {
    file: "synthetic-222-pptx-designer-backdrop-shows-the-background.pptx",
    truth:
      "A full-slide rectangle of the kind PowerPoint's Designer lays under a slide's content: marked useBgFill — show the slide's background — while its theme style still names the accent fill an inserted shape would otherwise take (#4472C4). Five real decks in the test set carry 67 of them; LibreOffice draws them in the slide's white (verified). Small black text on it must be judged against that white (21:1), never against the style's blue (4.45:1, a failure that is not there): nothing asserted, color_contrast 100.",
    build: () => {
      const backdrop = `<p:sp useBgFill="1"><p:nvSpPr><p:cNvPr id="10" name="Rectangle 9"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noTextEdit="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr>${XFRM(0, 0, 12192000, 6858000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr>${INSERTED_SHAPE_STYLE}<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
      return pptx(
        [
          backdrop +
            SLIDE_TITLE("Sources") +
            RUN_BOX(
              "Source: ICJIA analysis of 2025 arrest data.",
              ` sz="1200"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>`,
            ),
        ],
        {
          title: "Sources",
          ...deckChain({
            master: PPT_MASTER({ bg: BGREF_BG1 }),
            layouts: [PPT_LAYOUT("")],
            slideLayouts: [1],
          }),
        },
      );
    },
    check: (r) => {
      const c = cat("color_contrast")(r);
      if (!c || c.score !== 100)
        return `color_contrast ${c?.score} — the backdrop was read as its style's accent, or the text was not assessed`;
      return noAccusation(r);
    },
  },
  // ---- v1.161.0: the language declared on most of the text (2026-10-06) ----
  {
    file: "synthetic-184-docx-language-on-the-text.docx",
    truth:
      "A Word notice with no document-wide default language — no styles default, no core-properties language — whose every run is marked en-US: exactly what this report's own advice (select all the text → Review → Language → Set Proofing Language) writes. Word read only the document default, so a file fixed exactly as advised was still accused of declaring no language — 3.1.1 named, a C ceiling (found 2026-10-06). The language declared on most of the text is the document's language, as PowerPoint has always read it: title_language 100, the finding says where the language came from, nothing asserted, 100/A.",
    build: () =>
      docx(
        [
          HEADING_LANG(1, "Public Meeting Notice", "en-US"),
          P_LANG(BODY_TEXT, "en-US"),
          P_LANG(BODY_TEXT, "en-US"),
        ].join(""),
        { title: "Public Meeting Notice", styles: true, language: null },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 100) return `a document fixed as advised scored ${c.score}`;
      if (!/declared on the text itself/.test(c.findings.join(" ")))
        return "the finding does not say the language is declared on the text";
      if (accused(r, "title_language")) return "3.1.1 asserted against text marked en-US";
      return r.overallScore === 100 ? null : `the notice scored ${r.overallScore}/${r.grade}`;
    },
  },
  {
    file: "synthetic-185-pptx-one-stray-language.pptx",
    truth:
      "A deck with no deck-wide default language whose only language mark is one short French greeting; all the rest of its text is unmarked. PowerPoint credited ANY run's language, so that one word stood in for the whole deck and it got full language credit (until 2026-10-06). The language must cover more than half of the text to be the deck's: no presentation language, title_language 50, 3.1.1 named, a 79/C ceiling.",
    build: () =>
      pptx(
        [
          SLIDE_TITLE("Program Update") +
            `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:rPr lang="fr-FR"/><a:t>Bienvenue</a:t></a:r></a:p><a:p><a:r><a:t>Enrollment rose twelve percent this quarter across every region in the state.</a:t></a:r></a:p></p:txBody></p:sp>`,
          SLIDE_TITLE("Next Steps") +
            SLIDE_BODY(
              "The budget review is scheduled for March, with a public comment period after it.",
            ),
        ],
        { title: "Program Update", declareLanguage: false },
      ),
    check: (r) => {
      const c = cat("title_language")(r);
      if (!c || c.score === null) return "title_language unscored";
      if (c.score !== 50) return `one marked word stood in for the deck: title_language ${c.score}`;
      if (!names(r, "3.1.1", "title_language"))
        return "the missing language cost points with no 3.1.1 failure named";
      return r.overallScore === 79
        ? null
        : `the deck graded ${r.overallScore}/${r.grade}, not 79/C`;
    },
  },
];

// Twin orderings, same contract as the PDF battery's.
const TWIN_ORDERINGS: { bad: string; good: string; category: string }[] = [
  {
    bad: "synthetic-188-docx-cell-borders-no-header.docx",
    good: "synthetic-189-docx-cell-borders-header-twin.docx",
    category: "table_markup",
  },
  {
    bad: "synthetic-171-xlsx-light-text-no-fill.xlsx",
    good: "synthetic-172-xlsx-dark-text-no-fill-twin.xlsx",
    category: "color_contrast",
  },
  {
    bad: "synthetic-173-docx-spanish-declared-english.docx",
    good: "synthetic-174-docx-spanish-marked-es-twin.docx",
    category: "title_language",
  },
  {
    bad: "synthetic-176-docx-header-logo-no-alt.docx",
    good: "synthetic-177-docx-header-logo-decorative-twin.docx",
    category: "alt_text",
  },
  {
    bad: "synthetic-160-pptx-table-headerless.pptx",
    good: "synthetic-170-pptx-bare-layout-grid.pptx",
    category: "table_markup",
  },
  {
    bad: "synthetic-158-docx-agenda-header-row-unticked.docx",
    good: "synthetic-157-docx-agenda-header-row-box.docx",
    category: "table_markup",
  },
  {
    bad: "synthetic-158-docx-agenda-header-row-unticked.docx",
    good: "synthetic-159-docx-agenda-repeat-header-rows.docx",
    category: "table_markup",
  },
  {
    bad: "synthetic-160-pptx-table-headerless.pptx",
    good: "synthetic-161-pptx-table-header-twin.pptx",
    category: "table_markup",
  },
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

/** "bug" marks a trap that pins a real defect found in the CHECKER — the
 *  trust page renders it FOUND A REAL BUG and needs a matching bugrow in
 *  docs/brief/checker-brief.template.html (build-brief fails otherwise). */
type TrapChip = "caught" | "held" | "bug";
const TRAP_MANIFEST: Record<string, { label: string; chip: TrapChip; chipText?: string }> = {
  "synthetic-218-pptx-grey-body-text-from-the-master.pptx": {
    label: "PowerPoint: grey body text set by the master\u2019s text style, not by the text",
    chip: "caught",
  },
  "synthetic-219-pptx-white-title-on-a-darker-band.pptx": {
    label: "PowerPoint: white titles on a band shaded darker than the theme\u2019s blue",
    chip: "bug",
  },
  "synthetic-220-pptx-link-in-the-themes-link-colour.pptx": {
    label: "PowerPoint: a link drawn in the theme\u2019s link colour, though its text says white",
    chip: "bug",
  },
  "synthetic-221-pptx-highlighted-text-on-a-dark-slide.pptx": {
    label: "PowerPoint: black text on a yellow highlight, on a navy slide",
    chip: "bug",
  },
  "synthetic-222-pptx-designer-backdrop-shows-the-background.pptx": {
    label: "PowerPoint: a Designer backdrop set to show the slide\u2019s background",
    chip: "held",
  },
  "synthetic-206-pptx-typed-bullets-layout-bullets-off.pptx": {
    label: "PowerPoint: bullets typed by hand where the slide's layout switches bullets off",
    chip: "bug",
  },
  "synthetic-207-pptx-python-pptx-default-template.pptx": {
    label:
      "PowerPoint: python-pptx's default template — a subtitle and a slide number that are not list items",
    chip: "held",
  },
  "synthetic-208-pptx-google-slides-file-name-alt.pptx": {
    label:
      "PowerPoint: pictures \u201cdescribed\u201d by their file names, as Google Slides exports them",
    chip: "caught",
  },
  "synthetic-209-xlsx-openpyxl-picture-alt.xlsx": {
    label: "Excel: openpyxl\u2019s \u201cPicture\u201d on every image",
    chip: "caught",
  },
  "synthetic-211-pptx-grey-text-on-the-masters-white.pptx": {
    label: "PowerPoint: grey text on the white background a slide inherits from its master",
    chip: "caught",
  },
  "synthetic-212-pptx-white-text-dark-template.pptx": {
    label: "PowerPoint: white text on a dark template whose colour map makes the background dark",
    chip: "held",
  },
  "synthetic-213-pptx-title-in-the-bands-own-colour.pptx": {
    label: "PowerPoint: a title typed in the colour of the band its layout paints",
    chip: "caught",
  },
  "synthetic-214-docx-docxjs-no-language.docx": {
    label: "Word: a docx.js report that declares no language anywhere",
    chip: "caught",
  },
  "synthetic-215-pptx-libreoffice-table-header-lost.pptx": {
    label: "PowerPoint: a table LibreOffice wrote back without its Header Row mark",
    chip: "caught",
  },
  "synthetic-216-docx-python-docx-report.docx": {
    label: "Word: a python-docx report \u2014 no header row, no picture description",
    chip: "caught",
  },
  "synthetic-199-pptx-alt-text-only-line-breaks.pptx": {
    label: "PowerPoint: a picture described only by line breaks, written as &#xA;",
    chip: "bug",
  },
  "synthetic-200-docx-utf16-parts.docx": {
    label: "Word: an accessible memo saved with every part in UTF-16",
    chip: "bug",
  },
  "synthetic-201-docx-bold-switched-off.docx": {
    label: "Word: a short 14-pt line with bold switched off, as python-docx writes it",
    chip: "bug",
  },
  "synthetic-202-xlsx-bold-switched-off.xlsx": {
    label: "Excel: 14-pt grey text with bold switched off",
    chip: "bug",
  },
  "synthetic-203-pptx-true-and-false-spelled-out.pptx": {
    label: 'PowerPoint: a hidden slide and a decorative picture, marked "false" and "true"',
    chip: "bug",
  },
  "synthetic-204-pptx-slide-order-written-differently.pptx": {
    label: "PowerPoint: slides stored out of order, the slide list written another legal way",
    chip: "bug",
  },
  "synthetic-205-xlsx-no-cell-references.xlsx": {
    label: "Excel: a workbook whose cells carry no r= references",
    chip: "bug",
  },
  "synthetic-196-docx-empty-header-row.docx": {
    label: "Word: a header row marked, every header cell empty",
    chip: "caught",
  },
  "synthetic-197-pptx-empty-header-row.pptx": {
    label: "PowerPoint: a header row marked, every header cell empty",
    chip: "caught",
  },
  "synthetic-198-xlsx-default-column-names.xlsx": {
    label: "Excel: a table still headed \u201cColumn1, Column2\u201d",
    chip: "caught",
  },
  "synthetic-186-docx-borders-explicitly-none.docx": {
    label: "Word: a layout grid whose borders are all explicitly switched off",
    chip: "bug",
  },
  "synthetic-187-docx-style-draws-nothing.docx": {
    label: "Word: a layout grid carrying a table style that draws nothing (Google Docs' shape)",
    chip: "held",
  },
  "synthetic-188-docx-cell-borders-no-header.docx": {
    label: "Word: a data table drawn with cell borders and no header row",
    chip: "caught",
  },
  "synthetic-189-docx-cell-borders-header-twin.docx": {
    label: "Word: the same table with Header Row ticked",
    chip: "held",
  },
  "synthetic-190-docx-table-grid-style-no-header.docx": {
    label: "Word: a Table Grid-styled data table with no header row",
    chip: "caught",
  },
  "synthetic-184-docx-language-on-the-text.docx": {
    label: "Word: no default language, every word marked English — fixed exactly as advised",
    chip: "bug",
  },
  "synthetic-185-pptx-one-stray-language.pptx": {
    label: "PowerPoint: one French greeting is the deck's only language mark",
    chip: "caught",
  },
  "synthetic-170-pptx-bare-layout-grid.pptx": {
    label:
      "PowerPoint: an agenda lined up in a table stripped bare — no style, borders or header row",
    chip: "bug",
  },
  "synthetic-171-xlsx-light-text-no-fill.xlsx": {
    label: "Excel: a ledger typed in light grey straight onto the plain grid",
    chip: "caught",
  },
  "synthetic-172-xlsx-dark-text-no-fill-twin.xlsx": {
    label: "Excel: the same ledger in near-black on the plain grid",
    chip: "held",
  },
  "synthetic-173-docx-spanish-declared-english.docx": {
    label: "Word: a notice written in Spanish, declared English",
    chip: "caught",
  },
  "synthetic-174-docx-spanish-marked-es-twin.docx": {
    label: "Word: the same notice with its Spanish marked Spanish",
    chip: "held",
  },
  "synthetic-175-pptx-corrupt-core.pptx": {
    label: "PowerPoint: a deck whose properties part is damaged — unreadable is not missing",
    chip: "bug",
  },
  "synthetic-176-docx-header-logo-no-alt.docx": {
    label: "Word: the agency logo in the page header, with no alt text",
    chip: "caught",
  },
  "synthetic-177-docx-header-logo-decorative-twin.docx": {
    label: "Word: the same logo marked decorative",
    chip: "held",
  },
  "synthetic-178-docx-16-of-23-images-described.docx": {
    label: "Word: 16 of 23 images described — now the same letter as the PDF",
    chip: "bug",
  },
  "synthetic-166-docx-typed-list-only.docx": {
    label: "Word: a memo whose only list is typed by hand",
    chip: "caught",
  },
  "synthetic-167-pptx-default-title.pptx": {
    label: "PowerPoint: a deck still titled “PowerPoint Presentation”",
    chip: "bug",
  },
  "synthetic-168-docx-filename-title.docx": {
    label: "Word: a memo titled with its own file name",
    chip: "caught",
  },
  "synthetic-169-xlsx-filename-shaped-title.xlsx": {
    label: "Excel: a file-name-shaped title that still names the workbook",
    chip: "held",
  },
  "synthetic-163-docx-one-bold-title-line.docx": {
    label: "Word: a memo whose only heading-like line is its bold title",
    chip: "bug",
  },
  "synthetic-164-docx-two-bold-section-lines.docx": {
    label: "Word: two bold section lines and no Heading styles",
    chip: "caught",
  },
  "synthetic-165-pptx-one-typed-title-no-titled-slides.pptx": {
    label: "PowerPoint: one typed title on a deck with no titled slides",
    chip: "held",
  },
  "synthetic-157-docx-agenda-header-row-box.docx": {
    label: "Word: an agenda’s roll-call table with Header Row ticked (Word’s default)",
    chip: "bug",
  },
  "synthetic-158-docx-agenda-header-row-unticked.docx": {
    label: "Word: the same table with Header Row unticked and no repeat header",
    chip: "caught",
  },
  "synthetic-159-docx-agenda-repeat-header-rows.docx": {
    label: "Word: the same table marked with Repeat Header Rows instead",
    chip: "held",
  },
  "synthetic-162-docx-pasted-borderless-grid.docx": {
    label: "Word: a borderless grid pasted from the web, carrying “no shading” marks",
    chip: "bug",
  },
  "synthetic-160-pptx-table-headerless.pptx": {
    label: "PowerPoint: a table with the Header Row box unticked",
    chip: "caught",
  },
  "synthetic-161-pptx-table-header-twin.pptx": {
    label: "PowerPoint: the same table with Header Row ticked",
    chip: "held",
  },
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

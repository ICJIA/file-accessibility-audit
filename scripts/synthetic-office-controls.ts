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

function corePropsXml(title: string | null): string {
  return `${XMLDECL}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${title === null ? "" : `<dc:title>${title}</dc:title>`}<dc:language>en-US</dc:language></cp:coreProperties>`;
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
  opts: { title?: string | null; styles?: boolean } = {},
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
    ),
    "word/document.xml": `${XMLDECL}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${bodyXml}</w:body>
</w:document>`,
  });
}

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

function pptx(slides: string[], opts: { title?: string | null } = {}): Promise<Buffer> {
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
    files[`ppt/slides/slide${i + 1}.xml`] = `${XMLDECL}
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld><p:spTree>${spTree}</p:spTree></p:cSld>
</p:sld>`;
  });
  return zip(files);
}

const SLIDE_TITLE = (text: string) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const SLIDE_BODY = (text: string) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const SLIDE_PIC = (id: number, descr?: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${descr === undefined ? "" : ` descr="${descr}"`}/><p:nvPr/></p:nvPicPr></p:pic>`;

function xlsx(
  sheets: { name: string; rows: string[][] }[],
  opts: { title?: string | null } = {},
): Promise<Buffer> {
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XMLDECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
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
    files[`xl/worksheets/sheet${i + 1}.xml`] = `${XMLDECL}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
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
      "Three Heading-styled blank lines used as spacing, among real headings. SCORED since 2026-08-31: a heading style applied to a blank line announces a section that does not exist — W3C failure F43 for WCAG 1.3.1 (Level A) — so heading_structure must lose points AND the conformance verdict must name 1.3.1. Reporting it without scoring it, or scoring it without naming the criterion, both fail this trap.",
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
      if (c.score < 70)
        return `empty headings cost more than the 30-point cap (got ${c.score}) — they may never take this category past Minor`;
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
    chip: "clean",
  },
  "synthetic-128-docx-empty-headings.docx": {
    label: "Word: heading styles on blank lines, used as spacing",
    chip: "held",
  },
  "synthetic-129-docx-empty-headings-good-twin.docx": {
    label: "Word: the same document spaced with ordinary blank paragraphs",
    chip: "clean",
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

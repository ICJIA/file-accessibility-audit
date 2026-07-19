/**
 * Tests for the DOCX (OOXML / WordprocessingML) accessibility extractor.
 * Buffers are assembled by the minimalDocx helper — real, unzippable .docx
 * packages — so the extractor is exercised end to end (unzip + XML parse),
 * not against a mock.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildDocx,
  styledParagraph,
  paragraph,
  inlineImage,
  textBox,
  emptyShape,
  chartDrawing,
  table,
  hyperlink,
  hyperlinkRels,
  listItem,
  DOCX_NS,
} from "./helpers/minimalDocx.js";
import JSZip from "jszip";
import { analyzeDocx, readCapped, DocxParseError } from "../services/docxService.js";

describe("docx metadata", () => {
  it("extracts title, creator, language, and page count", async () => {
    const buf = await buildDocx();
    const r = await analyzeDocx(buf);
    expect(r.metadata.title).toBe("Quarterly Report");
    expect(r.metadata.creator).toBe("Jane Author");
    expect(r.metadata.language).toBe("en-US");
    expect(r.metadata.pageCount).toBe(3);
  });

  it("reports a missing title as null", async () => {
    const buf = await buildDocx({
      coreXml:
        `<?xml version="1.0"?><cp:coreProperties ` +
        `xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>A</dc:creator></cp:coreProperties>`,
    });
    const r = await analyzeDocx(buf);
    expect(r.metadata.title).toBeNull();
  });

  it("reports a missing language as null when no lang is declared anywhere", async () => {
    const buf = await buildDocx({
      stylesXml:
        `<?xml version="1.0"?><w:styles ` +
        `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    });
    const r = await analyzeDocx(buf);
    expect(r.metadata.language).toBeNull();
  });

  it("falls back to dc:language from core.xml when styles declare none", async () => {
    const buf = await buildDocx({
      stylesXml:
        `<?xml version="1.0"?><w:styles ` +
        `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      coreXml:
        `<?xml version="1.0"?><cp:coreProperties ` +
        `xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>fr-FR</dc:language></cp:coreProperties>`,
    });
    const r = await analyzeDocx(buf);
    expect(r.metadata.language).toBe("fr-FR");
  });
});

describe("docx headings", () => {
  it("extracts heading levels and text in document order", async () => {
    const buf = await buildDocx({
      body:
        styledParagraph("Heading1", "Introduction") +
        paragraph("Some body text.") +
        styledParagraph("Heading2", "Background") +
        styledParagraph("Heading2", "Scope"),
    });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([
      { level: 1, text: "Introduction" },
      { level: 2, text: "Background" },
      { level: 2, text: "Scope" },
    ]);
  });

  it("returns an empty heading array for a document with no headings", async () => {
    const buf = await buildDocx({ body: paragraph("Just a paragraph.") });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([]);
  });

  it("flags bold, large, styleless paragraphs as fake-heading candidates", async () => {
    const buf = await buildDocx({
      body:
        paragraph("Executive Summary", { bold: true, sizeHalfPt: 32 }) +
        paragraph("Ordinary sentence that is not a heading."),
    });
    const r = await analyzeDocx(buf);
    expect(r.fakeHeadings.map((f) => f.text)).toEqual(["Executive Summary"]);
  });

  it("does not flag real styled headings as fake headings", async () => {
    const buf = await buildDocx({
      body: styledParagraph("Heading1", "Real Heading"),
    });
    const r = await analyzeDocx(buf);
    expect(r.fakeHeadings).toEqual([]);
  });
});

describe("docx images", () => {
  it("extracts alt text from a described image", async () => {
    const buf = await buildDocx({
      body: inlineImage({ descr: "Bar chart of quarterly sales" }),
    });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: "Bar chart of quarterly sales", decorative: false, titleOnly: false }]);
  });

  it("reports a missing alt text as null", async () => {
    const buf = await buildDocx({ body: inlineImage({}) });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: false, titleOnly: false }]);
  });

  it("marks decorative images", async () => {
    const buf = await buildDocx({ body: inlineImage({ decorative: true }) });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: true, titleOnly: false }]);
  });

  it("does not count a text box (text-bearing shape) as an image", async () => {
    const buf = await buildDocx({ body: textBox("Justice reinvestment works.") });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([]);
  });

  it("still counts a shape with no text content as an image needing alt", async () => {
    const buf = await buildDocx({ body: emptyShape() });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: false, titleOnly: false }]);
  });

  it("counts a chart as an image needing alt", async () => {
    const buf = await buildDocx({ body: chartDrawing() });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: false, titleOnly: false }]);
  });
});

describe("docx custom heading styles (outlineLvl / basedOn)", () => {
  const CUSTOM_STYLES =
    `<?xml version="1.0"?><w:styles ${DOCX_NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ChapterTitle"><w:name w:val="Chapter Title"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="SectionHead"><w:name w:val="Section Head"/><w:basedOn w:val="Heading2"/></w:style>` +
    `</w:styles>`;

  it("detects a custom style with its own outlineLvl as a real heading", async () => {
    const buf = await buildDocx({
      stylesXml: CUSTOM_STYLES,
      body: styledParagraph("ChapterTitle", "Chapter 1: Overview"),
    });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([{ level: 1, text: "Chapter 1: Overview" }]);
    expect(r.fakeHeadings).toEqual([]);
  });

  it("resolves the heading level through the basedOn chain", async () => {
    const buf = await buildDocx({
      stylesXml: CUSTOM_STYLES,
      body: styledParagraph("SectionHead", "Methodology"),
    });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([{ level: 2, text: "Methodology" }]);
  });

  it("honors a direct paragraph-level outlineLvl", async () => {
    const buf = await buildDocx({
      body: `<w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Inline outline</w:t></w:r></w:p>`,
    });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([{ level: 2, text: "Inline outline" }]);
  });

  it("does not push empty Heading-styled paragraphs as headings, but counts them", async () => {
    const buf = await buildDocx({
      body: styledParagraph("Heading1", "") + styledParagraph("Heading1", "Real"),
    });
    const r = await analyzeDocx(buf);
    expect(r.headings).toEqual([{ level: 1, text: "Real" }]);
    expect(r.emptyHeadingCount).toBe(1);
  });
});

describe("docx AlternateContent (text boxes serialize Choice + Fallback)", () => {
  it("counts text-box content once, not per branch", async () => {
    const inner =
      `<w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Big Pull Quote</w:t></w:r></w:p>`;
    const body =
      `<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">` +
      `<mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:docPr id="7" name="TB"/>` +
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
      `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
      `<wps:txbx><w:txbxContent>${inner}</w:txbxContent></wps:txbx></wps:wsp>` +
      `</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><w:txbxContent>${inner}</w:txbxContent></w:pict></mc:Fallback>` +
      `</mc:AlternateContent></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.fakeHeadings).toHaveLength(1);
  });
});

describe("docx lists — style numbering, numId=0, numbered headings", () => {
  const LIST_STYLES =
    `<?xml version="1.0"?><w:styles ${DOCX_NS}>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/>` +
    `<w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>` +
    `</w:styles>`;

  it("counts style-level numbering (built-in List Bullet) as real list items", async () => {
    const buf = await buildDocx({
      stylesXml: LIST_STYLES,
      body:
        styledParagraph("ListBullet", "First point") + styledParagraph("ListBullet", "Second point"),
    });
    const r = await analyzeDocx(buf);
    expect(r.lists.realListItems).toBe(2);
    expect(r.lists.manualBulletParagraphs).toBe(0);
  });

  it("does not count numId=0 (numbering removed) as a real list item", async () => {
    const buf = await buildDocx({
      body: `<w:p><w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr><w:r><w:t>plain</w:t></w:r></w:p>`,
    });
    const r = await analyzeDocx(buf);
    expect(r.lists.realListItems).toBe(0);
  });

  it("does not count numbered HEADINGS as manual bullets", async () => {
    const buf = await buildDocx({
      stylesXml: LIST_STYLES,
      body: styledParagraph("Heading1", "1. Introduction"),
    });
    const r = await analyzeDocx(buf);
    expect(r.lists.manualBulletParagraphs).toBe(0);
  });
});

describe("docx table header semantics", () => {
  it("honors w:tblHeader w:val=0 (explicitly OFF) as no header row", async () => {
    const body =
      `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/></w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader w:val="0"/></w:trPr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.tables[0].hasHeaderRow).toBe(false);
  });

  it("only a FIRST-row tblHeader counts (Word ignores non-top header rows)", async () => {
    const body =
      `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.tables[0].hasHeaderRow).toBe(false);
  });

  it("flags style-less, border-less, shading-less tables as layout-like", async () => {
    const layout =
      `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
    const styled =
      `<w:tbl><w:tblPr><w:tblStyle w:val="GridTable"/></w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body: layout + styled });
    const r = await analyzeDocx(buf);
    expect(r.tables[0].looksLikeLayout).toBe(true);
    expect(r.tables[1].looksLikeLayout).toBe(false);
  });
});

describe("docx field-code hyperlinks", () => {
  it("reads fldSimple HYPERLINK fields", async () => {
    const body =
      `<w:p><w:fldSimple w:instr=' HYPERLINK "https://example.gov/statute" '>` +
      `<w:r><w:t>Statute text</w:t></w:r></w:fldSimple></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.links).toEqual([{ text: "Statute text", url: "https://example.gov/statute" }]);
  });

  it("reads complex instrText HYPERLINK fields (begin/separate/end)", async () => {
    const body =
      `<w:p>` +
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://example.gov/form" </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:t>Apply online</w:t></w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
      `</w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.links).toEqual([{ text: "Apply online", url: "https://example.gov/form" }]);
  });
});

describe("docx legacy VML images", () => {
  it("counts a w:pict v:imagedata image with its v:shape alt", async () => {
    const body =
      `<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" alt="Old letterhead logo">` +
      `<v:imagedata r:id="rId9"/></v:shape></w:pict></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: "Old letterhead logo", decorative: false, titleOnly: false }]);
  });
});

describe("docx headers/footers/footnotes coverage", () => {
  it("audits images in header parts", async () => {
    const buf = await buildDocx({
      body: paragraph("Body text"),
      extra: {
        "word/header1.xml": `<?xml version="1.0"?><w:hdr ${DOCX_NS}>${inlineImage({})}</w:hdr>`,
      },
    });
    const r = await analyzeDocx(buf);
    expect(r.images).toHaveLength(1);
    expect(r.images[0].altText).toBe(null);
  });

  it("audits hyperlinks in footnotes with the footnote part's own rels", async () => {
    const buf = await buildDocx({
      body: paragraph("Body text"),
      extra: {
        "word/footnotes.xml":
          `<?xml version="1.0"?><w:footnotes ${DOCX_NS}>` +
          `<w:footnote w:id="1"><w:p>${hyperlink("rIdF1", "click here")}</w:p></w:footnote>` +
          `</w:footnotes>`,
        "word/_rels/footnotes.xml.rels":
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.gov/cite" TargetMode="External"/>` +
          `</Relationships>`,
      },
    });
    const r = await analyzeDocx(buf);
    expect(r.links).toEqual([{ text: "click here", url: "https://example.gov/cite" }]);
  });
});

describe("docx per-part parse state", () => {
  it("reports an unparseable styles part", async () => {
    const buf = await buildDocx({ body: paragraph("x"), stylesXml: "<w:styles broken" });
    const r = await analyzeDocx(buf);
    expect(r.parse.stylesState).toBe("unparseable");
    expect(r.parse.documentOk).toBe(true);
  });

  it("reports an unparseable document body", async () => {
    const buf = await buildDocx({
      body: paragraph("x"),
      extra: { "word/document.xml": "this is not xml at all <" },
    });
    const r = await analyzeDocx(buf);
    expect(r.parse.documentOk).toBe(false);
  });

  it("distinguishes an absent core part from an unparseable one", async () => {
    const absent = await buildDocx({ body: paragraph("x"), omitCore: true });
    const rAbsent = await analyzeDocx(absent);
    expect(rAbsent.parse.coreState).toBe("absent");

    const broken = await buildDocx({ body: paragraph("x"), coreXml: "<cp:core broken" });
    const rBroken = await analyzeDocx(broken);
    expect(rBroken.parse.coreState).toBe("unparseable");
  });
});

describe("docx tables", () => {
  it("detects a header row, dimensions, and no nesting", async () => {
    const buf = await buildDocx({
      body: table({ rows: 3, cols: 2, headerRow: true }),
    });
    const r = await analyzeDocx(buf);
    expect(r.tables).toEqual([
      {
        hasHeaderRow: true,
        rowCount: 3,
        colCount: 2,
        hasNestedTable: false,
        looksLikeLayout: false,
      },
    ]);
  });

  it("flags a table with no header row", async () => {
    const buf = await buildDocx({ body: table({ rows: 2, cols: 2 }) });
    const r = await analyzeDocx(buf);
    expect(r.tables[0].hasHeaderRow).toBe(false);
  });

  it("counts nested tables once (top-level only) and flags nesting", async () => {
    const buf = await buildDocx({
      body: table({ rows: 2, cols: 2, nested: true }),
    });
    const r = await analyzeDocx(buf);
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0].hasNestedTable).toBe(true);
  });
});

describe("docx links", () => {
  it("extracts link text and resolves the target via relationships", async () => {
    const buf = await buildDocx({
      body: hyperlink("rId7", "Annual accessibility report"),
      documentRels: hyperlinkRels([{ id: "rId7", target: "https://example.gov/report" }]),
    });
    const r = await analyzeDocx(buf);
    expect(r.links).toEqual([
      {
        text: "Annual accessibility report",
        url: "https://example.gov/report",
      },
    ]);
  });

  it("returns a null url for an unresolved relationship", async () => {
    const buf = await buildDocx({ body: hyperlink("rIdX", "See here") });
    const r = await analyzeDocx(buf);
    expect(r.links).toEqual([{ text: "See here", url: null }]);
  });
});

describe("docx lists", () => {
  it("counts real list items", async () => {
    const buf = await buildDocx({
      body: listItem("First") + listItem("Second") + paragraph("Not a list."),
    });
    const r = await analyzeDocx(buf);
    expect(r.lists.realListItems).toBe(2);
    expect(r.lists.manualBulletParagraphs).toBe(0);
  });

  it("flags manual-bullet paragraphs that are not real lists", async () => {
    const buf = await buildDocx({
      body:
        paragraph("• Hand-typed bullet") +
        paragraph("1. Hand-typed number") +
        paragraph("A normal sentence.") +
        listItem("A real list item"),
    });
    const r = await analyzeDocx(buf);
    expect(r.lists.manualBulletParagraphs).toBe(2);
    expect(r.lists.realListItems).toBe(1);
  });
});

describe("docx color contrast", () => {
  it("counts checked vs unresolved runs and flags low-contrast text", async () => {
    const buf = await buildDocx({
      body:
        paragraph("Readable text", { color: "000000" }) +
        paragraph("Low contrast text", { color: "FFFF00" }) +
        paragraph("Inherited color"),
    });
    const r = await analyzeDocx(buf);
    expect(r.contrast.checkedRuns).toBe(2);
    expect(r.contrast.unresolvedRuns).toBe(1);
    expect(r.contrast.failing.map((f) => f.text)).toEqual(["Low contrast text"]);
    expect(r.contrast.failing[0].large).toBe(false);
  });

  it("applies the lenient large-text threshold", async () => {
    const buf = await buildDocx({
      body:
        paragraph("Large heading text", {
          color: "808080",
          bold: true,
          sizeHalfPt: 32,
        }) + paragraph("Small note text", { color: "808080" }),
    });
    const r = await analyzeDocx(buf);
    // #808080 on white ≈ 3.95:1 — passes large (≥3) but fails normal (<4.5).
    expect(r.contrast.failing.map((f) => f.text)).toEqual(["Small note text"]);
  });

  it("resolves table-cell shading — white header text on a dark cell fill passes", async () => {
    const body =
      `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="1F4E79"/></w:tcPr>` +
      `<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Header</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contrast.failing).toEqual([]);
    expect(r.contrast.checkedRuns).toBe(1);
    expect(r.contrast.unresolvedRuns).toBe(0);
  });

  it("still flags genuinely low contrast against an explicit cell fill", async () => {
    const body =
      `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="FEFEFE"/></w:tcPr>` +
      `<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Ghost text</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contrast.failing.map((f) => f.text)).toEqual(["Ghost text"]);
    expect(r.contrast.failing[0].background).toBe("#FEFEFE");
  });

  it("treats cells of a styled table without explicit cell fill as unresolved, never assumed white", async () => {
    const body =
      `<w:tbl><w:tblPr><w:tblStyle w:val="GridTable4-Accent1"/></w:tblPr><w:tblGrid><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc>` +
      `<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Banded header</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contrast.failing).toEqual([]);
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
  });

  it("treats text inside a text box as unresolved background (shape fills are not parsed)", async () => {
    const body =
      `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="7" name="TB"/>` +
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
      `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
      `<wps:txbx><w:txbxContent><w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr>` +
      `<w:t>White on dark card</w:t></w:r></w:p></w:txbxContent></wps:txbx>` +
      `</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contrast.failing).toEqual([]);
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
  });

  it("cells of a plain unstyled table inherit the page background", async () => {
    const body =
      `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid>` +
      `<w:tr><w:tc>` +
      `<w:p><w:r><w:rPr><w:color w:val="FFFF00"/></w:rPr><w:t>Yellow on page</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contrast.failing.map((f) => f.text)).toEqual(["Yellow on page"]);
  });
});

describe("docx validation", () => {
  it("throws on a non-zip buffer", async () => {
    await expect(analyzeDocx(Buffer.from("this is not a zip"))).rejects.toThrow(DocxParseError);
  });

  it("throws when word/document.xml is missing", async () => {
    const buf = await buildDocx({ omitDocument: true });
    await expect(analyzeDocx(buf)).rejects.toThrow(DocxParseError);
  });
});

describe("docx resource limits (zip-bomb defense)", () => {
  async function entryOf(content: string): Promise<JSZip.JSZipObject> {
    const zip = new JSZip();
    zip.file("word/document.xml", content);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return (await JSZip.loadAsync(buf)).file("word/document.xml")!;
  }

  it("readCapped aborts a part that exceeds the uncompressed byte cap", async () => {
    // Highly compressible 50 KB entry (tiny compressed) vs a 10 KB cap →
    // the streaming reader must abort before buffering it all.
    const entry = await entryOf("A".repeat(50_000));
    await expect(readCapped(entry, 10_000, "word/document.xml")).rejects.toThrow(DocxParseError);
  });

  it("readCapped returns content that fits within the cap", async () => {
    const entry = await entryOf("hello world");
    await expect(readCapped(entry, 10_000, "word/document.xml")).resolves.toBe("hello world");
  });
});

describe("docx aggregate zip-package limits (C1 DoS hardening)", () => {
  afterEach(() => {
    vi.doUnmock("#config");
    vi.resetModules();
  });

  it("rejects a docx package with more entries than OOXML.MAX_ZIP_ENTRIES", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return { ...actual, OOXML: { ...actual.OOXML, MAX_ZIP_ENTRIES: 5 } };
    });
    const { analyzeDocx: analyze, DocxParseError: ParseError } =
      await import("../services/docxService.js");
    const { buildDocx: build } = await import("./helpers/minimalDocx.js");
    const extra = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`extra/f${i}.xml`, "x"]),
    );
    const buf = await build({ extra });
    await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
  });

  it("rejects a docx package whose summed declared uncompressed sizes exceed OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES, even though no single part exceeds DOCX.MAX_UNCOMPRESSED_BYTES", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return { ...actual, OOXML: { ...actual.OOXML, MAX_TOTAL_UNCOMPRESSED_BYTES: 2_000 } };
    });
    const { analyzeDocx: analyze, DocxParseError: ParseError } =
      await import("../services/docxService.js");
    const { buildDocx: build } = await import("./helpers/minimalDocx.js");
    const buf = await build({
      extra: {
        "extra/a.xml": "A".repeat(800),
        "extra/b.xml": "A".repeat(800),
        "extra/c.xml": "A".repeat(800),
      },
    });
    await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
  });

  it("a package within both aggregate limits still analyzes normally", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return {
        ...actual,
        OOXML: { ...actual.OOXML, MAX_ZIP_ENTRIES: 20, MAX_TOTAL_UNCOMPRESSED_BYTES: 5_000 },
      };
    });
    const { analyzeDocx: analyze } = await import("../services/docxService.js");
    const { buildDocx: build } = await import("./helpers/minimalDocx.js");
    const buf = await build();
    await expect(analyze(buf)).resolves.toBeTruthy();
  });
});

describe("docx entity + DOCTYPE hardening (C2, full analyze path)", () => {
  it("&amp;/&lt;/&gt; in heading text and image alt text still decode correctly end-to-end", async () => {
    const buf = await buildDocx({
      body:
        styledParagraph("Heading1", "Smith &amp; Co. reports &lt;Q3&gt; results") +
        inlineImage({ descr: "Revenue &gt; target &amp; on track" }),
    });
    const a = await analyzeDocx(buf);
    expect(a.headings).toEqual([{ level: 1, text: "Smith & Co. reports <Q3> results" }]);
    expect(a.images[0].altText).toBe("Revenue > target & on track");
  });

  it("a DOCTYPE-bearing word/document.xml is neutralized (no entity expansion, no crash), not parsed", async () => {
    const documentXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<!DOCTYPE w:document [<!ENTITY xxe "INJECTED-VALUE">]>` +
      `<w:document ${DOCX_NS}><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>`;
    const buf = await buildDocx({ documentXml });
    const a = await analyzeDocx(buf);
    // The whole part fails to parse (parseXml's DOCTYPE guard), so nothing
    // is extracted from it — critically, the injected entity value never
    // surfaces anywhere in the analysis.
    expect(a.paragraphCount).toBe(0);
    expect(a.headings).toEqual([]);
    expect(JSON.stringify(a)).not.toContain("INJECTED-VALUE");
  });

  it("a DOCTYPE elsewhere (e.g. styles.xml) is neutralized without crashing the whole analysis", async () => {
    // The Heading1 style IS legitimately defined here — if the DOCTYPE guard
    // did NOT neutralize this part, fast-xml-parser would parse it fine (no
    // SYSTEM/parameter entity, just a simple leaf &xxe;) and the "Still
    // readable" paragraph below would be recognized as a real heading. With
    // the guard, this whole part fails to parse, so it isn't.
    const stylesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<!DOCTYPE w:styles [<!ENTITY xxe "INJECTED-VALUE">]>` +
      `<w:styles ${DOCX_NS}>` +
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
      `&xxe;` +
      `</w:styles>`;
    const buf = await buildDocx({
      stylesXml,
      body: styledParagraph("Heading1", "Still readable"),
    });
    const a = await analyzeDocx(buf);
    // styles.xml failing to parse means no heading-style map is built, so
    // the "Heading1"-styled paragraph is no longer recognized as a heading
    // — but the analysis still completes without crashing or leaking the
    // injected value.
    expect(a.paragraphCount).toBe(1);
    expect(a.headings).toEqual([]);
    expect(JSON.stringify(a)).not.toContain("INJECTED-VALUE");
  });
});

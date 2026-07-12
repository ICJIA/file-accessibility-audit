/**
 * Tests for the DOCX (OOXML / WordprocessingML) accessibility extractor.
 * Buffers are assembled by the minimalDocx helper — real, unzippable .docx
 * packages — so the extractor is exercised end to end (unzip + XML parse),
 * not against a mock.
 */
import { describe, it, expect } from "vitest";
import {
  buildDocx,
  styledParagraph,
  paragraph,
  inlineImage,
  table,
  hyperlink,
  hyperlinkRels,
  listItem,
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
    expect(r.images).toEqual([{ altText: "Bar chart of quarterly sales", decorative: false }]);
  });

  it("reports a missing alt text as null", async () => {
    const buf = await buildDocx({ body: inlineImage({}) });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: false }]);
  });

  it("marks decorative images", async () => {
    const buf = await buildDocx({ body: inlineImage({ decorative: true }) });
    const r = await analyzeDocx(buf);
    expect(r.images).toEqual([{ altText: null, decorative: true }]);
  });
});

describe("docx tables", () => {
  it("detects a header row, dimensions, and no nesting", async () => {
    const buf = await buildDocx({
      body: table({ rows: 3, cols: 2, headerRow: true }),
    });
    const r = await analyzeDocx(buf);
    expect(r.tables).toEqual([
      { hasHeaderRow: true, rowCount: 3, colCount: 2, hasNestedTable: false },
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

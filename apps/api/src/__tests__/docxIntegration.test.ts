/**
 * End-to-end DOCX tests on real .docx bytes (built by minimalDocx, unzipped and
 * parsed for real) routed through the dispatcher — the DOCX analogue of
 * integration.test.ts. Proves the whole extract → score → conformance chain
 * produces sensible results, not just the unit pieces.
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
import { analyzeDocument } from "../services/analyzer.js";

describe("docx integration: accessible document", () => {
  it("scores a well-structured Word document highly with no failures", async () => {
    const buf = await buildDocx({
      // default core.xml has a title + creator; default styles declare en-US.
      body:
        styledParagraph("Heading1", "Introduction") +
        paragraph("Body text in an explicit dark color.", { color: "000000" }) +
        styledParagraph("Heading2", "Findings") +
        inlineImage({ descr: "Chart of quarterly totals" }) +
        table({ rows: 3, cols: 2, headerRow: true }) +
        hyperlink("rId5", "Read the full accessibility report") +
        listItem("First point") +
        listItem("Second point"),
      documentRels: hyperlinkRels([
        { id: "rId5", target: "https://example.gov/report" },
      ]),
    });

    const r = await analyzeDocument(buf, "accessible.docx");
    expect(r.fileType).toBe("docx");
    expect(r.docxMetadata?.title).toBe("Quarterly Report");
    expect(r.overallScore).toBeGreaterThanOrEqual(80);
    expect(r.conformance.status).toBe("no-automated-failures");
    // PDF-only signals must be absent.
    expect(r.pdfUa).toBeUndefined();
  });
});

describe("docx integration: inaccessible document", () => {
  it("fails a poorly-authored Word document and cites the right criteria", async () => {
    const buf = await buildDocx({
      // No title.
      coreXml:
        `<?xml version="1.0"?><cp:coreProperties ` +
        `xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`,
      // No language, no heading styles.
      stylesXml:
        `<?xml version="1.0"?><w:styles ` +
        `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      body:
        paragraph("A BIG FAKE HEADING", { bold: true, sizeHalfPt: 36 }) +
        paragraph("Low contrast note", { color: "BBBBBB" }) +
        inlineImage({}) +
        table({ rows: 3, cols: 3 }) +
        paragraph("• manually typed bullet one") +
        paragraph("• manually typed bullet two"),
    });

    const r = await analyzeDocument(buf, "inaccessible.docx");
    expect(r.fileType).toBe("docx");
    expect(r.conformance.status).toBe("fail");
    expect(r.overallScore).toBeLessThan(60);

    const scs = r.conformance.failures.map((f) => f.sc);
    expect(scs).toContain("1.1.1"); // image without alt text
    expect(scs).toContain("2.4.2"); // no document title
    expect(scs).toContain("3.1.1"); // no declared language
    expect(scs).toContain("1.3.1"); // data table without a header row
    expect(scs).toContain("1.4.3"); // low-contrast text
  });
});

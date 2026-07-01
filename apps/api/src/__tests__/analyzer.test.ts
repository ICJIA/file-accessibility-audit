/**
 * Tests for the file-type dispatcher: detectFileType (magic-byte + content
 * classification) and analyzeDocument (routes to the PDF or DOCX pipeline).
 * The PDF branch (analyzePDF) needs the qpdf binary and is covered by
 * integration.test.ts; here we exercise detection and the DOCX branch.
 */
import { describe, it, expect } from "vitest";
import { detectFileType, analyzeDocument } from "../services/analyzer.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPdf, MINIMAL_DOC } from "./helpers/minimalPdf.js";

describe("detectFileType", () => {
  it("identifies a PDF by its header", async () => {
    expect(await detectFileType(buildPdf(MINIMAL_DOC))).toBe("pdf");
  });

  it("identifies a real Word document", async () => {
    expect(await detectFileType(await buildDocx())).toBe("docx");
  });

  it("returns null for a non-document buffer", async () => {
    expect(await detectFileType(Buffer.from("just some text"))).toBeNull();
  });

  it("returns null for a ZIP that is not a Word document", async () => {
    // A zip with no word/document.xml (e.g. a renamed .xlsx) is not a docx.
    const notWord = await buildDocx({ omitDocument: true });
    expect(await detectFileType(notWord)).toBeNull();
  });
});

describe("analyzeDocument", () => {
  it("routes a .docx through the DOCX pipeline", async () => {
    const buf = await buildDocx();
    const r = await analyzeDocument(buf, "report.docx");
    expect(r.fileType).toBe("docx");
    expect(r.filename).toBe("report.docx");
    expect(typeof r.overallScore).toBe("number");
    expect(r.categories.length).toBeGreaterThan(0);
    expect(r.conformance).toBeDefined();
    expect(r.docxMetadata?.title).toBe("Quarterly Report");
  });

  it("omits PDF-only signals for a .docx result", async () => {
    const r = await analyzeDocument(await buildDocx(), "report.docx");
    expect(r.pdfUa).toBeUndefined();
    expect(r.adobeParity).toBeUndefined();
  });

  it("rejects an unsupported file type", async () => {
    await expect(
      analyzeDocument(Buffer.from("not a document"), "mystery.bin"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  });
});

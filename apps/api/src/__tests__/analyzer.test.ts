/**
 * Tests for the file-type dispatcher: detectFileType (magic-byte + content
 * classification) and analyzeDocument (routes to the PDF or DOCX pipeline).
 * The PDF branch (analyzePDF) needs the qpdf binary and is covered by
 * integration.test.ts; here we exercise detection and the DOCX branch.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import JSZip from "jszip";
import { detectFileType, analyzeDocument } from "../services/analyzer.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPdf, MINIMAL_DOC } from "./helpers/minimalPdf.js";
import { buildPptx } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";

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

describe("detectFileType: pptx", () => {
  it("detects a real pptx by content and dispatches to the pptx pipeline", async () => {
    const buf = await buildPptx({ slides: [{ title: "Welcome" }] });
    expect(await detectFileType(buf)).toBe("pptx");
    const r = await analyzeDocument(buf, "deck.pptx");
    expect(r.fileType).toBe("pptx");
    expect(r.pageCount).toBe(1); // slides
    expect(r.pptxMetadata?.title).toBe("Quarterly Briefing");
  });

  it("a renamed pptx is never misread as docx and vice versa", async () => {
    const buf = await buildPptx({ slides: [{ title: "T" }] });
    expect(await detectFileType(buf)).toBe("pptx"); // extension never consulted
  });
});

describe("detectFileType: xlsx", () => {
  it("detects a real xlsx by content and dispatches with sheet-count pageCount", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "A" }, { name: "B" }] });
    expect(await detectFileType(buf)).toBe("xlsx");
    const r = await analyzeDocument(buf, "book.xlsx");
    expect(r.fileType).toBe("xlsx");
    expect(r.pageCount).toBe(2); // sheets
    expect(r.xlsxMetadata?.title).toBe("Grant Ledger");
  });
});

describe("detectFileType: aggregate zip-package limits (C1 DoS hardening)", () => {
  // This detection pass runs in the PARENT process, before dispatch and
  // before the analysis concurrency semaphore is acquired, so an abusive
  // zip must be rejected here too — not only inside analyzeDocx/Pptx/Xlsx
  // once a type is known. See OOXML in #config.
  afterEach(() => {
    vi.doUnmock("#config");
    vi.resetModules();
  });

  it("a zip with more entries than OOXML.MAX_ZIP_ENTRIES is treated as an unsupported/undetectable file, not crashed on", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return { ...actual, OOXML: { ...actual.OOXML, MAX_ZIP_ENTRIES: 5 } };
    });
    const { detectFileType: detect, analyzeDocument: analyze } =
      await import("../services/analyzer.js");
    const { buildDocx: build } = await import("./helpers/minimalDocx.js");
    const base = await build();
    const zip = await JSZip.loadAsync(base);
    for (let i = 0; i < 10; i++) zip.file(`extra/f${i}.xml`, "x", { compression: "STORE" });
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(detect(buf)).resolves.toBeNull();
    await expect(analyze(buf, "bomb.docx")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });
});

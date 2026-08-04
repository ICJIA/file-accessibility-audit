import { describe, it, expect } from "vitest";
import {
  uploadAcceptAttr,
  uploadExtensions,
  uploadNoun,
  uploadNounWithExts,
  unsupportedFormatHint,
} from "../utils/uploadFormats";

const ALL_ON = { docx: true, pptx: true, xlsx: true };
const ALL_OFF = { docx: false, pptx: false, xlsx: false };

describe("uploadFormats", () => {
  it("builds the accept attribute for all four formats", () => {
    expect(uploadAcceptAttr(ALL_ON)).toBe(
      ".pdf,.docx,.pptx,.xlsx," +
        "application/pdf," +
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
        "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("is PDF-only when every optional flag is off", () => {
    expect(uploadAcceptAttr(ALL_OFF)).toBe(".pdf,application/pdf");
    expect(uploadExtensions(ALL_OFF)).toEqual([".pdf"]);
    expect(uploadNoun(ALL_OFF)).toBe("PDF");
  });

  it("drops exactly the disabled format", () => {
    expect(uploadExtensions({ docx: true, pptx: false, xlsx: true })).toEqual([
      ".pdf",
      ".docx",
      ".xlsx",
    ]);
    expect(uploadNoun({ docx: true, pptx: false, xlsx: true })).toBe("PDF, Word, or Excel");
  });

  it("keeps two-format wording comma-free and supports 'and'", () => {
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false })).toBe("PDF or Word");
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false }, "and")).toBe("PDF and Word");
  });

  it("lists all four formats with an Oxford comma", () => {
    expect(uploadNoun(ALL_ON)).toBe("PDF, Word, PowerPoint, or Excel");
    expect(uploadNoun(ALL_ON, "and")).toBe("PDF, Word, PowerPoint, and Excel");
  });

  it("adds extensions to the optional formats in error copy", () => {
    expect(uploadNounWithExts(ALL_ON)).toBe(
      "PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)",
    );
    expect(uploadNounWithExts(ALL_OFF)).toBe("PDF");
  });
});

// ---------------------------------------------------------------------------
// unsupportedFormatHint — specific guidance for formats we recognize but
// cannot audit. Two groups, deliberately worded differently: the legacy OLE
// binary Office files (.doc/.xls/.ppt, and .rtf alongside them), which really
// are a different format from the OOXML this tool audits rather than an older
// version of it — and CSV, which is not a broken choice at all.
// ---------------------------------------------------------------------------
describe("unsupportedFormatHint", () => {
  it("names the modern format and the Save As fix for a legacy .xls file", () => {
    const message = unsupportedFormatHint("report.xls");
    expect(message).toContain(".xls");
    expect(message).toContain(".xlsx");
    expect(message).toContain("Excel");
    expect(message).toContain("Save As");
  });

  it("names the modern format and the Save As fix for a legacy .doc file", () => {
    const message = unsupportedFormatHint("letter.doc");
    expect(message).toContain(".doc");
    expect(message).toContain(".docx");
    expect(message).toContain("Word");
    expect(message).toContain("Save As");
  });

  it("names the modern format and the Save As fix for a legacy .ppt file", () => {
    const message = unsupportedFormatHint("deck.ppt");
    expect(message).toContain(".ppt");
    expect(message).toContain(".pptx");
    expect(message).toContain("PowerPoint");
    expect(message).toContain("Save As");
  });

  it("matches the extension case-insensitively", () => {
    expect(unsupportedFormatHint("REPORT.XLS")).toContain(".xlsx");
    expect(unsupportedFormatHint("Letter.Doc")).toContain(".docx");
  });

  it("returns null for the modern OOXML formats this tool supports", () => {
    expect(unsupportedFormatHint("report.xlsx")).toBeNull();
    expect(unsupportedFormatHint("letter.docx")).toBeNull();
    expect(unsupportedFormatHint("deck.pptx")).toBeNull();
    expect(unsupportedFormatHint("report.pdf")).toBeNull();
  });

  it("returns null for unrelated, non-Office file types", () => {
    expect(unsupportedFormatHint("photo.jpg")).toBeNull();
    expect(unsupportedFormatHint("archive.zip")).toBeNull();
  });

  it("returns null when the filename has no extension", () => {
    expect(unsupportedFormatHint("README")).toBeNull();
  });

  it("covers .rtf, which is text rather than an OLE binary but the same problem", () => {
    const message = unsupportedFormatHint("memo.rtf");
    expect(message).toContain(".rtf");
    expect(message).toContain(".docx");
    expect(message).toContain("Save As");
  });

  it("sets the expectation that converting does not add accessibility structure", () => {
    // Without this, people convert, re-upload, score badly, and feel misled by
    // the tool that told them to convert.
    for (const name of ["a.doc", "b.xls", "c.ppt", "d.rtf"]) {
      expect(unsupportedFormatHint(name)).toContain("not accessibility structure");
    }
  });

  // -- CSV is a different message, on purpose ---------------------------------

  it("tells a CSV author there is nothing to audit, not to convert", () => {
    const message = unsupportedFormatHint("data.csv");
    expect(message).toContain("CSV");
    expect(message).toContain("no accessibility structure");
    // The single most important assertion here: converting a CSV to .xlsx to
    // score better is bad advice — it produces a worse artifact and a
    // meaningless grade. The copy must never tell anyone to do it.
    expect(message).not.toContain("Save As");
    expect(message).not.toMatch(/re-save|save as/i);
  });

  it("says a CSV is often the right format rather than a defect", () => {
    const message = unsupportedFormatHint("data.csv")!;
    expect(message).toContain("not a defect");
    expect(message).toContain("often the right format");
  });

  it("points a CSV author at the page that links the file", () => {
    expect(unsupportedFormatHint("data.csv")).toContain("the page that links it");
  });

  it("treats .tsv as the same case as .csv", () => {
    expect(unsupportedFormatHint("export.tsv")).toBe(unsupportedFormatHint("export.csv"));
  });
});

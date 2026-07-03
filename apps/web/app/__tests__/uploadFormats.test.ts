import { describe, it, expect } from "vitest";
import {
  uploadAcceptAttr,
  uploadExtensions,
  uploadNoun,
  uploadNounWithExts,
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
    expect(uploadNoun({ docx: true, pptx: false, xlsx: true })).toBe(
      "PDF, Word, or Excel",
    );
  });

  it("keeps two-format wording comma-free and supports 'and'", () => {
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false })).toBe(
      "PDF or Word",
    );
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false }, "and")).toBe(
      "PDF and Word",
    );
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

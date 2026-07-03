import { describe, it, expect } from "vitest";
import {
  BANNER_EYEBROW,
  bannerMetaLine,
  fileTypeLabel,
  pageNoun,
} from "../utils/reportBanner";

describe("reportBanner", () => {
  it("uses the agreed eyebrow label", () => {
    expect(BANNER_EYEBROW).toBe("ACCESSIBILITY REPORT FOR");
  });

  it("formats a plural page count with the PDF type", () => {
    expect(bannerMetaLine(12)).toBe("12 pages · PDF");
  });

  it("uses the singular 'page' for a one-page document", () => {
    expect(bannerMetaLine(1)).toBe("1 page · PDF");
  });

  it("labels Word documents when fileType is docx", () => {
    expect(bannerMetaLine(3, "docx")).toBe("3 pages · Word");
    expect(bannerMetaLine(1, "docx")).toBe("1 page · Word");
  });

  it("labels PowerPoint decks and counts slides", () => {
    expect(bannerMetaLine(9, "pptx")).toBe("9 slides · PowerPoint");
    expect(bannerMetaLine(1, "pptx")).toBe("1 slide · PowerPoint");
  });

  it("labels Excel workbooks and counts sheets", () => {
    expect(bannerMetaLine(4, "xlsx")).toBe("4 sheets · Excel");
    expect(bannerMetaLine(1, "xlsx")).toBe("1 sheet · Excel");
  });

  it("falls back to pages · PDF for an unknown stored fileType", () => {
    // /report/:id renders attacker-controlled stored JSON — an unrecognized
    // fileType string must degrade to the PDF wording, never throw.
    expect(bannerMetaLine(2, "exe")).toBe("2 pages · PDF");
    expect(bannerMetaLine(2, undefined)).toBe("2 pages · PDF");
  });

  it("exposes the shared label and noun lookups", () => {
    expect(fileTypeLabel("pptx")).toBe("PowerPoint");
    expect(fileTypeLabel("xlsx")).toBe("Excel");
    expect(fileTypeLabel("docx")).toBe("Word");
    expect(fileTypeLabel(undefined)).toBe("PDF");
    expect(pageNoun("pptx")).toBe("slide");
    expect(pageNoun("xlsx")).toBe("sheet");
    expect(pageNoun("docx")).toBe("page");
  });
});

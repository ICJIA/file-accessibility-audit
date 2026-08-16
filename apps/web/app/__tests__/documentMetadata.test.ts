import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { metadataItemsFor, sourceTieInLine, formatMetaDate } from "../utils/documentMetadata";
import { isInDesignCreator, buildActionPlan } from "../utils/actionPlan";
import DocumentMetadataCard from "../components/DocumentMetadataCard.vue";

// User request 2026-08-16 (following the InDesign-aware fix steps): readers
// may not know what program made a document or when — the report must SHOW
// the stored metadata where the fix steps are read, in both views, and say
// out loud why the steps target the app they target.

const PDF_META = {
  creator: "Adobe InDesign 21.4 (Macintosh)",
  producer: "Adobe PDF Library 17.0",
  pdfVersion: "1.7",
  pageCount: 18,
  author: "ICJIA",
  subject: null,
  keywords: null,
  creationDate: "2024-03-15T10:30:00Z",
  modDate: null,
  isEncrypted: false,
};

describe("metadataItemsFor", () => {
  it("returns the full PDF inventory — the same rows as the Detailed panel", () => {
    const items = metadataItemsFor({ pdfMetadata: PDF_META });
    expect(items.map((i) => i.label)).toEqual([
      "Source Application",
      "PDF Producer",
      "PDF Version",
      "Page Count",
      "Author",
      "Subject",
      "Keywords",
      "Created",
      "Last Modified",
      "Encrypted",
    ]);
    expect(items.find((i) => i.label === "Source Application")!.value).toBe(
      "Adobe InDesign 21.4 (Macintosh)",
    );
    expect(items.find((i) => i.label === "Encrypted")!.value).toBe("No");
  });

  it("keeps a real zero count as the digit 0, never a missing value", () => {
    const items = metadataItemsFor({
      fileType: "docx",
      docxMetadata: { title: null, creator: null, language: null, pageCount: 0, wordCount: 0 },
    });
    expect(items.find((i) => i.label === "Pages")!.value).toBe("0");
    expect(items.find((i) => i.label === "Words")!.value).toBe("0");
  });

  it("discriminates by fileType, falling back when fileType is missing (old reports)", () => {
    const pptxMeta = { title: "Deck", creator: "PowerPoint", language: null, slideCount: 3 };
    expect(metadataItemsFor({ fileType: "docx", pptxMetadata: pptxMeta })).toEqual([]);
    expect(metadataItemsFor({ pptxMetadata: pptxMeta }).map((i) => i.label)).toEqual([
      "Title",
      "Creator",
      "Language",
      "Slides",
    ]);
  });

  it("returns [] when the report carries no metadata object at all", () => {
    expect(metadataItemsFor({})).toEqual([]);
  });

  it("formats dates the way the Detailed panel always has, passing junk through", () => {
    expect(formatMetaDate("2024-03-15T10:30:00Z")).toContain("March 15, 2024");
    expect(formatMetaDate(null)).toBeNull();
    expect(formatMetaDate(undefined)).toBeNull();
  });
});

describe("sourceTieInLine", () => {
  it("names InDesign when the creator matches", () => {
    const line = sourceTieInLine({ fileType: "pdf", pdfMetadata: PDF_META });
    expect(line).toContain("Adobe InDesign");
    expect(line).toContain("source application");
  });

  it("names Word when the document records Word", () => {
    const line = sourceTieInLine({
      fileType: "pdf",
      pdfMetadata: { ...PDF_META, creator: "Microsoft® Word for Microsoft 365" },
    });
    expect(line).toContain("Microsoft Word");
    expect(line).toContain("records");
  });

  it("falls back honestly for a missing or unrecognized creator", () => {
    for (const creator of [null, "Canon iR-ADV C5560"]) {
      const line = sourceTieInLine({
        fileType: "pdf",
        pdfMetadata: { ...PDF_META, creator },
      });
      expect(line).toContain("Microsoft Word");
      expect(line).toMatch(/different program/i);
    }
  });

  it("tells Office authors the uploaded file IS the source", () => {
    expect(sourceTieInLine({ fileType: "docx" })).toContain("Microsoft Word");
    expect(sourceTieInLine({ fileType: "pptx" })).toContain("PowerPoint");
    expect(sourceTieInLine({ fileType: "xlsx" })).toContain("Excel");
    expect(sourceTieInLine({ fileType: "docx" })).toMatch(/file you uploaded/i);
  });

  it("can never disagree with the plan's own InDesign detection", () => {
    const creators = [
      "Adobe InDesign 21.4 (Macintosh)",
      "adobe indesign 16.0",
      "Microsoft® Word for Microsoft 365",
      null,
    ];
    for (const creator of creators) {
      const swapped = buildActionPlan(
        [{ id: "alt_text", label: "Alt Text", severity: "Critical", findings: [] }],
        "pdf",
        creator,
      )[0]!.routes[0]!.label.includes("InDesign");
      expect(swapped, String(creator)).toBe(isInDesignCreator(creator));
      if (isInDesignCreator(creator)) {
        expect(sourceTieInLine({ fileType: "pdf", pdfMetadata: { creator } })).toContain(
          "Adobe InDesign",
        );
      }
    }
  });
});

describe("DocumentMetadataCard", () => {
  const result = { fileType: "pdf", pdfMetadata: PDF_META, categories: [] };

  it("renders every row — Not set for missing values — under the About heading", () => {
    const w = mount(DocumentMetadataCard, { props: { result } });
    expect(w.find('[data-testid="about-document"]').exists()).toBe(true);
    expect(w.text()).toContain("About this document");
    expect(w.text()).toContain("Adobe InDesign 21.4 (Macintosh)");
    expect(w.text()).toContain("March 15, 2024");
    expect(w.text()).toContain("Not set");
  });

  it("carries the fix-step tie-in line so the steps make sense", () => {
    const w = mount(DocumentMetadataCard, { props: { result } });
    expect(w.text()).toContain("fix steps");
    expect(w.text()).toContain("Adobe InDesign");
  });

  it("says plainly when the file records nothing at all — and still states the assumption", () => {
    const w = mount(DocumentMetadataCard, { props: { result: { fileType: "pdf" } } });
    expect(w.find('[data-testid="about-document"]').exists()).toBe(true);
    expect(w.text()).toMatch(/doesn't record/i);
    expect(w.text()).toContain("Microsoft Word");
  });

  it("survives a null result on a shared report", () => {
    expect(() => mount(DocumentMetadataCard, { props: { result: null } })).not.toThrow();
  });
});

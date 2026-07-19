import { describe, it, expect } from "vitest";
import { PPTX, WCAG_CATEGORY_MAP } from "#config";
import { scorePptx } from "../services/scorer.js";
import type { PptxAnalysis } from "../services/pptxService.js";

describe("PPTX config", () => {
  it("is enabled by default with the spec caps and weights", () => {
    expect(PPTX.ENABLED).toBe(true);
    expect(PPTX.MIME_TYPE).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(PPTX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024);
    expect(PPTX.MAX_SLIDES).toBe(2000);
    expect(PPTX.MAX_SHAPES).toBe(100_000);
    expect(PPTX.ANALYSIS_TIMEOUT_MS).toBe(20_000);
    const w = PPTX.SCORING_WEIGHTS;
    expect(w.text_extractability).toBe(0.05);
    expect(w.title_language).toBe(0.14);
    expect(w.slide_titles).toBe(0.18);
    expect(w.alt_text).toBe(0.18);
    expect(w.reading_order).toBe(0.1);
    expect(w.table_markup).toBe(0.1);
    expect(w.color_contrast).toBe(0.1);
    expect(w.list_structure).toBe(0.07);
    expect(w.link_quality).toBe(0.08);
  });

  it("slide_titles is registered in the WCAG category map", () => {
    expect(WCAG_CATEGORY_MAP.slide_titles).toEqual([
      { sc: "1.3.1", name: "Info and Relationships", level: "A" },
      { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
    ]);
  });
});

function baseAnalysis(over: Partial<PptxAnalysis> = {}): PptxAnalysis {
  return {
    metadata: { title: "Deck", creator: "x", language: "en-US", slideCount: 2 },
    slides: [
      { index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: "Agenda", titleIsFirstShape: true, shapeCount: 3 },
    ],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
    ...over,
  };
}

describe("scorePptx", () => {
  it("scores a clean deck high with the docx-shaped result", () => {
    const r = scorePptx(baseAnalysis());
    expect(r.overallScore).toBeGreaterThanOrEqual(90);
    expect(r.scoringMode).toBe("strict");
    expect(r.conformance.status).toBe("no-automated-failures");
    const ids = r.categories.map((c) => c.id);
    expect(ids).toContain("slide_titles");
    expect(ids).toContain("reading_order");
    expect(ids).not.toContain("heading_structure");
    expect(ids).not.toContain("bookmarks");
  });

  it("slide_titles scores proportionally (floor 40 / cap 85) and deducts duplicates", () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 },
          { index: 2, title: "Update", titleIsFirstShape: true, shapeCount: 1 },
          { index: 3, title: "Update", titleIsFirstShape: true, shapeCount: 1 },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "slide_titles")!;
    // 2 of 3 titled → clamp(67, 40..85) = 67, minus 10 for one duplicate group.
    expect(cat.score).toBe(57);
    expect(cat.findings.join(" ")).toContain("Slide 1");
    expect(cat.findings.join(" ")).toContain('"Update"');
  });

  it("slide_titles: a large mostly-titled deck is Minor, not zero", () => {
    const slides = Array.from({ length: 100 }, (_, i) => ({
      index: i + 1,
      title: i < 95 ? `Topic ${i + 1}` : null,
      titleIsFirstShape: true,
      shapeCount: 1,
    }));
    const r = scorePptx(baseAnalysis({ slides }));
    // 95% titled — the old linear −20/slide scored this 0/Critical.
    expect(r.categories.find((c) => c.id === "slide_titles")!.score).toBe(85);
  });

  it("hidden slides are excluded from slide-title judgment", () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: "Only visible", titleIsFirstShape: true, shapeCount: 1 },
          { index: 2, title: null, titleIsFirstShape: false, shapeCount: 1, hidden: true },
        ],
      }),
    );
    expect(r.categories.find((c) => c.id === "slide_titles")!.score).toBe(100);
  });

  it("reading_order is not assessed when no visible slide has a title", () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [{ index: 1, title: null, titleIsFirstShape: false, shapeCount: 3 }],
      }),
    );
    expect(r.categories.find((c) => c.id === "reading_order")!.score).toBeNull();
  });

  it("reading_order deducts for title-not-first and advises on shape-heavy slides", () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [{ index: 1, title: "T", titleIsFirstShape: false, shapeCount: 12 }],
      }),
    );
    const cat = r.categories.find((c) => c.id === "reading_order")!;
    expect(cat.score).toBe(85);
    expect(cat.findings.join(" ")).toMatch(/12 shapes/);
  });

  it("link_quality: raw URLs advisory-only, vague phrases penalized (PDF-parity doctrine)", () => {
    const r = scorePptx(
      baseAnalysis({
        links: [
          { text: "https://example.gov/x", url: "https://example.gov/x" },
          { text: "click here", url: "https://example.gov/y" },
          { text: "Program overview", url: "https://example.gov/z" },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    // raw URL satisfies 2.4.4 (advisory); "click here" is the real violation.
    expect(cat.score).toBe(67);
    expect(cat.findings.join(" ")).toContain("not scored against you");
  });

  it("alt_text caps at 85 with any missing alt and is N/A when all images are decorative", () => {
    const capped = scorePptx(
      baseAnalysis({
        images: [
          { altText: null, decorative: false, titleOnly: false },
          ...Array.from({ length: 39 }, () => ({
            altText: "ok",
            decorative: false,
            titleOnly: false,
          })),
        ],
      }),
    );
    expect(capped.categories.find((c) => c.id === "alt_text")!.score).toBe(85);

    const allDecorative = scorePptx(
      baseAnalysis({ images: [{ altText: null, decorative: true, titleOnly: false }] }),
    );
    expect(allDecorative.categories.find((c) => c.id === "alt_text")!.score).toBe(null);
  });

  it("null-scores empty categories so they renormalize away", () => {
    const r = scorePptx(
      baseAnalysis({ contrast: { checkedRuns: 0, unresolvedRuns: 3, failing: [] } }),
    );
    expect(r.categories.find((c) => c.id === "alt_text")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "table_markup")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "color_contrast")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "form_accessibility")!.notAssessed).toBe(true);
  });
});

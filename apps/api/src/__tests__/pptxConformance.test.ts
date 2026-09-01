import { describe, it, expect } from "vitest";
import { evaluatePptxConformance } from "../services/scoring/conformance.js";
import type { PptxAnalysis } from "../services/pptxService.js";

function analysis(over: Partial<PptxAnalysis>): PptxAnalysis {
  return {
    metadata: { title: "Deck", creator: null, language: "en-US", slideCount: 1 },
    slides: [{ index: 1, title: "T", titleIsFirstShape: true, shapeCount: 1 }],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 1,
    ...over,
  };
}

describe("evaluatePptxConformance", () => {
  it("is clean for a well-formed deck", () => {
    const v = evaluatePptxConformance(analysis({}));
    expect(v.status).toBe("no-automated-failures");
    expect(v.failures).toEqual([]);
  });

  it("fires 1.1.1 / 2.4.2 / 3.1.1 / 1.3.1 / 1.4.3 on confirmed violations", () => {
    const v = evaluatePptxConformance(
      analysis({
        metadata: { title: null, creator: null, language: null, slideCount: 1 },
        images: [{ altText: null, decorative: false, titleOnly: false }],
        tables: [{ hasHeaderRow: false, rowCount: 3, colCount: 3 }],
        contrast: {
          checkedRuns: 1,
          unresolvedRuns: 0,
          failing: [
            { text: "x", ratio: 1.4, foreground: "#DDDDDD", background: "#FFFFFF", large: false },
          ],
        },
      }),
    );
    expect(v.status).toBe("fail");
    expect(v.failures.map((f) => f.sc).sort()).toEqual([
      "1.1.1",
      "1.3.1",
      "1.4.3",
      "2.4.2",
      "3.1.1",
    ]);
  });

  it("fires 1.3.1 for hand-typed bullets — the scorer deducts, so the verdict must attribute", () => {
    // The Word gate has carried this rule since 2026-08-31; PowerPoint's
    // scorer deducts identically (list_structure down to 0) but the pptx
    // gate had no list rule at all — a deck capped at D with no criterion.
    const v = evaluatePptxConformance(
      analysis({ lists: { realListItems: 0, manualBulletParagraphs: 3 } }),
    );
    expect(v.status).toBe("fail");
    expect(
      v.failures.some((f) => f.sc === "1.3.1" && f.category === "list_structure"),
    ).toBe(true);
  });

  it("does NOT fire for untitled slides (scoring-only) and lists media as not assessed", () => {
    const v = evaluatePptxConformance(
      analysis({
        slides: [{ index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 }],
        hasMedia: true,
      }),
    );
    expect(v.status).toBe("no-automated-failures");
    expect(v.notAssessed.map((n) => n.sc)).toContain("1.2.2");
  });
});

describe("universally-unassessed criteria are disclosed (pptx)", () => {
  it("lists 3.1.2 / 1.4.1 / 1.4.5 / 1.4.11 / 1.3.3 as not assessed", () => {
    const v = evaluatePptxConformance(analysis({}));
    const scs = v.notAssessed.map((n) => n.sc);
    for (const sc of ["3.1.2", "1.4.1", "1.4.5", "1.4.11", "1.3.3"]) {
      expect(scs, sc).toContain(sc);
    }
  });
});

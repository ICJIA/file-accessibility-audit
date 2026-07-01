/**
 * Tests for the DOCX conformance gate — the binary WCAG verdict for Word
 * documents. Mirrors the PDF gate's discipline: it fires only on confirmed,
 * machine-checkable violations, never on heuristic signals (fake headings,
 * manual bullets stay in scoring, not here).
 */
import { describe, it, expect } from "vitest";
import { evaluateDocxConformance } from "../services/scoring/conformance.js";
import type { DocxAnalysis } from "../services/docxService.js";

/** A clean, fully-conformant analysis; override per test. */
function analysis(over: Partial<DocxAnalysis> = {}): DocxAnalysis {
  return {
    metadata: {
      title: "Quarterly Report",
      creator: "Author",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [{ level: 1, text: "Intro" }],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 5, unresolvedRuns: 0, failing: [] },
    paragraphCount: 4,
    ...over,
  };
}

describe("evaluateDocxConformance", () => {
  it("passes a clean document with no automated failures", () => {
    const v = evaluateDocxConformance(analysis());
    expect(v.status).toBe("no-automated-failures");
    expect(v.failures).toEqual([]);
  });

  it("fails 1.1.1 when a non-decorative image lacks alt text", () => {
    const v = evaluateDocxConformance(
      analysis({ images: [{ altText: null, decorative: false }] }),
    );
    expect(v.status).toBe("fail");
    expect(v.failures.some((f) => f.sc === "1.1.1")).toBe(true);
  });

  it("does not fail 1.1.1 for a decorative image with no alt text", () => {
    const v = evaluateDocxConformance(
      analysis({ images: [{ altText: null, decorative: true }] }),
    );
    expect(v.failures.some((f) => f.sc === "1.1.1")).toBe(false);
  });

  it("fails 2.4.2 when the document has no title", () => {
    const v = evaluateDocxConformance(
      analysis({
        metadata: { ...analysis().metadata, title: null },
      }),
    );
    expect(v.failures.some((f) => f.sc === "2.4.2")).toBe(true);
  });

  it("fails 3.1.1 when no language is declared", () => {
    const v = evaluateDocxConformance(
      analysis({
        metadata: { ...analysis().metadata, language: null },
      }),
    );
    expect(v.failures.some((f) => f.sc === "3.1.1")).toBe(true);
  });

  it("fails 1.3.1 for a data table with no header row", () => {
    const v = evaluateDocxConformance(
      analysis({
        tables: [
          { hasHeaderRow: false, rowCount: 3, colCount: 3, hasNestedTable: false },
        ],
      }),
    );
    expect(v.failures.some((f) => f.sc === "1.3.1")).toBe(true);
  });

  it("does not fail 1.3.1 for a single-row (layout-like) headerless table", () => {
    const v = evaluateDocxConformance(
      analysis({
        tables: [
          { hasHeaderRow: false, rowCount: 1, colCount: 3, hasNestedTable: false },
        ],
      }),
    );
    expect(v.failures.some((f) => f.sc === "1.3.1")).toBe(false);
  });

  it("fails 1.4.3 for confirmed low-contrast text", () => {
    const v = evaluateDocxConformance(
      analysis({
        contrast: {
          checkedRuns: 3,
          unresolvedRuns: 0,
          failing: [
            {
              text: "hard to read",
              ratio: 2.1,
              foreground: "#999999",
              background: "#FFFFFF",
              large: false,
            },
          ],
        },
      }),
    );
    expect(v.failures.some((f) => f.sc === "1.4.3")).toBe(true);
  });

  it("always lists reading order (1.3.2) as not assessed", () => {
    const v = evaluateDocxConformance(analysis());
    expect(v.notAssessed.some((c) => c.sc === "1.3.2")).toBe(true);
  });

  it("lists 1.4.3 as not assessed only when no runs were checkable", () => {
    const unchecked = evaluateDocxConformance(
      analysis({ contrast: { checkedRuns: 0, unresolvedRuns: 4, failing: [] } }),
    );
    expect(unchecked.notAssessed.some((c) => c.sc === "1.4.3")).toBe(true);

    const checked = evaluateDocxConformance(analysis());
    expect(checked.notAssessed.some((c) => c.sc === "1.4.3")).toBe(false);
  });
});

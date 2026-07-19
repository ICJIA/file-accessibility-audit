/**
 * Integration tests for scoreDocx() — maps a DocxAnalysis onto the shared
 * scoring model (same CategoryResult shape, grade/severity thresholds, WCAG
 * map, weighted-average renormalization, and conformance-verdict shape the PDF
 * pipeline uses), with DOCX-specific weights and N/A categories.
 */
import { describe, it, expect } from "vitest";
import { scoreDocx } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";

/** A clean, fully-accessible analysis; override per test. */
function analysis(over: Partial<DocxAnalysis> = {}): DocxAnalysis {
  return {
    metadata: {
      title: "Quarterly Report",
      creator: "Author",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [
      { level: 1, text: "Introduction" },
      { level: 2, text: "Details" },
    ],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 6,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
    ...over,
  };
}

describe("scoreDocx", () => {
  it("scores a clean, accessible document as grade A with no failures", () => {
    const r = scoreDocx(
      analysis({
        images: [{ altText: "Sales chart", decorative: false, titleOnly: false }],
        tables: [{ hasHeaderRow: true, rowCount: 3, colCount: 2, hasNestedTable: false }],
      }),
    );
    expect(r.overallScore).toBeGreaterThanOrEqual(90);
    expect(r.grade).toBe("A");
    expect(r.conformance.status).toBe("no-automated-failures");
  });

  it("gives Text Extractability an automatic pass", () => {
    const t = scoreDocx(analysis()).categories.find((c) => c.id === "text_extractability");
    expect(t?.score).toBe(100);
  });

  it("marks Reading Order and Form Accessibility as not assessed (null)", () => {
    const cats = scoreDocx(analysis()).categories;
    expect(cats.find((c) => c.id === "reading_order")?.score).toBeNull();
    expect(cats.find((c) => c.id === "form_accessibility")?.score).toBeNull();
  });

  it("includes the DOCX-specific list_structure category with its WCAG map", () => {
    const list = scoreDocx(
      analysis({ lists: { realListItems: 3, manualBulletParagraphs: 0 } }),
    ).categories.find((c) => c.id === "list_structure");
    expect(list).toBeDefined();
    expect(list?.wcagCriteria?.some((w) => w.sc === "1.3.1")).toBe(true);
  });

  it("omits PDF-only signals (pdfUa, adobeParity)", () => {
    const r = scoreDocx(analysis());
    expect(r.pdfUa).toBeUndefined();
    expect(r.adobeParity).toBeUndefined();
  });

  it("excludes N/A categories from the weighted average", () => {
    const r = scoreDocx(
      analysis({
        images: [],
        tables: [],
        links: [],
        contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
      }),
    );
    expect(r.categories.find((c) => c.id === "alt_text")?.score).toBeNull();
    expect(r.categories.find((c) => c.id === "table_markup")?.score).toBeNull();
    // Only text/title/heading apply, all perfect → still a top score.
    expect(r.overallScore).toBeGreaterThanOrEqual(90);
  });

  it("caps the heading-skip deduction so many skips do not zero the category", () => {
    const r = scoreDocx(
      analysis({
        headings: [
          { level: 1, text: "a" },
          { level: 3, text: "b" },
          { level: 1, text: "c" },
          { level: 3, text: "d" },
          { level: 5, text: "e" },
          { level: 1, text: "f" },
          { level: 3, text: "g" },
        ],
      }),
    );
    // 4 skips × 15 = 60 uncapped; capped at 30 → 70.
    expect(r.categories.find((c) => c.id === "heading_structure")!.score).toBe(70);
  });

  it("counts Title-only images as missing alt with a targeted advisory", () => {
    const r = scoreDocx(
      analysis({ images: [{ altText: null, decorative: false, titleOnly: true }] }),
    );
    const cat = r.categories.find((c) => c.id === "alt_text")!;
    expect(cat.score).toBe(0);
    expect(cat.findings.join(" ")).toContain("Title");
  });

  it("notes empty heading paragraphs as an advisory without deducting", () => {
    const r = scoreDocx(analysis({ emptyHeadingCount: 2 }));
    const cat = r.categories.find((c) => c.id === "heading_structure")!;
    expect(cat.score).toBe(100);
    expect(cat.findings.join(" ")).toMatch(/empty/i);
  });

  it("link_quality: raw-URL links are advisory only — never penalized (PDF-parity doctrine)", () => {
    const r = scoreDocx(
      analysis({
        links: [
          { text: "https://example.gov/report.pdf", url: "https://example.gov/report.pdf" },
          { text: "www.example.gov/data.csv", url: "https://example.gov/data.csv" },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    expect(cat.score).toBe(100);
    expect(cat.findings.join(" ")).toContain("not scored against you");
  });

  it("link_quality: vague and empty link text is penalized", () => {
    const r = scoreDocx(
      analysis({
        links: [
          { text: "click here", url: "https://example.gov/a" },
          { text: "Annual Report 2024", url: "https://example.gov/b" },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    expect(cat.score).toBe(50);
  });

  it("fails an inaccessible document and grades it F", () => {
    const r = scoreDocx(
      analysis({
        metadata: {
          title: null,
          creator: null,
          language: null,
          pageCount: 1,
          wordCount: 10,
        },
        headings: [],
        fakeHeadings: [{ text: "Looks Like A Heading" }],
        images: [{ altText: null, decorative: false, titleOnly: false }],
        tables: [{ hasHeaderRow: false, rowCount: 3, colCount: 3, hasNestedTable: false }],
        contrast: {
          checkedRuns: 2,
          unresolvedRuns: 0,
          failing: [
            {
              text: "low",
              ratio: 1.5,
              foreground: "#FFFF00",
              background: "#FFFFFF",
              large: false,
            },
          ],
        },
      }),
    );
    expect(r.conformance.status).toBe("fail");
    expect(r.overallScore).toBeLessThan(60);
    expect(r.grade).toBe("F");
  });

  it("uses Word-appropriate wording in the executive summary", () => {
    const summary = scoreDocx(analysis()).executiveSummary;
    expect(summary).toContain("Word document");
    expect(summary).not.toContain("PDF");
  });
});

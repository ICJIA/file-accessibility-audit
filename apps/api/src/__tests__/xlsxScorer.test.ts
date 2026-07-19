import { describe, it, expect } from "vitest";
import { XLSX, WCAG_CATEGORY_MAP } from "#config";
import { scoreXlsx } from "../services/scorer.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";

describe("XLSX config", () => {
  it("is enabled by default with the spec caps and weights", () => {
    expect(XLSX.ENABLED).toBe(true);
    expect(XLSX.MIME_TYPE).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(XLSX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024);
    expect(XLSX.MAX_SHEETS).toBe(200);
    expect(XLSX.MAX_CELLS).toBe(1_000_000);
    expect(XLSX.MAX_DRAWING_OBJECTS).toBe(100_000);
    expect(XLSX.MAX_HYPERLINKS).toBe(100_000);
    expect(XLSX.MAX_TABLES).toBe(10_000);
    // RB3-3 [pre-merge re-audit]: tightened from 10_000 -> 1_000 — the old
    // count-only cap never engaged against a few large, object-sparse
    // drawing parts (see MAX_AUX_PART_BYTES below, which closes that gap).
    expect(XLSX.MAX_DRAWING_RELS).toBe(1_000);
    expect(XLSX.MAX_AUX_PART_BYTES).toBe(48 * 1024 * 1024);
    expect(XLSX.ANALYSIS_TIMEOUT_MS).toBe(20_000);
    const w = XLSX.SCORING_WEIGHTS;
    expect(w.text_extractability).toBe(0.05);
    expect(w.title_language).toBe(0.12);
    expect(w.sheet_names).toBe(0.18);
    expect(w.table_markup).toBe(0.25);
    expect(w.alt_text).toBe(0.18);
    expect(w.color_contrast).toBe(0.12);
    expect(w.link_quality).toBe(0.1);
  });

  it("title_language scores 50 when only the title is missing (parity with other formats)", () => {
    const r = scoreXlsx(
      baseAnalysis({ metadata: { title: null, creator: "x", sheetCount: 1 } }),
    );
    expect(r.categories.find((c) => c.id === "title_language")!.score).toBe(50);
  });

  it("sheet_names scores proportionally with floor 40 / cap 85", () => {
    const mk = (name: string, defaultNamed: boolean) => ({
      name,
      hidden: false,
      defaultNamed,
      mergedRangeCount: 0,
      usedRangeCellCount: 80,
      hasDefinedTable: true,
    });
    const many = scoreXlsx(
      baseAnalysis({
        sheets: [
          ...Array.from({ length: 16 }, (_, i) => mk(`Data ${i + 1}`, false)),
          ...Array.from({ length: 4 }, (_, i) => mk(`Sheet${i + 1}`, true)),
        ],
      }),
    );
    expect(many.categories.find((c) => c.id === "sheet_names")!.score).toBe(80);

    const single = scoreXlsx(baseAnalysis({ sheets: [mk("Sheet1", true)] }));
    expect(single.categories.find((c) => c.id === "sheet_names")!.score).toBe(40);
  });

  it("table_markup: merged cells are a note, not a deduction", () => {
    const r = scoreXlsx(
      baseAnalysis({
        sheets: [
          {
            name: "FY26 Grants",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 6,
            usedRangeCellCount: 80,
            hasDefinedTable: true,
          },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "table_markup")!;
    expect(cat.score).toBe(100);
    expect(cat.findings.join(" ")).toContain("merged");
  });

  it("table_markup caps at 60 when dataful sheets have no defined table at all", () => {
    const r = scoreXlsx(
      baseAnalysis({
        tables: [],
        sheets: [
          {
            name: "Raw data",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 0,
            usedRangeCellCount: 500,
            hasDefinedTable: false,
          },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "table_markup")!;
    expect(cat.score).toBe(60);
    expect(cat.findings.join(" ")).not.toContain("Advisory");
  });

  it("text_extractability is not assessed when the workbook has no cell values", () => {
    const r = scoreXlsx(baseAnalysis({ totalCellsWithValue: 0, textBoxCount: 1 }));
    const cat = r.categories.find((c) => c.id === "text_extractability")!;
    expect(cat.score).toBe(null);
    expect(cat.findings.join(" ")).toMatch(/text box|not assessed/i);
  });

  it("alt_text caps at 85 with any missing alt and is N/A when all images are decorative", () => {
    const capped = scoreXlsx(
      baseAnalysis({
        images: [
          { altText: "Chart", decorative: false, titleOnly: false },
          { altText: null, decorative: false, titleOnly: false },
          ...Array.from({ length: 38 }, () => ({
            altText: "ok",
            decorative: false,
            titleOnly: false,
          })),
        ],
      }),
    );
    expect(capped.categories.find((c) => c.id === "alt_text")!.score).toBe(85);

    const allDecorative = scoreXlsx(
      baseAnalysis({ images: [{ altText: null, decorative: true, titleOnly: false }] }),
    );
    expect(allDecorative.categories.find((c) => c.id === "alt_text")!.score).toBe(null);
  });

  it("sheet_names is registered in the WCAG category map", () => {
    expect(WCAG_CATEGORY_MAP.sheet_names).toEqual([
      { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
    ]);
  });
});

function baseAnalysis(over: Partial<XlsxAnalysis> = {}): XlsxAnalysis {
  return {
    metadata: { title: "Ledger", creator: "x", sheetCount: 1 },
    sheets: [
      {
        name: "FY26 Grants",
        hidden: false,
        defaultNamed: false,
        mergedRangeCount: 0,
        usedRangeCellCount: 80,
        hasDefinedTable: true,
      },
    ],
    tables: [{ sheetName: "FY26 Grants", name: "Grants", hasHeaderRow: true }],
    images: [],
    links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    totalCellsWithValue: 40,
    textBoxCount: 0,
    ...over,
  };
}

describe("scoreXlsx", () => {
  it("scores a clean workbook high, in the shared result shape", () => {
    const r = scoreXlsx(baseAnalysis());
    expect(r.overallScore).toBeGreaterThanOrEqual(90);
    expect(r.conformance.status).toBe("no-automated-failures");
    const ids = r.categories.map((c) => c.id);
    expect(ids).toContain("sheet_names");
    expect(ids).not.toContain("reading_order");
    expect(ids).not.toContain("heading_structure");
  });

  it("sheet_names penalizes default-named visible sheets only", () => {
    const r = scoreXlsx(
      baseAnalysis({
        sheets: [
          {
            name: "Sheet1",
            hidden: false,
            defaultNamed: true,
            mergedRangeCount: 0,
            usedRangeCellCount: 80,
            hasDefinedTable: true,
          },
          {
            name: "Sheet2",
            hidden: true,
            defaultNamed: true,
            mergedRangeCount: 0,
            usedRangeCellCount: 0,
            hasDefinedTable: false,
          },
        ],
      }),
    );
    // Proportional now: the single visible sheet is default-named → floor 40.
    expect(r.categories.find((c) => c.id === "sheet_names")!.score).toBe(40);
  });

  it("link_quality judges resolved links and excludes unresolved ones from the denominator", () => {
    const r = scoreXlsx(
      baseAnalysis({
        links: [
          { text: "Annual Report 2024", url: "https://example.gov/a", resolved: true },
          { text: "", url: "https://example.gov/b", resolved: true }, // genuinely empty — bad
          { text: "", url: "https://example.gov/c", resolved: false }, // unknowable — excluded
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    // 2 assessable, 1 bad → 50; the unresolved link neither passes nor fails.
    expect(cat.score).toBe(50);
    expect(cat.findings.join(" ")).toContain("1 additional link(s)");
  });

  it("link_quality: raw-URL cell text advisory-only, vague text penalized (PDF-parity doctrine)", () => {
    const r = scoreXlsx(
      baseAnalysis({
        links: [
          { text: "https://example.gov/a", url: "https://example.gov/a", resolved: true },
          { text: "click here", url: "https://example.gov/b", resolved: true },
          { text: "Budget dataset", url: "https://example.gov/c", resolved: true },
        ],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    expect(cat.score).toBe(67);
    expect(cat.findings.join(" ")).toContain("not scored against you");
  });

  it("link_quality is not assessed when no link has resolvable text", () => {
    const r = scoreXlsx(
      baseAnalysis({
        links: [{ text: "", url: "https://example.gov/a", resolved: false }],
      }),
    );
    const cat = r.categories.find((c) => c.id === "link_quality")!;
    expect(cat.score).toBe(null);
    expect(cat.notAssessed).toBe(true);
  });

  it("table_markup: headerless table −30, dataful-sheet-without-table −10, merges capped −15", () => {
    const r = scoreXlsx(
      baseAnalysis({
        sheets: [
          {
            name: "A",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 2,
            usedRangeCellCount: 100,
            hasDefinedTable: false,
          },
          {
            name: "B",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 1,
            usedRangeCellCount: 50,
            hasDefinedTable: false,
          },
          {
            name: "C",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 1,
            usedRangeCellCount: 40,
            hasDefinedTable: false,
          },
          {
            name: "D",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 0,
            usedRangeCellCount: 30,
            hasDefinedTable: true,
          },
        ],
        tables: [{ sheetName: "D", name: "T", hasHeaderRow: false }],
      }),
    );
    // New semantics: −30 headerless; plain-range and merges are notes only
    // (defined tables exist, so no 60-cap). 100 − 30 = 70.
    expect(r.categories.find((c) => c.id === "table_markup")!.score).toBe(70);
  });

  it("title_language scores on title alone and explains the language gap", () => {
    const r = scoreXlsx(baseAnalysis({ metadata: { title: null, creator: null, sheetCount: 1 } }));
    const cat = r.categories.find((c) => c.id === "title_language")!;
    expect(cat.score).toBe(50);
    expect(cat.findings.join(" ")).toMatch(/does not store a document language/i);
  });
});

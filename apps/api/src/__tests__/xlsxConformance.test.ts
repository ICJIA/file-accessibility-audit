import { describe, it, expect } from "vitest";
// Single-column "Format as Table for banding" lists must not fire the gate.
import { evaluateXlsxConformance } from "../services/scoring/conformance.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";

function analysis(over: Partial<XlsxAnalysis>): XlsxAnalysis {
  return {
    metadata: { title: "Ledger", creator: null, sheetCount: 1 },
    sheets: [
      {
        name: "Data",
        hidden: false,
        defaultNamed: false,
        mergedRangeCount: 0,
        usedRangeCellCount: 10,
        hasDefinedTable: true,
      },
    ],
    tables: [{ sheetName: "Data", name: "T", hasHeaderRow: true }],
    images: [],
    links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    totalCellsWithValue: 10,
    textBoxCount: 0,
    ...over,
  };
}

describe("evaluateXlsxConformance — headerless-table gate scope", () => {
  it("does not fire 1.3.1 for a single-column headerless table (banding list)", () => {
    const v = evaluateXlsxConformance(
      analysis({
        tables: [{ sheetName: "Data", name: "Tasks", hasHeaderRow: false, columnCount: 1 }],
      }),
    );
    expect(v.failures.filter((f) => f.sc === "1.3.1")).toHaveLength(0);
  });
});

describe("evaluateXlsxConformance", () => {
  it("is clean for a well-formed workbook, with 3.1.1 honestly not assessed", () => {
    const v = evaluateXlsxConformance(analysis({}));
    expect(v.status).toBe("no-automated-failures");
    expect(v.notAssessed.map((n) => n.sc)).toContain("3.1.1");
  });

  it("fires 1.1.1 / 2.4.2 / 1.3.1 / 1.4.3 on confirmed violations only", () => {
    const v = evaluateXlsxConformance(
      analysis({
        metadata: { title: null, creator: null, sheetCount: 1 },
        images: [{ altText: null, decorative: false, titleOnly: false }],
        tables: [{ sheetName: "Data", name: "Bad", hasHeaderRow: false }],
        contrast: {
          checkedRuns: 1,
          unresolvedRuns: 0,
          failing: [
            {
              text: "cell style #1",
              ratio: 1.4,
              foreground: "#DDDDDD",
              background: "#FFFFFF",
              large: false,
            },
          ],
        },
      }),
    );
    expect(v.status).toBe("fail");
    expect(v.failures.map((f) => f.sc).sort()).toEqual(["1.1.1", "1.3.1", "1.4.3", "2.4.2"]);
  });

  it("does NOT fire for merged cells or table-less data sheets (advisory-only)", () => {
    const v = evaluateXlsxConformance(
      analysis({
        sheets: [
          {
            name: "Data",
            hidden: false,
            defaultNamed: false,
            mergedRangeCount: 9,
            usedRangeCellCount: 500,
            hasDefinedTable: false,
          },
        ],
        tables: [],
      }),
    );
    expect(v.status).toBe("no-automated-failures");
  });
});

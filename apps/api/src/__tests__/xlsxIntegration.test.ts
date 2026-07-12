/**
 * End-to-end XLSX tests on real .xlsx bytes (built by minimalXlsx, unzipped
 * and parsed for real) routed through the dispatcher — the XLSX analogue of
 * docxIntegration.test.ts / pptxIntegration.test.ts. Proves the whole
 * extract → score → conformance chain produces sensible results, not just
 * the unit pieces.
 */
import { describe, it, expect } from "vitest";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { analyzeDocument } from "../services/analyzer.js";

describe("xlsx integration: accessible workbook", () => {
  it("scores ≥ 90 with a clean gate", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "FY26 Grants",
          dimensionRef: "A1:C40",
          tables: [{ name: "Grants" }],
          drawings: [{ kind: "chart", descr: "Awards by county, FY26" }],
          hyperlinks: [
            { id: "rIdH1", target: "https://example.gov/r", display: "Methodology notes" },
          ],
          // Applied to a real cell so color_contrast is genuinely checked (and
          // passes), not silently N/A — a style no cell uses is never evaluated
          // (fix-2: contrast false-positive/false-negative hardening).
          cells: [{ ref: "A1", styleIndex: 1, value: "County" }],
        },
      ],
      styles: [{ fontRgb: "FF000000", fillRgb: "FFFFFFFF" }], // 21:1 → passes
    });
    const r = await analyzeDocument(buf, "accessible.xlsx");
    expect(r.fileType).toBe("xlsx");
    expect(r.overallScore).toBeGreaterThanOrEqual(90);
    expect(r.conformance.status).toBe("no-automated-failures");
  });
});

describe("xlsx integration: inaccessible workbook", () => {
  it("fails ≤ 35 citing 1.1.1, 2.4.2, 1.3.1, 1.4.3", async () => {
    const buf = await buildXlsx({
      coreXml: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`,
      sheets: [
        {
          name: "Sheet1",
          dimensionRef: "A1:H60",
          mergeCount: 4,
          tables: [{ name: "Bad", headerRowCount: 0 }],
          drawings: [{ kind: "pic" }],
          hyperlinks: [
            { id: "rIdH1", target: "https://example.gov/x", display: "https://example.gov/x" },
          ],
          // Applied to a real cell so 1.4.3 fires legitimately — an unused
          // style (the pre-fix-2 fixture's <sheetData/> was always empty) is
          // never evaluated (fix-2: contrast false-positive hardening).
          cells: [{ ref: "A1", styleIndex: 1, value: "Total" }],
        },
        { name: "Sheet2", dimensionRef: "A1:D30" },
      ],
      styles: [{ fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }], // ≈1.35:1 → fails
    });
    const r = await analyzeDocument(buf, "inaccessible.xlsx");
    expect(r.overallScore).toBeLessThanOrEqual(35);
    expect(r.conformance.status).toBe("fail");
    expect(r.conformance.failures.map((f) => f.sc)).toEqual(
      expect.arrayContaining(["1.1.1", "2.4.2", "1.3.1", "1.4.3"]),
    );
  });
});

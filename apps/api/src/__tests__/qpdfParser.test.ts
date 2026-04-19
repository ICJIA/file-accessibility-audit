/**
 * Tests for the QPDF JSON parsing logic (parseQpdfJson).
 *
 * Since parseQpdfJson is not exported directly, we import analyzeWithQpdf
 * but we can't easily test it without the qpdf binary. Instead, we test
 * the parsing logic by re-implementing a thin wrapper that calls the same
 * internal function. We work around this by importing the module and
 * testing via the exported analyzeWithQpdf with mocked execFileSync.
 *
 * Alternative approach: we extract and test the parse logic by mocking
 * the child_process module.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock child_process and fs so analyzeWithQpdf calls parseQpdfJson
// with our test JSON without actually running qpdf.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import { analyzeWithQpdf } from "../services/qpdfService.js";
import { execFileSync } from "node:child_process";

const mockExec = vi.mocked(execFileSync);

/** Helper: make analyzeWithQpdf parse the given JSON object. */
function parseJson(json: any) {
  mockExec.mockReturnValue(JSON.stringify(json));
  return analyzeWithQpdf(Buffer.from("fake"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Catalog detection
// ---------------------------------------------------------------------------

describe("Catalog with StructTreeRoot, Lang, Outlines, AcroForm", () => {
  it("detects StructTreeRoot from Catalog", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/StructTreeRoot": "2 0 R",
          },
        },
      ],
    });
    expect(result.hasStructTree).toBe(true);
  });

  it("detects StructTreeRoot from /Type /StructTreeRoot object", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/Type": "/StructTreeRoot" },
        },
      ],
    });
    expect(result.hasStructTree).toBe(true);
  });

  it("detects Lang from Catalog", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/Lang": "en-US",
          },
        },
      ],
    });
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBe("en-US");
  });

  it("handles non-string Lang gracefully", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/Lang": 12345, // not a string
          },
        },
      ],
    });
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBeNull();
  });

  it("detects Outlines from Catalog", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/Outlines": "3 0 R",
          },
        },
      ],
    });
    expect(result.hasOutlines).toBe(true);
  });

  it("detects AcroForm from Catalog", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/AcroForm": { "/Fields": [] },
          },
        },
      ],
    });
    expect(result.hasAcroForm).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

describe("heading detection", () => {
  it("detects H1-H6 headings", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/H1" },
          "3 0 R": { "/S": "/H2" },
          "4 0 R": { "/S": "/H3" },
          "5 0 R": { "/S": "/H4" },
          "6 0 R": { "/S": "/H5" },
          "7 0 R": { "/S": "/H6" },
        },
      ],
    });
    expect(result.headings).toHaveLength(6);
    expect(result.headings.map((h) => h.level)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
  });

  it("detects generic /H heading", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/H" },
        },
      ],
    });
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].level).toBe("H");
    expect(result.headings[0].tag).toBe("/H");
  });

  it("detects custom heading tags via RoleMap", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/RoleMap": "3 0 R" },
          "3 0 R": { "/CustomHeading": "/H2" },
          "4 0 R": { "/S": "/CustomHeading" },
        },
      ],
    });
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].level).toBe("H2");
    expect(result.headings[0].tag).toBe("/CustomHeading");
  });

  it("strips leading slash from level", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/H2" },
        },
      ],
    });
    expect(result.headings[0].level).toBe("H2");
  });
});

// ---------------------------------------------------------------------------
// Table detection
// ---------------------------------------------------------------------------

describe("table detection", () => {
  it("detects table without headers", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].hasHeaders).toBe(false);
    expect(result.tables[0].dataCellCount).toBe(1);
  });

  it("detects table with TH headers", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R", "5 0 R"] },
          "4 0 R": { "/S": "/TH" },
          "5 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].hasHeaders).toBe(true);
    expect(result.tables[0].headerCount).toBe(1);
    expect(result.tables[0].dataCellCount).toBe(1);
  });

  it("detects TH in inline child objects (not refs)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": {
            "/S": "/Table",
            "/K": [{ "/S": "/TR", "/K": [{ "/S": "/TH" }] }],
          },
        },
      ],
    });
    expect(result.tables[0].hasHeaders).toBe(true);
  });

  it("handles table with no /K key", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table" }, // no /K
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].hasHeaders).toBe(false);
  });

  it("detects scope attributes on TH cells", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R", "5 0 R"] },
          "4 0 R": { "/S": "/TH", "/A": { "/Scope": "/Column" } },
          "5 0 R": { "/S": "/TH" }, // missing scope
        },
      ],
    });
    expect(result.tables[0].hasScope).toBe(false);
    expect(result.tables[0].scopeMissingCount).toBe(1);
  });

  it("detects all TH with scope → hasScope true", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TH", "/A": { "/Scope": "/Row" } },
        },
      ],
    });
    expect(result.tables[0].hasScope).toBe(true);
    expect(result.tables[0].scopeMissingCount).toBe(0);
  });

  it("detects row structure (TR tags)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "4 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["5 0 R"] },
          "4 0 R": { "/S": "/TR", "/K": ["6 0 R"] },
          "5 0 R": { "/S": "/TD" },
          "6 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables[0].hasRowStructure).toBe(true);
    expect(result.tables[0].rowCount).toBe(2);
  });

  it("detects missing row structure", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TD" }, // TD directly under Table, no TR
        },
      ],
    });
    expect(result.tables[0].hasRowStructure).toBe(false);
    expect(result.tables[0].rowCount).toBe(0);
  });

  it("detects nested tables", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TD", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/Table", "/K": [] }, // nested table
        },
      ],
    });
    expect(result.tables[0].hasNestedTable).toBe(true);
  });

  it("detects caption element", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "4 0 R"] },
          "3 0 R": { "/S": "/Caption" },
          "4 0 R": { "/S": "/TR", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables[0].hasCaption).toBe(true);
  });

  it("detects consistent column counts", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "4 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": [{ "/S": "/TH" }, { "/S": "/TH" }] },
          "4 0 R": { "/S": "/TR", "/K": [{ "/S": "/TD" }, { "/S": "/TD" }] },
        },
      ],
    });
    expect(result.tables[0].hasConsistentColumns).toBe(true);
    expect(result.tables[0].columnCounts).toEqual([2, 2]);
  });

  it("detects inconsistent column counts", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "4 0 R"] },
          "3 0 R": {
            "/S": "/TR",
            "/K": [{ "/S": "/TH" }, { "/S": "/TH" }, { "/S": "/TH" }],
          },
          "4 0 R": { "/S": "/TR", "/K": [{ "/S": "/TD" }, { "/S": "/TD" }] },
        },
      ],
    });
    expect(result.tables[0].hasConsistentColumns).toBe(false);
    expect(result.tables[0].columnCounts).toEqual([3, 2]);
  });

  it("detects header association on TD cells", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TD", "/Headers": "5 0 R" },
        },
      ],
    });
    expect(result.tables[0].hasHeaderAssociation).toBe(true);
  });

  it("handles THead/TBody wrappers for row detection", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "6 0 R"] },
          "3 0 R": { "/S": "/THead", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TR", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/TH", "/A": { "/Scope": "/Column" } },
          "6 0 R": { "/S": "/TBody", "/K": ["7 0 R"] },
          "7 0 R": { "/S": "/TR", "/K": ["8 0 R"] },
          "8 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables[0].hasRowStructure).toBe(true);
    expect(result.tables[0].rowCount).toBe(2);
    expect(result.tables[0].hasHeaders).toBe(true);
    expect(result.tables[0].hasScope).toBe(true);
  });

  it("detects custom table roles via RoleMap", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/RoleMap": "3 0 R" },
          "3 0 R": {
            "/CustomTable": "/Table",
            "/CustomRow": "/TR",
            "/CustomHeader": "/TH",
            "/CustomCell": "/TD",
          },
          "4 0 R": { "/S": "/CustomTable", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/CustomRow", "/K": ["6 0 R", "7 0 R"] },
          "6 0 R": { "/S": "/CustomHeader", "/A": { "/Scope": "/Column" } },
          "7 0 R": { "/S": "/CustomCell" },
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].hasHeaders).toBe(true);
    expect(result.tables[0].headerCount).toBe(1);
    expect(result.tables[0].dataCellCount).toBe(1);
    expect(result.tables[0].rowCount).toBe(1);
    expect(result.tables[0].hasScope).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// List detection
// ---------------------------------------------------------------------------

describe("list detection", () => {
  it("detects well-formed list with LI, Lbl, LBody", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/L", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/LI", "/K": ["4 0 R", "5 0 R"] },
          "4 0 R": { "/S": "/Lbl" },
          "5 0 R": { "/S": "/LBody" },
        },
      ],
    });
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].itemCount).toBe(1);
    expect(result.lists[0].hasLabels).toBe(true);
    expect(result.lists[0].hasBodies).toBe(true);
    expect(result.lists[0].isWellFormed).toBe(true);
  });

  it("detects list without labels as not well-formed", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/L", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/LI", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/LBody" },
        },
      ],
    });
    expect(result.lists[0].isWellFormed).toBe(false);
    expect(result.lists[0].hasLabels).toBe(false);
    expect(result.lists[0].hasBodies).toBe(true);
  });

  it("detects multiple list items", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/L", "/K": ["3 0 R", "6 0 R"] },
          "3 0 R": { "/S": "/LI", "/K": ["4 0 R", "5 0 R"] },
          "4 0 R": { "/S": "/Lbl" },
          "5 0 R": { "/S": "/LBody" },
          "6 0 R": { "/S": "/LI", "/K": ["7 0 R", "8 0 R"] },
          "7 0 R": { "/S": "/Lbl" },
          "8 0 R": { "/S": "/LBody" },
        },
      ],
    });
    expect(result.lists[0].itemCount).toBe(2);
    expect(result.lists[0].isWellFormed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MarkInfo, RoleMap, TabOrder, Font detection
// ---------------------------------------------------------------------------

describe("MarkInfo detection", () => {
  it("detects /MarkInfo /Marked true", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/MarkInfo": { "/Marked": true } },
        },
      ],
    });
    expect(result.hasMarkInfo).toBe(true);
    expect(result.isMarkedContent).toBe(true);
  });

  it("detects /MarkInfo without /Marked", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/MarkInfo": {} },
        },
      ],
    });
    expect(result.hasMarkInfo).toBe(true);
    expect(result.isMarkedContent).toBe(false);
  });
});

describe("RoleMap detection", () => {
  it("detects RoleMap on StructTreeRoot", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": {
            "/Type": "/StructTreeRoot",
            "/RoleMap": { "/Heading1": "/H1", "/Normal": "/P" },
          },
        },
      ],
    });
    expect(result.hasRoleMap).toBe(true);
    expect(result.roleMapEntries).toHaveLength(2);
    expect(result.roleMapEntries[0]).toContain("Heading1");
  });

  it("resolves RoleMap when StructTreeRoot stores it by indirect reference", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/RoleMap": "3 0 R" },
          "3 0 R": { "/Heading1": "/H1", "/Normal": "/P" },
        },
      ],
    });
    expect(result.hasRoleMap).toBe(true);
    expect(result.roleMapEntries).toContain("Heading1 → H1");
    expect(result.roleMapEntries).toContain("Normal → P");
  });
});

describe("Tab order detection", () => {
  it("counts pages with /Tabs attribute", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/Type": "/Page", "/Tabs": "/S" },
          "3 0 R": { "/Type": "/Page" },
          "4 0 R": { "/Type": "/Page", "/Tabs": "/S" },
        },
      ],
    });
    expect(result.tabOrderPages).toBe(2);
    expect(result.totalPageCount).toBe(3);
  });
});

describe("font embedding detection", () => {
  it("detects embedded fonts via /FontFile2", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": {
            "/Type": "/FontDescriptor",
            "/FontName": "/Arial",
            "/FontFile2": "3 0 R",
          },
        },
      ],
    });
    expect(result.fonts).toHaveLength(1);
    expect(result.fonts[0].name).toBe("Arial");
    expect(result.fonts[0].embedded).toBe(true);
  });

  it("detects non-embedded fonts", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/Type": "/FontDescriptor", "/FontName": "/ComicSans" },
        },
      ],
    });
    expect(result.fonts).toHaveLength(1);
    expect(result.fonts[0].name).toBe("ComicSans");
    expect(result.fonts[0].embedded).toBe(false);
  });
});

describe("paragraph and language span detection", () => {
  it("counts paragraph tags", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/P" },
          "3 0 R": { "/S": "/P" },
          "4 0 R": { "/S": "/P" },
        },
      ],
    });
    expect(result.paragraphCount).toBe(3);
  });

  it("detects language spans on structure elements", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Lang": "en-US" },
          "2 0 R": { "/S": "/Span", "/Lang": "es" },
          "3 0 R": { "/S": "/P", "/Lang": "fr" },
        },
      ],
    });
    expect(result.langSpans).toHaveLength(2);
    expect(result.langSpans[0]).toEqual({ lang: "es", tag: "Span" });
    expect(result.langSpans[1]).toEqual({ lang: "fr", tag: "P" });
  });
});

// ---------------------------------------------------------------------------
// Figure/image alt text detection
// ---------------------------------------------------------------------------

describe("figure/image alt text detection", () => {
  it("figure with /Alt is detected", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/Subtype": "/Image" },
          "3 0 R": { "/S": "/Figure", "/Alt": "A photo of a sunset" },
        },
      ],
    });
    const imageWithAlt = result.images.find(
      (i) => i.ref === "3 0 R" && i.hasAlt,
    );
    expect(imageWithAlt).toBeDefined();
    expect(result.imageObjectCount).toBe(1);
  });

  it("figure without /Alt is detected as missing alt", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "3 0 R": { "/S": "/Figure" }, // no /Alt
        },
      ],
    });
    const fig = result.images.find((i) => i.ref === "3 0 R");
    expect(fig).toBeDefined();
    expect(fig!.hasAlt).toBe(false);
  });

  it("figure with empty /Alt string has no alt", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "3 0 R": { "/S": "/Figure", "/Alt": "" },
        },
      ],
    });
    const fig = result.images.find((i) => i.ref === "3 0 R");
    expect(fig).toBeDefined();
    expect(fig!.hasAlt).toBe(false);
  });

  it("standalone Image XObject increments raw image count without creating a figure", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "5 0 R": { "/Subtype": "/Image" },
        },
      ],
    });
    expect(result.images).toHaveLength(0);
    expect(result.imageObjectCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MCID content order collection
// ---------------------------------------------------------------------------

describe("MCID content order collection", () => {
  it("collects numeric /K as MCID", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/P", "/K": 42 },
        },
      ],
    });
    expect(result.contentOrder).toContain(42);
  });

  it("collects MCIDs from array of numbers", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/P", "/K": [0, 1, 2] },
        },
      ],
    });
    expect(result.contentOrder).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  it("collects MCIDs from objects with /MCID key", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/P", "/K": [{ "/MCID": 5 }, { "/MCID": 10 }] },
        },
      ],
    });
    expect(result.contentOrder).toEqual(expect.arrayContaining([5, 10]));
  });

  it("handles mixed numeric and object MCIDs", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/P", "/K": [3, { "/MCID": 7 }] },
        },
      ],
    });
    expect(result.contentOrder).toEqual(expect.arrayContaining([3, 7]));
  });
});

// ---------------------------------------------------------------------------
// Outline counting
// ---------------------------------------------------------------------------

describe("outline counting", () => {
  it("counts outline entries via /First / /Next chain", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Outlines": "2 0 R" },
          "2 0 R": {
            "/Type": "/Outlines",
            "/First": "3 0 R",
            "/Last": "5 0 R",
          },
          "3 0 R": { "/Title": "Chapter 1", "/Next": "4 0 R" },
          "4 0 R": { "/Title": "Chapter 2", "/Next": "5 0 R" },
          "5 0 R": { "/Title": "Chapter 3" },
        },
      ],
    });
    expect(result.outlineCount).toBe(3);
  });

  it("handles empty outline (no /First)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Outlines": "2 0 R" },
          "2 0 R": { "/Type": "/Outlines" },
        },
      ],
    });
    expect(result.outlineCount).toBe(0);
  });

  it("handles circular reference in outlines without infinite loop", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Outlines": "2 0 R" },
          "2 0 R": {
            "/Type": "/Outlines",
            "/First": "3 0 R",
            "/Last": "3 0 R",
          },
          "3 0 R": { "/Title": "Loop", "/Next": "3 0 R" }, // circular
        },
      ],
    });
    // Should not hang; visited set prevents infinite loop
    expect(result.outlineCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Structure tree depth calculation
// ---------------------------------------------------------------------------

describe("structure tree depth calculation", () => {
  it("calculates depth for nested structure", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": {
            "/Type": "/StructTreeRoot",
            "/K": ["3 0 R"],
          },
          "3 0 R": { "/S": "/Document", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/H1", "/K": [0] },
        },
      ],
    });
    expect(result.structTreeDepth).toBeGreaterThanOrEqual(2);
  });

  it("flat tree has depth 0 or 1", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot" }, // no children
        },
      ],
    });
    expect(result.structTreeDepth).toBeLessThanOrEqual(1);
  });

  it("no struct tree → depth 0", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
        },
      ],
    });
    expect(result.structTreeDepth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Form field detection
// ---------------------------------------------------------------------------

describe("form field detection", () => {
  it("detects widget annotations with /TU", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/AcroForm": { "/Fields": ["3 0 R"] },
          },
          "2 0 R": {
            "/Type": "/Annot",
            "/Subtype": "/Widget",
            "/TU": "Full Name",
          },
          "3 0 R": { "/Type": "/Annot", "/Subtype": "/Widget" }, // no /TU
        },
      ],
    });
    expect(result.formFields).toHaveLength(2);
    expect(result.formFields.filter((f) => f.hasTU)).toHaveLength(1);
  });

  it("falls back to AcroForm /Fields when no widget annotations found", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/AcroForm": { "/Fields": ["2 0 R", "3 0 R"] },
          },
          "2 0 R": { "/TU": "Name field" },
          "3 0 R": {}, // no /TU
        },
      ],
    });
    expect(result.hasAcroForm).toBe(true);
    expect(result.formFields.length).toBeGreaterThanOrEqual(2);
  });

  it("merges widget annotations with additional AcroForm-only fields", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/AcroForm": { "/Fields": ["2 0 R", "4 0 R"] },
          },
          "2 0 R": {
            "/Type": "/Annot",
            "/Subtype": "/Widget",
            "/TU": "Visible widget",
          },
          "4 0 R": { "/TU": "Catalog-only field" },
        },
      ],
    });

    expect(result.formFields).toHaveLength(2);
    expect(result.formFields.filter((f) => f.hasTU)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Empty/malformed JSON handling
// ---------------------------------------------------------------------------

describe("empty/malformed JSON handling", () => {
  it("empty objects → all defaults", () => {
    const result = parseJson({ qpdf: [null, {}] });
    expect(result.hasStructTree).toBe(false);
    expect(result.hasLang).toBe(false);
    expect(result.headings).toHaveLength(0);
    expect(result.tables).toHaveLength(0);
    expect(result.images).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  it("objects key at top level works too", () => {
    const result = parseJson({
      objects: {
        "1 0 R": { "/Type": "/Catalog", "/Lang": "fr" },
      },
    });
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBe("fr");
  });

  it("null values in objects are skipped", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": null,
          "2 0 R": "not an object",
          "3 0 R": { "/Type": "/Catalog" },
        },
      ],
    });
    // Should not throw, should process the valid object
    expect(result.error).toBeNull();
  });

  it("completely empty JSON does not throw", () => {
    const result = parseJson({});
    expect(result.error).toBeNull();
    expect(result.hasStructTree).toBe(false);
  });

  it("malformed execFileSync output falls back to error result", () => {
    mockExec.mockReturnValue("not valid json");
    const result = analyzeWithQpdf(Buffer.from("fake"));
    // JSON.parse will throw, caught by the try/catch in analyzeWithQpdf
    // which returns a default result with error
    expect(result.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDF/UA identifier detection
// ---------------------------------------------------------------------------

describe("PDF/UA identifier", () => {
  it("detects pdfuaid in stream data", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            value: { "/Type": "/Catalog" },
            data: '<rdf:Description xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"><pdfuaid:part>1</pdfuaid:part></rdf:Description>',
          },
        },
      ],
    });
    expect(result.hasPdfUaIdentifier).toBe(true);
    expect(result.pdfUaPart).toBe("1");
  });

  it("detects pdfuaid part 2", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            value: { "/Type": "/Metadata", "/Subtype": "/XML" },
            data: "pdfuaid:part>2</pdfuaid:part>",
          },
        },
      ],
    });
    expect(result.hasPdfUaIdentifier).toBe(true);
    expect(result.pdfUaPart).toBe("2");
  });

  it("returns false when no pdfuaid found", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { value: { "/Type": "/Catalog" } },
        },
      ],
    });
    expect(result.hasPdfUaIdentifier).toBe(false);
    expect(result.pdfUaPart).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Artifact tagging detection
// ---------------------------------------------------------------------------

describe("Artifact tagging", () => {
  it("counts /Artifact structure elements", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            value: { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          },
          "2 0 R": { value: { "/Type": "/StructTreeRoot" } },
          "3 0 R": { value: { "/S": "/Artifact" } },
          "4 0 R": { value: { "/S": "/Artifact" } },
          "5 0 R": { value: { "/S": "/P" } },
        },
      ],
    });
    expect(result.artifactCount).toBe(2);
  });

  it("returns 0 when no artifacts", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { value: { "/S": "/P" } },
        },
      ],
    });
    expect(result.artifactCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ActualText and Expansion text detection
// ---------------------------------------------------------------------------

describe("ActualText and Expansion text", () => {
  it("counts /ActualText attributes", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { value: { "/S": "/Span", "/ActualText": "u:fi" } },
          "2 0 R": { value: { "/S": "/Span", "/ActualText": "u:ffi" } },
          "3 0 R": { value: { "/S": "/P" } },
        },
      ],
    });
    expect(result.actualTextCount).toBe(2);
    expect(result.expansionTextCount).toBe(0);
  });

  it("counts /E expansion attributes", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { value: { "/S": "/Span", "/E": "u:Illinois" } },
          "2 0 R": { value: { "/S": "/Span", "/E": "u:United States" } },
        },
      ],
    });
    expect(result.expansionTextCount).toBe(2);
    expect(result.actualTextCount).toBe(0);
  });

  it("counts both ActualText and Expansion on same element", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            value: { "/S": "/Span", "/ActualText": "u:fi", "/E": "u:figure" },
          },
        },
      ],
    });
    expect(result.actualTextCount).toBe(1);
    expect(result.expansionTextCount).toBe(1);
  });

  it("returns 0 when no ActualText or E", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { value: { "/S": "/P" } },
        },
      ],
    });
    expect(result.actualTextCount).toBe(0);
    expect(result.expansionTextCount).toBe(0);
  });
});

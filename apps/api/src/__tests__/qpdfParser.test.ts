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
    expect(result.headings.map((h) => h.level)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
  });

  it("returns headings in document (structure-tree) order, not object-number order", () => {
    // Object numbers are assigned in REVERSE of document order: the H1 has the
    // highest object number (6 0 R) but is the first child in the /K array.
    // A flat object-map scan would yield [H3, H2, H1]; a document-order walk
    // of the structure tree must yield [H1, H2, H3].
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/K": "3 0 R" },
          "3 0 R": { "/S": "/Document", "/K": ["6 0 R", "5 0 R", "4 0 R"] },
          "4 0 R": { "/S": "/H3" },
          "5 0 R": { "/S": "/H2" },
          "6 0 R": { "/S": "/H1" },
        },
      ],
    });
    expect(result.headings.map((h) => h.level)).toEqual(["H1", "H2", "H3"]);
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
    // A nested table must NOT be reported as a second top-level table.
    expect(result.tables).toHaveLength(1);
  });

  it("does not inflate row counts by hoisting a nested table to top level", () => {
    // One visible 2-row table whose cell contains a nested 3-row table.
    // The report must show ONE table with 2 rows — not two tables totalling
    // 5 rows ("more rows than what's actually in the pdf").
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": { "/S": "/Table", "/K": ["3 0 R", "6 0 R"] }, // outer: 2 rows
          "3 0 R": { "/S": "/TR", "/K": ["4 0 R"] },
          "4 0 R": { "/S": "/TD", "/K": ["7 0 R"] }, // cell holds nested table
          "6 0 R": { "/S": "/TR", "/K": ["8 0 R"] },
          "8 0 R": { "/S": "/TD" },
          "7 0 R": { "/S": "/Table", "/K": ["9 0 R", "10 0 R", "11 0 R"] }, // nested: 3 rows
          "9 0 R": { "/S": "/TR", "/K": ["12 0 R"] },
          "10 0 R": { "/S": "/TR", "/K": ["13 0 R"] },
          "11 0 R": { "/S": "/TR", "/K": ["14 0 R"] },
          "12 0 R": { "/S": "/TD" },
          "13 0 R": { "/S": "/TD" },
          "14 0 R": { "/S": "/TD" },
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].rowCount).toBe(2);
    expect(result.tables[0].hasNestedTable).toBe(true);
    const totalRows = result.tables.reduce((sum, t) => sum + t.rowCount, 0);
    expect(totalRows).toBe(2);
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
          "2 0 R": { "/Type": "/StructTreeRoot", "/RoleMap": "3 0 R", "/K": ["4 0 R"] },
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
// Orphaned struct pruning — <L>/<Table>/<Figure> objects that carry /S but are
// unreachable in the live tree (no /P parent, named by no /K) are export
// leftovers (e.g. InDesign → Acrobat) that assistive tech never traverses. They
// are pruned when a StructTreeRoot exists; without one there is no live tree, so
// nothing is pruned. (Real case: 2022-DVFR-Annual-Report-A0.pdf carried 27
// phantom <L> and 3 phantom <Table> reported as "incomplete structure".)
// ---------------------------------------------------------------------------

describe("orphaned struct pruning", () => {
  it("drops orphaned phantom <L> lists but keeps the reachable one", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/L", "/P": "2 0 R", "/K": ["4 0 R"] }, // real, reachable
          "4 0 R": { "/S": "/LI", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/LBody" },
          "8 0 R": { "/S": "/L" }, // phantom: no /P, named by no /K
          "9 0 R": { "/S": "/L" }, // phantom
        },
      ],
    });
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].isWellFormed).toBe(true);
  });

  it("drops orphaned phantom <Table> objects but keeps the reachable one", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/Table", "/P": "2 0 R", "/K": ["4 0 R"] }, // real
          "4 0 R": { "/S": "/TR", "/K": ["5 0 R"] },
          "5 0 R": { "/S": "/TD" },
          "8 0 R": { "/S": "/Table" }, // phantom
          "9 0 R": { "/S": "/Table" }, // phantom
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
  });

  it("without a StructTreeRoot, structs are not pruned (no live tree to judge against)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" }, // no StructTreeRoot
          "8 0 R": { "/S": "/L", "/K": ["9 0 R"] }, // unreferenced, but no tree → kept
          "9 0 R": { "/S": "/LI", "/K": ["10 0 R"] },
          "10 0 R": { "/S": "/LBody" },
        },
      ],
    });
    expect(result.lists).toHaveLength(1);
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

  it("treats a list without labels as well-formed (Lbl is optional)", () => {
    // Policy change: <Lbl> is optional per ISO 32000 — LBody-only items are
    // structurally complete. hasLabels stays false as the advisory signal.
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
    expect(result.lists[0].isWellFormed).toBe(true);
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

  it("treats a Type3 font (inline CharProcs, no FontFile) as embedded", () => {
    // Type3 fonts define their glyphs as inline PDF content streams
    // (/CharProcs), so they are self-contained ("embedded") yet never carry a
    // /FontFile*. The FontFile-only check wrongly flagged them as not embedded.
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": {
            "/Type": "/Font",
            "/Subtype": "/Type3",
            "/FontDescriptor": "3 0 R",
          },
          "3 0 R": { "/Type": "/FontDescriptor", "/FontName": "/MyType3Font" },
        },
      ],
    });
    const font = result.fonts.find((f) => f.name === "MyType3Font");
    expect(font).toBeDefined();
    expect(font!.embedded).toBe(true);
  });

  it("still flags a non-embedded simple (non-Type3) font as not embedded", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "2 0 R": {
            "/Type": "/Font",
            "/Subtype": "/TrueType",
            "/FontDescriptor": "3 0 R",
          },
          "3 0 R": { "/Type": "/FontDescriptor", "/FontName": "/ArialMT" },
        },
      ],
    });
    const font = result.fonts.find((f) => f.name === "ArialMT");
    expect(font!.embedded).toBe(false);
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
          "4 0 R": { "/S": "/Document", "/K": ["3 0 R"] }, // parent → figure is live
          "3 0 R": { "/S": "/Figure", "/Alt": "A photo of a sunset" },
        },
      ],
    });
    const imageWithAlt = result.images.find((i) => i.ref === "3 0 R" && i.hasAlt);
    expect(imageWithAlt).toBeDefined();
    expect(result.imageObjectCount).toBe(1);
  });

  it("figure without /Alt is detected as missing alt", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "4 0 R": { "/S": "/Document", "/K": ["3 0 R"] },
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
          "4 0 R": { "/S": "/Document", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/Figure", "/Alt": "" },
        },
      ],
    });
    const fig = result.images.find((i) => i.ref === "3 0 R");
    expect(fig).toBeDefined();
    expect(fig!.hasAlt).toBe(false);
  });

  it("figure kept when it carries its own /P parent (no /K back-reference)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "9 0 R" },
          "9 0 R": { "/Type": "/StructTreeRoot" }, // tree exists → orphan-pruning is active
          "3 0 R": { "/S": "/Figure", "/P": "7 0 R", "/Alt": "Chart" }, // reachable via /P only
        },
      ],
    });
    expect(result.images.find((i) => i.ref === "3 0 R")).toBeDefined();
  });

  it("orphaned figure (no /P, named by no /K) is excluded — export leftover", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "9 0 R" },
          "9 0 R": { "/Type": "/StructTreeRoot" }, // a live tree exists to be orphaned from
          "2 0 R": { "/Subtype": "/Image" },
          // Phantom <Figure> objects the way InDesign/Acrobat leave them: /S and
          // layout attrs, but no /P and named by no element's /K. A screen reader
          // never reaches these, so they must not be scored as images.
          "3 0 R": { "/S": "/Figure", "/A": "8 0 R" }, // no /Alt, orphaned
          "5 0 R": { "/S": "/Figure", "/Alt": "Orphan with alt", "/A": "8 0 R" },
        },
      ],
    });
    expect(result.images).toHaveLength(0);
    // The Image XObject is still counted at the object-graph level.
    expect(result.imageObjectCount).toBe(1);
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
// qpdf v2 stream-object unwrapping
//
// Real qpdf ≥ 11 wraps stream objects as { stream: { dict: {...}, length } }
// (never { value }), so Image XObjects are only visible to the walk once that
// wrapper is unwrapped. The hybrid bare-dict fixtures elsewhere in this file
// exercise v1 tolerance; these fixtures are the true modern shape.
// ---------------------------------------------------------------------------

describe("qpdf v2 stream-wrapped objects", () => {
  it("counts an image XObject wrapped in the v2 {stream:{dict}} shape", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:5 0 R": {
            stream: {
              dict: { "/Type": "/XObject", "/Subtype": "/Image", "/Width": 100 },
              length: 1234,
            },
          },
        },
      ],
    });
    expect(result.imageObjectCount).toBe(1);
  });

  it("does not count an image's /SMask soft-mask stream as a second image", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:5 0 R": {
            stream: {
              dict: { "/Type": "/XObject", "/Subtype": "/Image", "/SMask": "6 0 R" },
              length: 10,
            },
          },
          "obj:6 0 R": {
            stream: {
              dict: { "/Type": "/XObject", "/Subtype": "/Image" },
              length: 10,
            },
          },
        },
      ],
    });
    expect(result.imageObjectCount).toBe(1);
  });

  it("still unwraps value-wrapped dict objects (v2 catalog)", () => {
    const result = parseJson({
      qpdf: [null, { "obj:1 0 R": { value: { "/Type": "/Catalog", "/Lang": "en" } } }],
    });
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// Encryption permission flags (top-level "encrypt" key)
//
// qpdf reports the security handler's permission capabilities for encrypted
// documents. capabilities.accessibility === false means conforming viewers
// deny assistive-technology text access — the most severe possible barrier
// (Matterhorn 26-002), previously invisible to the audit.
// ---------------------------------------------------------------------------

describe("encryption permission flags", () => {
  it("reads accessibility-denied encryption from the top-level encrypt key", () => {
    const result = parseJson({
      encrypt: {
        encrypted: true,
        capabilities: { accessibility: false, extract: false, printlow: true },
      },
      qpdf: [null, { "obj:1 0 R": { value: { "/Type": "/Catalog" } } }],
    });
    expect(result.isEncrypted).toBe(true);
    expect(result.accessibilityAllowed).toBe(false);
  });

  it("reads accessibility-permitted encryption", () => {
    const result = parseJson({
      encrypt: { encrypted: true, capabilities: { accessibility: true } },
      qpdf: [null, { "obj:1 0 R": { value: { "/Type": "/Catalog" } } }],
    });
    expect(result.isEncrypted).toBe(true);
    expect(result.accessibilityAllowed).toBe(true);
  });

  it("leaves accessibilityAllowed null for unencrypted documents", () => {
    const result = parseJson({
      encrypt: { encrypted: false, capabilities: { accessibility: true } },
      qpdf: [null, { "obj:1 0 R": { value: { "/Type": "/Catalog" } } }],
    });
    expect(result.isEncrypted).toBe(false);
    expect(result.accessibilityAllowed).toBe(null);
  });

  it("leaves both fields at defaults when the encrypt key is absent", () => {
    const result = parseJson({
      qpdf: [null, { "obj:1 0 R": { value: { "/Type": "/Catalog" } } }],
    });
    expect(result.isEncrypted).toBe(false);
    expect(result.accessibilityAllowed).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Viewer preferences (DisplayDocTitle), XFA, Suspects, hidden fields,
// Figure /ActualText
// ---------------------------------------------------------------------------

describe("viewer preferences — DisplayDocTitle", () => {
  it("reads DisplayDocTitle from an inline ViewerPreferences dict", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/ViewerPreferences": { "/DisplayDocTitle": true } },
        },
      ],
    });
    expect(result.displayDocTitle).toBe(true);
  });

  it("resolves a ViewerPreferences reference", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/ViewerPreferences": "9 0 R" },
          "9 0 R": { "/DisplayDocTitle": false },
        },
      ],
    });
    expect(result.displayDocTitle).toBe(false);
  });

  it("is null when the catalog has no ViewerPreferences", () => {
    const result = parseJson({ qpdf: [null, { "1 0 R": { "/Type": "/Catalog" } }] });
    expect(result.displayDocTitle).toBe(null);
  });
});

describe("indirect-reference catalog values (real Designer/LiveCycle output)", () => {
  it("resolves an indirect /Lang reference to its string value", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Lang": "252 0 R" },
          "252 0 R": { value: "u:en-US" },
        },
      ],
    });
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBe("en-US");
  });

  it("resolves an indirect /DisplayDocTitle reference to its boolean value", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/ViewerPreferences": { "/DisplayDocTitle": "273 0 R" },
          },
          "273 0 R": { value: true },
        },
      ],
    });
    expect(result.displayDocTitle).toBe(true);
  });

  it("reads /NeedsRendering (the dynamic-XFA marker), including via reference", () => {
    const direct = parseJson({
      qpdf: [null, { "1 0 R": { "/Type": "/Catalog", "/NeedsRendering": true } }],
    });
    expect(direct.needsRendering).toBe(true);

    const viaRef = parseJson({
      qpdf: [
        null,
        { "1 0 R": { "/Type": "/Catalog", "/NeedsRendering": "9 0 R" }, "9 0 R": { value: true } },
      ],
    });
    expect(viaRef.needsRendering).toBe(true);

    const absent = parseJson({ qpdf: [null, { "1 0 R": { "/Type": "/Catalog" } }] });
    expect(absent.needsRendering).toBe(false);
  });
});

describe("XFA form detection", () => {
  it("detects /XFA on the AcroForm dictionary", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/AcroForm": "5 0 R" },
          "5 0 R": { "/XFA": ["template", "6 0 R"], "/Fields": [] },
        },
      ],
    });
    expect(result.hasXfa).toBe(true);
  });

  it("plain AcroForms are not XFA", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/AcroForm": "5 0 R" },
          "5 0 R": { "/Fields": [] },
        },
      ],
    });
    expect(result.hasXfa).toBe(false);
  });
});

describe("MarkInfo /Suspects", () => {
  it("surfaces a true Suspects flag", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/MarkInfo": { "/Marked": true, "/Suspects": true },
          },
        },
      ],
    });
    expect(result.suspectsFlag).toBe(true);
    expect(result.isMarkedContent).toBe(true);
  });

  it("defaults to false without the flag", () => {
    const result = parseJson({
      qpdf: [null, { "1 0 R": { "/Type": "/Catalog", "/MarkInfo": { "/Marked": true } } }],
    });
    expect(result.suspectsFlag).toBe(false);
  });
});

describe("hidden/no-view form fields", () => {
  it("skips widgets whose /F flags mark them Hidden (bit 2)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "5 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "calcHelper", "/F": 2 },
        },
      ],
    });
    expect(result.formFields).toHaveLength(0);
  });

  it("skips widgets whose /F flags mark them NoView (bit 6)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "5 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "sig", "/F": 32 },
        },
      ],
    });
    expect(result.formFields).toHaveLength(0);
  });

  it("still counts ordinary visible widgets (Print flag)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "5 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "name", "/F": 4 },
        },
      ],
    });
    expect(result.formFields).toHaveLength(1);
  });
});

describe("Figure /ActualText as a text alternative", () => {
  it("credits a Figure carrying only /ActualText", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog" },
          "4 0 R": { "/S": "/Document", "/K": ["3 0 R"] },
          "3 0 R": { "/S": "/Figure", "/ActualText": "E = mc squared" },
        },
      ],
    });
    const fig = result.images.find((i) => i.ref === "3 0 R");
    expect(fig).toBeDefined();
    expect(fig!.hasAlt).toBe(true);
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

// ---------------------------------------------------------------------------
// qpdf exit code 3 — "operation succeeded with warnings"
// ---------------------------------------------------------------------------
// qpdf exits 3 when the input had recoverable defects (damaged xref, missing
// trailer /Size, …) but STILL writes the complete document JSON to stdout.
// That JSON must be recovered — discarding it falsely reports a tagged
// document as untagged.

describe("qpdf exit code 3 (success with warnings)", () => {
  it("recovers the full analysis from stdout when qpdf exits 3", () => {
    const json = {
      qpdf: [
        null,
        {
          "obj:1 0 R": {
            value: {
              "/Type": "/Catalog",
              "/StructTreeRoot": "2 0 R",
              "/Lang": "u:en-US",
            },
          },
          "obj:2 0 R": { value: { "/Type": "/StructTreeRoot" } },
        },
      ],
    };
    const err: any = new Error("qpdf: operation succeeded with warnings");
    err.status = 3;
    err.stdout = JSON.stringify(json);
    err.stderr = "WARNING: file is damaged";
    mockExec.mockImplementation(() => {
      throw err;
    });

    const result = analyzeWithQpdf(Buffer.from("fake"));
    expect(result.error).toBeNull();
    expect(result.hasStructTree).toBe(true);
    expect(result.hasLang).toBe(true);
    expect(result.lang).toBe("en-US");
  });

  it("falls back to the error result when stdout is not valid JSON", () => {
    const err: any = new Error("qpdf: real failure");
    err.status = 2;
    err.stdout = "partial garbage";
    err.stderr = "qpdf: some hard error";
    mockExec.mockImplementation(() => {
      throw err;
    });

    const result = analyzeWithQpdf(Buffer.from("fake"));
    expect(result.error).toBe("QPDF parsing failed");
    expect(result.hasStructTree).toBe(false);
  });

  it("still throws for encrypted files even when stdout is present", () => {
    const err: any = new Error("invalid password");
    err.stderr = "file is encrypted";
    err.stdout = "{}";
    mockExec.mockImplementation(() => {
      throw err;
    });

    expect(() => analyzeWithQpdf(Buffer.from("fake"))).toThrow("encrypted");
  });

  it("still throws for timeouts even when partial stdout is present", () => {
    const err: any = new Error("spawnSync qpdf ETIMEDOUT");
    err.killed = true;
    err.stdout = "{";
    mockExec.mockImplementation(() => {
      throw err;
    });

    expect(() => analyzeWithQpdf(Buffer.from("fake"))).toThrow("QPDF timeout");
  });
});

// ---------------------------------------------------------------------------
// qpdf JSON v2 key format — REAL qpdf ≥ 11 output
// ---------------------------------------------------------------------------
// Real v2 output keys the object map as "obj:N 0 R" while reference VALUES
// inside objects stay "N 0 R". Any comparison between a map key and a value
// ref must normalize the "obj:" prefix. These fixtures mirror the real
// format exactly (obj: keys + { value: ... } wrappers) — unlike the older
// fixtures above, which use a v1-style hybrid qpdf never emits.

describe("qpdf JSON v2 format (obj:-prefixed keys)", () => {
  it("does not report a nested table as a second top-level table", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": {
            value: { "/S": "/Table", "/K": ["3 0 R", "6 0 R"] }, // outer: 2 rows
          },
          "obj:3 0 R": { value: { "/S": "/TR", "/K": ["4 0 R"] } },
          "obj:4 0 R": { value: { "/S": "/TD", "/K": ["5 0 R"] } }, // holds nested
          "obj:5 0 R": { value: { "/S": "/Table", "/K": ["9 0 R"] } }, // nested: 1 row
          "obj:9 0 R": { value: { "/S": "/TR", "/K": ["10 0 R", "11 0 R"] } },
          "obj:10 0 R": { value: { "/S": "/TD" } },
          "obj:11 0 R": { value: { "/S": "/TD" } },
          "obj:6 0 R": { value: { "/S": "/TR", "/K": ["8 0 R"] } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].hasNestedTable).toBe(true);
    expect(result.tables[0].rowCount).toBe(2);
    const totalRows = result.tables.reduce((sum, t) => sum + t.rowCount, 0);
    expect(totalRows).toBe(2);
  });

  it("discovers non-widget fields via the AcroForm /Fields fallback", () => {
    // The field dict is not a /Widget annotation (split field/widget pattern),
    // so only the AcroForm fallback can find it. /AcroForm is an indirect ref,
    // as written by real producers.
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" },
          },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R"] } },
          "obj:3 0 R": {
            value: { "/T": "u:firstName", "/TU": "u:First Name", "/FT": "/Tx" },
          },
        },
      ],
    });
    expect(result.hasAcroForm).toBe(true);
    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0].name).toBe("firstName");
    expect(result.formFields[0].hasTU).toBe(true);
  });

  it("maps struct-tree MCIDs to pages via the /Pages-tree fallback", () => {
    // No top-level `pages` array → the parser must walk Catalog → /Pages and
    // key the page map with normalized refs so /Pg lookups resolve.
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: {
              "/Type": "/Catalog",
              "/Pages": "2 0 R",
              "/StructTreeRoot": "4 0 R",
            },
          },
          "obj:2 0 R": {
            value: { "/Type": "/Pages", "/Kids": ["3 0 R"], "/Count": 1 },
          },
          "obj:3 0 R": { value: { "/Type": "/Page", "/Parent": "2 0 R" } },
          "obj:4 0 R": {
            value: { "/Type": "/StructTreeRoot", "/K": ["5 0 R"] },
          },
          "obj:5 0 R": {
            value: { "/S": "/P", "/Pg": "3 0 R", "/K": [0, 1] },
          },
        },
      ],
    });
    expect(result.structTreeMcidsByPage).toEqual({ 1: [0, 1] });
  });
});

// ---------------------------------------------------------------------------
// Multi-widget fields (radio groups, split field/widget pattern)
// ---------------------------------------------------------------------------
// In the split pattern, /TU (the accessible tooltip) lives on the PARENT
// field dict while each option is a kid /Widget annotation without /T or
// /TU. Counting each kid widget as its own unlabeled field manufactured
// false "missing tooltip" findings (a 5-option radio group reported five
// unlabeled fields).

describe("multi-widget form fields", () => {
  it("counts a radio group as ONE field, labeled via the parent's /TU", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" },
          },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R"] } },
          "obj:3 0 R": {
            value: {
              "/T": "u:contactMethod",
              "/TU": "u:Preferred contact method",
              "/FT": "/Btn",
              "/Kids": ["4 0 R", "5 0 R", "6 0 R"],
            },
          },
          "obj:4 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
          "obj:5 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
          "obj:6 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0].name).toBe("contactMethod");
    expect(result.formFields[0].hasTU).toBe(true);
  });

  it("reports a radio group whose parent lacks /TU as ONE unlabeled field", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" },
          },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R"] } },
          "obj:3 0 R": {
            value: { "/T": "u:choice", "/FT": "/Btn", "/Kids": ["4 0 R", "5 0 R"] },
          },
          "obj:4 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
          "obj:5 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0].hasTU).toBe(false);
  });

  it("still counts merged field+widget dicts individually", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" },
          },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R", "4 0 R"] } },
          "obj:3 0 R": {
            value: {
              "/Type": "/Annot",
              "/Subtype": "/Widget",
              "/T": "u:firstName",
              "/TU": "u:First Name",
            },
          },
          "obj:4 0 R": {
            value: {
              "/Type": "/Annot",
              "/Subtype": "/Widget",
              "/T": "u:lastName",
            },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(2);
    const byName = Object.fromEntries(result.formFields.map((f) => [f.name, f.hasTU]));
    expect(byName).toEqual({ firstName: true, lastName: false });
  });

  it("does not double-count a non-terminal parent field from the /Fields fallback", () => {
    // "address" is a container whose kids are real fields; only the kid
    // terminal fields should be counted.
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": {
            value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" },
          },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R"] } },
          "obj:3 0 R": {
            value: { "/T": "u:address", "/Kids": ["4 0 R", "5 0 R"] },
          },
          "obj:4 0 R": {
            value: {
              "/Type": "/Annot",
              "/Subtype": "/Widget",
              "/T": "u:line1",
              "/TU": "u:Address line 1",
              "/Parent": "3 0 R",
            },
          },
          "obj:5 0 R": {
            value: {
              "/Type": "/Annot",
              "/Subtype": "/Widget",
              "/T": "u:city",
              "/TU": "u:City",
              "/Parent": "3 0 R",
            },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(2);
    expect(result.formFields.every((f) => f.hasTU)).toBe(true);
  });

  it("still counts an orphan widget (no /T, no /Parent) as a field", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" } },
          "obj:2 0 R": { value: { "/Fields": [] } },
          "obj:3 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget" },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0].hasTU).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ColSpan / RowSpan in column-consistency
// ---------------------------------------------------------------------------
// A header cell with /ColSpan 2 occupies two grid columns; a cell with
// /RowSpan 2 occupies a column in the following row. Ignoring the spans
// flagged correctly built tables as "inconsistent column counts".

describe("table column consistency with spans", () => {
  it("treats a ColSpan'd header row as consistent with its data rows", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/Table", "/K": ["3 0 R", "6 0 R"] } },
          "obj:3 0 R": { value: { "/S": "/TR", "/K": ["4 0 R"] } },
          "obj:4 0 R": {
            value: {
              "/S": "/TH",
              "/A": { "/O": "/Table", "/ColSpan": 2, "/Scope": "/Column" },
            },
          },
          "obj:6 0 R": { value: { "/S": "/TR", "/K": ["7 0 R", "8 0 R"] } },
          "obj:7 0 R": { value: { "/S": "/TD" } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables[0].columnCounts).toEqual([2, 2]);
    expect(result.tables[0].hasConsistentColumns).toBe(true);
  });

  it("treats a RowSpan'd cell as occupying the following row", () => {
    // Row 1: [TD rowspan=2][TD]  → 2 columns
    // Row 2: [TD]                → 1 cell + 1 carried = 2 columns
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/Table", "/K": ["3 0 R", "7 0 R"] } },
          "obj:3 0 R": { value: { "/S": "/TR", "/K": ["4 0 R", "5 0 R"] } },
          "obj:4 0 R": {
            value: { "/S": "/TD", "/A": { "/O": "/Table", "/RowSpan": 2 } },
          },
          "obj:5 0 R": { value: { "/S": "/TD" } },
          "obj:7 0 R": { value: { "/S": "/TR", "/K": ["8 0 R"] } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables[0].columnCounts).toEqual([2, 2]);
    expect(result.tables[0].hasConsistentColumns).toBe(true);
  });

  it("reads spans from an /A attribute ARRAY", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/Table", "/K": ["3 0 R", "6 0 R"] } },
          "obj:3 0 R": { value: { "/S": "/TR", "/K": ["4 0 R", "5 0 R"] } },
          "obj:4 0 R": {
            value: {
              "/S": "/TH",
              "/A": [{ "/O": "/Layout" }, { "/O": "/Table", "/ColSpan": 3 }],
            },
          },
          "obj:5 0 R": { value: { "/S": "/TH" } },
          "obj:6 0 R": {
            value: { "/S": "/TR", "/K": ["7 0 R", "8 0 R", "9 0 R", "10 0 R"] },
          },
          "obj:7 0 R": { value: { "/S": "/TD" } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
          "obj:9 0 R": { value: { "/S": "/TD" } },
          "obj:10 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables[0].columnCounts).toEqual([4, 4]);
    expect(result.tables[0].hasConsistentColumns).toBe(true);
  });

  it("still flags genuinely inconsistent tables", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/Table", "/K": ["3 0 R", "7 0 R"] } },
          "obj:3 0 R": {
            value: { "/S": "/TR", "/K": ["4 0 R", "5 0 R", "6 0 R"] },
          },
          "obj:4 0 R": { value: { "/S": "/TD" } },
          "obj:5 0 R": { value: { "/S": "/TD" } },
          "obj:6 0 R": { value: { "/S": "/TD" } },
          "obj:7 0 R": { value: { "/S": "/TR", "/K": ["8 0 R"] } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables[0].columnCounts).toEqual([3, 1]);
    expect(result.tables[0].hasConsistentColumns).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// List well-formedness — LBody required, Lbl optional
// ---------------------------------------------------------------------------
// ISO 32000 allows an <LI> whose label is absent (or folded into the body);
// common tagging tools emit LBody-only items. Requiring <Lbl> on every item
// produced false "confirmed WCAG 1.3.1 failure" verdicts for conformant
// lists. <Lbl> presence is still reported (hasLabels) as an advisory.

describe("list well-formedness", () => {
  it("treats an LBody-only list (no Lbl) as well-formed", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/L", "/K": ["3 0 R", "5 0 R"] } },
          "obj:3 0 R": { value: { "/S": "/LI", "/K": ["4 0 R"] } },
          "obj:4 0 R": { value: { "/S": "/LBody" } },
          "obj:5 0 R": { value: { "/S": "/LI", "/K": ["6 0 R"] } },
          "obj:6 0 R": { value: { "/S": "/LBody" } },
        },
      ],
    });
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].isWellFormed).toBe(true);
    expect(result.lists[0].hasLabels).toBe(false);
    expect(result.lists[0].hasBodies).toBe(true);
  });

  it("still treats an LI without LBody as malformed", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": { value: { "/S": "/L", "/K": ["3 0 R"] } },
          "obj:3 0 R": { value: { "/S": "/LI", "/K": ["4 0 R"] } },
          "obj:4 0 R": { value: { "/S": "/Lbl" } },
        },
      ],
    });
    expect(result.lists[0].isWellFormed).toBe(false);
  });
});

describe("qpdf exit-code gating for recovery", () => {
  it("does NOT recover stdout from exit code 2 (errors) even when it parses", () => {
    // Exit 2 means "errors — file not processed correctly". Recovering its
    // output would let the conformance gate assert confirmed WCAG failures
    // from data qpdf itself disclaimed.
    const err: any = new Error("qpdf: hard error");
    err.status = 2;
    err.stdout = JSON.stringify({
      qpdf: [{}, { "obj:1 0 R": { value: { "/Type": "/Catalog" } } }],
    });
    err.stderr = "qpdf: some error";
    mockExec.mockImplementation(() => {
      throw err;
    });

    const result = analyzeWithQpdf(Buffer.from("fake"));
    expect(result.error).toBe("QPDF parsing failed");
  });

  it("does NOT treat a degenerate JSON object as a recovered analysis", () => {
    const err: any = new Error("qpdf: operation succeeded with warnings");
    err.status = 3;
    err.stdout = "{}";
    mockExec.mockImplementation(() => {
      throw err;
    });

    const result = analyzeWithQpdf(Buffer.from("fake"));
    expect(result.error).toBe("QPDF parsing failed");
  });
});

describe("merged field+widget with kid widgets (review hardening)", () => {
  it("counts the field once when the merged dict is also the kids' /Parent", () => {
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog", "/AcroForm": "2 0 R" } },
          "obj:2 0 R": { value: { "/Fields": ["3 0 R"] } },
          // Malformed-but-occurring: the field dict is itself a widget AND
          // has kid widgets pointing back at it.
          "obj:3 0 R": {
            value: {
              "/Type": "/Annot",
              "/Subtype": "/Widget",
              "/T": "u:choice",
              "/TU": "u:Pick one",
              "/Kids": ["4 0 R"],
            },
          },
          "obj:4 0 R": {
            value: { "/Type": "/Annot", "/Subtype": "/Widget", "/Parent": "3 0 R" },
          },
        },
      ],
    });
    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0].hasTU).toBe(true);
  });
});

describe("multi-row RowSpan carry", () => {
  it("carries a RowSpan=3 cell through both following rows", () => {
    // Row 1: [TD rowspan=3][TD] → 2 | Row 2: [TD] + carry → 2 | Row 3: [TD] + carry → 2
    const result = parseJson({
      qpdf: [
        {},
        {
          "obj:1 0 R": { value: { "/Type": "/Catalog" } },
          "obj:2 0 R": {
            value: { "/S": "/Table", "/K": ["3 0 R", "7 0 R", "9 0 R"] },
          },
          "obj:3 0 R": { value: { "/S": "/TR", "/K": ["4 0 R", "5 0 R"] } },
          "obj:4 0 R": {
            value: { "/S": "/TD", "/A": { "/O": "/Table", "/RowSpan": 3 } },
          },
          "obj:5 0 R": { value: { "/S": "/TD" } },
          "obj:7 0 R": { value: { "/S": "/TR", "/K": ["8 0 R"] } },
          "obj:8 0 R": { value: { "/S": "/TD" } },
          "obj:9 0 R": { value: { "/S": "/TR", "/K": ["10 0 R"] } },
          "obj:10 0 R": { value: { "/S": "/TD" } },
        },
      ],
    });
    expect(result.tables[0].columnCounts).toEqual([2, 2, 2]);
    expect(result.tables[0].hasConsistentColumns).toBe(true);
  });
});

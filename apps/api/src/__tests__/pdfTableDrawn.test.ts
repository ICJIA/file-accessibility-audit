/**
 * A PDF TABLE THAT DRAWS NOTHING (2026-10-06, user decision: "detect drawn
 * lines"). Word has never scored a bare grid: no style, border, shading or
 * header mark — a table used only to line things up. The same grid saved as a
 * PDF becomes a <Table> with no <TH>, and PDF accused it of a missing header
 * row. The only evidence a PDF offers is what its page DRAWS: a header-less
 * table with no visible ruled line and no cell fill inside its area is a
 * layout grid, exactly as in Word. A ruled table with no header row is still
 * accused, and with no evidence either way the old rule stands.
 *
 * Measured on the corpus first: 38 header-less tables draw lines (the budget
 * tables among them — still accused); the 7 that draw nothing are prose an
 * autotagger cut into "cells", which were never data tables.
 *
 * Layers, each pure and tested here:
 *   analyzeTable            → contentIds (pdf.js-form ids of its cells)
 *   paintedPathBoxes        → page-space boxes of visible painted paths
 *   tableRegionsForPage     → each <Table>'s area on a page, drawn or not
 *   pdfTableDrawsNothing    → the shared predicate scorer and gate read
 */
import { describe, it, expect } from "vitest";
import { analyzeTable } from "@file-audit/analyzer/qpdfStructTree";
import { paintedPathBoxes, tableRegionsForPage } from "../services/pdfjsService.js";
import { pdfTableDrawsNothing } from "@file-audit/analyzer/scoring/common";
import { scoreDocument } from "../services/scorer.js";
import { taggedBaseline } from "./helpers/mockResults.js";

describe("analyzeTable records its cells' marked-content ids in pdf.js form", () => {
  it("takes the page from the cell, an ancestor, or an MCR dict", () => {
    const objects: Record<string, any> = {
      "obj:20 0 R": { "/S": "/TD", "/Pg": "12 0 R", "/K": 3 },
      "obj:21 0 R": { "/S": "/TD", "/K": [{ "/Type": "/MCR", "/MCID": 4, "/Pg": "13 0 R" }] },
      "obj:22 0 R": { "/S": "/TD", "/K": [5] }, // inherits the row's /Pg
      "obj:10 0 R": { "/S": "/TR", "/K": ["20 0 R", "21 0 R"] },
      "obj:11 0 R": { "/S": "/TR", "/Pg": "14 0 R", "/K": ["22 0 R"] },
    };
    const table = { "/S": "/Table", "/K": ["10 0 R", "11 0 R"] };
    const t = analyzeTable(table, objects, {});
    expect(t.contentIds).toEqual(["p12R_mc3", "p13R_mc4", "p14R_mc5"]);
  });

  it("writes a non-zero generation the way pdf.js does", () => {
    const objects: Record<string, any> = {
      "obj:20 0 R": { "/S": "/TD", "/Pg": "12 2 R", "/K": 7 },
      "obj:10 0 R": { "/S": "/TR", "/K": ["20 0 R"] },
    };
    const t = analyzeTable({ "/S": "/Table", "/K": ["10 0 R"] }, objects, {});
    expect(t.contentIds).toEqual(["p12R2_mc7"]);
  });
});

// A synthetic operator vocabulary — the function takes pdf.js's OPS map as an
// argument, so the test needs no pdf.js at all.
const OPS = {
  save: 1,
  restore: 2,
  transform: 3,
  constructPath: 4,
  fill: 5,
  stroke: 6,
  endPath: 7,
  setFillRGBColor: 8,
  setStrokeRGBColor: 9,
  paintFormXObjectBegin: 10,
  paintFormXObjectEnd: 11,
  eoFill: 12,
  fillStroke: 13,
};
type Op = [number, unknown[]];
const run = (ops: Op[]) =>
  paintedPathBoxes(
    ops.map((o) => o[0]),
    ops.map((o) => o[1]),
    OPS as unknown as Record<string, number>,
  );
const rect = (x0: number, y0: number, x1: number, y1: number): Op => [
  OPS.constructPath,
  [[], [], [x0, y0, x1, y1]],
];

describe("paintedPathBoxes — what a page visibly draws, in page space", () => {
  it("a black filled rule and a stroked box are drawn", () => {
    expect(run([rect(70, 600, 400, 601), [OPS.fill, []]])).toEqual([[70, 600, 400, 601]]);
    expect(run([rect(70, 600, 400, 640), [OPS.stroke, []]])).toEqual([[70, 600, 400, 640]]);
  });

  it("a white fill, a white stroke and a clipping path draw nothing", () => {
    expect(
      run([[OPS.setFillRGBColor, [255, 255, 255]], rect(70, 600, 400, 640), [OPS.fill, []]]),
    ).toEqual([]);
    expect(
      run([[OPS.setStrokeRGBColor, [255, 255, 255]], rect(70, 600, 400, 640), [OPS.stroke, []]]),
    ).toEqual([]);
    expect(run([rect(70, 600, 400, 640), [OPS.endPath, []]])).toEqual([]);
  });

  it("a coloured fill is drawn", () => {
    expect(
      run([[OPS.setFillRGBColor, [31, 56, 100]], rect(70, 600, 400, 640), [OPS.eoFill, []]]),
    ).toEqual([[70, 600, 400, 640]]);
  });

  it("applies the current transform, and save/restore scopes it", () => {
    const boxes = run([
      [OPS.save, []],
      [OPS.transform, [1, 0, 0, 1, 100, 50]],
      rect(0, 0, 10, 10),
      [OPS.fill, []],
      [OPS.restore, []],
      rect(0, 0, 10, 10),
      [OPS.fill, []],
    ]);
    expect(boxes).toEqual([
      [100, 50, 110, 60],
      [0, 0, 10, 10],
    ]);
  });

  it("applies a form XObject's matrix inside it", () => {
    const boxes = run([
      [
        OPS.paintFormXObjectBegin,
        [
          [2, 0, 0, 2, 10, 10],
          [0, 0, 100, 100],
        ],
      ],
      rect(0, 0, 5, 5),
      [OPS.fill, []],
      [OPS.paintFormXObjectEnd, []],
    ]);
    expect(boxes).toEqual([[10, 10, 20, 20]]);
  });
});

describe("tableRegionsForPage — each table's area, and whether anything is drawn in it", () => {
  const tree = {
    children: [
      {
        role: "Table",
        children: [
          {
            role: "TR",
            children: [
              { role: "TD", children: [{ type: "content", id: "p3R_mc1" }] },
              { role: "TD", children: [{ type: "content", id: "p3R_mc2" }] },
            ],
          },
        ],
      },
    ],
  };
  const boxes = new Map([
    ["p3R_mc1", [72, 700, 150, 712]],
    ["p3R_mc2", [220, 700, 300, 712]],
  ]);

  it("a ruled line inside the table's area makes it drawn", () => {
    const r = tableRegionsForPage(tree, boxes, [[70, 696, 302, 697]], 1);
    expect(r).toEqual([{ ids: ["p3R_mc1", "p3R_mc2"], page: 1, drawn: true }]);
  });

  it("nothing painted near it leaves it undrawn", () => {
    expect(tableRegionsForPage(tree, boxes, [[70, 100, 300, 101]], 1)[0]!.drawn).toBe(false);
  });

  it("a page-sized background behind everything does not count as drawing the table", () => {
    expect(tableRegionsForPage(tree, boxes, [[0, 0, 612, 792]], 1)[0]!.drawn).toBe(false);
  });

  it("a table with no attributable text yields no region at all — no evidence", () => {
    expect(tableRegionsForPage(tree, new Map(), [[70, 696, 302, 697]], 1)).toEqual([]);
  });
});

describe("pdfTableDrawsNothing — the predicate the scorer and the gate share", () => {
  const headerless = {
    hasHeaders: false,
    contentIds: ["p3R_mc1", "p3R_mc2"],
  } as Parameters<typeof pdfTableDrawsNothing>[0];

  it("a header-less table whose every matched region drew nothing is bare", () => {
    expect(pdfTableDrawsNothing(headerless, [{ ids: ["p3R_mc2"], page: 1, drawn: false }])).toBe(
      true,
    );
  });

  it("any drawn region, no matched region, or header cells mean it is not bare", () => {
    expect(
      pdfTableDrawsNothing(headerless, [
        { ids: ["p3R_mc1"], page: 1, drawn: false },
        { ids: ["p3R_mc2"], page: 2, drawn: true },
      ]),
    ).toBe(false);
    expect(pdfTableDrawsNothing(headerless, [{ ids: ["p9R_mc1"], page: 4, drawn: false }])).toBe(
      false,
    );
    expect(pdfTableDrawsNothing(headerless, undefined)).toBe(false);
    expect(
      pdfTableDrawsNothing({ ...headerless, hasHeaders: true }, [
        { ids: ["p3R_mc1"], page: 1, drawn: false },
      ]),
    ).toBe(false);
  });
});

describe("scoring — a bare header-less PDF table is a layout grid, as in Word", () => {
  const withTable = (drawn: boolean | null) => {
    const { qpdf, pdfjs } = taggedBaseline();
    qpdf.tables = [
      {
        hasHeaders: false,
        headerCount: 0,
        dataCellCount: 6,
        hasScope: false,
        scopeMissingCount: 0,
        hasRowStructure: true,
        rowCount: 3,
        hasNestedTable: false,
        hasCaption: false,
        hasConsistentColumns: true,
        columnCounts: [2, 2, 2],
        simpleHeaderLayout: false,
        hasHeaderAssociation: false,
        contentIds: ["p3R_mc1", "p3R_mc2"],
      },
    ];
    if (drawn !== null) pdfjs.tableRegions = [{ ids: ["p3R_mc1"], page: 1, drawn }];
    return scoreDocument(qpdf, pdfjs);
  };
  const table = (r: ReturnType<typeof scoreDocument>) =>
    r.categories.find((c) => c.id === "table_markup")!;
  const accused = (r: ReturnType<typeof scoreDocument>) =>
    r.conformance.failures.some((f) => f.category === "table_markup");

  it("nothing drawn: not scored, never gated, reported as a likely layout grid", () => {
    const r = withTable(false);
    expect(table(r).score).toBeNull();
    expect(accused(r)).toBe(false);
    expect(table(r).findings.join(" ")).toMatch(/nothing drawn/i);
  });

  it("ruled: still a data table missing its header row — 45, 1.3.1 named", () => {
    const r = withTable(true);
    expect(table(r).score).toBe(45);
    expect(accused(r)).toBe(true);
  });

  it("no evidence either way: the old rule stands — 45, 1.3.1 named", () => {
    const r = withTable(null);
    expect(table(r).score).toBe(45);
    expect(accused(r)).toBe(true);
  });
});

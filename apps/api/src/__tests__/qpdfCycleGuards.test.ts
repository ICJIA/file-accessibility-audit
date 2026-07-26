/**
 * Termination guards for the structure-tree walkers in qpdfService /
 * qpdfStructTree.
 *
 * A PDF's structure tree is an object GRAPH, not a tree: nothing stops a
 * /K entry from naming an ancestor (a malformed or hostile producer), and
 * nothing stops two elements from sharing a child (a DAG). Walkers that
 * resolve indirect references without a visited set re-expand every PATH
 * through the graph, so cost grows exponentially in the depth cap rather
 * than linearly in the object count, and every re-expansion double-counts
 * the elements it passes.
 *
 * Cost matters as much as correctness here: the qpdf JSON walk and the
 * scorer run SYNCHRONOUSLY in the main Express process (only the qpdf
 * subprocess and pdfjs are time-boxed), so a runaway walk blocks the event
 * loop for every other request, health checks included. Measured against
 * the unguarded walkers: a THREE-object cyclic tree took calculateTreeDepth
 * 9 seconds at fanout 2 and never returned at fanout 3.
 *
 * These tests deliberately assert on COUNTS rather than wall-clock. A
 * synchronous runaway cannot be interrupted by a test timeout (the timer
 * never gets to run), so a timing-based test would hang the runner instead
 * of failing. Each graph below is small enough to terminate either way, and
 * the unguarded walkers report provably wrong numbers on it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
  default: { writeFileSync: vi.fn(), unlinkSync: vi.fn() },
}));

import { analyzeWithQpdf } from "../services/qpdfService.js";
import { analyzeTable } from "@file-audit/analyzer/qpdfStructTree";
import { execFileSync } from "node:child_process";

const mockExec = vi.mocked(execFileSync);

function parseJson(json: any) {
  mockExec.mockReturnValue(JSON.stringify(json));
  return analyzeWithQpdf(Buffer.from("fake"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("structure-tree walkers terminate on cyclic object graphs", () => {
  it("reports the real tree depth, not the safety cap, when children cycle back to the root", () => {
    // StructTreeRoot -> Sect -> (back to StructTreeRoot). Depth is measured
    // with the root at 0, so the real answer is 1. An unguarded walk keeps
    // going round the cycle incrementing depth until the depth-50 cap and
    // reports 50 — turning a one-level tree into a "richly nested" one, and
    // in the process handing `reading_order` a fabricated pass (the category
    // treats depth <= 1 as a flat tree).
    const result = parseJson({
      qpdf: [
        null,
        {
          "obj:1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "obj:2 0 R": { "/Type": "/StructTreeRoot", "/K": ["3 0 R"] },
          "obj:3 0 R": { "/S": "/Sect", "/K": ["2 0 R"], "/P": "2 0 R" },
        },
      ],
    });

    expect(result.hasStructTree).toBe(true);
    expect(result.structTreeDepth).toBe(1);
  });

  it("counts each <LI> once when list items cycle back to the list", () => {
    // L -> LI -> (back to L). There is exactly ONE list item; an unguarded
    // walk re-counts it on every lap of the cycle until the depth cap.
    // Fanout is deliberately 1: a wider cycle would ALSO blow up
    // calculateTreeDepth (depth cap 50) on the same fixture and hang the
    // runner before this assertion could fail.
    const result = parseJson({
      qpdf: [
        null,
        {
          "obj:1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "9 0 R" },
          "obj:9 0 R": { "/Type": "/StructTreeRoot", "/K": ["2 0 R"] },
          "obj:2 0 R": { "/S": "/L", "/K": ["100 0 R"], "/P": "9 0 R" },
          "obj:100 0 R": {
            "/S": "/LI",
            "/K": [{ "/S": "/LBody" }, "2 0 R"],
            "/P": "2 0 R",
          },
        },
      ],
    });

    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].itemCount).toBe(1);
  });

  it("counts each <TD> once when table rows cycle back to the table", () => {
    // Table -> 3x TR -> 1 TD each, and every TD names the Table again.
    const objects: Record<string, any> = {};
    const rowRefs: string[] = [];
    for (let i = 0; i < 3; i++) {
      objects[`obj:${200 + i} 0 R`] = { "/S": "/TD", "/K": ["2 0 R"] };
      objects[`obj:${100 + i} 0 R`] = { "/S": "/TR", "/K": [`${200 + i} 0 R`] };
      rowRefs.push(`${100 + i} 0 R`);
    }
    const table = { "/S": "/Table", "/K": rowRefs };
    objects["obj:2 0 R"] = table;

    const analysis = analyzeTable(table, objects, {});

    expect(analysis.rowCount).toBe(3);
    expect(analysis.dataCellCount).toBe(3);
  });

  it("counts each <TD> once when cells form a shared DAG rather than a cycle", () => {
    // No cycle at all: 6 layers that each fan out to the same 3 shared
    // children. There are 18 distinct <TD> elements; a per-path depth cap
    // alone walks 3^6 paths and counts them hundreds of times over.
    const objects: Record<string, any> = {};
    const layers: string[][] = [];
    for (let layer = 0; layer < 6; layer++) {
      layers.push([0, 1, 2].map((i) => `${1000 + layer * 10 + i} 0 R`));
    }
    for (let layer = 0; layer < 6; layer++) {
      for (const ref of layers[layer]) {
        objects[`obj:${ref}`] = {
          "/S": "/TD",
          ...(layer + 1 < 6 ? { "/K": layers[layer + 1] } : {}),
        };
      }
    }
    const table = { "/S": "/Table", "/K": layers[0] };

    const analysis = analyzeTable(table, objects, {});

    expect(analysis.dataCellCount).toBe(18);
  });

  it("keeps the structural analysis when the /Pages tree cycles back", () => {
    // The top-level `pages` array is deliberately absent so the /Pages-tree
    // fallback runs (the shape qpdf's exit-3 warning recovery can produce).
    // Unguarded, this recurses until the stack overflows, and parseQpdfJson's
    // catch swallows the RangeError — discarding the ENTIRE structural
    // analysis and reporting a tagged document as unparseable.
    const result = parseJson({
      qpdf: [
        null,
        {
          "obj:1 0 R": {
            "/Type": "/Catalog",
            "/Pages": "2 0 R",
            "/StructTreeRoot": "9 0 R",
          },
          "obj:2 0 R": { "/Type": "/Pages", "/Kids": ["3 0 R"] },
          "obj:3 0 R": { "/Type": "/Pages", "/Kids": ["2 0 R", "4 0 R"] },
          "obj:4 0 R": { "/Type": "/Page" },
          "obj:9 0 R": { "/Type": "/StructTreeRoot", "/K": [] },
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.hasStructTree).toBe(true);
    expect(result.totalPageCount).toBe(1);
  });
});

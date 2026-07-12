import { describe, it, expect, vi, afterEach } from "vitest";
import JSZip from "jszip";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { analyzeXlsx, XlsxParseError, countCellsAnyDepth } from "../services/xlsxService.js";
import { parseXml, rootElement } from "../services/ooxml.js";

describe("xlsxService: workbook + sheets", () => {
  it("reads core metadata, sheet names, hidden state, default-name flags", async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: "Sheet1", dimensionRef: "A1:D20" },
        { name: "FY26 Grants", dimensionRef: "A1:B2" },
        { name: "Sheet 3", hidden: true },
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.metadata.title).toBe("Grant Ledger");
    expect(a.metadata.sheetCount).toBe(3);
    expect(a.sheets.map((s) => s.defaultNamed)).toEqual([true, false, true]);
    expect(a.sheets.map((s) => s.hidden)).toEqual([false, false, true]);
  });

  it("computes used-range cell counts from the dimension ref", async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: "A", dimensionRef: "A1:D20" }, // 4 × 20 = 80
        { name: "B", dimensionRef: "A1" }, // 1
        { name: "C" }, // no dimension → 0
        { name: "D", dimensionRef: "AA10:AB11" }, // 2 × 2 = 4 (base-26 columns)
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.sheets.map((s) => s.usedRangeCellCount)).toEqual([80, 1, 0, 4]);
  });

  it("counts merged ranges per sheet", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "M", dimensionRef: "A1:B4", mergeCount: 3 }] });
    expect((await analyzeXlsx(buf)).sheets[0].mergedRangeCount).toBe(3);
  });

  it("rejects non-xlsx input", async () => {
    await expect(analyzeXlsx(Buffer.from("nope"))).rejects.toBeInstanceOf(XlsxParseError);
  });
});

describe("xlsxService: tables, drawings, links", () => {
  it("reads defined tables: absent headerRowCount means header ON, 0 means OFF", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "Data",
          dimensionRef: "A1:C4",
          tables: [{ name: "GoodTable" }, { name: "BadTable", headerRowCount: 0 }],
        },
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.tables).toEqual([
      { sheetName: "Data", name: "GoodTable", hasHeaderRow: true },
      { sheetName: "Data", name: "BadTable", hasHeaderRow: false },
    ]);
    expect(a.sheets[0].hasDefinedTable).toBe(true);
  });

  it("reads picture and chart alt text from the drawing part", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "Viz",
          dimensionRef: "A1:B2",
          drawings: [
            { kind: "pic", descr: "Staff photo" },
            { kind: "chart" },
            { kind: "pic", decorative: true },
          ],
        },
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.images).toEqual([
      { altText: "Staff photo", decorative: false },
      { altText: null, decorative: false },
      { altText: null, decorative: true },
    ]);
  });

  it("finds a picture inside a twoCellAnchor (real Excel default)", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "T",
          dimensionRef: "A1:B2",
          drawings: [{ kind: "pic", descr: "Two-cell anchored", anchor: "twoCell" }],
        },
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.images).toEqual([{ altText: "Two-cell anchored", decorative: false }]);
  });

  it("collects every object in a grouped anchor (nothing silently dropped)", async () => {
    const grp = `<xdr:oneCellAnchor><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="30" name="Group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr>
      <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="31" name="p" descr="Grouped photo"/><xdr:cNvPicPr/></xdr:nvPicPr></xdr:pic>
      <xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="32" name="c"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr></xdr:graphicFrame>
    </xdr:grpSp></xdr:oneCellAnchor>`;
    const buf = await buildXlsx({
      sheets: [{ name: "G", dimensionRef: "A1:B2", rawDrawings: grp }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.images).toEqual([
      { altText: "Grouped photo", decorative: false },
      { altText: null, decorative: false },
    ]);
  });

  it('reads hyperlinks with display text, and "" when display is absent', async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "L",
          dimensionRef: "A1:B2",
          hyperlinks: [
            { id: "rIdH1", target: "https://example.gov/a", display: "Annual report" },
            { id: "rIdH2", target: "https://example.gov/b" },
          ],
        },
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.links).toEqual([
      { text: "Annual report", url: "https://example.gov/a" },
      { text: "", url: "https://example.gov/b" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Security-hardening regression tests (red/blue audit, DoS): MAX_CELLS
// previously trusted the self-reported <dimension ref> instead of the actual
// parsed <c> cells, so a hostile `<dimension ref="A1:A1"/>` over a huge
// <sheetData> bypassed the cap entirely while the content walks (drawings,
// hyperlinks, tables) still processed every real cell's siblings. See
// fix-2-report.md.
// ---------------------------------------------------------------------------

describe("xlsxService: MAX_CELLS cap derives from real parsed cells, not the dimension ref (DoS hardening)", () => {
  it("countCellsAnyDepth counts <c> elements at any depth, not just directly under a row", () => {
    const nested = Array.from({ length: 50 }, (_, i) => `<c r="A${i + 1}"/>`).join("");
    // Deliberately wrapped one level deeper than real Excel output (sheetData
    // > row > c) to prove the tally isn't hard-coded to that exact shape — a
    // hostile file doesn't have to respect it.
    const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData><row r="1"><weirdWrapper>${nested}</weirdWrapper></row></sheetData>
    </worksheet>`;
    const sheetRoot = rootElement(parseXml(xml), "worksheet")!;
    expect(countCellsAnyDepth(sheetRoot)).toBe(50);
  });

  it("rejects a workbook whose real cell count exceeds MAX_CELLS even when <dimension ref> understates it", async () => {
    // Scope a tiny MAX_CELLS to THIS test only (the real 1,000,000 cap is far
    // too large to build a fixture for).
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_CELLS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // <dimension ref> lies: it claims a single cell (well under the cap)...
      const cells = Array.from({ length: 10 }, (_, i) => ({ ref: `A${i + 1}`, value: "1" }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:A1", cells }] });
      // ...but 10 real <c> elements exceed the scoped cap of 5.
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("does not reject when the dimension ref is huge but the real cell count is small (dimension no longer drives the cap)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_CELLS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze } = await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // <dimension ref> claims a huge range, but only 2 real cells exist.
      const buf = await build({
        sheets: [
          {
            name: "S",
            dimensionRef: "A1:A1000000",
            cells: [
              { ref: "A1", value: "1" },
              { ref: "A2", value: "2" },
            ],
          },
        ],
      });
      await expect(analyze(buf)).resolves.toBeTruthy();
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("usedRangeCellCount (scoring/display metadata) still comes from the dimension ref, unaffected by the cap change", async () => {
    const buf = await buildXlsx({
      sheets: [{ name: "S", dimensionRef: "A1:D20", cells: [{ ref: "A1", value: "1" }] }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.sheets[0].usedRangeCellCount).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Security-hardening regression tests (red/blue audit follow-up, DoS): the
// drawing-object and hyperlink caps must PRE-COUNT the source elements and
// throw BEFORE the append loop runs — mirroring FIX A's cell cap and pptx's
// countShapesAnyDepth-before-collectSlideContent. A post-append check leaves a
// single-part burst window: ONE malicious 30MB drawing part can push millions
// of entries into analysis.images before the check fires (~0.5–1 GB transient,
// a credible OOM on a 4 GB droplet). See fix-2-report.md.
//
// The pin: monkey-patch Array.prototype.push with a wrapper that (a) tallies,
// into a SCALAR counter, only image/link-shaped items and (b) forwards to the
// real push — so no array push happens inside the wrapper (a vitest spy on
// push recurses: its own call-tracking pushes to mock.calls). Then assert that
// when analyzeXlsx rejects on an over-cap part, NOT ONE image/link object
// reached its array first. A post-append check pushes all N before throwing
// (RED: counter == N); a pre-count check throws with zero pushed (GREEN:
// counter == 0). The scoped-tiny cap keeps this structural, not wall-clock.
// ---------------------------------------------------------------------------

/** Runs `body` while counting how many pushed items match `match`, via a
 *  non-recursive Array.prototype.push wrapper (scalar counter + real push). */
async function countMatchingPushes(
  match: (item: unknown) => boolean,
  body: () => Promise<void>,
): Promise<number> {
  const origPush = Array.prototype.push;
  let matched = 0;
  Array.prototype.push = function (this: unknown[], ...items: unknown[]): number {
    for (const it of items) if (match(it)) matched++;
    return origPush.apply(this, items as never[]);
  } as typeof Array.prototype.push;
  try {
    await body();
  } finally {
    Array.prototype.push = origPush;
  }
  return matched;
}

const isImageItem = (it: unknown): boolean =>
  !!it && typeof it === "object" && "altText" in it && "decorative" in it;
const isLinkItem = (it: unknown): boolean =>
  !!it && typeof it === "object" && "url" in it && "text" in it;
const isTableItem = (it: unknown): boolean =>
  !!it && typeof it === "object" && "sheetName" in it && "hasHeaderRow" in it;

describe("xlsxService: drawing/hyperlink caps pre-count BEFORE the append loop (single-part burst window closed)", () => {
  it("throws before appending ANY image when one drawing part exceeds MAX_DRAWING_OBJECTS (no partial flood)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_OBJECTS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // ONE drawing part, 10 real pics WITH cNvPr (the flood-causing kind a
      // post-check would push) > cap 5.
      const drawings = Array.from({ length: 10 }, () => ({ kind: "pic" as const, descr: "x" }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawings }] });
      const imagePushes = await countMatchingPushes(isImageItem, async () => {
        await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
      });
      // The cap fires BEFORE the append loop, so not one image object reached
      // analysis.images. A post-append check would have pushed all 10 first.
      expect(imagePushes).toBe(0);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("admits a drawing part whose object count is exactly at the cap (valid doc not rejected)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_OBJECTS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze } = await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      const drawings = Array.from({ length: 5 }, () => ({ kind: "pic" as const, descr: "x" }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawings }] });
      const a = await analyze(buf);
      expect(a.images).toHaveLength(5); // count == cap, not > cap → processed normally
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("throws before appending ANY link when one sheet exceeds MAX_HYPERLINKS (no partial flood)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_HYPERLINKS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      const hyperlinks = Array.from({ length: 10 }, (_, i) => ({
        id: `rIdH${i}`,
        target: `https://example.gov/${i}`,
      }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", hyperlinks }] });
      const linkPushes = await countMatchingPushes(isLinkItem, async () => {
        await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
      });
      expect(linkPushes).toBe(0);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("admits hyperlinks whose count is exactly at the cap (valid doc not rejected)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_HYPERLINKS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze } = await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      const hyperlinks = Array.from({ length: 5 }, (_, i) => ({
        id: `rIdH${i}`,
        target: `https://example.gov/${i}`,
      }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", hyperlinks }] });
      const a = await analyze(buf);
      expect(a.links).toHaveLength(5);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// Security-hardening regression tests (red/blue audit follow-up, DoS): the
// defined-table cap is worse than plain array growth — each <.../table> rel
// triggers a table-PART read + parse (a fan-out READ amplifier), bounded only
// by the 30 MB rels-part cap (~300k rels/sheet) × MAX_SHEETS. It must
// PRE-COUNT the /table rels and throw BEFORE any part is read or appended, so
// a malicious workbook can't force a huge table-part read fan-out. Same
// push-wrapper pin as drawings/links: ZERO table entries reach analysis.tables
// before the throw (which also means ZERO table parts were read, since the
// read + push share one loop that never runs). See fix-2-report.md.
// ---------------------------------------------------------------------------

describe("xlsxService: defined-table count cap pre-counts /table rels BEFORE the read fan-out (DoS hardening)", () => {
  it("throws before reading/appending ANY table when one sheet exceeds MAX_TABLES (no read fan-out, no partial flood)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_TABLES: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // ONE sheet, 10 defined tables (10 /table rels + parts) > cap 5.
      const tables = Array.from({ length: 10 }, (_, i) => ({ name: `T${i}` }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", tables }] });
      const tablePushes = await countMatchingPushes(isTableItem, async () => {
        await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
      });
      // The cap fires BEFORE the read/push loop, so not one table part was read
      // and not one table entry reached analysis.tables. Without the cap the
      // loop reads + parses all 10 parts and pushes all 10 first.
      expect(tablePushes).toBe(0);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("admits a sheet whose defined-table count is exactly at the cap (valid doc not rejected)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_TABLES: 5 } };
    });
    try {
      const { analyzeXlsx: analyze } = await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      const tables = Array.from({ length: 5 }, (_, i) => ({ name: `T${i}` }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", tables }] });
      const a = await analyze(buf);
      expect(a.tables).toHaveLength(5); // count == cap, not > cap → processed normally
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// D1 [MEDIUM] security-hardening regression test (pre-merge re-audit): the
// drawing-REL cap has the SAME fan-out-read-amplifier shape as FIX C's
// table-rel cap above, but was missed by that fix — each `/drawing` rel in
// the sheetRels.filter(...) loop triggers a drawing-PART read + parse
// (await read → parseXml) BEFORE MAX_DRAWING_OBJECTS can even be checked on
// that part's content. A sheet declaring many drawing rels that each point
// at a large-but-object-sparse part (so MAX_DRAWING_OBJECTS never fires)
// forces unbounded read+parse work, bounded only by the 20s worker timeout.
// Mirrors 85c26ac's MAX_TABLES fix exactly: pre-count the /drawing rels and
// throw BEFORE any part in the loop is read. See fix-2-report.md /
// rb1-report.md.
// ---------------------------------------------------------------------------

describe("xlsxService: drawing-REL count cap pre-counts /drawing rels BEFORE the read fan-out (D1 DoS hardening)", () => {
  it("throws before reading/appending ANY drawing part when one sheet exceeds MAX_DRAWING_RELS (no read fan-out, no partial flood)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_RELS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // ONE sheet, 10 SEPARATE drawing rels/parts (1 tiny pic each — each
      // part is far under MAX_DRAWING_OBJECTS on its own). The REL COUNT
      // (10) exceeds the scoped cap (5); no single part's OBJECT count ever
      // would, so MAX_DRAWING_OBJECTS alone can't catch this shape.
      const drawingParts = Array.from({ length: 10 }, (_, i) => ({
        drawings: [{ kind: "pic" as const, descr: `p${i}` }],
      }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawingParts }] });
      const imagePushes = await countMatchingPushes(isImageItem, async () => {
        await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
      });
      // The cap fires BEFORE any drawing part is read, so not one image
      // object reached analysis.images — proving the READ fan-out (not just
      // the append) was blocked. Pre-fix, the loop reads+parses all 10 parts
      // (each individually under MAX_DRAWING_OBJECTS) before any cap fires.
      expect(imagePushes).toBe(0);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("admits a sheet whose drawing-rel count is exactly at the cap (valid doc not rejected)", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_RELS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze } = await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      const drawingParts = Array.from({ length: 5 }, (_, i) => ({
        drawings: [{ kind: "pic" as const, descr: `p${i}` }],
      }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawingParts }] });
      const a = await analyze(buf);
      expect(a.images).toHaveLength(5); // count == cap, not > cap → processed normally
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("a single part with many OBJECTS (not many rels) is still caught by the pre-existing MAX_DRAWING_OBJECTS cap, unaffected by this fix", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> };
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_OBJECTS: 5, MAX_DRAWING_RELS: 5 } };
    });
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
        await import("../services/xlsxService.js");
      const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
      // ONE drawing rel/part (well under MAX_DRAWING_RELS), 10 objects
      // inside it (over MAX_DRAWING_OBJECTS) — the pre-existing per-part cap
      // still fires; the new rel-count cap is a no-op here.
      const drawings = Array.from({ length: 10 }, () => ({ kind: "pic" as const, descr: "x" }));
      const buf = await build({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawings }] });
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });
});

describe("xlsxService: cumulative auxiliary-part BYTE budget fails fast on a few large, object-sparse drawing parts (RB3-3 DoS hardening)", () => {
  // D1 tightened MAX_DRAWING_RELS from 10,000 -> 1,000, but the review
  // benchmarked a shape that D1's rel-COUNT cap still can't catch: a few
  // large (near-MAX_UNCOMPRESSED_BYTES, 30 MB), OBJECT-SPARSE drawing parts
  // (no <xdr:pic>/<xdr:graphicFrame> at all, so MAX_DRAWING_OBJECTS never
  // engages either) cost real wall-clock time to read+parse (~729ms/rel
  // benchmarked) while the rel COUNT stays tiny — nowhere near even the
  // tightened 1,000 cap. Pre-fix, only the 20s ANALYSIS_TIMEOUT_MS would
  // eventually cut this off. The new cumulative-bytes-read budget
  // (XLSX.MAX_AUX_PART_BYTES) must catch it almost immediately instead.
  it("throws well before a 20s wall-clock timeout when two ~26 MB object-sparse drawing parts exceed the cumulative byte budget (rel count stays far under MAX_DRAWING_RELS)", async () => {
    // Two ~26 MB parts: individually under MAX_UNCOMPRESSED_BYTES (30 MB
    // per-part cap), but their SUM exceeds MAX_AUX_PART_BYTES (48 MB) on the
    // second part — well before a 3rd, 4th, ... part would ever be read.
    const padding = "x".repeat(26 * 1024 * 1024);
    const drawingParts = [
      { rawDrawings: `<pad>${padding}</pad>` },
      { rawDrawings: `<pad>${padding}</pad>` },
    ];
    const buf = await buildXlsx({ sheets: [{ name: "S", dimensionRef: "A1:B2", drawingParts }] });

    // Deterministic proof it's the cumulative BYTE budget (XLSX.MAX_AUX_PART_BYTES)
    // that stops this — not the 1,000-rel MAX_DRAWING_RELS count cap (only 2 rels
    // here, far under it) and not the 20s worker timeout (no timeout wraps
    // analyzeXlsx at this layer, so a wrong budget would run the full read+parse
    // and throw a different/no error). Wall-clock is intentionally NOT asserted:
    // allocating + zipping the 2×26 MB fixture is itself CPU-bound and, under
    // concurrent-suite contention, can exceed any tight ceiling and flake. The
    // generous explicit per-test timeout below is the only clock.
    await expect(analyzeXlsx(buf)).rejects.toBeInstanceOf(XlsxParseError);
  }, 30_000);

  it("the SAME budget also guards the defined-table read loop (the identical latent gap MAX_TABLES left open)", async () => {
    const padding = "x".repeat(26 * 1024 * 1024);
    const tables = [
      { name: "T1", padBytes: padding.length },
      { name: "T2", padBytes: padding.length },
    ];
    const buf = await buildXlsx({ sheets: [{ name: "S", dimensionRef: "A1:B2", tables }] });

    // Same rationale as the drawing-part test above: the XlsxParseError proves
    // the shared readAuxPart byte budget fired on the table loop; wall-clock is
    // not asserted (flaky under load), and a generous per-test timeout guards it.
    await expect(analyzeXlsx(buf)).rejects.toBeInstanceOf(XlsxParseError);
  }, 30_000);

  it("does not trip the new byte budget for legitimate small drawing parts (existing behavior unaffected)", async () => {
    const buf = await buildXlsx({
      sheets: [{ name: "S", dimensionRef: "A1:B2", drawings: [{ kind: "pic", descr: "ok" }] }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.images).toHaveLength(1);
  });
});

describe("xlsxService: styles contrast", () => {
  it("fails a low-contrast font/fill pair and labels it by style index", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B2",
          // Both styles must be APPLIED to a real non-empty cell — an unused
          // cellXfs entry is never evaluated (see the false-positive-hardening
          // describe block below).
          cells: [
            { ref: "A1", styleIndex: 1, value: "Total" },
            { ref: "A2", styleIndex: 2, value: "Total" },
          ],
        },
      ],
      styles: [
        { fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }, // ≈1.35:1 → fail
        { fontRgb: "FF000000", fillRgb: "FFFFFFFF" }, // 21:1 → pass
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.checkedRuns).toBe(2);
    expect(a.contrast.failing).toHaveLength(1);
    expect(a.contrast.failing[0]).toMatchObject({
      foreground: "#DDDDDD",
      background: "#FFFFFF",
      large: false,
    });
    expect(a.contrast.failing[0].text).toMatch(/cell style #\d+/);
  });

  it("large text uses the 3:1 threshold (18pt, or bold 14pt)", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B3",
          cells: [
            { ref: "A1", styleIndex: 1, value: "x" },
            { ref: "A2", styleIndex: 2, value: "x" },
            { ref: "A3", styleIndex: 3, value: "x" },
          ],
        },
      ],
      styles: [
        { fontRgb: "FF949494", fillRgb: "FFFFFFFF", sz: 18 }, // ≈3.0:1 large → pass
        { fontRgb: "FF949494", fillRgb: "FFFFFFFF", sz: 14, bold: true }, // large-bold → pass
        { fontRgb: "FF949494", fillRgb: "FFFFFFFF", sz: 11 }, // normal → fail
      ],
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.failing).toHaveLength(1);
  });

  it("theme-indexed colors and non-solid fills count as unresolved", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B2",
          cells: [
            { ref: "A1", styleIndex: 1, value: "x" },
            { ref: "A2", styleIndex: 2, value: "x" },
          ],
        },
      ],
      styles: [{ fontTheme: true, fillRgb: "FFFFFFFF" }, { fontRgb: "FF000000" }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.checkedRuns).toBe(0);
    expect(a.contrast.unresolvedRuns).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Security/correctness-hardening regression tests (red/blue audit): contrast
// previously evaluated EVERY <xf> in cellXfs unconditionally, so a workbook
// with unused/template styles (openpyxl and PhpSpreadsheet routinely emit
// these) got a false WCAG 1.4.3 failure for a style no visible cell ever
// used — even an entirely empty <sheetData/> could "fail" contrast. See
// fix-2-report.md.
// ---------------------------------------------------------------------------

describe("xlsxService: contrast is only evaluated for styles applied to a non-empty cell (false-positive hardening)", () => {
  it("does NOT flag a low-contrast style that no cell actually uses", async () => {
    const buf = await buildXlsx({
      sheets: [{ name: "S", dimensionRef: "A1:B2" }], // no cells — <sheetData/> stays empty
      styles: [{ fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }], // would fail if evaluated
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.checkedRuns).toBe(0);
    expect(a.contrast.unresolvedRuns).toBe(0);
    expect(a.contrast.failing).toHaveLength(0);
  });

  it('does NOT flag a low-contrast style applied only to an empty cell (bare <c s="N"/>, no value child)', async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B2",
          cells: [{ ref: "A1", styleIndex: 1, empty: true }],
        },
      ],
      styles: [{ fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.checkedRuns).toBe(0);
    expect(a.contrast.failing).toHaveLength(0);
  });

  it("treats inline-string and formula cells as non-empty (applies their style), unlike a bare empty cell", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B3",
          cells: [
            { ref: "A1", styleIndex: 1, kind: "is", value: "Inline text" }, // non-empty → applied
            { ref: "A2", styleIndex: 2, kind: "f", value: "SUM(A1:A1)" }, // non-empty → applied
            { ref: "A3", styleIndex: 3, empty: true }, // empty → NOT applied
          ],
        },
      ],
      styles: [
        { fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }, // fail if evaluated
        { fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }, // fail if evaluated
        { fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }, // fail if evaluated — but unused (empty cell only)
      ],
    });
    const a = await analyzeXlsx(buf);
    // Only styles 1 and 2 (applied to the is/f cells) are evaluated; style 3
    // (applied only to the empty cell) is not.
    expect(a.contrast.checkedRuns).toBe(2);
    expect(a.contrast.failing).toHaveLength(2);
  });

  it("DOES flag a low-contrast style once legitimately applied to a real non-empty cell", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "S",
          dimensionRef: "A1:B2",
          cells: [{ ref: "A1", styleIndex: 1, value: "Total" }],
        },
      ],
      styles: [{ fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }],
    });
    const a = await analyzeXlsx(buf);
    expect(a.contrast.checkedRuns).toBe(1);
    expect(a.contrast.failing).toHaveLength(1);
  });
});

describe("xlsxService: aggregate zip-package limits (C1 DoS hardening)", () => {
  afterEach(() => {
    vi.doUnmock("#config");
    vi.resetModules();
  });

  async function addExtraEntries(buf: Buffer, count: number): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buf);
    for (let i = 0; i < count; i++) {
      zip.file(`extra/f${i}.xml`, "x", { compression: "STORE" });
    }
    return zip.generateAsync({ type: "nodebuffer" });
  }

  async function addOversizedEntry(buf: Buffer, size: number): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buf);
    zip.file("extra/big.xml", "A".repeat(size));
    return zip.generateAsync({ type: "nodebuffer" });
  }

  it("rejects an xlsx package with more entries than OOXML.MAX_ZIP_ENTRIES", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return { ...actual, OOXML: { ...actual.OOXML, MAX_ZIP_ENTRIES: 5 } };
    });
    const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
      await import("../services/xlsxService.js");
    const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
    const base = await build({ sheets: [{ name: "A" }] });
    const buf = await addExtraEntries(base, 10);
    await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
  });

  it("rejects an xlsx package whose summed declared uncompressed sizes exceed OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES, even though no single part exceeds XLSX.MAX_UNCOMPRESSED_BYTES", async () => {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { OOXML: Record<string, unknown> };
      return { ...actual, OOXML: { ...actual.OOXML, MAX_TOTAL_UNCOMPRESSED_BYTES: 2_000 } };
    });
    const { analyzeXlsx: analyze, XlsxParseError: ParseError } =
      await import("../services/xlsxService.js");
    const { buildXlsx: build } = await import("./helpers/minimalXlsx.js");
    const base = await build({ sheets: [{ name: "A" }] });
    const buf = await addOversizedEntry(base, 3_000);
    await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
  });
});

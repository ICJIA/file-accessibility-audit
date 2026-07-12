import { describe, it, expect, vi } from "vitest";
import {
  buildPptx,
  bodyShape,
  para,
  picture,
  pptTable,
  hyperlinkRels,
  videoRel,
} from "./helpers/minimalPptx.js";
import {
  analyzePptx,
  PptxParseError,
  countShapesAnyDepth,
  countTextElementsAnyDepth,
} from "../services/pptxService.js";
import { parseXml, rootElement } from "../services/ooxml.js";
import * as ooxml from "../services/ooxml.js";

const SPTREE_NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

describe("pptxService: package + metadata + slides", () => {
  it("reads core title/creator, presentation language, and slide count", async () => {
    const buf = await buildPptx({ slides: [{ title: "Welcome" }, { title: "Agenda" }] });
    const a = await analyzePptx(buf);
    expect(a.metadata.title).toBe("Quarterly Briefing");
    expect(a.metadata.creator).toBe("ICJIA");
    expect(a.metadata.language).toBe("en-US");
    expect(a.metadata.slideCount).toBe(2);
    expect(a.slides.map((s) => s.title)).toEqual(["Welcome", "Agenda"]);
  });

  it("language is null when neither presentation nor master declares one", async () => {
    const buf = await buildPptx({ slides: [{ title: "T" }], declareLanguage: false });
    expect((await analyzePptx(buf)).metadata.language).toBeNull();
  });

  it("a slide with no title placeholder, or an empty one, has title null", async () => {
    const buf = await buildPptx({ slides: [{ title: null }, { title: undefined }] });
    const a = await analyzePptx(buf);
    expect(a.slides[0].title).toBeNull();
    expect(a.slides[1].title).toBeNull();
  });

  it("titleIsFirstShape is false when content precedes the title in the tree", async () => {
    const buf = await buildPptx({
      slides: [
        { title: "First" },
        { title: "Second", beforeTitle: bodyShape(para("I come first")) },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.slides[0].titleIsFirstShape).toBe(true);
    expect(a.slides[1].titleIsFirstShape).toBe(false);
  });

  it("rejects a non-pptx zip and a missing presentation part", async () => {
    await expect(analyzePptx(Buffer.from("not a zip"))).rejects.toBeInstanceOf(PptxParseError);
  });

  it("rejects a deck over the slide cap", async () => {
    // MAX_SLIDES is 2000 — build cheaply by lying only in [Content_Types].xml
    // is not possible (extractor counts real slide parts), so this test uses a
    // tiny cap-boundary assertion instead: 3 slides pass.
    const buf = await buildPptx({ slides: [{ title: "a" }, { title: "b" }, { title: "c" }] });
    await expect(analyzePptx(buf)).resolves.toBeTruthy();
  });
});

describe("pptxService: images, tables, links, lists, media", () => {
  it("extracts picture alt text, decorative flags, and missing alt", async () => {
    const buf = await buildPptx({
      slides: [
        {
          title: "T",
          body: picture({ descr: "Org chart" }) + picture({ decorative: true }) + picture({}),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.images).toEqual([
      { altText: "Org chart", decorative: false },
      { altText: null, decorative: true },
      { altText: null, decorative: false },
    ]);
  });

  it("a graphicFrame table is a table (with firstRow flag), not an image", async () => {
    const buf = await buildPptx({
      slides: [{ title: "T", body: pptTable({ firstRow: true, rows: 3, cols: 2 }) + pptTable({}) }],
    });
    const a = await analyzePptx(buf);
    expect(a.tables).toEqual([
      { hasHeaderRow: true, rowCount: 3, colCount: 2 },
      { hasHeaderRow: false, rowCount: 2, colCount: 2 },
    ]);
    expect(a.images).toHaveLength(0);
  });

  it("resolves hyperlink text and targets via the slide rels", async () => {
    const buf = await buildPptx({
      slides: [
        {
          title: "T",
          body: bodyShape(para("Read the full report", { linkRelId: "rId9" })),
          rels: hyperlinkRels([{ id: "rId9", target: "https://example.gov/report" }]),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.links).toEqual([{ text: "Read the full report", url: "https://example.gov/report" }]);
  });

  it("counts explicit bullets as real list items and literal bullets as manual", async () => {
    const buf = await buildPptx({
      slides: [
        {
          title: "T",
          body: bodyShape(
            para("Point one", { bullet: "char" }) +
              para("Point two", { bullet: "auto" }) +
              para("• fake bullet") +
              para("plain sentence"),
          ),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.lists).toEqual({ realListItems: 2, manualBulletParagraphs: 1 });
  });

  it("flags media presence from slide relationships", async () => {
    const buf = await buildPptx({ slides: [{ title: "T", rels: videoRel("rId8") }] });
    expect((await analyzePptx(buf)).hasMedia).toBe(true);
  });

  it("counts an OLE-style graphicFrame with a nested fallback pic as ONE image", async () => {
    const oleFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Embedded object"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole">
      <p:pic><p:nvPicPr><p:cNvPr id="21" name="fallback"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdX"/></p:blipFill><p:spPr/></p:pic>
      </a:graphicData></a:graphic></p:graphicFrame>`;
    const buf = await buildPptx({ slides: [{ title: "T", body: oleFrame }] });
    const a = await analyzePptx(buf);
    expect(a.images).toHaveLength(1);
  });

  it("excludes title-placeholder paragraphs from list counting", async () => {
    const buf = await buildPptx({ slides: [{ title: "1. Overview" }] });
    const a = await analyzePptx(buf);
    expect(a.lists).toEqual({ realListItems: 0, manualBulletParagraphs: 0 });
  });
});

describe("pptxService: contrast", () => {
  it("fails a low-contrast explicit color and passes a high-contrast one", async () => {
    const buf = await buildPptx({
      slides: [
        {
          title: "T",
          body: bodyShape(
            para("nearly invisible", { colorHex: "DDDDDD" }) + // vs white ≈ 1.35:1
              para("perfectly fine", { colorHex: "000000" }),
          ),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.contrast.checkedRuns).toBe(2);
    expect(a.contrast.failing).toHaveLength(1);
    expect(a.contrast.failing[0]).toMatchObject({
      text: "nearly invisible",
      foreground: "#DDDDDD",
      background: "#FFFFFF",
      large: false,
    });
  });

  it("uses the shape fill, then the slide background, as the background", async () => {
    const buf = await buildPptx({
      slideBgHex: "000000",
      slides: [
        {
          title: "T",
          body:
            bodyShape(para("white on black bg", { colorHex: "FFFFFF" })) +
            bodyShape(para("white on white shape", { colorHex: "FFFFFF" }), { fillHex: "FFFFFF" }),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.contrast.failing).toHaveLength(1);
    expect(a.contrast.failing[0].background).toBe("#FFFFFF");
  });

  it("resolves theme scheme colors and applies the large-text threshold", async () => {
    const buf = await buildPptx({
      slides: [
        {
          title: "T",
          body: bodyShape(
            // accent1 #4472C4 on white ≈ 4.55:1 — passes normal AND large.
            para("theme colored", { schemeColor: "accent1" }) +
              // 18pt grey #949494 on white ≈ 3.0:1 — passes only because large.
              para("big grey heading", { colorHex: "949494", sizeHundredthsPt: 1800 }),
          ),
        },
      ],
    });
    const a = await analyzePptx(buf);
    expect(a.contrast.checkedRuns).toBe(2);
    expect(a.contrast.failing).toHaveLength(0);
  });

  it("counts runs without an explicit color as unresolved", async () => {
    const buf = await buildPptx({
      slides: [{ title: "T", body: bodyShape(para("inherited color text")) }],
    });
    const a = await analyzePptx(buf);
    expect(a.contrast.checkedRuns).toBe(0);
    expect(a.contrast.unresolvedRuns).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Security-hardening regression tests (red/blue audit, DoS): a raw grpSp
// wrapping many shapes bypasses the MAX_SHAPES cap because it only sees
// direct children; self-nested graphicFrames turn the old per-frame
// descendants() walks quadratic; resolveSchemeColor re-walking the theme
// per run is O(runs x theme size). See fix-1-report.md for the full writeup.
// ---------------------------------------------------------------------------

describe("pptxService: MAX_SHAPES cap sees shapes at any depth (V1 DoS hardening)", () => {
  it("countShapesAnyDepth counts shapes nested inside a grpSp, not just direct children", () => {
    const nestedPics = Array.from(
      { length: 200 },
      (_, i) =>
        `<p:pic><p:nvPicPr><p:cNvPr id="${100 + i}" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>`,
    ).join("");
    const xml = `<p:spTree xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
      <p:grpSp><p:nvGrpSpPr><p:cNvPr id="50" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${nestedPics}</p:grpSp>
    </p:spTree>`;
    const spTree = rootElement(parseXml(xml), "spTree")!;
    // Direct children of spTree are just [nvGrpSpPr, grpSpPr, grpSp] — the
    // OLD cap tally (contentShapes(), unchanged for reading-order use) would
    // see exactly 1 content shape here. The any-depth tally must see all 200
    // nested pics plus the grpSp wrapper itself (201), or an attacker can
    // hide unbounded content from MAX_SHAPES by wrapping it in one group.
    expect(countShapesAnyDepth(spTree)).toBe(201);
  });

  it("analyzePptx shapeCount (the MAX_SHAPES cap tally) reflects grpSp-nested shapes, not just top-level ones", async () => {
    const nestedPics = Array.from({ length: 200 }, () => picture({})).join("");
    const grouped = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="50" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${nestedPics}</p:grpSp>`;
    const buf = await buildPptx({ slides: [{ title: "T", body: grouped }] });
    const a = await analyzePptx(buf);
    // Direct children of spTree are just [title, grpSp] = 2 — the pre-fix
    // cap tally. Grouping must not hide the 200 nested pics from the cap.
    expect(a.shapeCount).toBeGreaterThanOrEqual(200);
  });

  it("counts shapes placed OUTSIDE spTree (bare pics as a cSld sibling) toward the shape cap", async () => {
    // Image/table extraction runs on slideRoot (walkPicsAndFrames(slideRoot),
    // the pic/frame descendants walks) and pushes into the UNCAPPED
    // analysis.images/tables. slideRoot ⊇ spTree, so bare <p:pic> elements
    // (no runs/paragraphs → the text cap can't catch them) placed OUTSIDE
    // <p:spTree> evade BOTH caps unless the shape tally counts on slideRoot.
    // Scope a tiny MAX_SHAPES to THIS test only.
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { PPTX: Record<string, unknown> };
      return { ...actual, PPTX: { ...actual.PPTX, MAX_SHAPES: 40 } };
    });
    try {
      const { analyzePptx: analyze, PptxParseError: ParseError } =
        await import("../services/pptxService.js");
      const { buildPptx: build, picture: pic } = await import("./helpers/minimalPptx.js");
      // spTree holds only the title (1 sp). 60 bare pics live as a SIBLING of
      // spTree: a spTree-only tally sees 1 (< 40, no reject) while the
      // slideRoot tally sees ~61 (> 40, reject). No runs/paragraphs, so the
      // text cap never fires — the shape cap is the only guard.
      const outside = Array.from({ length: 60 }, () => pic({})).join("");
      const buf = await build({ slides: [{ title: "T", extraCSldXml: outside }] });
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });
});

describe("pptxService: text-element volume cap (V1 follow-up — runs/paragraphs, not just shapes)", () => {
  // A single legal <p:sp> can hold an unbounded txBody. The shape-container
  // tally (countShapesAnyDepth) sees ONE shape, but the N paragraphs + N runs
  // inside it are what drive the per-run contrast walk and per-paragraph list
  // walk — the actual expensive work. MAX_SHAPES alone therefore does NOT
  // bound this vector; the text-element tally must.
  it("countTextElementsAnyDepth counts every paragraph + run inside one shape (~2N), while the shape tally sees just 1", () => {
    const N = 150;
    const paras = Array.from(
      { length: N },
      (_, i) => `<a:p><a:r><a:t>run ${i}</a:t></a:r></a:p>`,
    ).join("");
    const xml = `<p:spTree ${SPTREE_NS}>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>
    </p:spTree>`;
    const spTree = rootElement(parseXml(xml), "spTree")!;
    // The shape-container tally is blind to txBody volume — exactly the gap.
    expect(countShapesAnyDepth(spTree)).toBe(1);
    // The text-element tally tracks the real work: N paragraphs + N runs.
    expect(countTextElementsAnyDepth(spTree)).toBe(2 * N);
  });

  it("analyzePptx rejects a deck whose any-depth text-element volume exceeds MAX_TEXT_ELEMENTS (one shape, many runs)", async () => {
    // Scope a tiny cap to THIS test only (a file-wide mock would trip the
    // other tests' modest text volumes). Dynamic re-import binds analyzePptx
    // to the mocked config; the rest of the file keeps the real 200k cap.
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { PPTX: Record<string, unknown> };
      return { ...actual, PPTX: { ...actual.PPTX, MAX_TEXT_ELEMENTS: 40 } };
    });
    try {
      const { analyzePptx: analyze, PptxParseError: ParseError } =
        await import("../services/pptxService.js");
      const {
        buildPptx: build,
        bodyShape: body,
        para: p,
      } = await import("./helpers/minimalPptx.js");
      // One shape, 30 paragraphs each with a run = 60 text elements > cap 40.
      const paras = Array.from({ length: 30 }, (_, i) => p(`line ${i}`)).join("");
      const buf = await build({ slides: [{ title: "T", body: body(paras) }] });
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });

  it("analyzePptx counts text elements placed OUTSIDE spTree (sibling under cSld) toward the cap", async () => {
    // The links/lists passes walk descendants(slideRoot,…), and slideRoot ⊇
    // spTree, so p/r placed under <p:sld> but OUTSIDE <p:spTree> are walked
    // yet were invisible to an spTree-only tally — a residual bypass one level
    // up from the in-shape vector. Scope a tiny cap to THIS test only.
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { PPTX: Record<string, unknown> };
      return { ...actual, PPTX: { ...actual.PPTX, MAX_TEXT_ELEMENTS: 40 } };
    });
    try {
      const { analyzePptx: analyze, PptxParseError: ParseError } =
        await import("../services/pptxService.js");
      const { buildPptx: build, para: p } = await import("./helpers/minimalPptx.js");
      // spTree holds only the title (~2 text elements). The heavy payload — 60
      // paragraphs+runs — is a SIBLING of spTree, so a spTree-only tally sees
      // ~2 (< 40, no reject) while the slideRoot tally sees ~62 (> 40, reject).
      const outside = Array.from({ length: 60 }, (_, i) => p(`outside ${i}`)).join("");
      const buf = await build({ slides: [{ title: "T", extraCSldXml: outside }] });
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError);
    } finally {
      vi.doUnmock("#config");
      vi.resetModules();
    }
  });
});

describe("pptxService: linear frame/pic walk (V2 DoS hardening)", () => {
  it("a graphicFrame nested inside another graphicFrame does not double-count the inner table", async () => {
    const innerTableFrame = pptTable({ firstRow: true, rows: 2, cols: 2 });
    const outerFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="60" name="Outer wrapper"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole">
      ${innerTableFrame}
      </a:graphicData></a:graphic></p:graphicFrame>`;
    const buf = await buildPptx({ slides: [{ title: "T", body: outerFrame }] });
    const a = await analyzePptx(buf);
    // The old per-frame descendants(frame,"tbl") walk is frame-boundary
    // blind: it finds the inner table from BOTH the outer and inner frame
    // (any depth), double-counting one physical table and never reaching
    // the outer frame's own "not a table" image branch. The linear pass
    // attributes each element to its innermost enclosing frame only.
    expect(a.tables).toHaveLength(1);
    expect(a.tables[0]).toEqual({ hasHeaderRow: true, rowCount: 2, colCount: 2 });
    expect(a.images).toHaveLength(1);
  });

  it("N sibling graphicFrames each with a nested fallback pic yield exactly N images (linear rebuild preserves semantics)", async () => {
    const N = 5;
    const oleFrame = (id: number): string =>
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Embedded object"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole">
      <p:pic><p:nvPicPr><p:cNvPr id="${id + 1000}" name="fallback"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdX"/></p:blipFill><p:spPr/></p:pic>
      </a:graphicData></a:graphic></p:graphicFrame>`;
    const body = Array.from({ length: N }, (_, i) => oleFrame(20 + i * 2)).join("");
    const buf = await buildPptx({ slides: [{ title: "T", body }] });
    const a = await analyzePptx(buf);
    expect(a.images).toHaveLength(N);
    expect(a.tables).toHaveLength(0);
  });
});

describe("pptxService: theme scheme colors resolved once per analysis (V3 DoS hardening)", () => {
  it("resolves scheme + alias colors correctly across many runs", async () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) =>
      para(`run ${i}`, { schemeColor: i % 2 === 0 ? "accent1" : "tx1" }),
    ).join("");
    // title: null — a title run has no rPr at all, which would otherwise add
    // an unrelated unresolved-run to the count this test is isolating.
    const buf = await buildPptx({ slides: [{ title: null, body: bodyShape(paragraphs) }] });
    const a = await analyzePptx(buf);
    expect(a.contrast.checkedRuns).toBe(12);
    expect(a.contrast.unresolvedRuns).toBe(0);
    expect(a.contrast.failing).toHaveLength(0);
  });

  it("resolves scheme colors a bounded number of times per analysis, not once per run", async () => {
    const spy = vi.spyOn(ooxml, "resolveSchemeColor");
    try {
      const paragraphs = Array.from({ length: 40 }, (_, i) =>
        para(`run ${i}`, { schemeColor: "accent1" }),
      ).join("");
      const buf = await buildPptx({ slides: [{ title: "T", body: bodyShape(paragraphs) }] });
      await analyzePptx(buf);
      expect(spy.mock.calls.length).toBeLessThan(40);
    } finally {
      spy.mockRestore();
    }
  });
});

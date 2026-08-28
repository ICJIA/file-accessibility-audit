/**
 * PDF link TEXT comes from the <Link> tag, not from geometry.
 *
 * Before this, every link's text was whatever text items had their ORIGIN
 * inside the annotation's /Rect (±5pt) — whole items included. A link on
 * "here" followed by ". FOID statistics are available" in the same text run
 * was scored as descriptive, and a line-wrapped link produced the fragment
 * "PA" flagged as too short (FFY24 SCIP Plan, 2026-08-20). The struct tree
 * knows exactly which marked-content runs belong to each <Link> — the same
 * "p{pageObjId}_mc{mcid}" id mapping the heading outline already uses — so
 * tagged links read their text from there. Geometry is kept only as the
 * fallback for annotations no tag claims, and those are reported as
 * untagged, which is their real defect.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeWithPdfjs,
  buildMarkedContentTextMap,
  collectStructTreeLinks,
  collectTextBearingFigures,
} from "../services/pdfjsService.js";
import { buildPdf } from "./helpers/minimalPdf.js";

describe("buildMarkedContentTextMap — line breaks", () => {
  it("separates text that pdf.js splits at a line end (hasEOL) with a space", () => {
    // A link wrapped across two lines inside one marked-content run: pdf.js
    // emits "State Police Revocation" with hasEOL and then "Enforcement Fund"
    // — joined raw, that reads "RevocationEnforcement".
    const items = [
      { type: "beginMarkedContentProps", id: "p3R_mc7", tag: "Link" },
      { str: "State Police Revocation", hasEOL: true },
      { str: "Enforcement Fund", hasEOL: false },
      { type: "endMarkedContent" },
    ];
    expect(buildMarkedContentTextMap(items).get("p3R_mc7")).toBe(
      "State Police Revocation Enforcement Fund",
    );
  });

  it("honours a line end pdf.js reports as a separate empty item", () => {
    // pdf.js's appendEOL() emits {str: "", hasEOL: true} when the break falls
    // between chunks — the real shape behind "RevocationEnforcement" in the
    // FFY24 SCIP Plan (p27).
    const items = [
      { type: "beginMarkedContentProps", id: "p3R_mc7", tag: "Link" },
      { str: "State Police Revocation", hasEOL: false },
      { str: "", hasEOL: true },
      { str: "Enforcement Fund", hasEOL: false },
      { type: "endMarkedContent" },
    ];
    expect(buildMarkedContentTextMap(items).get("p3R_mc7")).toBe(
      "State Police Revocation Enforcement Fund",
    );
  });
});

const textById = new Map([
  ["p3R_mc0", "Read the "],
  ["p3R_mc1", "annual report"],
  ["p3R_mc2", " today."],
  ["p3R_mc3", "Lifecycle chart"],
  ["p3R_mc4", "FROs Issued (Entered into LEADS)"],
]);

describe("collectStructTreeLinks", () => {
  it("pairs a Link node's content text with the annotation it references", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "P",
          children: [
            { type: "content", id: "p3R_mc0" },
            {
              role: "Link",
              children: [
                { type: "content", id: "p3R_mc1" },
                { type: "object", id: "12R" },
              ],
            },
            { type: "content", id: "p3R_mc2" },
          ],
        },
      ],
    };
    expect(collectStructTreeLinks(tree, textById)).toEqual([
      { text: "annual report", annotationIds: ["12R"] },
    ]);
  });

  it("normalizes pdf.js's prefixed annotation ids to the bare object ref", () => {
    // pdf.js emits {type:"annotation", id:"pdfjs_internal_id_<ref>"} when the
    // Link's only kid is the OBJR, and {type:"object", id:"<ref>"} otherwise.
    const tree = {
      role: "Root",
      children: [
        {
          role: "Link",
          children: [
            { type: "content", id: "p3R_mc1" },
            { type: "annotation", id: "pdfjs_internal_id_12R" },
            { type: "object", id: "13R" },
          ],
        },
      ],
    };
    expect(collectStructTreeLinks(tree, textById)[0].annotationIds).toEqual(["12R", "13R"]);
  });

  it("joins nested Span content and collapses whitespace", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "Link",
          children: [
            { type: "content", id: "p3R_mc0" },
            { role: "Span", children: [{ type: "content", id: "p3R_mc1" }] },
            { type: "object", id: "12R" },
          ],
        },
      ],
    };
    expect(collectStructTreeLinks(tree, textById)[0].text).toBe("Read the annual report");
  });

  it("falls back to the node's /Alt when it has no content text", () => {
    const tree = {
      role: "Root",
      children: [{ role: "Link", alt: "Company logo", children: [{ type: "object", id: "12R" }] }],
    };
    expect(collectStructTreeLinks(tree, textById)).toEqual([
      { text: "Company logo", annotationIds: ["12R"] },
    ]);
  });

  it("reports a Link with no annotation kid with an empty id list, and ignores other roles", () => {
    const tree = {
      role: "Root",
      children: [
        { role: "Link", children: [{ type: "content", id: "p3R_mc1" }] },
        { role: "Figure", children: [{ type: "object", id: "14R" }] },
      ],
    };
    expect(collectStructTreeLinks(tree, textById)).toEqual([
      { text: "annual report", annotationIds: [] },
    ]);
  });
});

describe("collectTextBearingFigures", () => {
  it("reports a Figure whose descendants carry text, with page, alt status, length and preview", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "Figure",
          children: [
            { type: "object", id: "20R" },
            {
              role: "Sect",
              children: [{ role: "P", children: [{ type: "content", id: "p3R_mc4" }] }],
            },
          ],
        },
      ],
    };
    expect(collectTextBearingFigures(tree, textById, 5)).toEqual([
      {
        page: 5,
        hasAlt: false,
        textLength: "FROs Issued (Entered into LEADS)".length,
        preview: "FROs Issued (Entered into LEADS)",
      },
    ]);
  });

  it("skips figures with no text and keeps the alt flag for those that have one", () => {
    const tree = {
      role: "Root",
      children: [
        { role: "Figure", children: [{ type: "object", id: "20R" }] },
        {
          role: "Figure",
          alt: "Bar chart",
          children: [{ type: "content", id: "p3R_mc3" }],
        },
      ],
    };
    const out = collectTextBearingFigures(tree, textById, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ page: 1, hasAlt: true, preview: "Lifecycle chart" });
  });

  it("truncates long previews to 80 characters with an ellipsis", () => {
    const long = "x".repeat(200);
    const tree = {
      role: "Root",
      children: [{ role: "Figure", children: [{ type: "content", id: "p9R_mc0" }] }],
    };
    const out = collectTextBearingFigures(tree, new Map([["p9R_mc0", long]]), 2);
    expect(out[0].textLength).toBe(200);
    expect(out[0].preview).toHaveLength(80);
    expect(out[0].preview.endsWith("…")).toBe(true);
  });
});

describe("analyzeWithPdfjs — link text and tagging census", () => {
  // One page, three marked-content runs on one line. The tagged link covers
  // only "annual report" (MCID 1) but its /Rect also contains the ORIGIN of
  // the following run " today. Visit www.example.org" — the exact geometry
  // that used to bleed into the link text. A second link annotation has no
  // <Link> tag at all.
  const content = [
    "/P << /MCID 0 >> BDC BT /F1 12 Tf 72 700 Td (Read the ) Tj ET EMC",
    "/Link << /MCID 1 >> BDC BT /F1 12 Tf 120 700 Td (annual report) Tj ET EMC",
    "/P << /MCID 2 >> BDC BT /F1 12 Tf 196 700 Td ( today. Visit www.example.org) Tj ET EMC",
    "/P << /MCID 3 >> BDC BT /F1 12 Tf 72 600 Td (Click here for the untagged one) Tj ET EMC",
    "",
  ].join("\n");
  const pdf = buildPdf([
    "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 11 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [12 0 R 13 0 R] >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 10 0 R >>",
    "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R 14 0 R] >>",
    "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
    "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 12 0 R /Pg 3 0 R >>] >>",
    "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
    "<< /Nums [0 [7 0 R 8 0 R 9 0 R 14 0 R] 1 8 0 R] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Annot /Subtype /Link /Rect [118 690 200 712] /Border [0 0 0] /A << /S /URI /URI (https://example.org/annual-report) >> /StructParent 1 >>",
    "<< /Type /Annot /Subtype /Link /Rect [70 590 260 612] /Border [0 0 0] /A << /S /URI /URI (https://example.org/untagged) >> >>",
    "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
  ]);

  it("reads a tagged link's text from its <Link> tag, not from the text under its rectangle", async () => {
    const r = await analyzeWithPdfjs(pdf);
    expect(r.error).toBeNull();
    const tagged = r.links.find((l) => l.url === "https://example.org/annual-report");
    expect(tagged).toBeDefined();
    expect(tagged!.text).toBe("annual report");
    expect(tagged!.tagged).toBe(true);
    expect(tagged!.page).toBe(1);
  }, 30_000);

  it("keeps geometry for an annotation no tag claims and marks it untagged", async () => {
    const r = await analyzeWithPdfjs(pdf);
    const untagged = r.links.find((l) => l.url === "https://example.org/untagged");
    expect(untagged).toBeDefined();
    expect(untagged!.tagged).toBe(false);
    expect(untagged!.text).toContain("Click here");
    expect(r.linkAnnotationCount).toBe(2);
    expect(r.untaggedLinkAnnotationCount).toBe(1);
  }, 30_000);

  it("emits exactly one entry per link (not one per annotation or per text run)", async () => {
    const r = await analyzeWithPdfjs(pdf);
    expect(r.links).toHaveLength(2);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// The attribution guard, extended past headings (v1.116.0).
//
// v1.110.0 established that some pages defeat marked-content attribution
// entirely — pdf.js emits every boundary as an immediately-closed empty pair
// and delivers the text separately — and taught the HEADING census to treat
// those pages as unreadable rather than as evidence. The figure-text census
// and tagged-link text read the same map and were left on the raw data: a
// mis-attributed page could call a plain photo a "figure containing text"
// (with a garbled preview driving retag-don't-describe advice), or hand a
// tagged link a fragment of somebody else's sentence. On an unreliable page
// the census now stays silent and link text falls back to the geometry path,
// exactly as it did before the census existed.
// ---------------------------------------------------------------------------

describe("attribution reliability — figures", () => {
  const tree = {
    role: "Root",
    children: [{ role: "Figure", children: [{ type: "content", id: "p3R_mc0" }] }],
  };
  const byId = new Map([["p3R_mc0", "Detox Under 1% Toxicology or assessment 31%"]]);

  it("collects text-bearing figures from a page whose attribution held", () => {
    expect(collectTextBearingFigures(tree, byId, 34, true)).toHaveLength(1);
  });

  it("stays silent on a page whose text could not be attributed", () => {
    // The map may hold text, but on such a page it can belong to anything —
    // asserting "this figure contains text" on it would be a false positive.
    expect(collectTextBearingFigures(tree, byId, 34, false)).toEqual([]);
  });
});

describe("attribution reliability — link text", () => {
  const tree = {
    role: "Root",
    children: [
      {
        role: "Link",
        children: [
          { type: "content", id: "p3R_mc0" },
          { type: "object", id: "9R" },
        ],
      },
    ],
  };
  const byId = new Map([["p3R_mc0", "PA"]]);

  it("keeps struct-tree text on a reliable page", () => {
    const links = collectStructTreeLinks(tree, byId, { textReliable: true });
    expect(links[0]!.text).toBe("PA");
  });

  it("blanks the struct text on an unreliable page so geometry takes over, keeping the annotation claim", () => {
    const links = collectStructTreeLinks(tree, byId, { textReliable: false });
    expect(links[0]!.text).toBe("");
    // The claim ("this annotation belongs to a tag") comes from the structure
    // tree, not the text map — it stays, so the link is never misreported as
    // untagged.
    expect(links[0]!.annotationIds).toEqual(["9R"]);
  });

  it("still falls back to the author-given /Alt on an unreliable page", () => {
    // /Alt lives on the Link ELEMENT — struct-tree data, not marked-content
    // attribution — so unreliability must not discard it.
    const altTree = {
      role: "Root",
      children: [
        { role: "Link", alt: "Annual report portal", children: [{ type: "object", id: "9R" }] },
      ],
    };
    const links = collectStructTreeLinks(altTree, byId, { textReliable: false });
    expect(links[0]!.text).toBe("Annual report portal");
  });
});

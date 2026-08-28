/**
 * PDF heading-TEXT extraction (the "Heading Outline" signal).
 *
 * qpdf's struct-tree walk yields heading LEVELS only ({level, tag}) — the
 * actual heading text lives in marked-content runs. pdf.js can resolve it:
 * page.getStructTree() content leaves and getTextContent({
 * includeMarkedContent: true }) marked-content items share the same
 * "p{pageObjId}_mc{mcid}" id format (verified against pdfjs-dist 4.10.38),
 * so mapping id → text and walking the tree for H/H1–H6 roles gives each
 * heading its text.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  analyzeWithPdfjs,
  buildMarkedContentTextMap,
  collectStructTreeHeadings,
  markedContentAttributionReliable,
} from "../services/pdfjsService.js";
import { buildPdf } from "./helpers/minimalPdf.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("buildMarkedContentTextMap", () => {
  it("attributes text to the innermost marked-content id", () => {
    const items = [
      { type: "beginMarkedContentProps", id: "p3R_mc0", tag: "H1" },
      { str: "Hello " },
      { type: "beginMarkedContentProps", id: "p3R_mc1", tag: "Span" },
      { str: "nested" },
      { type: "endMarkedContent" },
      { str: " world" },
      { type: "endMarkedContent" },
    ];
    const map = buildMarkedContentTextMap(items);
    expect(map.get("p3R_mc0")).toBe("Hello  world");
    expect(map.get("p3R_mc1")).toBe("nested");
  });

  it("attributes text inside an id-less BMC run to the nearest enclosing id", () => {
    const items = [
      { type: "beginMarkedContentProps", id: "p3R_mc0", tag: "H1" },
      { type: "beginMarkedContent", tag: "ReversedChars" },
      { str: "inside" },
      { type: "endMarkedContent" },
      { type: "endMarkedContent" },
    ];
    const map = buildMarkedContentTextMap(items);
    expect(map.get("p3R_mc0")).toBe("inside");
  });

  it("ignores text outside any marked content and tolerates unbalanced ends", () => {
    const items = [
      { type: "endMarkedContent" },
      { str: "stray" },
      { type: "beginMarkedContentProps", id: "p3R_mc2", tag: "P" },
      { str: "kept" },
      { type: "endMarkedContent" },
    ];
    const map = buildMarkedContentTextMap(items);
    expect([...map.keys()]).toEqual(["p3R_mc2"]);
    expect(map.get("p3R_mc2")).toBe("kept");
  });
});

describe("collectStructTreeHeadings", () => {
  const textById = new Map([
    ["p3R_mc0", "Annual Report"],
    ["p3R_mc1", "Introduction"],
  ]);

  it("collects H1–H6 nodes with their resolved text, in tree order", () => {
    const tree = {
      role: "Root",
      children: [
        { role: "H1", children: [{ type: "content", id: "p3R_mc0" }] },
        {
          role: "Sect",
          children: [{ role: "H2", children: [{ type: "content", id: "p3R_mc1" }] }],
        },
      ],
    };
    expect(collectStructTreeHeadings(tree, textById).entries).toEqual([
      { level: "H1", text: "Annual Report" },
      { level: "H2", text: "Introduction" },
    ]);
  });

  it("prefers the node's Alt/ActualText over resolved content text", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "H1",
          alt: "Spelled Out Heading",
          children: [{ type: "content", id: "p3R_mc0" }],
        },
      ],
    };
    expect(collectStructTreeHeadings(tree, textById).entries).toEqual([
      { level: "H1", text: "Spelled Out Heading" },
    ]);
  });

  it("joins nested span content and collapses whitespace", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "H2",
          children: [
            { type: "content", id: "p3R_mc0" },
            { role: "Span", children: [{ type: "content", id: "p3R_mc1" }] },
          ],
        },
      ],
    };
    expect(collectStructTreeHeadings(tree, textById).entries).toEqual([
      { level: "H2", text: "Annual Report Introduction" },
    ]);
  });

  it("keeps generic /H headings and skips headings with no resolvable text", () => {
    const tree = {
      role: "Root",
      children: [
        { role: "H", children: [{ type: "content", id: "p3R_mc0" }] },
        { role: "H3", children: [{ type: "content", id: "p9R_mc99" }] },
      ],
    };
    expect(collectStructTreeHeadings(tree, textById).entries).toEqual([
      { level: "H", text: "Annual Report" },
    ]);
  });

  // The outline still drops them — a list of blank lines helps nobody — but
  // "this document has 19 heading tags containing no text" is a finding in its
  // own right, and it was invisible while the walker simply skipped them.
  it("counts the headings it had to skip, rather than losing them silently", () => {
    const tree = {
      role: "Root",
      children: [
        { role: "H1", children: [{ type: "content", id: "p3R_mc0" }] },
        { role: "H2", children: [{ type: "content", id: "p9R_mc98" }] },
        { role: "H2", children: [] },
        { role: "H3", children: [{ type: "content", id: "p9R_mc99" }] },
      ],
    };
    const { entries, withoutText } = collectStructTreeHeadings(tree, textById);
    expect(entries).toEqual([{ level: "H1", text: "Annual Report" }]);
    expect(withoutText).toBe(3);
  });
});

describe("analyzeWithPdfjs — headingOutline", () => {
  it("extracts level and text from a hand-built tagged PDF", async () => {
    const content = "/H1 << /MCID 0 >> BDC\nBT /F1 24 Tf 72 700 Td (Hello Heading) Tj ET\nEMC\n";
    const pdf = buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
      "<< /Type /StructElem /S /H1 /P 5 0 R /Pg 3 0 R /K 0 >>",
      "<< /Nums [0 [6 0 R]] >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]);
    const r = await analyzeWithPdfjs(pdf);
    expect(r.error).toBeNull();
    expect(r.headingOutline).toEqual([{ level: "H1", text: "Hello Heading" }]);
  }, 30_000);

  it("extracts a non-empty outline from the fully tagged fixture", async () => {
    const r = await analyzeWithPdfjs(readFileSync(join(FIXTURES, "accessible.pdf")));
    expect(r.headingOutline!.length).toBeGreaterThan(0);
    for (const h of r.headingOutline!) {
      expect(h.level).toMatch(/^H[1-6]?$/);
      expect(h.text.trim().length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("returns an empty outline for an untagged PDF", async () => {
    const r = await analyzeWithPdfjs(readFileSync(join(FIXTURES, "inaccessible.pdf")));
    expect(r.headingOutline).toEqual([]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Whether a page's text can be attributed to its tags AT ALL (v1.110.0).
//
// On some pages pdf.js emits every marked-content boundary as an immediately
// closed empty pair and delivers the text separately, so nothing can be
// matched to a tag. controls/DVFR_Biennial_Report_2024 page 2 does exactly
// that: 168 text items, 17 marked-content ids, and text for ONE of them —
// which made five perfectly ordinary <H1> tags look empty and dropped a
// conformance-clean document from 100/A to 79/C. "We could not attribute this
// page" must never be reported as "these headings are empty".
// ---------------------------------------------------------------------------
describe("markedContentAttributionReliable", () => {
  it("rejects a page whose text could not be attached to its tags", () => {
    expect(markedContentAttributionReliable({ textItems: 168, idsSeen: 17, idsWithText: 1 })).toBe(
      false,
    );
  });

  it("accepts a page where most tags did receive their text", () => {
    expect(markedContentAttributionReliable({ textItems: 93, idsSeen: 33, idsWithText: 26 })).toBe(
      true,
    );
  });

  it("accepts a page with little text, where the ratio means nothing", () => {
    // A cover page or a divider: too small to judge, and nothing to gain by
    // second-guessing it.
    expect(markedContentAttributionReliable({ textItems: 8, idsSeen: 24, idsWithText: 7 })).toBe(
      true,
    );
  });

  it("accepts a page with no marked content at all", () => {
    expect(markedContentAttributionReliable({ textItems: 0, idsSeen: 0, idsWithText: 0 })).toBe(
      true,
    );
  });
});

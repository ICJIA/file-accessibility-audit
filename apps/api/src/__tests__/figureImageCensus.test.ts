/**
 * ONE FIGURE, SEVERAL IMAGES (2026-10-26). A real Word-for-Microsoft-365 PDF
 * drew its logo as two images — the picture and its soft drop shadow — inside
 * the ONE marked-content run its described <Figure> owns. The census counted
 * images painted (3 in that document) minus <Figure> tags (2) and reported the
 * difference as "not tagged as <Figure> at all": a phantom that took alt-text
 * coverage from 1 of 2 (Moderate) to 1 of 3 (Critical) and the grade from C to
 * D. Even a fully repaired copy could not rise above C.
 *
 * The census now asks of EACH image whether any run it is painted in is
 * reachable from the live tag tree — exactly what the finding claims. These
 * hand-built documents pin both directions: images inside a figure (or its
 * child, or a formula) are never "untagged", however many the figure paints,
 * and an image no tag reaches is always counted — even beside figures that
 * paint only vector art, which the old subtraction let hide it. An image
 * tagged inside a text element is in the reading order and left alone.
 *
 * Full pipeline (qpdf + pdf.js + scorer), so qpdf must be installed.
 */
import { describe, it, expect } from "vitest";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import type { AnalysisResult } from "../services/pdfAnalyzer.js";
import { buildPdf } from "./helpers/minimalPdf.js";

const TEXT =
  "Quarter four course offerings. Full day classes start at nine in the morning, and half day classes start at half past eight.";

// 64x64 so every image is far above the analyzer's tiny-image skip.
const IMG = (fill: string) =>
  `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4096 >>\nstream\n${fill.repeat(4096)}\nendstream`;

// Paint operators. The shadow sits 2pt down and right of the picture, the way
// an exporter lays a drop shadow under a logo.
const SHADOW = "q 120 0 0 60 74 598 cm /Shadow Do Q\n";
const LOGO = "q 120 0 0 60 72 600 cm /Logo Do Q\n";
const STRAY = "q 60 0 0 60 320 600 cm /Stray Do Q\n";
const BOX = (x: number) => `0 0 1 rg ${x} 500 40 40 re f\n`;

/**
 * A one-page tagged document. Objects 1–12 are fixed; `elements` are struct
 * elements numbered from 13, `kids` are the ones the Document element holds,
 * and `owners[i]` is the element that owns MCID i+1 (MCID 0 is the paragraph).
 */
function tagged(opts: {
  content: string;
  elements: string[];
  kids: number[];
  owners: number[];
}): Buffer {
  const body = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${TEXT}) Tj ET\nEMC\n${opts.content}`;
  const ref = (n: number) => `${n} 0 R`;
  return buildPdf(
    [
      "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> /XObject << /Logo 10 0 R /Shadow 11 0 R /Stray 12 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
      `<< /Length ${body.length} >>\nstream\n${body}endstream`,
      "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
      `<< /Type /StructElem /S /Document /P 5 0 R /K [8 0 R ${opts.kids.map(ref).join(" ")}] >>`,
      `<< /Nums [0 [8 0 R ${opts.owners.map(ref).join(" ")}]] >>`,
      "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      IMG("x"),
      IMG("y"),
      IMG("z"),
      ...opts.elements,
    ],
    "<< /Title (Course Offerings) >>",
  );
}

const DESCRIBED_FIGURE = (mcid: number) =>
  `<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K ${mcid} /Alt (Agency logo) >>`;

async function altText(pdf: Buffer) {
  const result: AnalysisResult = await analyzePDF(pdf, "census.pdf");
  const cat = result.categories.find((c) => c.id === "alt_text");
  if (!cat) throw new Error("alt_text category missing");
  return { score: cat.score, findings: cat.findings.join("\n") };
}

describe("alt-text census — images are judged by the run they are painted in", () => {
  it("counts a described figure that paints a picture and its shadow as ONE described image", async () => {
    const r = await altText(
      tagged({
        content: `/Figure << /MCID 1 >> BDC\n${SHADOW}${LOGO}EMC\n`,
        elements: [DESCRIBED_FIGURE(1)],
        kids: [13],
        owners: [13],
      }),
    );
    expect(r.score).toBe(100);
    expect(r.findings).toContain("All 1 tagged image(s) have alternative text");
    expect(r.findings).not.toMatch(/further content image/);
  }, 30_000);

  it("still counts an image painted outside every tag beside that figure", async () => {
    const r = await altText(
      tagged({
        content: `/Figure << /MCID 1 >> BDC\n${SHADOW}${LOGO}EMC\n${STRAY}`,
        elements: [DESCRIBED_FIGURE(1)],
        kids: [13],
        owners: [13],
      }),
    );
    // 1 described figure + 1 untagged image = 1 of 2.
    expect(r.score).toBe(50);
    expect(r.findings).toMatch(/^1 further content image\(s\) are painted/m);
  }, 30_000);

  it("counts an image inside a marked-content run the tag tree never reaches", async () => {
    const r = await altText(
      tagged({
        // MCID 7 is claimed in the content stream and owned by nothing.
        content: `/Figure << /MCID 1 >> BDC\n${LOGO}EMC\n/Figure << /MCID 7 >> BDC\n${STRAY}EMC\n`,
        elements: [DESCRIBED_FIGURE(1)],
        kids: [13],
        owners: [13],
      }),
    );
    expect(r.score).toBe(50);
    expect(r.findings).toMatch(/^1 further content image\(s\) are painted/m);
  }, 30_000);

  it("covers images whose run belongs to a CHILD of the described figure", async () => {
    const r = await altText(
      tagged({
        content: `/Span << /MCID 1 >> BDC\n${SHADOW}${LOGO}EMC\n`,
        elements: [
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K [14 0 R] /Alt (Agency logo) >>",
          "<< /Type /StructElem /S /Span /P 13 0 R /Pg 3 0 R /K 1 >>",
        ],
        kids: [13],
        owners: [14],
      }),
    );
    expect(r.score).toBe(100);
    expect(r.findings).not.toMatch(/further content image/);
  }, 30_000);

  it("does not count the image inside a described <Formula> a second time", async () => {
    const r = await altText(
      tagged({
        content: `/Formula << /MCID 1 >> BDC\n${LOGO}EMC\n`,
        elements: [
          "<< /Type /StructElem /S /Formula /P 6 0 R /Pg 3 0 R /K 1 /Alt (x squared plus one) >>",
        ],
        kids: [13],
        owners: [13],
      }),
    );
    expect(r.score).toBe(100);
    expect(r.findings).not.toMatch(/further content image/);
  }, 30_000);

  it("leaves an image tagged inside a text element to the tags — it is in the reading order", async () => {
    const r = await altText(
      tagged({
        content: `/Figure << /MCID 1 >> BDC\n${LOGO}EMC\n/P << /MCID 2 >> BDC\n${STRAY}EMC\n`,
        elements: [DESCRIBED_FIGURE(1), "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>"],
        kids: [13, 14],
        owners: [13, 14],
      }),
    );
    // The census counts only images MISSING from the tag tree (the rule the
    // finding states). Judging images tagged as text is a separate decision.
    expect(r.score).toBe(100);
    expect(r.findings).not.toMatch(/further content image/);
  }, 30_000);

  it("no longer lets vector-only figures hide an untagged image", async () => {
    const r = await altText(
      tagged({
        content: `/Figure << /MCID 1 >> BDC\n${BOX(72)}EMC\n/Figure << /MCID 2 >> BDC\n${BOX(140)}EMC\n${STRAY}`,
        elements: [DESCRIBED_FIGURE(1), DESCRIBED_FIGURE(2)],
        kids: [13, 14],
        owners: [13, 14],
      }),
    );
    // 2 described figures + 1 untagged image = 2 of 3, floored.
    expect(r.score).toBe(66);
    expect(r.findings).toMatch(/^1 further content image\(s\) are painted/m);
  }, 30_000);
});

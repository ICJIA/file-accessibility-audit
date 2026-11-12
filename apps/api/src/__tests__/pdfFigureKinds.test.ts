/**
 * "8 images have no alt text" is not one problem (2026-11-12).
 *
 * A one-page flyer exported from PowerPoint listed eight figures as
 * "<Figure> tag — no /Alt attribute". Two were pictures with no description
 * at all (a QR code and a logo). Six were background boxes whose /Alt was
 * PRESENT and blank — what PowerPoint writes for a shape nobody described —
 * and whose fix is "mark it decorative", not "describe it". The report said
 * the same untrue thing about all eight and gave one remedy.
 *
 * Wording only: the count, the score and the verdict are unchanged.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { taggedBaseline } from "./helpers/mockResults.js";

function flyer() {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.images = [
    { ref: "10 0 R", hasAlt: false, altEmpty: true }, // background box
    { ref: "11 0 R", hasAlt: false, altEmpty: true }, // footer band
    { ref: "12 0 R", hasAlt: true, altText: "Close-up of documents and charts" },
    { ref: "13 0 R", hasAlt: false }, // QR code
  ];
  qpdf.figureContentByRef = {
    "10 0 R": [{ page: 1, mcid: 0 }],
    "11 0 R": [{ page: 1, mcid: 1 }],
    "12 0 R": [{ page: 1, mcid: 2 }],
    "13 0 R": [{ page: 1, mcid: 3 }],
  };
  pdfjs.imageCount = 2;
  pdfjs.nonArtifactImageCount = 2;
  pdfjs.nonArtifactImageRuns = [
    { page: 1, mcids: [2] },
    { page: 1, mcids: [3] },
  ];
  qpdf.structTreeMcidsByPage = { 1: [0, 1, 2, 3] };
  return { qpdf, pdfjs };
}

const alt = (r: ReturnType<typeof scoreDocument>) => {
  const c = r.categories.find((x) => x.id === "alt_text");
  if (!c) throw new Error("alt_text missing");
  return { c, text: c.findings.join("\n") };
};

describe("alt_text findings tell pictures from drawn shapes, and empty from absent", () => {
  it("says an empty /Alt is empty, and that the figure is a drawn shape", () => {
    const { qpdf, pdfjs } = flyer();
    const { text } = alt(scoreDocument(qpdf, pdfjs));
    expect(text).toContain(
      "Image 1: <Figure> tag — its /Alt is empty (a drawn shape, not a picture)",
    );
    expect(text).toContain(
      "Image 2: <Figure> tag — its /Alt is empty (a drawn shape, not a picture)",
    );
    expect(text).toContain("Image 4: <Figure> tag — no /Alt attribute (a picture)");
  });

  it("gives drawn shapes their own fix: mark decorative, in the source program or as an artifact", () => {
    const { qpdf, pdfjs } = flyer();
    const { text } = alt(scoreDocument(qpdf, pdfjs));
    expect(text).toMatch(/2 of the image\(s\) above are drawn shapes/);
    expect(text).toMatch(/Mark as decorative/);
    expect(text).toMatch(/Background\/Artifact/);
  });

  it("moves no score and no verdict", () => {
    const a = flyer();
    const withEvidence = scoreDocument(a.qpdf, a.pdfjs);
    const b = flyer();
    delete b.qpdf.figureContentByRef;
    for (const img of b.qpdf.images) delete img.altEmpty;
    const without = scoreDocument(b.qpdf, b.pdfjs);
    expect(alt(withEvidence).c.score).toBe(alt(without).c.score);
    expect(withEvidence.overallScore).toBe(without.overallScore);
    expect(withEvidence.conformance.failures.map((f) => f.sc)).toEqual(
      without.conformance.failures.map((f) => f.sc),
    );
  });

  it("does not guess when the per-figure evidence is absent (older stored results)", () => {
    const { qpdf, pdfjs } = flyer();
    delete qpdf.figureContentByRef;
    const { text } = alt(scoreDocument(qpdf, pdfjs));
    expect(text).not.toMatch(/drawn shape/);
    expect(text).not.toMatch(/\(a picture\)/);
    expect(text).toContain("Image 4: <Figure> tag — no /Alt attribute");
  });

  it("says nothing about shapes when every missing figure is a picture", () => {
    const { qpdf, pdfjs } = flyer();
    qpdf.images = qpdf.images.filter((i) => !i.altEmpty);
    const { text } = alt(scoreDocument(qpdf, pdfjs));
    expect(text).not.toMatch(/drawn shapes?\b.*not a picture\. If/);
    expect(text).not.toMatch(/of the image\(s\) above/);
  });
});

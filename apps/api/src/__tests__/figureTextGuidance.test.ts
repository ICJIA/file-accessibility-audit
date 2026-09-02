/**
 * "Add alt text" is the wrong fix for a <Figure> that is really a text box.
 *
 * Word exports sidebars, text boxes, SmartArt and chart title bars as
 * <Figure> with the text nested inside. A Figure's /Alt REPLACES its
 * contents for a screen reader, so describing such a box as an image hides
 * the very text it holds (the p42 "ERPO / FRO FACTS" sidebar of the FFY24
 * SCIP Plan carried 108 text runs). Those need retagging, not describing.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { taggedBaseline } from "./helpers/mockResults.js";

function altCategory(result: ReturnType<typeof scoreDocument>) {
  const cat = result.categories.find((c) => c.id === "alt_text");
  if (!cat) throw new Error("alt_text category missing");
  return cat;
}

function withMissingAlt() {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.images = [
    { ref: "20 0 R", hasAlt: false },
    { ref: "21 0 R", hasAlt: false },
    { ref: "22 0 R", hasAlt: true, altText: "ICJIA logo" },
  ];
  return { qpdf, pdfjs };
}

describe("alt_text — figures that contain text", () => {
  it("lists text-bearing figures by page and tells the author to retag rather than describe them", () => {
    const { qpdf, pdfjs } = withMissingAlt();
    pdfjs.textBearingFigures = [
      {
        page: 22,
        hasAlt: false,
        textLength: 812,
        preview: "July 1968: Illinois FOID Act takes effect.",
      },
      {
        page: 42,
        hasAlt: false,
        textLength: 2400,
        preview: "Firearm restraining orders are civil orders",
      },
    ];
    const text = altCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).toContain("--- Figures That Contain Text ---");
    expect(text).toMatch(/2 <Figure> tag\(s\) without alt text contain readable text/);
    expect(text).toMatch(/Page 22: "July 1968: Illinois FOID Act takes effect\."/);
    expect(text).toMatch(/Page 42: "Firearm restraining orders are civil orders"/);
    expect(text).toMatch(/Do not add alt text to these/);
    expect(text).toMatch(/replaces its contents/i);
    expect(text).toMatch(/Properties → Type/);
  });

  it("does not list a text-bearing figure that already has alt text", () => {
    const { qpdf, pdfjs } = withMissingAlt();
    pdfjs.textBearingFigures = [
      { page: 3, hasAlt: true, textLength: 40, preview: "Chart title" },
      { page: 9, hasAlt: false, textLength: 90, preview: "Sidebar" },
    ];
    const text = altCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).toMatch(/1 <Figure> tag\(s\) without alt text contain readable text/);
    expect(text).not.toContain("Page 3:");
    expect(text).toContain('Page 9: "Sidebar"');
  });

  it("stays silent when no figure carries text, and when the census is absent", () => {
    const a = withMissingAlt();
    a.pdfjs.textBearingFigures = [];
    expect(altCategory(scoreDocument(a.qpdf, a.pdfjs)).findings.join("\n")).not.toContain(
      "Figures That Contain Text",
    );
    const b = withMissingAlt();
    expect(altCategory(scoreDocument(b.qpdf, b.pdfjs)).findings.join("\n")).not.toContain(
      "Figures That Contain Text",
    );
  });

  it("caps the listing at 10 figures and counts the rest", () => {
    const { qpdf, pdfjs } = withMissingAlt();
    pdfjs.textBearingFigures = Array.from({ length: 13 }, (_, i) => ({
      page: i + 1,
      hasAlt: false,
      textLength: 50,
      preview: `Box ${i + 1}`,
    }));
    const text = altCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).toContain('Page 10: "Box 10"');
    expect(text).not.toContain('Page 11: "Box 11"');
    expect(text).toMatch(/and 3 more/);
  });

  it("adds the retag path to the per-document Acrobat block, which the action plan renders", () => {
    const { qpdf, pdfjs } = withMissingAlt();
    pdfjs.textBearingFigures = [{ page: 22, hasAlt: false, textLength: 812, preview: "Timeline" }];
    const findings = altCategory(scoreDocument(qpdf, pdfjs)).findings;
    const start = findings.indexOf("--- Adobe Acrobat: How to Fix ---");
    expect(start).toBeGreaterThan(-1);
    const acrobat = findings.slice(start).join("\n");
    expect(acrobat).toMatch(/Properties → Type → .*Section/);
    expect(acrobat).toMatch(/text box/i);
  });

  it("leaves the Acrobat block alone when no figure contains text", () => {
    const { qpdf, pdfjs } = withMissingAlt();
    const findings = altCategory(scoreDocument(qpdf, pdfjs)).findings;
    const acrobat = findings
      .slice(findings.indexOf("--- Adobe Acrobat: How to Fix ---"))
      .join("\n");
    expect(acrobat).not.toMatch(/text box/i);
  });

  it("a text-bearing figure is NOT missing alt text: it leaves coverage and the 1.1.1 count (2026-09-02)", () => {
    // A screen reader reads the text inside a <Figure> that has no /Alt;
    // adding alt would hide it. The old rule counted it as missing alt AND
    // told the author not to add any — a deduction with no fix.
    const a = withMissingAlt();
    const b = withMissingAlt();
    b.pdfjs.textBearingFigures = [{ page: 1, hasAlt: false, textLength: 50, preview: "Box" }];
    // 1 of 3 described → 33; with one of the two alt-less figures being a
    // text box, 1 of 2 → 50, and the verdict counts ONE missing image.
    expect(altCategory(scoreDocument(a.qpdf, a.pdfjs)).score).toBe(33);
    const scored = scoreDocument(b.qpdf, b.pdfjs);
    expect(altCategory(scored).score).toBe(50);
    const f = scored.conformance.failures.find((x) => x.category === "alt_text");
    expect(f?.issue).toMatch(/^1 image\(s\) tagged as <Figure>/);
    expect(altCategory(scored).findings.join("\n")).toContain("--- Figures That Contain Text ---");
  });
});

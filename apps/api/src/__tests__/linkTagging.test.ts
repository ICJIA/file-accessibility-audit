/**
 * Untagged links are a defect the report must surface — in the Link category,
 * in the conformance verdict, and in the Acrobat-parity table.
 *
 * Real case (FFY24 SCIP Plan, 2026-08-20): six link annotations inside a
 * Word text box had no <Link> tag. A screen reader following the tags never
 * meets them, and with tab order set to "structure" they cannot be tabbed to.
 * veraPDF reported them (7.18.5-1); the main report said nothing, and the
 * Link category even scored one of them as a "vague phrase" on the strength
 * of the text fragment that happened to sit under its rectangle.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { makeQpdf, makePdfjs, taggedBaseline } from "./helpers/mockResults.js";

function linkCategory(result: ReturnType<typeof scoreDocument>) {
  const cat = result.categories.find((c) => c.id === "link_quality");
  if (!cat) throw new Error("link_quality category missing");
  return cat;
}

describe("link_quality — untagged links in a tagged document", () => {
  const links = [
    { url: "https://a.example/report", text: "2024 annual report", tagged: true, page: 3 },
    { url: "https://b.example/stats", text: "FOID statistics", tagged: true, page: 3 },
    { url: "https://c.example/act", text: "Firearms Restraining Order Act", tagged: true, page: 4 },
    { url: "https://d.example/pa", text: "PA", tagged: false, page: 22 },
  ];

  it("counts an untagged link as failing and lists it under 'Links Not Tagged'", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = links;
    pdfjs.linkAnnotationCount = 4;
    pdfjs.untaggedLinkAnnotationCount = 1;
    const cat = linkCategory(scoreDocument(qpdf, pdfjs));
    expect(cat.score).toBe(75);
    const text = cat.findings.join("\n");
    expect(text).toContain("--- Links Not Tagged ---");
    expect(text).toMatch(/1 of 4 link\(s\) are not tagged/);
    expect(text).toContain("https://d.example/pa");
    expect(text).toMatch(/page 22/);
  });

  it("does not judge an untagged link on the text near its rectangle", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = links;
    pdfjs.linkAnnotationCount = 4;
    pdfjs.untaggedLinkAnnotationCount = 1;
    const text = linkCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).not.toContain("vague phrase");
    expect(text).not.toContain("too short");
    expect(text).not.toContain("Links With Non-Descriptive Text");
  });

  it("tells the author how to tag the links in Acrobat and how to avoid it in Word", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = links;
    pdfjs.linkAnnotationCount = 4;
    pdfjs.untaggedLinkAnnotationCount = 1;
    const text = linkCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).toMatch(/Unmarked Links/);
    expect(text).toMatch(/text box/i);
  });

  it("adds the Unmarked Links path to the per-document Acrobat block, which the action plan renders", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = links;
    pdfjs.linkAnnotationCount = 4;
    pdfjs.untaggedLinkAnnotationCount = 1;
    const findings = linkCategory(scoreDocument(qpdf, pdfjs)).findings;
    const start = findings.indexOf("--- Adobe Acrobat: How to Fix ---");
    expect(start).toBeGreaterThan(-1);
    expect(findings.slice(start).join("\n")).toMatch(/Unmarked Links/);
  });

  it("leaves the Acrobat block alone when every link is tagged", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = [{ url: "https://b.example", text: "here", tagged: true, page: 5 }];
    pdfjs.linkAnnotationCount = 1;
    pdfjs.untaggedLinkAnnotationCount = 0;
    const findings = linkCategory(scoreDocument(qpdf, pdfjs)).findings;
    const start = findings.indexOf("--- Adobe Acrobat: How to Fix ---");
    expect(findings.slice(start).join("\n")).not.toMatch(/Unmarked Links/);
  });

  it("in an UNTAGGED document, text classification is advisory — no penalty at all", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    qpdf.hasStructTree = false;
    pdfjs.links = links.map((l) => ({ ...l, tagged: false }));
    pdfjs.linkAnnotationCount = 4;
    pdfjs.untaggedLinkAnnotationCount = 4;
    const cat = linkCategory(scoreDocument(qpdf, pdfjs));
    // Wording is advisory since the legal-only sweep — nothing here scores.
    expect(cat.score).toBe(100);
    expect(cat.findings.join("\n")).not.toContain("Links Not Tagged");
  });

  it("stored and legacy link entries with no tagging flag: wording stays advisory", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = [
      { url: "https://a.example", text: "Annual Report 2024" },
      { url: "https://b.example", text: "click here" },
    ];
    const cat = linkCategory(scoreDocument(qpdf, pdfjs));
    expect(cat.score).toBe(100); // legacy entries follow the same rule: wording never scores
    expect(cat.findings.join("\n")).not.toContain("Links Not Tagged");
  });

  it("labels 1–2 character link text as too short rather than as a vague phrase", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = [
      { url: "https://a.example", text: "PA", tagged: true, page: 2 },
      { url: "https://b.example", text: "here", tagged: true, page: 5 },
    ];
    const text = linkCategory(scoreDocument(qpdf, pdfjs)).findings.join("\n");
    expect(text).toMatch(/"PA" \(page 2\) — too short to describe a destination/);
    expect(text).toMatch(/"here" \(page 5\) — vague phrase/);
  });
});

describe("conformance gate — untagged links", () => {
  it("asserts a 1.3.1 failure under link_quality when a tagged document has untagged link annotations", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = [{ url: "https://d.example/pa", text: "PA", tagged: false, page: 22 }];
    pdfjs.linkAnnotationCount = 1;
    pdfjs.untaggedLinkAnnotationCount = 1;
    const result = scoreDocument(qpdf, pdfjs);
    const failure = result.conformance.failures.find((f) => f.category === "link_quality");
    expect(failure).toBeDefined();
    expect(failure!.sc).toBe("1.3.1");
    expect(failure!.level).toBe("A");
    expect(failure!.issue).toMatch(/1 link\(s\) are not tagged/);
  });

  it("asserts nothing extra for an untagged document — the missing tree is already the 1.3.1 failure", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: false }),
      makePdfjs({
        hasText: true,
        textLength: 500,
        title: "T",
        lang: "en",
        links: [{ url: "https://x.example", text: "x", tagged: false, page: 1 }],
        linkAnnotationCount: 1,
        untaggedLinkAnnotationCount: 1,
      }),
    );
    expect(result.conformance.failures.filter((f) => f.category === "link_quality")).toHaveLength(
      0,
    );
  });

  it("asserts nothing when every link annotation is tagged", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.links = [{ url: "https://a.example", text: "Annual report", tagged: true, page: 1 }];
    pdfjs.linkAnnotationCount = 1;
    pdfjs.untaggedLinkAnnotationCount = 0;
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.failures.filter((f) => f.category === "link_quality")).toHaveLength(
      0,
    );
  });
});

describe("Acrobat parity — Tagged annotations", () => {
  function parityRule(result: ReturnType<typeof scoreDocument>) {
    const r = result.adobeParity!.rules.find((x) => x.id === "tagged_annotations");
    if (!r) throw new Error("rule missing");
    return r;
  }

  it("passes when every link annotation has a <Link> tag", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.linkAnnotationCount = 3;
    pdfjs.untaggedLinkAnnotationCount = 0;
    const rule = parityRule(scoreDocument(qpdf, pdfjs));
    expect(rule.status).toBe("passed");
    expect(rule.vacuous).toBe(false);
    expect(rule.note).toMatch(/3 link annotation\(s\)/);
  });

  it("fails and counts the untagged ones", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.linkAnnotationCount = 8;
    pdfjs.untaggedLinkAnnotationCount = 6;
    const rule = parityRule(scoreDocument(qpdf, pdfjs));
    expect(rule.status).toBe("failed");
    expect(rule.note).toMatch(/6 of 8/);
  });

  it("passes vacuously when the document has no link annotations at all", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.linkAnnotationCount = 0;
    pdfjs.untaggedLinkAnnotationCount = 0;
    const rule = parityRule(scoreDocument(qpdf, pdfjs));
    expect(rule.status).toBe("passed");
    expect(rule.vacuous).toBe(true);
  });

  it("stays not_computed when the census is absent (stored reports from before it existed)", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    const rule = parityRule(scoreDocument(qpdf, pdfjs));
    expect(rule.status).toBe("not_computed");
  });
});

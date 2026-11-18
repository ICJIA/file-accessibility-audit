/**
 * Decision 2026-11-18 (4): failures judged from how a document LOOKS (bold
 * or large lines that look like headings) are marked "likely" in the
 * verdict, and the summary counts them apart from confirmed failures and
 * asks a person to verify them. Decision 9: the Office missing-title finding
 * explains why a title matters, accurately.
 */
import { describe, it, expect } from "vitest";
import { evaluateDocxConformance } from "../services/scoring/conformance.js";
import { generateSummary } from "../services/scoring/summary.js";
import { scoreDocx } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";

function analysis(over: Partial<DocxAnalysis> = {}): DocxAnalysis {
  return {
    metadata: {
      title: "Quarterly Report",
      creator: "A",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [{ level: 1, text: "Intro" }],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 5, unresolvedRuns: 0, failing: [] },
    paragraphCount: 4,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
    ...over,
  } as DocxAnalysis;
}

describe("likely failures", () => {
  it("a heading look-alike is a LIKELY failure; a missing title is not", () => {
    const v = evaluateDocxConformance(
      analysis({
        metadata: { title: null, creator: "A", language: "en-US", pageCount: 2, wordCount: 500 },
        fakeHeadings: [{ text: "Our Mission" }, { text: "Our Plan" }],
      }),
    );
    const heading = v.failures.find((f) => f.category === "heading_structure");
    const title = v.failures.find((f) => f.sc === "2.4.2");
    expect(heading?.likely).toBe(true);
    expect(title?.likely).toBeUndefined();
  });

  it("the summary counts confirmed and likely criteria apart and asks for a check", () => {
    const v = evaluateDocxConformance(
      analysis({
        metadata: { title: null, creator: "A", language: "en-US", pageCount: 2, wordCount: 500 },
        fakeHeadings: [{ text: "Our Mission" }, { text: "Our Plan" }],
      }),
    );
    const s = generateSummary(69, "D", false, [], v, "Word document");
    expect(s).toMatch(
      /confirmed 1 WCAG 2\.1 criterion failing, and found 1 WCAG 2\.1 criterion likely failing — please verify it/,
    );
    expect(s).toMatch(/judged from how the text looks/);
  });

  it("only likely failures → no 'confirmed' claim at all", () => {
    const v = evaluateDocxConformance(analysis({ fakeHeadings: [{ text: "A" }, { text: "B" }] }));
    const s = generateSummary(69, "D", false, [], v, "Word document");
    expect(s).not.toMatch(/confirmed/);
    expect(s).toMatch(/likely failing — please verify/);
  });

  it("a criterion confirmed elsewhere stays confirmed even if a likely finding shares it", () => {
    const v = {
      status: "fail" as const,
      failures: [
        {
          sc: "1.3.1",
          name: "x",
          level: "A" as const,
          category: "table_markup",
          issue: "i",
          url: "u",
        },
        {
          sc: "1.3.1",
          name: "x",
          level: "A" as const,
          category: "heading_structure",
          issue: "i",
          url: "u",
          likely: true,
        },
      ],
      notAssessed: [],
      headline: "",
    };
    expect(generateSummary(69, "D", false, [], v)).not.toMatch(/likely/);
  });
});

describe("Office missing title (decision 9)", () => {
  it("explains why it matters without claiming screen readers announce it in Office", () => {
    const r = scoreDocx(
      analysis({
        metadata: { title: null, creator: "A", language: "en-US", pageCount: 2, wordCount: 500 },
      }),
    );
    const f = r.categories.find((c) => c.id === "title_language")!.findings.join(" ");
    expect(f).toMatch(/^No document title is set|No document title is set/);
    expect(f).not.toMatch(/Screen readers announce the title/);
    expect(f).toMatch(/NVDA and JAWS read its file name/);
    expect(f).toMatch(/Access Board/);
  });
});

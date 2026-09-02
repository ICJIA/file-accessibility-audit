/**
 * The two-standard strip (v1.131.0).
 *
 * Answers, on every report and before anyone scrolls, the objection this
 * project will keep meeting: "you are grading our file against PDF/UA, and
 * PDF/UA is not the law." Two verdicts side by side — the legal standard that
 * the grade measures, and the industry standard that it does not.
 *
 * The tests are mostly about NOT overstating: veraPDF's silence must read as
 * not-checked, a Word file must be told the standard does not apply, and the
 * PDF/UA side must always say it is uncounted.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TwoStandardsStrip from "../components/TwoStandardsStrip.vue";

const clean = { status: "pass", failures: [], notAssessed: [], headline: "" } as never;
const failing = {
  status: "fail",
  failures: [{ sc: "1.3.1" }, { sc: "1.1.1" }],
  notAssessed: [],
  headline: "",
} as never;

const strip = (props: Record<string, unknown>) =>
  mount(TwoStandardsStrip, { props: { wcagVersion: "2.2", ...props } as never });

describe("the WCAG 2.1 side — what the grade measures", () => {
  it("names the three legal instruments and says the grade follows them", () => {
    const html = strip({ conformance: clean, fileType: "pdf" }).html();
    expect(html).toMatch(/Required by WCAG 2\.1/i);
    // The SiteImprove failure mode, ruled out in writing: nothing beyond
    // WCAG 2.1 A/AA is counted — not 2.2's added criteria, not PDF/UA.
    expect(html).toMatch(/Nothing beyond WCAG 2\.1 A\/AA is counted/);
    expect(html).not.toMatch(/and more/);
    expect(html).toMatch(/ADA Title II/);
    expect(html).toMatch(/IITAA/);
    expect(html).toMatch(/only this — is what your grade measures/i);
  });

  it("reports a clean legal verdict and a failing one differently", () => {
    expect(strip({ conformance: clean }).html()).toMatch(/No automated failures found/i);
    expect(strip({ conformance: failing }).html()).toMatch(/2 criteria failing/i);
  });

  it("counts DISTINCT criteria — 1.3.1 failing in two categories is one criterion", () => {
    // Found 2026-09-01 on a real report: headings and tables both failed
    // 1.3.1 plus 2.4.2 and 1.1.1 elsewhere, and the strip said "4 criteria
    // failing" over a list a reader can count three distinct criteria in.
    const html = strip({
      conformance: {
        status: "fail",
        failures: [
          { sc: "1.3.1", category: "heading_structure" },
          { sc: "1.3.1", category: "table_markup" },
          { sc: "2.4.2", category: "title_language" },
        ],
        notAssessed: [],
        headline: "",
      } as never,
    }).html();
    expect(html).toMatch(/2 criteria failing in 3 categories/i);
    expect(html).not.toMatch(/3 criteria failing/i);
  });
});

describe("the PDF/UA side — reported, never counted", () => {
  it("always states that it does not affect the score — without calling the whole bundle optional", () => {
    // veraPDF's list routinely contains rules that ARE WCAG 2.1 A/AA
    // territory (7.3-1 figure alt ↔ 1.1.1) — the grade counts this tool's
    // own check of those points. Calling the bundle "a best practice, not
    // required by WCAG 2.1" was true of the SCORE and false of the STANDARD
    // (found 2026-09-01); the copy now says where the overlap lives.
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: { available: true, passed: false, failures: [{ count: 5 }] },
    }).html();
    expect(html).toMatch(/not counted in your score/i);
    expect(html).toMatch(/overlaps WCAG 2\.1/i);
    expect(html).not.toMatch(/a best practice, not\s+required by WCAG 2\.1/i);
  });

  it("counts items across rules when veraPDF failed the document", () => {
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: {
        available: true,
        passed: false,
        failures: [{ count: 17 }, { count: 5 }, { count: 1 }],
      },
    }).html();
    expect(html).toMatch(/23 items across 3 rules/i);
  });

  it("says NOT CHECKED when veraPDF did not run — never 'no failures'", () => {
    const html = strip({ conformance: clean, fileType: "pdf", pdfUaVerdict: null }).html();
    expect(html).toMatch(/Not checked on this document/i);
    expect(html).not.toMatch(/No PDF\/UA failures found/i);
  });

  it("a veraPDF error verdict says the check could not run — never '0 items across 0 rules'", () => {
    // Every error path returns available:true, passed:false, failures:[] —
    // which the strip rendered as "0 items across 0 rules", a clean-looking
    // line directly contradicting the panel's own "Could not validate".
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: {
        available: true,
        passed: false,
        failures: [],
        totalFailureCount: 0,
        distinctRuleCount: 0,
        error: "veraPDF invocation failed",
      },
    }).html();
    expect(html).toMatch(/could not be checked/i);
    expect(html).not.toMatch(/0 items across 0 rules/i);
    expect(html).not.toMatch(/No PDF\/UA failures found/i);
  });

  it("uses the verdict's own totals when the stored failure list is truncated to the top 20", () => {
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: {
        available: true,
        passed: false,
        failures: [{ count: 17 }],
        totalFailureCount: 500,
        distinctRuleCount: 37,
      },
    }).html();
    expect(html).toMatch(/500 items across 37 rules/i);
  });

  it("says the standard does not apply to a Word file", () => {
    const html = strip({ conformance: clean, fileType: "docx" }).html();
    expect(html).toMatch(/Does not apply to this file type/i);
  });

  it("reports a clean veraPDF pass as such", () => {
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: { available: true, passed: true, failures: [] },
    }).html();
    expect(html).toMatch(/No PDF\/UA failures found/i);
  });
});

describe("the legal-only claim is era-gated for stored reports (2026-09-01)", () => {
  // Shared reports live 365 days and are regraded on read from their STORED
  // category scores. A payload analysed before the legal-only sweep
  // (2026-08-29) carries deductions today's model reports without counting —
  // bookmarks at 0/Critical, say — and the strip rendered "Nothing beyond
  // WCAG 2.1 A/AA is counted" over exactly that grade.
  it("a pre-sweep stored report gets the era wording, not the absolute claim", () => {
    const html = strip({ conformance: clean, fileType: "pdf", analyzedAt: "2026-08-01" }).html();
    expect(html).toMatch(/predates the current scoring model/i);
    expect(html).not.toMatch(/Nothing beyond WCAG 2\.1 A\/AA is counted/);
    expect(html).not.toMatch(/only this — is what your grade measures/i);
  });

  it("a post-sweep stored report keeps the absolute claim", () => {
    const html = strip({ conformance: clean, fileType: "pdf", analyzedAt: "2026-09-01" }).html();
    expect(html).toMatch(/Nothing beyond WCAG 2\.1 A\/AA is counted/);
  });

  it("a live analysis (no analyzedAt) keeps the absolute claim", () => {
    const html = strip({ conformance: clean, fileType: "pdf" }).html();
    expect(html).toMatch(/Nothing beyond WCAG 2\.1 A\/AA is counted/);
  });

  it("an unparseable stored date is treated as pre-sweep — never overclaim on a forged payload", () => {
    const html = strip({ conformance: clean, fileType: "pdf", analyzedAt: "garbage" }).html();
    expect(html).not.toMatch(/Nothing beyond WCAG 2\.1 A\/AA is counted/);
  });
});

describe("the criteria count bridges to categories when they differ (v1.139.1)", () => {
  it("counts distinct criteria across categories — and bridges only when the counts differ", () => {
    // The Violence Prevention Plan case: 4 Critical + 1 Moderate tiles = 5
    // categories; title_language fails 2.4.2 AND 3.1.1, and 1.3.1 fails in
    // two categories — so the DISTINCT criteria are five, same as the
    // categories. The strip used to say "6 criteria failing in 5
    // categories", counting the 1.3.1 entry twice (fixed 2026-09-01).
    const conformance = {
      status: "fail",
      failures: [
        { sc: "1.3.1", category: "text_extractability" },
        { sc: "1.1.1", category: "alt_text" },
        { sc: "3.1.1", category: "title_language" },
        { sc: "2.4.2", category: "title_language" },
        { sc: "1.3.1", category: "heading_structure" },
        { sc: "1.3.2", category: "reading_order" },
      ],
      notAssessed: [],
      headline: "",
    } as never;
    const html = strip({ conformance, fileType: "pdf" }).html();
    expect(html).toMatch(/5 criteria failing/);
    expect(html).not.toMatch(/6 criteria/);
  });

  it("bridges when a category fails two criteria and no criterion repeats", () => {
    const conformance = {
      status: "fail",
      failures: [
        { sc: "3.1.1", category: "title_language" },
        { sc: "2.4.2", category: "title_language" },
        { sc: "1.1.1", category: "alt_text" },
      ],
      notAssessed: [],
      headline: "",
    } as never;
    const html = strip({ conformance, fileType: "pdf" }).html();
    expect(html).toMatch(/3 criteria failing in 2 categories/);
  });

  it("stays terse when the two counts agree", () => {
    const html = strip({ conformance: failing }).html();
    expect(html).toMatch(/2 criteria failing/);
    expect(html).not.toMatch(/in \d+ categor/);
  });
});

describe("the bridge pluralizes its category noun (v1.141.1)", () => {
  it('says "in 1 category", never "in 1 categories"', () => {
    // Seen live on a remediation report: title AND language failing inside
    // the single Title & Language category → "2 criteria failing in 1
    // categories". On a product hunting copy errors, grammar is copy.
    const conformance = {
      status: "fail",
      failures: [
        { sc: "2.4.2", category: "title_language" },
        { sc: "3.1.1", category: "title_language" },
      ],
      notAssessed: [],
      headline: "",
    } as never;
    const html = strip({ conformance, fileType: "pdf" }).html();
    expect(html).toMatch(/2 criteria failing in 1 category\b/);
    expect(html).not.toMatch(/1 categories/);
  });
});

describe("the clean line admits what veraPDF's WCAG pass saw (2026-09-02)", () => {
  const flagged = {
    available: true,
    passed: false,
    profile: "WCAG 2.2 machine",
    failures: [{ ruleId: "1.4.3-1", clause: "1.4.3", description: "contrast", count: 12 }],
    totalFailureCount: 12,
  };
  it("says 'by this checker' and points at the technical report when veraPDF flagged WCAG items", () => {
    const html = strip({ conformance: clean, fileType: "pdf", wcagVerdict: flagged }).html();
    expect(html).toMatch(/No automated failures found by this checker/);
    expect(html).toMatch(/veraPDF[^<]*12/);
  });
  it("keeps the plain line when veraPDF's WCAG pass ran clean or did not run", () => {
    expect(strip({ conformance: clean, fileType: "pdf" }).html()).toMatch(
      /No automated failures found</,
    );
    expect(
      strip({
        conformance: clean,
        fileType: "pdf",
        wcagVerdict: { ...flagged, passed: true, failures: [], totalFailureCount: 0 },
      }).html(),
    ).toMatch(/No automated failures found</);
  });
});

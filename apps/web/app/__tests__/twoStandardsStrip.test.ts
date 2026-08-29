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
});

describe("the PDF/UA side — reported, never counted", () => {
  it("always states that it does not affect the score", () => {
    const html = strip({
      conformance: clean,
      fileType: "pdf",
      pdfUaVerdict: { available: true, passed: false, failures: [{ count: 5 }] },
    }).html();
    expect(html).toMatch(/not counted in your score/i);
    expect(html).toMatch(/not\s+required by WCAG 2\.1/i);
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

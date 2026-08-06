import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TechnicalReport from "../components/TechnicalReport.vue";
import ReportContent from "../components/ReportContent.vue";

const result = {
  executiveSummary: "sum text",
  categories: [
    {
      id: "alt_text",
      label: "Alt Text on Images",
      weight: 20,
      score: 40,
      grade: "F",
      severity: "Critical",
      findings: ["5 images with no alt text"],
      explanation: "Images need descriptions.",
      helpLinks: [],
    },
  ],
  conformance: {
    status: "fail",
    headline: "Fails 1 criterion",
    failures: [
      {
        sc: "1.1.1",
        name: "Non-text Content",
        level: "A",
        category: "alt_text",
        issue: "images lack alt text",
        url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      },
    ],
    notAssessed: [
      {
        sc: "1.4.3",
        name: "Contrast (Minimum)",
        level: "AA",
        reason: "needs eyes",
        url: "https://w3.org",
      },
    ],
  },
  grade: "F",
  fileType: "pdf",
};

describe("ReportContent showScoreTable prop", () => {
  it("still renders the score table by default (Detailed view unchanged)", () => {
    const w = mount(ReportContent, { props: { result } });
    expect(w.text()).toContain("Category Scores");
  });
  it("hides only the score table when showScoreTable=false", () => {
    const w = mount(ReportContent, { props: { result, showScoreTable: false } });
    expect(w.text()).not.toContain("Category Scores");
    expect(w.text()).toContain("Detailed Findings");
  });
});

describe("TechnicalReport", () => {
  it("is collapsed by default with an aria-expanded header button", () => {
    const w = mount(TechnicalReport, { props: { result, wcagVersion: "2.2" } });
    const btn = w.find("button[aria-expanded]");
    expect(btn.attributes("aria-expanded")).toBe("false");
    // happy-dom + vue-test-utils isVisible() can't see v-show's inline display,
    // so assert the mechanism v-show actually uses: the style attribute.
    expect(w.find(".tech-report-body").attributes("style") ?? "").toContain("display: none");
    expect(w.attributes("id")).toBe("technical-report");
  });

  it("expands on click and shows conformance detail + findings + methodology", async () => {
    const w = mount(TechnicalReport, { props: { result, wcagVersion: "2.2" } });
    await w.find("button[aria-expanded]").trigger("click");
    expect(w.find(".tech-report-body").attributes("style") ?? "").not.toContain("display: none");
    // full conformance parity: failing criterion, not-assessed list, standards basis
    expect(w.text()).toContain("1.1.1");
    expect(w.text()).toContain("Not evaluated automatically");
    expect(w.text()).toContain("IITAA");
    // embedded ReportContent without its score table
    expect(w.text()).toContain("Detailed Findings");
    expect(w.text()).not.toContain("Category Scores");
  });

  it("shows the executive summary and the audit-scope caveat — parity with ScoreCard (Fix 3)", async () => {
    const w = mount(TechnicalReport, { props: { result, wcagVersion: "2.2" } });
    await w.find("button[aria-expanded]").trigger("click");
    expect(w.find("[data-testid='tech-executive-summary']").text()).toContain("sum text");
    // Distinctive phrase shared verbatim by both caveat variants (Office vs.
    // PDF/Acrobat) in ScoreCard.vue's copy — present regardless of fileType.
    expect(w.text()).toContain("cannot catch every issue");
  });

  it("opens via v-model:open (evidence links)", async () => {
    const w = mount(TechnicalReport, {
      props: { result, wcagVersion: "2.2", open: true, "onUpdate:open": () => {} },
    });
    expect(w.find(".tech-report-body").attributes("style") ?? "").not.toContain("display: none");
  });
});

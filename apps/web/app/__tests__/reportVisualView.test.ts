import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportVisualView from "../components/ReportVisualView.vue";

const result = {
  filename: "report.pdf",
  pageCount: 12,
  overallScore: 62,
  grade: "D",
  isScanned: false,
  executiveSummary: "sum",
  fileType: "pdf",
  warnings: ["A warning line"],
  categories: [
    {
      id: "text_extractability",
      label: "Text Extractability",
      score: 0,
      grade: "F",
      severity: "Critical",
      findings: ["No text found"],
    },
    {
      id: "title_language",
      label: "Document Title & Language",
      score: 40,
      grade: "F",
      severity: "Moderate",
      findings: ["No title set"],
    },
    { id: "reading_order", label: "Reading Order", score: null, grade: null, severity: null, notAssessed: true },
  ],
  conformance: {
    status: "fail",
    headline: "h",
    failures: [
      { sc: "1.3.1", name: "Info and Relationships", level: "A", category: "text_extractability", issue: "x", url: "https://w3.org" },
    ],
    notAssessed: [],
  },
};

describe("ReportVisualView", () => {
  it("renders hero, tiles, verdict, plan, bars, and technical expander — in that DOM order", () => {
    const w = mount(ReportVisualView, { props: { result } });
    const html = w.html();
    const order = [
      html.indexOf("/100"), // hero score
      html.indexOf("severity-tile-critical"),
      html.indexOf("verdict-strip"),
      html.indexOf("Your action plan"),
      html.indexOf("Where the score comes from"),
      // NOT html.indexOf("technical-report") — VerdictStrip's fail-branch
      // renders href="#technical-report" (pinned by reportHeader.test.ts),
      // which is an earlier, unrelated match for that substring. Anchor to
      // the TechnicalReport section's own opening tag instead.
      html.indexOf('id="technical-report"'),
    ];
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("builds plan steps from the result (Critical first)", () => {
    const w = mount(ReportVisualView, { props: { result } });
    expect(w.text()).toContain("Make the text readable by screen readers");
    expect(w.text()).toContain("2 fixes, in order.");
  });

  it("shows warnings and renders the notice slot", () => {
    const w = mount(ReportVisualView, {
      props: { result },
      slots: { notice: "<div data-testid='notice-slot'>notice</div>" },
    });
    expect(w.text()).toContain("A warning line");
    expect(w.find("[data-testid='notice-slot']").exists()).toBe(true);
  });

  it("evidence click opens the technical report", async () => {
    const w = mount(ReportVisualView, { props: { result } });
    // happy-dom + vue-test-utils isVisible() can't see v-show's inline display,
    // so assert the mechanism v-show actually uses: the style attribute
    // (pattern from actionPlanComponent.test.ts / technicalReport.test.ts).
    expect(w.find(".tech-report-body").attributes("style") ?? "").toContain("display: none");
    await w.find("[data-testid='evidence-link']").trigger("click");
    expect(w.find(".tech-report-body").attributes("style") ?? "").not.toContain("display: none");
  });

  it("page-audit-shaped report (no categories) → hero only, NEVER the pass card", () => {
    const pageAudit = {
      filename: "https://example.gov/news",
      overallScore: undefined,
      grade: "B",
      score: 74,
      violationCount: 12,
      bySeverity: { critical: 2, serious: 4, moderate: 5, minor: 1 },
    };
    const w = mount(ReportVisualView, { props: { result: pageAudit } });
    expect(w.text()).toContain("Good");
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(false);
    expect(w.find("[data-testid^='severity-tile-']").exists()).toBe(false);
    expect(w.find("[data-testid='bar-row']").exists()).toBe(false);
    expect(w.find("#technical-report").exists()).toBe(false);
    expect(w.text()).not.toContain("Nothing to fix");
  });
});

import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "fs";
import { resolve } from "path";

import ScoreCard from "../components/ScoreCard.vue";
import CategoryRow from "../components/CategoryRow.vue";

function readPageSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "..", relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// Grade color thresholds
// ---------------------------------------------------------------------------
describe("Score display — grade color mapping", () => {
  const gradeColors: Record<string, string> = {
    A: "#22c55e", // green
    B: "#14b8a6", // teal
    C: "#eab308", // yellow
    D: "#f97316", // orange
    F: "#ef4444", // red
  };

  const makeResult = (grade: string, score: number) => ({
    filename: "test.pdf",
    pageCount: 5,
    overallScore: score,
    grade,
    executiveSummary: "Test summary.",
  });

  it.each([
    { grade: "A", score: 95, expectedColor: "#22c55e", description: "green" },
    { grade: "B", score: 82, expectedColor: "#14b8a6", description: "teal" },
    { grade: "C", score: 70, expectedColor: "#eab308", description: "yellow" },
    { grade: "D", score: 55, expectedColor: "#f97316", description: "orange" },
    { grade: "F", score: 30, expectedColor: "#ef4444", description: "red" },
  ])(
    "ScoreCard grade $grade displays in $description ($expectedColor)",
    ({ grade, score, expectedColor }) => {
      const wrapper = mount(ScoreCard, {
        props: { result: makeResult(grade, score) },
      });

      // The grade letter element should have the correct color
      const gradeSpan = wrapper.find("span.text-5xl");
      expect(gradeSpan.exists()).toBe(true);
      expect(gradeSpan.attributes("style")).toContain(expectedColor);

      // The grade circle border should have the correct color
      const circle = wrapper.find("div.w-28");
      expect(circle.attributes("style")).toContain(
        `border-color: ${expectedColor}`,
      );
    },
  );

  it.each([
    { grade: "A", expectedColor: "#22c55e" },
    { grade: "B", expectedColor: "#14b8a6" },
    { grade: "C", expectedColor: "#eab308" },
    { grade: "D", expectedColor: "#f97316" },
    { grade: "F", expectedColor: "#ef4444" },
  ])(
    "CategoryRow grade $grade uses color $expectedColor for score bar",
    ({ grade, expectedColor }) => {
      const wrapper = mount(CategoryRow, {
        props: {
          category: {
            id: "test",
            label: "Test Category",
            score: 60,
            grade,
            severity: "Minor",
            findings: [],
          },
        },
      });

      // The score bar should use the grade color as background
      const bar = wrapper.find('[class*="transition-all"]');
      expect(bar.attributes("style")).toContain(
        `background-color: ${expectedColor}`,
      );
    },
  );

  it("ScoreCard falls back to grey for unknown grade", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("Z", 50) },
    });
    const gradeSpan = wrapper.find("span.text-5xl");
    expect(gradeSpan.attributes("style")).toContain("#666");
  });
});

// ---------------------------------------------------------------------------
// Binary verdict banner removed
// ---------------------------------------------------------------------------
describe("Score display — no binary verdict banner", () => {
  const makeResult = (grade: string, score: number) => ({
    filename: "test.pdf",
    pageCount: 5,
    overallScore: score,
    grade,
    executiveSummary: "Test summary.",
  });

  it("does not render a binary accessible/not-accessible banner for grade A", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("A", 95) },
    });
    expect(wrapper.find('[data-testid="verdict-banner"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("This file is accessible");
  });

  it("does not render a binary accessible/not-accessible banner for grade F", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("F", 30) },
    });
    expect(wrapper.find('[data-testid="verdict-banner"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("This file is not accessible");
  });

  it("avoids binary accessible/not-accessible text across grade thresholds", () => {
    const wrapperB = mount(ScoreCard, {
      props: { result: makeResult("B", 82) },
    });
    expect(wrapperB.text()).not.toContain("This file is accessible");

    const wrapperC = mount(ScoreCard, {
      props: { result: makeResult("C", 70) },
    });
    expect(wrapperC.text()).not.toContain("This file is not accessible");
  });
});

// ---------------------------------------------------------------------------
// Verdict explanation (critical/moderate counts)
// ---------------------------------------------------------------------------
describe("Score display — verdict explanation", () => {
  const cat = (severity: string) => ({
    id: "x",
    label: "X",
    score: 50,
    grade: "D",
    severity,
    findings: [],
  });

  const makeResult = (grade: string, score: number, severities: string[]) => ({
    filename: "test.pdf",
    pageCount: 5,
    overallScore: score,
    grade,
    executiveSummary: "Test summary.",
    categories: severities.map(cat),
  });

  it("shows strict-mode legal guidance with counts for a failing document", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: makeResult("D", 55, ["Critical", "Critical", "Moderate"]),
      },
    });
    const explanation = wrapper.find('[data-testid="verdict-explanation"]');
    expect(explanation.exists()).toBe(true);
    expect(explanation.text()).toContain("2 critical issues");
    expect(explanation.text()).toContain("1 moderate issue");
    expect(explanation.text()).toContain("legal accessibility review");
  });

  it('renders singular "critical issue" when exactly one', () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("F", 30, ["Critical"]) },
    });
    const explanation = wrapper.find('[data-testid="verdict-explanation"]');
    expect(explanation.text()).toContain("1 critical issue");
    expect(explanation.text()).not.toContain("1 critical issues");
  });

  it("says every category passed without using binary accessibility language", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("A", 95, ["Pass", "Pass", "Minor"]) },
    });
    const explanation = wrapper.find('[data-testid="verdict-explanation"]');
    expect(explanation.text()).toContain("Every scored category passed");
    expect(explanation.text()).toContain("not a final legal determination");
  });

  it("still notes remaining issues without calling the file accessible", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult("B", 82, ["Pass", "Moderate"]) },
    });
    const explanation = wrapper.find('[data-testid="verdict-explanation"]');
    expect(explanation.text()).toContain("publication-ready");
    expect(explanation.text()).toContain("1 moderate issue");
  });

  it("renders strict-mode legal guidance even when categories are not provided", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          filename: "test.pdf",
          pageCount: 5,
          overallScore: 95,
          grade: "A",
          executiveSummary: "Test summary.",
        },
      },
    });
    expect(
      wrapper.find('[data-testid="verdict-explanation"]').text(),
    ).toContain("legal accessibility review");
  });
});

// ---------------------------------------------------------------------------
// N/A categories
// ---------------------------------------------------------------------------
describe("Score display — N/A categories", () => {
  it('shows "N/A" text instead of a numeric score when score is null', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: "images",
          label: "Image Alt Text",
          score: null,
          grade: null,
          severity: null,
          findings: ["No images detected in this document"],
        },
      },
    });
    // The score span should read "N/A"
    const scoreSpan = wrapper.find("span.font-mono");
    expect(scoreSpan.exists()).toBe(true);
    expect(scoreSpan.text()).toBe("N/A");
  });

  it("does not render the score bar for N/A categories", () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: "images",
          label: "Image Alt Text",
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    });
    // The inner bar element with v-if should not exist
    const innerBars = wrapper.findAll(".rounded-full.transition-all");
    expect(innerBars.length).toBe(0);
  });

  it("shows a dash instead of a grade badge for N/A categories", () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: "tables",
          label: "Tables",
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    });
    // Should contain the em-dash character
    expect(wrapper.text()).toContain("\u2014"); // —
  });

  it('shows "N/A" severity label when severity is null', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: "tables",
          label: "Tables",
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    });
    // The severity area should show N/A (not as a UBadge, but as a plain span)
    const spans = wrapper.findAll("span");
    const naSpans = spans.filter((s) => s.text() === "N/A");
    // Should have at least 2 N/A spans: one for score, one for severity
    expect(naSpans.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Severity badges
// ---------------------------------------------------------------------------
describe("Score display — severity badges", () => {
  function makeCategoryWithSeverity(severity: string) {
    return {
      id: "test",
      label: "Test",
      score: 50,
      grade: "D",
      severity,
      findings: ["Some finding"],
    };
  }

  it('shows "Pass" severity with success color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity("Pass") },
    });
    const badge = wrapper.find(".u-badge");
    expect(badge.text()).toBe("Pass");
    expect(badge.attributes("data-color")).toBe("success");
  });

  it('shows "Minor" severity with info color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity("Minor") },
    });
    const badge = wrapper.find(".u-badge");
    expect(badge.text()).toBe("Minor");
    expect(badge.attributes("data-color")).toBe("info");
  });

  it('shows "Moderate" severity with warning color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity("Moderate") },
    });
    const badge = wrapper.find(".u-badge");
    expect(badge.text()).toBe("Moderate");
    expect(badge.attributes("data-color")).toBe("warning");
  });

  it('shows "Critical" severity with error color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity("Critical") },
    });
    const badge = wrapper.find(".u-badge");
    expect(badge.text()).toBe("Critical");
    expect(badge.attributes("data-color")).toBe("error");
  });

  it("falls back to neutral color for unknown severity string", () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity("Unknown") },
    });
    const badge = wrapper.find(".u-badge");
    expect(badge.text()).toBe("Unknown");
    expect(badge.attributes("data-color")).toBe("neutral");
  });

  it("renders all four severity levels with correct text", () => {
    const severities = ["Pass", "Minor", "Moderate", "Critical"];
    for (const severity of severities) {
      const wrapper = mount(CategoryRow, {
        props: { category: makeCategoryWithSeverity(severity) },
      });
      expect(wrapper.find(".u-badge").text()).toBe(severity);
    }
  });
});

// ---------------------------------------------------------------------------
// Detailed Findings card — profile badge & PDF/UA pill
// ---------------------------------------------------------------------------
describe("Detailed Findings — profile badge and PDF/UA pill", () => {
  const indexSource = readPageSource("pages/index.vue");
  const reportSource = readPageSource("pages/report/[id].vue");

  it("renders a strict profile badge on each scored category card when strict mode is selected", () => {
    // Each Detailed Findings card carries a category-mode-badge pill whose
    // text is driven by MODE_BUTTON_LABELS[selectedScoreMode] — so the badge
    // reads "Strict" in strict mode and "Practical" in practical mode.
    for (const source of [indexSource, reportSource]) {
      expect(source).toContain('data-testid="category-mode-badge"');
      expect(source).toContain(
        "MODE_BUTTON_LABELS[selectedScoreMode]",
      );
      // Strict uses an emerald tint, Practical uses amber.
      expect(source).toContain("border-emerald-500/40 bg-emerald-500/10 text-emerald-300");
      expect(source).toContain("border-amber-500/40 bg-amber-500/10 text-amber-300");
      // The mode badge is keyed off selectedScoreMode === 'strict'.
      expect(source).toContain("selectedScoreMode === 'strict'");
    }
  });

  it("renders a practical profile badge and a PDF/UA signals pill on the pdf_ua_compliance card when practical mode is selected", () => {
    for (const source of [indexSource, reportSource]) {
      expect(source).toContain('data-testid="pdf-ua-badge"');
      // The pill is only shown when both the category is pdf_ua_compliance
      // and the user has selected Practical (remediation) mode.
      expect(source).toContain("cat.id === 'pdf_ua_compliance'");
      expect(source).toContain("selectedScoreMode === 'remediation'");
      // Stronger amber tint distinguishes it from the mode badge.
      expect(source).toContain(
        "border-amber-400/60 bg-amber-400/15 text-amber-200",
      );
      expect(source).toContain("PDF/UA signals");
    }
  });

  it("renders a ModeCompareBox inside each Detailed Findings card on both pages", () => {
    for (const source of [indexSource, reportSource]) {
      expect(source).toContain("ModeCompareBox");
      expect(source).toContain('v-bind="compareProps(cat.id)"');
    }
  });
});

// ---------------------------------------------------------------------------
// Mode divergence copy — per-category rationale
// ---------------------------------------------------------------------------
describe("Mode divergence copy — per-category rationale", () => {
  const modulePath = "~/utils/modeDivergence";

  it("provides Strict/Practical rationale copy for every category that branches on the scoring mode", async () => {
    const { DIVERGENCE_COPY, canCategoryDiverge, getDivergenceCopy } =
      await import("../utils/modeDivergence");
    // Only these four category scorers branch on the scoring mode.
    const divergingIds = [
      "heading_structure",
      "table_markup",
      "reading_order",
      "pdf_ua_compliance",
    ];
    for (const id of divergingIds) {
      expect(canCategoryDiverge(id)).toBe(true);
      expect(DIVERGENCE_COPY[id]).toBeDefined();
      const copy = getDivergenceCopy(id);
      expect(copy.whatPracticalCredits.length).toBeGreaterThan(40);
      expect(copy.whyStrictMatters.length).toBeGreaterThan(40);
      expect(copy.whyPracticalMatters.length).toBeGreaterThan(40);
    }
  });

  it("falls back to a same-in-both-modes explanation for non-branching categories", async () => {
    const { canCategoryDiverge, getDivergenceCopy } = await import(
      "../utils/modeDivergence"
    );
    for (const id of [
      "text_extractability",
      "title_language",
      "alt_text",
      "bookmarks",
      "link_quality",
      "form_accessibility",
      "color_contrast",
    ]) {
      expect(canCategoryDiverge(id)).toBe(false);
      expect(getDivergenceCopy(id).label).toBe("Same in both modes");
    }
    // Satisfy the "module path" reference to keep linting happy.
    expect(modulePath).toContain("modeDivergence");
  });
});

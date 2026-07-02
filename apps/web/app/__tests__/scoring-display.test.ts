import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "fs";
import { resolve } from "path";

import ScoreCard from "../components/ScoreCard.vue";

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

  it("shows WCAG/IITAA-anchored guidance with counts for a failing document", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: makeResult("D", 55, ["Critical", "Critical", "Moderate"]),
      },
    });
    const explanation = wrapper.find('[data-testid="verdict-explanation"]');
    expect(explanation.exists()).toBe(true);
    expect(explanation.text()).toContain("2 critical issues");
    expect(explanation.text()).toContain("1 moderate issue");
    expect(explanation.text()).toContain("WCAG 2.2 AA");
    expect(explanation.text()).toContain("IITAA §E205.4");
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
    ).toContain("programmatically determinable");
  });
});

// ---------------------------------------------------------------------------
// Detailed Findings card — single-mode (v1.21+)
// ---------------------------------------------------------------------------
describe("Detailed Findings — single Strict view", () => {
  const indexSource = readPageSource("pages/index.vue");
  const reportSource = readPageSource("pages/report/[id].vue");

  it("does not surface a strict/practical mode toggle on either page", () => {
    for (const source of [indexSource, reportSource]) {
      expect(source).not.toContain("selectedScoreMode");
      expect(source).not.toContain("MODE_BUTTON_LABELS");
      expect(source).not.toContain("ModeCompareBox");
      expect(source).not.toContain('data-testid="category-mode-badge"');
      expect(source).not.toContain('data-testid="pdf-ua-badge"');
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  categoriesForScoringMode,
  gradeForScore,
  severityForScore,
} from "../utils/scoringProfiles";

describe("scoringProfiles", () => {
  it("maps remediation category scores to updated grade and severity", () => {
    const categories = [
      {
        id: "heading_structure",
        label: "Heading Structure",
        score: 0,
        grade: "F",
        severity: "Critical",
        findings: ["Strict finding"],
      },
    ];

    const displayed = categoriesForScoringMode(
      categories,
      {
        remediation: {
          label: "Practical readiness score",
          overallScore: 86,
          grade: "B",
          executiveSummary: "Remediation summary",
          categoryScores: { heading_structure: 72 },
        },
      },
      "remediation",
    );

    expect(displayed[0].score).toBe(72);
    expect(displayed[0].grade).toBe("C");
    expect(displayed[0].severity).toBe("Minor");
    expect(displayed[0].findings).toEqual(["Strict finding"]);
  });

  it("prefers the full per-profile categories array when the API supplies it", () => {
    const strictCategories = [
      {
        id: "pdf_ua_compliance",
        label: "PDF/UA Compliance Signals",
        score: null,
        grade: null,
        severity: null,
        findings: ["Strict mode does not use PDF/UA"],
      },
    ];
    const practicalCategories = [
      {
        id: "pdf_ua_compliance",
        label: "PDF/UA Compliance Signals",
        score: 70,
        grade: "C",
        severity: "Minor",
        findings: ["Tagged PDF detected", "PDF/UA identifier found"],
      },
    ];

    const displayed = categoriesForScoringMode(
      strictCategories,
      {
        remediation: {
          label: "Practical readiness score",
          overallScore: 70,
          grade: "C",
          executiveSummary: "Practical summary",
          categoryScores: { pdf_ua_compliance: 70 },
          categories: practicalCategories,
        },
      },
      "remediation",
    );

    expect(displayed).toHaveLength(1);
    expect(displayed[0].score).toBe(70);
    expect(displayed[0].findings).toEqual([
      "Tagged PDF detected",
      "PDF/UA identifier found",
    ]);
  });

  it("keeps the original categories when a profile has no category overrides", () => {
    const categories = [
      { id: "bookmarks", score: 100, grade: "A", severity: "Pass" },
    ];

    expect(categoriesForScoringMode(categories, undefined, "strict")).toEqual(
      categories,
    );
  });

  it.each([
    [95, "A", "Pass"],
    [82, "B", "Minor"],
    [70, "C", "Minor"],
    [60, "D", "Moderate"],
    [20, "F", "Critical"],
    [null, null, null],
  ])(
    "derives grade %s and severity %s from category score",
    (score, grade, severity) => {
      expect(gradeForScore(score as number | null)).toBe(grade);
      expect(severityForScore(score as number | null)).toBe(severity);
    },
  );
});

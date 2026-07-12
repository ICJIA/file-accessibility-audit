import { describe, it, expect } from "vitest";
import {
  SCORING_PROFILES,
  GRADE_THRESHOLDS,
  GRADE_COLORS,
  SEVERITY_COLORS,
  gradeForScore,
  severityForScore,
  WCAG_CATEGORY_MAP,
} from "@file-audit/shared";

// Proves the web app can import the engine's real scoring constants —
// the drift-proof replacement for the hand-copied rubric/colors.

describe("@file-audit/shared scoring constants", () => {
  it("strict profile weights sum to 1.0", () => {
    // SCORING_PROFILES is `as const`, so Object.values narrows each weight to
    // its own numeric literal; widen to number[] before summing arbitrary
    // pairs (0.2 + 0.15 isn't itself one of the literal members).
    const sum = (
      Object.values(SCORING_PROFILES.strict.weights) as number[]
    ).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("bookmarks is 5% and reading_order is 10% in strict (the drift bug)", () => {
    expect(SCORING_PROFILES.strict.weights.bookmarks).toBe(0.05);
    expect(SCORING_PROFILES.strict.weights.reading_order).toBe(0.1);
  });

  it("grade thresholds are descending and colors derive from them", () => {
    const mins = GRADE_THRESHOLDS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(GRADE_COLORS.A).toBe("#22c55e");
    expect(GRADE_COLORS.F).toBe("#ef4444");
  });

  it("gradeForScore / severityForScore follow the thresholds", () => {
    expect(gradeForScore(90)).toBe("A");
    expect(gradeForScore(89)).toBe("B");
    expect(gradeForScore(0)).toBe("F");
    expect(gradeForScore(null)).toBeNull();
    expect(severityForScore(100)).toBe("No issues found");
    expect(severityForScore(99)).toBe("Minor");
    expect(severityForScore(69)).toBe("Moderate");
    expect(severityForScore(39)).toBe("Critical");
    expect(severityForScore(null)).toBeNull();
  });

  it("severity colors cover both UI labels and API labels", () => {
    expect(SEVERITY_COLORS.Pass).toBe("#22c55e");
    expect(SEVERITY_COLORS["No issues found"]).toBe("#22c55e");
    expect(SEVERITY_COLORS.Minor).toBe("#3b82f6");
    expect(SEVERITY_COLORS.Moderate).toBe("#eab308");
    expect(SEVERITY_COLORS.Critical).toBe("#ef4444");
  });

  it("every positively-weighted strict category has a WCAG map entry", () => {
    // pdf_ua_compliance and color_contrast carry weight 0 in strict;
    // pdf_ua_compliance deliberately has no WCAG mapping.
    const weightedKeys = Object.entries(SCORING_PROFILES.strict.weights)
      .filter(([, w]) => w > 0)
      .map(([k]) => k);
    for (const k of weightedKeys) {
      expect(WCAG_CATEGORY_MAP[k], k).toBeDefined();
    }
    expect(WCAG_CATEGORY_MAP.list_structure).toBeDefined(); // DOCX-only category
  });
});

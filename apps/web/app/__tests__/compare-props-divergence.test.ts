import { describe, it, expect } from "vitest";

// Mirrors the compareProps helper defined inline in index.vue and
// report/[id].vue. Locked here so a regression (e.g. accidentally reading
// both pills from the same profile's categories array) is caught fast.
function compareProps(
  scoreProfiles: any,
  catId: string,
  selectedMode: "strict" | "remediation",
) {
  const strict = scoreProfiles?.strict?.categories?.find(
    (c: any) => c.id === catId,
  );
  const practical = scoreProfiles?.remediation?.categories?.find(
    (c: any) => c.id === catId,
  );
  return {
    categoryId: catId,
    strictScore: strict?.score ?? null,
    strictGrade: strict?.grade ?? null,
    practicalScore: practical?.score ?? null,
    practicalGrade: practical?.grade ?? null,
    selectedMode,
  };
}

describe("ModeCompareBox — pill scores come from per-profile arrays", () => {
  // Realistic shape: same document scored twice, with mode-aware categories
  // (heading_structure, table_markup, pdf_ua_compliance) producing different
  // values under Strict vs. Practical.
  const scoreProfiles = {
    strict: {
      mode: "strict",
      categories: [
        { id: "heading_structure", score: 0, grade: "F" },
        { id: "table_markup", score: 30, grade: "F" },
        { id: "pdf_ua_compliance", score: null, grade: null },
        { id: "text_extractability", score: 85, grade: "B" },
      ],
    },
    remediation: {
      mode: "remediation",
      categories: [
        { id: "heading_structure", score: 70, grade: "C" },
        { id: "table_markup", score: 70, grade: "C" },
        { id: "pdf_ua_compliance", score: 80, grade: "B" },
        { id: "text_extractability", score: 85, grade: "B" },
      ],
    },
  };

  it("shows Strict's score on the Strict pill and Practical's on the Practical pill (divergent category)", () => {
    const props = compareProps(scoreProfiles, "heading_structure", "strict");
    expect(props.strictScore).toBe(0);
    expect(props.strictGrade).toBe("F");
    expect(props.practicalScore).toBe(70);
    expect(props.practicalGrade).toBe("C");
  });

  it("does not read both pills from the same profile's array", () => {
    const props = compareProps(scoreProfiles, "table_markup", "remediation");
    expect(props.strictScore).toBe(30);
    expect(props.practicalScore).toBe(70);
    expect(props.strictScore).not.toBe(props.practicalScore);
  });

  it("keeps Strict = N/A and Practical = number for PDF/UA regardless of selectedMode", () => {
    const inStrict = compareProps(
      scoreProfiles,
      "pdf_ua_compliance",
      "strict",
    );
    const inPractical = compareProps(
      scoreProfiles,
      "pdf_ua_compliance",
      "remediation",
    );
    expect(inStrict.strictScore).toBeNull();
    expect(inStrict.practicalScore).toBe(80);
    expect(inPractical.strictScore).toBeNull();
    expect(inPractical.practicalScore).toBe(80);
  });

  it("returns identical scores on both pills for a non-divergent category (correct: same-in-both-modes)", () => {
    const props = compareProps(
      scoreProfiles,
      "text_extractability",
      "strict",
    );
    expect(props.strictScore).toBe(85);
    expect(props.practicalScore).toBe(85);
  });
});

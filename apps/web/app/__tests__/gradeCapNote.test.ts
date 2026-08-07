import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";

// The severity cap lowers the SCORE; the letter is then derived from it
// through GRADE_THRESHOLDS, exactly as it always was. So the two agree by
// construction and there is nothing to reconcile on screen.
//
// It took two reports to get here. v1.58.0 capped the LETTER, which severed
// it from the number and shipped "D" above "80/100". v1.58.1 hid the number
// behind a "Fix progress ... 80 of 100" label, and that failed too — anything
// out of 100 next to a letter grade is read AS the grade ("81 of 100, that's
// a C, not a D"). The number itself had to change, not its packaging.
//
// What the report must now explain is the NUMBER: why it stalls below the raw
// average until a blocking finding is fixed. The panel says so, and reports a
// plain COUNT of passing checks rather than a second figure out of 100.
//
// Both views must do this identically, or switching views becomes its own
// inconsistency — hence one file covering both surfaces.

// Two checks, one passing, one Moderate: capped to 79 (top of the C band).
const CAPPED = [
  { id: "title_language", label: "Title & Language", score: 50, grade: "F", severity: "Moderate" },
  { id: "alt_text", label: "Alt Text", score: 100, grade: "A", severity: "No issues found" },
];

const CLEAN = [
  {
    id: "title_language",
    label: "Title & Language",
    score: 100,
    grade: "A",
    severity: "No issues found",
  },
];

describe("ReportGradeHero — the Visual view", () => {
  it("shows the score and the letter as a matched pair", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 79, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("79");
    expect(text).toContain("/100");
    expect(text).toContain("C");
  });

  it("counts passing checks rather than showing a second figure out of 100", () => {
    // A count cannot be mistaken for a percentage grade, which is exactly how
    // the v1.58.1 "80 of 100" panel failed.
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 79, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("Fix progress");
    expect(text).toContain("1 of 2 checks passed");
  });

  it("explains why the number stalled, naming the finding that holds it", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 79, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("moderate");
    expect(text).toContain("holds the score at 79");
    expect(text).toContain("caps a document at C until it is fixed");
  });

  it("says nothing about a cap when the score was not capped", () => {
    // 71 is already below the 79 ceiling, so nothing is being held back.
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 71, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("Fix progress");
    expect(text).not.toContain("holds the score at");
    expect(text).toContain("re-upload to watch this rise");
  });

  it("says nothing about a cap for a clean document", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 100, categories: CLEAN },
    });
    const text = w.text();
    expect(text).not.toContain("holds the score at");
    expect(text).toContain("1 of 1 checks passed");
  });

  it("ignores unassessed categories in the count", () => {
    // "No images were found" is not a check that failed.
    const w = mount(ReportGradeHero, {
      props: {
        grade: "A",
        overallScore: 100,
        categories: [
          ...CLEAN,
          { id: "table_markup", label: "Tables", score: null, grade: null, severity: null },
        ],
      },
    });
    expect(w.text()).toContain("1 of 1 checks passed");
  });
});

describe("ScoreCard — the Detailed view does the same", () => {
  const result = {
    filename: "agenda.docx",
    pageCount: 1,
    overallScore: 79,
    grade: "C",
    executiveSummary: "sum",
    fileType: "docx" as const,
    categories: CAPPED,
  };

  it("shows the matched pair and the check count", () => {
    const w = mount(ScoreCard, { props: { result } });
    const text = w.text();
    expect(text).toContain("79");
    expect(text).toContain("/100");
    expect(text).toContain("1 of 2 checks passed");
    expect(text).toContain("holds the score at 79");
  });

  it("stays silent about a cap when there is none", () => {
    const w = mount(ScoreCard, { props: { result: { ...result, overallScore: 71 } } });
    expect(w.text()).not.toContain("holds the score at");
  });

  it("reads the strict profile's own categories, not the top-level ones", () => {
    // displayedProfile shows the strict profile's score, so the panel must be
    // computed from the same place — otherwise it could describe a document
    // other than the one on screen.
    const w = mount(ScoreCard, {
      props: {
        result: {
          ...result,
          overallScore: 40,
          grade: "F",
          scoreProfiles: {
            strict: {
              label: "Strict",
              overallScore: 79,
              grade: "C",
              executiveSummary: "sum",
              categories: CAPPED,
            },
          },
        },
      },
    });
    const text = w.text();
    expect(text).toContain("1 of 2 checks passed");
    expect(text).toContain("holds the score at 79");
  });
});

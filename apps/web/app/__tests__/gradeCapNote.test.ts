import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";

// The severity grade cap holds the letter at the worst finding's ceiling, so
// the letter can sit below what the average alone would give — a 87 with a
// moderate finding is a C.
//
// Unexplained, that pairing reads as a bug to exactly the audience this tool
// is written for. The whole change exists to stop the tool contradicting
// itself in front of non-technical staff, so shipping a C beside an 87 with
// no explanation would trade one contradiction for another.
//
// Both report views must carry the note, or switching views becomes its own
// inconsistency — hence one file covering both surfaces rather than two.

// Shaped to ScoreCard's `Category` (id/label/score/grade/severity) rather than
// trimmed to what the assertions read — `tsc` rejects the loose version even
// though vitest runs it happily, and the release chain gates on typecheck.
const CAPPED = [
  {
    id: "title_language",
    label: "Title & Language",
    score: 50,
    grade: "F",
    severity: "Moderate",
  },
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

describe("ReportGradeHero — the Visual view's grade note", () => {
  it("explains the gap when the letter sits below the score's own band", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 87, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("Held at C by a moderate issue");
    // Both numbers a confused reader needs: what the average alone would give,
    // and the rule that overrode it.
    expect(text).toContain("would be a B");
    expect(text).toContain("worst unresolved issue sets the grade");
  });

  it("says nothing when the score and the letter already agree", () => {
    // 71 is a C on its own; there is no gap to explain, and a note here would
    // be noise on the report's most prominent element.
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 71, categories: CAPPED },
    });
    expect(w.text()).not.toContain("Held at");
  });

  it("says nothing for a clean document", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 100, categories: CLEAN },
    });
    expect(w.text()).not.toContain("Held at");
  });

  it("still shows the grade and score themselves", () => {
    // Guard the premise: the note is additive, not a replacement for the hero.
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 87, categories: CAPPED },
    });
    expect(w.text()).toContain("C");
    expect(w.text()).toContain("87");
  });
});

describe("ScoreCard — the Detailed view carries the same note", () => {
  const result = {
    filename: "agenda.docx",
    pageCount: 1,
    overallScore: 87,
    grade: "C",
    executiveSummary: "sum",
    fileType: "docx" as const,
    categories: CAPPED,
  };

  it("explains the gap in the Detailed view too", () => {
    const w = mount(ScoreCard, { props: { result } });
    const text = w.text();
    expect(text).toContain("Held at C by a moderate issue");
    expect(text).toContain("would be a B");
  });

  it("stays silent when there is no gap", () => {
    const w = mount(ScoreCard, {
      props: { result: { ...result, overallScore: 71 } },
    });
    expect(w.text()).not.toContain("Held at");
  });

  it("reads the strict profile's own categories, not the top-level ones", () => {
    // displayedProfile shows the strict profile's grade and score, so the note
    // must be computed from the same place — otherwise it could explain a gap
    // that the displayed numbers do not have.
    const w = mount(ScoreCard, {
      props: {
        result: {
          ...result,
          overallScore: 40,
          grade: "F",
          scoreProfiles: {
            strict: {
              label: "Strict",
              overallScore: 87,
              grade: "C",
              executiveSummary: "sum",
              categories: CAPPED,
            },
          },
        },
      },
    });
    expect(w.text()).toContain("Held at C by a moderate issue");
    expect(w.text()).toContain("would be a B");
  });
});

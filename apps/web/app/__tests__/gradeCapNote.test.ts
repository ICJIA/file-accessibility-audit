import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";

// The severity grade cap holds the letter at the worst finding's ceiling, so
// the letter can sit below what the average alone would give — a 87 with a
// moderate finding is a C.
//
// The first attempt explained that in a sentence and left the raw score
// rendering at text-4xl directly beneath the grade circle. That was reported
// as MORE confusing than the problem the cap fixed: "a 'D' is not 80." The
// score is no longer presented as a peer of the letter — it sits in a
// labelled "Fix progress" panel, because progress across re-audits is the job
// it was always good at, and the letter answers a different question.
//
// Both report views must do this identically, or switching views becomes its
// own inconsistency — hence one file covering both surfaces rather than two.

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
  it("labels the score as progress rather than as the grade", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 87, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("Fix progress");
    expect(text).toContain("87 of 100");
    // The bare "87/100" beside the letter is exactly what read as a typo.
    expect(text).not.toContain("87/100");
  });

  it("reconciles the number with the letter where the number appears", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 87, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("a moderate issue is still open");
    expect(text).toContain("grade follows the worst issue rather than the average");
    // What the average alone would have given — the number's own context.
    expect(text).toContain("would be a B");
  });

  it("drops the reconciliation when the score and the letter already agree", () => {
    // 71 is a C on its own; there is nothing to reconcile, and the panel
    // should just say what it measures.
    const w = mount(ReportGradeHero, {
      props: { grade: "C", overallScore: 71, categories: CAPPED },
    });
    const text = w.text();
    expect(text).toContain("Fix progress");
    expect(text).not.toContain("is still open");
    expect(text).toContain("re-upload to watch it rise");
  });

  it("says nothing about a cap for a clean document", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 100, categories: CLEAN },
    });
    expect(w.text()).not.toContain("is still open");
  });

  it("still shows the grade and the score themselves", () => {
    // Guard the premise: demoting the score is not the same as hiding it.
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

  it("demotes and reconciles the score in the Detailed view too", () => {
    const w = mount(ScoreCard, { props: { result } });
    const text = w.text();
    expect(text).toContain("Fix progress");
    expect(text).toContain("87 of 100");
    expect(text).not.toContain("87/100");
    expect(text).toContain("a moderate issue is still open");
    expect(text).toContain("would be a B");
  });

  it("stays silent about a cap when there is no gap", () => {
    const w = mount(ScoreCard, {
      props: { result: { ...result, overallScore: 71 } },
    });
    expect(w.text()).not.toContain("is still open");
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
    expect(w.text()).toContain("87 of 100");
    expect(w.text()).toContain("a moderate issue is still open");
    expect(w.text()).toContain("would be a B");
  });
});

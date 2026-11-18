/**
 * Decision 2026-11-18: say beside the letter grade what this format's grade
 * covers, because the same content can grade differently by format (contrast
 * is scored for Word, PowerPoint and Excel, never for PDF).
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";
import { formatScopeNote } from "../utils/formatScope";

const cats = [{ id: "title_language", severity: "Minor", score: 90 }];

describe("formatScopeNote", () => {
  it("PDF: says contrast is not in the grade, and why", () => {
    expect(formatScopeNote("pdf")).toMatch(/does not include color contrast/);
  });
  it.each(["docx", "pptx"])("%s: says contrast IS in the grade and a PDF differs", (ft) => {
    const n = formatScopeNote(ft)!;
    expect(n).toMatch(/includes color contrast/);
    expect(n).toMatch(/PDF/);
  });
  it("Excel: also says the language half is not checked", () => {
    expect(formatScopeNote("xlsx")).toMatch(/no document language/);
  });
  it("old reports with no fileType are PDFs (the pre-multi-format default)", () => {
    expect(formatScopeNote(undefined)).toBe(formatScopeNote("pdf"));
  });
  it("anything else (web-page audits) gets no note", () => {
    expect(formatScopeNote("page")).toBeNull();
  });
});

describe("WIRING: the note renders under the grade in both views", () => {
  it("Visual view hero", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "B", overallScore: 85, categories: cats, fileType: "pptx" },
    });
    expect(w.find('[data-testid="format-scope-note"]').text()).toMatch(/includes color contrast/);
  });
  it("Visual view hero: no categories (a web-page audit) → no note", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "B", overallScore: 85, categories: [], fileType: "pdf" },
    });
    expect(w.find('[data-testid="format-scope-note"]').exists()).toBe(false);
  });
  it("Detailed view score card", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "a.pdf",
          pageCount: 1,
          overallScore: 85,
          grade: "B",
          executiveSummary: "",
          categories: cats as never,
          fileType: "pdf",
        },
      },
    });
    expect(w.find('[data-testid="format-scope-note"]').text()).toMatch(
      /does not include color contrast/,
    );
  });
});

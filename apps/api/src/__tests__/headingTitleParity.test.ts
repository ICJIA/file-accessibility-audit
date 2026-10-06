/**
 * ONE IS A TITLE, IN EVERY FORMAT (2026-10-05).
 *
 * A document with no heading markup at all fails WCAG 1.3.1 only if it
 * VISUALLY has section headings that the markup does not convey. One line
 * that looks like a heading is the document's title; two or more are
 * sections. PDF has applied that rule since 2026-09-02 (a one-page chart had
 * graded 69/D on page count alone). Word and PowerPoint never adopted it:
 * Word subtracted 70 for ANY fake heading in a document with no Heading
 * styles and PowerPoint 15 for any typed heading, so a memo with one bold
 * title line graded D in Word, B in PowerPoint and A as a PDF.
 *
 * This pins the shared threshold (VISUAL_HEADINGS_FOR_FAILURE) in all three:
 * below it, nothing is scored and no 1.3.1 is asserted; at it, the category
 * loses points, the verdict names 1.3.1, and — since 2026-10-05 (user
 * decision) — the category is Critical in every format: PowerPoint, which
 * capped typed headings at 40 points, now uses Word's exact formula.
 */
import { describe, it, expect } from "vitest";
import { VISUAL_HEADINGS_FOR_FAILURE } from "@file-audit/shared";
import { scoreDocument, scoreDocx, scorePptx } from "../services/scorer.js";
import type { ScoringResult } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const LINES = ["Quarterly Memo", "Findings", "Next Steps", "Budget"];

/** A PDF with no heading tags whose visual census saw `n` heading-like lines. */
function pdf(n: number): ScoringResult {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.headings = [];
  pdfjs.visualHeadingCandidateCount = n;
  pdfjs.visualHeadingSamples = LINES.slice(0, n);
  return scoreDocument(qpdf, pdfjs);
}

/** A Word document with no Heading styles and `n` bold, large, short lines. */
function docx(n: number): ScoringResult {
  const analysis: DocxAnalysis = {
    metadata: {
      title: "Quarterly Memo",
      creator: "Agency",
      language: "en-US",
      pageCount: 1,
      wordCount: 300,
    },
    headings: [],
    fakeHeadings: LINES.slice(0, n).map((text) => ({ text })),
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 6,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
  };
  return scoreDocx(analysis);
}

/** A deck with no titled slide and `n` headings typed into text boxes. */
function pptx(n: number): ScoringResult {
  const slides = Array.from({ length: Math.max(1, n) }, (_, i) => ({
    index: i + 1,
    title: null,
    titleIsFirstShape: false,
    shapeCount: 2,
  }));
  const analysis: PptxAnalysis = {
    metadata: {
      title: "Quarterly Memo",
      creator: "x",
      language: "en-US",
      slideCount: slides.length,
    },
    slides,
    fakeHeadings: LINES.slice(0, n).map((text, i) => ({ slide: i + 1, text })),
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: slides.length * 2,
  };
  return scorePptx(analysis);
}

const FORMATS = {
  pdf: { run: pdf, category: "heading_structure" },
  docx: { run: docx, category: "heading_structure" },
  pptx: { run: pptx, category: "slide_titles" },
} as const;
type Format = keyof typeof FORMATS;
const ALL = Object.keys(FORMATS) as Format[];

const verdict = (fmt: Format, n: number) => {
  const { run, category } = FORMATS[fmt];
  const r = run(n);
  const cat = r.categories.find((c) => c.id === category)!;
  const failures = r.conformance.failures.filter((f) => f.category === category);
  return { r, cat, failures };
};

describe("one is a title — the same threshold for missing heading markup in every format", () => {
  it("the threshold is two: one line is a title, two are sections", () => {
    expect(VISUAL_HEADINGS_FOR_FAILURE).toBe(2);
  });

  it.each(ALL)("%s: one heading-like line is a title — nothing scored, no 1.3.1", (fmt) => {
    const { cat, failures } = verdict(fmt, VISUAL_HEADINGS_FOR_FAILURE - 1);
    // PDF and Word report the category as not assessed; PowerPoint's
    // slide_titles category is always assessed, so it stays at 100.
    expect(cat.score === null || cat.score === 100).toBe(true);
    expect(failures).toHaveLength(0);
    expect(cat.findings.join(" ")).toMatch(/single title does not make sections/i);
  });

  it.each(ALL)("%s: two heading-like lines are sections — scored, and 1.3.1 named", (fmt) => {
    const { cat, failures } = verdict(fmt, VISUAL_HEADINGS_FOR_FAILURE);
    expect(cat.score).not.toBeNull();
    expect(cat.score!).toBeLessThan(100);
    expect(failures.some((f) => f.sc === "1.3.1")).toBe(true);
  });

  it.each(ALL)(
    "%s: at the threshold, with no heading markup at all, the category is Critical",
    (fmt) => {
      // Aligned 2026-10-05 (user decision): sections that exist only visually
      // lose the whole outline. PDF scores 0 and Word 30; PowerPoint, which
      // capped typed headings at 40 points, now uses Word's exact formula.
      const { cat } = verdict(fmt, VISUAL_HEADINGS_FOR_FAILURE);
      expect(cat.severity).toBe("Critical");
    },
  );

  it.each(ALL)(
    "%s: one title line costs nothing — the same score as no heading-like line",
    (fmt) => {
      const withTitle = verdict(fmt, VISUAL_HEADINGS_FOR_FAILURE - 1).r;
      const without = verdict(fmt, 0).r;
      expect(withTitle.overallScore).toBe(without.overallScore);
      expect(withTitle.grade).toBe(without.grade);
    },
  );
});

// HEADING-LIKE LINES BESIDE REAL HEADINGS, IN WORD AND PDF (2026-10-06, user
// decision). Word has always scored a paragraph formatted to look like a
// heading in a document that also has real Heading styles: 15 points each,
// at most 40, WCAG 1.3.1. PDF could not see the same defect — its visual
// census ran only on documents with NO heading tags — so the SFY24 and SFY25
// annual reports (3 heading tags, 70+ section headings tagged as paragraphs)
// read "Heading Structure 100 — No issues found". untaggedVisualHeadings now
// finds those lines; the same count must cost the same in both formats.
describe("heading-like lines beside real headings — the same cost in Word and PDF", () => {
  const SECTIONS = ["Mission", "Grants administration", "Research and analysis", "Memberships"];

  /** A tagged PDF with real H1/H2 tags and `n` heading-like lines tagged <P>. */
  function pdfBeside(n: number): ScoringResult {
    const { qpdf, pdfjs } = taggedBaseline();
    qpdf.headings = [
      { level: "H1", tag: "H1" },
      { level: "H2", tag: "H2" },
    ];
    pdfjs.untaggedVisualHeadingCount = n;
    pdfjs.untaggedVisualHeadingSamples = SECTIONS.slice(0, n).map((text, i) => ({
      text,
      page: i + 2,
    }));
    return scoreDocument(qpdf, pdfjs);
  }

  /** A Word document with real Heading 1/2 styles and `n` fake headings. */
  function docxBeside(n: number): ScoringResult {
    const analysis: DocxAnalysis = {
      metadata: {
        title: "Annual Report",
        creator: "Agency",
        language: "en-US",
        pageCount: 9,
        wordCount: 3000,
      },
      headings: [
        { level: 1, text: "Annual Report" },
        { level: 2, text: "Overview" },
      ],
      fakeHeadings: SECTIONS.slice(0, n).map((text) => ({ text })),
      images: [],
      tables: [],
      links: [],
      lists: { realListItems: 0, manualBulletParagraphs: 0 },
      contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
      paragraphCount: 40,
      emptyHeadingCount: 0,
      parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
    };
    return scoreDocx(analysis);
  }

  const headingScore = (r: ScoringResult) =>
    r.categories.find((c) => c.id === "heading_structure")!.score;
  const names131 = (r: ScoringResult) =>
    r.conformance.failures.some((f) => f.sc === "1.3.1" && f.category === "heading_structure");

  it.each([
    [2, 70],
    [3, 60],
    [4, 60],
  ])("%i such lines cost the same in both — heading_structure %i, 1.3.1 named", (n, expected) => {
    for (const r of [pdfBeside(n), docxBeside(n)]) {
      expect(headingScore(r)).toBe(expected);
      expect(names131(r)).toBe(true);
    }
  });

  it("the PDF finding names each line and its page", () => {
    const cat = pdfBeside(3).categories.find((c) => c.id === "heading_structure")!;
    const text = cat.findings.join("\n");
    expect(text).toMatch(/3 line\(s\) are formatted to look like headings/);
    expect(text).toMatch(/"Grants administration" \(page 3\)/);
  });

  it("none at all is the old clean result in both", () => {
    for (const r of [pdfBeside(0), docxBeside(0)]) {
      expect(headingScore(r)).toBe(100);
      expect(names131(r)).toBe(false);
    }
  });

  it("a PDF with NO heading tags is judged by the zero-tags census alone, never by this count", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    qpdf.headings = [];
    pdfjs.visualHeadingCandidateCount = 0;
    pdfjs.untaggedVisualHeadingCount = 5;
    const r = scoreDocument(qpdf, pdfjs);
    expect(headingScore(r)).not.toBe(60);
    expect(r.categories.find((c) => c.id === "heading_structure")!.findings.join(" ")).not.toMatch(
      /formatted to look like headings/,
    );
  });
});

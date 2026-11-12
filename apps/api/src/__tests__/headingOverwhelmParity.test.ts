/**
 * A FEW REAL HEADINGS DO NOT RESCUE AN UNMARKED OUTLINE (2026-11-12).
 *
 * With at least one real heading present, lines that only LOOK like headings
 * cost 15 points each, capped at 40 — so the category could never fall below
 * 60 (Moderate). A document with NO real heading and two look-alikes scored
 * Critical. The result was a cliff pointing the wrong way: two agency annual
 * reports whose only heading tags are the cover's title, tagline and web
 * address — with 75 and 66 real section headings tagged as plain paragraphs —
 * scored better than a two-page memo with no tags at all.
 *
 * Rule (user decision): when look-alike headings number at least
 * OVERWHELMED_HEADINGS_MIN and outnumber real ones by at least
 * OVERWHELMED_HEADINGS_RATIO to one, the category scores
 * OVERWHELMED_HEADINGS_SCORE — Critical, and the value Word and PowerPoint
 * already give a document whose sections exist only visually. Below that the
 * capped deduction stands. The same rule in PDF, Word and PowerPoint.
 */
import { describe, it, expect } from "vitest";
import {
  OVERWHELMED_HEADINGS_MIN,
  OVERWHELMED_HEADINGS_RATIO,
  OVERWHELMED_HEADINGS_SCORE,
  headingsOverwhelmed,
} from "@file-audit/shared";
import { scoreDocument, scoreDocx, scorePptx } from "../services/scorer.js";
import type { ScoringResult } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const line = (i: number): string => `Section heading ${i + 1}`;

/** A tagged PDF with `real` heading tags and `fake` untagged look-alike lines. */
function pdf(real: number, fake: number): ScoringResult {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.headings = Array.from({ length: real }, (_, i) => ({
    level: i === 0 ? "H1" : "H2",
    tag: i === 0 ? "H1" : "H2",
  }));
  if (real === 0) {
    // No heading tags at all: the visual-heading census is the evidence.
    pdfjs.visualHeadingCandidateCount = fake;
    pdfjs.visualHeadingSamples = Array.from({ length: Math.min(fake, 5) }, (_, i) => line(i));
  }
  pdfjs.untaggedVisualHeadingCount = fake;
  pdfjs.untaggedVisualHeadingSamples = Array.from({ length: Math.min(fake, 20) }, (_, i) => ({
    text: line(i),
    page: i + 2,
  }));
  return scoreDocument(qpdf, pdfjs);
}

/** A Word document with `real` Heading-styled paragraphs and `fake` look-alikes. */
function docx(real: number, fake: number): ScoringResult {
  const analysis: DocxAnalysis = {
    metadata: {
      title: "Annual Report",
      creator: "Agency",
      language: "en-US",
      pageCount: 30,
      wordCount: 9000,
    },
    headings: Array.from({ length: real }, (_, i) => ({
      level: i === 0 ? 1 : 2,
      text: `Real heading ${i + 1}`,
    })),
    fakeHeadings: Array.from({ length: fake }, (_, i) => ({ text: line(i) })),
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 200,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
  };
  return scoreDocx(analysis);
}

/** A deck with `real` titled slides and `fake` headings typed into text boxes. */
function pptx(real: number, fake: number): ScoringResult {
  const count = Math.max(1, real + fake);
  const slides = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    title: i < real ? `Titled slide ${i + 1}` : null,
    titleIsFirstShape: i < real,
    shapeCount: 2,
  }));
  const analysis: PptxAnalysis = {
    metadata: {
      title: "Annual Report",
      creator: "x",
      language: "en-US",
      slideCount: slides.length,
    },
    slides,
    fakeHeadings: Array.from({ length: fake }, (_, i) => ({ slide: real + i + 1, text: line(i) })),
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

const result = (fmt: Format, real: number, fake: number) => {
  const { run, category } = FORMATS[fmt];
  const r = run(real, fake);
  const cat = r.categories.find((c) => c.id === category);
  if (!cat) throw new Error(`${category} missing for ${fmt}`);
  return { r, cat, text: cat.findings.join("\n") };
};

describe("the threshold itself", () => {
  it("needs real headings, enough look-alikes, and the ratio — all three", () => {
    const min = OVERWHELMED_HEADINGS_MIN;
    const ratio = OVERWHELMED_HEADINGS_RATIO;
    expect(headingsOverwhelmed(1, min)).toBe(true);
    expect(headingsOverwhelmed(3, 3 * ratio)).toBe(true);
    // One short of the minimum count, however lopsided.
    expect(headingsOverwhelmed(1, min - 1)).toBe(false);
    // Enough look-alikes, but not ten to one.
    expect(headingsOverwhelmed(3, 3 * ratio - 1)).toBe(false);
    // No real heading at all is the OTHER rule's case (VISUAL_HEADINGS_FOR_FAILURE).
    expect(headingsOverwhelmed(0, 50)).toBe(false);
  });

  it("scores in the Critical band", () => {
    expect(OVERWHELMED_HEADINGS_SCORE).toBeLessThan(40);
  });
});

describe.each(ALL)("%s — look-alike headings beside real ones", (fmt) => {
  it("a cover's three headings and seventy-five unmarked sections is Critical", () => {
    const { r, cat, text } = result(fmt, 3, 75);
    expect(cat.score).toBe(OVERWHELMED_HEADINGS_SCORE);
    expect(cat.severity).toBe("Critical");
    expect(text).toMatch(/75/);
    expect(text).toMatch(/only 3/i);
    // The verdict already named 1.3.1 for this; it still does.
    expect(r.conformance.failures.some((f) => f.sc === "1.3.1")).toBe(true);
    expect(r.grade).toBe("D");
  });

  it("the same document one look-alike short of ten to one keeps the capped deduction", () => {
    const { cat } = result(fmt, 3, 29);
    expect(cat.score).toBe(60);
    expect(cat.severity).toBe("Moderate");
  });

  it("nine look-alikes beside one real heading is below the minimum count", () => {
    const { cat } = result(fmt, 1, OVERWHELMED_HEADINGS_MIN - 1);
    expect(cat.score).toBe(60);
  });

  it("a well-headed document with a few strays is untouched", () => {
    const { cat } = result(fmt, 96, 17);
    expect(cat.score).toBe(60);
    const one = result(fmt, 12, 1);
    expect(one.cat.score).toBe(85);
  });

  it("never scores better than the same look-alikes with no real heading at all", () => {
    const some = result(fmt, 1, 40).cat.score ?? 100;
    const none = result(fmt, 0, 40).cat.score ?? 100;
    expect(none).toBeLessThanOrEqual(some);
    expect(some).toBeLessThan(40);
  });
});

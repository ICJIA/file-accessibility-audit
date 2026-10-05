/**
 * ONE RATIO, ONE SCORE, IN EVERY FORMAT (2026-10-05).
 *
 * Alt text and link names are scored as the share of items that pass. PDF
 * floored that share (never rounding a failing document UP into a better
 * band, and never up to 100). Word, PowerPoint and Excel rounded it and then
 * capped any failing category at 85 — a "cross-format convention" (v1.36.0,
 * before the severity cap existed) that PDF never adopted. At band edges the
 * two disagreed on the letter: 16 of 23 images described was 69 (Moderate,
 * C ceiling) as a PDF and 70 (Minor, B ceiling) as a Word file. Now one rule:
 * shareScore(passed, total) = floor(passed / total × 100).
 *
 * Proportional scoring itself is deliberate and unchanged (user decision,
 * 2026-10-05): one undescribed image out of one loses all the visual
 * information; one out of ten loses a tenth.
 */
import { describe, it, expect } from "vitest";
import { shareScore } from "@file-audit/shared";
import { scoreDocument, scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import type { ScoringResult } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const image = (described: boolean) => ({
  altText: described ? "A chart of enrollment by county" : null,
  decorative: false,
  titleOnly: false,
});
const images = (described: number, total: number) =>
  Array.from({ length: total }, (_, i) => image(i < described));

function pdfAlt(described: number, total: number): ScoringResult {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.images = Array.from({ length: total }, (_, i) => ({
    ref: `${10 + i} 0 R`,
    hasAlt: i < described,
    ...(i < described ? { altText: "A chart of enrollment by county" } : {}),
  }));
  qpdf.imageObjectCount = total;
  pdfjs.imageCount = total;
  return scoreDocument(qpdf, pdfjs);
}

function docxAlt(described: number, total: number): ScoringResult {
  const analysis: DocxAnalysis = {
    metadata: { title: "Report", creator: "x", language: "en-US", pageCount: 2, wordCount: 500 },
    headings: [
      { level: 1, text: "Introduction" },
      { level: 2, text: "Details" },
    ],
    fakeHeadings: [],
    images: images(described, total),
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

function pptxAlt(described: number, total: number): ScoringResult {
  const analysis: PptxAnalysis = {
    metadata: { title: "Deck", creator: "x", language: "en-US", slideCount: 2 },
    slides: [
      { index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: "Agenda", titleIsFirstShape: true, shapeCount: 3 },
    ],
    fakeHeadings: [],
    images: images(described, total),
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
  };
  return scorePptx(analysis);
}

function xlsxAlt(described: number, total: number): ScoringResult {
  const analysis: XlsxAnalysis = {
    metadata: { title: "Ledger", creator: "x", sheetCount: 1 },
    sheets: [
      {
        name: "FY26 Grants",
        hidden: false,
        defaultNamed: false,
        mergedRangeCount: 0,
        usedRangeCellCount: 80,
        hasDefinedTable: true,
      },
    ],
    tables: [{ sheetName: "FY26 Grants", name: "Grants", hasHeaderRow: true }],
    images: images(described, total),
    links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    totalCellsWithValue: 40,
    textBoxCount: 0,
  };
  return scoreXlsx(analysis);
}

const ALT = { pdf: pdfAlt, docx: docxAlt, pptx: pptxAlt, xlsx: xlsxAlt } as const;
type Format = keyof typeof ALT;
const ALL = Object.keys(ALT) as Format[];
const altScore = (fmt: Format, d: number, t: number) =>
  ALT[fmt](d, t).categories.find((c) => c.id === "alt_text")!.score;

describe("shareScore — the one rule", () => {
  it("floors the passing share, so a failing category never rounds up", () => {
    expect(shareScore(16, 23)).toBe(69); // 69.57 — rounding would make it 70 (Minor)
    expect(shareScore(199, 200)).toBe(99); // rounding would make it 100 (silent)
    expect(shareScore(9, 10)).toBe(90);
    expect(shareScore(0, 3)).toBe(0);
    expect(shareScore(3, 3)).toBe(100);
  });
});

describe("ratio parity — the same share of described images scores the same in every format", () => {
  it.each(ALL)("%s: 16 of 23 described is 69 — Moderate, at the band edge", (fmt) => {
    expect(altScore(fmt, 16, 23)).toBe(69);
  });
  it.each(ALL)("%s: 9 of 10 described is 90 — not capped to 85", (fmt) => {
    expect(altScore(fmt, 9, 10)).toBe(90);
  });
  it.each(ALL)("%s: none of 2 described is 0", (fmt) => {
    expect(altScore(fmt, 0, 2)).toBe(0);
  });
});

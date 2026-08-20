/**
 * The reading-order card names the pages that drifted.
 *
 * "6 page(s) had noticeable drift" gave an author nothing to open. On the
 * document that prompted this (FFY24 SCIP Plan, 2026-08-20) the six pages
 * were real defects — Word had tagged a chart's data labels ahead of the
 * page's first heading — but nobody could find them from the report.
 */
import { describe, it, expect } from "vitest";
import { computeReadingOrderFidelity } from "@file-audit/analyzer/scoring/readingOrderFidelity";
import { scoreDocument } from "../services/scorer.js";
import { makeQpdf, makePdfjs } from "./helpers/mockResults.js";

const inOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const reversed = [...inOrder].reverse();
const swapped = [0, 2, 1, 3, 5, 4, 6, 7, 8, 9];

function build(structByPage: Record<number, number[]>, streamByPage: Record<number, number[]>) {
  const pages = Object.keys(structByPage).length;
  const qpdf = makeQpdf({
    hasStructTree: true,
    structTreeDepth: 3,
    contentOrder: inOrder,
    totalPageCount: pages,
    tabOrderPages: pages,
    paragraphCount: 10,
    structTreeMcidsByPage: structByPage,
  });
  const pdfjs = makePdfjs({
    pageCount: pages,
    hasText: true,
    textLength: 500,
    contentStreamMcidsByPage: streamByPage,
  });
  return { qpdf, pdfjs };
}

describe("computeReadingOrderFidelity — driftPages", () => {
  it("lists each page under 80% agreement with its page number and rounded match", () => {
    const { qpdf, pdfjs } = build(
      { 1: inOrder, 2: inOrder, 3: inOrder },
      { 1: inOrder, 2: reversed, 3: swapped },
    );
    const f = computeReadingOrderFidelity(qpdf, pdfjs);
    expect(f.pagesWithDrift).toBe(1);
    expect(f.driftPages).toEqual([{ page: 2, similarityPct: 10 }]);
  });

  it("is empty when no page drifts", () => {
    const { qpdf, pdfjs } = build({ 1: inOrder }, { 1: inOrder });
    expect(computeReadingOrderFidelity(qpdf, pdfjs).driftPages).toEqual([]);
  });
});

describe("reading_order card — drift pages are named", () => {
  it("names the drifting pages with their match percentage", () => {
    const { qpdf, pdfjs } = build(
      { 1: inOrder, 2: inOrder, 3: inOrder, 4: inOrder },
      { 1: inOrder, 2: reversed, 3: inOrder, 4: reversed },
    );
    const cat = scoreDocument(qpdf, pdfjs).categories.find((c) => c.id === "reading_order")!;
    const line = cat.findings.find((f) => /noticeable drift/.test(f));
    expect(line).toBeDefined();
    expect(line).toMatch(
      /2 page\(s\) had noticeable drift \(< 80% match\): page 2 \(10%\), page 4 \(10%\)/,
    );
  });

  it("caps the list at 12 pages and says how many more there are", () => {
    const structByPage: Record<number, number[]> = {};
    const streamByPage: Record<number, number[]> = {};
    for (let p = 1; p <= 15; p++) {
      structByPage[p] = inOrder;
      streamByPage[p] = reversed;
    }
    const { qpdf, pdfjs } = build(structByPage, streamByPage);
    const cat = scoreDocument(qpdf, pdfjs).categories.find((c) => c.id === "reading_order")!;
    const line = cat.findings.find((f) => /noticeable drift/.test(f))!;
    expect(line).toContain("page 12 (10%)");
    expect(line).not.toContain("page 13");
    expect(line).toMatch(/and 3 more/);
  });
});

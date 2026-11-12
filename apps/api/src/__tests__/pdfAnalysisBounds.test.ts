/**
 * Three bounds on the PDF analysis path (2026-11-12 review).
 *
 *  1. The wait line for an analysis slot is bounded. Every waiter already
 *     holds its upload in memory, so an unbounded line was an unbounded
 *     memory commitment — and the config comment had always promised a 503
 *     "if the queue is also full".
 *  2. The pdfjs timeout STOPS the work. pdfjs runs in this process; ceasing
 *     to await it left a pathological file parsing on with its slot already
 *     handed to the next request.
 *  3. A scanned page inside a text document is named, not just implied by
 *     an alt-text count.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYSIS } from "#config";
import { acquireSemaphore, releaseSemaphore } from "../services/pdfAnalyzer.js";
import { analyzeWithPdfjs } from "../services/pdfjsService.js";
import { scoreDocument } from "../services/scorer.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const control = (name: string): Buffer =>
  readFileSync(resolve(import.meta.dirname, "../../../../controls", name));

// One of the control documents that IS committed (controls/ is otherwise
// git-ignored, so CI has only the tracked ones): a 38-page tagged report
// whose cover is a full page of text saved as a single picture.
const TRACKED_REPORT = "2022_DVFR_Annual_Report_Final_a688e16b10_a00d65b63f.pdf";

describe("analysis wait line", () => {
  it("refuses at once, with a 503, when the line is already full", async () => {
    const held: Array<Promise<void>> = [];
    for (let i = 0; i < ANALYSIS.MAX_CONCURRENT_ANALYSES; i++) await acquireSemaphore();
    // Fill the line. These stay pending until a slot is released below.
    for (let i = 0; i < ANALYSIS.MAX_QUEUED_ANALYSES; i++) held.push(acquireSemaphore());

    const started = Date.now();
    await expect(acquireSemaphore()).rejects.toMatchObject({ status: 503 });
    expect(Date.now() - started).toBeLessThan(1000);

    // Drain: each release hands its slot to the next waiter in line.
    for (const waiter of held) {
      releaseSemaphore();
      await waiter;
    }
    for (let i = 0; i < ANALYSIS.MAX_CONCURRENT_ANALYSES; i++) releaseSemaphore();

    // And the semaphore is usable again afterwards.
    await acquireSemaphore();
    releaseSemaphore();
  });
});

describe("pdfjs extraction honours its abort signal", () => {
  it("stops instead of reading the document when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await analyzeWithPdfjs(control(TRACKED_REPORT), { signal: ac.signal });
    expect(result.error).toBeTruthy();
    expect(result.textLength).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it("stops part-way when aborted during the run", async () => {
    // A signal that turns aborted after a fixed number of checks, so the
    // abort lands at a page boundary inside the run every time. (A timer
    // raced the parse and lost about half the time under a loaded suite.)
    let checks = 0;
    const signal = {
      get aborted() {
        return ++checks > 3;
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal;
    const result = await analyzeWithPdfjs(control(TRACKED_REPORT), { signal });
    expect(checks).toBeGreaterThan(3);
    expect(result.error).toBeTruthy();
  });

  it("is unchanged without a signal", async () => {
    const result = await analyzeWithPdfjs(control(TRACKED_REPORT));
    expect(result.error).toBeNull();
    expect(result.pageCount).toBeGreaterThan(0);
  });
});

describe("scanned pages inside a text document", () => {
  it("records the picture-only cover of a real report, and only that page", async () => {
    const result = await analyzeWithPdfjs(control(TRACKED_REPORT));
    expect(result.imageOnlyPages).toEqual([1]);
  });

  const textFindings = (pages: number[] | undefined, hasText = true): string => {
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.emptyPages = pages ?? [];
    pdfjs.imageOnlyPages = pages;
    pdfjs.hasText = hasText;
    const cat = scoreDocument(qpdf, pdfjs).categories.find((c) => c.id === "text_extractability");
    return (cat?.findings ?? []).join("\n");
  };

  it("names the pages and gives the OCR route", () => {
    const text = textFindings([2, 3, 7]);
    expect(text).toMatch(/3 page\(s\) have no text and are filled by an image \(pages 2, 3, 7\)/);
    expect(text).toMatch(/Scan & OCR/);
  });

  it("does not move the score, and says so", () => {
    const base = taggedBaseline();
    const before = scoreDocument(base.qpdf, base.pdfjs);
    const { qpdf, pdfjs } = taggedBaseline();
    pdfjs.emptyPages = [2];
    pdfjs.imageOnlyPages = [2];
    const after = scoreDocument(qpdf, pdfjs);
    expect(after.overallScore).toBe(before.overallScore);
    const cat = after.categories.find((c) => c.id === "text_extractability")!;
    expect(cat.findings.join("\n")).toMatch(/not scored/);
    if (cat.score === 100) expect(cat.severity).toBe("No scored issues");
  });

  it("stays silent with no such pages, and on results that predate the census", () => {
    expect(textFindings([])).not.toMatch(/filled by an image/);
    expect(textFindings(undefined)).not.toMatch(/filled by an image/);
  });
});

import type { PdfMetadata } from "./pdfjsService.js";
import type { ScoringResult } from "./scorer.js";
import { runPdfInWorker } from "./pdfRunner.js";
import type { DocxMetadata } from "./docxService.js";
import type { PptxMetadata } from "./pptxService.js";
import type { XlsxMetadata } from "./xlsxService.js";
import type { PdfUaVerdict } from "@file-audit/shared";
import { ANALYSIS } from "#config";

// Simple semaphore for concurrency limiting with timeout
const SEMAPHORE_TIMEOUT_MS = 60_000; // 60 seconds max wait
let activeAnalyses = 0;
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

// Exported so the DOCX pipeline (services/analyzer.ts) shares the SAME
// concurrency budget as PDF — total in-flight analyses across both formats are
// bounded by ANALYSIS.MAX_CONCURRENT_ANALYSES, protecting the process memory.
export async function acquireSemaphore(): Promise<void> {
  if (activeAnalyses < ANALYSIS.MAX_CONCURRENT_ANALYSES) {
    activeAnalyses++;
    return;
  }
  // The line itself is bounded (2026-11-12). Every waiter already holds its
  // upload in memory, so an unbounded line was an unbounded memory commitment;
  // refusing at once is also kinder than a 60-second wait that ends in the
  // same 503.
  if (waitQueue.length >= ANALYSIS.MAX_QUEUED_ANALYSES) {
    throw Object.assign(
      new Error("Server busy — too many analyses queued. Please try again shortly."),
      { status: 503 },
    );
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject };
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry);
      if (idx >= 0) waitQueue.splice(idx, 1);
      reject(
        Object.assign(
          new Error("Server busy — too many analyses queued. Please try again shortly."),
          { status: 503 },
        ),
      );
    }, SEMAPHORE_TIMEOUT_MS);
    entry.resolve = () => {
      clearTimeout(timer);
      resolve();
    };
    waitQueue.push(entry);
  });
}

export function releaseSemaphore(): void {
  activeAnalyses--;
  const next = waitQueue.shift();
  if (next) {
    activeAnalyses++;
    next.resolve();
  }
}

export interface AnalysisResult extends ScoringResult {
  filename: string;
  pageCount: number;
  fileType: "pdf" | "docx" | "pptx" | "xlsx";
  /** PDF metadata — present only for PDF results. */
  pdfMetadata?: PdfMetadata;
  /** Word metadata — present only for DOCX results. */
  docxMetadata?: DocxMetadata;
  /** PowerPoint metadata — present only for PPTX results. */
  pptxMetadata?: PptxMetadata;
  /** Excel metadata — present only for XLSX results. */
  xlsxMetadata?: XlsxMetadata;
  /** PDF/UA-1 machine-check verdict (veraPDF). PDF results only. Attached by
   *  routes/analyze.ts even when veraPDF did not run (available:false, since
   *  v1.91.0) so the report can disclose the gap; absent on non-PDF results. */
  pdfUaVerdict?: PdfUaVerdict;
  /** veraPDF's machine-testable WCAG 2.2 second opinion (v1.97.0), attached
   *  by routes/analyze.ts. Absent on non-PDF results, on results predating
   *  the feature, and when VERAPDF_WCAG_ENABLED=false (an absent key renders
   *  nothing — never a false "Did not run"). Never read by the scorer. */
  wcagVerdict?: PdfUaVerdict;
}

// Kept exported from here: callers and tests have always imported it from
// this module. It lives beside the pipeline it serves now (pdfWorker.ts).
export { withTimeout } from "./pdfWorker.js";

/**
 * Audit one PDF.
 *
 * The parsing does NOT happen in this process (since 2026-11-25): it runs in
 * a child that is killed when its time or memory runs out — see pdfWorker.ts
 * for the measurements behind that. What stays here is the concurrency slot,
 * which bounds how many of those children exist at once.
 */
export async function analyzePDF(buffer: Buffer, filename: string): Promise<AnalysisResult> {
  await acquireSemaphore();

  try {
    const result = await runPdfInWorker(buffer);
    return {
      filename,
      pageCount: result.pageCount,
      fileType: "pdf",
      pdfMetadata: result.metadata,
      ...result.scoring,
    };
  } finally {
    releaseSemaphore();
  }
}

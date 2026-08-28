import { analyzeWithQpdfAsync } from "./qpdfService.js";
import { analyzeWithPdfjs, PdfMetadata } from "./pdfjsService.js";
import { scoreDocument, ScoringResult } from "./scorer.js";
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

/**
 * Reject if `promise` doesn't settle within `ms`. The rejection carries
 * `killed: true` and `code: 'ETIMEDOUT'` so the analyze routes map it to a
 * 504 the same way a QPDF timeout is handled. The underlying in-process work
 * may linger briefly, but the caller stops awaiting it and frees its slot.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(label) as Error & {
        killed?: boolean;
        code?: string;
      };
      err.killed = true;
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function analyzePDF(buffer: Buffer, filename: string): Promise<AnalysisResult> {
  await acquireSemaphore();

  try {
    // QPDF FIRST, to completion — then pdfjs. These two used to share one
    // `Promise.all`, and that overlap was a trap rather than a saving: pdfjs
    // runs IN-PROCESS, so Node only drains QPDF's multi-megabyte JSON off its
    // stdout pipe between pdfjs page chunks. QPDF would sit blocked on a full
    // pipe while its own subprocess timeout ran, which made QPDF_TIMEOUT_MS
    // measure the whole audit's wall clock instead of QPDF's own work. On the
    // production droplet a 246-page report measured 1.7s for QPDF alone but
    // 15.7s beside pdfjs, and with the two veraPDF JVMs also competing for the
    // two cores QPDF was killed at 30s — reported to the author as "this file
    // is too complex", which it was not (v1.109.0).
    //
    // Sequencing costs almost nothing, because the overlap was never real on
    // the documents that matter: 15.7s concurrent vs 1.7 + 14.2 sequential.
    // What it buys is a timeout that means what it says.
    const qpdfResult = await analyzeWithQpdfAsync(buffer);
    // pdfjs is in-process, so a pathological PDF (millions of operators, huge
    // page count) would otherwise pin this concurrency slot indefinitely. On
    // timeout we reject with a killed-style error so the route maps it to a
    // 504, and the `finally` below releases the semaphore slot.
    const pdfjsResult = await withTimeout(
      analyzeWithPdfjs(buffer),
      ANALYSIS.PDFJS_TIMEOUT_MS,
      "pdfjs extraction timed out",
    );

    if (qpdfResult.error && pdfjsResult.error) {
      const error = new Error("PDF parsing failed") as Error & {
        code?: string;
      };
      error.code = "PDF_PARSE_FAILED";
      throw error;
    }

    // Score the document
    const scoringResult = scoreDocument(qpdfResult, pdfjsResult);

    return {
      filename,
      pageCount: pdfjsResult.pageCount,
      fileType: "pdf",
      pdfMetadata: pdfjsResult.metadata,
      ...scoringResult,
    };
  } finally {
    releaseSemaphore();
  }
}

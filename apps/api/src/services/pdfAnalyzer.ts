import { analyzeWithQpdfAsync } from "./qpdfService.js";
import { analyzeWithPdfjs, PdfMetadata } from "./pdfjsService.js";
import { scoreDocument, ScoringResult } from "./scorer.js";
import type { DocxMetadata } from "./docxService.js";
import { ANALYSIS } from "#config";

// Simple semaphore for concurrency limiting with timeout
const SEMAPHORE_TIMEOUT_MS = 60_000; // 60 seconds max wait
let activeAnalyses = 0;
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> =
  [];

async function acquireSemaphore(): Promise<void> {
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
          new Error(
            "Server busy — too many analyses queued. Please try again shortly.",
          ),
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

function releaseSemaphore(): void {
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
  fileType: "pdf" | "docx";
  /** PDF metadata — present only for PDF results. */
  pdfMetadata?: PdfMetadata;
  /** Word metadata — present only for DOCX results. */
  docxMetadata?: DocxMetadata;
}

/**
 * Reject if `promise` doesn't settle within `ms`. The rejection carries
 * `killed: true` and `code: 'ETIMEDOUT'` so the analyze routes map it to a
 * 504 the same way a QPDF timeout is handled. The underlying in-process work
 * may linger briefly, but the caller stops awaiting it and frees its slot.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

export async function analyzePDF(
  buffer: Buffer,
  filename: string,
): Promise<AnalysisResult> {
  await acquireSemaphore();

  try {
    // Run QPDF and pdfjs-dist in parallel. QPDF self-bounds via its
    // subprocess timeout; pdfjs runs in-process, so wrap it in a wall-clock
    // timeout — otherwise a pathological PDF (millions of operators, huge
    // page count) pins this concurrency slot indefinitely. On timeout we
    // reject with a killed-style error so the route maps it to HTTP 504,
    // and the `finally` below releases the semaphore slot.
    const [qpdfResult, pdfjsResult] = await Promise.all([
      analyzeWithQpdfAsync(buffer),
      withTimeout(
        analyzeWithPdfjs(buffer),
        ANALYSIS.PDFJS_TIMEOUT_MS,
        "pdfjs extraction timed out",
      ),
    ]);

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

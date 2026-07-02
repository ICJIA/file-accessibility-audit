/**
 * File-type dispatcher. Detects PDF vs DOCX vs PPTX from the buffer's
 * *content* (magic bytes + package inspection — never the filename
 * extension) and routes to the matching pipeline. The PDF pipeline
 * (analyzePDF) is unchanged; DOCX goes to analyzeDocx + scoreDocx; PPTX goes
 * to analyzePptx + scorePptx. All return the shared AnalysisResult, so
 * routes, the CLI, and the frontend treat the formats uniformly.
 */
import JSZip from "jszip";
import {
  analyzePDF,
  acquireSemaphore,
  releaseSemaphore,
  withTimeout,
  type AnalysisResult,
} from "./pdfAnalyzer.js";
import { analyzeDocx, readCapped } from "./docxService.js";
import { analyzePptx } from "./pptxService.js";
import { scoreDocx, scorePptx } from "./scorer.js";
import { DOCX, PPTX } from "#config";

export type DetectedFileType = "pdf" | "docx" | "pptx" | "xlsx";

/** True if the buffer starts with the ZIP local-file-header signature. */
function isZip(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 && // P
    buffer[1] === 0x4b && // K
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * Classify a buffer by its content: "pdf", "docx", "pptx", or null (unknown /
 * unsupported). DOCX detection unzips and confirms WordprocessingML content
 * and PPTX confirms PresentationML content, so a renamed .xlsx / .pptx /
 * .docx / .zip is never misread as the wrong package type.
 */
export async function detectFileType(
  buffer: Buffer,
): Promise<DetectedFileType | null> {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";

  if (isZip(buffer)) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const ctEntry = zip.file("[Content_Types].xml");
      if (!ctEntry) return null;
      // Cap the content-types read too — a bomb could hide here to OOM during
      // detection, before analyzeDocx's own caps ever run.
      let contentTypes: string;
      try {
        contentTypes = await readCapped(
          ctEntry,
          DOCX.MAX_UNCOMPRESSED_BYTES,
          "[Content_Types].xml",
        );
      } catch {
        return null; // unreadable / oversized → not a valid Word package
      }
      if (
        contentTypes.includes("wordprocessingml.document") &&
        zip.file("word/document.xml")
      ) {
        return "docx";
      }
      if (
        contentTypes.includes("presentationml.presentation") &&
        zip.file("ppt/presentation.xml")
      ) {
        return "pptx";
      }
    } catch {
      // Not a readable ZIP — fall through to unsupported.
    }
  }
  return null;
}

/** Error for unsupported file types or a disabled DOCX/PPTX pipeline. */
export class FileTypeError extends Error {
  code:
    | "UNSUPPORTED_FILE_TYPE"
    | "DOCX_DISABLED"
    | "PPTX_DISABLED"
    | "XLSX_DISABLED";
  constructor(
    code:
      | "UNSUPPORTED_FILE_TYPE"
      | "DOCX_DISABLED"
      | "PPTX_DISABLED"
      | "XLSX_DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "FileTypeError";
    this.code = code;
  }
}

/**
 * Analyze an uploaded document. Detects the type from content and dispatches:
 * PDF → the existing analyzePDF pipeline; DOCX → analyzeDocx + scoreDocx;
 * PPTX → analyzePptx + scorePptx. Throws FileTypeError for unsupported types,
 * or when DOCX/PPTX auditing is disabled via DOCX.ENABLED / PPTX.ENABLED
 * (DOCX_ENABLED=false / PPTX_ENABLED=false). analyzeDocx may throw
 * DocxParseError for a corrupt package.
 */
export async function analyzeDocument(
  buffer: Buffer,
  filename: string,
): Promise<AnalysisResult> {
  const type = await detectFileType(buffer);

  if (type === "pdf") return analyzePDF(buffer, filename);

  if (type === "docx") {
    if (!DOCX.ENABLED) {
      throw new FileTypeError(
        "DOCX_DISABLED",
        "Word (.docx) auditing is currently disabled on this server.",
      );
    }
    // Share the PDF pipeline's concurrency budget and add a wall-clock timeout,
    // so a malicious/pathological .docx can't exhaust memory or pin the box.
    // Route error handling already maps 503 (semaphore full) and 504 (timeout).
    await acquireSemaphore();
    try {
      const analysis = await withTimeout(
        analyzeDocx(buffer),
        DOCX.ANALYSIS_TIMEOUT_MS,
        "docx analysis timed out",
      );
      const scoring = scoreDocx(analysis);
      return {
        filename,
        pageCount: analysis.metadata.pageCount ?? 0,
        fileType: "docx",
        docxMetadata: analysis.metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }

  if (type === "pptx") {
    if (!PPTX.ENABLED) {
      throw new FileTypeError(
        "PPTX_DISABLED",
        "PowerPoint (.pptx) auditing is currently disabled on this server.",
      );
    }
    // Same shared concurrency budget + wall-clock timeout as PDF/DOCX above.
    await acquireSemaphore();
    try {
      const analysis = await withTimeout(
        analyzePptx(buffer),
        PPTX.ANALYSIS_TIMEOUT_MS,
        "pptx analysis timed out",
      );
      const scoring = scorePptx(analysis);
      return {
        filename,
        pageCount: analysis.metadata.slideCount,
        fileType: "pptx",
        pptxMetadata: analysis.metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }

  throw new FileTypeError(
    "UNSUPPORTED_FILE_TYPE",
    "This file is not a supported document (PDF, Word .docx, or PowerPoint .pptx).",
  );
}

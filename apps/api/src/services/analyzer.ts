/**
 * File-type dispatcher. Detects PDF vs DOCX vs PPTX vs XLSX from the buffer's
 * *content* (magic bytes + package inspection — never the filename
 * extension) and routes to the matching pipeline. The PDF pipeline
 * (analyzePDF) is unchanged; DOCX goes to analyzeDocx + scoreDocx; PPTX goes
 * to analyzePptx + scorePptx; XLSX goes to analyzeXlsx + scoreXlsx. All
 * return the shared AnalysisResult, so routes, the CLI, and the frontend
 * treat the formats uniformly.
 */
import JSZip from "jszip";
import {
  analyzePDF,
  acquireSemaphore,
  releaseSemaphore,
  type AnalysisResult,
} from "./pdfAnalyzer.js";
import { readCapped } from "./docxService.js";
import { runOoxmlInWorker } from "./ooxmlRunner.js";
import { DOCX, PPTX, XLSX } from "#config";

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
 * Classify a buffer by its content: "pdf", "docx", "pptx", "xlsx", or null
 * (unknown / unsupported). DOCX detection unzips and confirms
 * WordprocessingML content, PPTX confirms PresentationML content, and XLSX
 * confirms SpreadsheetML content, so a renamed Office file is never misread
 * as the wrong package type.
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
      if (
        contentTypes.includes("spreadsheetml.sheet") &&
        zip.file("xl/workbook.xml")
      ) {
        return "xlsx";
      }
    } catch {
      // Not a readable ZIP — fall through to unsupported.
    }
  }
  return null;
}

/** Error for unsupported file types or a disabled DOCX/PPTX/XLSX pipeline. */
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
 * PPTX → analyzePptx + scorePptx; XLSX → analyzeXlsx + scoreXlsx. Throws
 * FileTypeError for unsupported types, or when DOCX/PPTX/XLSX auditing is
 * disabled via DOCX.ENABLED / PPTX.ENABLED / XLSX.ENABLED (DOCX_ENABLED=false
 * / PPTX_ENABLED=false / XLSX_ENABLED=false). analyzeDocx may throw
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
    // The analyze+score work runs in a dedicated child process (see
    // ooxmlRunner.ts) so the timeout can genuinely SIGKILL a runaway
    // synchronous analysis instead of merely abandoning it — releaseSemaphore
    // below only fires once the child has truly replied or been killed, so a
    // timed-out analysis can't keep burning CPU while its concurrency slot is
    // already free for the next request. Route error handling already maps
    // 503 (semaphore full) and 504 (timeout).
    await acquireSemaphore();
    try {
      const { pageCount, metadata, scoring } = await runOoxmlInWorker(
        "docx",
        buffer,
        DOCX.ANALYSIS_TIMEOUT_MS,
      );
      return {
        filename,
        pageCount,
        fileType: "docx",
        docxMetadata: metadata,
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
    // Same shared concurrency budget + child-process-enforced wall-clock
    // timeout as DOCX above.
    await acquireSemaphore();
    try {
      const { pageCount, metadata, scoring } = await runOoxmlInWorker(
        "pptx",
        buffer,
        PPTX.ANALYSIS_TIMEOUT_MS,
      );
      return {
        filename,
        pageCount,
        fileType: "pptx",
        pptxMetadata: metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }

  if (type === "xlsx") {
    if (!XLSX.ENABLED) {
      throw new FileTypeError(
        "XLSX_DISABLED",
        "Excel (.xlsx) auditing is currently disabled on this server.",
      );
    }
    // Same shared concurrency budget + child-process-enforced wall-clock
    // timeout as DOCX/PPTX above.
    await acquireSemaphore();
    try {
      const { pageCount, metadata, scoring } = await runOoxmlInWorker(
        "xlsx",
        buffer,
        XLSX.ANALYSIS_TIMEOUT_MS,
      );
      return {
        filename,
        pageCount,
        fileType: "xlsx",
        xlsxMetadata: metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }

  throw new FileTypeError(
    "UNSUPPORTED_FILE_TYPE",
    "This file is not a supported document (PDF, Word .docx, PowerPoint .pptx, or Excel .xlsx).",
  );
}

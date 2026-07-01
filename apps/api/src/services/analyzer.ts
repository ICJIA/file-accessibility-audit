/**
 * File-type dispatcher. Detects PDF vs DOCX from the buffer's *content* (magic
 * bytes + package inspection — never the filename extension) and routes to the
 * matching pipeline. The PDF pipeline (analyzePDF) is unchanged; DOCX goes to
 * analyzeDocx + scoreDocx. Both return the shared AnalysisResult, so routes,
 * the CLI, and the frontend treat the two formats uniformly.
 */
import JSZip from "jszip";
import { analyzePDF, type AnalysisResult } from "./pdfAnalyzer.js";
import { analyzeDocx } from "./docxService.js";
import { scoreDocx } from "./scorer.js";
import { DOCX } from "#config";

export type DetectedFileType = "pdf" | "docx";

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
 * Classify a buffer by its content: "pdf", "docx", or null (unknown /
 * unsupported). DOCX detection unzips and confirms WordprocessingML content,
 * so a renamed .xlsx / .pptx / .zip is never misread as a Word document.
 */
export async function detectFileType(
  buffer: Buffer,
): Promise<DetectedFileType | null> {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";

  if (isZip(buffer)) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const contentTypes = await zip
        .file("[Content_Types].xml")
        ?.async("string");
      if (
        contentTypes &&
        contentTypes.includes("wordprocessingml.document") &&
        zip.file("word/document.xml")
      ) {
        return "docx";
      }
    } catch {
      // Not a readable ZIP — fall through to unsupported.
    }
  }
  return null;
}

/** Error for unsupported file types or a disabled DOCX pipeline. */
export class FileTypeError extends Error {
  code: "UNSUPPORTED_FILE_TYPE" | "DOCX_DISABLED";
  constructor(
    code: "UNSUPPORTED_FILE_TYPE" | "DOCX_DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "FileTypeError";
    this.code = code;
  }
}

/**
 * Analyze an uploaded document. Detects the type from content and dispatches:
 * PDF → the existing analyzePDF pipeline; DOCX → analyzeDocx + scoreDocx.
 * Throws FileTypeError for unsupported types, or when DOCX auditing is disabled
 * via DOCX.ENABLED (DOCX_ENABLED=false). analyzeDocx may throw DocxParseError
 * for a corrupt package.
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
    const analysis = await analyzeDocx(buffer);
    const scoring = scoreDocx(analysis);
    return {
      filename,
      pageCount: analysis.metadata.pageCount ?? 0,
      fileType: "docx",
      docxMetadata: analysis.metadata,
      ...scoring,
    };
  }

  throw new FileTypeError(
    "UNSUPPORTED_FILE_TYPE",
    "This file is neither a PDF nor a Word (.docx) document.",
  );
}

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
import { assertZipWithinLimits } from "./ooxml.js";
import { DOCX, PPTX, XLSX, OOXML } from "#config";

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
export async function detectFileType(buffer: Buffer): Promise<DetectedFileType | null> {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";

  if (isZip(buffer)) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      // Same aggregate zip-package limits the docx/pptx/xlsx extractors
      // enforce (see OOXML in #config), applied here too: this detection
      // pass runs in the PARENT process, ungated by the analysis
      // concurrency semaphore (that's only acquired after a type is
      // known), so an abusive zip should fail fast here rather than
      // costing detection-time CPU/memory on every upload attempt. A
      // rejection here is caught below and folds into the existing
      // "not a readable ZIP" -> unsupported-file-type path; the
      // authoritative per-format check still runs again inside
      // analyzeDocx/Pptx/Xlsx once dispatched.
      assertZipWithinLimits(
        zip,
        {
          maxEntries: OOXML.MAX_ZIP_ENTRIES,
          maxTotalUncompressedBytes: OOXML.MAX_TOTAL_UNCOMPRESSED_BYTES,
        },
        (m) => new Error(m),
      );
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
      if (contentTypes.includes("wordprocessingml.document") && zip.file("word/document.xml")) {
        return "docx";
      }
      if (
        contentTypes.includes("presentationml.presentation") &&
        zip.file("ppt/presentation.xml")
      ) {
        return "pptx";
      }
      if (contentTypes.includes("spreadsheetml.sheet") && zip.file("xl/workbook.xml")) {
        return "xlsx";
      }
    } catch {
      // Not a readable ZIP — fall through to unsupported.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legacy-format recognition (rejection copy only — never analysis)
// ---------------------------------------------------------------------------

/** OLE2 / Compound File Binary header. Identifies the whole 97–2003 Office
 *  family (and .msg, .vsd, and others — hence the 'ole-unknown' fallback). */
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** How far in to look for a CFB directory entry name. Bounded so a hostile
 *  file cannot turn detection into a scan of the whole upload. */
const OLE2_SCAN_BYTES = 8192;

/** CFB directory entry names are stored UTF-16LE. */
function utf16le(name: string): Buffer {
  return Buffer.from(name, "utf16le");
}

const OLE2_STREAMS: Array<[Buffer, LegacyDetected]> = [
  [utf16le("WordDocument"), "doc"],
  // 'Workbook' (BIFF8) before 'Book' (BIFF5). They do not actually collide —
  // 'Book' begins 0x42 (upper-case B) while the 'book' inside 'Workbook' is
  // 0x62 — but the order makes the intent obvious to the next reader.
  [utf16le("Workbook"), "xls"],
  [utf16le("Book"), "xls"],
  [utf16le("PowerPoint Document"), "ppt"],
];

/** The subset of UnsupportedFormat that is detectable from content. CSV has no
 *  signature and is deliberately never guessed from bytes — it is gated on the
 *  extension at the upload surfaces instead. */
export type LegacyDetected = "doc" | "xls" | "ppt" | "rtf" | "ole-unknown";

/**
 * Best-effort identification of a legacy binary Office file, for rejection
 * copy only.
 *
 * This deliberately does NOT parse the compound-file container. Doing that
 * properly means reading the CFB header (sector shift at 0x1E, first directory
 * sector at 0x30) and walking the FAT — a new parser over untrusted input, for
 * the sole purpose of composing a sentence. Scanning a bounded prefix for the
 * UTF-16LE directory entry names is enough to name the application, and when
 * it is not, 'ole-unknown' is still a far better answer than the generic
 * accepted-formats list. If you are tempted to "do this properly": we are not
 * auditing the file, only explaining why we cannot.
 *
 * Called only on the failure path — after detectFileType has already returned
 * null — so it costs nothing on a normal upload.
 */
export function detectLegacyFormat(buffer: Buffer): LegacyDetected | null {
  // RTF is not OLE2 — it is text with markup — but it is the same user problem.
  if (buffer.subarray(0, 5).toString("latin1") === "{\\rtf") return "rtf";

  if (buffer.length < OLE2_MAGIC.length) return null;
  if (!buffer.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) return null;

  const head = buffer.subarray(0, Math.min(buffer.length, OLE2_SCAN_BYTES));
  for (const [needle, format] of OLE2_STREAMS) {
    if (head.includes(needle)) return format;
  }
  return "ole-unknown";
}

/** Error for unsupported file types or a disabled DOCX/PPTX/XLSX pipeline. */
export class FileTypeError extends Error {
  code: "UNSUPPORTED_FILE_TYPE" | "DOCX_DISABLED" | "PPTX_DISABLED" | "XLSX_DISABLED";
  constructor(
    code: "UNSUPPORTED_FILE_TYPE" | "DOCX_DISABLED" | "PPTX_DISABLED" | "XLSX_DISABLED",
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
export async function analyzeDocument(buffer: Buffer, filename: string): Promise<AnalysisResult> {
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

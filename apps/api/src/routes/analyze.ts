import { Router, Request, Response, type IRouter } from "express";
import { analyzeLimiter } from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { analyzeDocument, detectFileType, detectLegacyFormat } from "../services/analyzer.js";
import { unsupportedFormatMessage } from "@file-audit/shared";
import { runVeraPdfOnBuffer } from "../services/veraPdfBuffer.js";
import {
  recordAudit,
  recordRejectedUpload,
  sanitizeStoredFilename,
  sha256Hex,
} from "../services/auditLog.js";

const router: IRouter = Router();

// Re-exported from services/auditLog so the success path and the rejection
// path cannot drift apart on what counts as a safe stored filename.
const sanitizeFilename = sanitizeStoredFilename;

// POST /api/analyze
router.post(
  "/analyze",
  analyzeLimiter,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const filename = sanitizeFilename(file.originalname);
      const contentHash = sha256Hex(file.buffer);

      // Detect PDF vs DOCX vs PPTX from the file's content (not its extension)
      // and dispatch to the matching pipeline. Unsupported / renamed files and
      // — when the format's flag is off — Word/PowerPoint uploads throw
      // FileTypeError; a corrupt package throws DocxParseError/PptxParseError.
      // All are mapped in the catch below.
      // Detect type up front so veraPDF (PDF/UA-1) runs concurrently with the
      // analysis for PDFs only — cost is max(analyze, veraPDF), not the sum.
      const detectedType = await detectFileType(file.buffer).catch(() => null);
      const [result, pdfUaVerdict] = await Promise.all([
        analyzeDocument(file.buffer, filename),
        detectedType === "pdf" ? runVeraPdfOnBuffer(file.buffer) : Promise.resolve(null),
      ]);
      // Only attach when veraPDF actually ran (available). Absent field = hidden panel.
      if (pdfUaVerdict && pdfUaVerdict.available) {
        result.pdfUaVerdict = pdfUaVerdict;
      }

      // Always record the audit — audit_log is the canonical "this
      // content has been audited" metadata consulted by /api/remediate's
      // audit-gate. The row is about the event only: file name, score,
      // grade, content hash. No identity (v1.68.0).
      recordAudit({
        eventType: "analyze",
        filename,
        score: result.overallScore,
        grade: result.grade,
        contentHash,
      });

      res.json(result);
    } catch (err: any) {
      console.error("Analysis error:", err);

      // Server busy (semaphore timeout)
      if (err.status === 503) {
        res.status(503).json({
          error: "The server is busy processing other files.",
          details:
            "Please wait a moment and try again. The server can analyze two files at a time — your request will be processed as soon as a slot opens.",
        });
        return;
      }

      // Unsupported file type (content matches no supported format)
      if (err.code === "UNSUPPORTED_FILE_TYPE") {
        // The extension filter never saw this one — either the file was
        // renamed (a .doc saved as .docx sails through multer and only fails
        // here) or it arrived without a telling extension. Sniff the bytes so
        // a genuine Word document is not told to check whether it is a .zip.
        // Counted here rather than in the upload filter: this file passed the
        // extension check, so the filter never saw it as a refusal.
        if (req.file) {
          recordRejectedUpload({
            filename: sanitizeFilename(req.file.originalname),
          });
        }
        const legacy = req.file ? detectLegacyFormat(req.file.buffer) : null;
        if (legacy) {
          res.status(400).json({
            error: "This file is a legacy format that cannot be audited.",
            details: unsupportedFormatMessage(legacy),
          });
          return;
        }
        res.status(400).json({
          error: "This file is not a supported document.",
          details:
            "Upload a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file. The file content matches none of these formats — check that you are not uploading a renamed file of another type (e.g., .zip, .jpg).",
        });
        return;
      }

      // DOCX auditing disabled via DOCX_ENABLED=false
      if (err.code === "DOCX_DISABLED") {
        res.status(415).json({
          error: "Word (.docx) auditing is currently disabled.",
          details:
            "This server is not configured to audit Word files. Contact the administrator to enable it.",
        });
        return;
      }

      // DOCX could not be parsed (corrupt or not a real Word package)
      if (err.code === "DOCX_PARSE_FAILED") {
        res.status(422).json({
          error: "This Word document could not be read.",
          details:
            "The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.",
        });
        return;
      }

      // PPTX auditing disabled via PPTX_ENABLED=false
      if (err.code === "PPTX_DISABLED") {
        res.status(415).json({
          error: "PowerPoint (.pptx) auditing is currently disabled.",
          details:
            "This server is not configured to audit PowerPoint files. Contact the administrator to enable it.",
        });
        return;
      }

      // PPTX could not be parsed (corrupt or not a real PowerPoint package)
      if (err.code === "PPTX_PARSE_FAILED") {
        res.status(422).json({
          error: "This PowerPoint file could not be read.",
          details:
            "The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.",
        });
        return;
      }

      // XLSX auditing disabled via XLSX_ENABLED=false
      if (err.code === "XLSX_DISABLED") {
        res.status(415).json({
          error: "Excel (.xlsx) auditing is currently disabled.",
          details:
            "This server is not configured to audit Excel files. Contact the administrator to enable it.",
        });
        return;
      }

      // XLSX could not be parsed (corrupt or not a real Excel package)
      if (err.code === "XLSX_PARSE_FAILED") {
        res.status(422).json({
          error: "This Excel file could not be read.",
          details:
            "The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.",
        });
        return;
      }

      // Password-protected PDF
      if (err.message?.includes("encrypted") || err.message?.includes("password")) {
        res.status(422).json({
          error: "This PDF is password-protected.",
          details:
            "Screen readers and accessibility tools also cannot access password-protected content. Please remove the password protection in Adobe Acrobat (File → Properties → Security → No Security) and re-upload.",
        });
        return;
      }

      // Timeout
      if (err.code === "ETIMEDOUT" || err.killed) {
        res.status(504).json({
          error: "This file is too complex to analyze within the time limit.",
          details:
            "This can happen with very large documents that contain many embedded images or complex structure trees. To work around this, try splitting the document into smaller sections and analyzing each section separately.",
        });
        return;
      }

      // Generic parse failure
      res.status(422).json({
        error: "This file could not be analyzed.",
        details:
          "It may be corrupt or in an unsupported format. To fix this: (1) Re-download the file from its original source; (2) Open the file in its native application and re-save it; (3) If all else fails, try re-exporting it to the same format.",
      });
    }
  },
);

export default router;

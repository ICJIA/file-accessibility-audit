import { Router, Request, Response, type IRouter } from "express";
import { analyzeLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { analyzeDocument } from "../services/analyzer.js";
import { recordAudit, recordAuditFailure } from "../services/auditLog.js";
import { runUrlAudit } from "../services/urlAuditPipeline.js";
import { classifyAuditFailure } from "../services/auditFailure.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/analyze-url
// ---------------------------------------------------------------------------
// Body: { url: string }
// Auth: none — the tool has no accounts (v1.68.0); per-IP rate limits apply
// Returns: same shape as POST /api/analyze (AnalysisResult)
//
// Security notes:
// - URL must pass isAllowedUrl() — scheme, SSRF block, and hostname allowlist
// - Size cap on fetched content matches the direct-upload cap (ANALYSIS.MAX_FILE_SIZE_MB)
// - Content-type detection: detectFileType() sniffs the fetched bytes against
//   all four supported formats (PDF, Word .docx, PowerPoint .pptx, Excel
//   .xlsx) — not a hardcoded %PDF- magic-byte check.
// ---------------------------------------------------------------------------

router.post("/analyze-url", analyzeLimiter, async (req: Request, res: Response) => {
  try {
    const url = req.body?.url;
    if (typeof url !== "string" || url.length === 0) {
      res.status(400).json({ error: "Missing required field: url" });
      return;
    }

    // Privileged (API_PRIVILEGED_TOKEN) callers may fetch any public URL;
    // anonymous callers are restricted to the ICJIA / illinois.gov allowlist.
    // The private/reserved-IP SSRF block inside safeFetch stays on either way.
    const privileged = isPrivilegedRequest(req);

    const outcome = await runUrlAudit({ url, privileged, res, eventType: "analyze-url" });
    if (!outcome.ok) return;
    const { buf, filename, contentHash } = outcome;

    const result = await analyzeDocument(buf, filename);

    // Canonical audit-log write so this URL-audited content counts
    // for the remediation gate (v1.20.1+). Doing it after analyzePDF
    // ensures we only record successful audits — a 503 or parse
    // failure leaves no audit_log row. Metadata only (v1.68.0).
    recordAudit({
      // Tier recorded so /status can report privileged (fleet) volume.
      privileged,
      eventType: "analyze-url",
      filename,
      score: result.overallScore,
      grade: result.grade,
      contentHash,
    });

    res.json(result);
  } catch (err: any) {
    // v1.88.0: record the failed audit. `url` and `privileged` are declared
    // inside the try, so read them from the request again here; the classifier
    // returns null for capacity (503), which records nothing.
    const failure = classifyAuditFailure(err);
    if (failure && typeof req.body?.url === "string") {
      recordAuditFailure({
        eventType: "analyze-url",
        privileged: isPrivilegedRequest(req),
        filename: req.body.url,
        reason: failure,
      });
    }

    // Server busy (semaphore timeout)
    if (err?.status === 503) {
      res.status(503).json({
        error: "The server is busy processing other files.",
        details: "Please wait a moment and try again.",
      });
      return;
    }

    // DOCX auditing disabled via DOCX_ENABLED=false
    if (err?.code === "DOCX_DISABLED") {
      res.status(415).json({
        error: "Word (.docx) auditing is currently disabled.",
        details:
          "This server is not configured to audit Word files. Contact the administrator to enable it.",
      });
      return;
    }

    // DOCX could not be parsed (corrupt or not a real Word package)
    if (err?.code === "DOCX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched Word document could not be read.",
        details:
          "The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.",
      });
      return;
    }

    // PPTX auditing disabled via PPTX_ENABLED=false
    if (err?.code === "PPTX_DISABLED") {
      res.status(415).json({
        error: "PowerPoint (.pptx) auditing is currently disabled.",
        details:
          "This server is not configured to audit PowerPoint files. Contact the administrator to enable it.",
      });
      return;
    }

    // PPTX could not be parsed (corrupt or not a real PowerPoint package)
    if (err?.code === "PPTX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched PowerPoint file could not be read.",
        details:
          "The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.",
      });
      return;
    }

    // XLSX auditing disabled via XLSX_ENABLED=false
    if (err?.code === "XLSX_DISABLED") {
      res.status(415).json({
        error: "Excel (.xlsx) auditing is currently disabled.",
        details:
          "This server is not configured to audit Excel files. Contact the administrator to enable it.",
      });
      return;
    }

    // XLSX could not be parsed (corrupt or not a real Excel package)
    if (err?.code === "XLSX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched Excel file could not be read.",
        details:
          "The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.",
      });
      return;
    }

    // Timeout
    if (err?.code === "ETIMEDOUT" || err?.killed) {
      res.status(504).json({
        error: "This file is too complex to analyze within the time limit.",
        details:
          "This can happen with very large documents that contain many embedded images or complex structure trees. To work around this, try splitting the document into smaller sections and analyzing each section separately.",
      });
      return;
    }

    // Log the detail server-side only — never echo raw err.message to the
    // client (it can leak library internals / paths). Mirrors analyze.ts.
    console.error("analyze-url error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

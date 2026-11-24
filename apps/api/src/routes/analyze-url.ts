import { Router, Request, Response, type IRouter } from "express";
import { analyzeLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { analyzeDocument } from "../services/analyzer.js";
import { recordAudit, recordAuditFailure } from "../services/auditLog.js";
import { runUrlAudit } from "../services/urlAuditPipeline.js";
import { classifyAuditFailure } from "../services/auditFailure.js";
import { mapUrlAnalyzeError, sendMappedAnalyzeError } from "../services/analyzeCore.js";
import { sealReport } from "../services/reportSeal.js";

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

    // Analysis failures map through the SAME function the upload routes use
    // (services/analyzeCore.ts): a password-protected or corrupt document by
    // URL answers 422, exactly as the same file uploaded does. This route
    // used to keep its own copy of the chain, which lacked those branches and
    // answered 500.
    let result;
    try {
      result = await analyzeDocument(buf, filename);
    } catch (err) {
      sendMappedAnalyzeError(
        res,
        mapUrlAnalyzeError(err, {
          eventType: "analyze-url",
          url,
          filename,
          buffer: buf,
          privileged,
        }),
      );
      return;
    }

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

    // Sealed so the result can be shared via POST /api/reports (the web
    // app's ?url= prefill path does exactly that) — services/reportSeal.ts.
    res.json(sealReport(result));
  } catch (err: any) {
    // Anything that is NOT an analysis failure (those are mapped above):
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

    // Log the detail server-side only — never echo raw err.message to the
    // client (it can leak library internals / paths). Mirrors analyze.ts.
    console.error("analyze-url error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

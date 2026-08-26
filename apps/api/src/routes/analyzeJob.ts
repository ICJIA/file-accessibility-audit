/**
 * The progress-model audit endpoints (v1.100.0) — ADDITIVE beside the
 * synchronous POST /api/analyze, which is untouched (the CLI, the fleet's
 * audit-url caller, and the web batch path all keep using it).
 *
 *   POST /api/analyze-job            → 202 { jobId, token }
 *   GET  /api/analyze-job/:id?t=…    → step states; the result (or the same
 *                                      error body /api/analyze would send)
 *                                      exactly once, then the job is gone.
 *
 * Both run the SAME pipeline via services/analyzeCore.ts — same audit_log
 * rows, same error mapping — with real observed step transitions as the only
 * addition. The web page uses this when available and falls back to the
 * synchronous endpoint otherwise, so a deploy skew can never break uploads.
 */
import { Router, Request, Response, type IRouter } from "express";
import { analyzeLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { detectFileType } from "../services/analyzer.js";
import { performAudit, mapAnalyzeError } from "../services/analyzeCore.js";
import {
  createAnalyzeJob,
  finishJob,
  markStep,
  markStepSkipped,
  pollAnalyzeJob,
} from "../services/analyzeJobs.js";
import { REMEDIATION } from "#config";

const router: IRouter = Router();

router.post(
  "/analyze-job",
  analyzeLimiter,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const privileged = isPrivilegedRequest(req);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const detectedType = await detectFileType(file.buffer).catch(() => null);
    const created = createAnalyzeJob(detectedType === "pdf");
    if (!created) {
      res.status(503).json({
        error: "The server is busy processing other files.",
        details: "Please wait a moment and try again.",
      });
      return;
    }
    const { id, token } = created;

    // The WCAG pass may be disabled — the row must then never render at all
    // (the absent-key rule the report panel already follows).
    if (detectedType === "pdf" && !REMEDIATION.VERAPDF_WCAG_ENABLED) {
      markStepSkipped(id, "veraPdfWcag");
    }

    // Run the audit AFTER responding; the job map carries every later fact.
    // The buffer is only referenced by this closure and is released when the
    // pipeline settles — the same lifetime the synchronous path gives it.
    res.status(202).json({ jobId: id, token });

    try {
      const result = await performAudit(file.buffer, file.originalname, privileged, (step, state) =>
        markStep(id, step, state),
      );
      finishJob(id, { result });
    } catch (err) {
      console.error("Analysis error (job):", err);
      finishJob(id, {
        error: mapAnalyzeError(
          err as { status?: number; code?: string; message?: string; killed?: boolean },
          file,
          privileged,
        ),
      });
    }
  },
);

router.get("/analyze-job/:id", (req: Request, res: Response): void => {
  const token = typeof req.query.t === "string" ? req.query.t : "";
  const status = pollAnalyzeJob(String(req.params.id), token);
  if (!status) {
    // Wrong id, wrong token, expired, or already delivered — deliberately
    // indistinguishable (jobs carry no owner identity; the token is the key).
    res.status(404).json({ error: "No such analysis job." });
    return;
  }
  res.json(status);
});

export default router;

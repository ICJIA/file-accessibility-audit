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
import { Router, Request, Response, type IRouter, type NextFunction } from "express";
import {
  analyzeJobStatusLimiter,
  analyzeLimiter,
  isPrivilegedRequest,
} from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { detectFileType } from "../services/analyzer.js";
import { performAudit, mapAnalyzeError } from "../services/analyzeCore.js";
import {
  createAnalyzeJob,
  reserveAnalyzeJobSlot,
  finishJob,
  markStep,
  markStepSkipped,
  pollAnalyzeJob,
} from "../services/analyzeJobs.js";
import { sealReport } from "../services/reportSeal.js";
import { setBusyRetryAfter } from "../services/busy.js";
import { ANALYZE_JOB, REMEDIATION } from "#config";

const router: IRouter = Router();

const BUSY_BODY = {
  error: "The server is busy processing other files.",
  details: "Please wait a moment and try again.",
};

/**
 * Capacity check BEFORE the upload is read (review 2026-11-12). multer
 * buffers the whole file in memory (up to ANALYSIS.MAX_FILE_SIZE_MB) before
 * the handler runs, so with the check only in the handler a full job store
 * still cost a 25 MB buffer per refused request. The handler's own check in
 * createAnalyzeJob stays — it is the authoritative one (uploads that were
 * already in flight when the store filled).
 *
 * RESERVES the place it checks for (second pass): a pure check let every
 * upload in a simultaneous burst through, because none of them had a job yet
 * when the others were checked. The reservation is released when the handler
 * registers the job (it then counts as a job instead), or when the response
 * closes without one — a refused file, a parse error, a dropped connection.
 */
export function requireJobCapacity(_req: Request, res: Response, next: NextFunction): void {
  const release = reserveAnalyzeJobSlot();
  if (!release) {
    setBusyRetryAfter(res);
    res.status(503).json(BUSY_BODY);
    return;
  }
  res.locals.releaseJobSlot = release;
  res.on("close", release);
  next();
}

router.post(
  "/analyze-job",
  analyzeLimiter,
  requireJobCapacity,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const privileged = isPrivilegedRequest(req);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const detectedType = await detectFileType(file.buffer).catch(() => null);
    // Trade the pre-upload reservation for the job itself. Synchronous with
    // createAnalyzeJob, so the place cannot be taken in between.
    (res.locals?.releaseJobSlot as (() => void) | undefined)?.();
    const created = createAnalyzeJob(detectedType === "pdf");
    if (!created) {
      setBusyRetryAfter(res);
      res.status(503).json(BUSY_BODY);
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
      // retryBusyMs: a full analysis line must not fail a JOB — the page is
      // only polling and cannot retry — so the job waits for a place itself.
      const result = await performAudit(
        file.buffer,
        file.originalname,
        privileged,
        (step, state) => markStep(id, step, state),
        { retryBusyMs: ANALYZE_JOB.BUSY_RETRY_TOTAL_MS },
      );
      // Sealed like the synchronous path's response, so a result collected
      // through the poll can be shared (services/reportSeal.ts).
      finishJob(id, { result: sealReport(result) });
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

// Exempt from globalLimiter (the page polls this while an audit runs — see
// isAnalyzeJobStatusRequest), so this dedicated flood guard is the only cap
// that applies. Authorisation is the job's own token, checked below.
router.get("/analyze-job/:id", analyzeJobStatusLimiter, (req: Request, res: Response): void => {
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

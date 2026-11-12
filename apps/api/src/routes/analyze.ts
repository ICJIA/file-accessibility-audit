import { Router, Request, Response, type IRouter } from "express";
import { analyzeLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { performAudit, mapAnalyzeError } from "../services/analyzeCore.js";
import { sealReport } from "../services/reportSeal.js";
import { setBusyRetryAfter } from "../services/busy.js";

const router: IRouter = Router();

// POST /api/analyze
router.post(
  "/analyze",
  analyzeLimiter,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response) => {
    // Which rate-limit tier this upload came through, recorded on the audit
    // row so /status can report privileged (fleet) volume vs public volume.
    // Declared before the try so the catch block's rejection log sees it too.
    const privileged = isPrivilegedRequest(req);
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // v1.100.0: the pipeline + audit_log recording moved verbatim into
      // services/analyzeCore.ts so this synchronous route and the job-model
      // progress endpoints (routes/analyzeJob.ts) can never drift. No hooks
      // here — this path behaves exactly as before.
      const result = await performAudit(file.buffer, file.originalname, privileged);
      // Sealed so POST /api/reports can tell this server's verdict from a
      // hand-written one (services/reportSeal.ts). Last step: the seal covers
      // the veraPDF verdicts performAudit attached.
      res.json(sealReport(result));
    } catch (err: any) {
      console.error("Analysis error:", err);
      const mapped = mapAnalyzeError(err, req.file, privileged);
      // Busy (the analysis line is full): tell the caller when to come back.
      if (mapped.status === 503) setBusyRetryAfter(res);
      res.status(mapped.status).json(mapped.body);
    }
  },
);

export default router;

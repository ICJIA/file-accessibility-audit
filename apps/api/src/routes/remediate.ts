import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { DOC_METADATA_FILE, parseDocMetadataRequest } from "../services/pdfDocMetadata.js";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeLimiter, remediationStatusLimiter } from "../middleware/rateLimiter.js";
import {
  FIELD_ARRAY_INDEX_LIMIT,
  UnsupportedFileTypeError,
  type MultipartLimits,
} from "../middleware/uploadMiddleware.js";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import {
  createJob,
  getJob,
  verifyDownloadToken,
  setExpired,
  setInputAudit,
  getJobAuditPair,
  getJobVeraPdf,
  countActiveJobs,
  countQueuedJobs,
  queuedAhead,
  type RemediationJob,
} from "../services/remediationJobs.js";
import {
  recordEvent,
  getEventsForJob,
  deleteAndVerify,
  jobDirFor,
  purgeJobDir,
} from "../services/remediationEvents.js";
import { dispatchQueuedJobs, spawnWorker } from "../services/remediationQueue.js";
import { DEPLOY, FILENAME, REMEDIATION } from "#config";
import db from "../db/sqlite.js";
import { hasRecentAudit } from "../services/auditLog.js";
import {
  callerActiveJobs,
  capKeyFromIp,
  reserveRemediationSlot,
  remediationSlotsUsed,
  trackCallerJob,
} from "../services/remediationCap.js";
import { setBusyRetryAfter } from "../services/busy.js";
import { mapAnalyzeError, sendMappedAnalyzeError } from "../services/analyzeCore.js";
import { classifyAuditFailure } from "../services/auditFailure.js";

const router: IRouter = Router();

const DAILY_CAP_WINDOW_MS = 24 * 60 * 60_000;

// The worker launcher moved to services/remediationQueue.ts with the global
// concurrency cap (review 2026-11-12); re-exported so its historical import
// path — and remediate-spawn-env.test.ts — keep working.
export { spawnWorker };

/** Seconds a caller is told to wait when the remediation queue is full. */
const QUEUE_FULL_RETRY_AFTER_S = 60;

/**
 * Whether one more job may be admitted: it either gets a worker slot at once
 * or fits in the waiting queue. Derived from the job rows (see
 * services/remediationJobs.ts), so it is right across an API restart.
 */
function hasRemediationCapacity(): boolean {
  return (
    countActiveJobs() < REMEDIATION.MAX_CONCURRENT_JOBS ||
    countQueuedJobs() < REMEDIATION.MAX_QUEUED_JOBS
  );
}

/** A job still occupies its caller's share while it is queued or running. */
function isJobActive(jobId: string): boolean {
  const s = getJob(jobId)?.status;
  return s === "pending" || s === "running";
}

function sendCallerShareFull(res: Response, active: number): void {
  res.status(429).json({
    error: "You already have remediations in progress.",
    details:
      `Up to ${REMEDIATION.MAX_ACTIVE_JOBS_PER_CALLER} remediations per caller can be ` +
      `queued or running at the same time, and you have ${active}. Wait for one to ` +
      `finish, then try again.`,
    limit: REMEDIATION.MAX_ACTIVE_JOBS_PER_CALLER,
    active,
  });
}

function sendQueueFull(res: Response): void {
  res.setHeader("Retry-After", String(QUEUE_FULL_RETRY_AFTER_S));
  res.status(503).json({
    error: "Auto-remediation is busy.",
    details: "Too many remediations are already running or waiting. Please try again in a minute.",
  });
}

function sendDailyCapReached(res: Response, recentJobs: number): void {
  res.status(429).json({
    error: "Daily remediation limit reached.",
    details:
      `Up to ${REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER} remediations ` +
      `per caller per 24 hours. You've used ${recentJobs}. Wait for ` +
      `older jobs to age out of the window, or contact the audit-tool ` +
      `administrator if you need a higher cap for a legitimate ` +
      `large-scale workflow.`,
    limit: REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER,
    used: recentJobs,
  });
}

/**
 * The cheap refusals that need nothing from the upload: the caller's daily
 * cap, the caller's share of the queue, and the queue being full. Sends the
 * response and returns true when one applies.
 *
 * Run TWICE on purpose: as middleware before the body is read
 * (requireRemediationCapacity), so a refused request does not first cost a
 * buffered upload of up to REMEDIATION.MAX_FILE_SIZE_MB; and again in the
 * handler, where the upload has taken time and the answer may have changed.
 * The authoritative checks are the ones at job creation.
 */
function refuseIfOverLimits(req: Request, res: Response): boolean {
  const capKey = capKeyFromIp(req.ip);

  // Daily cap. Sized to comfortably cover a normal agency workflow
  // (~50 PDFs/day) while blocking abuse at scale (3000+ PDFs would take a
  // month at the cap). The count lives in process memory only.
  const recentJobs = remediationSlotsUsed(capKey, DAILY_CAP_WINDOW_MS);
  if (recentJobs >= REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER) {
    sendDailyCapReached(res, recentJobs);
    return true;
  }

  // Per-caller share: one caller may hold only
  // REMEDIATION.MAX_ACTIVE_JOBS_PER_CALLER queued-or-running jobs, so a
  // single caller cannot fill both slots and the whole queue. In-memory,
  // same key as the daily cap.
  const activeNow = callerActiveJobs(capKey, isJobActive);
  if (activeNow >= REMEDIATION.MAX_ACTIVE_JOBS_PER_CALLER) {
    sendCallerShareFull(res, activeNow);
    return true;
  }

  // Global capacity (review 2026-11-12). Remediation is bounded across ALL
  // callers: REMEDIATION.MAX_CONCURRENT_JOBS workers at once,
  // MAX_QUEUED_JOBS waiting.
  if (!hasRemediationCapacity()) {
    sendQueueFull(res);
    return true;
  }
  return false;
}

/** Middleware form — mounted BEFORE the multipart parser. */
function requireRemediationCapacity(req: Request, res: Response, next: NextFunction): void {
  if (refuseIfOverLimits(req, res)) return;
  next();
}

// The same field-name limit as every other upload parser (see
// FIELD_ARRAY_INDEX_LIMIT): this route builds its own multer instance, so it
// does not inherit the one in uploadMiddleware.
const remediateLimits: MultipartLimits = {
  fileSize: REMEDIATION.MAX_FILE_SIZE_MB * 1024 * 1024,
  files: 1,
  fieldArrayIndexLimit: FIELD_ARRAY_INDEX_LIMIT,
  // The form's two text fields (title, language), and nothing larger than a
  // title: a field over 1 KB is refused by multer itself.
  fields: 4,
  fieldSize: 1024,
};

const remediateUpload = multer({
  storage: multer.memoryStorage(),
  limits: remediateLimits,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      // A status-bearing error (400), not a plain Error: multer hands this
      // straight to the app-level error handler, where a status-less Error
      // became a 500 and a full stack in the error log for what is simply a
      // caller uploading the wrong kind of file (review 2026-11-12).
      cb(new UnsupportedFileTypeError("Only PDF files are accepted"));
    }
  },
});

/**
 * Feature-flag gate. While REMEDIATION.ENABLED is false the entire
 * endpoint surface returns 404 so the feature is invisible to clients.
 */
function requireEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!REMEDIATION.ENABLED) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  next();
}

function sanitizeFilename(raw: string): string {
  let name = path.basename(raw);
  name = name.slice(0, FILENAME.MAX_LENGTH);
  name = name.replace(new RegExp(`[^${FILENAME.ALLOWED_CHARS.source.slice(1, -1)}]`, "g"), "_");
  return name || "unnamed.pdf";
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * C5: the ONLY credential an anonymous caller can present for a status/
 * receipt read is the download token already returned in the POST
 * /api/remediate creation response (and already required, unchanged, by
 * GET /download) — threaded through the result page's `?t=` query param.
 * Reused here as `?token=`, matching the existing /download convention.
 */
function jobTokenFromRequest(req: Request): string {
  const token = req.query?.token;
  return typeof token === "string" ? token : "";
}

/** True if the request presents a token matching this job's download token. */
function isAuthorizedByToken(job: RemediationJob, req: Request): boolean {
  const presented = jobTokenFromRequest(req);
  return presented.length > 0 && verifyDownloadToken(job, presented);
}

async function ensureOutputRoot(): Promise<void> {
  const outputRoot = path.resolve(REMEDIATION.OUTPUT_DIR);
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
}

/* -------------------------------------------------------------------- */
/* POST /api/remediate                                                  */
/* -------------------------------------------------------------------- */

router.post(
  "/remediate",
  requireEnabled,
  analyzeLimiter,
  // Before the body is read (see refuseIfOverLimits).
  requireRemediationCapacity,
  remediateUpload.single("file"),
  async (req: Request, res: Response) => {
    // Set once the upload has been written to disk, so every exit that does
    // NOT end in a created job removes it again.
    let writtenJobDir: string | null = null;
    let jobCreated = false;
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // The title and language the person wants written into the repaired
      // PDF (user decision 2026-11-18). Both optional; refused before
      // anything is written if malformed.
      const docMetadata = parseDocMetadataRequest(req.body?.title, req.body?.language);
      if ("error" in docMetadata) {
        res.status(400).json({ error: docMetadata.error });
        return;
      }

      // Magic bytes check — same posture as /api/analyze
      const header = file.buffer.subarray(0, 5).toString("ascii");
      if (header !== "%PDF-") {
        res.status(400).json({
          error: "This file does not appear to be a valid PDF.",
          code: "UNSUPPORTED_TYPE",
        });
        return;
      }

      // Capture the user's exact uploaded filename (spaces, unicode,
      // and everything else) before sanitization. The download endpoint
      // uses this verbatim by default so CMS-replacement workflows can
      // drop the remediated file in over the original without breaking
      // links. The sanitized version is what we use for filesystem
      // paths, internal storage, and the path-traversal check below.
      const originalFilename = String(file.originalname ?? "").slice(0, 500);
      const filename = sanitizeFilename(file.originalname);

      // v1.20.1+: gate remediation behind a prior audit and a daily
      // cap. Both checks are cheap and run BEFORE the resource-intensive
      // analyzePDF preflight so an over-cap caller never gets to consume
      // an analysis semaphore slot.
      //
      // v1.68.0: identity storage is gone, so the two checks bind to
      // different things now. The audit-gate binds to the BYTES (content
      // hash): these exact bytes must have passed through an audit
      // recently, which is the property that stops callers bypassing the
      // audit pipeline's rate limit. The daily cap binds to the caller's
      // IP address held TRANSIENTLY in process memory (remediationCap.ts)
      // — never written to disk, a database row, or any log.
      const capKey = capKeyFromIp(req.ip);
      const contentHash = sha256Hex(file.buffer);

      // (1) Audit-gate. Reject if no audit_log row exists for this
      // content within REMEDIATION.AUDIT_REQUIRED_WINDOW_MS. The hash is
      // the identifier — any audit path counts (browser upload, URL
      // audit, fleet bulk, audit-url persist). Forces every remediation
      // to be preceded by an audit so abusers can't bypass the audit
      // pipeline's rate limit by jumping straight to remediation.
      if (!hasRecentAudit(contentHash, REMEDIATION.AUDIT_REQUIRED_WINDOW_MS)) {
        const minutes = Math.round(REMEDIATION.AUDIT_REQUIRED_WINDOW_MS / 60_000);
        const auditUrl =
          process.env.NODE_ENV === "production" ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL;
        res.status(403).json({
          error: "Audit required before remediation.",
          details:
            `This PDF must be audited first — upload it at ${auditUrl} ` +
            `and click "Auto-Remediate" from the results page. The audit ` +
            `must be within the last ${minutes} minutes. Any audit path ` +
            `counts (browser upload, POST /api/analyze-url, or POST ` +
            `/api/audit-url).`,
          auditUrl,
          code: "AUDIT_REQUIRED",
        });
        return;
      }

      // (2) Daily cap, (2b) per-caller share and (3) global capacity
      // fast-paths — the same three refusals already applied before the
      // body was read, asked again now that the upload has arrived. They
      // run BEFORE the resource-intensive analyzePDF preflight so an
      // over-cap caller never gets to consume an analysis slot, and are
      // re-checked authoritatively at job creation below.
      if (refuseIfOverLimits(req, res)) return;

      // Pre-flight audit — gives us inputScore and page count without
      // committing to a job yet. analyzePDF runs against the in-memory
      // buffer; nothing has been written to disk yet at this point.
      //
      // A preflight that fails is answered with the SAME mapping an audit of
      // the file gets (services/analyzeCore.ts): a password-protected PDF is
      // 422 "password-protected", a timeout 504 — a fault in the request,
      // said as one. It used to be 500 "Could not start remediation" for
      // every cause. `record: false`: this is not an audit, so it leaves no
      // audit_log row.
      let preflight: Awaited<ReturnType<typeof analyzePDF>>;
      try {
        preflight = await analyzePDF(file.buffer, filename);
      } catch (err) {
        const e = (err ?? {}) as {
          status?: number;
          code?: string;
          message?: string;
          killed?: boolean;
        };
        if (e.status === 503) {
          setBusyRetryAfter(res);
          res.status(503).json({
            error: "Server busy",
            details: "Please wait a moment and try again.",
          });
          return;
        }
        if (classifyAuditFailure(err) === "internal") {
          console.error("Remediation preflight error:", err);
        }
        sendMappedAnalyzeError(
          res,
          mapAnalyzeError(e, { originalname: filename, buffer: file.buffer }, false, {
            record: false,
          }),
        );
        return;
      }

      if (preflight.pageCount && preflight.pageCount > REMEDIATION.MAX_PAGE_COUNT) {
        res.status(413).json({
          error: "PDF is too long for auto-remediation.",
          details: `Maximum is ${REMEDIATION.MAX_PAGE_COUNT} pages; this file has ${preflight.pageCount}.`,
        });
        return;
      }

      // contentHash was computed earlier for the audit-gate check.

      // Write the upload into the job's directory BEFORE the job row exists.
      // A queued row is dispatchable the instant it is inserted (another
      // worker exiting triggers a dispatch pass), so its input must already
      // be on disk; the id is generated here for that reason. Every refusal
      // or failure after this point removes the directory again (see the
      // `finally` below) — and the retention sweep removes any directory
      // that has no job row, as a backstop.
      const jobId = randomUUID();
      await ensureOutputRoot();
      const jobDir = jobDirFor(jobId);
      const workDir = path.join(jobDir, "work");
      writtenJobDir = jobDir;
      await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
      const inputPath = path.join(workDir, "input.pdf");
      await fs.writeFile(inputPath, file.buffer, { mode: 0o600 });
      // Beside the upload, owner-only, deleted with the job's scratch
      // directory (every exit path already removes it) — no new column.
      await fs.writeFile(path.join(workDir, DOC_METADATA_FILE), JSON.stringify(docMetadata), {
        mode: 0o600,
      });

      // ---- From here to dispatchQueuedJobs() there is NO await: the
      // capacity check, the daily-cap reservation, the row insert and the
      // dispatch are one atomic step on Node's single thread. ----

      // Authoritative per-caller and global capacity checks (a concurrent
      // request may have taken the last place during the preflight). Before
      // the daily-cap reservation, so a refused job does not consume a slot
      // of the caller's daily allowance.
      const activeAtCreate = callerActiveJobs(capKey, isJobActive);
      if (activeAtCreate >= REMEDIATION.MAX_ACTIVE_JOBS_PER_CALLER) {
        sendCallerShareFull(res, activeAtCreate);
        return;
      }
      if (!hasRemediationCapacity()) {
        sendQueueFull(res);
        return;
      }

      // Authoritative cap enforcement (the successor to the v1.20.1 P2.4
      // SQL transaction): reserveRemediationSlot's check-and-reserve is
      // atomic because Node's event loop is single-threaded, so two
      // concurrent requests that both passed the fast-path above still
      // cannot both take the (cap+1)th slot. The earlier check stays as a
      // cheap pre-preflight rejection that avoids running analyzePDF for
      // an obviously over-cap caller.
      if (
        !reserveRemediationSlot(
          capKey,
          REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER,
          DAILY_CAP_WINDOW_MS,
        )
      ) {
        const used = remediationSlotsUsed(capKey, DAILY_CAP_WINDOW_MS);
        res.status(429).json({
          error: "Daily remediation limit reached.",
          details:
            `Up to ${REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER} ` +
            `remediations per caller per 24 hours. You've used ` +
            `${used}. (Detected at job-creation time after a ` +
            `concurrent request consumed the last slot.)`,
          limit: REMEDIATION.MAX_JOBS_PER_DAY_PER_CALLER,
          used,
        });
        return;
      }
      const { job, downloadToken } = createJob({
        id: jobId,
        inputFilename: filename,
        originalFilename,
        contentHash,
        pageCount: preflight.pageCount ?? null,
      });

      // Persist the pre-flight input score on the job row immediately so
      // the worker doesn't have to re-audit the input. Also persist the
      // full audit (categories) so the result page can show category-
      // level before/after without re-auditing.
      jobCreated = true;
      trackCallerJob(capKey, job.id);
      db.prepare("UPDATE remediation_jobs SET input_score = ? WHERE id = ?").run(
        preflight.overallScore,
        job.id,
      );
      setInputAudit(job.id, JSON.stringify(preflight));

      recordEvent(job.id, "received", {
        filename,
        size_bytes: file.buffer.length,
        page_count: preflight.pageCount,
        input_score: preflight.overallScore,
      });

      // Start it now if a worker slot is free; otherwise it waits its turn
      // and is started when one frees up (services/remediationQueue.ts).
      dispatchQueuedJobs();
      const queued = getJob(job.id)?.startedAt == null;

      res.status(202).json({
        jobId: job.id,
        downloadToken,
        inputScore: preflight.overallScore,
        inputGrade: preflight.grade,
        // true = accepted but waiting for a worker slot (additive field).
        queued,
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      console.error("Remediation request error:", e);
      if (e.status === 503) {
        setBusyRetryAfter(res);
        res.status(503).json({
          error: "Server busy",
          details: "Please wait a moment and try again.",
        });
        return;
      }
      res.status(500).json({ error: "Could not start remediation" });
    } finally {
      // The upload was written but no job owns it (queue filled, daily cap
      // hit at the last moment, or an error): delete it now rather than
      // leave a copy of the document for the sweep to find.
      // (No lifecycle events: no job exists for them to belong to.)
      if (writtenJobDir && !jobCreated) {
        try {
          rmSync(writtenJobDir, { recursive: true, force: true });
        } catch {
          // best effort — the sweep's no-row scan removes it
        }
      }
    }
  },
);

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/status                                     */
/* -------------------------------------------------------------------- */

router.get(
  "/remediate/:jobId/status",
  // Exempt from globalLimiter (the progress page polls this once per
  // second), so this dedicated flood guard is the only cap that applies.
  // It runs before requireEnabled so the cap holds even while the
  // feature flag is off (otherwise this would be the one un-throttled
  // path in the API), which also means it keys by IP, never email.
  remediationStatusLimiter,
  requireEnabled,
  (req: Request, res: Response) => {
    const job = getJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    // C5: ownership is the job token, full stop — jobs carry no owner
    // identity (v1.68.0). 404 (not 401/403) so a caller without it can't
    // distinguish "wrong token" from "no such job" — don't leak existence.
    if (!isAuthorizedByToken(job, req)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Still queued: give the dispatcher a chance on every poll. This is what
    // moves the queue after an API restart, when the workers started by the
    // previous process have no exit listener in this one. Cheap (two COUNTs)
    // and a no-op while every slot is taken.
    let current = job;
    if (job.status === "pending" && job.startedAt == null) {
      dispatchQueuedJobs();
      current = getJob(job.id) ?? job;
    }
    const queued = current.status === "pending" && current.startedAt == null;

    res.json({
      jobId: job.id,
      status: current.status,
      // Additive (review 2026-11-12): true while the job waits for a worker
      // slot; queuePosition is 1 for the next job to start.
      queued,
      ...(queued ? { queuePosition: queuedAhead(current) + 1 } : {}),
      step: job.step,
      progressPct: job.progressPct,
      inputScore: job.inputScore,
      outputScore: job.outputScore,
      outputValid: job.outputValid,
      failureReason: job.failureReason,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      // Surface both filename variants so the download UI can offer
      // "keep original" (originalFilename, spaces and all) vs rename.
      // originalFilename is null for jobs created before v1.20.0.
      inputFilename: job.inputFilename,
      originalFilename: job.originalFilename,
    });
  },
);

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/download?token=...                         */
/* -------------------------------------------------------------------- */

/**
 * Jobs whose output is being sent right now. The download is single-use, and
 * the job is only marked used once the whole file has gone out — so without
 * this, two GETs arriving together would both find the job `complete` and
 * both receive the file. In process memory: a download does not survive a
 * restart either.
 */
const downloadsInProgress = new Set<string>();

/** Test hook. */
export function _downloadsInProgress(): number {
  return downloadsInProgress.size;
}

/**
 * SINGLE-USE, and the use is a COMPLETED transfer.
 *
 * The job used to be marked expired — and its file deleted when the response
 * closed — the moment a GET began. Two things then destroyed a file nobody
 * had received: a HEAD (Express answers HEAD from the GET route; mail and
 * chat link scanners send one before a person ever clicks), and a GET that
 * was cut off part-way (a dropped connection, a closed tab).
 *
 *   HEAD  → the headers a GET would send, and nothing else: nothing is
 *           marked, nothing is deleted. (Answering 405 instead would make
 *           some scanners fall back to GET, which is the request that counts.)
 *   GET   → the job is marked expired and its files deleted only when every
 *           byte of the file was handed to the connection. An interrupted GET
 *           leaves the job downloadable until its normal expiry
 *           (REMEDIATION.OUTPUT_TTL_MS, enforced by the retention sweep).
 *   Two GETs at once → the second is refused (409) while the first is being
 *           sent; once that one completes the job is expired (410).
 *
 * ORDER OF CHECKS: the token first. Unknown job, missing token and wrong
 * token all answer the same 404 — as /status and /receipt do — so nothing
 * about a job (not even that it exists, or what state it is in) is told to a
 * caller who does not hold its token. It used to answer 409/410 before the
 * token was looked at, and 403 for a wrong token.
 */
router.get("/remediate/:jobId/download", requireEnabled, async (req: Request, res: Response) => {
  let holding: string | null = null;
  const release = (): void => {
    if (holding) downloadsInProgress.delete(holding);
    holding = null;
  };
  try {
    const job = getJob(String(req.params.jobId));
    if (!job || !isAuthorizedByToken(job, req)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const isHead = req.method === "HEAD";

    if (job.status !== "complete" || !job.outputPath) {
      if (job.status === "expired") {
        res.status(410).json({ error: "Output expired and was deleted." });
        return;
      }
      res.status(409).json({
        error: `Job is ${job.status}.`,
        details: "Wait for completion before downloading.",
      });
      return;
    }
    const outputPath = job.outputPath;

    let fileSize = -1;
    try {
      fileSize = statSync(outputPath).size;
    } catch {
      // gone — handled below
    }
    if (fileSize < 0 || !existsSync(outputPath)) {
      // A HEAD changes nothing, here as everywhere else.
      if (!isHead) {
        setExpired(job.id);
        recordEvent(job.id, "expired", { reason: "file already gone at download" });
      }
      res.status(410).json({ error: "Output already deleted." });
      return;
    }

    // Resolve the download filename. Priority:
    //   1. ?name=<custom> query param — caller-specified rename. The
    //      caller is choosing this name deliberately (e.g., to flatten
    //      a CMS-versioned name into something cleaner). We trust it
    //      but sanity-check length and force a .pdf extension.
    //   2. job.originalFilename — the exact uploaded name, spaces and
    //      all. Critical for CMS file-replacement: the remediated PDF
    //      drops in over the original under the same name, so any
    //      links in the CMS keep resolving.
    //   3. job.inputFilename + '_remediated.pdf' — legacy fallback for
    //      jobs created before v1.20.0 (original_filename was null).
    const customName =
      typeof req.query?.name === "string" && req.query.name.length > 0
        ? String(req.query.name)
        : null;

    let downloadName: string;
    if (customName) {
      const trimmed = customName.trim().slice(0, 250);
      downloadName = /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
    } else if (job.originalFilename) {
      downloadName = job.originalFilename;
    } else {
      downloadName = sanitizeFilename(job.inputFilename.replace(/\.pdf$/i, "") + "_remediated.pdf");
    }

    // RFC 6266 dual filename header — provides an ASCII fallback for
    // older clients alongside the percent-encoded UTF-8 name. The
    // ASCII fallback runs through sanitizeFilename so spaces and
    // unicode become underscores there; the UTF-8 filename* preserves
    // the exact name including spaces. Modern browsers (and curl)
    // honor filename* and present the exact original name to the user.
    const asciiFallback = sanitizeFilename(downloadName);
    const encodedName = encodeURIComponent(downloadName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader("Content-Length", String(fileSize));
    // Tell the reverse proxy to pass this response straight through. The live
    // nginx buffers proxied responses by default (seen in `nginx -T`,
    // 2026-11-24): it would take the whole file from us at once — into memory,
    // then a temporary file of its own — and we would see a "complete"
    // transfer and delete the file while the person's browser was still
    // receiving it. Unbuffered, our transfer ends when theirs does, and nginx
    // writes no copy of the repaired file to disk.
    res.setHeader("X-Accel-Buffering", "no");

    if (isHead) {
      res.status(200).end();
      return;
    }

    // One transfer at a time (see downloadsInProgress). Synchronous with the
    // checks above — no await in between — so two requests in the same tick
    // cannot both pass.
    if (downloadsInProgress.has(job.id)) {
      res.removeHeader("Content-Type");
      res.removeHeader("Content-Disposition");
      res.removeHeader("Content-Length");
      res.setHeader("Retry-After", "5");
      res.status(409).json({
        error: "A download of this file is already in progress.",
        details: "The file can be downloaded once. Wait for the download that has started.",
        code: "DOWNLOAD_IN_PROGRESS",
      });
      return;
    }
    downloadsInProgress.add(job.id);
    holding = job.id;

    // Stream the file instead of loading the full buffer into memory.
    // 50MB+ outputs would otherwise blow through the API's PM2 memory
    // cap under concurrent downloads.
    const stream = createReadStream(outputPath);
    let bytesSent = 0;
    stream.on("data", (chunk) => {
      bytesSent += chunk.length;
    });

    // The response has closed — finished, or cut off. Only a COMPLETE
    // transfer uses the download up: every byte read from the file, and the
    // response finished writing them out.
    const onClose = async (): Promise<void> => {
      const complete = res.writableFinished && bytesSent === fileSize;
      if (!complete) {
        stream.destroy();
        recordEvent(job.id, "error", {
          error_type: "download_incomplete",
          bytes_sent: bytesSent,
          size_bytes: fileSize,
          message: "transfer ended early; the file is kept until its expiry",
        });
        release();
        return;
      }
      // Expired BEFORE the in-progress guard is lifted, so there is no
      // moment at which a second request finds the job downloadable.
      setExpired(job.id);
      release();
      recordEvent(job.id, "downloaded", { bytes_sent: bytesSent });
      await deleteAndVerify(job.id, outputPath, "download");
      // Nothing else of this job belongs on disk once it has been collected.
      purgeJobDir(job.id, jobDirFor(job.id), "download");
    };
    res.once("close", () => {
      onClose().catch((e) => {
        release();
        console.error("Remediation download cleanup failed:", e);
      });
    });
    stream.on("error", (err) => {
      recordEvent(job.id, "error", {
        error_type: "download_stream_failed",
        message: err.message,
      });
      if (!res.headersSent) {
        res.removeHeader("Content-Length");
        res.status(500).end();
      } else {
        // Headers (and a Content-Length) have gone: cut the connection so
        // the client sees a failed transfer, not a short file that looks
        // finished.
        res.destroy();
      }
    });

    stream.pipe(res);
  } catch (err) {
    // Express 4 does not catch a rejected async handler: without this an
    // unexpected throw left the request hanging and surfaced only as an
    // unhandled rejection.
    release();
    console.error("Remediation download error:", err);
    if (!res.headersSent) {
      res.removeHeader("Content-Type");
      res.removeHeader("Content-Disposition");
      res.removeHeader("Content-Length");
      res.status(500).json({ error: "Could not start the download" });
    } else {
      res.destroy();
    }
  }
});

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/receipt                                    */
/* -------------------------------------------------------------------- */

router.get("/remediate/:jobId/receipt", requireEnabled, (req: Request, res: Response) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  // C5: see the matching check in the /status route above — ownership is
  // the job token, 404 either way so existence isn't leaked.
  if (!isAuthorizedByToken(job, req)) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const events = getEventsForJob(job.id);
  const audits = getJobAuditPair(job.id);
  const verapdf = getJobVeraPdf(job.id);
  res.json({
    jobId: job.id,
    filename: job.inputFilename,
    contentHash: job.contentHash,
    status: job.status,
    inputScore: job.inputScore,
    outputScore: job.outputScore,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    inputAudit: audits.inputAudit,
    outputAudit: audits.outputAudit,
    veraPdf: verapdf,
    events: events.map((e) => ({
      event: e.event,
      occurredAt: e.occurredAt,
      details: e.details,
    })),
  });
});

export default router;

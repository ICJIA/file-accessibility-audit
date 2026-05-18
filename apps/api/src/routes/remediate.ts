import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authMiddleware, type AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter } from '../middleware/rateLimiter.js'
import { analyzePDF } from '../services/pdfAnalyzer.js'
import {
  createJob,
  getJob,
  countActiveJobsForEmail,
  verifyDownloadToken,
  setExpired,
  setInputAudit,
  getJobAuditPair,
} from '../services/remediationJobs.js'
import {
  recordEvent,
  getEventsForJob,
  deleteAndVerify,
} from '../services/remediationEvents.js'
import { AUTH, FILENAME, REMEDIATION } from '#config'

const router: IRouter = Router()

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.resolve(HERE, '../jobs/remediate.ts')

const remediateUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REMEDIATION.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are accepted'))
    }
  },
})

/**
 * Feature-flag gate. While REMEDIATION.ENABLED is false the entire
 * endpoint surface returns 404 so the feature is invisible to clients.
 */
function requireEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!REMEDIATION.ENABLED) {
    res.status(404).json({ error: 'Not Found' })
    return
  }
  next()
}

function sanitizeFilename(raw: string): string {
  let name = path.basename(raw)
  name = name.slice(0, FILENAME.MAX_LENGTH)
  name = name.replace(
    new RegExp(`[^${FILENAME.ALLOWED_CHARS.source.slice(1, -1)}]`, 'g'),
    '_',
  )
  return name || 'unnamed.pdf'
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function ensureOutputRoot(): Promise<void> {
  const outputRoot = path.resolve(REMEDIATION.OUTPUT_DIR)
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 })
}

function spawnWorker(jobId: string): void {
  // Detached child so the parent (API) doesn't have to wait. tsx is the
  // runtime loader used by both `pnpm dev` (`tsx watch`) and `pnpm start`
  // (`node --import tsx`); we pass it explicitly here so the worker
  // launches the same way regardless of how the parent was started.
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', WORKER_PATH, jobId],
    {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    },
  )
  child.unref()
}

/* -------------------------------------------------------------------- */
/* POST /api/remediate                                                  */
/* -------------------------------------------------------------------- */

router.post(
  '/remediate',
  requireEnabled,
  authMiddleware,
  analyzeLimiter,
  remediateUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }

      // Magic bytes check — same posture as /api/analyze
      const header = file.buffer.subarray(0, 5).toString('ascii')
      if (header !== '%PDF-') {
        res.status(400).json({
          error: 'This file does not appear to be a valid PDF.',
        })
        return
      }

      const filename = sanitizeFilename(file.originalname)
      const email = AUTH.REQUIRE_LOGIN ? (req.user?.email ?? null) : null

      // Per-user concurrent job limit
      if (email) {
        const active = countActiveJobsForEmail(email)
        if (active >= REMEDIATION.MAX_CONCURRENT_JOBS_PER_USER) {
          res.status(429).json({
            error: 'You already have a remediation in progress.',
            details:
              'Please wait for your current remediation to finish before starting another.',
          })
          return
        }
      }

      // Pre-flight audit — gives us inputScore and page count without
      // committing to a job yet. analyzePDF runs against the in-memory
      // buffer; nothing has been written to disk yet at this point.
      const preflight = await analyzePDF(file.buffer, filename)

      if (
        preflight.pageCount &&
        preflight.pageCount > REMEDIATION.MAX_PAGE_COUNT
      ) {
        res.status(413).json({
          error: 'PDF is too long for auto-remediation.',
          details: `Maximum is ${REMEDIATION.MAX_PAGE_COUNT} pages; this file has ${preflight.pageCount}.`,
        })
        return
      }

      const contentHash = sha256Hex(file.buffer)

      // Create job + scratch dir, write input, then spawn worker
      const { job, downloadToken } = createJob({
        email,
        inputFilename: filename,
        contentHash,
        pageCount: preflight.pageCount ?? null,
      })

      // Persist the pre-flight input score on the job row immediately so
      // the worker doesn't have to re-audit the input. Also persist the
      // full audit (categories) so the result page can show category-
      // level before/after without re-auditing.
      const setInputScore = (await import('../db/sqlite.js')).default.prepare(
        'UPDATE remediation_jobs SET input_score = ? WHERE id = ?',
      )
      setInputScore.run(preflight.overallScore, job.id)
      setInputAudit(job.id, JSON.stringify(preflight))

      await ensureOutputRoot()
      const jobDir = path.join(path.resolve(REMEDIATION.OUTPUT_DIR), job.id)
      const workDir = path.join(jobDir, 'work')
      await fs.mkdir(workDir, { recursive: true, mode: 0o700 })
      const inputPath = path.join(workDir, 'input.pdf')
      await fs.writeFile(inputPath, file.buffer, { mode: 0o600 })

      recordEvent(job.id, 'received', {
        filename,
        size_bytes: file.buffer.length,
        page_count: preflight.pageCount,
        input_score: preflight.overallScore,
      })

      spawnWorker(job.id)

      res.status(202).json({
        jobId: job.id,
        downloadToken,
        inputScore: preflight.overallScore,
        inputGrade: preflight.grade,
      })
    } catch (err) {
      const e = err as Error & { status?: number }
      console.error('Remediation request error:', e)
      if (e.status === 503) {
        res.status(503).json({ error: 'Server busy' })
        return
      }
      res.status(500).json({ error: 'Could not start remediation' })
    }
  },
)

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/status                                     */
/* -------------------------------------------------------------------- */

router.get(
  '/remediate/:jobId/status',
  requireEnabled,
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    const job = getJob(String(req.params.jobId))
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    // Authorize: row's email (if any) must match the requesting user
    if (AUTH.REQUIRE_LOGIN && job.email && job.email !== req.user?.email) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    res.json({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progressPct: job.progressPct,
      inputScore: job.inputScore,
      outputScore: job.outputScore,
      outputValid: job.outputValid,
      failureReason: job.failureReason,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    })
  },
)

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/download?token=...                         */
/* -------------------------------------------------------------------- */

router.get(
  '/remediate/:jobId/download',
  requireEnabled,
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const job = getJob(String(req.params.jobId))
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    if (AUTH.REQUIRE_LOGIN && job.email && job.email !== req.user?.email) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (job.status !== 'complete' || !job.outputPath) {
      if (job.status === 'expired') {
        res.status(410).json({ error: 'Output expired and was deleted.' })
        return
      }
      res.status(409).json({
        error: `Job is ${job.status}.`,
        details: 'Wait for completion before downloading.',
      })
      return
    }
    const presentedToken = String(req.query.token ?? '')
    if (!presentedToken || !verifyDownloadToken(job, presentedToken)) {
      res.status(403).json({ error: 'Invalid or missing download token.' })
      return
    }
    if (!existsSync(job.outputPath)) {
      setExpired(job.id)
      recordEvent(job.id, 'expired', { reason: 'file already gone at download' })
      res.status(410).json({ error: 'Output already deleted.' })
      return
    }

    const downloadName = sanitizeFilename(
      job.inputFilename.replace(/\.pdf$/i, '') + '_remediated.pdf',
    )
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"`,
    )

    let bytesSent = 0
    const buffer = await fs.readFile(job.outputPath)
    bytesSent = buffer.length

    // Delete the file after the response closes — whether due to a
    // successful stream-end or client disconnect. Single-use is the
    // privacy posture: no redownloads, no second chances.
    const cleanup = async (): Promise<void> => {
      recordEvent(job.id, 'downloaded', { bytes_sent: bytesSent })
      // Make absolutely sure we have a path before passing to
      // deleteAndVerify (TS narrowing — we already null-checked above)
      if (job.outputPath) {
        await deleteAndVerify(job.id, job.outputPath, 'download')
      }
      setExpired(job.id)
    }
    res.once('close', () => {
      void cleanup()
    })

    res.send(buffer)
  },
)

/* -------------------------------------------------------------------- */
/* GET /api/remediate/:jobId/receipt                                    */
/* -------------------------------------------------------------------- */

router.get(
  '/remediate/:jobId/receipt',
  requireEnabled,
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    const job = getJob(String(req.params.jobId))
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    if (AUTH.REQUIRE_LOGIN && job.email && job.email !== req.user?.email) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const events = getEventsForJob(job.id)
    const audits = getJobAuditPair(job.id)
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
      events: events.map((e) => ({
        event: e.event,
        occurredAt: e.occurredAt,
        details: e.details,
      })),
    })
  },
)

export default router

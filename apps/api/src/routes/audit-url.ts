import { Router, Response, type IRouter } from 'express'
import crypto from 'node:crypto'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter } from '../middleware/rateLimiter.js'
import { analyzePDF } from '../services/pdfAnalyzer.js'
import { DEPLOY, SHARED_REPORTS } from '#config'
import db from '../db/sqlite.js'
import {
  FETCH_TIMEOUT_MS,
  MAX_PDF_BYTES,
  fetchWithTimeout,
  isAllowedUrl,
} from './analyze-url.js'

const router: IRouter = Router()

// ---------------------------------------------------------------------------
// POST /api/audit-url
// ---------------------------------------------------------------------------
// Combined "analyze a PDF by URL and persist a shareable report" endpoint.
// Designed for fleet-audit automation: one call per PDF returns the
// strict / practical grades plus a stable reportUrl that can be embedded
// in the fleet inventory's HTML / CSV output.
//
// Body: { url: string, force?: boolean }
// Auth: required (authMiddleware accepts session cookie or Bearer PAT)
//
// Hash-based dedup (Policy A):
//   After fetching the PDF the server computes sha256(bytes). If an
//   unexpired shared_reports row already exists for (content_hash, email)
//   the existing reportUrl is returned and no new audit runs. Pass
//   force=true (body field) or ?force=true (query) to skip dedup and
//   produce a fresh audit + new reportId.
//
// Response shape — fleet-CSV friendly (every field a single scalar):
//   {
//     "filename":        "report.pdf",
//     "pageCount":       12,
//     "audited":         "2026-05-18T15:32:11.000Z",
//     "strict":   { "score": 49, "grade": "F" },
//     "practical":{ "score": 49, "grade": "F" },
//     "reportId":        "<32 hex chars>",
//     "reportUrl":       "https://audit.icjia.app/report/<id>",
//     "reportExpiresAt": "2027-05-18T15:32:11.000Z",
//     "cached":          false
//   }
// ---------------------------------------------------------------------------

interface DedupRow {
  id: string
  report_json: string
  filename: string
  expires_at: string
}

function getReportBaseUrl(): string {
  // Mirror the CORS resolution in apps/api/src/index.ts.
  const isProduction = process.env.NODE_ENV === 'production'
  return isProduction ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL
}

function buildReportUrl(id: string): string {
  return `${getReportBaseUrl()}/report/${id}`
}

router.post(
  '/audit-url',
  authMiddleware,
  analyzeLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const url = req.body?.url
      if (typeof url !== 'string' || url.length === 0) {
        res.status(400).json({ error: 'Missing required field: url' })
        return
      }

      // Honor either body.force or ?force=true for CLI ergonomics.
      const force =
        req.body?.force === true ||
        req.body?.force === 'true' ||
        req.query?.force === 'true'

      const check = isAllowedUrl(url)
      if (!check.ok) {
        res.status(400).json({
          error: 'URL not allowed',
          details: check.reason,
        })
        return
      }

      let fetchResp: globalThis.Response
      try {
        fetchResp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
      } catch (err: any) {
        const msg =
          err?.name === 'AbortError'
            ? `fetch timed out after ${FETCH_TIMEOUT_MS}ms`
            : `fetch failed: ${err?.message ?? String(err)}`
        res.status(502).json({ error: msg })
        return
      }

      if (!fetchResp.ok) {
        res.status(502).json({
          error: `fetch returned ${fetchResp.status} ${fetchResp.statusText}`,
        })
        return
      }

      const buf = Buffer.from(await fetchResp.arrayBuffer())

      if (buf.length > MAX_PDF_BYTES) {
        res.status(413).json({
          error: `PDF too large (${buf.length} bytes > ${MAX_PDF_BYTES} cap)`,
        })
        return
      }

      const header = buf.subarray(0, 5).toString('ascii')
      if (header !== '%PDF-') {
        res.status(422).json({
          error: 'Fetched content is not a valid PDF.',
          details: `The first 5 bytes were '${header}', expected '%PDF-'. Verify the URL points directly at a PDF file.`,
        })
        return
      }

      const contentHash = crypto.createHash('sha256').update(buf).digest('hex')

      // --- Dedup lookup -------------------------------------------------
      // Unless force=true, look for an unexpired report owned by this
      // caller with the same content hash. If found, short-circuit with
      // the cached entry so the fleet inventory keeps a stable URL.
      if (!force) {
        const existing = db
          .prepare<
            [string, string, string]
          >(
            `SELECT id, report_json, filename, expires_at
               FROM shared_reports
              WHERE email = ?
                AND content_hash = ?
                AND expires_at > ?
              ORDER BY created_at DESC
              LIMIT 1`,
          )
          .get(req.user!.email, contentHash, new Date().toISOString()) as
          | DedupRow
          | undefined

        if (existing) {
          const cached = JSON.parse(existing.report_json)
          res.json({
            filename: existing.filename,
            pageCount: cached.pageCount ?? null,
            audited: cached.audited ?? null,
            strict: extractProfileScore(cached, 'strict'),
            practical: extractProfileScore(cached, 'practical'),
            reportId: existing.id,
            reportUrl: buildReportUrl(existing.id),
            reportExpiresAt: existing.expires_at,
            cached: true,
          })
          return
        }
      }

      // --- Fresh audit + persist ----------------------------------------
      const rawName =
        check.parsed!.pathname.split('/').pop() ?? 'remote.pdf'
      const filename = rawName.slice(0, 200) || 'remote.pdf'

      const result = await analyzePDF(buf, filename)
      const audited = new Date().toISOString()

      const id = crypto.randomBytes(16).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS)
      const reportExpiresAt = expiresAt.toISOString()

      // Persist with the audited timestamp baked into the report payload
      // so cached responses can return the original audit time later.
      const persistPayload = { ...result, audited }

      db.prepare(
        `INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        req.user!.email,
        filename,
        JSON.stringify(persistPayload),
        contentHash,
        reportExpiresAt,
      )

      res.json({
        filename,
        pageCount: result.pageCount ?? null,
        audited,
        strict: extractProfileScore(result, 'strict'),
        practical: extractProfileScore(result, 'practical'),
        reportId: id,
        reportUrl: buildReportUrl(id),
        reportExpiresAt,
        cached: false,
      })
    } catch (err: any) {
      if (err?.status === 503) {
        res.status(503).json({
          error: 'The server is busy processing other files.',
          details: 'Please wait a moment and try again.',
        })
        return
      }

      console.error('audit-url error:', err)
      res
        .status(500)
        .json({ error: 'Internal server error', details: err?.message })
    }
  },
)

// Extract the strict/practical scalar pair from an AnalysisResult-shaped
// payload. Falls back to the top-level overallScore/grade when scoreProfiles
// is absent (older persisted payloads).
function extractProfileScore(
  payload: any,
  mode: 'strict' | 'practical',
): { score: number | null; grade: string | null } {
  const profile = payload?.scoreProfiles?.[mode]
  if (profile && typeof profile.overallScore === 'number') {
    return {
      score: profile.overallScore,
      grade: profile.grade ?? null,
    }
  }
  // Fallback: legacy payload — strict and practical were the same.
  if (typeof payload?.overallScore === 'number') {
    return { score: payload.overallScore, grade: payload.grade ?? null }
  }
  return { score: null, grade: null }
}

export default router

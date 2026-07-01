import { Router, Request, Response, type IRouter } from 'express'
import crypto from 'node:crypto'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { reportsLimiter } from '../middleware/rateLimiter.js'
import { SHARED_REPORTS } from '#config'
import db from '../db/sqlite.js'

const router: IRouter = Router()

// POST /api/reports — save a report and return a shareable ID
router.post(
  '/reports',
  authMiddleware,
  reportsLimiter,
  (req: AuthRequest, res: Response) => {
    try {
      const { report } = req.body

      // Type-validate the fields we later interpolate. The shared-report page
      // renders via Vue mustache (escaped) and the HTML export escapes output,
      // but constraining the stored shape here is defense-in-depth against the
      // arbitrary-JSON store being abused (e.g. a non-numeric score/grade).
      if (
        !report ||
        typeof report.filename !== 'string' ||
        typeof report.overallScore !== 'number' ||
        !Number.isFinite(report.overallScore)
      ) {
        res.status(400).json({ error: 'Invalid report data' })
        return
      }

      const id = crypto.randomBytes(16).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS)

      db.prepare(
        'INSERT INTO shared_reports (id, email, filename, report_json, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, req.user!.email, report.filename, JSON.stringify(report), expiresAt.toISOString())

      res.json({ id, expiresAt: expiresAt.toISOString() })
    } catch (err: any) {
      console.error('Report save error:', err)
      res.status(500).json({ error: 'Failed to save report' })
    }
  }
)

// GET /api/reports/:id — retrieve a shared report (public, no auth)
router.get('/reports/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) {
      res.status(400).json({ error: 'Invalid report ID' })
      return
    }

    const row = db.prepare(
      'SELECT report_json, expires_at, created_at, email FROM shared_reports WHERE id = ?'
    ).get(id) as { report_json: string; expires_at: string; created_at: string; email: string } | undefined

    if (!row) {
      res.status(404).json({ error: 'Report not found' })
      return
    }

    if (new Date(row.expires_at) < new Date()) {
      res.status(410).json({ error: 'This report link has expired' })
      return
    }

    const report = JSON.parse(row.report_json)

    // Note: the sharer's email is intentionally NOT returned. This endpoint
    // is public (share links are bearer-style), and the creator's identity
    // is not needed by recipients — exposing it would leak PII to anyone
    // holding the link.
    res.json({
      report,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })
  } catch (err: any) {
    console.error('Report fetch error:', err)
    res.status(500).json({ error: 'Failed to load report' })
  }
})

export default router

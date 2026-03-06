import { Router, Response, type IRouter } from 'express'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { UI } from '#config'
import db from '../db/sqlite.js'

const router: IRouter = Router()

// GET /api/logs — admin only, all audit log entries
router.get('/logs', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(UI.MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || UI.DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * limit

    const total = (db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as any).count
    const rows = db.prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset)

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error('Logs error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/my-history — user's own analyze events
router.get('/my-history', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(UI.MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || UI.DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * limit

    const email = req.user!.email

    const total = (db.prepare(
      'SELECT COUNT(*) as count FROM audit_log WHERE email = ? AND event_type = ?'
    ).get(email, 'analyze') as any).count

    const rows = db.prepare(
      'SELECT id, filename, score, grade, created_at FROM audit_log WHERE email = ? AND event_type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(email, 'analyze', limit, offset)

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error('My history error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

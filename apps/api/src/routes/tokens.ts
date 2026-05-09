import { Router, type IRouter, Response } from 'express'
import crypto from 'node:crypto'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import db from '../db/sqlite.js'

const router: IRouter = Router()

const TOKEN_PREFIX = 'fap_'
const TOKEN_BODY_BYTES = 16        // 16 bytes → 32 hex chars
const MAX_TOKENS_PER_USER = 10
const MAX_TOKEN_NAME_LENGTH = 100

function generateToken() {
  const body = crypto.randomBytes(TOKEN_BODY_BYTES).toString('hex')
  const raw = `${TOKEN_PREFIX}${body}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const id = crypto.randomBytes(8).toString('hex')
  return { id, raw, hash }
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_NAME_LENGTH) return null
  // Allow letters, numbers, spaces, dashes, underscores, dots
  if (!/^[A-Za-z0-9 _.-]+$/.test(trimmed)) return null
  return trimmed
}

// ---------------------------------------------------------------------------
// POST /api/tokens
// Body: { name: string }
// Auth: session-only. PAT-authenticated requests are rejected here to prevent
//       a leaked token from being used to mint more tokens.
// Returns: { id, name, token, createdAt, note }
//
// The raw token is shown once in the response. The DB stores only SHA-256.
// ---------------------------------------------------------------------------

router.post('/tokens', authMiddleware, (req: AuthRequest, res: Response) => {
  // Reject if this request is authenticated by a PAT — only browser sessions
  // may mint new tokens.
  if (req.user?.authMethod === 'pat') {
    res.status(403).json({
      error: 'Personal access tokens cannot be used to mint other tokens. Sign in with your browser to manage tokens.',
    })
    return
  }

  const name = sanitizeName(req.body?.name)
  if (!name) {
    res.status(400).json({
      error: 'Invalid token name.',
      details: `Provide a non-empty name (max ${MAX_TOKEN_NAME_LENGTH} chars) using letters, numbers, spaces, dashes, underscores, or dots.`,
    })
    return
  }

  const email = req.user!.email

  const existing = db.prepare(
    'SELECT COUNT(*) as count FROM access_tokens WHERE email = ? AND revoked_at IS NULL'
  ).get(email) as { count: number }

  if (existing.count >= MAX_TOKENS_PER_USER) {
    res.status(429).json({
      error: `Maximum ${MAX_TOKENS_PER_USER} active tokens per user. Revoke an old one to create a new one.`,
    })
    return
  }

  const { id, raw, hash } = generateToken()
  const now = new Date().toISOString()

  db.prepare(
    'INSERT INTO access_tokens (id, email, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, name, hash, now)

  res.status(201).json({
    id,
    name,
    token: raw,
    createdAt: now,
    note: 'Save this token now. You will not be able to see it again.',
  })
})

// ---------------------------------------------------------------------------
// GET /api/tokens
// Lists the caller's tokens. Metadata only — raw tokens are never returned.
// ---------------------------------------------------------------------------

router.get('/tokens', authMiddleware, (req: AuthRequest, res: Response) => {
  const email = req.user!.email

  const rows = db.prepare(
    'SELECT id, name, created_at, last_used_at, revoked_at FROM access_tokens WHERE email = ? ORDER BY created_at DESC'
  ).all(email) as Array<{
    id: string
    name: string
    created_at: string
    last_used_at: string | null
    revoked_at: string | null
  }>

  res.json({
    tokens: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      revokedAt: r.revoked_at,
      active: r.revoked_at === null,
    })),
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/tokens/:id
// Revokes a token. Sets revoked_at; does not delete the row (preserves audit trail).
// PAT-authenticated requests are rejected.
// ---------------------------------------------------------------------------

router.delete('/tokens/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  if (req.user?.authMethod === 'pat') {
    res.status(403).json({
      error: 'Personal access tokens cannot revoke tokens. Sign in with your browser.',
    })
    return
  }

  const email = req.user!.email
  const { id } = req.params

  if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id)) {
    res.status(400).json({ error: 'Invalid token ID.' })
    return
  }

  const result = db.prepare(
    'UPDATE access_tokens SET revoked_at = ? WHERE id = ? AND email = ? AND revoked_at IS NULL'
  ).run(new Date().toISOString(), id, email)

  if (result.changes === 0) {
    res.status(404).json({ error: 'Token not found or already revoked.' })
    return
  }

  res.json({ revoked: true, id })
})

export default router

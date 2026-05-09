import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { AUTH } from '#config'
import db from '../db/sqlite.js'

export interface AuthRequest extends Request {
  user?: { email: string; authMethod?: 'session' | 'pat'; tokenId?: string }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production'

const TOKEN_PREFIX = 'fap_'

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  // When auth is disabled, allow all requests with an anonymous user
  if (!AUTH.REQUIRE_LOGIN) {
    req.user = { email: 'anonymous', authMethod: 'session' }
    next()
    return
  }

  // ---------------------------------------------------------------------------
  // PAT branch — check for Authorization: Bearer fap_xxx header
  // ---------------------------------------------------------------------------
  const authHeader = req.headers?.authorization
  if (typeof authHeader === 'string' && authHeader.startsWith(`Bearer ${TOKEN_PREFIX}`)) {
    const raw = authHeader.slice('Bearer '.length)
    const hash = crypto.createHash('sha256').update(raw).digest('hex')

    const row = db.prepare(
      'SELECT id, email FROM access_tokens WHERE token_hash = ? AND revoked_at IS NULL'
    ).get(hash) as { id: string; email: string } | undefined

    if (row) {
      // Update last-used timestamp (best-effort — failure is non-fatal)
      try {
        db.prepare('UPDATE access_tokens SET last_used_at = ? WHERE id = ?')
          .run(new Date().toISOString(), row.id)
      } catch {
        // ignore — a failed timestamp update must not block the request
      }
      req.user = { email: row.email, authMethod: 'pat', tokenId: row.id }
      next()
      return
    }

    // Bearer header was present but token didn't match a valid active record
    res.status(401).json({ error: 'Invalid or revoked access token.' })
    return
  }

  // ---------------------------------------------------------------------------
  // Session (cookie JWT) branch — existing behaviour
  // ---------------------------------------------------------------------------
  const token = req.cookies?.token

  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as { email: string }

    req.user = { email: payload.email, authMethod: 'session' }
    next()
  } catch {
    res.status(401).json({ error: 'Your session has expired — please log in again' })
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  const userEmail = req.user?.email?.toLowerCase()

  if (!userEmail || !adminEmails.includes(userEmail)) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  next()
}

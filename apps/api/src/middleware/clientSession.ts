import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { BATCH_QUEUE } from '#config'
import {
  createBrowserSession,
  createClient,
  deleteExpiredSessions,
  getBrowserSession,
  nowIso,
  sessionExpiryIso,
  touchBrowserSession,
  touchClient,
} from '../services/queueStore.js'

const CLIENT_SESSION_COOKIE = 'client_session'
const CLIENT_SESSION_SECRET = process.env.CLIENT_SESSION_SECRET || process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production'

export interface ClientSessionRequest extends Request {
  clientId?: string
  clientSessionId?: string
}

interface ClientSessionPayload {
  clientId: string
  sid: string
  exp: number
}

function readClientId(req: Request): string | null {
  const headerValue = req.get('x-client-id')
  const bodyValue = typeof req.body?.clientId === 'string' ? req.body.clientId : null
  const queryValue = typeof req.query.clientId === 'string' ? req.query.clientId : null
  const candidate = headerValue || bodyValue || queryValue
  if (!candidate || !/^[a-f0-9-]{20,}$/i.test(candidate)) return null
  return candidate
}

function signClientSession(clientId: string, sessionId: string, expiresAt: string): string {
  const expiresInSec = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  return jwt.sign({ clientId, sid: sessionId }, CLIENT_SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: expiresInSec,
  })
}

function setClientSessionCookie(res: Response, clientId: string, sessionId: string, expiresAt: string): void {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie(CLIENT_SESSION_COOKIE, signClientSession(clientId, sessionId, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    expires: new Date(expiresAt),
  })
}

export function bootstrapClientSession(req: ClientSessionRequest, res: Response): void {
  deleteExpiredSessions()
  const clientId = readClientId(req)
  if (!clientId) {
    res.status(400).json({ error: 'Valid clientId is required' })
    return
  }

  createClient(clientId)
  const session = createBrowserSession(clientId)
  setClientSessionCookie(res, clientId, session.id, session.expiresAt)

  req.clientId = clientId
  req.clientSessionId = session.id
  res.json({
    clientId,
    expiresAt: session.expiresAt,
    renewedAt: nowIso(),
  })
}

export function requireClientSession(req: ClientSessionRequest, res: Response, next: NextFunction): void {
  deleteExpiredSessions()
  const clientId = readClientId(req)
  const token = req.cookies?.[CLIENT_SESSION_COOKIE]

  if (!clientId || !token) {
    res.status(401).json({ error: 'Client session required' })
    return
  }

  try {
    const payload = jwt.verify(token, CLIENT_SESSION_SECRET, { algorithms: ['HS256'] }) as ClientSessionPayload
    if (payload.clientId !== clientId) {
      res.status(401).json({ error: 'Client session mismatch' })
      return
    }

    const session = getBrowserSession(payload.sid)
    if (!session || session.client_id !== clientId || new Date(session.expires_at).getTime() <= Date.now()) {
      res.status(401).json({ error: 'Client session expired' })
      return
    }

    const renewThresholdMs = BATCH_QUEUE.AUTO_RENEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    let nextExpiry = session.expires_at
    if (new Date(session.expires_at).getTime() - Date.now() < renewThresholdMs) {
      nextExpiry = sessionExpiryIso()
      touchBrowserSession(session.id, nextExpiry)
      setClientSessionCookie(res, clientId, session.id, nextExpiry)
    } else {
      touchBrowserSession(session.id)
    }

    touchClient(clientId)
    req.clientId = clientId
    req.clientSessionId = session.id
    next()
  } catch {
    res.status(401).json({ error: 'Client session expired' })
  }
}

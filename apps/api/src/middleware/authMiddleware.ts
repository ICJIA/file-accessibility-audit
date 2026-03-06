import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  user?: { email: string }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production'

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token

  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as { email: string }

    req.user = { email: payload.email }
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

import { Router, Request, Response, type IRouter } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db/sqlite.js'
import { sendOTP } from '../mailer.js'
import { authRequestLimiter, authVerifyLimiter } from '../middleware/rateLimiter.js'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { AUTH } from '#config'

const router: IRouter = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production'
const isProduction = process.env.NODE_ENV === 'production'

function isAllowedEmail(email: string): boolean {
  if (AUTH.ALLOWED_EMAIL_REGEX.test(email)) return true
  // In development, allow extra domains from env
  if (!isProduction && process.env.ALLOWED_DOMAINS) {
    const extraDomains = process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim())
    const emailDomain = email.split('@')[1]?.toLowerCase()
    return extraDomains.some(d => emailDomain === d || emailDomain?.endsWith(`.${d}`))
  }
  return false
}

function logEvent(eventType: string, email: string, req: Request, extra?: { filename?: string; score?: number; grade?: string }) {
  const stmt = db.prepare(
    'INSERT INTO audit_log (event_type, email, filename, score, grade, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  stmt.run(eventType, email, extra?.filename || null, extra?.score || null, extra?.grade || null, req.ip || null, req.get('user-agent') || null)
}

// POST /api/auth/request — send OTP
router.post('/request', authRequestLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!isAllowedEmail(normalizedEmail)) {
      res.status(400).json({ error: 'Only @illinois.gov email addresses are allowed' })
      return
    }

    // Clean up expired OTPs
    db.prepare('DELETE FROM otp_codes WHERE expires_at < datetime(\'now\')').run()

    // Invalidate any existing OTPs for this email
    db.prepare('DELETE FROM otp_codes WHERE email = ?').run(normalizedEmail)

    // Generate OTP using crypto.randomInt (NOT Math.random)
    const otp = crypto.randomInt(100000, 999999).toString()
    const otpHash = await bcrypt.hash(otp, 10)

    const expiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES) || AUTH.OTP_EXPIRY_MINUTES
    db.prepare(
      'INSERT INTO otp_codes (email, otp_hash, expires_at) VALUES (?, ?, datetime(\'now\', ?))'
    ).run(normalizedEmail, otpHash, `+${expiryMinutes} minutes`)

    // Log OTP request
    logEvent('otp_request', normalizedEmail, req)

    // Send OTP email
    try {
      await sendOTP(normalizedEmail, otp)
    } catch (err) {
      console.error('SMTP error:', err)
      res.status(503).json({ error: 'Unable to send verification email. Please try again in a few minutes.' })
      return
    }

    res.json({ message: 'Verification code sent to your email' })
  } catch (err) {
    console.error('Auth request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/verify — verify OTP, issue JWT
router.post('/verify', authVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body

    if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
      res.status(400).json({ error: 'Email and verification code are required' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Find the most recent unexpired OTP for this email
    const row = db.prepare(
      'SELECT * FROM otp_codes WHERE email = ? AND expires_at > datetime(\'now\') ORDER BY created_at DESC LIMIT 1'
    ).get(normalizedEmail) as any

    if (!row) {
      res.status(400).json({ error: 'No valid verification code found. Please request a new one.' })
      return
    }

    // Check attempt limit
    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || AUTH.OTP_MAX_ATTEMPTS
    if (row.attempts >= maxAttempts) {
      // Invalidate this OTP
      db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id)
      res.status(400).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' })
      return
    }

    // Increment attempts
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id)

    // Verify OTP
    const isValid = await bcrypt.compare(otp, row.otp_hash)
    if (!isValid) {
      const remaining = maxAttempts - row.attempts - 1
      res.status(400).json({
        error: remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid verification code. Maximum attempts exceeded. Please request a new code.',
      })
      return
    }

    // OTP is valid — delete it
    db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id)

    // Issue JWT
    const expiryHours = Number(process.env.JWT_EXPIRY_HOURS) || AUTH.JWT_EXPIRY_HOURS
    const token = jwt.sign({ email: normalizedEmail }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: `${expiryHours}h`,
    })

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: expiryHours * 60 * 60 * 1000,
    })

    // Log login
    logEvent('login', normalizedEmail, req)

    res.json({ ok: true })
  } catch (err) {
    console.error('Auth verify error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  if (req.user) {
    logEvent('logout', req.user.email, req)
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  })

  res.json({ ok: true })
})

// GET /api/auth/me — check auth status
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = adminEmails.includes(req.user!.email.toLowerCase())
  res.json({ email: req.user!.email, isAdmin })
})

export default router

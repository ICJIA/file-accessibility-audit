import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Response, NextFunction } from 'express'

// Force auth-enabled mode for these tests
vi.mock('#config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#config')>()
  return { ...actual, AUTH: { ...actual.AUTH, REQUIRE_LOGIN: true } }
})

const { authMiddleware, adminMiddleware } = await import('../middleware/authMiddleware.js')
import type { AuthRequest } from '../middleware/authMiddleware.js'

// ---------------------------------------------------------------------------
// Helpers: mock Express req / res / next
// ---------------------------------------------------------------------------

const JWT_SECRET = 'dev-secret-do-not-use-in-production'

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    cookies: {},
    ...overrides,
  } as AuthRequest
}

function makeRes(): Response {
  const res: any = {
    _status: 0,
    _json: null,
    status(code: number) {
      res._status = code
      return res
    },
    json(body: any) {
      res._json = body
      return res
    },
  }
  return res as Response
}

function makeNext(): NextFunction & { called: boolean } {
  const fn: any = () => { fn.called = true }
  fn.called = false
  return fn
}

// ---------------------------------------------------------------------------
// authMiddleware
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  it('returns 401 when no token cookie is present', () => {
    const req = makeReq({ cookies: {} })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect((res as any)._json.error).toContain('Authentication required')
    expect(next.called).toBe(false)
  })

  it('returns 401 when cookies object is undefined', () => {
    const req = makeReq()
    // Simulate no cookie-parser: cookies is undefined
    ;(req as any).cookies = undefined
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect(next.called).toBe(false)
  })

  it('returns 401 when token is invalid', () => {
    const req = makeReq({ cookies: { token: 'garbage.token.here' } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect((res as any)._json.error).toContain('expired')
    expect(next.called).toBe(false)
  })

  it('returns 401 when token is expired', () => {
    const token = jwt.sign({ email: 'user@illinois.gov' }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s', // already expired
    })
    const req = makeReq({ cookies: { token } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect(next.called).toBe(false)
  })

  it('returns 401 when token uses wrong algorithm', () => {
    // Sign with HS384 but middleware only accepts HS256
    const token = jwt.sign({ email: 'user@illinois.gov' }, JWT_SECRET, {
      algorithm: 'HS384',
    })
    const req = makeReq({ cookies: { token } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect(next.called).toBe(false)
  })

  it('returns 401 when token signed with wrong secret', () => {
    const token = jwt.sign({ email: 'user@illinois.gov' }, 'wrong-secret', {
      algorithm: 'HS256',
    })
    const req = makeReq({ cookies: { token } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect((res as any)._status).toBe(401)
    expect(next.called).toBe(false)
  })

  it('sets req.user and calls next() with a valid token', () => {
    const token = jwt.sign({ email: 'user@illinois.gov' }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    })
    const req = makeReq({ cookies: { token } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(true)
    expect(req.user).toBeDefined()
    expect(req.user!.email).toBe('user@illinois.gov')
  })

  it('preserves full email from token payload', () => {
    const token = jwt.sign({ email: 'admin@icjia.illinois.gov' }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    })
    const req = makeReq({ cookies: { token } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(req.user!.email).toBe('admin@icjia.illinois.gov')
  })
})

// ---------------------------------------------------------------------------
// adminMiddleware
// ---------------------------------------------------------------------------

describe('adminMiddleware', () => {
  const originalEnv = process.env.ADMIN_EMAILS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADMIN_EMAILS
    } else {
      process.env.ADMIN_EMAILS = originalEnv
    }
  })

  it('returns 403 when user is not in ADMIN_EMAILS', () => {
    process.env.ADMIN_EMAILS = 'boss@illinois.gov'
    const req = makeReq()
    req.user = { email: 'regular@illinois.gov' }
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect((res as any)._status).toBe(403)
    expect((res as any)._json.error).toContain('Admin')
    expect(next.called).toBe(false)
  })

  it('returns 403 when req.user is not set', () => {
    process.env.ADMIN_EMAILS = 'boss@illinois.gov'
    const req = makeReq()
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect((res as any)._status).toBe(403)
    expect(next.called).toBe(false)
  })

  it('returns 403 when ADMIN_EMAILS is empty', () => {
    process.env.ADMIN_EMAILS = ''
    const req = makeReq()
    req.user = { email: 'anyone@illinois.gov' }
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect((res as any)._status).toBe(403)
    expect(next.called).toBe(false)
  })

  it('calls next() when user email matches ADMIN_EMAILS', () => {
    process.env.ADMIN_EMAILS = 'boss@illinois.gov,admin@illinois.gov'
    const req = makeReq()
    req.user = { email: 'admin@illinois.gov' }
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect(next.called).toBe(true)
  })

  it('comparison is case-insensitive', () => {
    process.env.ADMIN_EMAILS = 'Admin@Illinois.GOV'
    const req = makeReq()
    req.user = { email: 'admin@illinois.gov' }
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect(next.called).toBe(true)
  })

  it('handles whitespace in ADMIN_EMAILS list', () => {
    process.env.ADMIN_EMAILS = ' boss@illinois.gov , admin@illinois.gov '
    const req = makeReq()
    req.user = { email: 'admin@illinois.gov' }
    const res = makeRes()
    const next = makeNext()

    adminMiddleware(req, res, next)

    expect(next.called).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isAllowedEmail — tested via the auth route module
// ---------------------------------------------------------------------------

describe('isAllowedEmail (via auth route)', () => {
  // isAllowedEmail is not exported, but we can test the regex from the config
  // and the domain logic by importing AUTH directly.

  // We import the regex from config and test it directly since the function
  // is private to the auth route module.
  let ALLOWED_EMAIL_REGEX: RegExp

  beforeEach(async () => {
    const config = await import('#config')
    ALLOWED_EMAIL_REGEX = config.AUTH.ALLOWED_EMAIL_REGEX
  })

  it('accepts user@illinois.gov', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@illinois.gov')).toBe(true)
  })

  it('accepts user@icjia.illinois.gov (subdomain)', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@icjia.illinois.gov')).toBe(true)
  })

  it('accepts user@dhs.illinois.gov (another subdomain)', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@dhs.illinois.gov')).toBe(true)
  })

  it('accepts user@deep.sub.illinois.gov (deep subdomain)', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@deep.sub.illinois.gov')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(ALLOWED_EMAIL_REGEX.test('User@ILLINOIS.GOV')).toBe(true)
  })

  it('rejects user@gmail.com', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@gmail.com')).toBe(false)
  })

  it('rejects user@notillinois.gov', () => {
    expect(ALLOWED_EMAIL_REGEX.test('user@notillinois.gov')).toBe(false)
  })

  it('rejects user@illinois.gov.evil.com', () => {
    // The regex anchors with $, so this should not match
    expect(ALLOWED_EMAIL_REGEX.test('user@illinois.gov.evil.com')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(ALLOWED_EMAIL_REGEX.test('')).toBe(false)
  })

  it('rejects email without @ sign', () => {
    expect(ALLOWED_EMAIL_REGEX.test('userillinois.gov')).toBe(false)
  })

  it('rejects @illinois.gov without local part', () => {
    expect(ALLOWED_EMAIL_REGEX.test('@illinois.gov')).toBe(false)
  })
})

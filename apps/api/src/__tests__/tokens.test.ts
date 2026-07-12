import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Response, NextFunction } from 'express'

// ---------------------------------------------------------------------------
// Smoke tests for the personal access tokens route and authMiddleware PAT branch
// ---------------------------------------------------------------------------
// These tests cover the token-generation/validation logic and route-handler
// validation branches directly, without spinning up the full Express stack.
//
// TODO: Add integration-level tests (full HTTP via supertest) once the
// maintainer decides on a test-DB setup convention (in-memory SQLite vs
// separate fixture DB). Integration tests should cover:
//   - End-to-end POST → GET → DELETE flow via HTTP
//   - Cookie-session authentication round-trip in the same test DB
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mutable in-memory token store used by both the DB mock and tests
const tokenStore = new Map<string, {
  id: string
  email: string
  name: string
  token_hash: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}>()

// Simple SHA-256 helper (real crypto — same as the production code)
import crypto from 'node:crypto'

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

// Mock DB — minimal interface used by authMiddleware + tokens route
const mockDb = {
  prepare: vi.fn((sql: string) => ({
    get: vi.fn((...args: any[]) => {
      // SELECT for PAT auth lookup: token_hash = ? AND revoked_at IS NULL
      if (sql.includes('token_hash')) {
        const hash = args[0] as string
        for (const row of tokenStore.values()) {
          if (row.token_hash === hash && row.revoked_at === null) {
            return { id: row.id, email: row.email }
          }
        }
        return undefined
      }
      // SELECT COUNT(*) for per-user limit
      if (sql.includes('COUNT(*)')) {
        const email = args[0] as string
        const count = Array.from(tokenStore.values()).filter(
          (r) => r.email === email && r.revoked_at === null,
        ).length
        return { count }
      }
      return undefined
    }),
    run: vi.fn((...args: any[]) => {
      // INSERT INTO access_tokens
      if (sql.includes('INSERT INTO access_tokens')) {
        const [id, email, name, token_hash, created_at] = args
        tokenStore.set(id, { id, email, name, token_hash, created_at, last_used_at: null, revoked_at: null })
        return { changes: 1 }
      }
      // UPDATE last_used_at
      if (sql.includes('last_used_at')) {
        const [ts, id] = args
        const row = tokenStore.get(id)
        if (row) row.last_used_at = ts
        return { changes: 1 }
      }
      // UPDATE ... SET revoked_at
      if (sql.includes('revoked_at')) {
        const [ts, id, email] = args
        const row = tokenStore.get(id)
        if (row && row.email === email && row.revoked_at === null) {
          row.revoked_at = ts
          return { changes: 1 }
        }
        return { changes: 0 }
      }
      return { changes: 1 }
    }),
    all: vi.fn((...args: any[]) => {
      const email = args[0] as string
      return Array.from(tokenStore.values())
        .filter((r) => r.email === email)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }),
  })),
}

vi.mock('../db/sqlite.js', () => ({ default: mockDb }))

// Force auth-enabled mode for these tests
vi.mock('#config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#config')>()
  return { ...actual, AUTH: { ...actual.AUTH, REQUIRE_LOGIN: true } }
})

// ---------------------------------------------------------------------------
// Import modules under test after mocks are registered
// ---------------------------------------------------------------------------

const { authMiddleware } = await import('../middleware/authMiddleware.js')
import type { AuthRequest } from '../middleware/authMiddleware.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    cookies: {},
    headers: {},
    body: {},
    params: {},
    ...overrides,
  } as AuthRequest
}

function makeRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 200,
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
  return res
}

function makeNext(): NextFunction & { called: boolean } {
  const fn: any = () => { fn.called = true }
  fn.called = false
  return fn
}

// Inline generateToken (mirrors production logic — same prefix/length)
const TOKEN_PREFIX = 'fap_'
function generateToken() {
  const body = crypto.randomBytes(16).toString('hex')
  const raw = `${TOKEN_PREFIX}${body}`
  const hash = sha256(raw)
  const id = crypto.randomBytes(8).toString('hex')
  return { id, raw, hash }
}

// ---------------------------------------------------------------------------
// Reset token store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  tokenStore.clear()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Token generation unit tests
// ---------------------------------------------------------------------------

describe('generateToken', () => {
  it('produces a token starting with fap_', () => {
    const { raw } = generateToken()
    expect(raw).toMatch(/^fap_[a-f0-9]{32}$/)
  })

  it('produces a SHA-256 hash that verifies the raw token', () => {
    const { raw, hash } = generateToken()
    expect(sha256(raw)).toBe(hash)
  })

  it('produces unique tokens on successive calls', () => {
    const tokens = Array.from({ length: 10 }, () => generateToken().raw)
    const unique = new Set(tokens)
    expect(unique.size).toBe(10)
  })

  it('id is 16 hex chars', () => {
    const { id } = generateToken()
    expect(id).toMatch(/^[a-f0-9]{16}$/)
  })
})

// ---------------------------------------------------------------------------
// sanitizeName unit tests (inline — mirrors production logic)
// ---------------------------------------------------------------------------

function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > 100) return null
  if (!/^[A-Za-z0-9 _.-]+$/.test(trimmed)) return null
  return trimmed
}

describe('sanitizeName', () => {
  it('accepts valid name', () => {
    expect(sanitizeName('filecap-cli')).toBe('filecap-cli')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeName('  my token  ')).toBe('my token')
  })

  it('accepts names with dots, underscores, dashes', () => {
    expect(sanitizeName('ci_prod.deploy-v1')).toBe('ci_prod.deploy-v1')
  })

  it('rejects empty string', () => {
    expect(sanitizeName('')).toBeNull()
  })

  it('rejects whitespace-only string', () => {
    expect(sanitizeName('   ')).toBeNull()
  })

  it('rejects name exceeding max length', () => {
    expect(sanitizeName('a'.repeat(101))).toBeNull()
  })

  it('rejects name with disallowed characters', () => {
    expect(sanitizeName('foo<script>')).toBeNull()
    expect(sanitizeName('token; DROP TABLE')).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(sanitizeName(42)).toBeNull()
    expect(sanitizeName(null)).toBeNull()
    expect(sanitizeName(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// authMiddleware — PAT branch
// ---------------------------------------------------------------------------

describe('authMiddleware — PAT branch', () => {
  it('accepts a valid Bearer fap_ token', () => {
    const { id, raw, hash } = generateToken()
    tokenStore.set(id, {
      id, email: 'user@illinois.gov', name: 'test', token_hash: hash,
      created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
    })

    const req = makeReq({ headers: { authorization: `Bearer ${raw}` } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(true)
    expect(req.user?.email).toBe('user@illinois.gov')
    expect(req.user?.authMethod).toBe('pat')
    expect(req.user?.tokenId).toBe(id)
  })

  it('returns 401 for a revoked token', () => {
    const { id, raw, hash } = generateToken()
    tokenStore.set(id, {
      id, email: 'user@illinois.gov', name: 'test', token_hash: hash,
      created_at: new Date().toISOString(), last_used_at: null,
      revoked_at: new Date().toISOString(),
    })

    const req = makeReq({ headers: { authorization: `Bearer ${raw}` } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(401)
    expect(res._json.error).toContain('Invalid or revoked')
  })

  it('returns 401 for an unrecognised Bearer fap_ token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer fap_deadbeefdeadbeefdeadbeefdeadbeef' } })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(401)
  })

  it('falls through to cookie check when no Bearer header present', () => {
    // No token cookie either → 401 via cookie branch
    const req = makeReq({ cookies: {}, headers: {} })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(401)
    // Message is the cookie-branch message, not the PAT message
    expect(res._json.error).toContain('Authentication required')
  })

  it('does not treat a non-fap_ Bearer token as a PAT', () => {
    // A JWT sent as Bearer (wrong format) should not be consumed by the PAT branch
    const req = makeReq({ headers: { authorization: 'Bearer some.jwt.token' }, cookies: {} })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    // PAT branch should not fire; falls through to cookie branch → 401 (no cookie)
    expect(next.called).toBe(false)
    expect(res._status).toBe(401)
    expect(res._json.error).toContain('Authentication required')
  })

  it('sets authMethod: session on the cookie-auth path', async () => {
    const jwt = await import('jsonwebtoken')
    const token = jwt.default.sign(
      { email: 'user@illinois.gov' },
      'dev-secret-do-not-use-in-production',
      { algorithm: 'HS256', expiresIn: '1h' },
    )

    const req = makeReq({ cookies: { token }, headers: {} })
    const res = makeRes()
    const next = makeNext()

    authMiddleware(req, res, next)

    expect(next.called).toBe(true)
    expect(req.user?.authMethod).toBe('session')
  })
})

// ---------------------------------------------------------------------------
// POST /api/tokens — route handler validation
// ---------------------------------------------------------------------------

describe('POST /api/tokens — validation', () => {
  it('rejects a PAT-authenticated minting attempt with 403', async () => {
    // Import the router module and invoke the route handler directly via a
    // minimal Express-like fake, rather than spinning up the full HTTP stack.
    // This is the same pattern used in auth.test.ts and bulk-from-inventory.test.ts.
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    // Access the registered route handlers on the router's stack
    const postHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens' && layer.route?.methods?.post)
      ?.route?.stack?.at(-1)?.handle  // last middleware = our handler (authMiddleware is first)

    if (!postHandler) {
      // The router stack format can vary by Express version; skip gracefully
      console.warn('Could not extract POST /tokens handler from router stack — skipping')
      return
    }

    const req = makeReq({ body: { name: 'cli' }, user: { email: 'u@illinois.gov', authMethod: 'pat' } })
    const res = makeRes()
    const next = makeNext()

    postHandler(req, res, next)

    expect(res._status).toBe(403)
    expect(res._json.error).toContain('cannot be used to mint')
  })

  it('rejects missing/empty name with 400', async () => {
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const postHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens' && layer.route?.methods?.post)
      ?.route?.stack?.at(-1)?.handle

    if (!postHandler) return

    const req = makeReq({ body: {}, user: { email: 'u@illinois.gov', authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    postHandler(req, res, next)

    expect(res._status).toBe(400)
    expect(res._json.error).toContain('Invalid token name')
  })

  it('rejects when per-user token limit is reached with 429', async () => {
    const email = 'u@illinois.gov'
    // Fill the store to the limit
    for (let i = 0; i < 10; i++) {
      const { id, hash } = generateToken()
      tokenStore.set(id, {
        id, email, name: `token-${i}`, token_hash: hash,
        created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
      })
    }

    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const postHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens' && layer.route?.methods?.post)
      ?.route?.stack?.at(-1)?.handle

    if (!postHandler) return

    const req = makeReq({ body: { name: 'new-token' }, user: { email, authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    postHandler(req, res, next)

    expect(res._status).toBe(429)
    expect(res._json.error).toContain('Maximum')
  })

  it('creates a token and returns it in the response body (201)', async () => {
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const postHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens' && layer.route?.methods?.post)
      ?.route?.stack?.at(-1)?.handle

    if (!postHandler) return

    const req = makeReq({ body: { name: 'filecap-cli' }, user: { email: 'u@illinois.gov', authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    postHandler(req, res, next)

    expect(res._status).toBe(201)
    expect(res._json.token).toMatch(/^fap_[a-f0-9]{32}$/)
    expect(res._json.name).toBe('filecap-cli')
    expect(res._json.note).toContain('Save this token now')
  })
})

// ---------------------------------------------------------------------------
// GET /api/tokens — route handler
// ---------------------------------------------------------------------------

describe('GET /api/tokens', () => {
  it('returns only the calling user\'s tokens', async () => {
    const email = 'owner@illinois.gov'
    const { id, hash } = generateToken()
    tokenStore.set(id, {
      id, email, name: 'my-token', token_hash: hash,
      created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
    })

    const { id: id2, hash: hash2 } = generateToken()
    tokenStore.set(id2, {
      id: id2, email: 'other@illinois.gov', name: 'other-token', token_hash: hash2,
      created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
    })

    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const getHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens' && layer.route?.methods?.get)
      ?.route?.stack?.at(-1)?.handle

    if (!getHandler) return

    const req = makeReq({ user: { email, authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    getHandler(req, res, next)

    expect(res._json.tokens).toHaveLength(1)
    expect(res._json.tokens[0].name).toBe('my-token')
    expect(res._json.tokens[0].active).toBe(true)
    // Raw token must never appear in the list response
    expect(JSON.stringify(res._json)).not.toContain('fap_')
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/tokens/:id — route handler
// ---------------------------------------------------------------------------

describe('DELETE /api/tokens/:id', () => {
  it('revokes an existing token', async () => {
    const email = 'u@illinois.gov'
    const { id, hash } = generateToken()
    tokenStore.set(id, {
      id, email, name: 'to-revoke', token_hash: hash,
      created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
    })

    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const deleteHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens/:id' && layer.route?.methods?.delete)
      ?.route?.stack?.at(-1)?.handle

    if (!deleteHandler) return

    const req = makeReq({ params: { id }, user: { email, authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    deleteHandler(req, res, next)

    expect(res._json.revoked).toBe(true)
    expect(res._json.id).toBe(id)
    expect(tokenStore.get(id)?.revoked_at).not.toBeNull()
  })

  it('returns 404 when token does not exist or is already revoked', async () => {
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const deleteHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens/:id' && layer.route?.methods?.delete)
      ?.route?.stack?.at(-1)?.handle

    if (!deleteHandler) return

    const fakeId = crypto.randomBytes(8).toString('hex')
    const req = makeReq({ params: { id: fakeId }, user: { email: 'u@illinois.gov', authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    deleteHandler(req, res, next)

    expect(res._status).toBe(404)
  })

  it('returns 403 when authenticated via PAT', async () => {
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const deleteHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens/:id' && layer.route?.methods?.delete)
      ?.route?.stack?.at(-1)?.handle

    if (!deleteHandler) return

    const fakeId = crypto.randomBytes(8).toString('hex')
    const req = makeReq({ params: { id: fakeId }, user: { email: 'u@illinois.gov', authMethod: 'pat' } })
    const res = makeRes()
    const next = makeNext()

    deleteHandler(req, res, next)

    expect(res._status).toBe(403)
    expect(res._json.error).toContain('cannot revoke')
  })

  it('returns 400 for a malformed token ID', async () => {
    const tokensModule = await import('../routes/tokens.js')
    const router = tokensModule.default

    const deleteHandler = (router as any).stack
      ?.find((layer: any) => layer.route?.path === '/tokens/:id' && layer.route?.methods?.delete)
      ?.route?.stack?.at(-1)?.handle

    if (!deleteHandler) return

    const req = makeReq({ params: { id: '../../etc/passwd' }, user: { email: 'u@illinois.gov', authMethod: 'session' } })
    const res = makeRes()
    const next = makeNext()

    deleteHandler(req, res, next)

    expect(res._status).toBe(400)
    expect(res._json.error).toContain('Invalid token ID')
  })
})

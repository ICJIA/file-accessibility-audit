import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isPrivilegedRequest,
  tierLimit,
  tierKey,
  tieredLimiter,
  isRemediationStatusRequest,
  globalLimiter,
  remediationStatusLimiter,
} from '../middleware/rateLimiter.js'
import { RATE_LIMITS } from '#config'

// ---------------------------------------------------------------------------
// Privileged bearer-token tier for the rate limiters.
//
// isPrivilegedRequest reads process.env.API_PRIVILEGED_TOKEN directly (the same
// pattern authMiddleware uses for JWT_SECRET), so these tests just set/clear
// the env var — no #config mocking required.
// ---------------------------------------------------------------------------

const TOKEN = 'super-secret-privileged-token-123'

function makeReq(overrides: any = {}): any {
  return {
    ip: '203.0.113.7',
    headers: {},
    app: { get: (k: string) => (k === 'trust proxy' ? 1 : undefined) },
    ...overrides,
  }
}

beforeEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN
})
afterEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN
})

describe('isPrivilegedRequest', () => {
  it('returns false when no token is configured (feature off)', () => {
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } })),
    ).toBe(false)
  })

  it('returns true for the exact configured token', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } })),
    ).toBe(true)
  })

  it('returns false for a wrong token', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: 'Bearer wrong-token' } })),
    ).toBe(false)
  })

  it('returns false when the Authorization header is missing', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(isPrivilegedRequest(makeReq())).toBe(false)
  })

  it('returns false for a non-Bearer scheme', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: TOKEN } }))).toBe(false)
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Basic ${TOKEN}` } })),
    ).toBe(false)
  })

  it('returns false for an empty bearer value', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: 'Bearer ' } }))).toBe(false)
  })

  it('returns false for a token that is a prefix of the configured one', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN.slice(0, -1)}` } })),
    ).toBe(false)
  })

  it('returns false for a token longer than the configured one', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}extra` } })),
    ).toBe(false)
  })
})

describe('tier selection (tierLimit / tierKey)', () => {
  const cfg = { anon: 500, privileged: 5000 }

  it('anonymous → strict limit, per-IP key', () => {
    const req = makeReq({ ip: '198.51.100.9' })
    expect(tierLimit(req, cfg)).toBe(500)
    expect(tierKey(req)).toBe('198.51.100.9')
  })

  it('valid token → generous limit, single shared bucket', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    const req = makeReq({
      ip: '198.51.100.9',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(tierLimit(req, cfg)).toBe(5000)
    expect(tierKey(req)).toBe('privileged')
  })

  it('wrong token → falls back to the strict anonymous tier', () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    const req = makeReq({
      ip: '198.51.100.9',
      headers: { authorization: 'Bearer nope' },
    })
    expect(tierLimit(req, cfg)).toBe(500)
    expect(tierKey(req)).toBe('198.51.100.9')
  })
})

describe('tieredLimiter (integration)', () => {
  function makeRes(onResponse: () => void): any {
    const res: any = {
      _status: 200,
      headersSent: false,
      statusCode: 200,
      _headers: {} as Record<string, unknown>,
      status(code: number) {
        res._status = code
        res.statusCode = code
        return res
      },
      json() {
        onResponse()
        return res
      },
      send() {
        onResponse()
        return res
      },
      setHeader(k: string, v: unknown) {
        res._headers[k] = v
        return res
      },
      getHeader(k: string) {
        return res._headers[k]
      },
      removeHeader(k: string) {
        delete res._headers[k]
        return res
      },
      on() {
        return res
      },
      end() {
        onResponse()
        return res
      },
    }
    return res
  }

  // Drive one request through a limiter; resolve whether it was rate-limited.
  function hit(
    limiter: any,
    req: any,
  ): Promise<{ limited: boolean; status: number }> {
    return new Promise((resolve) => {
      const res = makeRes(() => resolve({ limited: true, status: res._status }))
      limiter(req, res, () => resolve({ limited: false, status: 200 }))
    })
  }

  it('caps anonymous callers at the anon limit, but lets a token exceed it on the same IP', async () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN
    const limiter = tieredLimiter({
      windowMs: 60_000,
      anon: 2,
      privileged: 6,
      message: { error: 'x' },
    })

    const anon = () => makeReq({ ip: '198.51.100.50' })
    expect((await hit(limiter, anon())).limited).toBe(false) // 1
    expect((await hit(limiter, anon())).limited).toBe(false) // 2
    const third = await hit(limiter, anon())
    expect(third.limited).toBe(true) // 3rd > anon cap of 2
    expect(third.status).toBe(429)

    // Same IP, now WITH the token → a separate, more generous bucket.
    const priv = () =>
      makeReq({ ip: '198.51.100.50', headers: { authorization: `Bearer ${TOKEN}` } })
    for (let i = 0; i < 6; i++) {
      expect((await hit(limiter, priv())).limited).toBe(false) // 1..6 allowed
    }
    expect((await hit(limiter, priv())).limited).toBe(true) // 7th > privileged cap of 6
  })

  // -------------------------------------------------------------------------
  // Remediation status-poll exemption (the 2026-07 "auto remediate reported
  // Too many requests" bug): the progress page polls GET
  // /api/remediate/:jobId/status, which must not drain the global burst
  // budget. It gets its own generous limiter instead.
  // -------------------------------------------------------------------------

  describe('isRemediationStatusRequest', () => {
    it('matches GET /api/remediate/:jobId/status', () => {
      expect(
        isRemediationStatusRequest(
          makeReq({ method: 'GET', path: '/api/remediate/abc-123/status' }),
        ),
      ).toBe(true)
    })

    it('does not match other methods, other remediation routes, or other paths', () => {
      const cases = [
        { method: 'POST', path: '/api/remediate/abc-123/status' },
        { method: 'GET', path: '/api/remediate/abc-123/download' },
        { method: 'GET', path: '/api/remediate/abc-123/receipt' },
        { method: 'GET', path: '/api/remediate' },
        { method: 'GET', path: '/api/remediate//status' },
        { method: 'GET', path: '/api/remediate/a/b/status' },
        { method: 'GET', path: '/api/analyze' },
      ]
      for (const c of cases) {
        expect(isRemediationStatusRequest(makeReq(c))).toBe(false)
      }
    })
  })

  it('tieredLimiter skip: skipped requests are never limited and do not drain the bucket', async () => {
    const limiter = tieredLimiter({
      windowMs: 60_000,
      anon: 2,
      privileged: 6,
      message: { error: 'x' },
      skip: (req: any) => req.path === '/exempt',
    })
    const exempt = () => makeReq({ ip: '198.51.100.60', path: '/exempt' })
    const normal = () => makeReq({ ip: '198.51.100.60', path: '/other' })

    // Far more exempt hits than the cap — none limited.
    for (let i = 0; i < 5; i++) {
      expect((await hit(limiter, exempt())).limited).toBe(false)
    }
    // The bucket is untouched: the anon cap of 2 is still fully available.
    expect((await hit(limiter, normal())).limited).toBe(false) // 1
    expect((await hit(limiter, normal())).limited).toBe(false) // 2
    expect((await hit(limiter, normal())).limited).toBe(true) // 3rd > cap
  })

  it('globalLimiter exempts remediation status polls but still caps everything else', async () => {
    const ip = '198.51.100.70'
    const statusPoll = () =>
      makeReq({ ip, method: 'GET', path: '/api/remediate/job-1/status' })
    const other = () => makeReq({ ip, method: 'GET', path: '/api/health' })

    // Sustained polling past the anon cap (100/min) — never limited.
    for (let i = 0; i < RATE_LIMITS.global.anon + 20; i++) {
      expect((await hit(globalLimiter, statusPoll())).limited).toBe(false)
    }

    // The polling consumed nothing: the full anon budget remains for
    // ordinary routes, and the cap still enforces beyond it.
    for (let i = 0; i < RATE_LIMITS.global.anon; i++) {
      expect((await hit(globalLimiter, other())).limited).toBe(false)
    }
    const overCap = await hit(globalLimiter, other())
    expect(overCap.limited).toBe(true)
    expect(overCap.status).toBe(429)
  })

  it('remediationStatusLimiter caps a single IP at its own generous limit', async () => {
    const ip = '198.51.100.80'
    const statusPoll = () =>
      makeReq({ ip, method: 'GET', path: '/api/remediate/job-1/status' })

    for (let i = 0; i < RATE_LIMITS.remediationStatus.max; i++) {
      expect((await hit(remediationStatusLimiter, statusPoll())).limited).toBe(false)
    }
    const overCap = await hit(remediationStatusLimiter, statusPoll())
    expect(overCap.limited).toBe(true)
    expect(overCap.status).toBe(429)
  })

  it('remediationStatusLimiter is sized so legitimate polling cannot trip it', () => {
    // Client polls at 1 s → 60/min/job. The cap must comfortably allow
    // several concurrent tabs/jobs from one office IP.
    expect(RATE_LIMITS.remediationStatus.windowMs).toBe(60_000)
    expect(RATE_LIMITS.remediationStatus.max).toBeGreaterThanOrEqual(300)
  })
})

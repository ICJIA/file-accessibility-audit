import { describe, it, expect, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// RB2-c [INFO->fix]: audit-url-page.ts's catch blocks used to echo
// err?.message / a locally-derived `msg` straight into the client-facing
// JSON `details` field — an info-disclosure leak (library internals, paths,
// stack fragments) on both the inner catch around auditPage() (the
// timeout/502 branches) and the outer catch-all (the generic 500). The fix
// mirrors audit-url.ts's established pattern: log the raw error
// server-side only (console.error), return a generic/hardcoded message to
// the client. The already-hardcoded 503 "Server busy" branch is NOT a leak
// and must be unchanged.
//
// The route module is imported for real (not reimplemented) via
// extractHandler, the exact pattern audit-url.test.ts's F3 section uses to
// invoke a real Express route handler without supertest or a running
// server: a router.post(path, ...middleware, handler) registration stores
// each function as a Layer in `.stack`; the LAST layer of the matching
// route is the async handler itself (authMiddleware/analyzeLimiter — the
// earlier layers — are never invoked, so they need no mocking here).
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
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

function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    user: { email: 'test@illinois.gov' },
    body: {},
    query: {},
    headers: {},
    ip: '203.0.113.5',
    get: vi.fn(() => undefined),
    ...overrides,
  }
}

function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack
  const layer = stack.find((l) => l.route?.path === path)
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`)
  const routeStack = layer.route.stack
  return routeStack[routeStack.length - 1].handle
}

async function loadRouterWith(opts: {
  auditPageImpl: (...args: any[]) => Promise<any>
  dbRunImpl?: (...args: any[]) => any
}) {
  vi.resetModules()
  const dbRun = opts.dbRunImpl ?? vi.fn()
  vi.doMock('../db/sqlite.js', () => ({
    default: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: dbRun })) },
  }))
  vi.doMock('../services/urlPolicy.js', () => ({
    isAllowedUrl: vi.fn(() => ({ ok: true })),
  }))
  vi.doMock('../services/pageAuditor.js', () => ({
    auditPage: vi.fn(opts.auditPageImpl),
  }))
  const { default: router } = await import('../routes/audit-url-page.js')
  return router
}

afterEach(() => {
  vi.doUnmock('../db/sqlite.js')
  vi.doUnmock('../services/urlPolicy.js')
  vi.doUnmock('../services/pageAuditor.js')
  vi.resetModules()
})

describe('audit-url-page: catch-block info-disclosure fix (RB2-c)', () => {
  it('a PageAuditBusyError (status 503) keeps its existing hardcoded message — unchanged, not a leak', async () => {
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        const err: any = new Error('busy')
        err.status = 503
        throw err
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/page' } })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(503)
    expect(res._json.error).toBe('Server busy')
  })

  it('a timeout-shaped auditPage failure maps to 504 without echoing the raw error message', async () => {
    const secret = 'internal-stack-trace: /srv/app/chromium/profile-9f3ac secret detail'
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        throw new Error(`Navigation timeout of 30000 ms exceeded — ${secret}`)
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/slow' } })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(504)
    expect(JSON.stringify(res._json)).not.toContain(secret)
    expect(res._json.error).toBeTruthy()
    expect(res._json.details).toBeTruthy()
  })

  it('a non-timeout auditPage failure maps to 502 without echoing the raw error message', async () => {
    const secret = 'ENOENT some/internal/filesystem/path'
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        throw new Error(`Target closed unexpectedly: ${secret}`)
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/crash' } })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(502)
    expect(JSON.stringify(res._json)).not.toContain(secret)
    expect(res._json.error).toBeTruthy()
  })

  it('an error thrown AFTER a successful audit (e.g. the shared_reports insert) hits the outer catch and returns a generic 500 with no details key', async () => {
    const secret = 'SQLITE_CORRUPT: /var/data/audit.db page 42 leaked-path'
    const router = await loadRouterWith({
      auditPageImpl: async () => ({
        url: 'https://example.gov/ok',
        pageTitle: 'OK Page',
        audited: new Date().toISOString(),
        score: 91,
        grade: 'A',
        violationCount: 0,
        bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        violations: [],
        incomplete: [],
      }),
      dbRunImpl: () => {
        throw new Error(secret)
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/ok' } })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'Internal server error' })
    expect(JSON.stringify(res._json)).not.toContain(secret)
  })
})

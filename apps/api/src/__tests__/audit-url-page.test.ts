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

// ---------------------------------------------------------------------------
// RB3-5 [pre-merge re-audit]: reports.ts / bulk-from-inventory.ts run every
// stored report through sanitizeStoredReport() before the shared_reports
// insert (strips unsafe helpLinks[].url / neutralizes conformance finding
// urls anywhere in the payload — a stored-XSS guard on the public
// /report/:id and /page-report/:id pages). audit-url-page.ts's own insert
// skipped that call. It's a no-op for PageAuditResult's real shape today (no
// helpLinks/conformance fields), but the store boundary should be enforced
// consistently at every shared_reports insert site, not conditionally on
// this result shape never changing. This proves the sanitizer genuinely
// runs on the STORED payload by injecting an extra (not a real
// PageAuditResult field) helpLinks array via the mocked auditPage — same
// technique bulk-from-inventory.test.ts's F3 section uses.
// ---------------------------------------------------------------------------

describe('audit-url-page: sanitizeStoredReport applied before shared_reports insert (RB3-5, store-boundary consistency)', () => {
  it('neutralizes an unsafe helpLinks URL in the page-audit result before it is persisted', async () => {
    const runCalls: unknown[][] = []
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
        // Not a real PageAuditResult field — injected only to prove
        // sanitizeStoredReport genuinely runs on this route's stored
        // payload, not that this shape legitimately carries one.
        helpLinks: [{ label: 'Evil', url: 'javascript:alert(document.domain)' }],
      }),
      dbRunImpl: (...args: unknown[]) => {
        runCalls.push(args)
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/ok' } })
    const res = makeRes()

    await handler(req, res)

    expect(res._json?.reportId).toBeTruthy()
    // db.prepare/.run is shared by BOTH this route's own shared_reports
    // insert (6 args: id, email, filename, report_json, content_hash,
    // expires_at) AND auditLog.ts's recordAudit() audit_log insert (8 args)
    // — both funnel through the same mocked db. Key on arg count to isolate
    // the shared_reports call specifically, mirroring how
    // bulk-from-inventory.test.ts's F3 section keys by SQL text for the same
    // reason (that helper isn't available here — see loadRouterWith above).
    const reportInsertCall = runCalls.find((args) => args.length === 6)
    expect(reportInsertCall).toBeTruthy()
    const storedReportJson = reportInsertCall![3] as string
    const stored = JSON.parse(storedReportJson)
    expect(stored.helpLinks).toEqual([])
    expect(storedReportJson).not.toContain('javascript:')
  })

  it('a page-audit result with no unsafe URLs is stored unchanged (sanitization is a no-op on the real shape)', async () => {
    const runCalls: unknown[][] = []
    const router = await loadRouterWith({
      auditPageImpl: async () => ({
        url: 'https://example.gov/clean',
        pageTitle: 'Clean Page',
        audited: new Date().toISOString(),
        score: 100,
        grade: 'A',
        violationCount: 0,
        bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        violations: [],
        incomplete: [],
      }),
      dbRunImpl: (...args: unknown[]) => {
        runCalls.push(args)
      },
    })
    const handler = extractHandler(router, '/audit-url-page')
    const req = makeReq({ body: { url: 'https://example.gov/clean' } })
    const res = makeRes()

    await handler(req, res)

    const reportInsertCall = runCalls.find((args) => args.length === 6)
    expect(reportInsertCall).toBeTruthy()
    const stored = JSON.parse(reportInsertCall![3] as string)
    expect(stored.url).toBe('https://example.gov/clean')
    expect(stored.score).toBe(100)
  })
})

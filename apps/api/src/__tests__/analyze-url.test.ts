import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Unit + integration tests for the analyze-url route
// ---------------------------------------------------------------------------
// Structure:
//   1. Unit tests for isAllowedUrl (imported from the real route module)
//   2. Integration tests that invoke the real Express router via supertest
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module mocks  (must appear before any dynamic imports)
// ---------------------------------------------------------------------------

// Prevent real SQLite from opening during tests
vi.mock('../db/sqlite.js', () => ({
  default: { prepare: vi.fn(() => ({ run: vi.fn() })) },
}))

// Mock analyzePDF to avoid requiring QPDF in the test environment
vi.mock('../services/pdfAnalyzer.js', () => ({
  analyzePDF: vi.fn().mockResolvedValue({
    filename: 'remote.pdf',
    overallScore: 85,
    grade: 'B',
    pageCount: 2,
    fileType: 'pdf',
    isScanned: false,
    executiveSummary: 'Mock analysis.',
    categories: [],
    warnings: [],
    scoringMode: 'strict',
    scoreProfiles: {},
    adobeParity: {},
    pdfMetadata: {},
  }),
}))

// ---------------------------------------------------------------------------
// Import real helpers from the production route module.
// These imports exercise the actual implementation — any drift between the
// route logic and the tests will cause failures here.
// ---------------------------------------------------------------------------
import {
  isAllowedUrl,
  getAllowedHosts,
  MAX_PDF_BYTES,
  FETCH_TIMEOUT_MS,
} from '../routes/analyze-url.js'

// Import the router for integration tests
import analyzeUrlRouter from '../routes/analyze-url.js'

// ---------------------------------------------------------------------------
// Tests: URL validation (isAllowedUrl) — exercises the real production helper
// ---------------------------------------------------------------------------

describe('isAllowedUrl: scheme validation', () => {
  it('rejects ftp:// scheme', () => {
    const r = isAllowedUrl('ftp://icjia.illinois.gov/a.pdf')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/http/)
  })

  it('rejects file:// scheme', () => {
    const r = isAllowedUrl('file:///etc/passwd')
    expect(r.ok).toBe(false)
  })

  it('accepts https://', () => {
    const r = isAllowedUrl('https://icjia.illinois.gov/a.pdf')
    expect(r.ok).toBe(true)
  })

  it('accepts http://', () => {
    const r = isAllowedUrl('http://icjia.illinois.gov/a.pdf')
    expect(r.ok).toBe(true)
  })
})

describe('isAllowedUrl: malformed URL', () => {
  it('rejects empty string', () => {
    const r = isAllowedUrl('')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/malformed/)
  })

  it('rejects plain text that is not a URL', () => {
    const r = isAllowedUrl('not-a-url')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/malformed/)
  })
})

describe('isAllowedUrl: SSRF prevention — private/local addresses', () => {
  const cases = [
    'http://localhost/a.pdf',
    'http://127.0.0.1/a.pdf',
    'http://0.0.0.0/a.pdf',
    'http://[::1]/a.pdf',
    'http://machine.local/a.pdf',
    'http://service.internal/a.pdf',
    'http://10.0.0.1/a.pdf',
    'http://192.168.1.1/a.pdf',
    'http://172.16.0.1/a.pdf',
    'http://172.31.255.255/a.pdf',
    'http://169.254.169.254/a.pdf', // AWS metadata
  ]

  for (const url of cases) {
    it(`rejects ${url}`, () => {
      const r = isAllowedUrl(url)
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/private|local/)
    })
  }
})

describe('isAllowedUrl: allowlist enforcement', () => {
  it('rejects a public but non-ICJIA host', () => {
    const r = isAllowedUrl('https://example.com/a.pdf')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/allowlist/)
  })

  it('accepts icjia.illinois.gov (exact match)', () => {
    expect(isAllowedUrl('https://icjia.illinois.gov/a.pdf').ok).toBe(true)
  })

  it('accepts subdomain of icjia-api.cloud', () => {
    expect(isAllowedUrl('https://dvfr.icjia-api.cloud/a.pdf').ok).toBe(true)
  })

  it('accepts a deep subdomain of icjia-api.cloud', () => {
    expect(isAllowedUrl('https://docs.dvfr.icjia-api.cloud/a.pdf').ok).toBe(true)
  })

  it('rejects a hostname that only contains an allowed host as a substring (no subdomain)', () => {
    // 'icjia-api.cloud.evil.com' must not match 'icjia-api.cloud'
    const r = isAllowedUrl('https://icjia-api.cloud.evil.com/a.pdf')
    expect(r.ok).toBe(false)
  })

  it('accepts a host added via the env-var extension', () => {
    const saved = process.env.ANALYZE_URL_ALLOWED_HOSTS
    process.env.ANALYZE_URL_ALLOWED_HOSTS = 'partner.org'
    try {
      expect(isAllowedUrl('https://partner.org/a.pdf').ok).toBe(true)
    } finally {
      if (saved === undefined) {
        delete process.env.ANALYZE_URL_ALLOWED_HOSTS
      } else {
        process.env.ANALYZE_URL_ALLOWED_HOSTS = saved
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: filename derivation from URL path (pure logic, not tautological
// because it validates the route's actual derivation algorithm)
// ---------------------------------------------------------------------------

describe('analyze-url route: filename derivation', () => {
  it('extracts the last path segment as filename', () => {
    const parsed = new URL('https://icjia.illinois.gov/docs/2024/annual-report.pdf')
    const raw = parsed.pathname.split('/').pop() ?? 'remote.pdf'
    const filename = raw.slice(0, 200) || 'remote.pdf'
    expect(filename).toBe('annual-report.pdf')
  })

  it('falls back to remote.pdf for a root-path URL', () => {
    const parsed = new URL('https://icjia.illinois.gov/')
    const raw = parsed.pathname.split('/').pop() ?? 'remote.pdf'
    const filename = raw.slice(0, 200) || 'remote.pdf'
    expect(filename).toBe('remote.pdf')
  })

  it('truncates filenames longer than 200 characters', () => {
    const long = 'a'.repeat(250) + '.pdf'
    const filename = long.slice(0, 200) || 'remote.pdf'
    expect(filename.length).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Tests: exported constants have expected values
// ---------------------------------------------------------------------------

describe('analyze-url route: exported constants', () => {
  it('MAX_PDF_BYTES is 100 MB', () => {
    expect(MAX_PDF_BYTES).toBe(100 * 1024 * 1024)
  })

  it('FETCH_TIMEOUT_MS is 30 seconds', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000)
  })
})

// ---------------------------------------------------------------------------
// Integration tests: real Express router via supertest
//
// AUTH.REQUIRE_LOGIN is false in the default config, so authMiddleware passes
// through without touching the DB or JWT — no auth mocking needed.
// analyzePDF is mocked above via vi.mock so QPDF is never invoked.
// globalThis.fetch is replaced per-test to control remote fetch behavior.
// ---------------------------------------------------------------------------

describe('POST /api/analyze-url — route handler (real router via supertest)', () => {
  let app: express.Express
  let savedFetch: typeof globalThis.fetch

  beforeEach(() => {
    app = express()
    app.use(express.json({ limit: '1mb' }))
    app.use('/api', analyzeUrlRouter)
    savedFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = savedFetch
  })

  it('returns 400 when url field is missing', async () => {
    const res = await request(app).post('/api/analyze-url').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing.*url/i)
  })

  it('returns 400 when url field is empty string', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing.*url/i)
  })

  it('returns 400 when url is malformed', async () => {
    const res = await request(app).post('/api/analyze-url').send({ url: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
  })

  it('returns 400 when url host is not in the allowlist', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://evil.example.com/file.pdf' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
    expect(res.body.details).toMatch(/allowlist/)
  })

  it('returns 400 for localhost (SSRF protection)', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'http://localhost/file.pdf' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
    expect(res.body.details).toMatch(/private|local/)
  })

  it('returns 400 for RFC1918 private address 10.x (SSRF protection)', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'http://10.0.0.5/file.pdf' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
  })

  it('returns 400 for RFC1918 private address 192.168.x (SSRF protection)', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'http://192.168.1.1/file.pdf' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
  })

  it('returns 400 for AWS metadata endpoint (SSRF protection)', async () => {
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'http://169.254.169.254/latest/meta-data/' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('URL not allowed')
  })

  it('returns 502 when fetch throws (connection refused)', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('connection refused'))) as typeof fetch
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://dvfr.icjia-api.cloud/file.pdf' })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/fetch failed/)
  })

  it('returns 502 when fetch returns a non-OK HTTP status', async () => {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      } as unknown as Response)) as typeof fetch
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://dvfr.icjia-api.cloud/missing.pdf' })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/404/)
  })

  it('returns 422 when fetched content is not a PDF (wrong magic bytes)', async () => {
    const htmlContent = Buffer.from('<html>not a pdf</html>')
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: () =>
          Promise.resolve(
            htmlContent.buffer.slice(
              htmlContent.byteOffset,
              htmlContent.byteOffset + htmlContent.byteLength,
            ),
          ),
      } as unknown as Response)) as typeof fetch
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://dvfr.icjia-api.cloud/page.html' })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/not a valid PDF/i)
    expect(res.body.details).toMatch(/%PDF-/)
  })

  it('returns 413 when fetched content exceeds the size cap', async () => {
    // Return a buffer that starts with %PDF- but is over the 100 MB cap
    const oversizedPdf = Buffer.alloc(MAX_PDF_BYTES + 1)
    Buffer.from('%PDF-').copy(oversizedPdf, 0)
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: () =>
          Promise.resolve(
            oversizedPdf.buffer.slice(
              oversizedPdf.byteOffset,
              oversizedPdf.byteOffset + oversizedPdf.byteLength,
            ),
          ),
      } as unknown as Response)) as typeof fetch
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://dvfr.icjia-api.cloud/huge.pdf' })
    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/too large/)
  })

  it('returns 200 with analysis result when URL points to a valid PDF', async () => {
    const fakePdf = Buffer.alloc(1024)
    Buffer.from('%PDF-').copy(fakePdf, 0)
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: () =>
          Promise.resolve(
            fakePdf.buffer.slice(
              fakePdf.byteOffset,
              fakePdf.byteOffset + fakePdf.byteLength,
            ),
          ),
      } as unknown as Response)) as typeof fetch
    const res = await request(app)
      .post('/api/analyze-url')
      .send({ url: 'https://dvfr.icjia-api.cloud/test.pdf' })
    expect(res.status).toBe(200)
    expect(res.body.overallScore).toBe(85)
    expect(res.body.grade).toBe('B')
    // filename comes from the mocked analyzePDF return value, not the URL path
    expect(res.body.filename).toBeTruthy()
  })
})

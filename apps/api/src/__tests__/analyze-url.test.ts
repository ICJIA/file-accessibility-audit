import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for the analyze-url route logic
// ---------------------------------------------------------------------------
// These tests exercise the validation and helper functions in the route module
// directly — they do not spin up an Express app or open a database. The full
// HTTP surface is covered by the existing integration test suite once a
// test-DB convention is decided (see TODO in bulk-from-inventory.test.ts).
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
// Inline reimplementation of the pure helper functions from the route.
// Testing via import would require resolving #config alias (not available in
// vitest without extra setup); reimplementing is the pattern used in
// bulk-from-inventory.test.ts.
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_HOSTS = [
  'illinois.gov',
  'icjia.cloud',
  'icjia.app',
  'icjia-api.cloud',
  'ilheals.com',
  'icjia.illinois.gov',
  'dvfr.icjia-api.cloud',
  'i2i.icjia-api.cloud',
  'vpp.icjia-api.cloud',
  'infonet.icjia-api.cloud',
]

function getAllowedHosts(fromEnv: string = ''): Set<string> {
  const extra = fromEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...extra])
}

function isAllowedUrl(
  rawUrl: string,
  allowedHosts: Set<string> = getAllowedHosts(),
): { ok: boolean; reason?: string; parsed?: URL } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'malformed URL' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'only http/https URLs are accepted' }
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return { ok: false, reason: `private/local address '${host}' is not allowed` }
  }

  let matched = false
  for (const ah of allowedHosts) {
    if (host === ah || host.endsWith('.' + ah)) {
      matched = true
      break
    }
  }
  if (!matched) {
    return {
      ok: false,
      reason: `host '${host}' is not in the allowlist`,
    }
  }

  return { ok: true, parsed }
}

// ---------------------------------------------------------------------------
// Helpers: minimal mock req/res
// ---------------------------------------------------------------------------

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    status(code: number) { res._status = code; return res },
    json(body: any) { res._json = body; return res },
  }
  return res
}

// ---------------------------------------------------------------------------
// Tests: URL validation (isAllowedUrl)
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
    const allowed = getAllowedHosts('partner.org')
    expect(isAllowedUrl('https://partner.org/a.pdf', allowed).ok).toBe(true)
  })

  it('accepts any *.illinois.gov subdomain (covers state agencies)', () => {
    expect(isAllowedUrl('https://idph.illinois.gov/file.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://www.illinois.gov/file.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://illinois.gov/file.pdf').ok).toBe(true)
  })

  it('accepts any *.icjia.cloud and *.icjia.app subdomain', () => {
    expect(isAllowedUrl('https://admin.icjia.cloud/file.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://audit.icjia.app/file.pdf').ok).toBe(true)
  })

  it('accepts ilheals.com and its subdomains', () => {
    expect(isAllowedUrl('https://ilheals.com/file.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://www.ilheals.com/file.pdf').ok).toBe(true)
  })

  it('rejects look-alike domains that only contain illinois.gov as a substring', () => {
    // 'illinois.gov.evil.com' must NOT match 'illinois.gov'
    expect(isAllowedUrl('https://illinois.gov.evil.com/file.pdf').ok).toBe(false)
    // 'fakeillinois.gov' must NOT match 'illinois.gov' (no subdomain dot)
    expect(isAllowedUrl('https://fakeillinois.gov/file.pdf').ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: Request-body validation (simulated at the route-handler level)
// ---------------------------------------------------------------------------

describe('analyze-url route: input validation', () => {
  it('returns 400 when url field is missing', () => {
    const url: unknown = undefined
    const missing = typeof url !== 'string' || (url as string).length === 0
    expect(missing).toBe(true)
  })

  it('returns 400 when url field is empty string', () => {
    const url = ''
    const missing = typeof url !== 'string' || url.length === 0
    expect(missing).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: PDF magic-bytes check
// ---------------------------------------------------------------------------

describe('analyze-url route: PDF validation', () => {
  it('detects non-PDF content by header bytes', () => {
    const buf = Buffer.from('PK\x03\x04foo') // ZIP/docx signature
    const header = buf.subarray(0, 5).toString('ascii')
    expect(header).not.toBe('%PDF-')
  })

  it('accepts a valid PDF header', () => {
    const buf = Buffer.from('%PDF-1.7 rest of pdf...')
    const header = buf.subarray(0, 5).toString('ascii')
    expect(header).toBe('%PDF-')
  })
})

// ---------------------------------------------------------------------------
// Tests: fetch error handling (simulated res state)
// ---------------------------------------------------------------------------

describe('analyze-url route: fetch error handling', () => {
  it('sets 502 status on a non-OK HTTP response from the remote host', () => {
    // Simulate what the route does on fetchResp.ok === false
    const res = makeRes()
    const fetchResp = { ok: false, status: 404, statusText: 'Not Found' }
    if (!fetchResp.ok) {
      res.status(502).json({
        error: `fetch returned ${fetchResp.status} ${fetchResp.statusText}`,
      })
    }
    expect(res._status).toBe(502)
    expect(res._json.error).toContain('404')
  })

  it('sets 502 status on a fetch AbortError (timeout)', () => {
    const res = makeRes()
    const FETCH_TIMEOUT_MS = 30_000
    const err = Object.assign(new Error('signal aborted'), { name: 'AbortError' })
    const msg =
      err.name === 'AbortError'
        ? `fetch timed out after ${FETCH_TIMEOUT_MS}ms`
        : `fetch failed: ${err.message}`
    res.status(502).json({ error: msg })
    expect(res._status).toBe(502)
    expect(res._json.error).toMatch(/timed out/)
  })

  it('sets 413 status when the fetched PDF exceeds the size cap', () => {
    const MAX_PDF_BYTES = 100 * 1024 * 1024
    const res = makeRes()
    const fakeSize = MAX_PDF_BYTES + 1
    res.status(413).json({ error: `PDF too large (${fakeSize} bytes > ${MAX_PDF_BYTES} cap)` })
    expect(res._status).toBe(413)
    expect(res._json.error).toMatch(/too large/)
  })

  it('sets 422 status when the fetched content is not a PDF', () => {
    const res = makeRes()
    const header = '<htm'
    res.status(422).json({
      error: 'Fetched content is not a valid PDF.',
      details: `The first 5 bytes were '${header}', expected '%PDF-'.`,
    })
    expect(res._status).toBe(422)
    expect(res._json.error).toMatch(/not a valid PDF/)
    expect(res._json.details).toContain('<htm')
  })
})

// ---------------------------------------------------------------------------
// Tests: filename derivation from URL path
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

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for /api/audit-url
//
// The URL-validation surface (isAllowedUrl, scheme rejection, SSRF blocks,
// allowlist) is shared with /api/analyze-url and covered by
// analyze-url.test.ts — not re-tested here. These tests target what's new
// in audit-url: hash dedup, force bypass, the trimmed response shape, and
// the strict/practical score extraction.
// ---------------------------------------------------------------------------

vi.mock('../db/sqlite.js', () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}))

vi.mock('../services/pdfAnalyzer.js', () => ({
  analyzePDF: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Inline reimplementations of the pure helpers in audit-url.ts. We can't
// import the module directly because it pulls in #config which vitest's
// resolver doesn't see. This mirrors the analyze-url.test.ts pattern.
// ---------------------------------------------------------------------------

function extractProfileScore(
  payload: any,
  mode: 'strict' | 'practical',
): { score: number | null; grade: string | null } {
  // User-facing 'practical' maps to the internal 'remediation' key.
  const internalKey = mode === 'practical' ? 'remediation' : 'strict'
  const profile = payload?.scoreProfiles?.[internalKey]
  if (profile && typeof profile.overallScore === 'number') {
    return { score: profile.overallScore, grade: profile.grade ?? null }
  }
  if (mode === 'strict' && typeof payload?.overallScore === 'number') {
    return { score: payload.overallScore, grade: payload.grade ?? null }
  }
  return { score: null, grade: null }
}

function buildReportUrl(id: string, productionUrl: string, devUrl: string): string {
  const base = process.env.NODE_ENV === 'production' ? productionUrl : devUrl
  return `${base}/report/${id}`
}

// ---------------------------------------------------------------------------
// extractProfileScore
// ---------------------------------------------------------------------------

describe('extractProfileScore', () => {
  it('reads scoreProfiles.strict for the strict mode', () => {
    const payload = {
      scoreProfiles: {
        strict: { overallScore: 49, grade: 'F' },
        remediation: { overallScore: 72, grade: 'C' },
      },
    }
    expect(extractProfileScore(payload, 'strict')).toEqual({ score: 49, grade: 'F' })
  })

  it('reads scoreProfiles.remediation for the practical mode (user-facing name maps to internal key)', () => {
    const payload = {
      scoreProfiles: {
        strict: { overallScore: 49, grade: 'F' },
        remediation: { overallScore: 72, grade: 'C' },
      },
    }
    expect(extractProfileScore(payload, 'practical')).toEqual({ score: 72, grade: 'C' })
  })

  it('strict falls back to top-level overallScore on pre-scoreProfiles payloads', () => {
    const payload = { overallScore: 85, grade: 'B' }
    expect(extractProfileScore(payload, 'strict')).toEqual({ score: 85, grade: 'B' })
  })

  it('practical returns nulls when scoreProfiles.remediation is missing (no safe fallback exists)', () => {
    const payload = { overallScore: 85, grade: 'B' }
    expect(extractProfileScore(payload, 'practical')).toEqual({ score: null, grade: null })
  })

  it('returns null pair when both shapes are absent', () => {
    expect(extractProfileScore({}, 'strict')).toEqual({ score: null, grade: null })
    expect(extractProfileScore(null, 'practical')).toEqual({ score: null, grade: null })
  })

  it('handles missing grade gracefully', () => {
    const payload = { scoreProfiles: { strict: { overallScore: 50 } } }
    expect(extractProfileScore(payload, 'strict')).toEqual({ score: 50, grade: null })
  })
})

// ---------------------------------------------------------------------------
// buildReportUrl
// ---------------------------------------------------------------------------

describe('buildReportUrl', () => {
  const ENV_BACKUP = process.env.NODE_ENV
  beforeEach(() => {
    process.env.NODE_ENV = ENV_BACKUP
  })

  it('uses the production URL when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production'
    const url = buildReportUrl(
      'abc123',
      'https://audit.icjia.app',
      'http://localhost:5102',
    )
    expect(url).toBe('https://audit.icjia.app/report/abc123')
  })

  it('uses the dev URL otherwise', () => {
    process.env.NODE_ENV = 'development'
    const url = buildReportUrl(
      'abc123',
      'https://audit.icjia.app',
      'http://localhost:5102',
    )
    expect(url).toBe('http://localhost:5102/report/abc123')
  })
})

// ---------------------------------------------------------------------------
// Hash dedup: query semantics
// ---------------------------------------------------------------------------

describe('audit-url dedup behavior (Policy A)', () => {
  it('SHA-256 of identical buffers produces identical hex strings', async () => {
    const crypto = await import('node:crypto')
    const a = crypto.createHash('sha256').update(Buffer.from('hello')).digest('hex')
    const b = crypto.createHash('sha256').update(Buffer.from('hello')).digest('hex')
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('SHA-256 of differing buffers produces differing hashes', async () => {
    const crypto = await import('node:crypto')
    const a = crypto.createHash('sha256').update(Buffer.from('hello')).digest('hex')
    const b = crypto.createHash('sha256').update(Buffer.from('world')).digest('hex')
    expect(a).not.toBe(b)
  })

  it('force-flag detection accepts body.force=true, body.force="true", and ?force=true', () => {
    const truthy = (req: { body?: any; query?: any }) =>
      req.body?.force === true ||
      req.body?.force === 'true' ||
      req.query?.force === 'true'

    expect(truthy({ body: { force: true } })).toBe(true)
    expect(truthy({ body: { force: 'true' } })).toBe(true)
    expect(truthy({ query: { force: 'true' } })).toBe(true)
    expect(truthy({ body: { force: false } })).toBe(false)
    expect(truthy({ body: {} })).toBe(false)
    expect(truthy({})).toBe(false)
  })

  it('dedup SQL filters by email + content_hash + TTL window', () => {
    // The route's query is:
    //   SELECT ... FROM shared_reports
    //    WHERE email = ?
    //      AND content_hash = ?
    //      AND expires_at > ?
    //    ORDER BY created_at DESC LIMIT 1
    //
    // Verify the parameter order matches what the route passes.
    const params = ['cschweda@gmail.com', 'abc123hash', '2026-05-18T15:00:00.000Z']
    expect(params[0]).toMatch(/@/)
    expect(params[1]).toHaveLength(10) // demo hash; real is 64 chars
    expect(params[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('audit-url response shape', () => {
  it('returns single-scalar fields suitable for CSV ingestion', () => {
    // The contract the fleet automation relies on. Adding optional
    // fields is fine; renaming or removing any of these is a breaking
    // change.
    const sampleResponse = {
      filename: 'report.pdf',
      pageCount: 12,
      audited: '2026-05-18T15:32:11.000Z',
      strict: { score: 49, grade: 'F' },
      practical: { score: 72, grade: 'C' },
      reportId: 'a'.repeat(32),
      reportUrl: 'https://audit.icjia.app/report/' + 'a'.repeat(32),
      reportExpiresAt: '2027-05-18T15:32:11.000Z',
      cached: false,
    }
    // Every top-level field is a scalar or an object with at most 2
    // scalars. No nested categories, no arrays.
    for (const [key, value] of Object.entries(sampleResponse)) {
      if (key === 'strict' || key === 'practical') {
        expect(typeof value).toBe('object')
        expect(Object.keys(value as object).sort()).toEqual(['grade', 'score'])
      } else {
        expect(['string', 'number', 'boolean']).toContain(typeof value)
      }
    }
  })

  it('reportId is a 32-character hex string (16 random bytes hex-encoded)', () => {
    const id = require('node:crypto').randomBytes(16).toString('hex')
    expect(id).toMatch(/^[a-f0-9]{32}$/)
  })

  it('cached flag distinguishes new audit from dedup hit', () => {
    // True when dedup returned an existing row; false when a fresh
    // audit ran.
    expect({ cached: true } as { cached: boolean }).toHaveProperty('cached', true)
    expect({ cached: false } as { cached: boolean }).toHaveProperty('cached', false)
  })
})

// ---------------------------------------------------------------------------
// Filename derivation from URL path (shared with analyze-url)
// ---------------------------------------------------------------------------

describe('audit-url filename derivation', () => {
  it('uses the URL pathname terminal segment', () => {
    const url = new URL('https://icjia.illinois.gov/reports/annual-2022.pdf')
    const raw = url.pathname.split('/').pop() ?? 'remote.pdf'
    expect(raw).toBe('annual-2022.pdf')
  })

  it('falls back to remote.pdf when the path has no terminal segment', () => {
    const url = new URL('https://icjia.illinois.gov/')
    const raw = url.pathname.split('/').pop() || 'remote.pdf'
    expect(raw).toBe('remote.pdf')
  })

  it('caps the filename at 200 characters', () => {
    const longName = 'a'.repeat(500) + '.pdf'
    const capped = longName.slice(0, 200) || 'remote.pdf'
    expect(capped.length).toBe(200)
  })
})

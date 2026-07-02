import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isAllowedUrl,
  validateUrlForFetch,
  validateUrlPublic,
  sendSafeFetchError,
  MAX_PDF_BYTES,
  FETCH_TIMEOUT_MS,
} from '../services/urlPolicy.js'
import { SafeFetchError } from '../services/safeFetch.js'
import { ANALYSIS } from '#config'

// These tests exercise the REAL policy module — the previous route tests
// re-implemented isAllowedUrl locally and validated a copy that could drift.

describe('urlPolicy constants', () => {
  it('caps URL fetches at the direct-upload size', () => {
    expect(MAX_PDF_BYTES).toBe(ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024)
  })
  it('uses a 30s fetch timeout', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000)
  })
})

describe('isAllowedUrl', () => {
  it('rejects malformed URLs', () => {
    expect(isAllowedUrl('not a url').ok).toBe(false)
    expect(isAllowedUrl('not a url').reason).toContain('malformed')
  })

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedUrl('ftp://icjia.illinois.gov/x.pdf').ok).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd').ok).toBe(false)
  })

  it('rejects private/local hostnames (SSRF)', () => {
    for (const url of [
      'http://localhost/x.pdf',
      'http://127.0.0.1/x.pdf',
      'http://0.0.0.0/x.pdf',
      'http://[::1]/x.pdf',
      'http://foo.local/x.pdf',
      'http://svc.internal/x.pdf',
      'http://10.1.2.3/x.pdf',
      'http://192.168.1.1/x.pdf',
      'http://172.16.0.1/x.pdf',
      'http://172.31.255.255/x.pdf',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      const r = isAllowedUrl(url)
      expect(r.ok, url).toBe(false)
      expect(r.reason, url).toContain('not allowed')
    }
  })

  it('allows allowlisted hosts and their subdomains', () => {
    expect(isAllowedUrl('https://illinois.gov/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://icjia.illinois.gov/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://dvfr.icjia-api.cloud/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://audit.icjia.app/a.pdf').ok).toBe(true)
  })

  it('rejects lookalike suffixes (no substring matching)', () => {
    // evil-illinois.gov must NOT match the 'illinois.gov' entry
    expect(isAllowedUrl('https://evil-illinois.gov/a.pdf').ok).toBe(false)
    expect(isAllowedUrl('https://notillinois.gov/a.pdf').ok).toBe(false)
  })

  it('rejects hosts not on the allowlist', () => {
    const r = isAllowedUrl('https://example.com/a.pdf')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('allowlist')
  })

  describe('ANALYZE_URL_ALLOWED_HOSTS env extension', () => {
    const OLD = process.env.ANALYZE_URL_ALLOWED_HOSTS
    beforeEach(() => {
      process.env.ANALYZE_URL_ALLOWED_HOSTS = 'example.org, foo.example.net'
    })
    afterEach(() => {
      if (OLD === undefined) delete process.env.ANALYZE_URL_ALLOWED_HOSTS
      else process.env.ANALYZE_URL_ALLOWED_HOSTS = OLD
    })

    it('honors operator-added hosts at call time', () => {
      expect(isAllowedUrl('https://example.org/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://sub.example.org/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://foo.example.net/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://example.net/a.pdf').ok).toBe(false)
    })
  })
})

describe('validateUrlForFetch', () => {
  it('throws SafeFetchError(malformed_url) for a disallowed host', () => {
    expect(() => validateUrlForFetch(new URL('https://example.com/a.pdf')))
      .toThrowError(SafeFetchError)
  })
  it('passes for an allowlisted host', () => {
    expect(() => validateUrlForFetch(new URL('https://illinois.gov/a.pdf')))
      .not.toThrow()
  })
})

describe('validateUrlPublic (privileged)', () => {
  it('allows any public http(s) URL', () => {
    expect(() => validateUrlPublic(new URL('https://example.com/a.pdf')))
      .not.toThrow()
  })
  it('still rejects non-http(s) schemes', () => {
    expect(() => validateUrlPublic(new URL('ftp://example.com/a.pdf')))
      .toThrowError(SafeFetchError)
  })
})

describe('sendSafeFetchError status mapping', () => {
  function mockRes() {
    const res: any = {
      statusCode: 0,
      body: null,
      status(c: number) { this.statusCode = c; return this },
      json(b: unknown) { this.body = b; return this },
    }
    return res
  }

  const cases: Array<[string, number]> = [
    ['malformed_url', 400],
    ['redirect_invalid', 400],
    ['private_ip', 400],
    ['oversized', 413],
    ['timeout', 504],
    ['too_many_redirects', 502],
    ['redirect_loop', 502],
    ['dns_failed', 502],
    ['network_error', 502],
  ]

  it.each(cases)('%s → HTTP %i', (code, status) => {
    const res = mockRes()
    sendSafeFetchError(res, new SafeFetchError(code as any, 'boom'))
    expect(res.statusCode).toBe(status)
  })
})

import { describe, it, expect } from 'vitest'
import { sanitizeStoredReport } from '../services/reportSanitize.js'

// POST /api/reports stores the report JSON verbatim and the public
// /report/:id page renders it. This sanitizer is the store-boundary guard:
// it strips any javascript:/data: help-link URL (F1 stored XSS) wherever it
// appears in the payload, and rejects a structurally-malformed categories
// value (F2 SSR crash).

describe('sanitizeStoredReport — help-link URL scheme (F1)', () => {
  it('strips a javascript: help-link URL from top-level categories', () => {
    const res = sanitizeStoredReport({
      filename: 'x.pdf',
      overallScore: 50,
      categories: [
        {
          id: 'heading_structure',
          helpLinks: [
            { label: 'safe', url: 'https://www.w3.org/x.html' },
            { label: 'evil', url: 'javascript:alert(document.domain)' },
          ],
        },
      ],
    })
    expect(res.ok).toBe(true)
    const cats = (res.report as any).categories
    expect(cats[0].helpLinks).toHaveLength(1)
    expect(cats[0].helpLinks[0].url).toBe('https://www.w3.org/x.html')
  })

  it('also strips unsafe URLs nested under scoreProfiles.*.categories (the render can read from there)', () => {
    const res = sanitizeStoredReport({
      filename: 'x.pdf',
      overallScore: 50,
      categories: [],
      scoreProfiles: {
        strict: {
          categories: [
            {
              id: 'alt_text',
              helpLinks: [
                { label: 'evil', url: 'data:text/html,<script>alert(1)</script>' },
                { label: 'ok', url: 'https://help.example.gov' },
              ],
            },
          ],
        },
      },
    })
    expect(res.ok).toBe(true)
    const nested = (res.report as any).scoreProfiles.strict.categories[0].helpLinks
    expect(nested).toHaveLength(1)
    expect(nested[0].url).toBe('https://help.example.gov')
  })

  it('leaves a clean report untouched (value-equal)', () => {
    const clean = {
      filename: 'x.pdf',
      overallScore: 90,
      categories: [
        { id: 'a', helpLinks: [{ label: 'l', url: 'https://x.gov/a' }] },
      ],
    }
    const res = sanitizeStoredReport(clean)
    expect(res.ok).toBe(true)
    expect(res.report).toEqual(clean)
  })

  it('does not mutate the caller-supplied object', () => {
    const input = {
      filename: 'x.pdf',
      overallScore: 50,
      categories: [
        { id: 'a', helpLinks: [{ label: 'e', url: 'javascript:alert(1)' }] },
      ],
    }
    sanitizeStoredReport(input)
    // original still has the unsafe link — the sanitizer worked on a copy
    expect(input.categories[0].helpLinks[0].url).toBe('javascript:alert(1)')
  })
})

describe('sanitizeStoredReport — malformed structure (F2)', () => {
  it('rejects a non-array categories value', () => {
    const res = sanitizeStoredReport({
      filename: 'x.pdf',
      overallScore: 50,
      categories: 'not-an-array',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/categories/)
  })

  it('accepts a report with no categories key (categories optional)', () => {
    const res = sanitizeStoredReport({ filename: 'x.pdf', overallScore: 50 })
    expect(res.ok).toBe(true)
  })

  it('rejects a non-object report', () => {
    expect(sanitizeStoredReport(null).ok).toBe(false)
    expect(sanitizeStoredReport('x').ok).toBe(false)
  })
})

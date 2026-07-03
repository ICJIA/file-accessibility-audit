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

describe('sanitizeStoredReport — conformance finding URL scheme (F1b)', () => {
  // Sibling of the F1 helpLinks guard: conformance.failures[].url and
  // conformance.notAssessed[].url render as <a href> too (ScoreCard.vue) and
  // in the HTML/Markdown exports, and are attacker-controllable on a forged
  // report. Unlike a help-link, a finding's sc/name/level/issue/reason are
  // substantive accessibility content — so an unsafe url neutralizes just
  // that field (to '') rather than dropping the whole finding.
  it('neutralizes a javascript: URL on a conformance failure but keeps the finding', () => {
    const res = sanitizeStoredReport({
      filename: 'x.pdf',
      overallScore: 50,
      conformance: {
        status: 'fail',
        headline: 'x',
        failures: [
          {
            sc: '1.1.1',
            name: 'Non-text Content',
            level: 'A',
            category: 'alt_text',
            issue: '2 images have no alt text',
            url: 'javascript:alert(document.domain)',
          },
        ],
        notAssessed: [],
      },
    })
    expect(res.ok).toBe(true)
    const failure = (res.report as any).conformance.failures[0]
    expect(failure.url).toBe('')
    expect(failure.sc).toBe('1.1.1')
    expect(failure.issue).toBe('2 images have no alt text')
  })

  it('neutralizes a data: URL on a conformance notAssessed entry but keeps the criterion', () => {
    const res = sanitizeStoredReport({
      filename: 'x.pdf',
      overallScore: 50,
      conformance: {
        status: 'incomplete',
        headline: 'x',
        failures: [],
        notAssessed: [
          {
            sc: '1.4.3',
            name: 'Contrast (Minimum)',
            level: 'AA',
            reason: 'not automated',
            url: 'data:text/html,<script>alert(1)</script>',
          },
        ],
      },
    })
    expect(res.ok).toBe(true)
    const na = (res.report as any).conformance.notAssessed[0]
    expect(na.url).toBe('')
    expect(na.sc).toBe('1.4.3')
    expect(na.reason).toBe('not automated')
  })

  it('leaves safe https conformance URLs untouched (value-equal)', () => {
    const clean = {
      filename: 'x.pdf',
      overallScore: 90,
      conformance: {
        status: 'fail',
        headline: 'x',
        failures: [
          {
            sc: '1.1.1',
            name: 'Non-text Content',
            level: 'A',
            category: 'alt_text',
            issue: 'x',
            url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html',
          },
        ],
        notAssessed: [
          {
            sc: '1.4.3',
            name: 'Contrast (Minimum)',
            level: 'AA',
            reason: 'not automated',
            url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
          },
        ],
      },
    }
    const res = sanitizeStoredReport(clean)
    expect(res.ok).toBe(true)
    expect(res.report).toEqual(clean)
  })

  it('does not mutate the caller-supplied object', () => {
    const input = {
      filename: 'x.pdf',
      overallScore: 50,
      conformance: {
        status: 'fail',
        headline: 'x',
        failures: [
          {
            sc: '1.1.1',
            name: 'x',
            level: 'A',
            category: 'x',
            issue: 'x',
            url: 'javascript:alert(1)',
          },
        ],
        notAssessed: [],
      },
    }
    sanitizeStoredReport(input)
    expect(input.conformance.failures[0].url).toBe('javascript:alert(1)')
  })
})

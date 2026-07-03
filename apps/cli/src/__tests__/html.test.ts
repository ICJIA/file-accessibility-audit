import { describe, it, expect } from 'vitest'
import { generateHtml, isSafeHttpUrl } from '../lib/html.js'
import type { CachedRow } from '../lib/cache.js'

// ---------------------------------------------------------------------------
// F1 [MEDIUM]: publist "Download" link href scheme guard.
//
// generateHtml() builds a static HTML page whose row rendering (renderRow)
// runs CLIENT-SIDE, inside an embedded <script> IIFE, at page-view time —
// not at generateHtml()-build time. The per-row Download anchor
// (`'<a href="' + h(r.u) + '" ...'`) is built from `r.u` (== a row's
// file_url, sourced from an external publications API) with only HTML-entity
// escaping (h()), not a URL-scheme check. A `javascript:`/`data:` file_url
// would produce a live dangerous link once a viewer opens /publist.html and
// expands that row.
//
// isSafeHttpUrl is a single, real, directly-unit-tested TypeScript function
// (below) embedded into the generated page's <script> via
// isSafeHttpUrl.toString() — plain text generation, exactly like how
// rowsJson/catIdsJson are already embedded elsewhere in generateHtml. This
// deliberately avoids executing any generated/dynamic script in the test
// process (no eval, no `new Function`, no vm): the guard's actual logic is
// exercised directly as a normal function call, and the generated-HTML
// assertions only check that the guarded shape shipped into the template
// text — they don't need to run it to know what it will do, because it's
// the exact same function object being tested directly above.
// ---------------------------------------------------------------------------

function baseRow(overrides: Partial<CachedRow> = {}): CachedRow {
  return {
    file_url: 'https://example.gov/report.pdf',
    title: 'Sample Publication',
    publication_date: '2024-01-01',
    pub_type: 'AnnualReport',
    overall_score: 85,
    grade: 'B',
    text_extractability_score: null,
    text_extractability_grade: null,
    text_extractability_severity: null,
    title_language_score: null,
    title_language_grade: null,
    title_language_severity: null,
    heading_structure_score: null,
    heading_structure_grade: null,
    heading_structure_severity: null,
    alt_text_score: null,
    alt_text_grade: null,
    alt_text_severity: null,
    pdf_ua_compliance_score: null,
    pdf_ua_compliance_grade: null,
    pdf_ua_compliance_severity: null,
    bookmarks_score: null,
    bookmarks_grade: null,
    bookmarks_severity: null,
    table_markup_score: null,
    table_markup_grade: null,
    table_markup_severity: null,
    color_contrast_score: null,
    color_contrast_grade: null,
    color_contrast_severity: null,
    link_quality_score: null,
    link_quality_grade: null,
    link_quality_severity: null,
    form_accessibility_score: null,
    form_accessibility_grade: null,
    form_accessibility_severity: null,
    reading_order_score: null,
    reading_order_grade: null,
    reading_order_severity: null,
    supplementary_score: null,
    supplementary_grade: null,
    supplementary_severity: null,
    slide_titles_score: null,
    slide_titles_grade: null,
    slide_titles_severity: null,
    sheet_names_score: null,
    sheet_names_grade: null,
    sheet_names_severity: null,
    critical_findings: null,
    page_count: 10,
    summary: null,
    tags: null,
    status: 'complete',
    error_message: null,
    audited_at: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('isSafeHttpUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(isSafeHttpUrl('https://example.gov/annual-report.pdf')).toBe(true)
    expect(isSafeHttpUrl('http://example.gov/report.pdf')).toBe(true)
  })

  it('rejects javascript:, data:, and vbscript: schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(document.domain)')).toBe(false)
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false)
  })

  it('rejects relative, empty, malformed, and non-string values', () => {
    expect(isSafeHttpUrl('/relative/path')).toBe(false)
    expect(isSafeHttpUrl('//evil.example')).toBe(false)
    expect(isSafeHttpUrl('not a url')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
    expect(isSafeHttpUrl(undefined)).toBe(false)
    expect(isSafeHttpUrl(42)).toBe(false)
  })
})

describe('publist HTML: Download link href scheme guard (F1)', () => {
  it('embeds the isSafeHttpUrl guard function verbatim into the generated page script', () => {
    const html = generateHtml([baseRow()], new Date('2026-01-01'))
    expect(html).toContain('function isSafeHttpUrl(')
    // Embedded via .toString() of the tested function above — confirm the
    // actual scheme check (not just a same-named stub) made it into the
    // page. Quote style/whitespace vary by transpiler (tsx vs. vitest's
    // esbuild transform may or may not minify), so match loosely on the
    // meaningful tokens rather than an exact formatted string.
    expect(html).toMatch(/protocol\s*===\s*["']http:["']/)
    expect(html).toMatch(/protocol\s*===\s*["']https:["']/)
  })

  it('the Download anchor construction is gated on isSafeHttpUrl(r.u), not bare truthiness', () => {
    const html = generateHtml([baseRow()], new Date('2026-01-01'))
    expect(html).toContain('r.u && isSafeHttpUrl(r.u)')
    // The old vulnerable shape — `(r.u ? '<a href="' + h(r.u) + ...` with no
    // scheme check — must be gone.
    expect(html).not.toMatch(/\(r\.u\s*\?\s*'<a href="'\s*\+\s*h\(r\.u\)/)
  })

  it('the sibling "View Full Analysis" link (auditLink, already-safe encodeURIComponent path) is untouched', () => {
    const html = generateHtml([baseRow()], new Date('2026-01-01'))
    expect(html).toContain("var link = r.u ? auditLink(r.u) : '';")
  })
})

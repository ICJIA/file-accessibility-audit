import { describe, it, expect } from 'vitest'
import { PPTX, WCAG_CATEGORY_MAP } from '#config'
import { scorePptx } from '../services/scorer.js'
import type { PptxAnalysis } from '../services/pptxService.js'

describe('PPTX config', () => {
  it('is enabled by default with the spec caps and weights', () => {
    expect(PPTX.ENABLED).toBe(true)
    expect(PPTX.MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
    expect(PPTX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024)
    expect(PPTX.MAX_SLIDES).toBe(2000)
    expect(PPTX.MAX_SHAPES).toBe(100_000)
    expect(PPTX.ANALYSIS_TIMEOUT_MS).toBe(20_000)
    const w = PPTX.SCORING_WEIGHTS
    expect(w.text_extractability).toBe(0.05)
    expect(w.title_language).toBe(0.14)
    expect(w.slide_titles).toBe(0.18)
    expect(w.alt_text).toBe(0.18)
    expect(w.reading_order).toBe(0.1)
    expect(w.table_markup).toBe(0.1)
    expect(w.color_contrast).toBe(0.1)
    expect(w.list_structure).toBe(0.07)
    expect(w.link_quality).toBe(0.08)
  })

  it('slide_titles is registered in the WCAG category map', () => {
    expect(WCAG_CATEGORY_MAP.slide_titles).toEqual([
      { sc: '1.3.1', name: 'Info and Relationships', level: 'A' },
      { sc: '2.4.6', name: 'Headings and Labels', level: 'AA' },
    ])
  })
})

function baseAnalysis(over: Partial<PptxAnalysis> = {}): PptxAnalysis {
  return {
    metadata: { title: 'Deck', creator: 'x', language: 'en-US', slideCount: 2 },
    slides: [
      { index: 1, title: 'Welcome', titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: 'Agenda', titleIsFirstShape: true, shapeCount: 3 },
    ],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
    ...over,
  }
}

describe('scorePptx', () => {
  it('scores a clean deck high with the docx-shaped result', () => {
    const r = scorePptx(baseAnalysis())
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.scoringMode).toBe('strict')
    expect(r.conformance.status).toBe('no-automated-failures')
    const ids = r.categories.map((c) => c.id)
    expect(ids).toContain('slide_titles')
    expect(ids).toContain('reading_order')
    expect(ids).not.toContain('heading_structure')
    expect(ids).not.toContain('bookmarks')
  })

  it('slide_titles penalizes untitled slides and duplicates, naming slide numbers', () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 },
          { index: 2, title: 'Update', titleIsFirstShape: true, shapeCount: 1 },
          { index: 3, title: 'Update', titleIsFirstShape: true, shapeCount: 1 },
        ],
      }),
    )
    const cat = r.categories.find((c) => c.id === 'slide_titles')!
    expect(cat.score).toBe(70) // 100 − 20 (slide 1) − 10 (one duplicate group)
    expect(cat.findings.join(' ')).toContain('Slide 1')
    expect(cat.findings.join(' ')).toContain('"Update"')
  })

  it('reading_order deducts for title-not-first and advises on shape-heavy slides', () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: 'T', titleIsFirstShape: false, shapeCount: 12 },
        ],
      }),
    )
    const cat = r.categories.find((c) => c.id === 'reading_order')!
    expect(cat.score).toBe(85)
    expect(cat.findings.join(' ')).toMatch(/12 shapes/)
  })

  it('null-scores empty categories so they renormalize away', () => {
    const r = scorePptx(baseAnalysis({ contrast: { checkedRuns: 0, unresolvedRuns: 3, failing: [] } }))
    expect(r.categories.find((c) => c.id === 'alt_text')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'table_markup')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'color_contrast')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'form_accessibility')!.notAssessed).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { evaluatePptxConformance } from '../services/scoring/conformance.js'
import type { PptxAnalysis } from '../services/pptxService.js'

function analysis(over: Partial<PptxAnalysis>): PptxAnalysis {
  return {
    metadata: { title: 'Deck', creator: null, language: 'en-US', slideCount: 1 },
    slides: [{ index: 1, title: 'T', titleIsFirstShape: true, shapeCount: 1 }],
    images: [], tables: [], links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false, shapeCount: 1,
    ...over,
  }
}

describe('evaluatePptxConformance', () => {
  it('is clean for a well-formed deck', () => {
    const v = evaluatePptxConformance(analysis({}))
    expect(v.status).toBe('no-automated-failures')
    expect(v.failures).toEqual([])
  })

  it('fires 1.1.1 / 2.4.2 / 3.1.1 / 1.3.1 / 1.4.3 on confirmed violations', () => {
    const v = evaluatePptxConformance(
      analysis({
        metadata: { title: null, creator: null, language: null, slideCount: 1 },
        images: [{ altText: null, decorative: false }],
        tables: [{ hasHeaderRow: false, rowCount: 3, colCount: 3 }],
        contrast: {
          checkedRuns: 1, unresolvedRuns: 0,
          failing: [{ text: 'x', ratio: 1.4, foreground: '#DDDDDD', background: '#FFFFFF', large: false }],
        },
      }),
    )
    expect(v.status).toBe('fail')
    expect(v.failures.map((f) => f.sc).sort()).toEqual(['1.1.1', '1.3.1', '1.4.3', '2.4.2', '3.1.1'])
  })

  it('does NOT fire for untitled slides (scoring-only) and lists media as not assessed', () => {
    const v = evaluatePptxConformance(
      analysis({
        slides: [{ index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 }],
        hasMedia: true,
      }),
    )
    expect(v.status).toBe('no-automated-failures')
    expect(v.notAssessed.map((n) => n.sc)).toContain('1.2.2')
  })
})

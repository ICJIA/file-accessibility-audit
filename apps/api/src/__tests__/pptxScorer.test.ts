import { describe, it, expect } from 'vitest'
import { PPTX, WCAG_CATEGORY_MAP } from '#config'

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

import { describe, it, expect } from 'vitest'
import { XLSX, WCAG_CATEGORY_MAP } from '#config'

describe('XLSX config', () => {
  it('is enabled by default with the spec caps and weights', () => {
    expect(XLSX.ENABLED).toBe(true)
    expect(XLSX.MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(XLSX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024)
    expect(XLSX.MAX_SHEETS).toBe(200)
    expect(XLSX.MAX_CELLS).toBe(1_000_000)
    expect(XLSX.ANALYSIS_TIMEOUT_MS).toBe(20_000)
    const w = XLSX.SCORING_WEIGHTS
    expect(w.text_extractability).toBe(0.05)
    expect(w.title_language).toBe(0.12)
    expect(w.sheet_names).toBe(0.18)
    expect(w.table_markup).toBe(0.25)
    expect(w.alt_text).toBe(0.18)
    expect(w.color_contrast).toBe(0.12)
    expect(w.link_quality).toBe(0.1)
  })

  it('sheet_names is registered in the WCAG category map', () => {
    expect(WCAG_CATEGORY_MAP.sheet_names).toEqual([
      { sc: '2.4.6', name: 'Headings and Labels', level: 'AA' },
    ])
  })
})

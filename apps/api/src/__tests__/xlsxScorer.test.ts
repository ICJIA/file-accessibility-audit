import { describe, it, expect } from 'vitest'
import { XLSX, WCAG_CATEGORY_MAP } from '#config'
import { scoreXlsx } from '../services/scorer.js'
import type { XlsxAnalysis } from '../services/xlsxService.js'

describe('XLSX config', () => {
  it('is enabled by default with the spec caps and weights', () => {
    expect(XLSX.ENABLED).toBe(true)
    expect(XLSX.MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(XLSX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024)
    expect(XLSX.MAX_SHEETS).toBe(200)
    expect(XLSX.MAX_CELLS).toBe(1_000_000)
    expect(XLSX.MAX_DRAWING_OBJECTS).toBe(100_000)
    expect(XLSX.MAX_HYPERLINKS).toBe(100_000)
    expect(XLSX.MAX_TABLES).toBe(10_000)
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

function baseAnalysis(over: Partial<XlsxAnalysis> = {}): XlsxAnalysis {
  return {
    metadata: { title: 'Ledger', creator: 'x', sheetCount: 1 },
    sheets: [{ name: 'FY26 Grants', hidden: false, defaultNamed: false, mergedRangeCount: 0, usedRangeCellCount: 80, hasDefinedTable: true }],
    tables: [{ sheetName: 'FY26 Grants', name: 'Grants', hasHeaderRow: true }],
    images: [], links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    ...over,
  }
}

describe('scoreXlsx', () => {
  it('scores a clean workbook high, in the shared result shape', () => {
    const r = scoreXlsx(baseAnalysis())
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.conformance.status).toBe('no-automated-failures')
    const ids = r.categories.map((c) => c.id)
    expect(ids).toContain('sheet_names')
    expect(ids).not.toContain('reading_order')
    expect(ids).not.toContain('heading_structure')
  })

  it('sheet_names penalizes default-named visible sheets only', () => {
    const r = scoreXlsx(baseAnalysis({
      sheets: [
        { name: 'Sheet1', hidden: false, defaultNamed: true, mergedRangeCount: 0, usedRangeCellCount: 80, hasDefinedTable: true },
        { name: 'Sheet2', hidden: true, defaultNamed: true, mergedRangeCount: 0, usedRangeCellCount: 0, hasDefinedTable: false },
      ],
    }))
    expect(r.categories.find((c) => c.id === 'sheet_names')!.score).toBe(75)
  })

  it('table_markup: headerless table −30, dataful-sheet-without-table −10, merges capped −15', () => {
    const r = scoreXlsx(baseAnalysis({
      sheets: [
        { name: 'A', hidden: false, defaultNamed: false, mergedRangeCount: 2, usedRangeCellCount: 100, hasDefinedTable: false },
        { name: 'B', hidden: false, defaultNamed: false, mergedRangeCount: 1, usedRangeCellCount: 50, hasDefinedTable: false },
        { name: 'C', hidden: false, defaultNamed: false, mergedRangeCount: 1, usedRangeCellCount: 40, hasDefinedTable: false },
        { name: 'D', hidden: false, defaultNamed: false, mergedRangeCount: 0, usedRangeCellCount: 30, hasDefinedTable: true },
      ],
      tables: [{ sheetName: 'D', name: 'T', hasHeaderRow: false }],
    }))
    // 100 − 30 (headerless) − 10 (data w/o table, once) − 15 (merges, capped) = 45
    expect(r.categories.find((c) => c.id === 'table_markup')!.score).toBe(45)
  })

  it('title_language scores on title alone and explains the language gap', () => {
    const r = scoreXlsx(baseAnalysis({ metadata: { title: null, creator: null, sheetCount: 1 } }))
    const cat = r.categories.find((c) => c.id === 'title_language')!
    expect(cat.score).toBe(0)
    expect(cat.findings.join(' ')).toMatch(/does not store a document language/i)
  })
})

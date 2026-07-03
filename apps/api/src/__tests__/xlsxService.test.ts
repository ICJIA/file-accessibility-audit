import { describe, it, expect } from 'vitest'
import { buildXlsx } from './helpers/minimalXlsx.js'
import { analyzeXlsx, XlsxParseError } from '../services/xlsxService.js'

describe('xlsxService: workbook + sheets', () => {
  it('reads core metadata, sheet names, hidden state, default-name flags', async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: 'Sheet1', dimensionRef: 'A1:D20' },
        { name: 'FY26 Grants', dimensionRef: 'A1:B2' },
        { name: 'Sheet 3', hidden: true },
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.metadata.title).toBe('Grant Ledger')
    expect(a.metadata.sheetCount).toBe(3)
    expect(a.sheets.map((s) => s.defaultNamed)).toEqual([true, false, true])
    expect(a.sheets.map((s) => s.hidden)).toEqual([false, false, true])
  })

  it('computes used-range cell counts from the dimension ref', async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: 'A', dimensionRef: 'A1:D20' }, // 4 × 20 = 80
        { name: 'B', dimensionRef: 'A1' },     // 1
        { name: 'C' },                          // no dimension → 0
        { name: 'D', dimensionRef: 'AA10:AB11' }, // 2 × 2 = 4 (base-26 columns)
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.sheets.map((s) => s.usedRangeCellCount)).toEqual([80, 1, 0, 4])
  })

  it('counts merged ranges per sheet', async () => {
    const buf = await buildXlsx({ sheets: [{ name: 'M', dimensionRef: 'A1:B4', mergeCount: 3 }] })
    expect((await analyzeXlsx(buf)).sheets[0].mergedRangeCount).toBe(3)
  })

  it('rejects non-xlsx input', async () => {
    await expect(analyzeXlsx(Buffer.from('nope'))).rejects.toBeInstanceOf(XlsxParseError)
  })
})

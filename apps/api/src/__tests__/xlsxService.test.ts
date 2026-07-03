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

describe('xlsxService: tables, drawings, links', () => {
  it('reads defined tables: absent headerRowCount means header ON, 0 means OFF', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'Data', dimensionRef: 'A1:C4',
        tables: [{ name: 'GoodTable' }, { name: 'BadTable', headerRowCount: 0 }],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.tables).toEqual([
      { sheetName: 'Data', name: 'GoodTable', hasHeaderRow: true },
      { sheetName: 'Data', name: 'BadTable', hasHeaderRow: false },
    ])
    expect(a.sheets[0].hasDefinedTable).toBe(true)
  })

  it('reads picture and chart alt text from the drawing part', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'Viz', dimensionRef: 'A1:B2',
        drawings: [
          { kind: 'pic', descr: 'Staff photo' },
          { kind: 'chart' },
          { kind: 'pic', decorative: true },
        ],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.images).toEqual([
      { altText: 'Staff photo', decorative: false },
      { altText: null, decorative: false },
      { altText: null, decorative: true },
    ])
  })

  it('finds a picture inside a twoCellAnchor (real Excel default)', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'T', dimensionRef: 'A1:B2', drawings: [{ kind: 'pic', descr: 'Two-cell anchored', anchor: 'twoCell' }] }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.images).toEqual([{ altText: 'Two-cell anchored', decorative: false }])
  })

  it('collects every object in a grouped anchor (nothing silently dropped)', async () => {
    const grp = `<xdr:oneCellAnchor><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="30" name="Group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr>
      <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="31" name="p" descr="Grouped photo"/><xdr:cNvPicPr/></xdr:nvPicPr></xdr:pic>
      <xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="32" name="c"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr></xdr:graphicFrame>
    </xdr:grpSp></xdr:oneCellAnchor>`
    const buf = await buildXlsx({ sheets: [{ name: 'G', dimensionRef: 'A1:B2', rawDrawings: grp }] })
    const a = await analyzeXlsx(buf)
    expect(a.images).toEqual([
      { altText: 'Grouped photo', decorative: false },
      { altText: null, decorative: false },
    ])
  })

  it('reads hyperlinks with display text, and "" when display is absent', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'L', dimensionRef: 'A1:B2',
        hyperlinks: [
          { id: 'rIdH1', target: 'https://example.gov/a', display: 'Annual report' },
          { id: 'rIdH2', target: 'https://example.gov/b' },
        ],
      }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.links).toEqual([
      { text: 'Annual report', url: 'https://example.gov/a' },
      { text: '', url: 'https://example.gov/b' },
    ])
  })
})

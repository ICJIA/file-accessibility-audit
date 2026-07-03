import { describe, it, expect, vi } from 'vitest'
import { buildXlsx } from './helpers/minimalXlsx.js'
import { analyzeXlsx, XlsxParseError, countCellsAnyDepth } from '../services/xlsxService.js'
import { parseXml, rootElement } from '../services/ooxml.js'

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

// ---------------------------------------------------------------------------
// Security-hardening regression tests (red/blue audit, DoS): MAX_CELLS
// previously trusted the self-reported <dimension ref> instead of the actual
// parsed <c> cells, so a hostile `<dimension ref="A1:A1"/>` over a huge
// <sheetData> bypassed the cap entirely while the content walks (drawings,
// hyperlinks, tables) still processed every real cell's siblings. See
// fix-2-report.md.
// ---------------------------------------------------------------------------

describe('xlsxService: MAX_CELLS cap derives from real parsed cells, not the dimension ref (DoS hardening)', () => {
  it('countCellsAnyDepth counts <c> elements at any depth, not just directly under a row', () => {
    const nested = Array.from({ length: 50 }, (_, i) => `<c r="A${i + 1}"/>`).join('')
    // Deliberately wrapped one level deeper than real Excel output (sheetData
    // > row > c) to prove the tally isn't hard-coded to that exact shape — a
    // hostile file doesn't have to respect it.
    const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData><row r="1"><weirdWrapper>${nested}</weirdWrapper></row></sheetData>
    </worksheet>`
    const sheetRoot = rootElement(parseXml(xml), 'worksheet')!
    expect(countCellsAnyDepth(sheetRoot)).toBe(50)
  })

  it('rejects a workbook whose real cell count exceeds MAX_CELLS even when <dimension ref> understates it', async () => {
    // Scope a tiny MAX_CELLS to THIS test only (the real 1,000,000 cap is far
    // too large to build a fixture for).
    vi.resetModules()
    vi.doMock('#config', async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> }
      return { ...actual, XLSX: { ...actual.XLSX, MAX_CELLS: 5 } }
    })
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } = await import(
        '../services/xlsxService.js'
      )
      const { buildXlsx: build } = await import('./helpers/minimalXlsx.js')
      // <dimension ref> lies: it claims a single cell (well under the cap)...
      const cells = Array.from({ length: 10 }, (_, i) => ({ ref: `A${i + 1}`, value: '1' }))
      const buf = await build({ sheets: [{ name: 'S', dimensionRef: 'A1:A1', cells }] })
      // ...but 10 real <c> elements exceed the scoped cap of 5.
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError)
    } finally {
      vi.doUnmock('#config')
      vi.resetModules()
    }
  })

  it('does not reject when the dimension ref is huge but the real cell count is small (dimension no longer drives the cap)', async () => {
    vi.resetModules()
    vi.doMock('#config', async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> }
      return { ...actual, XLSX: { ...actual.XLSX, MAX_CELLS: 5 } }
    })
    try {
      const { analyzeXlsx: analyze } = await import('../services/xlsxService.js')
      const { buildXlsx: build } = await import('./helpers/minimalXlsx.js')
      // <dimension ref> claims a huge range, but only 2 real cells exist.
      const buf = await build({
        sheets: [{
          name: 'S', dimensionRef: 'A1:A1000000',
          cells: [{ ref: 'A1', value: '1' }, { ref: 'A2', value: '2' }],
        }],
      })
      await expect(analyze(buf)).resolves.toBeTruthy()
    } finally {
      vi.doUnmock('#config')
      vi.resetModules()
    }
  })

  it('usedRangeCellCount (scoring/display metadata) still comes from the dimension ref, unaffected by the cap change', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'S', dimensionRef: 'A1:D20', cells: [{ ref: 'A1', value: '1' }] }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.sheets[0].usedRangeCellCount).toBe(80)
  })
})

describe('xlsxService: drawing-object and hyperlink volume caps (DoS hardening)', () => {
  it('rejects a workbook whose drawing-object volume exceeds MAX_DRAWING_OBJECTS', async () => {
    vi.resetModules()
    vi.doMock('#config', async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> }
      return { ...actual, XLSX: { ...actual.XLSX, MAX_DRAWING_OBJECTS: 5 } }
    })
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } = await import(
        '../services/xlsxService.js'
      )
      const { buildXlsx: build } = await import('./helpers/minimalXlsx.js')
      const drawings = Array.from({ length: 10 }, () => ({ kind: 'pic' as const }))
      const buf = await build({ sheets: [{ name: 'S', dimensionRef: 'A1:B2', drawings }] })
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError)
    } finally {
      vi.doUnmock('#config')
      vi.resetModules()
    }
  })

  it('rejects a workbook whose hyperlink volume exceeds MAX_HYPERLINKS', async () => {
    vi.resetModules()
    vi.doMock('#config', async (importOriginal) => {
      const actual = (await importOriginal()) as { XLSX: Record<string, unknown> }
      return { ...actual, XLSX: { ...actual.XLSX, MAX_HYPERLINKS: 5 } }
    })
    try {
      const { analyzeXlsx: analyze, XlsxParseError: ParseError } = await import(
        '../services/xlsxService.js'
      )
      const { buildXlsx: build } = await import('./helpers/minimalXlsx.js')
      const hyperlinks = Array.from({ length: 10 }, (_, i) => ({
        id: `rIdH${i}`,
        target: `https://example.gov/${i}`,
      }))
      const buf = await build({ sheets: [{ name: 'S', dimensionRef: 'A1:B2', hyperlinks }] })
      await expect(analyze(buf)).rejects.toBeInstanceOf(ParseError)
    } finally {
      vi.doUnmock('#config')
      vi.resetModules()
    }
  })
})

describe('xlsxService: styles contrast', () => {
  it('fails a low-contrast font/fill pair and labels it by style index', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B2',
        // Both styles must be APPLIED to a real non-empty cell — an unused
        // cellXfs entry is never evaluated (see the false-positive-hardening
        // describe block below).
        cells: [
          { ref: 'A1', styleIndex: 1, value: 'Total' },
          { ref: 'A2', styleIndex: 2, value: 'Total' },
        ],
      }],
      styles: [
        { fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }, // ≈1.35:1 → fail
        { fontRgb: 'FF000000', fillRgb: 'FFFFFFFF' }, // 21:1 → pass
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0]).toMatchObject({
      foreground: '#DDDDDD',
      background: '#FFFFFF',
      large: false,
    })
    expect(a.contrast.failing[0].text).toMatch(/cell style #\d+/)
  })

  it('large text uses the 3:1 threshold (18pt, or bold 14pt)', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B3',
        cells: [
          { ref: 'A1', styleIndex: 1, value: 'x' },
          { ref: 'A2', styleIndex: 2, value: 'x' },
          { ref: 'A3', styleIndex: 3, value: 'x' },
        ],
      }],
      styles: [
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 18 },            // ≈3.0:1 large → pass
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 14, bold: true }, // large-bold → pass
        { fontRgb: 'FF949494', fillRgb: 'FFFFFFFF', sz: 11 },            // normal → fail
      ],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.failing).toHaveLength(1)
  })

  it('theme-indexed colors and non-solid fills count as unresolved', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B2',
        cells: [
          { ref: 'A1', styleIndex: 1, value: 'x' },
          { ref: 'A2', styleIndex: 2, value: 'x' },
        ],
      }],
      styles: [{ fontTheme: true, fillRgb: 'FFFFFFFF' }, { fontRgb: 'FF000000' }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.unresolvedRuns).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Security/correctness-hardening regression tests (red/blue audit): contrast
// previously evaluated EVERY <xf> in cellXfs unconditionally, so a workbook
// with unused/template styles (openpyxl and PhpSpreadsheet routinely emit
// these) got a false WCAG 1.4.3 failure for a style no visible cell ever
// used — even an entirely empty <sheetData/> could "fail" contrast. See
// fix-2-report.md.
// ---------------------------------------------------------------------------

describe('xlsxService: contrast is only evaluated for styles applied to a non-empty cell (false-positive hardening)', () => {
  it('does NOT flag a low-contrast style that no cell actually uses', async () => {
    const buf = await buildXlsx({
      sheets: [{ name: 'S', dimensionRef: 'A1:B2' }], // no cells — <sheetData/> stays empty
      styles: [{ fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }], // would fail if evaluated
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.unresolvedRuns).toBe(0)
    expect(a.contrast.failing).toHaveLength(0)
  })

  it('does NOT flag a low-contrast style applied only to an empty cell (bare <c s="N"/>, no value child)', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B2',
        cells: [{ ref: 'A1', styleIndex: 1, empty: true }],
      }],
      styles: [{ fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.failing).toHaveLength(0)
  })

  it('treats inline-string and formula cells as non-empty (applies their style), unlike a bare empty cell', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B3',
        cells: [
          { ref: 'A1', styleIndex: 1, kind: 'is', value: 'Inline text' }, // non-empty → applied
          { ref: 'A2', styleIndex: 2, kind: 'f', value: 'SUM(A1:A1)' },   // non-empty → applied
          { ref: 'A3', styleIndex: 3, empty: true },                      // empty → NOT applied
        ],
      }],
      styles: [
        { fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }, // fail if evaluated
        { fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }, // fail if evaluated
        { fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }, // fail if evaluated — but unused (empty cell only)
      ],
    })
    const a = await analyzeXlsx(buf)
    // Only styles 1 and 2 (applied to the is/f cells) are evaluated; style 3
    // (applied only to the empty cell) is not.
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(2)
  })

  it('DOES flag a low-contrast style once legitimately applied to a real non-empty cell', async () => {
    const buf = await buildXlsx({
      sheets: [{
        name: 'S', dimensionRef: 'A1:B2',
        cells: [{ ref: 'A1', styleIndex: 1, value: 'Total' }],
      }],
      styles: [{ fontRgb: 'FFDDDDDD', fillRgb: 'FFFFFFFF' }],
    })
    const a = await analyzeXlsx(buf)
    expect(a.contrast.checkedRuns).toBe(1)
    expect(a.contrast.failing).toHaveLength(1)
  })
})

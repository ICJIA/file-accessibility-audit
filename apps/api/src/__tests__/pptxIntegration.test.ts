/**
 * End-to-end PPTX tests on real .pptx bytes (built by minimalPptx, unzipped and
 * parsed for real) routed through the dispatcher — the PPTX analogue of
 * docxIntegration.test.ts. Proves the whole extract → score → conformance
 * chain produces sensible results, not just the unit pieces.
 */
import { describe, it, expect } from 'vitest'
import { buildPptx, bodyShape, para, picture, pptTable, hyperlinkRels } from './helpers/minimalPptx.js'
import { analyzeDocument } from '../services/analyzer.js'

describe('pptx integration: accessible deck', () => {
  it('scores an accessible deck ≥ 90 with a clean gate', async () => {
    const buf = await buildPptx({
      slides: [
        { title: 'Welcome', body: bodyShape(para('Intro', { bullet: 'char', colorHex: '000000' })) },
        {
          title: 'Data',
          body:
            picture({ descr: 'Trend chart, arrests down 12%' }) +
            pptTable({ firstRow: true, rows: 3, cols: 2 }) +
            bodyShape(para('See the full report', { linkRelId: 'rId9' })),
          rels: hyperlinkRels([{ id: 'rId9', target: 'https://example.gov/r' }]),
        },
      ],
    })
    const r = await analyzeDocument(buf, 'accessible.pptx')
    expect(r.fileType).toBe('pptx')
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(['A', 'A-', 'A+']).toContain(r.grade)
    expect(r.conformance.status).toBe('no-automated-failures')
    expect(r.pdfUa).toBeUndefined()
  })
})

describe('pptx integration: inaccessible deck', () => {
  it('fails a hostile deck ≤ 35 citing the right criteria', async () => {
    const buf = await buildPptx({
      coreXml: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`,
      declareLanguage: false,
      slides: [
        { title: null, body: picture({}) + pptTable({ rows: 3, cols: 3 }) },
        { title: null, body: bodyShape(para('• fake', { colorHex: 'DDDDDD' }) + para('• bullets', { colorHex: 'DDDDDD' })) },
      ],
    })
    const r = await analyzeDocument(buf, 'inaccessible.pptx')
    expect(r.overallScore).toBeLessThanOrEqual(35)
    expect(['F', 'D', 'D-']).toContain(r.grade)
    expect(r.conformance.status).toBe('fail')
    const scs = r.conformance.failures.map((f) => f.sc)
    expect(scs).toEqual(expect.arrayContaining(['1.1.1', '2.4.2', '3.1.1', '1.3.1', '1.4.3']))
  })
})

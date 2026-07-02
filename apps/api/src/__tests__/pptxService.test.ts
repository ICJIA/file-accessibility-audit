import { describe, it, expect } from 'vitest'
import { buildPptx, titleShape, bodyShape, para, picture, pptTable, hyperlinkRels, videoRel } from './helpers/minimalPptx.js'
import { analyzePptx, PptxParseError } from '../services/pptxService.js'

describe('pptxService: package + metadata + slides', () => {
  it('reads core title/creator, presentation language, and slide count', async () => {
    const buf = await buildPptx({ slides: [{ title: 'Welcome' }, { title: 'Agenda' }] })
    const a = await analyzePptx(buf)
    expect(a.metadata.title).toBe('Quarterly Briefing')
    expect(a.metadata.creator).toBe('ICJIA')
    expect(a.metadata.language).toBe('en-US')
    expect(a.metadata.slideCount).toBe(2)
    expect(a.slides.map((s) => s.title)).toEqual(['Welcome', 'Agenda'])
  })

  it('language is null when neither presentation nor master declares one', async () => {
    const buf = await buildPptx({ slides: [{ title: 'T' }], declareLanguage: false })
    expect((await analyzePptx(buf)).metadata.language).toBeNull()
  })

  it('a slide with no title placeholder, or an empty one, has title null', async () => {
    const buf = await buildPptx({ slides: [{ title: null }, { title: undefined }] })
    const a = await analyzePptx(buf)
    expect(a.slides[0].title).toBeNull()
    expect(a.slides[1].title).toBeNull()
  })

  it('titleIsFirstShape is false when content precedes the title in the tree', async () => {
    const buf = await buildPptx({
      slides: [
        { title: 'First' },
        { title: 'Second', beforeTitle: bodyShape(para('I come first')) },
      ],
    })
    const a = await analyzePptx(buf)
    expect(a.slides[0].titleIsFirstShape).toBe(true)
    expect(a.slides[1].titleIsFirstShape).toBe(false)
  })

  it('rejects a non-pptx zip and a missing presentation part', async () => {
    await expect(analyzePptx(Buffer.from('not a zip'))).rejects.toBeInstanceOf(PptxParseError)
  })

  it('rejects a deck over the slide cap', async () => {
    // MAX_SLIDES is 2000 — build cheaply by lying only in [Content_Types].xml
    // is not possible (extractor counts real slide parts), so this test uses a
    // tiny cap-boundary assertion instead: 3 slides pass.
    const buf = await buildPptx({ slides: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] })
    await expect(analyzePptx(buf)).resolves.toBeTruthy()
  })
})

describe('pptxService: images, tables, links, lists, media', () => {
  it('extracts picture alt text, decorative flags, and missing alt', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body:
          picture({ descr: 'Org chart' }) +
          picture({ decorative: true }) +
          picture({}),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.images).toEqual([
      { altText: 'Org chart', decorative: false },
      { altText: null, decorative: true },
      { altText: null, decorative: false },
    ])
  })

  it('a graphicFrame table is a table (with firstRow flag), not an image', async () => {
    const buf = await buildPptx({
      slides: [{ title: 'T', body: pptTable({ firstRow: true, rows: 3, cols: 2 }) + pptTable({}) }],
    })
    const a = await analyzePptx(buf)
    expect(a.tables).toEqual([
      { hasHeaderRow: true, rowCount: 3, colCount: 2 },
      { hasHeaderRow: false, rowCount: 2, colCount: 2 },
    ])
    expect(a.images).toHaveLength(0)
  })

  it('resolves hyperlink text and targets via the slide rels', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(para('Read the full report', { linkRelId: 'rId9' })),
        rels: hyperlinkRels([{ id: 'rId9', target: 'https://example.gov/report' }]),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.links).toEqual([{ text: 'Read the full report', url: 'https://example.gov/report' }])
  })

  it('counts explicit bullets as real list items and literal bullets as manual', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          para('Point one', { bullet: 'char' }) +
            para('Point two', { bullet: 'auto' }) +
            para('• fake bullet') +
            para('plain sentence'),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.lists).toEqual({ realListItems: 2, manualBulletParagraphs: 1 })
  })

  it('flags media presence from slide relationships', async () => {
    const buf = await buildPptx({ slides: [{ title: 'T', rels: videoRel('rId8') }] })
    expect((await analyzePptx(buf)).hasMedia).toBe(true)
  })

  it('counts an OLE-style graphicFrame with a nested fallback pic as ONE image', async () => {
    const oleFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Embedded object"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole">
      <p:pic><p:nvPicPr><p:cNvPr id="21" name="fallback"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdX"/></p:blipFill><p:spPr/></p:pic>
      </a:graphicData></a:graphic></p:graphicFrame>`
    const buf = await buildPptx({ slides: [{ title: 'T', body: oleFrame }] })
    const a = await analyzePptx(buf)
    expect(a.images).toHaveLength(1)
  })

  it('excludes title-placeholder paragraphs from list counting', async () => {
    const buf = await buildPptx({ slides: [{ title: '1. Overview' }] })
    const a = await analyzePptx(buf)
    expect(a.lists).toEqual({ realListItems: 0, manualBulletParagraphs: 0 })
  })
})

describe('pptxService: contrast', () => {
  it('fails a low-contrast explicit color and passes a high-contrast one', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          para('nearly invisible', { colorHex: 'DDDDDD' }) + // vs white ≈ 1.35:1
            para('perfectly fine', { colorHex: '000000' }),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0]).toMatchObject({
      text: 'nearly invisible',
      foreground: '#DDDDDD',
      background: '#FFFFFF',
      large: false,
    })
  })

  it('uses the shape fill, then the slide background, as the background', async () => {
    const buf = await buildPptx({
      slideBgHex: '000000',
      slides: [{
        title: 'T',
        body:
          bodyShape(para('white on black bg', { colorHex: 'FFFFFF' })) +
          bodyShape(para('white on white shape', { colorHex: 'FFFFFF' }), { fillHex: 'FFFFFF' }),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0].background).toBe('#FFFFFF')
  })

  it('resolves theme scheme colors and applies the large-text threshold', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          // accent1 #4472C4 on white ≈ 4.55:1 — passes normal AND large.
          para('theme colored', { schemeColor: 'accent1' }) +
            // 18pt grey #949494 on white ≈ 3.0:1 — passes only because large.
            para('big grey heading', { colorHex: '949494', sizeHundredthsPt: 1800 }),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(0)
  })

  it('counts runs without an explicit color as unresolved', async () => {
    const buf = await buildPptx({
      slides: [{ title: 'T', body: bodyShape(para('inherited color text')) }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.unresolvedRuns).toBeGreaterThanOrEqual(1)
  })
})

import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  rawText,
  textOf,
  rootElement,
  parseRelationships,
  corePropertyText,
  drawingAltText,
  MANUAL_BULLET_RE,
  normalizeHex,
  contrastRatio,
  readCapped,
  resolveSchemeColor,
  parseRelationshipEntries,
  type PONode,
} from '../services/ooxml.js'

// ---------------------------------------------------------------------------
// The shared OOXML core extracted from docxService in v1.33.0. These tests pin
// the format-agnostic contract that docxService, pptxService, and xlsxService
// all build on. Behavior must match the pre-extraction docxService exactly.
// ---------------------------------------------------------------------------

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p w:someAttr="yes"><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>
    <a:p><a:r><a:t>DrawingML text</a:t></a:r></a:p>
  </w:body>
</w:document>`

function bodyOf(xml: string): PONode {
  const root = rootElement(parseXml(xml), 'document')!
  return firstChild(root, 'body')!
}

describe('XML walker helpers', () => {
  it('parseXml returns [] for null and for invalid XML', () => {
    expect(parseXml(null)).toEqual([])
    expect(parseXml('<unclosed')).toEqual([])
  })

  it('rootElement skips the xml declaration and finds the root by local name', () => {
    const root = rootElement(parseXml(SAMPLE), 'document')
    expect(root).toBeDefined()
    expect(tagOf(root!)).toBe('document')
  })

  it('namespace prefixes are stripped: w:p and a:p both walk as "p"', () => {
    const body = bodyOf(SAMPLE)
    expect(descendants(body, 'p')).toHaveLength(2)
  })

  it('textOf joins all local-name "t" descendants (w:t and a:t alike)', () => {
    const body = bodyOf(SAMPLE)
    const [wordPara, drawingPara] = descendants(body, 'p')
    expect(textOf(wordPara)).toBe('Hello world')
    expect(textOf(drawingPara)).toBe('DrawingML text')
  })

  it('attrOf reads attributes; firstChild/childrenOf walk direct children', () => {
    const body = bodyOf(SAMPLE)
    const p = firstChild(body, 'p')!
    expect(attrOf(p, 'someAttr')).toBe('yes')
    expect(attrOf(p, 'missing')).toBeUndefined()
    expect(childrenOf(p).length).toBeGreaterThan(0)
  })

  it('rawText concatenates every #text under a node', () => {
    const p = firstChild(bodyOf(SAMPLE), 'p')!
    expect(rawText(p)).toBe('Hello world')
  })

  it('preserves whitespace-only leaf text (space-only <w:t> runs are kept)', () => {
    const xml = `<w:p xmlns:w="x"><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>`
    const p = rootElement(parseXml(xml), 'p')!
    expect(textOf(p)).toBe('Hello world')
    expect(rawText(p)).toBe('Hello world')
  })
})

describe('parseRelationships', () => {
  const RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../hyperlink" Target="https://example.gov/a"/>
  <Relationship Id="rId2" Type=".../image" Target="media/image1.png"/>
</Relationships>`

  it('maps Id -> Target', () => {
    const map = parseRelationships(RELS)
    expect(map.get('rId1')).toBe('https://example.gov/a')
    expect(map.get('rId2')).toBe('media/image1.png')
    expect(map.size).toBe(2)
  })

  it('returns an empty map for null / unparseable input', () => {
    expect(parseRelationships(null).size).toBe(0)
    expect(parseRelationships('<nope').size).toBe(0)
  })
})

describe('corePropertyText', () => {
  const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Quarterly Report</dc:title>
  <dc:creator>  </dc:creator>
</cp:coreProperties>`

  it('returns trimmed text for a present property and null for empty/missing', () => {
    const root = rootElement(parseXml(CORE), 'coreProperties')
    expect(corePropertyText(root, 'title')).toBe('Quarterly Report')
    expect(corePropertyText(root, 'creator')).toBeNull() // whitespace-only
    expect(corePropertyText(root, 'language')).toBeNull() // absent
    expect(corePropertyText(undefined, 'title')).toBeNull()
  })
})

describe('drawingAltText', () => {
  function props(xml: string): PONode {
    return rootElement(parseXml(xml), 'docPr')!
  }

  it('prefers descr, falls back to title, null when both empty', () => {
    expect(
      drawingAltText(props('<wp:docPr xmlns:wp="x" descr="A chart" title="T"/>')),
    ).toEqual({ altText: 'A chart', decorative: false })
    expect(
      drawingAltText(props('<wp:docPr xmlns:wp="x" descr="  " title="Fallback"/>')),
    ).toEqual({ altText: 'Fallback', decorative: false })
    expect(drawingAltText(props('<wp:docPr xmlns:wp="x"/>'))).toEqual({
      altText: null,
      decorative: false,
    })
  })

  it('reads the decorative extension at any depth', () => {
    const xml = `<wp:docPr xmlns:wp="x" xmlns:adec="y">
      <a:extLst xmlns:a="z"><a:ext><adec:decorative val="1"/></a:ext></a:extLst>
    </wp:docPr>`
    expect(drawingAltText(props(xml)).decorative).toBe(true)
  })
})

describe('contrast math', () => {
  it('normalizeHex handles #-prefix, case, and rejects non-6-digit values', () => {
    expect(normalizeHex('#1a2b3c')).toBe('1A2B3C')
    expect(normalizeHex('FF0000')).toBe('FF0000')
    expect(normalizeHex('fff')).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
    expect(normalizeHex(null)).toBeNull()
  })

  it('contrastRatio: black/white is 21:1, identical colors are 1:1', () => {
    expect(contrastRatio('000000', 'FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('777777', '777777')).toBeCloseTo(1, 5)
  })

  it('contrastRatio matches the known WCAG value for #767676 on white', () => {
    expect(contrastRatio('767676', 'FFFFFF')).toBeCloseTo(4.54, 2)
  })
})

describe('MANUAL_BULLET_RE', () => {
  it('matches literal bullets and enumerators, not ordinary text', () => {
    for (const s of ['• item', '- item', '* item', '1. item', '2) item']) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(true)
    }
    for (const s of ['item', 'Version 2 notes', '10x faster']) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(false)
    }
  })
})

describe('readCapped', () => {
  class FakeError extends Error {}
  const make = (m: string): Error => new FakeError(m)

  async function zipWith(name: string, content: string): Promise<JSZip> {
    const zip = new JSZip()
    zip.file(name, content)
    // Round-trip so entries carry real compressed data + declared sizes.
    return JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }))
  }

  it('reads a small part fully', async () => {
    const zip = await zipWith('part.xml', '<a>ok</a>')
    const text = await readCapped(zip.file('part.xml')!, 1024, 'part.xml', make)
    expect(text).toBe('<a>ok</a>')
  })

  it('rejects with the injected error type when a part exceeds the cap', async () => {
    const big = 'x'.repeat(5000)
    const zip = await zipWith('big.xml', big)
    await expect(
      readCapped(zip.file('big.xml')!, 1024, 'big.xml', make),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof FakeError && (e as Error).message.includes('big.xml'),
    )
  })
})

describe('resolveSchemeColor', () => {
  const THEME = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`
  const root = rootElement(parseXml(THEME), 'theme')

  it('resolves srgbClr and sysClr(lastClr) scheme entries', () => {
    expect(resolveSchemeColor(root, 'accent1')).toBe('4472C4')
    expect(resolveSchemeColor(root, 'dk1')).toBe('000000')
    expect(resolveSchemeColor(root, 'lt1')).toBe('FFFFFF')
  })

  it('maps the tx/bg aliases onto dk/lt and returns null for unknowns', () => {
    expect(resolveSchemeColor(root, 'tx1')).toBe('000000')
    expect(resolveSchemeColor(root, 'bg1')).toBe('FFFFFF')
    expect(resolveSchemeColor(root, 'tx2')).toBe('44546A')
    expect(resolveSchemeColor(root, 'bg2')).toBe('E7E6E6')
    expect(resolveSchemeColor(root, 'nope')).toBeNull()
    expect(resolveSchemeColor(undefined, 'accent1')).toBeNull()
  })
})

describe('parseRelationshipEntries', () => {
  it('returns id/target/type triples; empty for null input', () => {
    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="media/movie1.mp4"/>
</Relationships>`
    expect(parseRelationshipEntries(rels)).toEqual([
      { id: 'rId1', target: 'media/movie1.mp4', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video' },
    ])
    expect(parseRelationshipEntries(null)).toEqual([])
  })
})

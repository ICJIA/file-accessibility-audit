/**
 * Tests for the QPDF JSON parsing logic (parseQpdfJson).
 *
 * Since parseQpdfJson is not exported directly, we import analyzeWithQpdf
 * but we can't easily test it without the qpdf binary. Instead, we test
 * the parsing logic by re-implementing a thin wrapper that calls the same
 * internal function. We work around this by importing the module and
 * testing via the exported analyzeWithQpdf with mocked execFileSync.
 *
 * Alternative approach: we extract and test the parse logic by mocking
 * the child_process module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We mock child_process and fs so analyzeWithQpdf calls parseQpdfJson
// with our test JSON without actually running qpdf.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}))

import { analyzeWithQpdf } from '../services/qpdfService.js'
import { execFileSync } from 'node:child_process'

const mockExec = vi.mocked(execFileSync)

/** Helper: make analyzeWithQpdf parse the given JSON object. */
function parseJson(json: any) {
  mockExec.mockReturnValue(JSON.stringify(json))
  return analyzeWithQpdf(Buffer.from('fake'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Catalog detection
// ---------------------------------------------------------------------------

describe('Catalog with StructTreeRoot, Lang, Outlines, AcroForm', () => {
  it('detects StructTreeRoot from Catalog', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/StructTreeRoot': '2 0 R',
        },
      }],
    })
    expect(result.hasStructTree).toBe(true)
  })

  it('detects StructTreeRoot from /Type /StructTreeRoot object', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/Type': '/StructTreeRoot' },
      }],
    })
    expect(result.hasStructTree).toBe(true)
  })

  it('detects Lang from Catalog', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/Lang': 'en-US',
        },
      }],
    })
    expect(result.hasLang).toBe(true)
    expect(result.lang).toBe('en-US')
  })

  it('handles non-string Lang gracefully', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/Lang': 12345, // not a string
        },
      }],
    })
    expect(result.hasLang).toBe(true)
    expect(result.lang).toBeNull()
  })

  it('detects Outlines from Catalog', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/Outlines': '3 0 R',
        },
      }],
    })
    expect(result.hasOutlines).toBe(true)
  })

  it('detects AcroForm from Catalog', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/AcroForm': { '/Fields': [] },
        },
      }],
    })
    expect(result.hasAcroForm).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

describe('heading detection', () => {
  it('detects H1-H6 headings', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/H1' },
        '3 0 R': { '/S': '/H2' },
        '4 0 R': { '/S': '/H3' },
        '5 0 R': { '/S': '/H4' },
        '6 0 R': { '/S': '/H5' },
        '7 0 R': { '/S': '/H6' },
      }],
    })
    expect(result.headings).toHaveLength(6)
    expect(result.headings.map(h => h.level)).toEqual(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
  })

  it('detects generic /H heading', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/H' },
      }],
    })
    expect(result.headings).toHaveLength(1)
    expect(result.headings[0].level).toBe('H')
    expect(result.headings[0].tag).toBe('/H')
  })

  it('strips leading slash from level', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/H2' },
      }],
    })
    expect(result.headings[0].level).toBe('H2')
  })
})

// ---------------------------------------------------------------------------
// Table detection
// ---------------------------------------------------------------------------

describe('table detection', () => {
  it('detects table without headers', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/Table', '/K': ['3 0 R'] },
        '3 0 R': { '/S': '/TR', '/K': ['4 0 R'] },
        '4 0 R': { '/S': '/TD' },
      }],
    })
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].hasHeaders).toBe(false)
  })

  it('detects table with TH headers', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/Table', '/K': ['3 0 R'] },
        '3 0 R': { '/S': '/TR', '/K': ['4 0 R'] },
        '4 0 R': { '/S': '/TH' },
      }],
    })
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].hasHeaders).toBe(true)
  })

  it('detects TH in inline child objects (not refs)', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': {
          '/S': '/Table',
          '/K': [{ '/S': '/TR', '/K': [{ '/S': '/TH' }] }],
        },
      }],
    })
    expect(result.tables[0].hasHeaders).toBe(true)
  })

  it('handles table with no /K key', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/Table' }, // no /K
      }],
    })
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].hasHeaders).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Figure/image alt text detection
// ---------------------------------------------------------------------------

describe('figure/image alt text detection', () => {
  it('figure with /Alt is detected', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/Subtype': '/Image' },
        '3 0 R': { '/S': '/Figure', '/Alt': 'A photo of a sunset' },
      }],
    })
    // Image at 2 0 R matched with Figure at 3 0 R
    const imageWithAlt = result.images.find(i => i.hasAlt)
    expect(imageWithAlt).toBeDefined()
  })

  it('figure without /Alt is detected as missing alt', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '3 0 R': { '/S': '/Figure' }, // no /Alt
      }],
    })
    const fig = result.images.find(i => i.ref === '3 0 R')
    expect(fig).toBeDefined()
    expect(fig!.hasAlt).toBe(false)
  })

  it('figure with empty /Alt string has no alt', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '3 0 R': { '/S': '/Figure', '/Alt': '' },
      }],
    })
    const fig = result.images.find(i => i.ref === '3 0 R')
    expect(fig).toBeDefined()
    expect(fig!.hasAlt).toBe(false)
  })

  it('standalone Image XObject is detected', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '5 0 R': { '/Subtype': '/Image' },
      }],
    })
    expect(result.images.some(i => i.ref === '5 0 R')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// MCID content order collection
// ---------------------------------------------------------------------------

describe('MCID content order collection', () => {
  it('collects numeric /K as MCID', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/P', '/K': 42 },
      }],
    })
    expect(result.contentOrder).toContain(42)
  })

  it('collects MCIDs from array of numbers', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/P', '/K': [0, 1, 2] },
      }],
    })
    expect(result.contentOrder).toEqual(expect.arrayContaining([0, 1, 2]))
  })

  it('collects MCIDs from objects with /MCID key', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/P', '/K': [{ '/MCID': 5 }, { '/MCID': 10 }] },
      }],
    })
    expect(result.contentOrder).toEqual(expect.arrayContaining([5, 10]))
  })

  it('handles mixed numeric and object MCIDs', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
        '2 0 R': { '/S': '/P', '/K': [3, { '/MCID': 7 }] },
      }],
    })
    expect(result.contentOrder).toEqual(expect.arrayContaining([3, 7]))
  })
})

// ---------------------------------------------------------------------------
// Outline counting
// ---------------------------------------------------------------------------

describe('outline counting', () => {
  it('counts outline entries via /First / /Next chain', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/Outlines': '2 0 R' },
        '2 0 R': { '/Type': '/Outlines', '/First': '3 0 R', '/Last': '5 0 R' },
        '3 0 R': { '/Title': 'Chapter 1', '/Next': '4 0 R' },
        '4 0 R': { '/Title': 'Chapter 2', '/Next': '5 0 R' },
        '5 0 R': { '/Title': 'Chapter 3' },
      }],
    })
    expect(result.outlineCount).toBe(3)
  })

  it('handles empty outline (no /First)', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/Outlines': '2 0 R' },
        '2 0 R': { '/Type': '/Outlines' },
      }],
    })
    expect(result.outlineCount).toBe(0)
  })

  it('handles circular reference in outlines without infinite loop', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/Outlines': '2 0 R' },
        '2 0 R': { '/Type': '/Outlines', '/First': '3 0 R', '/Last': '3 0 R' },
        '3 0 R': { '/Title': 'Loop', '/Next': '3 0 R' }, // circular
      }],
    })
    // Should not hang; visited set prevents infinite loop
    expect(result.outlineCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Structure tree depth calculation
// ---------------------------------------------------------------------------

describe('structure tree depth calculation', () => {
  it('calculates depth for nested structure', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/StructTreeRoot': '2 0 R' },
        '2 0 R': {
          '/Type': '/StructTreeRoot',
          '/K': ['3 0 R'],
        },
        '3 0 R': { '/S': '/Document', '/K': ['4 0 R'] },
        '4 0 R': { '/S': '/H1', '/K': [0] },
      }],
    })
    expect(result.structTreeDepth).toBeGreaterThanOrEqual(2)
  })

  it('flat tree has depth 0 or 1', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/StructTreeRoot': '2 0 R' },
        '2 0 R': { '/Type': '/StructTreeRoot' }, // no children
      }],
    })
    expect(result.structTreeDepth).toBeLessThanOrEqual(1)
  })

  it('no struct tree → depth 0', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog' },
      }],
    })
    expect(result.structTreeDepth).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Form field detection
// ---------------------------------------------------------------------------

describe('form field detection', () => {
  it('detects widget annotations with /TU', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': { '/Type': '/Catalog', '/AcroForm': { '/Fields': ['3 0 R'] } },
        '2 0 R': { '/Type': '/Annot', '/Subtype': '/Widget', '/TU': 'Full Name' },
        '3 0 R': { '/Type': '/Annot', '/Subtype': '/Widget' }, // no /TU
      }],
    })
    expect(result.formFields).toHaveLength(2)
    expect(result.formFields.filter(f => f.hasTU)).toHaveLength(1)
  })

  it('falls back to AcroForm /Fields when no widget annotations found', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': {
          '/Type': '/Catalog',
          '/AcroForm': { '/Fields': ['2 0 R', '3 0 R'] },
        },
        '2 0 R': { '/TU': 'Name field' },
        '3 0 R': {}, // no /TU
      }],
    })
    // The widget annotation scan finds nothing, so AcroForm fallback kicks in
    // But note: the AcroForm fallback only runs if formFields is empty after the first pass
    // and the objects contain widget annotations. Let's check:
    expect(result.hasAcroForm).toBe(true)
    // formFields populated from AcroForm /Fields fallback
    expect(result.formFields.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Empty/malformed JSON handling
// ---------------------------------------------------------------------------

describe('empty/malformed JSON handling', () => {
  it('empty objects → all defaults', () => {
    const result = parseJson({ qpdf: [null, {}] })
    expect(result.hasStructTree).toBe(false)
    expect(result.hasLang).toBe(false)
    expect(result.headings).toHaveLength(0)
    expect(result.tables).toHaveLength(0)
    expect(result.images).toHaveLength(0)
    expect(result.error).toBeNull()
  })

  it('objects key at top level works too', () => {
    const result = parseJson({
      objects: {
        '1 0 R': { '/Type': '/Catalog', '/Lang': 'fr' },
      },
    })
    expect(result.hasLang).toBe(true)
    expect(result.lang).toBe('fr')
  })

  it('null values in objects are skipped', () => {
    const result = parseJson({
      qpdf: [null, {
        '1 0 R': null,
        '2 0 R': 'not an object',
        '3 0 R': { '/Type': '/Catalog' },
      }],
    })
    // Should not throw, should process the valid object
    expect(result.error).toBeNull()
  })

  it('completely empty JSON does not throw', () => {
    const result = parseJson({})
    expect(result.error).toBeNull()
    expect(result.hasStructTree).toBe(false)
  })

  it('malformed execFileSync output falls back to error result', () => {
    mockExec.mockReturnValue('not valid json')
    const result = analyzeWithQpdf(Buffer.from('fake'))
    // JSON.parse will throw, caught by the try/catch in analyzeWithQpdf
    // which returns a default result with error
    expect(result.error).not.toBeNull()
  })
})

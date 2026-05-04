import { describe, it, expect } from 'vitest'
import { isGuidanceFinding, firstActionableFinding, partitionCardFindings } from '../utils/findings'

describe('isGuidanceFinding', () => {
  it('detects guidance prefixes (case-insensitive)', () => {
    expect(isGuidanceFinding('How to fix: add alt text')).toBe(true)
    expect(isGuidanceFinding('TIP: embed fonts')).toBe(true)
    expect(isGuidanceFinding('Fix: tag the structure')).toBe(true)
    expect(isGuidanceFinding('Note: this is informational')).toBe(true)
    expect(isGuidanceFinding('Review these warnings')).toBe(true)
  })

  it('returns false for plain findings', () => {
    expect(isGuidanceFinding('5 image(s) found, none have alt text')).toBe(false)
    expect(isGuidanceFinding('Document is tagged')).toBe(false)
  })

  it('returns false for empty input and for guidance prefixes preceded by whitespace', () => {
    expect(isGuidanceFinding('')).toBe(false)
    // no leading-whitespace tolerance — matches the page duplicates' behavior
    expect(isGuidanceFinding('  Fix: x')).toBe(false)
    expect(isGuidanceFinding('\tNote: x')).toBe(false)
  })
})

describe('firstActionableFinding', () => {
  it('returns the first non-guidance, non-divider, non-indented line', () => {
    const findings = [
      '--- Font Embedding ---',
      '  12 fonts: 5 embedded, 7 not embedded',
      'Fix: embed fonts',
      '5 fonts not embedded',
      'Note: monitor display',
    ]
    expect(firstActionableFinding(findings)).toBe('5 fonts not embedded')
  })

  it('falls back to the first finding when nothing actionable is found', () => {
    const findings = ['Fix: do this', '--- header ---']
    expect(firstActionableFinding(findings)).toBe('Fix: do this')
  })

  it('returns empty string for empty input', () => {
    expect(firstActionableFinding([])).toBe('')
    expect(firstActionableFinding(undefined as any)).toBe('')
  })

  it('skips empty-string elements (defensive against split-on-newline output)', () => {
    expect(firstActionableFinding(['', 'real finding'])).toBe('real finding')
    expect(firstActionableFinding(['', '', ''])).toBe('')
  })
})

describe('partitionCardFindings', () => {
  it('returns empty buckets for empty / null input', () => {
    expect(partitionCardFindings([])).toEqual({
      main: [], signals: [], signalCount: 0, acrobat: [],
    })
    expect(partitionCardFindings(undefined as any)).toEqual({
      main: [], signals: [], signalCount: 0, acrobat: [],
    })
  })

  it('puts plain findings and guidance lines into main', () => {
    const input = [
      'PDF contains extractable text',
      'Document is tagged',
      'Fix: ensure font embedding',
    ]
    const out = partitionCardFindings(input)
    expect(out.main).toEqual(input)
    expect(out.signals).toEqual([])
    expect(out.signalCount).toBe(0)
    expect(out.acrobat).toEqual([])
  })

  it('groups --- headings with their indented detail lines', () => {
    const input = [
      'Plain finding',
      '--- Font Embedding ---',
      '  12 fonts: 5 embedded, 7 not embedded',
      '  KVKXWT+SegoeUI-Bold — embedded',
      '--- Document Structure ---',
      '  219 paragraph tags',
    ]
    const out = partitionCardFindings(input)
    expect(out.main).toEqual(['Plain finding'])
    expect(out.signals).toEqual([
      {
        heading: 'Font Embedding',
        items: ['12 fonts: 5 embedded, 7 not embedded', 'KVKXWT+SegoeUI-Bold — embedded'],
      },
      { heading: 'Document Structure', items: ['219 paragraph tags'] },
    ])
    expect(out.signalCount).toBe(3)
  })

  it('handles indented lines that appear before any --- header', () => {
    const input = [
      'Plain',
      '  stray indented line',
      '--- Header ---',
      '  with header',
    ]
    const out = partitionCardFindings(input)
    expect(out.signals[0]).toEqual({ heading: '', items: ['stray indented line'] })
    expect(out.signals[1]).toEqual({ heading: 'Header', items: ['with header'] })
    expect(out.signalCount).toBe(2)
  })

  it('splits Adobe Acrobat steps off into its own bucket', () => {
    const input = [
      'Plain finding',
      '--- Adobe Acrobat ---',
      'Open Tools → Accessibility',
      'Right-click each figure',
    ]
    const out = partitionCardFindings(input)
    expect(out.main).toEqual(['Plain finding'])
    expect(out.signals).toEqual([])
    expect(out.acrobat).toEqual(['Open Tools → Accessibility', 'Right-click each figure'])
  })

  it('puts technical signals BEFORE the Adobe Acrobat section into signals', () => {
    const input = [
      'Plain',
      '--- Font Embedding ---',
      '  detail',
      '--- Adobe Acrobat ---',
      'step 1',
    ]
    const out = partitionCardFindings(input)
    expect(out.main).toEqual(['Plain'])
    expect(out.signals).toEqual([{ heading: 'Font Embedding', items: ['detail'] }])
    expect(out.signalCount).toBe(1)
    expect(out.acrobat).toEqual(['step 1'])
  })

  it('preserves order of plain findings when interleaved with technical sections', () => {
    const input = [
      'plain1',
      'plain2',
      '--- Header A ---',
      '  detail1',
      'plain3',
      '--- Header B ---',
      '  detail2',
    ]
    const out = partitionCardFindings(input)
    expect(out.main).toEqual(['plain1', 'plain2', 'plain3'])
    expect(out.signals.map((s) => s.heading)).toEqual(['Header A', 'Header B'])
  })
})

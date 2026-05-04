import { describe, it, expect } from 'vitest'
import { isGuidanceFinding, firstActionableFinding } from '../utils/findings'

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

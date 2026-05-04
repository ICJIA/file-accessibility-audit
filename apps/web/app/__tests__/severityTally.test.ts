import { describe, it, expect } from 'vitest'
import { tallySeverity } from '../utils/severityTally'

describe('tallySeverity', () => {
  it('counts categories by severity, ignoring null and unknown', () => {
    const cats = [
      { severity: 'Critical' },
      { severity: 'Critical' },
      { severity: 'Moderate' },
      { severity: 'Minor' },
      { severity: 'Pass' },
      { severity: null },
      { severity: undefined },
      { severity: 'Bogus' as any },
    ]
    expect(tallySeverity(cats as any)).toEqual({
      critical: 2,
      moderate: 1,
      minor: 1,
      pass: 1,
      total: 5,
    })
  })

  it('returns all zeros for empty input', () => {
    expect(tallySeverity([])).toEqual({
      critical: 0, moderate: 0, minor: 0, pass: 0, total: 0,
    })
  })

  it('treats undefined input as empty', () => {
    expect(tallySeverity(undefined as any)).toEqual({
      critical: 0, moderate: 0, minor: 0, pass: 0, total: 0,
    })
  })
})

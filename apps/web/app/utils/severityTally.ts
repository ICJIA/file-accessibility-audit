export interface SeverityTally {
  critical: number
  moderate: number
  minor: number
  pass: number
  total: number
}

interface CategoryLite {
  severity?: 'Critical' | 'Moderate' | 'Minor' | 'Pass' | string | null
}

export function tallySeverity(categories: CategoryLite[] | undefined | null): SeverityTally {
  const tally: SeverityTally = { critical: 0, moderate: 0, minor: 0, pass: 0, total: 0 }
  if (!categories) return tally
  for (const cat of categories) {
    switch (cat?.severity) {
      case 'Critical': tally.critical++; tally.total++; break
      case 'Moderate': tally.moderate++; tally.total++; break
      case 'Minor':    tally.minor++;    tally.total++; break
      case 'Pass':     tally.pass++;     tally.total++; break
      default: break
    }
  }
  return tally
}

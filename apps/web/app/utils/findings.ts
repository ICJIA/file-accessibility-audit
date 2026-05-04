export function isGuidanceFinding(finding: string): boolean {
  if (!finding) return false
  const f = finding.toLowerCase()
  return (
    f.startsWith('how to fix:') ||
    f.startsWith('tip:') ||
    f.startsWith('fix:') ||
    f.startsWith('note:') ||
    f.startsWith('review these')
  )
}

export function firstActionableFinding(findings: string[] | undefined | null): string {
  if (!findings || findings.length === 0) return ''
  const found = findings.find(
    (f) => f && !f.startsWith('---') && !f.startsWith('  ') && !isGuidanceFinding(f),
  )
  return found || findings[0] || ''
}

export interface TechnicalGroup {
  heading: string
  items: string[]
}

export interface CardFindings {
  main: string[]
  signals: TechnicalGroup[]
  signalCount: number
  acrobat: string[]
}

export function partitionCardFindings(
  findings: string[] | undefined | null,
): CardFindings {
  if (!findings || findings.length === 0) {
    return { main: [], signals: [], signalCount: 0, acrobat: [] }
  }

  const acrobatIdx = findings.findIndex(
    (f) => f && f.startsWith('---') && f.toLowerCase().includes('adobe acrobat'),
  )
  const pre = acrobatIdx === -1 ? findings : findings.slice(0, acrobatIdx)
  const acrobat = acrobatIdx === -1 ? [] : findings.slice(acrobatIdx + 1)

  const main: string[] = []
  const signals: TechnicalGroup[] = []
  let current: TechnicalGroup | null = null
  let signalCount = 0

  for (const f of pre) {
    if (!f) continue
    if (f.startsWith('---')) {
      const heading = f
        .replace(/^-{3}\s*/, '')
        .replace(/\s*-{3}$/, '')
        .trim()
      current = { heading, items: [] }
      signals.push(current)
    } else if (f.startsWith('  ')) {
      const item = f.replace(/^\s+/, '')
      if (!current) {
        current = { heading: '', items: [] }
        signals.push(current)
      }
      current.items.push(item)
      signalCount++
    } else {
      main.push(f)
    }
  }

  return { main, signals, signalCount, acrobat }
}

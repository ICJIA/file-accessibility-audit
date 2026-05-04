export function isGuidanceFinding(finding: string): boolean {
  if (!finding) return false
  const f = finding.toLowerCase().trimStart()
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

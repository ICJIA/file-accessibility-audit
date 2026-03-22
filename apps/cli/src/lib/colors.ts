import { execFileSync } from 'node:child_process'
import { GRADE_THRESHOLDS } from '#config'

export const RESET = '\x1b[0m'
export const BOLD = '\x1b[1m'
export const DIM = '\x1b[2m'
export const GREEN = '\x1b[32m'
export const CYAN = '\x1b[36m'
export const YELLOW = '\x1b[33m'
export const RED = '\x1b[31m'
export const GRAY = '\x1b[90m'
export const ORANGE = '\x1b[38;5;208m'

export function gradeColor(grade: string | null): string {
  if (!grade) return GRAY
  switch (grade) {
    case 'A': return GREEN
    case 'B': return CYAN
    case 'C': return YELLOW
    case 'D': return ORANGE
    case 'F': return RED
    default: return GRAY
  }
}

export function severityColor(severity: string | null): string {
  if (!severity) return GRAY
  switch (severity) {
    case 'Pass': return GREEN
    case 'Minor': return CYAN
    case 'Moderate': return YELLOW
    case 'Critical': return RED
    default: return GRAY
  }
}

export function gradeLabel(grade: string): string {
  const entry = GRADE_THRESHOLDS.find(t => t.grade === grade)
  return entry ? entry.label : ''
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

export function checkQpdf(): boolean {
  const paths = [
    'qpdf',
    '/opt/homebrew/bin/qpdf',
    '/usr/local/bin/qpdf',
  ]
  if (process.env.QPDF_PATH) paths.unshift(process.env.QPDF_PATH)

  for (const p of paths) {
    try {
      execFileSync(p, ['--version'], { stdio: 'ignore' })
      return true
    } catch {}
  }
  return false
}

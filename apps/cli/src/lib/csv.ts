import type { CachedRow } from './cache.js'

export const CATEGORY_IDS = [
  'text_extractability',
  'title_language',
  'heading_structure',
  'alt_text',
  'bookmarks',
  'table_markup',
  'link_quality',
  'form_accessibility',
  'reading_order',
  'supplementary',
] as const

export const CATEGORY_LABELS: Record<string, string> = {
  text_extractability: 'Text Extractability',
  title_language: 'Title & Language',
  heading_structure: 'Heading Structure',
  alt_text: 'Alt Text',
  bookmarks: 'Bookmarks',
  table_markup: 'Table Markup',
  link_quality: 'Link Quality',
  form_accessibility: 'Form Accessibility',
  reading_order: 'Reading Order',
  supplementary: 'Supplementary',
}

const AUDIT_TOOL_BASE = 'https://audit.icjia.app'

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function auditToolLink(fileUrl: string): string {
  return `${AUDIT_TOOL_BASE}?url=${encodeURIComponent(fileUrl)}`
}

/** Sort rows by publication_date descending (newest first), nulls last */
export function sortRowsDescending(rows: CachedRow[]): CachedRow[] {
  return [...rows].sort((a, b) => {
    const da = a.publication_date ?? ''
    const db = b.publication_date ?? ''
    if (da > db) return -1
    if (da < db) return 1
    return 0
  })
}

export function gradeDistribution(rows: CachedRow[]): Record<string, number> {
  const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of rows) {
    if (r.grade && dist[r.grade] !== undefined) dist[r.grade]++
  }
  return dist
}

export interface AssessmentSummary {
  level: 'good' | 'mixed' | 'concern' | 'critical'
  headline: string
  detail: string
  action: string
}

export function generateAssessment(dist: Record<string, number>, total: number): AssessmentSummary {
  if (total === 0) return { level: 'good', headline: '', detail: '', action: '' }

  const passing = dist.A + dist.B
  const passingPct = Math.round((passing / total) * 100)
  const failingCount = dist.D + dist.F
  const failingPct = Math.round((failingCount / total) * 100)
  const needsWork = dist.C + dist.D + dist.F
  const needsPct = Math.round((needsWork / total) * 100)

  if (passingPct >= 80) {
    return {
      level: 'good',
      headline: `Strong accessibility compliance — ${passingPct}% of publications meet standards.`,
      detail: `${passing} of ${total} publications earned a grade of A or B. ${needsWork > 0 ? `${needsWork} file${needsWork === 1 ? '' : 's'} could still benefit from improvement.` : 'All files meet accessibility standards.'}`,
      action: needsWork > 0
        ? 'Consider reviewing the remaining C/D/F files to maintain this strong position.'
        : 'Continue monitoring new publications as they are added.',
    }
  }

  if (passingPct >= 50) {
    return {
      level: 'mixed',
      headline: `Mixed results — ${passingPct}% of publications meet standards, but ${needsPct}% need attention.`,
      detail: `${passing} of ${total} publications earned a grade of A or B. However, ${needsWork} files scored C or below and should be reviewed. ${failingCount > 0 ? `${failingCount} file${failingCount === 1 ? '' : 's'} received a D or F and should be prioritized.` : ''}`,
      action: 'Focus remediation efforts on D and F files first, then address C-grade files to bring the majority into compliance.',
    }
  }

  if (failingPct >= 60) {
    return {
      level: 'critical',
      headline: `Significant accessibility gaps — ${failingPct}% of publications scored D or F.`,
      detail: `Only ${passing} of ${total} publications meet accessibility standards (grade A or B). ${failingCount} files received a D or F, indicating major accessibility barriers for users with disabilities.`,
      action: 'A systematic remediation effort is recommended. Start with the most recent and most-accessed publications, focusing on D and F grades. Click "View Full Analysis" on any file for specific remediation steps.',
    }
  }

  return {
    level: 'concern',
    headline: `Accessibility improvement needed — ${needsPct}% of publications scored below B.`,
    detail: `${passing} of ${total} publications meet accessibility standards. ${needsWork} files need improvement, including ${failingCount} with a D or F grade.`,
    action: 'Prioritize D and F files for remediation. Consider establishing accessibility review as part of the publication workflow to prevent future issues.',
  }
}

const RESEARCHHUB_CUTOFF = '2019-01-01'

export function splitByEra(rows: CachedRow[]): { recent: CachedRow[]; legacy: CachedRow[] } {
  const recent: CachedRow[] = []
  const legacy: CachedRow[] = []
  for (const r of rows) {
    if (r.publication_date && r.publication_date >= RESEARCHHUB_CUTOFF) {
      recent.push(r)
    } else {
      legacy.push(r)
    }
  }
  return { recent, legacy }
}

function distLine(label: string, dist: Record<string, number>, total: number): string {
  const needsWork = dist.C + dist.D + dist.F
  const pct = total > 0 ? Math.round((needsWork / total) * 100) : 0
  return `${label},${total},${dist.A},${dist.B},${dist.C},${dist.D},${dist.F},${needsWork} (${pct}%)`
}

export function generateCsv(rows: CachedRow[]): string {
  const sorted = sortRowsDescending(rows)
  const dist = gradeDistribution(sorted)
  const needsWork = dist.C + dist.D + dist.F
  const assessment = generateAssessment(dist, sorted.length)

  const { recent, legacy } = splitByEra(sorted)
  const recentDist = gradeDistribution(recent)
  const legacyDist = gradeDistribution(legacy)
  const recentAssessment = generateAssessment(recentDist, recent.length)

  // Summary section at top
  const lines: string[] = [
    `ICJIA Publication Accessibility Audit`,
    ``,
    `Grade Distribution,,A,B,C,D,F,Need Remediation`,
    distLine('All Publications', dist, sorted.length),
    distLine('Recent (2019–present)', recentDist, recent.length),
    distLine('Legacy (before 2019)', legacyDist, legacy.length),
    ``,
    `Overall Assessment,${escapeCsvField(assessment.headline)}`,
    `Details,${escapeCsvField(assessment.detail)}`,
    `Recommended Action,${escapeCsvField(assessment.action)}`,
    ``,
    `Recent Files Assessment (2019+),${escapeCsvField(recentAssessment.headline)}`,
    `Details,${escapeCsvField(recentAssessment.detail)}`,
    `Recommended Action,${escapeCsvField(recentAssessment.action)}`,
    ``,
  ]

  const headers: string[] = [
    'Title', 'Published', 'Grade', 'Score',
    'File URL', 'Full Analysis',
  ]

  // Category scores only (no grades, no severity)
  for (const catId of CATEGORY_IDS) {
    headers.push(`${CATEGORY_LABELS[catId]}`)
  }

  headers.push('Critical Issues')

  lines.push(headers.map(escapeCsvField).join(','))

  for (const row of sorted) {
    const fields: (string | number | null)[] = [
      row.title,
      row.publication_date,
      row.grade,
      row.overall_score,
      row.file_url,
      row.file_url ? auditToolLink(row.file_url) : null,
    ]

    for (const catId of CATEGORY_IDS) {
      fields.push((row as any)[`${catId}_score`] ?? null)
    }

    fields.push(row.critical_findings)

    lines.push(fields.map(escapeCsvField).join(','))
  }

  return lines.join('\n') + '\n'
}

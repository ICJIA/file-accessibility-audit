import {
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  ANALYSIS,
} from '#config'
import type { QpdfResult } from './qpdfService.js'
import type { PdfjsResult } from './pdfjsService.js'

export interface CategoryResult {
  id: string
  label: string
  weight: number
  score: number | null // null = N/A
  grade: string | null
  severity: string | null
  findings: string[]
}

export interface ScoringResult {
  overallScore: number
  grade: string
  isScanned: boolean
  executiveSummary: string
  categories: CategoryResult[]
  warnings: string[]
}

function getGrade(score: number): string {
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade
  }
  return 'F'
}

function getSeverity(score: number | null): string | null {
  if (score === null) return null
  for (const t of SEVERITY_THRESHOLDS) {
    if (score >= t.min) return t.severity
  }
  return 'Critical'
}

export function scoreDocument(qpdf: QpdfResult, pdfjs: PdfjsResult): ScoringResult {
  const categories: CategoryResult[] = []
  const warnings: string[] = []

  if (qpdf.error) {
    warnings.push('Some accessibility checks could not be completed. The results below reflect only the checks that succeeded.')
  }

  // 1. Text Extractability (20%)
  const textScore = scoreTextExtractability(qpdf, pdfjs)
  categories.push(textScore)

  const isScanned = !pdfjs.hasText && !qpdf.hasStructTree

  // 2. Document Title & Language (15%)
  categories.push(scoreTitleLanguage(qpdf, pdfjs))

  // 3. Heading Structure (15%)
  categories.push(scoreHeadingStructure(qpdf))

  // 4. Alt Text on Images (15%)
  categories.push(scoreAltText(qpdf))

  // 5. Bookmarks / Navigation (10%)
  categories.push(scoreBookmarks(qpdf, pdfjs))

  // 6. Table Markup (10%)
  categories.push(scoreTableMarkup(qpdf))

  // 7. Link & URL Quality (5%)
  categories.push(scoreLinkQuality(pdfjs))

  // 8. Form Accessibility (5%)
  categories.push(scoreFormAccessibility(qpdf))

  // 9. Reading Order (5%)
  categories.push(scoreReadingOrder(qpdf))

  // Calculate weighted average (N/A categories excluded, weights renormalized)
  const applicable = categories.filter(c => c.score !== null)
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0)
  const overallScore = totalWeight > 0
    ? Math.round(applicable.reduce((sum, c) => sum + (c.score! * (c.weight / totalWeight)), 0))
    : 0

  const grade = getGrade(overallScore)
  const executiveSummary = generateSummary(overallScore, grade, isScanned, categories)

  return {
    overallScore,
    grade,
    isScanned,
    executiveSummary,
    categories,
    warnings,
  }
}

function scoreTextExtractability(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  let score: number
  const findings: string[] = []

  if (pdfjs.hasText && qpdf.hasStructTree) {
    score = 100
    findings.push('PDF contains extractable text')
    findings.push('Document is tagged (StructTreeRoot present)')
  } else if (pdfjs.hasText && !qpdf.hasStructTree) {
    score = 50
    findings.push('PDF contains extractable text')
    findings.push('Document is NOT tagged — no StructTreeRoot found. Add tags in Adobe Acrobat (Accessibility → Add Tags to Document).')
  } else if (!pdfjs.hasText && qpdf.hasStructTree) {
    score = 25
    findings.push('No extractable text found, but document has tag structure')
    findings.push('This may be a partially tagged scanned document. Run OCR to add a text layer.')
  } else {
    score = 0
    findings.push('No extractable text found')
    findings.push('No tag structure found')
    findings.push('This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required.')
  }

  return {
    id: 'text_extractability',
    label: 'Text Extractability',
    weight: SCORING_WEIGHTS.text_extractability,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
  }
}

function scoreTitleLanguage(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  let score = 0
  const findings: string[] = []

  // Title check (50 points)
  if (pdfjs.title && pdfjs.title.trim().length > 0) {
    score += 50
    findings.push(`Document title: "${pdfjs.title}"`)
  } else {
    findings.push('No document title found in metadata. Set in Adobe Acrobat: File → Properties → Description → Title.')
  }

  // Language check (50 points)
  const hasLang = qpdf.hasLang || !!pdfjs.lang
  if (hasLang) {
    score += 50
    findings.push(`Language declared: ${qpdf.lang || pdfjs.lang}`)
  } else {
    findings.push('No language declaration (/Lang) present. Set in Adobe Acrobat: File → Properties → Advanced → Language.')
  }

  return {
    id: 'title_language',
    label: 'Document Title & Language',
    weight: SCORING_WEIGHTS.title_language,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
  }
}

function scoreHeadingStructure(qpdf: QpdfResult): CategoryResult {
  const findings: string[] = []

  if (qpdf.headings.length === 0) {
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 0,
      grade: 'F',
      severity: 'Critical',
      findings: ['No heading tags found in the document structure. Add headings using the Tags panel in Adobe Acrobat.'],
    }
  }

  const hasNumberedHeadings = qpdf.headings.some(h => /^H[1-6]$/.test(h.level))

  if (!hasNumberedHeadings) {
    findings.push('Only generic /H tags found (not H1–H6). Use specific heading levels for proper hierarchy.')
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 40,
      grade: getGrade(40),
      severity: getSeverity(40),
      findings,
    }
  }

  // Check hierarchy
  const levels = qpdf.headings
    .filter(h => /^H[1-6]$/.test(h.level))
    .map(h => parseInt(h.level.replace('H', '')))

  let hierarchyBroken = false
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      hierarchyBroken = true
      findings.push(`Heading hierarchy skip: H${levels[i - 1]} → H${levels[i]} (skipped H${levels[i - 1] + 1})`)
    }
  }

  if (hierarchyBroken) {
    findings.unshift(`Found ${levels.length} heading tags, but hierarchy has gaps`)
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 60,
      grade: getGrade(60),
      severity: getSeverity(60),
      findings,
    }
  }

  findings.push(`Found ${levels.length} heading tags with logical hierarchy`)
  return {
    id: 'heading_structure',
    label: 'Heading Structure',
    weight: SCORING_WEIGHTS.heading_structure,
    score: 100,
    grade: 'A',
    severity: 'Pass',
    findings,
  }
}

function scoreAltText(qpdf: QpdfResult): CategoryResult {
  const figures = qpdf.images.filter(img => img.ref) // All detected figures/images

  if (figures.length === 0) {
    return {
      id: 'alt_text',
      label: 'Alt Text on Images',
      weight: SCORING_WEIGHTS.alt_text,
      score: null, // N/A
      grade: null,
      severity: null,
      findings: ['No images found in this document'],
    }
  }

  const withAlt = figures.filter(f => f.hasAlt).length
  const score = Math.round((withAlt / figures.length) * 100)
  const findings: string[] = []

  if (withAlt === figures.length) {
    findings.push(`All ${figures.length} image(s) have alternative text`)
  } else {
    findings.push(`${withAlt} of ${figures.length} image(s) have alternative text`)
    findings.push('Add alt text in Adobe Acrobat: right-click image in Tags panel → Properties → Alternate Text')
  }

  return {
    id: 'alt_text',
    label: 'Alt Text on Images',
    weight: SCORING_WEIGHTS.alt_text,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
  }
}

function scoreBookmarks(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  if (pdfjs.pageCount < ANALYSIS.BOOKMARKS_PAGE_THRESHOLD) {
    return {
      id: 'bookmarks',
      label: 'Bookmarks / Navigation',
      weight: SCORING_WEIGHTS.bookmarks,
      score: null, // N/A for short docs
      grade: null,
      severity: null,
      findings: [`Document has ${pdfjs.pageCount} page(s) — bookmarks not required for documents under ${ANALYSIS.BOOKMARKS_PAGE_THRESHOLD} pages`],
    }
  }

  const hasOutlines = qpdf.hasOutlines || pdfjs.hasOutlines
  const outlineCount = Math.max(qpdf.outlineCount, pdfjs.outlineCount)

  if (hasOutlines && outlineCount > 0) {
    return {
      id: 'bookmarks',
      label: 'Bookmarks / Navigation',
      weight: SCORING_WEIGHTS.bookmarks,
      score: 100,
      grade: 'A',
      severity: 'Pass',
      findings: [`${outlineCount} bookmark(s) found`],
    }
  }

  if (hasOutlines && outlineCount === 0) {
    return {
      id: 'bookmarks',
      label: 'Bookmarks / Navigation',
      weight: SCORING_WEIGHTS.bookmarks,
      score: 25,
      grade: getGrade(25),
      severity: getSeverity(25),
      findings: ['Outline structure present but contains no entries. Add bookmarks in Adobe Acrobat.'],
    }
  }

  return {
    id: 'bookmarks',
    label: 'Bookmarks / Navigation',
    weight: SCORING_WEIGHTS.bookmarks,
    score: 0,
    grade: 'F',
    severity: 'Critical',
    findings: [`Document has ${pdfjs.pageCount} pages but no bookmarks. Add bookmarks in Adobe Acrobat for navigation.`],
  }
}

function scoreTableMarkup(qpdf: QpdfResult): CategoryResult {
  if (qpdf.tables.length === 0) {
    return {
      id: 'table_markup',
      label: 'Table Markup',
      weight: SCORING_WEIGHTS.table_markup,
      score: null, // N/A
      grade: null,
      severity: null,
      findings: ['No tables detected in this document'],
    }
  }

  const withHeaders = qpdf.tables.filter(t => t.hasHeaders).length
  const findings: string[] = []

  if (withHeaders === qpdf.tables.length) {
    findings.push(`All ${qpdf.tables.length} table(s) have proper header tags (TH)`)
    return {
      id: 'table_markup',
      label: 'Table Markup',
      weight: SCORING_WEIGHTS.table_markup,
      score: 100,
      grade: 'A',
      severity: 'Pass',
      findings,
    }
  }

  if (withHeaders > 0) {
    findings.push(`${withHeaders} of ${qpdf.tables.length} table(s) have header tags`)
    findings.push('Add TH tags to table headers in Adobe Acrobat\'s Tags panel')
    return {
      id: 'table_markup',
      label: 'Table Markup',
      weight: SCORING_WEIGHTS.table_markup,
      score: 40,
      grade: getGrade(40),
      severity: getSeverity(40),
      findings,
    }
  }

  findings.push(`${qpdf.tables.length} table(s) found but none have header tags (TH)`)
  findings.push('Add TH tags to table headers in Adobe Acrobat\'s Tags panel')
  return {
    id: 'table_markup',
    label: 'Table Markup',
    weight: SCORING_WEIGHTS.table_markup,
    score: 40,
    grade: getGrade(40),
    severity: getSeverity(40),
    findings,
  }
}

function scoreLinkQuality(pdfjs: PdfjsResult): CategoryResult {
  if (pdfjs.links.length === 0) {
    return {
      id: 'link_quality',
      label: 'Link & URL Quality',
      weight: SCORING_WEIGHTS.link_quality,
      score: null,
      grade: null,
      severity: null,
      findings: ['No links found in this document'],
    }
  }

  const rawUrlPattern = /^(https?:\/\/|www\.)/i
  const descriptive = pdfjs.links.filter(l => !rawUrlPattern.test(l.text.trim()))
  const score = Math.round((descriptive.length / pdfjs.links.length) * 100)
  const findings: string[] = []

  if (descriptive.length === pdfjs.links.length) {
    findings.push(`All ${pdfjs.links.length} link(s) use descriptive text`)
  } else {
    const rawCount = pdfjs.links.length - descriptive.length
    findings.push(`${rawCount} of ${pdfjs.links.length} link(s) display raw URLs instead of descriptive text`)
    findings.push('Replace raw URLs with descriptive link text (e.g., "View the full report" instead of "https://...")')
  }

  return {
    id: 'link_quality',
    label: 'Link & URL Quality',
    weight: SCORING_WEIGHTS.link_quality,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
  }
}

function scoreFormAccessibility(qpdf: QpdfResult): CategoryResult {
  if (!qpdf.hasAcroForm || qpdf.formFields.length === 0) {
    return {
      id: 'form_accessibility',
      label: 'Form Accessibility',
      weight: SCORING_WEIGHTS.form_accessibility,
      score: null,
      grade: null,
      severity: null,
      findings: ['No form fields found in this document'],
    }
  }

  const withLabels = qpdf.formFields.filter(f => f.hasTU).length
  const score = Math.round((withLabels / qpdf.formFields.length) * 100)
  const findings: string[] = []

  if (withLabels === qpdf.formFields.length) {
    findings.push(`All ${qpdf.formFields.length} form field(s) have accessible labels (TU)`)
  } else {
    findings.push(`${withLabels} of ${qpdf.formFields.length} form field(s) have accessible labels`)
    findings.push('Add tooltip text to form fields in Adobe Acrobat: right-click field → Properties → General → Tooltip')
  }

  return {
    id: 'form_accessibility',
    label: 'Form Accessibility',
    weight: SCORING_WEIGHTS.form_accessibility,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
  }
}

function scoreReadingOrder(qpdf: QpdfResult): CategoryResult {
  if (!qpdf.hasStructTree) {
    return {
      id: 'reading_order',
      label: 'Reading Order',
      weight: SCORING_WEIGHTS.reading_order,
      score: 0,
      grade: 'F',
      severity: 'Critical',
      findings: ['No structure tree present — reading order cannot be determined'],
    }
  }

  const findings: string[] = []

  // Check tree depth (flat = bad)
  if (qpdf.structTreeDepth <= 1) {
    findings.push('Structure tree is flat (no meaningful nesting). Content may not have a logical reading order.')
    return {
      id: 'reading_order',
      label: 'Reading Order',
      weight: SCORING_WEIGHTS.reading_order,
      score: 30,
      grade: getGrade(30),
      severity: getSeverity(30),
      findings,
    }
  }

  // Check MCID ordering
  if (qpdf.contentOrder.length > 1) {
    let outOfOrder = 0
    for (let i = 1; i < qpdf.contentOrder.length; i++) {
      if (qpdf.contentOrder[i] < qpdf.contentOrder[i - 1]) {
        outOfOrder++
      }
    }
    const disorderRatio = outOfOrder / (qpdf.contentOrder.length - 1)

    if (disorderRatio > ANALYSIS.READING_ORDER_DISORDER_THRESHOLD) {
      findings.push(`Content order has significant deviations (${Math.round(disorderRatio * 100)}% of items out of sequence)`)
      return {
        id: 'reading_order',
        label: 'Reading Order',
        weight: SCORING_WEIGHTS.reading_order,
        score: 50,
        grade: getGrade(50),
        severity: getSeverity(50),
        findings,
      }
    }
  }

  findings.push('Structure tree defines a logical reading order')
  return {
    id: 'reading_order',
    label: 'Reading Order',
    weight: SCORING_WEIGHTS.reading_order,
    score: 100,
    grade: 'A',
    severity: 'Pass',
    findings,
  }
}

function generateSummary(score: number, grade: string, isScanned: boolean, categories: CategoryResult[]): string {
  if (isScanned) {
    return 'This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required before this document can be made accessible.'
  }

  const critical = categories.filter(c => c.severity === 'Critical')
  const passing = categories.filter(c => c.severity === 'Pass')
  const applicable = categories.filter(c => c.score !== null)

  if (grade === 'A') {
    return `This PDF meets accessibility standards across all ${applicable.length} assessed categories. It is ready for publication.`
  }

  if (grade === 'B') {
    return `This PDF is in good shape with minor issues. ${passing.length} of ${applicable.length} categories pass. Review the findings below for remaining improvements.`
  }

  if (critical.length > 0) {
    const criticalNames = critical.map(c => c.label).join(', ')
    return `This PDF has ${critical.length} critical accessibility issue${critical.length > 1 ? 's' : ''}: ${criticalNames}. These must be addressed before publishing.`
  }

  return `This PDF has accessibility issues in ${applicable.length - passing.length} of ${applicable.length} categories. Review the findings below and remediate in Adobe Acrobat.`
}

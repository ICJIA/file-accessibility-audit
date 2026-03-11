import {
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  ANALYSIS,
} from '#config'
import type { QpdfResult } from './qpdfService.js'
import type { PdfjsResult } from './pdfjsService.js'

export interface HelpLink {
  label: string
  url: string
}

export interface CategoryResult {
  id: string
  label: string
  weight: number
  score: number | null // null = N/A
  grade: string | null
  severity: string | null
  findings: string[]
  explanation: string
  helpLinks: HelpLink[]
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
  categories.push(scoreAltText(qpdf, pdfjs))

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

  // 10. Supplementary Analysis (informational — no scoring impact)
  appendSupplementaryFindings(qpdf, pdfjs, categories)

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
    if (pdfjs.textLength) findings.push(`Extracted ${pdfjs.textLength.toLocaleString()} characters of text content`)
  } else if (pdfjs.hasText && !qpdf.hasStructTree) {
    score = 50
    findings.push('PDF contains extractable text')
    findings.push('Document is NOT tagged — no StructTreeRoot found')
    findings.push('How to fix: In Adobe Acrobat, go to Accessibility → Add Tags to Document. Tags create a hidden structure that tells screen readers the reading order, headings, and other elements.')
  } else if (!pdfjs.hasText && qpdf.hasStructTree) {
    score = 25
    findings.push('No extractable text found, but document has tag structure')
    findings.push('This may be a partially tagged scanned document. The images need OCR (Optical Character Recognition) to convert them to real text.')
    findings.push('How to fix: In Adobe Acrobat, go to Scan & OCR → Recognize Text → In This File.')
  } else {
    score = 0
    findings.push('No extractable text found')
    findings.push('No tag structure found')
    findings.push('This PDF appears to be a scanned image — it is essentially a photograph of text. Screen readers cannot read it at all.')
    findings.push('How to fix: (1) Run OCR in Adobe Acrobat: Scan & OCR → Recognize Text. (2) Then add tags: Accessibility → Add Tags to Document.')
  }

  return {
    id: 'text_extractability',
    label: 'Text Extractability',
    weight: SCORING_WEIGHTS.text_extractability,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: 'Text extractability checks whether the PDF contains real, selectable text (not just images of text) and whether it has a tag structure. Tags are a hidden layer that tells assistive technology — like screen readers — what each piece of content is and in what order to read it. Without extractable text, a screen reader has nothing to work with.',
    helpLinks: [
      { label: 'Adobe: Add Tags to a PDF', url: 'https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html' },
      { label: 'Adobe: OCR a Scanned Document', url: 'https://helpx.adobe.com/acrobat/using/edit-scanned-pdfs.html' },
      { label: 'WebAIM: PDF Accessibility', url: 'https://webaim.org/techniques/acrobat/' },
    ],
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
    findings.push('No document title found in metadata')
    findings.push('How to fix: In Adobe Acrobat, go to File → Properties → Description tab → enter a descriptive Title.')
    findings.push('The title is what screen readers announce when a user first opens the document. Without it, they hear the filename instead (e.g., "report_v3_final.pdf").')
  }

  // Language check (50 points)
  const hasLang = qpdf.hasLang || !!pdfjs.lang
  if (hasLang) {
    score += 50
    findings.push(`Language declared: ${qpdf.lang || pdfjs.lang}`)
  } else {
    findings.push('No language declaration found')
    findings.push('How to fix: In Adobe Acrobat, go to File → Properties → Advanced tab → set the Language dropdown.')
    findings.push('The language tag tells screen readers which pronunciation rules to use. Without it, a French document might be read with English pronunciation.')
  }

  if (pdfjs.author) findings.push(`Author: ${pdfjs.author}`)

  return {
    id: 'title_language',
    label: 'Document Title & Language',
    weight: SCORING_WEIGHTS.title_language,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: 'This category checks two metadata fields: the document title and the language declaration. The title appears in the browser tab and is the first thing a screen reader announces. The language tag tells assistive technology how to pronounce the text correctly.',
    helpLinks: [
      { label: 'Adobe: Set Document Title', url: 'https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html' },
      { label: 'WCAG 3.1.1: Language of Page', url: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html' },
      { label: 'WebAIM: Document Properties', url: 'https://webaim.org/techniques/acrobat/acrobat#document' },
    ],
  }
}

function scoreHeadingStructure(qpdf: QpdfResult): CategoryResult {
  const findings: string[] = []
  const headingExplanation = 'Headings (H1–H6) create a navigable outline of the document. Screen reader users rely on headings to skim and jump between sections — similar to how sighted users scan bold section titles. Headings must follow a logical hierarchy: H1 for the main title, H2 for major sections, H3 for subsections, and so on. Skipping levels (e.g., H1 → H3) confuses assistive technology.'
  const headingLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Add Headings to a PDF', url: 'https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html' },
    { label: 'WCAG 1.3.1: Info and Relationships', url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html' },
    { label: 'WebAIM: Headings in PDFs', url: 'https://webaim.org/techniques/acrobat/acrobat#702' },
  ]

  if (qpdf.headings.length === 0) {
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 0,
      grade: 'F',
      severity: 'Critical',
      findings: [
        'No heading tags found in the document structure',
        'How to fix: In Adobe Acrobat, open the Tags panel (View → Show/Hide → Navigation Panes → Tags). Select text that serves as a heading, right-click the corresponding tag, and change its type to H1, H2, etc.',
      ],
      explanation: headingExplanation,
      helpLinks: headingLinks,
    }
  }

  // Show the heading outline
  const headingSummary = qpdf.headings.map(h => h.level).join(', ')
  findings.push(`Heading outline: ${headingSummary}`)

  const hasNumberedHeadings = qpdf.headings.some(h => /^H[1-6]$/.test(h.level))

  if (!hasNumberedHeadings) {
    findings.push('Only generic /H tags found (not H1–H6). Generic heading tags don\'t convey hierarchy.')
    findings.push('How to fix: In the Tags panel, change each /H tag to a specific level (H1, H2, etc.) that matches the document outline.')
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 40,
      grade: getGrade(40),
      severity: getSeverity(40),
      findings,
      explanation: headingExplanation,
      helpLinks: headingLinks,
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
    findings.push('Heading levels should not skip — e.g., don\'t jump from H1 to H3 without an H2 in between.')
    return {
      id: 'heading_structure',
      label: 'Heading Structure',
      weight: SCORING_WEIGHTS.heading_structure,
      score: 60,
      grade: getGrade(60),
      severity: getSeverity(60),
      findings,
      explanation: headingExplanation,
      helpLinks: headingLinks,
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
    explanation: headingExplanation,
    helpLinks: headingLinks,
  }
}

function scoreAltText(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  const altLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Add Alt Text to Images', url: 'https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html#add_alternate_text_to_links_and_figures' },
    { label: 'WCAG 1.1.1: Non-text Content', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html' },
    { label: 'WebAIM: Alt Text in PDFs', url: 'https://webaim.org/techniques/acrobat/acrobat#702' },
  ]
  const altExplanation = 'Alternative text (alt text) is a short text description attached to each image in the document. Screen readers read this description aloud so that blind and low-vision users can understand visual content. Every informative image needs alt text. Decorative images (borders, spacers) should be marked as artifacts instead.'

  const figures = qpdf.images.filter(img => img.ref)

  // QPDF found no tagged images, but pdfjs detected image rendering operations
  if (figures.length === 0 && pdfjs.imageCount > 0) {
    return {
      id: 'alt_text',
      label: 'Alt Text on Images',
      weight: SCORING_WEIGHTS.alt_text,
      score: 0,
      grade: 'F',
      severity: 'Critical',
      findings: [
        `${pdfjs.imageCount} image(s) detected in the document, but none have accessibility tags`,
        'The images exist in the PDF but are not tagged as <Figure> elements, so screen readers cannot identify them or read any alternative text.',
        'How to fix: In Adobe Acrobat, open the Tags panel → use the Reading Order tool (Accessibility → Reading Order) to identify images → tag each image as a Figure → right-click the <Figure> tag → Properties → add descriptive alt text.',
      ],
      explanation: altExplanation,
      helpLinks: altLinks,
    }
  }

  if (figures.length === 0) {
    return {
      id: 'alt_text',
      label: 'Alt Text on Images',
      weight: SCORING_WEIGHTS.alt_text,
      score: null,
      grade: null,
      severity: null,
      findings: [
        'No images detected in this document — this category does not affect the score',
        'If this document does contain images, they may not be properly tagged as <Figure> elements. Verify manually in Adobe Acrobat\'s Tags panel.',
      ],
      explanation: altExplanation,
      helpLinks: altLinks,
    }
  }

  const withAlt = figures.filter(f => f.hasAlt).length
  const score = withAlt === 0 ? 0 : Math.round((withAlt / figures.length) * 100)
  const findings: string[] = []

  if (withAlt === figures.length) {
    findings.push(`All ${figures.length} image(s) have alternative text`)
    for (const fig of figures) {
      if (fig.altText) findings.push(`Image alt text: "${fig.altText}"`)
    }
  } else {
    findings.push(`${withAlt} of ${figures.length} image(s) have alternative text`)
    const missing = figures.filter(f => !f.hasAlt).length
    findings.push(`${missing} image(s) are missing alt text`)
    findings.push('How to fix: In Adobe Acrobat, open the Tags panel → find the <Figure> tag for each image → right-click → Properties → enter a description in the "Alternate Text" field.')
    findings.push('Tip: Good alt text is concise and describes the purpose of the image, not just its appearance. For example, "Bar chart showing 2024 crime rates by county" rather than "chart".')
  }

  return {
    id: 'alt_text',
    label: 'Alt Text on Images',
    weight: SCORING_WEIGHTS.alt_text,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: altExplanation,
    helpLinks: altLinks,
  }
}

function scoreBookmarks(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  const bookmarkLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Create Bookmarks', url: 'https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html#create_a_bookmark' },
    { label: 'Adobe: Auto-generate Bookmarks from Headings', url: 'https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html' },
    { label: 'WebAIM: PDF Navigation', url: 'https://webaim.org/techniques/acrobat/acrobat#702' },
  ]
  const bookmarkExplanation = 'Bookmarks (also called outlines) create a clickable table of contents in the PDF sidebar. They let all users — including those using screen readers — jump directly to any section. For documents longer than a few pages, bookmarks are essential for navigation. In Adobe Acrobat, bookmarks can be generated automatically from heading tags.'

  if (pdfjs.pageCount < ANALYSIS.BOOKMARKS_PAGE_THRESHOLD) {
    return {
      id: 'bookmarks',
      label: 'Bookmarks / Navigation',
      weight: SCORING_WEIGHTS.bookmarks,
      score: null,
      grade: null,
      severity: null,
      findings: [
        `Document has ${pdfjs.pageCount} page(s) — bookmarks are not required for documents under ${ANALYSIS.BOOKMARKS_PAGE_THRESHOLD} pages`,
        'This category does not affect the score',
      ],
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    }
  }

  const hasOutlines = qpdf.hasOutlines || pdfjs.hasOutlines
  const outlineCount = Math.max(qpdf.outlineCount, pdfjs.outlineCount)

  if (hasOutlines && outlineCount > 0) {
    const findings = [`${outlineCount} bookmark(s) found`]
    if (qpdf.outlineTitles?.length > 0) {
      findings.push('Bookmark outline:')
      for (const title of qpdf.outlineTitles) {
        findings.push(`  ${title}`)
      }
    }
    return {
      id: 'bookmarks',
      label: 'Bookmarks / Navigation',
      weight: SCORING_WEIGHTS.bookmarks,
      score: 100,
      grade: 'A',
      severity: 'Pass',
      findings,
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
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
      findings: [
        'Outline structure present but contains no entries',
        'How to fix: In Adobe Acrobat, go to the Bookmarks panel (View → Show/Hide → Navigation Panes → Bookmarks). You can create bookmarks manually or auto-generate them from headings (Options menu → New Bookmarks from Structure).',
      ],
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    }
  }

  return {
    id: 'bookmarks',
    label: 'Bookmarks / Navigation',
    weight: SCORING_WEIGHTS.bookmarks,
    score: 0,
    grade: 'F',
    severity: 'Critical',
    findings: [
      `Document has ${pdfjs.pageCount} pages but no bookmarks`,
      'How to fix: In Adobe Acrobat, go to the Bookmarks panel. Create bookmarks for each major section, or auto-generate them from heading tags (Options → New Bookmarks from Structure).',
    ],
    explanation: bookmarkExplanation,
    helpLinks: bookmarkLinks,
  }
}

function scoreTableMarkup(qpdf: QpdfResult): CategoryResult {
  const tableLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Make Tables Accessible', url: 'https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html' },
    { label: 'WCAG 1.3.1: Info and Relationships', url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html' },
    { label: 'WebAIM: Table Accessibility in PDFs', url: 'https://webaim.org/techniques/acrobat/acrobat#702' },
    { label: 'PAC 2024: Table Structure', url: 'https://pac.pdf-accessibility.org/' },
  ]
  const tableExplanation = 'Table markup tells screen readers how to navigate data tables. This checks seven aspects of table accessibility, weighted by importance: header cells (TH tags, 40 pts), row structure (TR tags, 20 pts), scope attributes linking headers to columns/rows (10 pts), nested table detection (10 pts), consistent column counts (10 pts), caption elements (5 pts), and header-cell associations (5 pts). Headers and row structure are the foundation; scope and captions are enhancements.'

  if (qpdf.tables.length === 0) {
    return {
      id: 'table_markup',
      label: 'Table Markup',
      weight: SCORING_WEIGHTS.table_markup,
      score: null,
      grade: null,
      severity: null,
      findings: [
        'No tables detected in this document — this category does not affect the score',
      ],
      explanation: tableExplanation,
      helpLinks: tableLinks,
    }
  }

  const n = qpdf.tables.length
  const findings: string[] = []
  let score = 0

  // 1. Header presence (40 points) — most critical for screen reader navigation
  const withHeaders = qpdf.tables.filter(t => t.hasHeaders).length
  if (withHeaders === n) {
    score += 40
    const totalTH = qpdf.tables.reduce((sum, t) => sum + t.headerCount, 0)
    findings.push(`All ${n} table(s) have header cells (TH) — ${totalTH} header cell(s) total`)
  } else if (withHeaders > 0) {
    score += 20
    findings.push(`${withHeaders} of ${n} table(s) have header cells — ${n - withHeaders} table(s) are missing TH tags`)
    findings.push('Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find header rows → change <TD> to <TH>')
  } else {
    findings.push(`${n} table(s) found but none have header cells (TH) — screen readers cannot identify column or row headers`)
    findings.push('Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find the header row → change the cell tags from <TD> to <TH>')
  }

  // 2. Row structure (20 points) — second most important structural requirement
  const withRows = qpdf.tables.filter(t => t.hasRowStructure).length
  if (withRows === n) {
    score += 20
    const totalRows = qpdf.tables.reduce((sum, t) => sum + t.rowCount, 0)
    findings.push(`All ${n} table(s) have proper row structure (TR tags) — ${totalRows} row(s) total`)
  } else if (withRows > 0) {
    score += 10
    findings.push(`${n - withRows} of ${n} table(s) are missing row structure (TR tags) — cells are directly under <Table> instead of grouped in <TR> rows`)
  } else {
    findings.push('No tables have row structure (TR tags) — cells are not grouped into rows, which breaks screen reader table navigation')
    findings.push('Fix: In Adobe Acrobat, restructure each table so cells are wrapped in <TR> (Table Row) tags')
  }

  // 3. Scope attributes (10 points) — enhancement for complex tables
  const withScope = qpdf.tables.filter(t => t.hasHeaders && t.hasScope).length
  const tablesWithHeaders = qpdf.tables.filter(t => t.hasHeaders)
  if (tablesWithHeaders.length === 0) {
    findings.push('Scope attributes: N/A (no header cells to check)')
  } else if (withScope === tablesWithHeaders.length) {
    score += 10
    findings.push('All header cells have Scope attributes (/Column or /Row) — screen readers can associate headers with data cells')
  } else {
    const totalMissing = qpdf.tables.reduce((sum, t) => sum + t.scopeMissingCount, 0)
    if (withScope > 0) score += 5
    findings.push(`${totalMissing} header cell(s) are missing Scope attributes — screen readers may not correctly associate headers with data`)
    findings.push('Fix: In Adobe Acrobat, select each <TH> tag → Properties → Scope → set to "Column" or "Row"')
  }

  // 4. No nested tables (10 points)
  const withNesting = qpdf.tables.filter(t => t.hasNestedTable).length
  if (withNesting === 0) {
    score += 10
    findings.push('No nested tables detected')
  } else {
    findings.push(`${withNesting} table(s) contain nested sub-tables — nested tables are extremely difficult for screen readers to navigate and should be flattened`)
    findings.push('Fix: Restructure nested tables into a single flat table, or split into separate independent tables')
  }

  // 5. Caption (5 points) — nice to have, not a WCAG requirement
  const withCaption = qpdf.tables.filter(t => t.hasCaption).length
  if (withCaption === n) {
    score += 5
    findings.push(`All ${n} table(s) have caption elements describing their purpose`)
  } else if (withCaption > 0) {
    score += 2
    findings.push(`${withCaption} of ${n} table(s) have caption elements — ${n - withCaption} table(s) are missing captions`)
    findings.push('Fix: In Adobe Acrobat, add a <Caption> tag as the first child of each <Table> tag with a brief description of the table\'s content')
  } else {
    findings.push('No tables have caption elements — adding a caption helps screen readers announce what each table contains')
    findings.push('Fix: Add a <Caption> tag as the first child of each <Table> in the Tags panel')
  }

  // 6. Consistent columns (10 points)
  const withConsistent = qpdf.tables.filter(t => t.hasConsistentColumns === true).length
  const checkable = qpdf.tables.filter(t => t.hasConsistentColumns !== null).length
  if (checkable === 0) {
    findings.push('Column consistency: could not be checked (no row structure)')
  } else if (withConsistent === checkable) {
    score += 10
    findings.push('All tables have consistent column counts across rows')
  } else {
    const inconsistent = qpdf.tables.filter(t => t.hasConsistentColumns === false)
    for (const t of inconsistent) {
      const unique = [...new Set(t.columnCounts)]
      findings.push(`Table has inconsistent column counts: rows have ${unique.join(', ')} cells — this can confuse screen reader table navigation`)
    }
    findings.push('Fix: Ensure all rows in each table have the same number of cells. Use empty cells or colspan/rowspan attributes where needed.')
  }

  // 7. Header association bonus (5 points)
  const withAssoc = qpdf.tables.filter(t => t.hasHeaderAssociation).length
  if (withAssoc > 0) {
    score += 5
    findings.push(`${withAssoc} table(s) use explicit header-cell associations (/Headers attribute) for complex table navigation`)
  }

  return {
    id: 'table_markup',
    label: 'Table Markup',
    weight: SCORING_WEIGHTS.table_markup,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: tableExplanation,
    helpLinks: tableLinks,
  }
}

function scoreLinkQuality(pdfjs: PdfjsResult): CategoryResult {
  const linkLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Create and Edit Links', url: 'https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html' },
    { label: 'WCAG 2.4.4: Link Purpose', url: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html' },
    { label: 'WebAIM: Links and Hypertext', url: 'https://webaim.org/techniques/hypertext/' },
  ]
  const linkExplanation = 'Screen reader users often navigate by tabbing through links or pulling up a list of all links on the page. If a link says "https://www.example.com/reports/2024/q3/data.pdf", that\'s not useful. A descriptive label like "Q3 2024 Data Report" tells the user where the link goes without needing to see the URL.'

  if (pdfjs.links.length === 0) {
    return {
      id: 'link_quality',
      label: 'Link & URL Quality',
      weight: SCORING_WEIGHTS.link_quality,
      score: null,
      grade: null,
      severity: null,
      findings: ['No links found in this document — this category does not affect the score'],
      explanation: linkExplanation,
      helpLinks: linkLinks,
    }
  }

  const rawUrlPattern = /^(https?:\/\/|www\.)/i
  const descriptive = pdfjs.links.filter(l => !rawUrlPattern.test(l.text.trim()))
  const score = Math.round((descriptive.length / pdfjs.links.length) * 100)
  const findings: string[] = []

  if (descriptive.length === pdfjs.links.length) {
    findings.push(`All ${pdfjs.links.length} link(s) use descriptive text`)
    for (const link of pdfjs.links) {
      findings.push(`Link: "${link.text.trim()}"`)
    }
  } else {
    const rawCount = pdfjs.links.length - descriptive.length
    findings.push(`${rawCount} of ${pdfjs.links.length} link(s) display raw URLs instead of descriptive text`)
    const rawLinks = pdfjs.links.filter(l => rawUrlPattern.test(l.text.trim()))
    for (const link of rawLinks) {
      findings.push(`Raw URL link: "${link.text.trim()}"`)
    }
    findings.push('How to fix: In the original document (Word, InDesign, etc.), change the visible link text to something descriptive before re-exporting to PDF. In Adobe Acrobat, you can edit link properties via the Edit PDF tool.')
  }

  return {
    id: 'link_quality',
    label: 'Link & URL Quality',
    weight: SCORING_WEIGHTS.link_quality,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: linkExplanation,
    helpLinks: linkLinks,
  }
}

function scoreFormAccessibility(qpdf: QpdfResult): CategoryResult {
  const formLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Create Accessible Forms', url: 'https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html' },
    { label: 'WCAG 1.3.1: Labels for Form Fields', url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html' },
    { label: 'WebAIM: Accessible PDF Forms', url: 'https://webaim.org/techniques/acrobat/forms' },
  ]
  const formExplanation = 'Form fields (text boxes, checkboxes, dropdowns) need a "tooltip" label (called TU in the PDF spec) so screen readers can announce what each field is for. Without a tooltip, a screen reader user encounters a text box with no indication of what to type — they hear "text field" instead of "First Name".'

  if (!qpdf.hasAcroForm || qpdf.formFields.length === 0) {
    return {
      id: 'form_accessibility',
      label: 'Form Accessibility',
      weight: SCORING_WEIGHTS.form_accessibility,
      score: null,
      grade: null,
      severity: null,
      findings: ['No form fields found in this document — this category does not affect the score'],
      explanation: formExplanation,
      helpLinks: formLinks,
    }
  }

  const withLabels = qpdf.formFields.filter(f => f.hasTU).length
  const score = Math.round((withLabels / qpdf.formFields.length) * 100)
  const findings: string[] = []

  findings.push(`${qpdf.formFields.length} form field(s) detected`)

  if (withLabels === qpdf.formFields.length) {
    findings.push(`All fields have accessible tooltip labels (TU)`)
  } else {
    findings.push(`${withLabels} of ${qpdf.formFields.length} field(s) have accessible labels`)
    const unlabeled = qpdf.formFields.filter(f => !f.hasTU)
    for (const field of unlabeled) {
      findings.push(`Unlabeled field${field.name ? `: "${field.name}"` : ''}`)
    }
    findings.push('How to fix: In Adobe Acrobat, right-click each form field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label that screen readers announce.')
  }

  return {
    id: 'form_accessibility',
    label: 'Form Accessibility',
    weight: SCORING_WEIGHTS.form_accessibility,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: formExplanation,
    helpLinks: formLinks,
  }
}

function scoreReadingOrder(qpdf: QpdfResult): CategoryResult {
  const readingLinks: CategoryResult['helpLinks'] = [
    { label: 'Adobe: Fix Reading Order', url: 'https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html' },
    { label: 'WCAG 1.3.2: Meaningful Sequence', url: 'https://www.w3.org/WAI/WCAG21/Understanding/meaningful-sequence.html' },
    { label: 'WebAIM: Reading Order', url: 'https://webaim.org/techniques/acrobat/acrobat#702' },
  ]
  const readingExplanation = 'Reading order determines the sequence in which a screen reader announces content. In a visual layout, humans naturally read left-to-right, top-to-bottom. But PDFs store content in drawing order, which may not match the visual order — for example, a sidebar might be read before the main content. The tag structure tree overrides the drawing order, ensuring assistive technology reads content in the correct logical sequence.'

  if (!qpdf.hasStructTree) {
    return {
      id: 'reading_order',
      label: 'Reading Order',
      weight: SCORING_WEIGHTS.reading_order,
      score: 0,
      grade: 'F',
      severity: 'Critical',
      findings: [
        'No structure tree present — reading order cannot be determined',
        'Without a tag structure, screen readers fall back to the raw drawing order, which may not match the visual layout at all.',
        'How to fix: First add tags (Accessibility → Add Tags to Document), then use the Reading Order tool (Accessibility → Reading Order) to verify and correct the sequence.',
      ],
      explanation: readingExplanation,
      helpLinks: readingLinks,
    }
  }

  const findings: string[] = []
  findings.push(`Structure tree depth: ${qpdf.structTreeDepth} level(s)`)
  findings.push(`Content items tracked: ${qpdf.contentOrder.length}`)

  // Check tree depth (flat = bad)
  if (qpdf.structTreeDepth <= 1) {
    findings.push('Structure tree is flat (no meaningful nesting) — the document has tags but they don\'t define a nested hierarchy.')
    findings.push('How to fix: Use the Reading Order tool in Adobe Acrobat (Accessibility → Reading Order) to reorganize the tag structure into proper sections, headings, and content blocks.')
    return {
      id: 'reading_order',
      label: 'Reading Order',
      weight: SCORING_WEIGHTS.reading_order,
      score: 30,
      grade: getGrade(30),
      severity: getSeverity(30),
      findings,
      explanation: readingExplanation,
      helpLinks: readingLinks,
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
      findings.push('This means the tag order doesn\'t match the page content order — a screen reader may announce content in a confusing sequence.')
      findings.push('How to fix: Use the Reading Order tool in Adobe Acrobat (Accessibility → Reading Order) to reorder elements.')
      return {
        id: 'reading_order',
        label: 'Reading Order',
        weight: SCORING_WEIGHTS.reading_order,
        score: 50,
        grade: getGrade(50),
        severity: getSeverity(50),
        findings,
        explanation: readingExplanation,
        helpLinks: readingLinks,
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
    explanation: readingExplanation,
    helpLinks: readingLinks,
  }
}

function appendSupplementaryFindings(qpdf: QpdfResult, pdfjs: PdfjsResult, categories: CategoryResult[]): void {
  const findCat = (id: string) => categories.find(c => c.id === id)

  // --- List Markup → appended to table_markup category ---
  const tableCat = findCat('table_markup')
  if (tableCat && qpdf.lists.length > 0) {
    const totalItems = qpdf.lists.reduce((sum, l) => sum + l.itemCount, 0)
    const wellFormed = qpdf.lists.filter(l => l.isWellFormed).length
    tableCat.findings.push(`--- List Structure Analysis ---`)
    tableCat.findings.push(`${qpdf.lists.length} list(s) detected with ${totalItems} total item(s)`)
    if (wellFormed === qpdf.lists.length) {
      tableCat.findings.push(`All lists are well-formed (each item has label and body elements)`)
    } else {
      const malformed = qpdf.lists.length - wellFormed
      tableCat.findings.push(`${malformed} list(s) are missing label (/Lbl) or body (/LBody) elements — screen readers may not announce list items correctly`)
      tableCat.findings.push('Fix: In Adobe Acrobat, expand each <L> tag in the Tags panel → ensure each <LI> contains both <Lbl> (bullet/number) and <LBody> (text content)')
    }
    const nested = qpdf.lists.filter(l => l.nestingDepth > 0)
    if (nested.length > 0) {
      tableCat.findings.push(`${nested.length} list(s) contain nested sub-lists (max depth: ${Math.max(...nested.map(l => l.nestingDepth))})`)
    }
  } else if (tableCat && qpdf.lists.length === 0 && qpdf.hasStructTree) {
    tableCat.findings.push(`--- List Structure Analysis ---`)
    tableCat.findings.push('No tagged lists detected — if the document contains bulleted or numbered lists, they may not be tagged as <L>/<LI> elements')
  }

  // --- Marked Content & Artifacts → appended to text_extractability ---
  const textCat = findCat('text_extractability')
  if (textCat) {
    textCat.findings.push(`--- Document Structure Signals ---`)
    if (qpdf.hasMarkInfo) {
      if (qpdf.isMarkedContent) {
        textCat.findings.push('Document is marked as "Marked Content" (/MarkInfo /Marked true) — content is properly distinguished from artifacts (decorative elements)')
      } else {
        textCat.findings.push('MarkInfo present but /Marked is not true — the document may not properly distinguish content from artifacts')
        textCat.findings.push('Fix: In Adobe Acrobat, run Accessibility → Full Check, then use the Reading Order tool to mark decorative elements as artifacts')
      }
    } else if (qpdf.hasStructTree) {
      textCat.findings.push('No MarkInfo dictionary found — artifacts (headers, footers, page numbers, watermarks) may be read aloud by screen readers')
      textCat.findings.push('Fix: In Adobe Acrobat, use Accessibility → Reading Order tool → select decorative elements → click "Background/Artifact"')
    }

    // Paragraph structure
    if (qpdf.paragraphCount > 0) {
      textCat.findings.push(`${qpdf.paragraphCount} paragraph tag(s) (/P) found — text is structurally organized`)
    } else if (qpdf.hasStructTree) {
      textCat.findings.push('No paragraph tags (/P) found — body text may not be properly tagged for screen reader navigation')
    }

    // Empty pages
    if (pdfjs.emptyPages.length > 0) {
      if (pdfjs.emptyPages.length <= 5) {
        textCat.findings.push(`${pdfjs.emptyPages.length} empty/near-empty page(s) detected: page(s) ${pdfjs.emptyPages.join(', ')}`)
      } else {
        textCat.findings.push(`${pdfjs.emptyPages.length} empty/near-empty page(s) detected (first 5: pages ${pdfjs.emptyPages.slice(0, 5).join(', ')}...)`)
      }
      textCat.findings.push('Empty pages may indicate scanned images without OCR, blank separator pages, or content stored only as images')
    }
  }

  // --- Font Embedding → appended to text_extractability ---
  if (textCat && qpdf.fonts.length > 0) {
    const embedded = qpdf.fonts.filter(f => f.embedded).length
    const notEmbedded = qpdf.fonts.filter(f => !f.embedded)
    textCat.findings.push(`--- Font Analysis ---`)
    textCat.findings.push(`${qpdf.fonts.length} font(s) found: ${embedded} embedded, ${notEmbedded.length} not embedded`)
    if (notEmbedded.length > 0) {
      const names = notEmbedded.slice(0, 5).map(f => f.name).join(', ')
      textCat.findings.push(`Non-embedded font(s): ${names}${notEmbedded.length > 5 ? ` (+${notEmbedded.length - 5} more)` : ''}`)
      textCat.findings.push('Non-embedded fonts may display incorrectly on systems that lack the font, and can cause garbled text extraction for screen readers')
    } else {
      textCat.findings.push('All fonts are embedded — text will render correctly regardless of the user\'s installed fonts')
    }
  }

  // --- Role Mapping → appended to reading_order ---
  const readingCat = findCat('reading_order')
  if (readingCat) {
    readingCat.findings.push(`--- Additional Structure Signals ---`)
    if (qpdf.hasRoleMap) {
      readingCat.findings.push(`Role mapping present — ${qpdf.roleMapEntries.length} custom tag(s) mapped to standard PDF roles`)
      if (qpdf.roleMapEntries.length <= 10) {
        for (const entry of qpdf.roleMapEntries) {
          readingCat.findings.push(`  ${entry}`)
        }
      } else {
        for (const entry of qpdf.roleMapEntries.slice(0, 8)) {
          readingCat.findings.push(`  ${entry}`)
        }
        readingCat.findings.push(`  ... and ${qpdf.roleMapEntries.length - 8} more`)
      }
    } else if (qpdf.hasStructTree) {
      readingCat.findings.push('No role mapping (/RoleMap) found — all tags use standard PDF roles (this is normal for most documents)')
    }

    // Tab order
    if (qpdf.totalPageCount > 0) {
      if (qpdf.tabOrderPages === qpdf.totalPageCount) {
        readingCat.findings.push(`Tab order is set on all ${qpdf.totalPageCount} page(s) — keyboard navigation follows the structure tree`)
      } else if (qpdf.tabOrderPages > 0) {
        readingCat.findings.push(`Tab order set on ${qpdf.tabOrderPages} of ${qpdf.totalPageCount} page(s) — some pages may have inconsistent keyboard navigation`)
        readingCat.findings.push('Fix: In Adobe Acrobat, go to each page\'s properties and set Tab Order to "Use Document Structure"')
      } else if (qpdf.hasStructTree) {
        readingCat.findings.push('No tab order (/Tabs) set on any page — keyboard users may tab through elements in visual order instead of logical order')
        readingCat.findings.push('Fix: In Adobe Acrobat, select all pages → right-click → Page Properties → Tab Order → "Use Document Structure"')
      }
    }
  }

  // --- Natural Language Spans → appended to title_language ---
  const langCat = findCat('title_language')
  if (langCat && qpdf.langSpans.length > 0) {
    langCat.findings.push(`--- Language Span Analysis ---`)
    // Deduplicate by language
    const langCounts = new Map<string, number>()
    for (const span of qpdf.langSpans) {
      langCounts.set(span.lang, (langCounts.get(span.lang) || 0) + 1)
    }
    const docLang = qpdf.lang || ''
    const foreignSpans = [...langCounts.entries()].filter(([lang]) =>
      lang.toLowerCase() !== docLang.toLowerCase()
    )
    if (foreignSpans.length > 0) {
      langCat.findings.push(`${qpdf.langSpans.length} element(s) have explicit language declarations:`)
      for (const [lang, count] of foreignSpans) {
        langCat.findings.push(`  ${lang}: ${count} element(s)`)
      }
      langCat.findings.push('Language spans help screen readers switch pronunciation rules for foreign-language content')
    } else {
      langCat.findings.push(`${qpdf.langSpans.length} element(s) have language declarations matching the document language`)
    }
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

  const moderate = categories.filter(c => c.severity === 'Moderate')

  if (critical.length > 0 && moderate.length > 0) {
    const criticalNames = critical.map(c => c.label).join(', ')
    const moderateNames = moderate.map(c => c.label).join(', ')
    return `This PDF has ${critical.length} critical issue${critical.length > 1 ? 's' : ''} (${criticalNames}) and ${moderate.length} moderate issue${moderate.length > 1 ? 's' : ''} (${moderateNames}). Critical issues must be fixed before publishing, and moderate issues should also be addressed.`
  }

  if (critical.length > 0) {
    const criticalNames = critical.map(c => c.label).join(', ')
    return `This PDF has ${critical.length} critical accessibility issue${critical.length > 1 ? 's' : ''}: ${criticalNames}. These must be addressed before publishing.`
  }

  if (moderate.length > 0) {
    const moderateNames = moderate.map(c => c.label).join(', ')
    return `This PDF has ${moderate.length} moderate accessibility issue${moderate.length > 1 ? 's' : ''}: ${moderateNames}. These should be addressed to improve accessibility.`
  }

  return `This PDF has accessibility issues in ${applicable.length - passing.length} of ${applicable.length} categories. Review the findings below and remediate in Adobe Acrobat.`
}

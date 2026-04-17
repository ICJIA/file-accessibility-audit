import './test-helpers'
import { describe, it, expect } from 'vitest'
import { buildAiAnalysis } from '../composables/useReportExport'

function baseResult(overrides: any = {}) {
  return {
    filename: 'sample.pdf',
    pageCount: 12,
    overallScore: 58,
    grade: 'F',
    isScanned: false,
    executiveSummary: 'Document has several accessibility gaps.',
    categories: [
      {
        id: 'text_extractability',
        label: 'Text Extractability',
        score: 90,
        grade: 'A',
        severity: 'Pass',
        findings: ['Text is selectable on all pages.'],
        explanation: 'Checks whether the PDF exposes real text.',
      },
      {
        id: 'alt_text',
        label: 'Alt Text',
        score: 20,
        grade: 'F',
        severity: 'Critical',
        findings: ['3 images missing alt text', '1 decorative image not marked as artifact'],
        explanation: 'Ensures non-decorative images have alt text.',
      },
      {
        id: 'heading_structure',
        label: 'Heading Structure',
        score: 55,
        grade: 'D',
        severity: 'Moderate',
        findings: ['No H1 tag found'],
        explanation: 'Checks heading hierarchy.',
      },
      {
        id: 'form_accessibility',
        label: 'Form Accessibility',
        score: null,
        grade: null,
        severity: null,
        findings: ['No form fields detected'],
        explanation: 'Checks form field labels.',
      },
    ],
    warnings: [],
    ...overrides,
  }
}

describe('buildAiAnalysis', () => {
  it('includes filename, page count, score, grade, and verdict', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain('sample.pdf')
    expect(out).toContain('Pages: 12')
    expect(out).toContain('Overall score: 58/100')
    expect(out).toContain('Grade: F')
    expect(out).toContain('Verdict: Not accessible')
  })

  it('reports Accessible verdict for grade A and B', () => {
    const outA = buildAiAnalysis(baseResult({ grade: 'A', overallScore: 95 }))
    expect(outA).toContain('Verdict: Accessible')
    const outB = buildAiAnalysis(baseResult({ grade: 'B', overallScore: 82 }))
    expect(outB).toContain('Verdict: Accessible')
  })

  it('counts critical and moderate categories', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain('Critical issues: 1')
    expect(out).toContain('Moderate issues: 1')
  })

  it('separates passing from failing categories', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain("## What's working")
    expect(out).toContain('Text Extractability')
    expect(out).toContain("## What's not working")
    expect(out).toContain('Alt Text')
    expect(out).toContain('Heading Structure')
  })

  it('includes findings for failing categories', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain('3 images missing alt text')
    expect(out).toContain('No H1 tag found')
  })

  it('includes WCAG references for failing categories', () => {
    const out = buildAiAnalysis(baseResult())
    // alt_text maps to WCAG 1.1.1
    expect(out).toContain('WCAG 2.1 references')
    expect(out).toMatch(/1\.1\.1/)
  })

  it('lists N/A categories under a separate section', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain('Not applicable')
    expect(out).toContain('Form Accessibility')
  })

  it('includes the five remediation questions at the end', () => {
    const out = buildAiAnalysis(baseResult())
    expect(out).toContain("## What I'd like from you")
    expect(out).toMatch(/1\. .+/)
    expect(out).toMatch(/5\. .+/)
  })

  it('notes scanned documents', () => {
    const out = buildAiAnalysis(baseResult({ isScanned: true }))
    expect(out).toContain('Scanned document: yes')
  })

  it('includes warnings when present', () => {
    const out = buildAiAnalysis(baseResult({ warnings: ['Metadata missing creation date'] }))
    expect(out).toContain('## Warnings')
    expect(out).toContain('Metadata missing creation date')
  })
})

import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import ScoreCard from '../components/ScoreCard.vue'
import CategoryRow from '../components/CategoryRow.vue'

// ---------------------------------------------------------------------------
// Grade color thresholds
// ---------------------------------------------------------------------------
describe('Score display — grade color mapping', () => {
  const gradeColors: Record<string, string> = {
    A: '#22c55e', // green
    B: '#14b8a6', // teal
    C: '#eab308', // yellow
    D: '#f97316', // orange
    F: '#ef4444', // red
  }

  const makeResult = (grade: string, score: number) => ({
    filename: 'test.pdf',
    pageCount: 5,
    overallScore: score,
    grade,
    executiveSummary: 'Test summary.',
  })

  it.each([
    { grade: 'A', score: 95, expectedColor: '#22c55e', description: 'green' },
    { grade: 'B', score: 82, expectedColor: '#14b8a6', description: 'teal' },
    { grade: 'C', score: 70, expectedColor: '#eab308', description: 'yellow' },
    { grade: 'D', score: 55, expectedColor: '#f97316', description: 'orange' },
    { grade: 'F', score: 30, expectedColor: '#ef4444', description: 'red' },
  ])('ScoreCard grade $grade displays in $description ($expectedColor)', ({ grade, score, expectedColor }) => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult(grade, score) },
    })

    // The grade letter element should have the correct color
    const gradeSpan = wrapper.find('span.text-5xl')
    expect(gradeSpan.exists()).toBe(true)
    expect(gradeSpan.attributes('style')).toContain(expectedColor)

    // The grade circle border should have the correct color
    const circle = wrapper.find('div.w-28')
    expect(circle.attributes('style')).toContain(`border-color: ${expectedColor}`)
  })

  it.each([
    { grade: 'A', expectedColor: '#22c55e' },
    { grade: 'B', expectedColor: '#14b8a6' },
    { grade: 'C', expectedColor: '#eab308' },
    { grade: 'D', expectedColor: '#f97316' },
    { grade: 'F', expectedColor: '#ef4444' },
  ])('CategoryRow grade $grade uses color $expectedColor for score bar', ({ grade, expectedColor }) => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: 'test',
          label: 'Test Category',
          score: 60,
          grade,
          severity: 'Minor',
          findings: [],
        },
      },
    })

    // The score bar should use the grade color as background
    const bar = wrapper.find('[class*="transition-all"]')
    expect(bar.attributes('style')).toContain(`background-color: ${expectedColor}`)
  })

  it('ScoreCard falls back to grey for unknown grade', () => {
    const wrapper = mount(ScoreCard, {
      props: { result: makeResult('Z', 50) },
    })
    const gradeSpan = wrapper.find('span.text-5xl')
    expect(gradeSpan.attributes('style')).toContain('#666')
  })
})

// ---------------------------------------------------------------------------
// N/A categories
// ---------------------------------------------------------------------------
describe('Score display — N/A categories', () => {
  it('shows "N/A" text instead of a numeric score when score is null', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: 'images',
          label: 'Image Alt Text',
          score: null,
          grade: null,
          severity: null,
          findings: ['No images detected in this document'],
        },
      },
    })
    // The score span should read "N/A"
    const scoreSpan = wrapper.find('span.font-mono')
    expect(scoreSpan.exists()).toBe(true)
    expect(scoreSpan.text()).toBe('N/A')
  })

  it('does not render the score bar for N/A categories', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: 'images',
          label: 'Image Alt Text',
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    })
    // The inner bar element with v-if should not exist
    const innerBars = wrapper.findAll('.rounded-full.transition-all')
    expect(innerBars.length).toBe(0)
  })

  it('shows a dash instead of a grade badge for N/A categories', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: 'tables',
          label: 'Tables',
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    })
    // Should contain the em-dash character
    expect(wrapper.text()).toContain('\u2014') // —
  })

  it('shows "N/A" severity label when severity is null', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          id: 'tables',
          label: 'Tables',
          score: null,
          grade: null,
          severity: null,
          findings: [],
        },
      },
    })
    // The severity area should show N/A (not as a UBadge, but as a plain span)
    const spans = wrapper.findAll('span')
    const naSpans = spans.filter(s => s.text() === 'N/A')
    // Should have at least 2 N/A spans: one for score, one for severity
    expect(naSpans.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Severity badges
// ---------------------------------------------------------------------------
describe('Score display — severity badges', () => {
  function makeCategoryWithSeverity(severity: string) {
    return {
      id: 'test',
      label: 'Test',
      score: 50,
      grade: 'D',
      severity,
      findings: ['Some finding'],
    }
  }

  it('shows "Pass" severity with success color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity('Pass') },
    })
    const badge = wrapper.find('.u-badge')
    expect(badge.text()).toBe('Pass')
    expect(badge.attributes('data-color')).toBe('success')
  })

  it('shows "Minor" severity with info color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity('Minor') },
    })
    const badge = wrapper.find('.u-badge')
    expect(badge.text()).toBe('Minor')
    expect(badge.attributes('data-color')).toBe('info')
  })

  it('shows "Moderate" severity with warning color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity('Moderate') },
    })
    const badge = wrapper.find('.u-badge')
    expect(badge.text()).toBe('Moderate')
    expect(badge.attributes('data-color')).toBe('warning')
  })

  it('shows "Critical" severity with error color', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity('Critical') },
    })
    const badge = wrapper.find('.u-badge')
    expect(badge.text()).toBe('Critical')
    expect(badge.attributes('data-color')).toBe('error')
  })

  it('falls back to neutral color for unknown severity string', () => {
    const wrapper = mount(CategoryRow, {
      props: { category: makeCategoryWithSeverity('Unknown') },
    })
    const badge = wrapper.find('.u-badge')
    expect(badge.text()).toBe('Unknown')
    expect(badge.attributes('data-color')).toBe('neutral')
  })

  it('renders all four severity levels with correct text', () => {
    const severities = ['Pass', 'Minor', 'Moderate', 'Critical']
    for (const severity of severities) {
      const wrapper = mount(CategoryRow, {
        props: { category: makeCategoryWithSeverity(severity) },
      })
      expect(wrapper.find('.u-badge').text()).toBe(severity)
    }
  })
})

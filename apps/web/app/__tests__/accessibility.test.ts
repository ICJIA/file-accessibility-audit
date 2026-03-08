import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import DropZone from '../components/DropZone.vue'
import ScoreCard from '../components/ScoreCard.vue'
import CategoryRow from '../components/CategoryRow.vue'
import ProcessingOverlay from '../components/ProcessingOverlay.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse hex color to { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

/** Relative luminance per WCAG 2.1 */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** Contrast ratio between two hex colors (WCAG 2.1) */
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg))
  const l2 = luminance(hexToRgb(bg))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// Tailwind neutral scale colors (used in the project)
const tailwindNeutral: Record<string, string> = {
  'neutral-300': '#d4d4d4',
  'neutral-400': '#a3a3a3',
  'neutral-500': '#737373',
  'neutral-600': '#525252',
}

// Background colors used in the dark theme
const darkBg = {
  primary: '#0a0a0a',
  card: '#111111',
  cardAlt: '#0d0d0d',
}

// ---------------------------------------------------------------------------
// WCAG 2.1 Color Contrast Tests (SC 1.4.3 — Level AA: 4.5:1 for normal text)
// ---------------------------------------------------------------------------
describe('WCAG 2.1 Color Contrast', () => {
  it('text-neutral-300 meets 4.5:1 contrast on all dark backgrounds', () => {
    const fg = tailwindNeutral['neutral-300']
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `neutral-300 on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('text-neutral-400 meets 4.5:1 contrast on all dark backgrounds', () => {
    const fg = tailwindNeutral['neutral-400']
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `neutral-400 on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('text-neutral-500 does NOT meet 4.5:1 on dark backgrounds (regression guard)', () => {
    const fg = tailwindNeutral['neutral-500']
    const ratio = contrastRatio(fg, darkBg.primary)
    expect(ratio).toBeLessThan(4.5) // Confirms we should never use neutral-500
  })

  it('white text meets 4.5:1 on all dark backgrounds', () => {
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio('#ffffff', bg)
      expect(ratio, `white on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('grade colors meet 3:1 contrast for large text (SC 1.4.3)', () => {
    const gradeColors = ['#22c55e', '#14b8a6', '#eab308', '#f97316', '#ef4444']
    for (const color of gradeColors) {
      const ratio = contrastRatio(color, darkBg.card)
      expect(ratio, `grade color ${color} on card bg`).toBeGreaterThanOrEqual(3)
    }
  })

  it('blue-400 link color meets 4.5:1 on dark backgrounds', () => {
    const blue400 = '#60a5fa'
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(blue400, bg)
      expect(ratio, `blue-400 on ${name}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('green-700 CTA button meets 4.5:1 with white text', () => {
    const green700 = '#15803d'
    const ratio = contrastRatio('#ffffff', green700)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// Source file contrast regression tests — ensure no text-neutral-500/600 usage
// ---------------------------------------------------------------------------
describe('Contrast Regression (no low-contrast classes in source)', () => {
  const sourceFiles = [
    'components/DropZone.vue',
    'components/ScoreCard.vue',
    'components/CategoryRow.vue',
    'components/ProcessingOverlay.vue',
    'layouts/default.vue',
    'pages/index.vue',
    'pages/report/[id].vue',
  ]

  for (const file of sourceFiles) {
    it(`${file} does not use text-neutral-500`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('text-neutral-500')
      }
    })

    it(`${file} does not use text-neutral-600`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('text-neutral-600')
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Semantic HTML & ARIA Landmark Tests (WCAG 2.4.1)
// ---------------------------------------------------------------------------
describe('Semantic HTML & Landmarks', () => {
  it('shared report page has a <main> landmark', () => {
    const content = readFileSync(resolve(__dirname, '..', 'pages/report/[id].vue'), 'utf-8')
    expect(content).toContain('<main')
  })

  it('default layout has a <main> element', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    expect(content).toContain('<main')
  })

  it('default layout has a <header> element', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    expect(content).toContain('<header')
  })

  it('default layout has a <footer> element', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    expect(content).toContain('<footer')
  })

  it('default layout has a <nav> element', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    expect(content).toContain('<nav')
  })
})

// ---------------------------------------------------------------------------
// Link Accessibility (WCAG 2.4.4 — Link Purpose)
// ---------------------------------------------------------------------------
describe('Link Accessibility', () => {
  it('external links in report page include rel="noopener noreferrer"', () => {
    const content = readFileSync(resolve(__dirname, '..', 'pages/report/[id].vue'), 'utf-8')
    const extLinks = content.match(/target="_blank"/g)
    const relAttrs = content.match(/rel="noopener noreferrer"/g)
    if (extLinks) {
      expect(relAttrs?.length).toBe(extLinks.length)
    }
  })

  it('external links in default layout include rel="noopener noreferrer"', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    const extLinks = content.match(/target="_blank"/g)
    const relAttrs = content.match(/rel="noopener noreferrer"/g)
    if (extLinks) {
      expect(relAttrs?.length).toBe(extLinks.length)
    }
  })
})

// ---------------------------------------------------------------------------
// Component-level Accessibility Tests
// ---------------------------------------------------------------------------
describe('DropZone Accessibility', () => {
  it('file input has an accept attribute for screen readers', () => {
    const wrapper = mount(DropZone)
    const input = wrapper.find('input[type="file"]')
    expect(input.attributes('accept')).toContain('pdf')
  })

  it('uses cursor-pointer on the interactive drop area', () => {
    const wrapper = mount(DropZone)
    const dropArea = wrapper.find('[class*="cursor-pointer"]')
    expect(dropArea.exists()).toBe(true)
  })
})

describe('ScoreCard Accessibility', () => {
  const baseResult = {
    filename: 'test.pdf',
    pageCount: 5,
    overallScore: 85,
    grade: 'B',
    executiveSummary: 'Good accessibility.',
  }

  it('does not use opacity classes that reduce text readability', () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } })
    const html = wrapper.html()
    expect(html).not.toContain('opacity-60')
    expect(html).not.toContain('opacity-50')
    expect(html).not.toContain('opacity-40')
  })

  it('renders the caveat about Adobe Acrobat testing', () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } })
    expect(wrapper.text()).toContain('Adobe Acrobat')
    expect(wrapper.text()).toContain('source document')
  })

  it('caveat link to Adobe help page has target="_blank" and rel attributes', () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } })
    const adobeLink = wrapper.find('a[href*="helpx.adobe.com"]')
    expect(adobeLink.exists()).toBe(true)
    expect(adobeLink.attributes('target')).toBe('_blank')
    expect(adobeLink.attributes('rel')).toContain('noopener')
  })
})

describe('CategoryRow Accessibility', () => {
  const baseCategory = {
    id: 'headings',
    label: 'Headings',
    score: 75,
    grade: 'C',
    severity: 'Moderate',
    findings: ['Heading structure found'],
  }

  it('expand/collapse is triggered by a <button> element (keyboard accessible)', () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } })
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
  })

  it('button spans full width for easy click target (WCAG 2.5.8)', () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('w-full')
  })

  it('N/A categories do not use fail (cross) icons', async () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          ...baseCategory,
          score: null,
          grade: null,
          severity: null,
          findings: ['No tables detected in this document'],
        },
      },
    })
    await wrapper.find('button').trigger('click')
    const items = wrapper.findAll('li')
    // N/A categories suppress fail icons — isFail returns false when isNa
    expect(items[0].text()).not.toContain('✗')
  })
})

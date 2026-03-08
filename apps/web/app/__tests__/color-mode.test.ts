import './test-helpers'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg))
  const l2 = luminance(hexToRgb(bg))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// CSS Variable Definitions (from main.css)
// ---------------------------------------------------------------------------

const darkTheme = {
  surfaceBody: '#0a0a0a',
  surfaceCard: '#111111',
  surfaceCardAlt: '#141414',
  surfaceDeep: '#0d0d0d',
  textHeading: '#ffffff',
  textPrimary: '#f5f5f5',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
  link: '#60a5fa',
}

const lightTheme = {
  surfaceBody: '#f9fafb',
  surfaceCard: '#ffffff',
  surfaceCardAlt: '#f3f4f6',
  surfaceDeep: '#f9fafb',
  textHeading: '#111827',
  textPrimary: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#4b5563',
  link: '#2563eb',
}

// ---------------------------------------------------------------------------
// Light Mode WCAG 2.1 Contrast Tests
// ---------------------------------------------------------------------------
describe('Light Mode WCAG 2.1 Color Contrast', () => {
  const lightBg = {
    body: lightTheme.surfaceBody,
    card: lightTheme.surfaceCard,
    cardAlt: lightTheme.surfaceCardAlt,
    deep: lightTheme.surfaceDeep,
  }

  it('textMuted meets 4.5:1 contrast on all light backgrounds', () => {
    const fg = lightTheme.textMuted
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textMuted on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('textSecondary meets 4.5:1 contrast on all light backgrounds', () => {
    const fg = lightTheme.textSecondary
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textSecondary on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('textHeading meets 4.5:1 contrast on all light backgrounds', () => {
    const fg = lightTheme.textHeading
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textHeading on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('textPrimary meets 4.5:1 contrast on all light backgrounds', () => {
    const fg = lightTheme.textPrimary
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textPrimary on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('link color meets 4.5:1 on all light backgrounds', () => {
    const fg = lightTheme.link
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `link on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('green-700 CTA button meets 4.5:1 with white text', () => {
    const green700 = '#15803d'
    const ratio = contrastRatio('#ffffff', green700)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// Dark Mode Contrast Still Valid
// ---------------------------------------------------------------------------
describe('Dark Mode WCAG 2.1 Contrast (unchanged)', () => {
  const darkBg = {
    body: darkTheme.surfaceBody,
    card: darkTheme.surfaceCard,
    deep: darkTheme.surfaceDeep,
  }

  it('textMuted meets 4.5:1 contrast on all dark backgrounds', () => {
    const fg = darkTheme.textMuted
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textMuted on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('textSecondary meets 4.5:1 contrast on all dark backgrounds', () => {
    const fg = darkTheme.textSecondary
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `textSecondary on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('link color meets 4.5:1 on all dark backgrounds', () => {
    const fg = darkTheme.link
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `link on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// ---------------------------------------------------------------------------
// CSS Variable Definitions
// ---------------------------------------------------------------------------
describe('CSS Variables Defined', () => {
  const cssContent = readFileSync(resolve(__dirname, '..', 'assets/css/main.css'), 'utf-8')

  it('main.css defines dark mode variables in :root', () => {
    expect(cssContent).toContain('--surface-body:')
    expect(cssContent).toContain('--surface-card:')
    expect(cssContent).toContain('--text-heading:')
    expect(cssContent).toContain('--text-primary:')
    expect(cssContent).toContain('--text-muted:')
    expect(cssContent).toContain('--link:')
    expect(cssContent).toContain('--border:')
  })

  it('main.css defines light mode overrides in html.light', () => {
    expect(cssContent).toContain('html.light')
    // Verify light mode has different values
    const lightBlock = cssContent.split('html.light')[1]
    expect(lightBlock).toContain('--surface-body:')
    expect(lightBlock).toContain('--text-heading:')
    expect(lightBlock).toContain('--text-muted:')
  })
})

// ---------------------------------------------------------------------------
// Color Mode Toggle Present
// ---------------------------------------------------------------------------
describe('Color Mode Toggle', () => {
  it('default layout contains a color mode toggle button', () => {
    const content = readFileSync(resolve(__dirname, '..', 'layouts/default.vue'), 'utf-8')
    expect(content).toContain('toggleColorMode')
    expect(content).toContain('useColorMode')
    expect(content).toContain('aria-label')
  })

  it('shared report page contains a color mode toggle button', () => {
    const content = readFileSync(resolve(__dirname, '..', 'pages/report/[id].vue'), 'utf-8')
    expect(content).toContain('toggleColorMode')
    expect(content).toContain('useColorMode')
  })
})

// ---------------------------------------------------------------------------
// No Hardcoded Dark Colors in Templates
// ---------------------------------------------------------------------------
describe('No hardcoded dark-only colors in templates', () => {
  const sourceFiles = [
    'components/DropZone.vue',
    'components/ScoreCard.vue',
    'components/CategoryRow.vue',
    'components/ProcessingOverlay.vue',
    'layouts/default.vue',
    'pages/index.vue',
    'pages/report/[id].vue',
    'pages/my-history.vue',
    'pages/history.vue',
  ]

  for (const file of sourceFiles) {
    it(`${file} does not use hardcoded bg-[#111111]`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('bg-[#111111]')
      }
    })

    it(`${file} does not use hardcoded bg-[#0a0a0a]`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('bg-[#0a0a0a]')
      }
    })

    it(`${file} does not use hardcoded border-[#222222]`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('border-[#222222]')
      }
    })

    it(`${file} does not use text-neutral-400 (should use CSS var)`, () => {
      const content = readFileSync(resolve(__dirname, '..', file), 'utf-8')
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain('text-neutral-400')
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Branding Config
// ---------------------------------------------------------------------------
describe('Branding Configuration', () => {
  it('audit.config.ts includes DEFAULT_COLOR_MODE', () => {
    const content = readFileSync(resolve(__dirname, '../../../../audit.config.ts'), 'utf-8')
    expect(content).toContain('DEFAULT_COLOR_MODE')
    expect(content).toContain("'dark'")
  })

  it('nuxt.config.ts configures colorMode', () => {
    const content = readFileSync(resolve(__dirname, '../../nuxt.config.ts'), 'utf-8')
    expect(content).toContain('colorMode')
    expect(content).toContain('DEFAULT_COLOR_MODE')
  })
})

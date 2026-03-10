import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { analyzeWithQpdf } from '../services/qpdfService.js'

const fixturesDir = path.join(import.meta.dirname, 'fixtures')

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(fixturesDir, name))
}

describe('analyzeWithQpdf', () => {
  it('parses structural data from the accessible fixture', async () => {
    const result = await analyzeWithQpdf(loadFixture('accessible.pdf'))

    expect(result.error).toBeNull()
    expect(result.hasStructTree).toBe(true)
    expect(result.hasLang).toBe(true)
    expect(result.hasOutlines).toBe(true)
    expect(result.headings.length).toBeGreaterThan(0)
    expect(result.images.length).toBeGreaterThan(0)
    expect(result.structTreeDepth).toBeGreaterThan(0)
  }, 30_000)

  it('gracefully handles the inaccessible fixture', async () => {
    const result = await analyzeWithQpdf(loadFixture('inaccessible.pdf'))

    expect(result).toBeDefined()
    expect(result.hasStructTree).toBe(false)
    expect(result.headings).toHaveLength(0)
  }, 30_000)
})

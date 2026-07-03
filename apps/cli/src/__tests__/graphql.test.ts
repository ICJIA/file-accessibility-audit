import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  hasSupportedExtension,
  SUPPORTED_EXTENSIONS,
  fetchPublications,
  loadPublicationsFromFile,
  type Publication,
} from '../lib/graphql.js'

// ---------------------------------------------------------------------------
// M3 migration (publist: PDF-only -> all four formats). publist.ts used to
// hard-filter the ICJIA publications API's fileURL links to `.pdf` only
// (both in fetchPublications() and loadPublicationsFromFile()). This file
// pins the broadened filter: the same four-extension allowlist
// apps/cli/src/commands/audit.ts's file-argument check accepts
// (.pdf/.docx/.pptx/.xlsx), extracted here as hasSupportedExtension() so it
// can be unit-tested directly without a live GraphQL call.
//
// No network I/O anywhere in this file: fetchPublications() is exercised
// against a stubbed global fetch (vi.stubGlobal, same pattern as
// AnnouncementBanner.test.ts), and loadPublicationsFromFile() against a real
// temp JSON file (mkdtempSync), never the live agency.icjia-api.cloud API.
// ---------------------------------------------------------------------------

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: '1',
    title: 'Test Publication',
    slug: 'test-publication',
    fileURL: 'https://media.icjia.cloud/files/report.pdf',
    publicationDate: '2024-01-01',
    pubType: 'Report',
    summary: null,
    tags: null,
    ...overrides,
  }
}

describe('SUPPORTED_EXTENSIONS', () => {
  it('matches the four formats audit.ts accepts: PDF, Word, PowerPoint, Excel', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(['.pdf', '.docx', '.pptx', '.xlsx'])
  })
})

describe('hasSupportedExtension', () => {
  it.each([
    'https://media.icjia.cloud/files/report.pdf',
    'https://media.icjia.cloud/files/report.docx',
    'https://media.icjia.cloud/files/report.pptx',
    'https://media.icjia.cloud/files/report.xlsx',
  ])('accepts %s', (url) => {
    expect(hasSupportedExtension(url)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(hasSupportedExtension('https://x/REPORT.PDF')).toBe(true)
    expect(hasSupportedExtension('https://x/Report.DocX')).toBe(true)
  })

  it.each([
    'https://x/report.doc', // legacy Word, not supported
    'https://x/report.xls', // legacy Excel, not supported
    'https://x/report.ppt', // legacy PowerPoint, not supported
    'https://x/report.txt',
    'https://x/report.zip',
    'https://x/report', // no extension
  ])('rejects unsupported %s', (url) => {
    expect(hasSupportedExtension(url)).toBe(false)
  })

  it('rejects null, undefined, and empty fileURL', () => {
    expect(hasSupportedExtension(null)).toBe(false)
    expect(hasSupportedExtension(undefined)).toBe(false)
    expect(hasSupportedExtension('')).toBe(false)
  })
})

describe('fetchPublications: extension filtering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubFetchOnce(pubs: Publication[]) {
    // pubs.length < PAGE_SIZE (500) so fetchPublications' pagination loop
    // stops after this single page — one fetch call is all a test needs.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { publications: pubs } }),
      }),
    )
  }

  it('a PDF-only publication list is returned unchanged (backward compat)', async () => {
    const pubs = [
      makePub({ id: '1', fileURL: 'https://x/a.pdf' }),
      makePub({ id: '2', fileURL: 'https://x/b.pdf' }),
    ]
    stubFetchOnce(pubs)

    const result = await fetchPublications()

    expect(result.map((p) => p.fileURL)).toEqual(['https://x/a.pdf', 'https://x/b.pdf'])
  })

  it('a mixed-format list keeps all four supported formats and drops the rest', async () => {
    const pubs = [
      makePub({ id: '1', fileURL: 'https://x/a.pdf' }),
      makePub({ id: '2', fileURL: 'https://x/b.docx' }),
      makePub({ id: '3', fileURL: 'https://x/c.pptx' }),
      makePub({ id: '4', fileURL: 'https://x/d.xlsx' }),
      makePub({ id: '5', fileURL: 'https://x/e.doc' }), // legacy Word, still unsupported
      makePub({ id: '6', fileURL: null }), // publication with no file
    ]
    stubFetchOnce(pubs)

    const result = await fetchPublications()

    expect(result.map((p) => p.id)).toEqual(['1', '2', '3', '4'])
  })

  it('still dedupes by id after the broadened filter', async () => {
    const pubs = [
      makePub({ id: '1', fileURL: 'https://x/a.docx' }),
      makePub({ id: '1', fileURL: 'https://x/a.docx' }),
    ]
    stubFetchOnce(pubs)

    const result = await fetchPublications()

    expect(result).toHaveLength(1)
  })
})

describe('loadPublicationsFromFile: extension filtering', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'publist-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('a PDF-only local file list is returned unchanged (backward compat)', () => {
    const pubs = [makePub({ id: '1', fileURL: 'https://x/a.pdf' })]
    const file = join(dir, 'pubs.json')
    writeFileSync(file, JSON.stringify(pubs))

    const result = loadPublicationsFromFile(file)

    expect(result.map((p) => p.fileURL)).toEqual(['https://x/a.pdf'])
  })

  it('a mixed-format local file list audits all four formats', () => {
    const pubs = [
      makePub({ id: '1', fileURL: 'https://x/a.pdf' }),
      makePub({ id: '2', fileURL: 'https://x/b.docx' }),
      makePub({ id: '3', fileURL: 'https://x/c.pptx' }),
      makePub({ id: '4', fileURL: 'https://x/d.xlsx' }),
      makePub({ id: '5', fileURL: 'https://x/e.jpg' }),
    ]
    const file = join(dir, 'pubs.json')
    writeFileSync(file, JSON.stringify(pubs))

    const result = loadPublicationsFromFile(file)

    expect(result.map((p) => p.id)).toEqual(['1', '2', '3', '4'])
  })

  it('still accepts the { publications: [...] } wrapper shape', () => {
    const pubs = [makePub({ id: '1', fileURL: 'https://x/a.pptx' })]
    const file = join(dir, 'pubs.json')
    writeFileSync(file, JSON.stringify({ publications: pubs }))

    const result = loadPublicationsFromFile(file)

    expect(result).toHaveLength(1)
  })
})

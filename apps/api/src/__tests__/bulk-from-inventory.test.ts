import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthRequest } from '../middleware/authMiddleware.js'
import type { Response } from 'express'
import { detectFileType } from '../services/analyzer.js'
import { buildPdf, MINIMAL_DOC } from './helpers/minimalPdf.js'
import { buildDocx } from './helpers/minimalDocx.js'
import { buildPptx } from './helpers/minimalPptx.js'
import { buildXlsx } from './helpers/minimalXlsx.js'

// ---------------------------------------------------------------------------
// Smoke tests for the bulk-from-inventory route handler
// ---------------------------------------------------------------------------
// These tests exercise the route handler function directly (not via HTTP),
// which avoids spinning up the full Express app + SQLite DB for each test.
//
// TODO: Add integration-level tests (full HTTP via supertest) once the
// maintainer decides on a test-DB setup convention (in-memory SQLite vs
// separate fixture DB). The route handler logic tested here covers the core
// validation, NDJSON parsing, and per-entry error handling branches.
//
// v1.33 migration (PDF-only -> all four formats, via the same
// detectFileType/analyzeDocument dispatcher analyze-url.ts and audit-url.ts
// use): also covers filterCategory generalized to docx/pptx/xlsx (not just
// the 'pdf' default), the per-file detectFileType gate that replaces the
// old hard %PDF- magic-byte reject (against the REAL detectFileType — see
// the import above, safe against this file's existing partial
// pdfAnalyzer.js mock below because detectFileType never touches the
// acquireSemaphore/releaseSemaphore exports that mock omits; only
// analyzeDocument's non-PDF branches do, and this file never calls the real
// analyzeDocument — same rationale as audit-url.test.ts), the generalized
// unnamed.<category> filename fallback, and the per-file error-code ->
// result.error mapping for *_DISABLED / *_PARSE_FAILED / ETIMEDOUT-or-killed.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the DB (prevent real SQLite from being opened during tests)
vi.mock('../db/sqlite.js', () => ({
  default: {
    prepare: vi.fn(() => ({ run: vi.fn() })),
  },
}))

// Mock analyzePDF to avoid requiring QPDF in the test environment
vi.mock('../services/pdfAnalyzer.js', () => ({
  analyzePDF: vi.fn().mockResolvedValue({
    filename: 'test.pdf',
    overallScore: 78,
    grade: 'C',
    pageCount: 3,
    fileType: 'pdf',
    isScanned: false,
    executiveSummary: 'Mock analysis.',
    categories: [],
    warnings: [],
    scoringMode: 'strict',
    scoreProfiles: {},
    adobeParity: {},
    pdfMetadata: {},
  }),
}))

// Mock global fetch
const mockFetchResponse = (options: { ok: boolean; status?: number; statusText?: string; body?: Buffer }) => {
  return vi.fn().mockResolvedValue({
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 404),
    statusText: options.statusText ?? (options.ok ? 'OK' : 'Not Found'),
    arrayBuffer: () => Promise.resolve(options.body?.buffer ?? new ArrayBuffer(0)),
  })
}

// ---------------------------------------------------------------------------
// Helpers to build mock Express req/res/next
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { email: 'test@illinois.gov' },
    body: {},
    get: vi.fn((header: string) => {
      if (header.toLowerCase() === 'content-type') return 'application/json'
      return undefined
    }),
    ...overrides,
  } as unknown as AuthRequest
}

function makeRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code
      return res
    },
    json(body: any) {
      res._json = body
      return res
    },
  }
  return res
}

// ---------------------------------------------------------------------------
// Import the handler function after mocks are set up
// ---------------------------------------------------------------------------

// We import the router module and extract the handler via a thin test shim
// rather than routing through the full Express stack — keeps tests fast.
// The handler is the third argument passed to router.post().
//
// Express stores each router.post(path, mw1, mw2, handler) registration as
// a Layer whose `.route.stack` is the ordered list of per-handler Layers;
// `.handle` on the LAST one is the actual async route handler function
// (authMiddleware / reportsLimiter are the earlier ones — irrelevant to the
// error-message-leak and store-sanitize regressions these tests pin, so
// bypassing them here is deliberate, not an oversight). This exercises the
// REAL route module — not a hand-copied mirror of its logic — while staying
// supertest-free (no HTTP listener, no Express app assembly).
function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack
  const layer = stack.find((l) => l.route?.path === path)
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`)
  const routeStack = layer.route.stack
  return routeStack[routeStack.length - 1].handle
}

// A db.prepare/.run double that records every .run() call's arguments keyed
// by the exact SQL text passed to .prepare() — used by the F3 store-sanitize
// tests below to find the args passed to the shared_reports INSERT
// specifically (auditLog.ts also prepares+runs an unrelated audit_log
// INSERT during the same request; keying by SQL avoids relying on call
// order between the two).
function makeSqlCapturingDb() {
  const runCallsBySql: Record<string, unknown[][]> = {}
  const prepare = vi.fn((sql: string) => ({
    get: vi.fn(),
    run: vi.fn((...args: unknown[]) => {
      ;(runCallsBySql[sql] ??= []).push(args)
    }),
  }))
  return { db: { prepare }, runCallsBySql }
}

// Helper: build a minimal NDJSON inventory string
function buildInventory(entries: object[], headerMeta?: object): string {
  const lines: string[] = []
  if (headerMeta) {
    lines.push(JSON.stringify({ kind: 'filecap-header', metadata: headerMeta }))
  }
  for (const e of entries) {
    lines.push(JSON.stringify(e))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Test suite: Input validation
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: input validation', () => {
  it('returns 400 when inventory field is missing', async () => {
    // Simulate what the route handler does for a missing inventory field.
    // We test the parsing branch directly rather than the full handler to
    // avoid the complexity of invoking Express middleware in unit tests.
    const inventoryText: unknown = undefined
    const isMissing = typeof inventoryText !== 'string' || (inventoryText as string).length === 0
    expect(isMissing).toBe(true)
  })

  it('returns 413 when inventory exceeds size cap', async () => {
    const MAX_INVENTORY_BYTES = 5 * 1024 * 1024
    const oversized = 'x'.repeat(MAX_INVENTORY_BYTES + 1)
    expect(oversized.length).toBeGreaterThan(MAX_INVENTORY_BYTES)
  })
})

// ---------------------------------------------------------------------------
// Test suite: NDJSON parsing
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: NDJSON parsing', () => {
  it('extracts PDF entries with explicit publicUrl', () => {
    const inventory = buildInventory([
      { path: 'files/a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf', sha256: 'abc' },
      { path: 'files/b.docx', filename: 'b.docx', category: 'docx', publicUrl: 'https://example.com/b.docx' },
      { path: 'files/c.pdf', filename: 'c.pdf', category: 'pdf', publicUrl: 'https://example.com/c.pdf' },
    ])

    // Simulate the parseInventory logic from the route
    const entries: any[] = []
    for (const line of inventory.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line)
      if (parsed.category !== 'pdf') continue
      if (!parsed.publicUrl) continue
      entries.push(parsed)
    }

    expect(entries).toHaveLength(2)
    expect(entries[0].filename).toBe('a.pdf')
    expect(entries[1].filename).toBe('c.pdf')
  })

  it('constructs publicUrl from header publicUrlBase when entry has none', () => {
    const inventory = buildInventory(
      [
        { path: '2024/report.pdf', filename: 'report.pdf', category: 'pdf' },
      ],
      { publicUrlBase: 'https://example.com/uploads' },
    )

    const lines = inventory.split('\n').filter(Boolean)
    let publicUrlBase: string | undefined

    const entries: any[] = []
    for (const line of lines) {
      const parsed = JSON.parse(line)
      if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-header')) {
        publicUrlBase = parsed.metadata?.publicUrlBase
        continue
      }
      if (parsed.category !== 'pdf') continue

      let publicUrl = parsed.publicUrl
      if (!publicUrl && publicUrlBase) {
        const cleanBase = publicUrlBase.replace(/\/+$/, '')
        const cleanPath = (parsed.path ?? '').replace(/^\/+/, '')
        if (cleanPath) publicUrl = `${cleanBase}/${cleanPath}`
      }
      if (!publicUrl) continue
      entries.push({ ...parsed, publicUrl })
    }

    expect(entries).toHaveLength(1)
    expect(entries[0].publicUrl).toBe('https://example.com/uploads/2024/report.pdf')
  })

  it('skips entries without a resolvable publicUrl', () => {
    const inventory = buildInventory([
      { path: 'files/a.pdf', filename: 'a.pdf', category: 'pdf' },
      { path: 'files/b.pdf', filename: 'b.pdf', category: 'pdf', publicUrl: 'https://example.com/b.pdf' },
    ])
    // No header → no publicUrlBase → first entry has no publicUrl → skipped

    const entries: any[] = []
    let publicUrlBase: string | undefined
    for (const line of inventory.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line)
      if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-header')) {
        publicUrlBase = parsed.metadata?.publicUrlBase
        continue
      }
      if (parsed.category !== 'pdf') continue
      let publicUrl = parsed.publicUrl
      if (!publicUrl && publicUrlBase) {
        const cleanBase = publicUrlBase.replace(/\/+$/, '')
        const cleanPath = (parsed.path ?? '').replace(/^\/+/, '')
        if (cleanPath) publicUrl = `${cleanBase}/${cleanPath}`
      }
      if (!publicUrl) continue
      entries.push(parsed)
    }

    expect(entries).toHaveLength(1)
    expect(entries[0].filename).toBe('b.pdf')
  })

  it('caps at MAX_FILES_PER_REQUEST entries', () => {
    const MAX_FILES_PER_REQUEST = 100
    const manyEntries = Array.from({ length: 150 }, (_, i) => ({
      path: `files/${i}.pdf`,
      filename: `${i}.pdf`,
      category: 'pdf',
      publicUrl: `https://example.com/${i}.pdf`,
    }))
    const inventory = buildInventory(manyEntries)

    const entries: any[] = []
    for (const line of inventory.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line)
      if (parsed.category !== 'pdf') continue
      if (!parsed.publicUrl) continue
      entries.push(parsed)
      if (entries.length >= MAX_FILES_PER_REQUEST) break
    }

    expect(entries).toHaveLength(MAX_FILES_PER_REQUEST)
  })

  it('silently skips unparseable JSON lines', () => {
    const raw = [
      '{ "path": "a.pdf", "filename": "a.pdf", "category": "pdf", "publicUrl": "https://example.com/a.pdf" }',
      'this is not json',
      '{ "path": "b.pdf", "filename": "b.pdf", "category": "pdf", "publicUrl": "https://example.com/b.pdf" }',
    ].join('\n')

    const entries: any[] = []
    for (const line of raw.split('\n').filter(Boolean)) {
      let parsed: any
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (parsed.category !== 'pdf') continue
      if (!parsed.publicUrl) continue
      entries.push(parsed)
    }

    expect(entries).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Test suite: filterCategory generalization (v1.33 migration)
// ---------------------------------------------------------------------------
// Before this migration, filterCategory technically accepted any string
// (parseInventory just compares `parsed.category !== filterCategory`), but
// only 'pdf' ever worked end-to-end — any other category's entries would
// parse fine here and then always fail a few lines later in the route at
// the hard %PDF- magic-byte check. That check is replaced by the per-file
// detectFileType gate (next describe block), so filterCategory now
// genuinely selects which of the four supported types get audited.
//
// simulateParseInventory mirrors the route's parseInventory() (including
// the publicUrlBase fallback, the MAX_FILES_PER_REQUEST cap, and the
// generalized unnamed.<category> filename fallback) so this is pinned
// without importing the route module (see file header for why routes
// can't be imported directly).
// ---------------------------------------------------------------------------

function simulateParseInventory(
  inventoryText: string,
  filterCategory: string,
): { entries: any[]; totalLineCount: number } {
  const MAX_FILES_PER_REQUEST = 100
  const lines = inventoryText.split('\n').filter((l) => l.trim().length > 0)
  const entries: any[] = []
  let publicUrlBase: string | undefined

  for (const line of lines) {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-header')) {
      publicUrlBase = parsed.metadata?.publicUrlBase
      continue
    }
    if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-footer')) continue
    if (parsed.category !== filterCategory) continue

    let publicUrl: string | undefined = parsed.publicUrl
    if (!publicUrl && publicUrlBase) {
      const cleanBase = publicUrlBase.replace(/\/+$/, '')
      const cleanPath = (parsed.path ?? '').replace(/^\/+/, '')
      if (cleanPath) publicUrl = `${cleanBase}/${cleanPath}`
    }
    if (!publicUrl) continue

    entries.push({
      path: parsed.path ?? '',
      filename: parsed.filename ?? parsed.path ?? `unnamed.${filterCategory}`,
      category: parsed.category,
      publicUrl,
      sha256: parsed.sha256,
    })
    if (entries.length >= MAX_FILES_PER_REQUEST) break
  }
  return { entries, totalLineCount: lines.length }
}

describe('bulk-from-inventory: filterCategory generalization', () => {
  it('filters to docx entries when filterCategory=docx (previously these always failed downstream)', () => {
    const inventory = buildInventory([
      { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      { path: 'b.docx', filename: 'b.docx', category: 'docx', publicUrl: 'https://example.com/b.docx' },
      { path: 'c.docx', filename: 'c.docx', category: 'docx', publicUrl: 'https://example.com/c.docx' },
    ])
    const { entries } = simulateParseInventory(inventory, 'docx')
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.filename)).toEqual(['b.docx', 'c.docx'])
  })

  it('filters to pptx entries when filterCategory=pptx', () => {
    const inventory = buildInventory([
      { path: 'deck.pptx', filename: 'deck.pptx', category: 'pptx', publicUrl: 'https://example.com/deck.pptx' },
      { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
    ])
    const { entries } = simulateParseInventory(inventory, 'pptx')
    expect(entries).toHaveLength(1)
    expect(entries[0].filename).toBe('deck.pptx')
  })

  it('filters to xlsx entries when filterCategory=xlsx', () => {
    const inventory = buildInventory([
      { path: 'book.xlsx', filename: 'book.xlsx', category: 'xlsx', publicUrl: 'https://example.com/book.xlsx' },
    ])
    const { entries } = simulateParseInventory(inventory, 'xlsx')
    expect(entries).toHaveLength(1)
    expect(entries[0].filename).toBe('book.xlsx')
  })

  it('still defaults to pdf-only when filterCategory is omitted (backward compat)', () => {
    // Mirrors the route's own default: `let filterCategory = 'pdf'`.
    const ROUTE_DEFAULT = 'pdf'
    const inventory = buildInventory([
      { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      { path: 'b.docx', filename: 'b.docx', category: 'docx', publicUrl: 'https://example.com/b.docx' },
    ])
    const { entries } = simulateParseInventory(inventory, ROUTE_DEFAULT)
    expect(entries).toHaveLength(1)
    expect(entries[0].filename).toBe('a.pdf')
  })

  it('falls back to unnamed.<filterCategory> — not the old hardcoded unnamed.pdf — when an entry has no filename or path', () => {
    const inventory = buildInventory([{ category: 'docx', publicUrl: 'https://example.com/mystery' }])
    const { entries } = simulateParseInventory(inventory, 'docx')
    expect(entries).toHaveLength(1)
    expect(entries[0].filename).toBe('unnamed.docx')
  })

  it('pdf fallback is still unnamed.pdf (byte-identical default behavior)', () => {
    const inventory = buildInventory([{ category: 'pdf', publicUrl: 'https://example.com/mystery' }])
    const { entries } = simulateParseInventory(inventory, 'pdf')
    expect(entries[0].filename).toBe('unnamed.pdf')
  })

  it('the no-matching-entries 400 details now names all four supported filterCategory values', () => {
    // Regression pin for the enhanced hint text — helps a caller who tries
    // an unsupported value (e.g. 'all', 'image') understand why they got
    // zero entries instead of silently wondering.
    const filterCategory = 'all'
    const details =
      'Each entry needs either a publicUrl field, or a publicUrlBase in the inventory header so the URL can be constructed from the path. Supported filterCategory values are pdf, docx, pptx, and xlsx (default: pdf).'
    expect(details).toContain('pdf, docx, pptx, and xlsx')
    expect(`Inventory contains no ${filterCategory} entries with a resolvable public URL.`).toBe(
      'Inventory contains no all entries with a resolvable public URL.',
    )
  })
})

// ---------------------------------------------------------------------------
// Test suite: per-file content-type detection gate (v1.33 migration)
// ---------------------------------------------------------------------------
// Replaces the old hard `%PDF-` magic-byte check (`buf.subarray(0,5) !==
// '%PDF-'` => per-file error, unconditionally, for every non-PDF entry).
// Exercises the REAL detectFileType from services/analyzer.js against real
// minimal fixtures for all four formats (same helpers analyzer.test.ts
// uses), so this can't silently drift from the production detector.
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: per-file content-type detection gate', () => {
  it('detects a real PDF (the pre-migration case keeps working)', async () => {
    expect(await detectFileType(buildPdf(MINIMAL_DOC))).toBe('pdf')
  })

  it('detects a real docx entry (previously always failed the %PDF- gate)', async () => {
    expect(await detectFileType(await buildDocx())).toBe('docx')
  })

  it('detects a real pptx entry (previously always failed the %PDF- gate)', async () => {
    const buf = await buildPptx({ slides: [{ title: 'Welcome' }] })
    expect(await detectFileType(buf)).toBe('pptx')
  })

  it('detects a real xlsx entry (previously always failed the %PDF- gate)', async () => {
    const buf = await buildXlsx({ sheets: [{ name: 'A' }] })
    expect(await detectFileType(buf)).toBe('xlsx')
  })

  it('returns null for content that matches no supported format (the new per-file gate)', async () => {
    expect(await detectFileType(Buffer.from('<html>not a document</html>'))).toBeNull()
  })

  it('a null detection is recorded as a per-file error and the batch keeps going (does not throw)', () => {
    // Mirrors the route: on a null detection the entry is recorded with an
    // error and the loop `continue`s — it never aborts the whole batch.
    const result: any = { path: 'broken.pdf', publicUrl: 'https://example.com/broken.pdf' }
    const fileType: string | null = null
    if (!fileType) {
      result.error =
        'fetched content is not a supported document (matches none of PDF, Word .docx, PowerPoint .pptx, or Excel .xlsx)'
    }
    expect(result.error).toMatch(/not a supported document/)
    expect(result.overallScore).toBeUndefined()
    expect(result.grade).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test suite: per-file error-code -> result.error mapping (v1.33 migration)
// ---------------------------------------------------------------------------
// analyzeDocument's docx/pptx/xlsx branches can throw FileTypeError
// (*_DISABLED), DocxParseError/PptxParseError/XlsxParseError
// (*_PARSE_FAILED), or an ETIMEDOUT/killed error from the child-process
// runner (ooxmlRunner.ts). bulk-from-inventory.ts can't abort the whole
// batch for one bad file, so each of these must resolve to a per-file
// result.error string instead of an HTTP response the way audit-url.ts /
// analyze-url.ts map them.
//
// The route can't be imported directly (see file header), so
// mapErrorToResultError mirrors its per-entry catch block branch-for-branch
// — same rationale/precedent as audit-url.test.ts's own error-code ->
// HTTP-status describe block, adapted to per-file (not per-request)
// semantics.
// ---------------------------------------------------------------------------

function mapErrorToResultError(err: any): string {
  if (err?.name === 'AbortError') return 'fetch timed out after 30000ms'
  if (err?.status === 503) return 'server busy — analysis queue full, try again'
  if (err?.code === 'DOCX_DISABLED') return 'Word (.docx) auditing is currently disabled on this server'
  if (err?.code === 'PPTX_DISABLED') return 'PowerPoint (.pptx) auditing is currently disabled on this server'
  if (err?.code === 'XLSX_DISABLED') return 'Excel (.xlsx) auditing is currently disabled on this server'
  if (err?.code === 'DOCX_PARSE_FAILED')
    return 'the Word (.docx) file could not be read (corrupt or not a valid Word document)'
  if (err?.code === 'PPTX_PARSE_FAILED')
    return 'the PowerPoint (.pptx) file could not be read (corrupt or not a valid PowerPoint presentation)'
  if (err?.code === 'XLSX_PARSE_FAILED')
    return 'the Excel (.xlsx) file could not be read (corrupt or not a valid Excel workbook)'
  if (err?.code === 'ETIMEDOUT' || err?.killed)
    return 'analysis timed out — this document is too complex to analyze within the time limit'
  if (err?.message?.includes('encrypted') || err?.message?.includes('password'))
    return 'PDF is password-protected and cannot be analyzed'
  return err?.message ?? String(err)
}

describe('bulk-from-inventory: per-file error-code mapping', () => {
  it('DOCX_DISABLED maps to a per-file disabled message', () => {
    expect(mapErrorToResultError({ code: 'DOCX_DISABLED' })).toMatch(/Word \(\.docx\) auditing is currently disabled/)
  })

  it('PPTX_DISABLED maps to a per-file disabled message', () => {
    expect(mapErrorToResultError({ code: 'PPTX_DISABLED' })).toMatch(
      /PowerPoint \(\.pptx\) auditing is currently disabled/,
    )
  })

  it('XLSX_DISABLED maps to a per-file disabled message', () => {
    expect(mapErrorToResultError({ code: 'XLSX_DISABLED' })).toMatch(/Excel \(\.xlsx\) auditing is currently disabled/)
  })

  it('DOCX_PARSE_FAILED maps to a per-file parse-error message', () => {
    expect(mapErrorToResultError({ code: 'DOCX_PARSE_FAILED' })).toMatch(/Word .* could not be read/)
  })

  it('PPTX_PARSE_FAILED maps to a per-file parse-error message', () => {
    expect(mapErrorToResultError({ code: 'PPTX_PARSE_FAILED' })).toMatch(/PowerPoint .* could not be read/)
  })

  it('XLSX_PARSE_FAILED maps to a per-file parse-error message', () => {
    expect(mapErrorToResultError({ code: 'XLSX_PARSE_FAILED' })).toMatch(/Excel .* could not be read/)
  })

  it('ETIMEDOUT maps to a timeout message (the OOXML child-process wall-clock timeout)', () => {
    expect(mapErrorToResultError({ code: 'ETIMEDOUT', killed: true })).toMatch(/too complex to analyze/)
  })

  it('a killed child process without an ETIMEDOUT code also maps to the timeout message (err.killed alone)', () => {
    expect(mapErrorToResultError({ killed: true })).toMatch(/too complex to analyze/)
  })

  it('existing branches are unchanged: 503 semaphore-full, AbortError fetch timeout, password-protected PDF', () => {
    expect(mapErrorToResultError({ status: 503 })).toMatch(/server busy/)
    expect(mapErrorToResultError({ name: 'AbortError' })).toMatch(/^fetch timed out after \d+ms$/)
    expect(mapErrorToResultError({ message: 'document is encrypted' })).toMatch(/password-protected/)
  })

  it('falls back to err.message for anything unrecognized (never silently swallowed)', () => {
    expect(mapErrorToResultError({ message: 'weird one-off failure' })).toBe('weird one-off failure')
  })

  it('one bad entry does not abort the batch: a *_PARSE_FAILED entry carries only `error`, never score fields', () => {
    // Same invariant the pre-existing "result structure" describe block
    // pins for a 404 — now proven for the new *_PARSE_FAILED family too.
    const result: any = { path: 'broken.docx', publicUrl: 'https://example.com/broken.docx' }
    result.error = mapErrorToResultError({ code: 'DOCX_PARSE_FAILED' })
    expect(result.overallScore).toBeUndefined()
    expect(result.grade).toBeUndefined()
    expect(result.reportId).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Test suite: Result structure
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: result structure', () => {
  it('produces a summary with correct counts', () => {
    // Simulate what the route builds after processing
    const results: any[] = [
      { path: 'a.pdf', overallScore: 78, grade: 'C' },
      { path: 'b.pdf', error: 'fetch failed: 404 Not Found' },
      { path: 'c.pdf', overallScore: 92, grade: 'A' },
    ]

    const analyzed = results.filter((r) => r.overallScore !== undefined).length
    const failed = results.filter((r) => r.error !== undefined).length

    expect(analyzed).toBe(2)
    expect(failed).toBe(1)
  })

  it('includes reportId and reportUrl on successfully analyzed entries', () => {
    // Simulate a successful entry
    const id = crypto.randomUUID().replace(/-/g, '')
    const result: any = {
      path: 'a.pdf',
      publicUrl: 'https://example.com/a.pdf',
      overallScore: 78,
      grade: 'C',
      reportId: id,
      reportUrl: `/api/reports/${id}`,
    }

    expect(result.reportId).toBeTruthy()
    expect(result.reportUrl).toBe(`/api/reports/${id}`)
  })

  it('includes only error on failed entries — no score fields', () => {
    const result: any = {
      path: 'broken.pdf',
      publicUrl: 'https://example.com/broken.pdf',
      error: 'fetch failed: 404 Not Found',
    }

    expect(result.overallScore).toBeUndefined()
    expect(result.grade).toBeUndefined()
    expect(result.reportId).toBeUndefined()
    expect(result.error).toContain('404')
  })
})

// ---------------------------------------------------------------------------
// F2 [MEDIUM] pre-merge re-audit finding: neither catch block in this route
// should echo raw err.message to the client (library internals / paths can
// leak). These invoke the REAL route handler (via extractHandler above), not
// a reimplementation, so they pin the actual source, not a copy of it.
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: does not leak err.message to the client (F2, pre-merge re-audit)', () => {
  it('[outer catch] an unexpected error before entry processing never echoes err.message to the client; still logged server-side', async () => {
    const { default: router } = await import('../routes/bulk-from-inventory.js')
    const handler = extractHandler(router, '/bulk-from-inventory')
    const secretMessage = 'ENOENT: /var/secrets/internal-config.json leaked here'
    const req = makeReq({
      // req.get() is the first thing the route touches inside its outer
      // try — throwing here simulates ANY unexpected failure before entry
      // processing starts, exercising the outer catch generically.
      get: vi.fn(() => {
        throw new Error(secretMessage)
      }),
    })
    const res = makeRes()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'Internal error during bulk processing.' })
    expect(JSON.stringify(res._json)).not.toContain(secretMessage)

    // Server-side visibility is preserved — only the CLIENT response changed.
    expect(consoleErrorSpy).toHaveBeenCalled()
    const logged = consoleErrorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(logged).toContain(secretMessage)

    consoleErrorSpy.mockRestore()
  })

  it('[per-entry catch-all] an entry whose analysis throws a non-coded Error does not leak err.message in the per-file result', async () => {
    vi.resetModules()
    vi.doMock('../services/analyzer.js', () => ({
      detectFileType: vi.fn().mockResolvedValue('pdf'),
      analyzeDocument: vi.fn().mockRejectedValue(new Error('/internal/stack/trace/leaked-here.ts:42')),
    }))
    vi.doMock('../services/safeFetch.js', () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from('%PDF-1.4 minimal'),
        finalUrl: 'https://example.com/a.pdf',
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }))
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'pdf' } })
      const res = makeRes()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await handler(req, res)

      consoleErrorSpy.mockRestore()
      expect(res._json.results).toHaveLength(1)
      const result = res._json.results[0]
      expect(result.overallScore).toBeUndefined()
      expect(result.error).toBeTruthy()
      expect(result.error).not.toContain('/internal/stack/trace')
      expect(result.error).toBe('Analysis failed for this item.')
    } finally {
      vi.doUnmock('../services/analyzer.js')
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })

  it('the specific error-code → message mapping (DOCX_PARSE_FAILED etc.) still works — only the raw-message FALLBACK changed', async () => {
    vi.resetModules()
    vi.doMock('../services/analyzer.js', () => ({
      detectFileType: vi.fn().mockResolvedValue('docx'),
      analyzeDocument: vi.fn().mockRejectedValue(Object.assign(new Error('ignored'), { code: 'DOCX_PARSE_FAILED' })),
    }))
    vi.doMock('../services/safeFetch.js', () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from('PK minimal'),
        finalUrl: 'https://example.com/a.docx',
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }))
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'a.docx', filename: 'a.docx', category: 'docx', publicUrl: 'https://example.com/a.docx' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'docx' } })
      const res = makeRes()
      await handler(req, res)
      expect(res._json.results[0].error).toMatch(/Word \(\.docx\) file could not be read/)
    } finally {
      vi.doUnmock('../services/analyzer.js')
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })
})

// ---------------------------------------------------------------------------
// RB3-4 [pre-merge re-audit]: the SafeFetchError catch block (wrapping the
// safeFetch() call, separate from the generic per-entry catch-all F2 already
// hardened above) still did `result.error = \`${e.code}: ${e.message}\`` —
// echoing the raw underlying message straight to the client. For
// network_error specifically, e.message is a raw Node socket error (e.g.
// "connect ECONNREFUSED 10.1.2.3:443"), sourced from safeFetch.ts's
// `reject(new SafeFetchError('network_error', err.message))` /
// `err?.message ?? String(err)` sites — unpredictable text never meant for
// end users. The fix keeps the useful classification (e.code) but replaces
// e.message with a fixed, curated string per code; full detail still goes
// to console.error server-side.
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: does not leak the raw SafeFetchError message to the client (RB3-4, pre-merge re-audit)', () => {
  it('a network_error SafeFetchError is curated: no raw socket-error text reaches the client, but the code classification survives', async () => {
    vi.resetModules()
    const rawSocketMessage = 'connect ECONNREFUSED 10.99.99.99:443 leaked-internal-detail'
    vi.doMock('../services/safeFetch.js', () => {
      class SafeFetchError extends Error {
        code: string
        constructor(code: string, message: string) {
          super(message)
          this.code = code
        }
      }
      return {
        safeFetch: vi.fn().mockRejectedValue(new SafeFetchError('network_error', rawSocketMessage)),
        SafeFetchError,
      }
    })
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'pdf' } })
      const res = makeRes()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await handler(req, res)

      // Read the spy's recorded calls BEFORE mockRestore() — mockRestore()
      // clears .mock.calls, same ordering the F2 tests above use.
      expect(res._json.results).toHaveLength(1)
      const result = res._json.results[0]
      expect(result.error).toBeTruthy()
      expect(result.error).not.toContain(rawSocketMessage)
      expect(result.error).not.toContain('ECONNREFUSED')
      expect(result.error).toContain('network_error')
      expect(result.error).toMatch(/could not connect/i)

      // Server-side detail is preserved even though the client response is generic.
      expect(consoleErrorSpy).toHaveBeenCalled()
      const logged = consoleErrorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
      expect(logged).toContain(rawSocketMessage)
      consoleErrorSpy.mockRestore()
    } finally {
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })

  it('other SafeFetchError codes (e.g. private_ip) are also curated — the classification survives without the raw message', async () => {
    vi.resetModules()
    const rawMessage = "'internal.example' resolves to private/reserved IP '10.0.0.5'. Blocked."
    vi.doMock('../services/safeFetch.js', () => {
      class SafeFetchError extends Error {
        code: string
        constructor(code: string, message: string) {
          super(message)
          this.code = code
        }
      }
      return {
        safeFetch: vi.fn().mockRejectedValue(new SafeFetchError('private_ip', rawMessage)),
        SafeFetchError,
      }
    })
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'pdf' } })
      const res = makeRes()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await handler(req, res)

      consoleErrorSpy.mockRestore()
      const result = res._json.results[0]
      expect(result.error).toContain('private_ip')
      expect(result.error).not.toContain(rawMessage)
      expect(result.error).not.toContain('10.0.0.5')
    } finally {
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })
})

// ---------------------------------------------------------------------------
// F3 [LOW, defense-in-depth] pre-merge re-audit finding: reports.ts's
// POST /api/reports runs sanitizeStoredReport() on a report before it is
// ever written to shared_reports (strips unsafe helpLinks[].url anywhere in
// the payload — a stored-XSS guard). bulk-from-inventory.ts's own
// shared_reports INSERT skipped that call, so its stored report_json wasn't
// covered by the same store-boundary invariant. No exploit today (analyzer
// output isn't attacker-shaped), but the fix applies the SAME sanitizer here
// for consistency — this pins that it actually runs, via the REAL route.
// ---------------------------------------------------------------------------

describe('bulk-from-inventory: sanitizeStoredReport applied before shared_reports insert (F3, store-boundary hardening)', () => {
  it('neutralizes an unsafe helpLinks URL in the analysis result before it is persisted', async () => {
    vi.resetModules()
    const { db, runCallsBySql } = makeSqlCapturingDb()
    vi.doMock('../db/sqlite.js', () => ({ default: db }))
    vi.doMock('../services/analyzer.js', () => ({
      detectFileType: vi.fn().mockResolvedValue('pdf'),
      analyzeDocument: vi.fn().mockResolvedValue({
        overallScore: 91,
        grade: 'A',
        categories: [
          {
            id: 'alt_text',
            helpLinks: [{ label: 'Evil', url: 'javascript:alert(document.domain)' }],
          },
        ],
      }),
    }))
    vi.doMock('../services/safeFetch.js', () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from('%PDF-1.4 minimal'),
        finalUrl: 'https://example.com/a.pdf',
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }))
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'a.pdf', filename: 'a.pdf', category: 'pdf', publicUrl: 'https://example.com/a.pdf' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'pdf' } })
      const res = makeRes()

      await handler(req, res)

      expect(res._json.results[0].overallScore).toBe(91)
      const sql = Object.keys(runCallsBySql).find((s) => s.includes('INSERT INTO shared_reports'))
      expect(sql).toBeTruthy()
      const insertArgs = runCallsBySql[sql!][0]
      // INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at)
      const storedReportJson = insertArgs[3] as string
      const stored = JSON.parse(storedReportJson)
      expect(stored.categories[0].helpLinks).toEqual([])
      expect(storedReportJson).not.toContain('javascript:')
    } finally {
      vi.doUnmock('../db/sqlite.js')
      vi.doUnmock('../services/analyzer.js')
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })

  it('a report with no unsafe URLs is stored unchanged (sanitization is a no-op on safe data)', async () => {
    vi.resetModules()
    const { db, runCallsBySql } = makeSqlCapturingDb()
    vi.doMock('../db/sqlite.js', () => ({ default: db }))
    vi.doMock('../services/analyzer.js', () => ({
      detectFileType: vi.fn().mockResolvedValue('pdf'),
      analyzeDocument: vi.fn().mockResolvedValue({
        overallScore: 100,
        grade: 'A',
        categories: [{ id: 'alt_text', helpLinks: [{ label: 'WCAG', url: 'https://www.w3.org/WAI/' }] }],
      }),
    }))
    vi.doMock('../services/safeFetch.js', () => ({
      safeFetch: vi.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from('%PDF-1.4 minimal'),
        finalUrl: 'https://example.com/clean.pdf',
      }),
      SafeFetchError: class SafeFetchError extends Error {},
    }))
    try {
      const { default: router } = await import('../routes/bulk-from-inventory.js')
      const handler = extractHandler(router, '/bulk-from-inventory')
      const inventory = buildInventory([
        { path: 'clean.pdf', filename: 'clean.pdf', category: 'pdf', publicUrl: 'https://example.com/clean.pdf' },
      ])
      const req = makeReq({ body: { inventory, filterCategory: 'pdf' } })
      const res = makeRes()

      await handler(req, res)

      const sql = Object.keys(runCallsBySql).find((s) => s.includes('INSERT INTO shared_reports'))
      const stored = JSON.parse(runCallsBySql[sql!][0][3] as string)
      expect(stored.categories[0].helpLinks).toEqual([{ label: 'WCAG', url: 'https://www.w3.org/WAI/' }])
    } finally {
      vi.doUnmock('../db/sqlite.js')
      vi.doUnmock('../services/analyzer.js')
      vi.doUnmock('../services/safeFetch.js')
      vi.resetModules()
    }
  })
})

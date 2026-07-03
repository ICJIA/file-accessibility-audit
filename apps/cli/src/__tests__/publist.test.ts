import { describe, it, expect, vi, afterEach } from 'vitest'
import { ANALYSIS } from '#config'
import { downloadFile } from '../commands/publist.js'

// ---------------------------------------------------------------------------
// M3 migration (publist: PDF-only -> all four formats). downloadFile() was
// downloadPdf() before this migration — a plain rename, zero behavior
// change (it was already format-agnostic: fetch + size-cap a URL into a
// Buffer, no PDF-specific logic anywhere in its body). These tests pin that
// the rename didn't change behavior, against a stubbed global fetch — no
// live network I/O. Exported specifically so this seam exists (it wasn't
// exported, or tested, before this migration).
//
// runPublist() itself (the fetch-publications -> download -> analyzeDocument
// -> cache -> write-CSV/HTML orchestration) is not exercised end-to-end
// here: it opens a real better-sqlite3 cache DB under ~/.a11y-audit and
// writes real CSV/HTML files as side effects of *calling* it (importing the
// module is safe — confirmed empirically; analyzeDocument/analyzer.js's
// heavier transitive deps are only touched when their functions actually
// run). Exercising the full orchestration would need mocking
// better-sqlite3 + node:fs + the live GraphQL API all at once for low
// incremental value over graphql.test.ts's extension-filter coverage plus
// this file's coverage of downloadFile (the one function in publist.ts with
// real logic worth pinning); the rest (copy/help text, wiring) is covered
// by `tsc --noEmit` + `pnpm build`, per the task's own guidance for a
// command with no existing test seam or HTTP/GraphQL harness.
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = (ANALYSIS?.MAX_FILE_SIZE_MB ?? 50) * 1024 * 1024

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the response body as a Buffer on 200 OK', async () => {
    const body = new TextEncoder().encode('hello world').buffer
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(body),
      }),
    )

    const result = await downloadFile('https://x/report.docx')

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.toString('utf-8')).toBe('hello world')
  })

  it('throws with the HTTP status on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    )

    await expect(downloadFile('https://x/missing.pptx')).rejects.toThrow('HTTP 404 Not Found')
  })

  it('rejects when the content-length header exceeds the size cap, without reading the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (name: string) => (name === 'content-length' ? String(MAX_FILE_SIZE + 1) : null) },
        arrayBuffer: () => Promise.reject(new Error('should not be read — content-length gate should reject first')),
      }),
    )

    await expect(downloadFile('https://x/huge.xlsx')).rejects.toThrow('File too large')
  })

  it('rejects when the actual body exceeds the size cap even without a content-length header', async () => {
    const oversized = new ArrayBuffer(MAX_FILE_SIZE + 1)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null }, // no content-length — first cap can't fire
        arrayBuffer: () => Promise.resolve(oversized),
      }),
    )

    await expect(downloadFile('https://x/huge.pdf')).rejects.toThrow('File too large')
  })
})

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
// RB2-b [LOW] hardening (2026-07): downloadFile used to buffer the FULL
// response body via `resp.arrayBuffer()` and only check the size cap
// afterward — a server that omits or lies about Content-Length could stream
// unbounded bytes into memory before the check ever fired. It now reads the
// body as a stream via `resp.body.getReader()` and aborts (cancels the
// reader) the instant cumulative bytes exceed the cap, mirroring the web
// API's safeFetch.ts streaming-cap intent without importing server code.
// The tests below use a synthetic Response.body (a getReader()-shaped
// object backed by a fixed chunk list) instead of a real ReadableStream —
// enough to exercise downloadFile's reader-consumption loop without a real
// network stack, and lets the "stops early" test assert on read()/cancel()
// call counts directly.
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

/**
 * A synthetic `Response.body` stand-in: a getReader()-shaped object backed
 * by a fixed list of chunks, with `read`/`cancel` spies exposed on the
 * returned object so tests can assert on call counts directly (a real
 * ReadableStream's internal call counts aren't observable from outside).
 */
function makeMockBody(chunks: Uint8Array[]) {
  let i = 0
  const read = vi.fn(async () => {
    if (i < chunks.length) {
      return { done: false, value: chunks[i++] }
    }
    return { done: true, value: undefined }
  })
  const cancel = vi.fn(async () => {})
  return {
    getReader: () => ({ read, cancel }),
    _read: read,
    _cancel: cancel,
  }
}

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the streamed response body as a Buffer on 200 OK', async () => {
    const body = makeMockBody([new TextEncoder().encode('hello world')])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        body,
      }),
    )

    const result = await downloadFile('https://x/report.docx')

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.toString('utf-8')).toBe('hello world')
  })

  it('reassembles a Buffer correctly across multiple small chunks', async () => {
    const body = makeMockBody([
      new TextEncoder().encode('hello '),
      new TextEncoder().encode('accessible '),
      new TextEncoder().encode('world'),
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        body,
      }),
    )

    const result = await downloadFile('https://x/chunked.xlsx')

    expect(result.toString('utf-8')).toBe('hello accessible world')
  })

  it('throws with the HTTP status on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
      }),
    )

    await expect(downloadFile('https://x/missing.pptx')).rejects.toThrow('HTTP 404 Not Found')
  })

  it('rejects when the content-length header exceeds the size cap, without ever touching the body', async () => {
    let bodyAccessed = false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (name: string) => (name === 'content-length' ? String(MAX_FILE_SIZE + 1) : null) },
        get body() {
          bodyAccessed = true
          throw new Error('should not be read — content-length gate should reject first')
        },
      }),
    )

    await expect(downloadFile('https://x/huge.xlsx')).rejects.toThrow('File too large')
    expect(bodyAccessed).toBe(false)
  })

  it('rejects once a single oversized chunk exceeds the cap, even without a content-length header', async () => {
    const body = makeMockBody([new Uint8Array(MAX_FILE_SIZE + 1)])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null }, // no content-length — first cap can't fire
        body,
      }),
    )

    await expect(downloadFile('https://x/huge.pdf')).rejects.toThrow('File too large')
  })

  it('stops reading once cumulative streamed bytes exceed the cap, WITHOUT buffering an unbounded/misleading body (cancels the reader instead of draining it)', async () => {
    // A body that, if fully drained, would be well over 3x the cap —
    // simulating a server that omits (or lies about) Content-Length while
    // streaming unbounded bytes. The pre-fix implementation buffered the
    // FULL body via resp.arrayBuffer() before ever checking the size, which
    // would read every one of these chunks; the fix must stop partway
    // through instead.
    const chunkSize = Math.ceil(MAX_FILE_SIZE / 3)
    const totalChunksIfFullyDrained = 10
    const chunks = Array.from({ length: totalChunksIfFullyDrained }, () => new Uint8Array(chunkSize))
    const body = makeMockBody(chunks)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        body,
      }),
    )

    await expect(downloadFile('https://x/unbounded-stream.pdf')).rejects.toThrow('File too large')

    // Stopped early: far fewer reads than the full chunk list would require.
    expect(body._read.mock.calls.length).toBeLessThan(totalChunksIfFullyDrained)
    // The stream was explicitly cancelled rather than drained to completion.
    expect(body._cancel).toHaveBeenCalled()
  })
})

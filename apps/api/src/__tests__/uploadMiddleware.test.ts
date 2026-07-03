import { describe, it, expect } from 'vitest'
import {
  uploadFileFilter,
  acceptedFormatsMessage,
} from '../middleware/uploadMiddleware.js'

// ---------------------------------------------------------------------------
// Unit tests for the multer upload gate (first-pass mimetype/extension check).
// ---------------------------------------------------------------------------
// uploadFileFilter is the exported pure decision function that multer's
// fileFilter delegates to, so these tests drive it directly with fake file
// objects and a callback recorder — no HTTP / multer harness needed.
//
// Feature flags: the test env leaves DOCX_ENABLED / PPTX_ENABLED unset, so
// both are ON here. The off-flag rejection-message shapes are pinned via
// acceptedFormatsMessage (the exported list-joiner the filter assembles its
// label list into), which avoids env re-import gymnastics.
// ---------------------------------------------------------------------------

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Runs the filter on a fake file and returns the single callback invocation. */
function runFilter(file: { mimetype: string; originalname: string }) {
  const calls: Array<{ error: Error | null; accept?: boolean }> = []
  uploadFileFilter(undefined, file, (error: Error | null, accept?: boolean) => {
    calls.push({ error, accept })
  })
  expect(calls).toHaveLength(1)
  return calls[0]!
}

describe('uploadFileFilter: accepted types', () => {
  it('accepts application/pdf by mimetype (no extension needed)', () => {
    const r = runFilter({ mimetype: 'application/pdf', originalname: 'report' })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts x.PDF by extension, case-insensitively, regardless of mimetype', () => {
    const r = runFilter({
      mimetype: 'application/octet-stream',
      originalname: 'x.PDF',
    })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts the Word (.docx) MIME type', () => {
    const r = runFilter({ mimetype: DOCX_MIME, originalname: 'report' })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts a .docx extension regardless of mimetype', () => {
    const r = runFilter({
      mimetype: 'application/octet-stream',
      originalname: 'report.docx',
    })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts the PowerPoint (.pptx) MIME type', () => {
    const r = runFilter({ mimetype: PPTX_MIME, originalname: 'deck' })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts a .pptx extension regardless of mimetype', () => {
    const r = runFilter({
      mimetype: 'application/octet-stream',
      originalname: 'deck.pptx',
    })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts the Excel (.xlsx) MIME type', () => {
    const r = runFilter({ mimetype: XLSX_MIME, originalname: 'book' })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })

  it('accepts a .xlsx extension regardless of mimetype', () => {
    const r = runFilter({
      mimetype: 'application/octet-stream',
      originalname: 'book.xlsx',
    })
    expect(r.error).toBeNull()
    expect(r.accept).toBe(true)
  })
})

describe('uploadFileFilter: rejection', () => {
  it('rejects evil.zip with the full accepted-format list (all flags on)', () => {
    const r = runFilter({ mimetype: 'application/zip', originalname: 'evil.zip' })
    expect(r.error).toBeInstanceOf(Error)
    expect(r.error?.message).toBe(
      'Only PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files are accepted',
    )
    expect(r.accept).toBeUndefined()
  })
})

describe('acceptedFormatsMessage: one/two/many label joins', () => {
  it('one label (DOCX and PPTX both off)', () => {
    expect(acceptedFormatsMessage(['PDF'])).toBe('Only PDF files are accepted')
  })

  it('two labels join with "and" (PPTX off)', () => {
    expect(acceptedFormatsMessage(['PDF', 'Word (.docx)'])).toBe(
      'Only PDF and Word (.docx) files are accepted',
    )
  })

  it('three labels join with an Oxford comma (XLSX off)', () => {
    expect(
      acceptedFormatsMessage(['PDF', 'Word (.docx)', 'PowerPoint (.pptx)']),
    ).toBe('Only PDF, Word (.docx), and PowerPoint (.pptx) files are accepted')
  })

  it('four labels join with an Oxford comma (all flags on)', () => {
    expect(
      acceptedFormatsMessage([
        'PDF',
        'Word (.docx)',
        'PowerPoint (.pptx)',
        'Excel (.xlsx)',
      ]),
    ).toBe(
      'Only PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) files are accepted',
    )
  })
})

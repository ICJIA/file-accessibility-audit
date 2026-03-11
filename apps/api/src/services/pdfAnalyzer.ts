import { analyzeWithQpdf } from './qpdfService.js'
import { analyzeWithPdfjs, PdfMetadata } from './pdfjsService.js'
import { scoreDocument, ScoringResult } from './scorer.js'
import { ANALYSIS } from '#config'

// Simple semaphore for concurrency limiting with timeout
const SEMAPHORE_TIMEOUT_MS = 60_000 // 60 seconds max wait
let activeAnalyses = 0
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = []

async function acquireSemaphore(): Promise<void> {
  if (activeAnalyses < ANALYSIS.MAX_CONCURRENT_ANALYSES) {
    activeAnalyses++
    return
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject }
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry)
      if (idx >= 0) waitQueue.splice(idx, 1)
      reject(Object.assign(new Error('Server busy — too many analyses queued. Please try again shortly.'), { status: 503 }))
    }, SEMAPHORE_TIMEOUT_MS)
    entry.resolve = () => { clearTimeout(timer); resolve() }
    waitQueue.push(entry)
  })
}

function releaseSemaphore(): void {
  activeAnalyses--
  const next = waitQueue.shift()
  if (next) {
    activeAnalyses++
    next.resolve()
  }
}

export interface AnalysisResult extends ScoringResult {
  filename: string
  pageCount: number
  fileType: 'pdf'
  pdfMetadata: PdfMetadata
}

export async function analyzePDF(buffer: Buffer, filename: string): Promise<AnalysisResult> {
  await acquireSemaphore()

  try {
    // Run QPDF and pdfjs-dist in parallel
    const [qpdfResult, pdfjsResult] = await Promise.all([
      Promise.resolve(analyzeWithQpdf(buffer)),
      analyzeWithPdfjs(buffer),
    ])

    // Score the document
    const scoringResult = scoreDocument(qpdfResult, pdfjsResult)

    return {
      filename,
      pageCount: pdfjsResult.pageCount,
      fileType: 'pdf',
      pdfMetadata: pdfjsResult.metadata,
      ...scoringResult,
    }
  } finally {
    releaseSemaphore()
  }
}

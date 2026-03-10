import { analyzeWithQpdf } from './qpdfService.js'
import { analyzeWithPdfjs, PdfMetadata } from './pdfjsService.js'
import { scoreDocument, ScoringResult } from './scorer.js'
import { ANALYSIS } from '#config'

// Simple semaphore for concurrency limiting
let activeAnalyses = 0
const waitQueue: Array<() => void> = []

async function acquireSemaphore(): Promise<void> {
  if (activeAnalyses < ANALYSIS.MAX_CONCURRENT_ANALYSES) {
    activeAnalyses++
    return
  }
  return new Promise(resolve => {
    waitQueue.push(resolve)
  })
}

function releaseSemaphore(): void {
  activeAnalyses--
  const next = waitQueue.shift()
  if (next) {
    activeAnalyses++
    next()
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

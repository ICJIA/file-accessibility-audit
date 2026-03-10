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

export async function analyzePDF(
  buffer: Buffer,
  filename: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: { stage: string; percent: number }) => void
  },
): Promise<AnalysisResult> {
  await acquireSemaphore()

  try {
    options?.onProgress?.({ stage: 'Inspecting PDF structure', percent: 10 })
    const qpdfResult = await analyzeWithQpdf(buffer, { signal: options?.signal })

    if (options?.signal?.aborted) {
      const error = new Error('Analysis cancelled') as any
      error.aborted = true
      throw error
    }

    options?.onProgress?.({ stage: 'Extracting text and metadata', percent: 20 })
    const pdfjsResult = await analyzeWithPdfjs(buffer, {
      signal: options?.signal,
      onProgress(progress) {
        const scaled = 20 + Math.round(progress.percent * 0.65)
        options?.onProgress?.({
          stage: progress.stage,
          percent: Math.min(85, scaled),
        })
      },
    })

    // Score the document
    options?.onProgress?.({ stage: 'Scoring accessibility findings', percent: 92 })
    const scoringResult = scoreDocument(qpdfResult, pdfjsResult)
    options?.onProgress?.({ stage: 'Finalizing report', percent: 100 })

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

/**
 * Public entry point for the @file-audit/analyzer engine.
 *
 * Surfaces the document analyze/score pipeline: `analyzeDocument` (the
 * content-sniffing dispatcher for PDF/DOCX/PPTX/XLSX), the PDF-specific
 * `analyzePDF`, `detectFileType`, and the per-format scorers + their result
 * types. Consumed directly by apps/cli; apps/api reaches the same code through
 * thin re-export shims at the historical `src/services/*` paths, so this index
 * is additive (nothing in api imports from it today).
 *
 * Individual modules remain importable by subpath (e.g.
 * `@file-audit/analyzer/qpdfService`) via the package's `exports` wildcard —
 * that is what the api shims re-export from.
 */
export {
  analyzeDocument,
  detectFileType,
  FileTypeError,
  type DetectedFileType,
} from "./analyzer.js";
export {
  analyzePDF,
  acquireSemaphore,
  releaseSemaphore,
  type AnalysisResult,
} from "./pdfAnalyzer.js";
export {
  scoreDocument,
  scoreDocx,
  scorePptx,
  scoreXlsx,
  type CategoryResult,
  type HelpLink,
  type WcagCriterion,
  type ScoreProfileResult,
  type ScoringMode,
  type PdfUaSignals,
  type ScoringResult,
} from "./scorer.js";

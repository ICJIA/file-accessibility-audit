/**
 * Report-payload types — moved verbatim from apps/api/src/services/scorer.ts
 * so the web app can type API responses with the REAL shapes instead of
 * hand-kept partial copies (which had drifted). scorer.ts re-exports these,
 * so the CLI's `import { CategoryResult } from '.../scorer.js'` and every
 * internal API import keep working unchanged.
 */
import type { ScoringMode } from "./scoring.js";

export interface HelpLink {
  label: string;
  url: string;
}

export interface WcagCriterion {
  /** WCAG 2.1 success criterion number, e.g. "1.3.1". */
  sc: string;
  /** Success criterion name. */
  name: string;
  level: "A" | "AA";
}

export interface CategoryResult {
  id: string;
  label: string;
  weight: number;
  score: number | null; // null = N/A — see `notAssessed` to disambiguate
  grade: string | null;
  severity: string | null;
  findings: string[];
  explanation: string;
  helpLinks: HelpLink[];
  /**
   * Disambiguates a null `score`. When false/undefined, a null score means
   * "not applicable" — the document genuinely has no tables / forms / images
   * / etc. When true, it means "not assessed" — the tool does not or could
   * not evaluate this category (color contrast; reading order when the
   * rigorous check had insufficient data; alt text when images are present
   * but untagged). Surfaced as distinct states in the UI.
   */
  notAssessed?: boolean;
  /** WCAG 2.1 success criteria this category maps to (see WCAG_CATEGORY_MAP). */
  wcagCriteria?: WcagCriterion[];
}

export interface ScoreProfileResult {
  mode: ScoringMode;
  label: string;
  description: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores: Record<string, number | null>;
  categories: CategoryResult[];
  // For auditing transparency. On Practical, `rawOverallScore` is the
  // unfloored weighted average; `flooredToStrict` is true when that raw
  // number was lifted up to Strict's score to maintain the Strict ≤
  // Practical invariant. On Strict, these mirror `overallScore` and
  // `false`. Always present post-v1.15.0 so auditors can reconstruct
  // the pre-floor math when needed.
  rawOverallScore?: number;
  flooredToStrict?: boolean;
}

/**
 * Report-data-path types (Task F7) — mirror (field-for-field, not imported)
 * the shapes the web app's report views actually consume:
 *  - ConformanceFinding / NotAssessedCriterion / ConformanceVerdict and
 *    PdfUaSignals mirror packages/analyzer/src/scoring/{conformance,common}.ts.
 *  - PdfMetadata / DocxMetadata / PptxMetadata / XlsxMetadata mirror the
 *    per-format metadata interfaces in packages/analyzer/src/{pdfjsService,
 *    docxService,pptxService,xlsxService}.ts.
 *  - AnalysisResult mirrors AnalysisResult in apps/api/src/routes/analyze.ts
 *    (POST /api/analyze's response body, and — via sanitizeStoredReport,
 *    which stores the POSTed report near-verbatim — GET /api/reports/:id's
 *    `report` field too).
 *
 * These are duplicated here rather than imported because the web app does
 * not (and should not) depend on @file-audit/analyzer or the api package;
 * this package is the one already shared by api, web, and cli.
 *
 * `adobeParity` is intentionally omitted from AnalysisResult: it's part of
 * the real API response but is not read by any current report view (only
 * the separate remediation-receipt path surfaces an Adobe-parity summary,
 * typed locally in useRemediationJob.ts).
 */
export interface ConformanceFinding {
  /** WCAG success criterion number, e.g. "1.1.1" (2.1 or 2.2). */
  sc: string;
  /** Success criterion name. */
  name: string;
  level: "A" | "AA";
  /** Related scoring category id, for cross-referencing in the UI. */
  category: string;
  /** Plain-language description of the confirmed violation. */
  issue: string;
  /** Link to the W3C "Understanding" page for this exact criterion. */
  url: string;
}

export interface NotAssessedCriterion {
  sc: string;
  name: string;
  level: "A" | "AA";
  reason: string;
  /** Link to the W3C "Understanding" page for this exact criterion. */
  url: string;
}

export interface ConformanceVerdict {
  /**
   * "fail" — confirmed machine-checkable WCAG violation(s) present.
   * "no-automated-failures" — none found (NOT a conformance guarantee).
   * "incomplete" — an analyzer failed; no verdict could be determined.
   */
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  /**
   * Criteria outside this tool's automated scope — listed so the verdict is
   * never mistaken for a clean bill of health.
   */
  notAssessed: NotAssessedCriterion[];
  /** One-line plain-language verdict. */
  headline: string;
}

export interface PdfUaSignals {
  /** A PDF/UA identifier (pdfuaid:part) is declared in the XMP metadata. */
  hasIdentifier: boolean;
  /** The declared part number, e.g. "1" for PDF/UA-1. */
  part: string | null;
  /** Document has a logical structure tree (StructTreeRoot). */
  isTagged: boolean;
  /** MarkInfo /Marked true — real content is distinguished from artifacts. */
  isMarkedContent: boolean;
  /** Count of /Artifact marked-content runs (headers, footers, page numbers). */
  artifactRunCount: number;
  /** Depth of the structure tree (flat ≈ 1; richly nested ≥ 3). */
  structTreeDepth: number;
  fontCount: number;
  embeddedFontCount: number;
  /** All fonts are embedded (vacuously true when the document has no fonts). */
  allFontsEmbedded: boolean;
  /** A default document language is declared. */
  hasLanguage: boolean;
  /** A document title is present in the metadata. */
  hasTitle: boolean;
}

export interface PdfMetadata {
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  pdfVersion: string | null;
  isEncrypted: boolean;
  keywords: string | null;
  author: string | null;
  subject: string | null;
  pageCount: number;
}

export interface DocxMetadata {
  title: string | null;
  creator: string | null;
  /** Resolved default document language (styles docDefaults, else dc:language). */
  language: string | null;
  pageCount: number | null;
  wordCount: number | null;
}

export interface PptxMetadata {
  title: string | null;
  creator: string | null;
  /** Default run language from the presentation part, else the first master. */
  language: string | null;
  slideCount: number;
}

export interface XlsxMetadata {
  title: string | null;
  creator: string | null;
  sheetCount: number;
}

export type FileType = "pdf" | "docx" | "pptx" | "xlsx";

/** One failed PDF/UA-1 rule from veraPDF (a Matterhorn machine-checkable condition). */
export interface PdfUaRuleFailure {
  ruleId: string;
  clause: string;
  description: string;
  count: number;
}

/**
 * veraPDF PDF/UA-1 (ISO 14289-1) machine-check verdict, surfaced on audits.
 * Machine-checkable conditions only — NOT a claim of full PDF/UA conformance.
 * `available:false` means veraPDF was not configured/installed.
 */
export interface PdfUaVerdict {
  available: boolean;
  passed: boolean;
  profile: string;
  failures: PdfUaRuleFailure[];
  totalFailureCount: number;
  /** Distinct failing rules before the 20-item truncation — the honest "how many kinds of problem" count. Optional: absent on reports saved before this field existed. */
  distinctRuleCount?: number;
  error?: string;
}

/**
 * The full shape returned by POST /api/analyze and (near-verbatim, via
 * sanitizeStoredReport) stored for GET /api/reports/:id. Several fields are
 * typed as optional here even though the live analyzer always populates
 * them, to honestly reflect that a shared report can be older than the
 * field (pre-v1.21 scoreProfiles, pre-multi-format fileType, etc.) — the
 * public /report/:id page renders whatever JSON was actually stored.
 */
export interface AnalysisResult {
  filename: string;
  pageCount: number;
  overallScore: number;
  grade: string;
  isScanned: boolean;
  executiveSummary: string;
  categories: CategoryResult[];
  warnings?: string[];
  fileType?: FileType;
  scoringMode?: ScoringMode;
  scoreProfiles?: Partial<Record<ScoringMode, ScoreProfileResult>>;
  conformance?: ConformanceVerdict;
  /** PDF-only. */
  pdfUa?: PdfUaSignals;
  /** Present only for PDF results. */
  pdfMetadata?: PdfMetadata;
  /** Present only for DOCX results. */
  docxMetadata?: DocxMetadata;
  /** Present only for PPTX results. */
  pptxMetadata?: PptxMetadata;
  /** Present only for XLSX results. */
  xlsxMetadata?: XlsxMetadata;
  /** PDF/UA-1 machine-check verdict (veraPDF). PDF results only; absent when veraPDF isn't configured. */
  pdfUaVerdict?: PdfUaVerdict;
}

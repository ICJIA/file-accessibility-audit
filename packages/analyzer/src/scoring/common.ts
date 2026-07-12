/**
 * Shared scoring types and helpers used by 2+ of the format scorers (PDF,
 * DOCX, PPTX, XLSX): the ScoringResult/PdfUaSignals result shapes, the
 * grade/severity thresholds, the WCAG-criteria annotator, and the
 * weighted-average aggregator. Extracted verbatim from scorer.ts in the
 * v1.34.0 structural split — scorer.ts re-exports ScoringResult/PdfUaSignals
 * from here so no other file's imports need to change.
 */
import {
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  SCORING_PROFILES,
  WCAG_CATEGORY_MAP,
} from "#config";
import type { CategoryResult, ScoreProfileResult, ScoringMode } from "@file-audit/shared";
import type { AdobeParityResult } from "./adobeParity.js";
import type { ConformanceVerdict } from "./conformance.js";
import { generateSummary } from "./summary.js";

// Machine-checkable PDF/UA-1 (ISO 14289-1) signals, summarized for the report's
// "Conformance signals" panel. These are SIGNALS, not a conformance verdict —
// a full PDF/UA-1 validation (the Matterhorn Protocol's failure conditions,
// many requiring human judgment) needs PAC or veraPDF. Sourced from pdfjs (XMP
// + content stream) and qpdf (structure tree, MarkInfo, fonts).
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

export interface ScoringResult {
  overallScore: number;
  grade: string;
  isScanned: boolean;
  executiveSummary: string;
  categories: CategoryResult[];
  warnings: string[];
  scoringMode: ScoringMode;
  scoreProfiles: Record<ScoringMode, ScoreProfileResult>;
  // Adobe Acrobat's built-in Accessibility Checker runs 32 binary rules, most
  // of which pass vacuously on documents with sparse structure. This field
  // mirrors that 32-rule output alongside our verdict so users can reconcile
  // the divergence. NOT an aggregated "Adobe score" — qualitative only.
  // PDF-only: Adobe Acrobat parity report. Optional — omitted for .docx.
  adobeParity?: AdobeParityResult;
  // Binary WCAG 2.1 conformance verdict, computed independently of the
  // weighted score. The score is a prioritised-readiness metric with partial
  // credit; this is the honest pass/fail answer. See conformance.ts.
  conformance: ConformanceVerdict;
  // PDF-only: machine-checkable PDF/UA-1 signals, surfaced as a "conformance
  // signals" panel. Optional — omitted for .docx (no PDF/UA concept applies).
  pdfUa?: PdfUaSignals;
}

export function getGrade(score: number): string {
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return "F";
}

export function getSeverity(score: number | null): string | null {
  if (score === null) return null;
  for (const t of SEVERITY_THRESHOLDS) {
    if (score >= t.min) return t.severity;
  }
  return "Critical";
}

export const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

// Attach the published WCAG 2.1 success-criteria mapping to each category so
// the methodology is auditable per-category and the UI can show it inline.
export function applyWcagCriteria(categories: CategoryResult[]): void {
  for (const category of categories) {
    const criteria = WCAG_CATEGORY_MAP[category.id];
    if (criteria) category.wcagCriteria = criteria.map((c) => ({ ...c }));
  }
}

export function aggregateScore(
  categories: CategoryResult[],
  isScanned: boolean,
  mode: ScoringMode,
  conformance: ConformanceVerdict,
  noun: string = "PDF",
): {
  overallScore: number;
  grade: string;
  executiveSummary: string;
  profile: ScoreProfileResult;
} {
  const applicable = categories.filter((c) => c.score !== null);

  // Straightforward weighted average across all applicable categories.
  const weightedAverage = (cats: CategoryResult[]): number => {
    const totalWeight = cats.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0;
    return Math.round(cats.reduce((sum, c) => sum + c.score! * (c.weight / totalWeight), 0));
  };

  const overallScore = weightedAverage(applicable);

  const grade = getGrade(overallScore);
  const executiveSummary = generateSummary(
    overallScore,
    grade,
    isScanned,
    categories,
    conformance,
    noun,
  );

  return {
    overallScore,
    grade,
    executiveSummary,
    profile: {
      mode,
      label: SCORING_PROFILES[mode].label,
      description: SCORING_PROFILES[mode].description,
      overallScore,
      grade,
      executiveSummary,
      categoryScores: Object.fromEntries(
        categories.map((category) => [category.id, category.score]),
      ),
      categories,
    },
  };
}

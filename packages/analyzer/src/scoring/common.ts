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
import { capGradeBySeverity } from "@file-audit/shared";
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

/**
 * True when a StructTreeRoot exists but demonstrably references NO content —
 * the document is "tagged" only in the sense that the root object is present.
 *
 * WHY: both the scorer and the conformance gate used to treat the mere
 * PRESENCE of a StructTreeRoot as proof of tagging. A file whose tag tree
 * holds nothing (every character of body text outside it) therefore scored a
 * perfect Text Extractability and returned "no automated WCAG failures",
 * while the SAME file with the root stripped correctly failed 1.3.1 — so
 * adding an empty root laundered a failing document into a clean verdict.
 * A screen reader following those tags gets exactly what it gets from an
 * untagged file: nothing.
 *
 * Deliberately a CONJUNCTION of independent signals, and every one of them
 * must be present-and-empty rather than merely absent. An extraction gap in
 * any single signal can then only suppress the finding, never fabricate it —
 * the same "assert from measured evidence, never from a missing field"
 * discipline the rest of the gate follows.
 *
 * `textLength` is the raw character count, NOT the 50-char `hasText`
 * heuristic: the claim being made is "this text is outside the tree", which
 * is only meaningful if there is text at all.
 */
export function structTreeIsContentFree(
  qpdf: {
    hasStructTree: boolean;
    paragraphCount?: number;
    headings?: unknown[];
    images?: unknown[];
    tables?: unknown[];
    lists?: unknown[];
    contentOrder?: number[];
    structTreeMcidsByPage?: Record<number, number[]>;
  },
  pdfjs: { textLength?: number },
): boolean {
  if (!qpdf.hasStructTree) return false;
  // There must be text that the tree is failing to cover.
  if (!(typeof pdfjs.textLength === "number" && pdfjs.textLength > 0)) return false;
  // No content-bearing structure element of any kind.
  if (qpdf.paragraphCount !== 0) return false;
  for (const list of [qpdf.headings, qpdf.images, qpdf.tables, qpdf.lists]) {
    if (!Array.isArray(list) || list.length > 0) return false;
  }
  // No marked content reachable from the tree, by either collection route.
  if (!Array.isArray(qpdf.contentOrder) || qpdf.contentOrder.length > 0) return false;
  const byPage = qpdf.structTreeMcidsByPage;
  if (!byPage || typeof byPage !== "object") return false;
  if (Object.keys(byPage).length > 0) return false;
  return true;
}

/**
 * How many painted CONTENT images have no <Figure> tag covering them —
 * images that participate in the reading order and require a text
 * alternative, but are absent from the structure tree entirely.
 *
 * Returns null when the question cannot be answered from measured evidence
 * (pdfjs failed, or it never reported artifact coverage), so callers can stay
 * honest instead of guessing.
 *
 * WHY `nonArtifactImageCount` AND NOT the raw image count: the raw count
 * includes decorative graphics the author correctly marked as /Artifact, and
 * that noise is exactly why this signal used to be advisory-only. pdfjs walks
 * the content stream and already excludes anything inside an /Artifact run,
 * so what remains is the set that genuinely needs alt text.
 *
 * WHY subtract the FIGURE count rather than compare per-image: <Figure>
 * legitimately wraps vector artwork and grouped content, so a document can
 * have far more figures than raster images (44 vs 5 is real, observed in
 * controls/). Clamping at zero means that case can never manufacture phantom
 * untagged images.
 */
export function untaggedContentImageCount(
  qpdf: { images?: Array<{ ref?: string }> },
  pdfjs: { error?: string | null; nonArtifactImageCount?: number },
): number | null {
  if (pdfjs.error) return null;
  if (typeof pdfjs.nonArtifactImageCount !== "number") return null;
  const taggedFigures = Array.isArray(qpdf.images)
    ? qpdf.images.filter((img) => img.ref).length
    : 0;
  return Math.max(0, pdfjs.nonArtifactImageCount - taggedFigures);
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

  // The average positions the document within a band; its worst unresolved
  // finding decides which band it may be in. Without this, four perfect
  // categories outvote one catastrophic one — two PDFs missing both title and
  // language (Critical) graded B, above a Word file with strictly the milder
  // defect. See SEVERITY_GRADE_CAPS in packages/shared for the full case.
  //
  // Capped BEFORE generateSummary so the prose quotes the grade the reader is
  // actually shown; the two disagreeing was the original complaint in another
  // form. `applicable` rather than `categories`: an unassessed category has no
  // severity to cap with.
  const grade = capGradeBySeverity(getGrade(overallScore), applicable) ?? getGrade(overallScore);
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

// ---------------------------------------------------------------------------
// Link-text classification (WCAG 2.4.4) — ONE doctrine for all four formats.
// Moved here from pdf.ts so docx/pptx/xlsx apply the identical calibration
// decided in v1.25.0: a visible raw URL SATISFIES 2.4.4 (the destination is
// programmatically determinable) and is advisory-only; empty, vague, or
// too-short text is the actual violation.
// ---------------------------------------------------------------------------

const VAGUE_LINK_PHRASES = new Set([
  "click here",
  "click",
  "here",
  "read more",
  "more",
  "learn more",
  "see more",
  "this",
  "this link",
  "link",
  "link here",
  "go",
  "go here",
  "continue",
  "details",
  "see details",
  "more info",
  "more information",
  "info",
  "download",
  "view",
  "open",
  "visit",
  "click this link",
]);

export type LinkClass = "descriptive" | "rawUrl" | "needsFix";

export function classifyLinkText(text: string): LinkClass {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return "needsFix"; // empty link text — no purpose conveyed
  if (/^(https?:\/\/|www\.)/i.test(t)) return "rawUrl"; // visible URL — advisory
  if (VAGUE_LINK_PHRASES.has(t.replace(/[.!?:;\s]+$/g, ""))) return "needsFix";
  // 1–2 alphanumeric characters cannot describe a destination.
  if (t.replace(/[^a-z0-9]/gi, "").length <= 2) return "needsFix";
  return "descriptive";
}

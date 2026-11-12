/**
 * Shared types + helpers for the report export builders (Task F5). Split out
 * of composables/useReportExport.ts, which had grown to 1,264 lines mixing
 * pure string-building functions with the stateful composable. Everything in
 * this file is pure and format-agnostic — used by two or more of
 * markdown.ts / json.ts / text.ts / html.ts / aiAnalysis.ts.
 */

import { wcagSlugFor } from "@file-audit/shared";
import { buildActionPlan, type PlanStep } from "~/utils/actionPlan";
import {
  emptyPlanSentence,
  failingCategoryIds,
  publicationStatus,
  type PublicationStatus,
} from "~/utils/publicationStatus";

export interface HelpLink {
  label: string;
  url: string;
}

export interface Category {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  findings: string[];
  explanation?: string;
  helpLinks?: HelpLink[];
  // Disambiguates a null score: true = "not assessed" (tool couldn't
  // evaluate), false/undefined = "not applicable". Mirrors
  // CategoryResult['notAssessed'] in packages/shared/src/types.ts — the API
  // has always sent this field, this local type just hadn't declared it.
  notAssessed?: boolean;
}

export type ScoringMode = "strict" | "remediation";

export interface ScoreProfile {
  mode: ScoringMode;
  label: string;
  description: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores?: Record<string, number | null>;
  // Mirrors ScoreProfileResult in packages/shared/src/types.ts — the API
  // has always sent these fields (see that file's comment for the floor
  // semantics), this local type just hadn't declared them.
  rawOverallScore?: number;
  flooredToStrict?: boolean;
}

export interface ConformanceFinding {
  sc: string;
  name: string;
  level: "A" | "AA";
  category: string;
  issue: string;
  url: string;
}

export interface NotAssessedCriterion {
  sc: string;
  name: string;
  level: "A" | "AA";
  reason: string;
  url: string;
}

/** One machine-checkable PDF/UA-1 rule veraPDF found failing. */
export interface PdfUaRuleFailure {
  ruleId: string;
  clause: string;
  description: string;
  count: number;
}

/** veraPDF's PDF/UA-1 (ISO 14289-1) verdict. Machine-checkable conditions
 *  only — never a claim of full PDF/UA conformance, and never part of the
 *  score: the law names WCAG, not PDF/UA. */
export interface PdfUaVerdict {
  available: boolean;
  passed: boolean;
  profile: string;
  failures: PdfUaRuleFailure[];
  totalFailureCount: number;
  distinctRuleCount?: number;
  error?: string;
}

export interface ConformanceVerdict {
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  notAssessed: NotAssessedCriterion[];
  headline: string;
}

// Exported so components that merely pass a report through to the export
// functions (e.g. ReportDownloadBar.vue) can type their `result` prop
// genuinely instead of with `any`.
export interface ReportResult {
  filename: string;
  pageCount: number;
  overallScore: number;
  grade: string;
  isScanned: boolean;
  executiveSummary: string;
  categories: Category[];
  warnings?: string[];
  scoringMode?: ScoringMode;
  scoreProfiles?: Partial<Record<ScoringMode, ScoreProfile>>;
  conformance?: ConformanceVerdict;
  /** veraPDF's PDF/UA-1 machine check. PDF results only, and absent on stored
   *  reports from before v1.91.0 — the AI export prints the section only when
   *  it is present AND `available`, so an older payload says nothing rather
   *  than implying the check passed. */
  pdfUaVerdict?: PdfUaVerdict;
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
  /** The API's proof that it computed this result (an HMAC over the score,
   *  grade, findings and conformance verdict). Opaque here: carried through
   *  untouched and posted back when the report is shared. Absent on results
   *  restored from a session older than the seal. */
  seal?: string;
  /** Stored PDF document info; `creator` drives the plan's InDesign-aware
   *  source steps. Optional — OOXML reports and old stored PDFs lack it. */
  pdfMetadata?: { creator?: string | null } | null;
}

export interface BrandingInfo {
  appName: string;
  siteUrl: string;
  wcagVersion: string;
  wcagUnderstandingBase: string;
}

// Plain-language standards basis, shown in every export's conformance block.
// WCAG 2.2 is a superset of 2.1 AA; IITAA 2.1 still mandates WCAG 2.1 AA as the
// legal minimum for Illinois state/local government. The ADA Title II rule requires
// WCAG 2.1 AA for state and local government digital content (compliance dates
// April 26, 2027 / April 26, 2028 under the DOJ interim final rule).
export function standardsBasis(wcagVersion: string): string {
  const versionNote =
    wcagVersion === "2.2"
      ? ` (WCAG 2.2 is a superset of WCAG 2.1 AA, which remains the IITAA 2.1 legal minimum)`
      : "";
  return (
    `This audit checks documents against WCAG ${wcagVersion} Level AA — the accessibility standard adopted by the Illinois Information Technology Accessibility Act (IITAA 2.1) and the U.S. Department of Justice's ADA Title II rule for state and local government.` +
    versionNote
  );
}

export function conformanceHeading(c: ConformanceVerdict, _wcagVersion: string): string {
  // 2.1 by name regardless of the audit basis: every criterion that can
  // appear in failures exists in WCAG 2.1 A/AA (wcag21Purity tests), so
  // failing them fails 2.1 — the standard the law cites.
  if (c.status === "fail") return `Does not meet WCAG 2.1 Level AA`;
  if (c.status === "incomplete") return "WCAG verdict could not be determined";
  return "No automated WCAG failures detected";
}

export function timestamp(): string {
  return new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// BUG-1: previously only stripped a trailing `.pdf`, so exporting a report
// for a Word/PowerPoint/Excel upload left the source extension dangling in
// the middle of the export filename (e.g. "report.docx-accessibility-
// report-2026-07-03.html"). Strip any of the four audited extensions.
// Exported for unit tests.
export function baseFilename(result: ReportResult): string {
  const name = result.filename.replace(/\.(pdf|docx|pptx|xlsx)$/i, "");
  const date = new Date().toISOString().slice(0, 10);
  return `${name}-accessibility-report-${date}`;
}

export function gradeLabel(grade: string): string {
  const map: Record<string, string> = {
    A: "Excellent",
    B: "Good",
    C: "Needs Improvement",
    D: "Poor",
    F: "Failing",
  };
  return map[grade] || grade;
}

export function profileLabel(_mode: ScoringMode): string {
  return "Strict semantic score (WCAG + IITAA §E205.4)";
}

export function profileDescription(_mode: ScoringMode, wcagVersion?: string): string {
  const ver = wcagVersion ?? "2.1";
  return `WCAG-based scoring methodology. Anchored to WCAG ${ver} Level AA and Illinois IITAA 2.1 §E205.4 for non-web documents. Prioritizes programmatically determinable headings, table semantics, and logical structure.`;
}

export function getScoreProfiles(result: ReportResult, wcagVersion?: string): ScoreProfile[] {
  // v1.21+ exports a single Strict profile. Historical shared reports
  // (stored before v1.21) may still carry a `scoreProfiles.remediation`
  // that differs from strict; we ignore it to keep the downloaded
  // document consistent with what the UI shows.
  const strictFallback: ScoreProfile = {
    mode: "strict",
    label: profileLabel("strict"),
    description: profileDescription("strict", wcagVersion),
    overallScore: result.overallScore,
    grade: result.grade,
    executiveSummary: result.executiveSummary,
  };

  const strict = result.scoreProfiles?.strict
    ? {
        ...result.scoreProfiles.strict,
        mode: "strict" as const,
        label: profileLabel("strict"),
        description: profileDescription("strict", wcagVersion),
      }
    : strictFallback;

  return [strict];
}

// ── Shared by the text and Markdown exports (2026-11-12) ───────────────────
// Both used to stop at a bare "Grade: A — Excellent": no publication verdict,
// no fix steps, and no statement of what an automated check cannot see —
// while every other surface carried all three.

/** The same disclosure the HTML export and the printable plan carry, as
 *  plain text. */
export const AUTOMATION_LIMIT_HEADING =
  "Automated checks cover a subset — a person checks the rest";
export const AUTOMATION_LIMIT_TEXT =
  "This score covers the machine-checkable share of accessibility — roughly 30–40% of issues in independent tests (the UK government's ten-tool study found the best checker caught 41% of planted barriers; Deque's own audit data, the most optimistic figure on record, reaches 57% of issue volume). No automated checker — this one, Adobe Acrobat's, PAC, Word's — can tell you the document works in a screen reader: whether the alt text describes each image, headings match their sections, and the reading order makes sense can only be confirmed by a person. If you have additional questions about file accessibility, contact your agency accessibility coordinator.";

export interface ExportPlan {
  status: PublicationStatus;
  /** The line beside the grade — the hero's own wording: a blocker leads on
   *  its own, anything else follows the grade adjective. */
  verdictLabel: string;
  steps: PlanStep[];
  /** Step is backed by a confirmed WCAG 2.1 failure. null = the payload has
   *  no verdict to ask (never assert what cannot be verified). */
  required: (step: PlanStep) => boolean | null;
  /** What to print when there are no steps. */
  emptySentence: string;
  /** False for a payload with no categories (page-audit rows). */
  hasCategories: boolean;
}

/** The action plan exactly as the screen orders it, plus the shared publish
 *  decision — one call so an export cannot assemble a different answer. */
export function exportPlan(result: ReportResult): ExportPlan {
  const categories = Array.isArray(result.categories) ? result.categories : [];
  const status = publicationStatus(categories, result.conformance);
  const steps = buildActionPlan(
    categories,
    result.fileType,
    result.pdfMetadata?.creator,
    result.conformance,
  );
  const failing = failingCategoryIds(result.conformance);
  const adjective = gradeLabel(result.grade);
  return {
    status,
    steps,
    hasCategories: categories.length > 0,
    verdictLabel: !categories.length
      ? adjective
      : status.tone === "critical"
        ? status.verdictText
        : `${adjective} — ${status.verdictText}`,
    required: (step) => (status.conformanceKnown ? failing.has(step.categoryId) : null),
    emptySentence: status.mayClaimPass
      ? "Nothing to fix — this document passes all automated checks."
      : emptyPlanSentence(status),
  };
}

/** W3C Understanding-page address for a criterion number, or null when the
 *  number is unknown — naming a criterion means linking it. */
export function criterionUrl(sc: string, branding: BrandingInfo): string | null {
  const slug = wcagSlugFor(sc);
  return slug ? `${branding.wcagUnderstandingBase}${slug}.html` : null;
}

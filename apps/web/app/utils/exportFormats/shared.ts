/**
 * Shared types + helpers for the report export builders (Task F5). Split out
 * of composables/useReportExport.ts, which had grown to 1,264 lines mixing
 * pure string-building functions with the stateful composable. Everything in
 * this file is pure and format-agnostic — used by two or more of
 * markdown.ts / json.ts / text.ts / html.ts / aiAnalysis.ts.
 */

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
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
}

export interface BrandingInfo {
  appName: string;
  siteUrl: string;
  wcagVersion: string;
  wcagUnderstandingBase: string;
}

// Plain-language standards basis, shown in every export's conformance block.
// WCAG 2.2 is a superset of 2.1 AA; IITAA 2.1 still mandates WCAG 2.1 AA as the
// legal minimum for Illinois state/local government. ADA Title II (effective April
// 2026) requires WCAG 2.1 AA for state and local government digital content.
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

export function conformanceHeading(c: ConformanceVerdict, wcagVersion: string): string {
  if (c.status === "fail") return `Does not meet WCAG ${wcagVersion} Level AA`;
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
  const ver = wcagVersion ?? "2.2";
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

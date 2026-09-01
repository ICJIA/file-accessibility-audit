/**
 * JSON report builder — moved verbatim out of composables/useReportExport.ts
 * (Task F5). Pure function: no DOM, no Vue, no side effects.
 */
import { WCAG_MAP, getWcagCriteriaStrings } from "~/utils/wcag";

/** The criteria that actually FAILED in one category, formatted like
 *  getWcagCriteriaStrings — or null when the payload carries no verdict for
 *  it, so the caller falls back to the category map (legacy payloads). The
 *  map lists every criterion a category RELATES to; a remediation step that
 *  printed those claimed requirements the document was not failing. */
function failingCriteriaStrings(
  conformance: { failures?: unknown } | null | undefined,
  catId: string,
): string[] | null {
  if (!Array.isArray(conformance?.failures)) return null;
  const out: string[] = [];
  for (const f of conformance.failures) {
    if (!f || typeof f !== "object") continue;
    const { sc, name, level, category } = f as {
      sc?: unknown;
      name?: unknown;
      level?: unknown;
      category?: unknown;
    };
    if (category !== catId || typeof sc !== "string" || typeof name !== "string") continue;
    const s = `${sc} ${name}${typeof level === "string" ? ` (Level ${level})` : ""}`;
    if (!out.includes(s)) out.push(s);
  }
  return out.length ? out : null;
}
import { fileTypeLabel, pageNoun } from "~/utils/reportBanner";
import {
  type ReportResult,
  type BrandingInfo,
  gradeLabel,
  getScoreProfiles,
  timestamp,
} from "./shared";

// Exported for unit tests (Fix 4: llmContext/remediationPlan format-neutral wording).
export function buildJSON(result: ReportResult, branding: BrandingInfo): string {
  const failingCategories = result.categories.filter((c) => c.score !== null && c.score < 90);
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  const report = {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      generatedAtFormatted: timestamp(),
      tool: branding.appName,
      toolUrl: branding.siteUrl,
      schemaVersion: "2.1",
    },
    file: {
      name: result.filename,
      pages: result.pageCount,
      isScanned: result.isScanned,
    },
    score: {
      overall: result.overallScore,
      grade: result.grade,
      gradeLabel: gradeLabel(result.grade),
      primaryMode: result.scoringMode || "strict",
    },
    scoreProfiles: Object.fromEntries(
      scoreProfiles.map((profile) => [
        profile.mode,
        {
          label: profile.label,
          description: profile.description,
          overall: profile.overallScore,
          grade: profile.grade,
          gradeLabel: gradeLabel(profile.grade),
          executiveSummary: profile.executiveSummary,
        },
      ]),
    ),
    executiveSummary: result.executiveSummary,
    warnings: result.warnings || [],
    conformance: result.conformance ?? null,
    categories: result.categories.map((cat) => {
      const wcag = WCAG_MAP[cat.id];
      return {
        id: cat.id,
        label: cat.label,
        score: cat.score,
        grade: cat.grade,
        severity: cat.severity,
        status:
          cat.score === null
            ? "not-applicable"
            : cat.score >= 90
              ? "pass"
              : cat.score >= 70
                ? "minor"
                : cat.score >= 40
                  ? "moderate"
                  : "fail",
        findings: cat.findings,
        explanation: cat.explanation || null,
        helpLinks: cat.helpLinks || [],
        wcag: wcag
          ? {
              successCriteria: getWcagCriteriaStrings(cat.id),
              successCriteriaDetailed: wcag.criteria.map((c) => ({
                ...c,
                url: `${branding.wcagUnderstandingBase}${c.slug}.html`,
              })),
              principle: wcag.principle,
              remediation: wcag.remediation,
            }
          : null,
      };
    }),
    remediationPlan: {
      summary:
        failingCategories.length === 0
          ? "No remediation needed — all scored categories pass."
          : `${failingCategories.length} categor${failingCategories.length === 1 ? "y needs" : "ies need"} remediation.`,
      prioritizedSteps: failingCategories
        .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
        .map((cat, i) => ({
          priority: i + 1,
          category: cat.label,
          currentScore: cat.score,
          severity: cat.severity,
          wcagCriteria:
            failingCriteriaStrings(result.conformance, cat.id) ?? getWcagCriteriaStrings(cat.id),
          action:
            WCAG_MAP[cat.id]?.remediation ||
            "Review findings and remediate in the source application.",
        })),
    },
    llmContext: {
      description:
        "This section provides structured context for LLMs processing this accessibility report.",
      prompt:
        `You are reviewing a ${fileTypeLabel(result.fileType)} accessibility audit for "${result.filename}" (${result.pageCount} ${pageNoun(result.fileType)}${result.pageCount === 1 ? "" : "s"}). ` +
        `It scored ${result.overallScore}/100 (Grade ${result.grade}). ` +
        (failingCategories.length > 0
          ? `The following categories need remediation: ${failingCategories.map((c) => `${c.label} (${c.score}/100)`).join(", ")}. `
          : "All scored categories pass. ") +
        `Use the remediationPlan.prioritizedSteps array for ordered fix instructions. ` +
        `Each category includes WCAG ${branding.wcagVersion} success criteria references and tool-specific remediation steps for the source application.`,
      standards: [
        `WCAG ${branding.wcagVersion} Level AA`,
        "ADA Title II (compliance due April 26, 2027 for entities of 50,000+; April 26, 2028 for smaller entities and special districts)",
        "Illinois IITAA 2.1 (§E205.4)",
        // PDF/UA (ISO 14289-1) is a PDF-only ISO standard — the scorer never
        // computes PDF/UA signals for docx/pptx/xlsx ("pdfUa and adobeParity
        // are intentionally omitted — PDF-only signals", scorer.ts), so
        // listing it for an Office-format report would be a false claim.
        ...(!result.fileType || result.fileType === "pdf" ? ["PDF/UA (ISO 14289-1)"] : []),
      ],
      scoringScale: {
        pass: "90–100",
        minor: "70–89",
        moderate: "40–69",
        fail: "0–39",
      },
    },
  };
  return JSON.stringify(report, null, 2);
}

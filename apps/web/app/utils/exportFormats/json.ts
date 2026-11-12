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
import { SEVERITY_THRESHOLDS } from "@file-audit/shared";
import { exportCategoryStatus, failingCategoryIds, gradeLabelFor } from "~/utils/publicationStatus";
import {
  type ReportResult,
  type BrandingInfo,
  gradeLabel,
  getScoreProfiles,
  timestamp,
  exportPlan,
} from "./shared";

/** "70–99" for a severity label, read from the shared thresholds the screen
 *  uses — this export used to print its own 90/70/40 bands, under which a
 *  95 (Minor, with a required fix) was a "pass". */
function bandFor(severity: string): string {
  const i = SEVERITY_THRESHOLDS.findIndex((t) => t.severity === severity);
  if (i < 0) return "";
  const min = SEVERITY_THRESHOLDS[i]!.min;
  const max = i === 0 ? 100 : SEVERITY_THRESHOLDS[i - 1]!.min - 1;
  return min === max ? String(min) : `${min}–${max}`;
}

// Exported for unit tests (Fix 4: llmContext/remediationPlan format-neutral wording).
export function buildJSON(result: ReportResult, branding: BrandingInfo): string {
  // What needs fixing, in the order the on-screen action plan lists it —
  // derived from severity and the conformance verdict, the same two sources
  // every other surface reads (utils/publicationStatus.ts).
  const plan = exportPlan(result);
  const pub = plan.status;
  const requiredIds = failingCategoryIds(result.conformance);
  const byId = new Map(result.categories.map((c) => [c.id, c]));
  const planned = plan.steps.map((step) => ({ step, cat: byId.get(step.categoryId) }));
  // A category the gate holds a confirmed failure against is never left out
  // of the plan, even if its severity produced no step.
  const plannedIds = new Set(plan.steps.map((st) => st.categoryId));
  const extraRequired = result.categories.filter(
    (c) => requiredIds.has(c.id) && !plannedIds.has(c.id),
  );
  const fixCount = planned.length + extraRequired.length;
  const mustFix = pub.wcagFails
    ? ` ${pub.requirementSentence} and must be fixed before publishing.`
    : "";
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  const report = {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      generatedAtFormatted: timestamp(),
      tool: branding.appName,
      toolUrl: branding.siteUrl,
      schemaVersion: "2.2",
    },
    file: {
      name: result.filename,
      pages: result.pageCount,
      isScanned: result.isScanned,
    },
    score: {
      overall: result.overallScore,
      grade: result.grade,
      // Kept for scripts that read it, but never a bare "Excellent" beside
      // readyToPublish:false — it carries the same words as the on-screen
      // grade label. The plain adjective is in gradeAdjective.
      gradeLabel: plan.hasCategories
        ? gradeLabelFor(gradeLabel(result.grade), pub)
        : gradeLabel(result.grade),
      gradeAdjective: gradeLabel(result.grade),
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
          gradeLabel: plan.hasCategories
            ? gradeLabelFor(gradeLabel(profile.grade), pub)
            : gradeLabel(profile.grade),
          executiveSummary: profile.executiveSummary,
        },
      ]),
    ),
    executiveSummary: result.executiveSummary,
    warnings: result.warnings || [],
    conformance: result.conformance ?? null,
    // The publish decision, exactly as the report states it on screen.
    publication: {
      state: pub.state,
      readyToPublish: pub.mayClaimPass,
      verdict: plan.verdictLabel,
      wcagFailureCount: pub.failureCount,
    },
    categories: result.categories.map((cat) => {
      const wcag = WCAG_MAP[cat.id];
      return {
        id: cat.id,
        label: cat.label,
        score: cat.score,
        grade: cat.grade,
        severity: cat.severity,
        status: exportCategoryStatus(cat),
        // A confirmed WCAG 2.1 failure sits in this category — a required
        // fix whatever the score. null = this payload carries no verdict.
        requiredByWcag: pub.conformanceKnown ? requiredIds.has(cat.id) : null,
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
        fixCount === 0
          ? pub.mayClaimPass
            ? "No remediation needed — all scored categories pass."
            : plan.emptySentence
          : `${fixCount} categor${fixCount === 1 ? "y needs" : "ies need"} remediation.${mustFix}`,
      prioritizedSteps: [
        ...planned.map(({ step, cat }) => ({
          categoryId: step.categoryId,
          category: cat?.label ?? step.categoryId,
          title: step.title,
          currentScore: cat?.score ?? null,
          severity: step.severity as string | null,
        })),
        ...extraRequired.map((cat) => ({
          categoryId: cat.id,
          category: cat.label,
          title: `Fix: ${cat.label}`,
          currentScore: cat.score,
          severity: cat.severity,
        })),
      ].map((row, i) => ({
        priority: i + 1,
        category: row.category,
        categoryId: row.categoryId,
        title: row.title,
        currentScore: row.currentScore,
        severity: row.severity,
        requiredByWcag: pub.conformanceKnown ? requiredIds.has(row.categoryId) : null,
        wcagCriteria:
          failingCriteriaStrings(result.conformance, row.categoryId) ??
          getWcagCriteriaStrings(row.categoryId),
        action:
          WCAG_MAP[row.categoryId]?.remediation ||
          "Review findings and remediate in the source application.",
      })),
    },
    llmContext: {
      description:
        "This section provides structured context for LLMs processing this accessibility report.",
      prompt:
        `You are reviewing a ${fileTypeLabel(result.fileType)} accessibility audit for "${result.filename}" (${result.pageCount} ${pageNoun(result.fileType)}${result.pageCount === 1 ? "" : "s"}). ` +
        `It scored ${result.overallScore}/100 (Grade ${result.grade}). ` +
        `Publication verdict: ${plan.verdictLabel}. ` +
        (fixCount > 0
          ? `The following categories need remediation, in priority order: ${[
              ...planned.map(({ step, cat }) => cat ?? { label: step.categoryId, score: null }),
              ...extraRequired,
            ]
              .map((c) => `${c.label} (${c.score === null ? "not scored" : `${c.score}/100`})`)
              .join(", ")}.${mustFix} `
          : pub.mayClaimPass
            ? "All scored categories pass. "
            : `${plan.emptySentence} `) +
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
      // Read from the shared severity thresholds — the bands the screen uses.
      scoringScale: {
        pass: bandFor("No issues found"),
        minor: bandFor("Minor"),
        moderate: bandFor("Moderate"),
        fail: bandFor("Critical"),
      },
    },
  };
  return JSON.stringify(report, null, 2);
}

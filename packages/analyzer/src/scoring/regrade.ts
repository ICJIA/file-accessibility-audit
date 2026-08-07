/**
 * Re-derive the score (and the grade and prose that follow from it) on a
 * report that was scored and STORED before the severity score cap existed.
 *
 * Why this rather than a database migration. The cap is a pure function of a
 * report's own category severities, and every stored report already carries
 * them — so the corrected letter can be derived at read time, deterministically,
 * with no schema change and nothing to back-fill. That matters for more than
 * convenience: `shared_reports` rows are the evidence an agency hands to a
 * reviewer, and rewriting stored evidence in place is a worse posture than
 * deriving a display value from it. The snapshot on disk stays exactly what
 * was computed on the day; what we serve reflects the current rule.
 *
 * The alternative was leaving old links alone, which reintroduces the very
 * contradiction the cap removes — a report shared last week reading B while
 * the same document re-audited today reads D.
 *
 * Applied by the API wherever a stored audit is served (shared reports and
 * both remediation audits), so every consumer — this web app, the CLI, and
 * the separate fleet-audit project that calls the same endpoints — sees one
 * consistent grade.
 */
import { capScoreBySeverity, gradeForScore } from "@file-audit/shared";
import { generateSummary } from "./summary.js";
import type { CategoryResult } from "../scorer.js";
import type { ConformanceVerdict } from "./conformance.js";

/** Document noun for the regenerated prose, keyed by the report's fileType.
 *  Mirrors what each scorer passes to aggregateScore; "PDF" is the default
 *  there and here. */
const NOUN_BY_TYPE: Record<string, string> = {
  pdf: "PDF",
  docx: "Word document",
  pptx: "PowerPoint presentation",
  xlsx: "Excel workbook",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Regrade one score-bearing object in place — the report itself, or one of
 * its `scoreProfiles` entries, which carry their own categories and grade.
 *
 * The executive summary is regenerated rather than string-patched. It does not
 * merely quote the letter, it BRANCHES on it ("cleared the automated WCAG
 * checks, with minor issues remaining" is the grade-B branch), so swapping the
 * letter inside stale prose would leave the sentence arguing against its own
 * grade. Regeneration needs only fields the report already stores. If any of
 * them is missing or malformed — a hand-edited row, a report from a much older
 * build — the summary is left untouched: a slightly stale sentence beside a
 * corrected grade is recoverable, a thrown exception on a public share link is
 * not.
 */
function regradeInPlace(target: Record<string, unknown>, fileType: unknown): boolean {
  const categories = Array.isArray(target.categories) ? target.categories : null;
  if (!categories) return false;

  const before = target.overallScore;
  if (typeof before !== "number" || !Number.isFinite(before)) return false;

  const after = capScoreBySeverity(before, categories as Array<{ score?: number | null }>);
  if (after === null || after >= before) return false;

  // Score first, then the grade FROM the score — never independently, or the
  // published scale stops holding on exactly the reports served from storage.
  target.overallScore = after;
  const grade = gradeForScore(after);
  if (grade !== null) target.grade = grade;

  const score = after;
  if (typeof target.executiveSummary === "string") {
    try {
      const noun = NOUN_BY_TYPE[typeof fileType === "string" ? fileType : ""] ?? "PDF";
      target.executiveSummary = generateSummary(
        score,
        grade ?? String(target.grade),
        target.isScanned === true,
        categories as CategoryResult[],
        target.conformance as ConformanceVerdict,
        noun,
      );
    } catch {
      // Keep the stored sentence. See the note above on why this is the
      // safer failure.
    }
  }
  return true;
}

/**
 * Apply the severity score cap to a stored report, mutating the parsed object
 * and returning it. Safe to call on already-capped reports (the cap is
 * idempotent) and on anything at all — a non-object, a report predating
 * `categories`, or a truncated row returns unchanged rather than throwing.
 *
 * `isScanned` reports keep whatever prose they had: their summary does not
 * quote a grade at all, and their categories are largely unassessed.
 */
export function regradeStoredReport<T>(report: T): T {
  if (!isRecord(report)) return report;

  regradeInPlace(report, report.fileType);

  // Each profile is independently scored — the strict and remediation
  // profiles can differ in both categories and grade — so each is capped
  // against its OWN categories, never the top-level ones.
  const profiles = report.scoreProfiles;
  if (isRecord(profiles)) {
    for (const profile of Object.values(profiles)) {
      if (isRecord(profile)) regradeInPlace(profile, report.fileType);
    }
  }

  return report;
}

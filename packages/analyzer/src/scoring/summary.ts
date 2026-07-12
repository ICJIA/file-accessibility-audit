import type { CategoryResult } from "../scorer.js";
import type { ConformanceVerdict } from "./conformance.js";
import { WCAG } from "#config";

/**
 * Build the one-paragraph executive summary shown alongside the score.
 *
 * Reconciled with the WCAG conformance verdict (v1.22.3): a confirmed
 * conformance failure outranks the numeric grade, so the summary never reads
 * "ready" or "strong" while the verdict box separately reports a failure.
 */
export function generateSummary(
  score: number,
  grade: string,
  isScanned: boolean,
  categories: CategoryResult[],
  conformance: ConformanceVerdict,
  /** Document noun for the prose ("PDF" by default; "Word document" for DOCX). */
  noun: string = "PDF",
): string {
  if (isScanned) {
    return `This ${noun} appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required before this document can be made accessible.`;
  }

  // A confirmed, machine-checkable WCAG failure outranks the score — a high
  // grade with a confirmed failure is still a failure.
  if (conformance.status === "fail") {
    const n = conformance.failures.length;
    return `This ${noun} scored ${score}/100 (grade ${grade}) for overall readiness, but automated checks confirmed ${n} WCAG ${WCAG.VERSION} ${n === 1 ? "failure" : "failures"} — so it does not yet meet WCAG ${WCAG.VERSION} Level AA. The conformance verdict above lists the exact criteria; correcting those is the priority before the document can be treated as accessible.`;
  }

  // Analysis could not complete — no honest verdict, and no readiness claim.
  if (conformance.status === "incomplete") {
    return `Automated analysis could not fully complete for this ${noun} (it may be encrypted, damaged, or unsupported), so no WCAG conformance verdict could be reached. The partial ${score}/100 score reflects only the checks that ran — a full manual accessibility review is required.`;
  }

  // conformance.status === "no-automated-failures": no confirmed failure was
  // found. Describe readiness from the grade, but never claim conformance —
  // color contrast and the correctness of alt text, headings, and reading
  // order are not machine-verifiable and still require manual review.
  const applicable = categories.filter((c) => c.score !== null);
  const clean = categories.filter((c) => c.severity === "No issues found");
  const critical = categories.filter((c) => c.severity === "Critical");
  const moderate = categories.filter((c) => c.severity === "Moderate");

  if (grade === "A") {
    return `This ${noun} scored ${score}/100 (grade ${grade}) and cleared every automated WCAG check across all ${applicable.length} assessed categories — a strong result. This is not a determination of conformance: confirm color contrast and the correctness of alt text, headings, and reading order in a manual review before publishing.`;
  }

  if (grade === "B") {
    return `This ${noun} scored ${score}/100 (grade ${grade}) and cleared the automated WCAG checks, with minor issues remaining — ${clean.length} of ${applicable.length} categories are fully issue-free. Review the findings below, then confirm with a manual check before publishing.`;
  }

  // Grade C/D/F with no single confirmed failure: the weighted score is low
  // even though no hard conformance gate tripped.
  if (critical.length > 0 && moderate.length > 0) {
    const criticalNames = critical.map((c) => c.label).join(", ");
    const moderateNames = moderate.map((c) => c.label).join(", ");
    return `This ${noun} scored ${score}/100 (grade ${grade}). Automated checks found no single confirmed WCAG failure, but ${critical.length} categor${critical.length === 1 ? "y has" : "ies have"} critical issues (${criticalNames}) and ${moderate.length} ${moderate.length === 1 ? "has" : "have"} moderate issues (${moderateNames}). Address these before publishing.`;
  }

  if (critical.length > 0) {
    const criticalNames = critical.map((c) => c.label).join(", ");
    return `This ${noun} scored ${score}/100 (grade ${grade}). ${critical.length} categor${critical.length === 1 ? "y has" : "ies have"} critical accessibility issues: ${criticalNames}. These must be addressed before publishing.`;
  }

  if (moderate.length > 0) {
    const moderateNames = moderate.map((c) => c.label).join(", ");
    return `This ${noun} scored ${score}/100 (grade ${grade}). ${moderate.length} categor${moderate.length === 1 ? "y has" : "ies have"} moderate accessibility issues: ${moderateNames}. These should be addressed to improve accessibility.`;
  }

  return `This ${noun} scored ${score}/100 (grade ${grade}), with room for improvement in ${applicable.length - clean.length} of ${applicable.length} categories. Review the findings below before publishing.`;
}

import { publicationVerdict } from "~/utils/actionPlan";

// Publish-readiness gate for the remediation result page's After card.
// Pulled out into a pure, unit-testable module on purpose: when this logic
// lived only as page-level computeds, the sole test covering it
// (app/__tests__/remediateDownloadPlacement.test.ts) read the page as text
// and grepped for the expression — inverting the v-if/v-else branches, or
// loosening the grade check, would have kept every test green while telling
// a user a bad PDF was safe to publish. See app/__tests__/publishReadiness.test.ts
// for the executable coverage.

/**
 * The grade the After card displays: strict profile first, matching
 * ScoreCard's `displayedProfile` (strict?.grade ?? top-level grade), so the
 * readiness banner can never disagree with the big grade rendered directly
 * above it.
 *
 * Accepts `unknown` because it's called directly on a fetched job receipt's
 * `outputAudit` — malformed/non-object input returns null rather than
 * throwing.
 */
export function afterGradeOf(outputAudit: unknown): string | null {
  if (typeof outputAudit !== "object" || outputAudit === null) return null;
  const out = outputAudit as {
    grade?: string | null;
    scoreProfiles?: { strict?: { grade?: string | null } };
  };
  return out.scoreProfiles?.strict?.grade ?? out.grade ?? null;
}

/**
 * The categories the After card's verdict is computed from — strict profile
 * first, exactly as `afterGradeOf` picks the grade, so the verdict and the
 * grade beside it always describe the same scoring profile.
 */
export function afterCategoriesOf(outputAudit: unknown): Array<{ severity?: string | null }> {
  if (typeof outputAudit !== "object" || outputAudit === null) return [];
  const out = outputAudit as {
    categories?: unknown;
    scoreProfiles?: { strict?: { categories?: unknown } };
  };
  const strict = out.scoreProfiles?.strict?.categories;
  if (Array.isArray(strict)) return strict as Array<{ severity?: string | null }>;
  return Array.isArray(out.categories)
    ? (out.categories as Array<{ severity?: string | null }>)
    : [];
}

/**
 * Publish readiness for the remediation result, delegating to the SAME
 * `publicationVerdict` the audit report uses.
 *
 * It used to be `grade === "A"`, and that produced a flat contradiction on
 * one file: a report graded B with three Minor findings and nothing worse
 * read "ready to publish" on the audit page and "Not ready to publish yet" on
 * the remediation page. For a non-technical author the only question that
 * matters is *can I publish this?*, and the tool answered it twice, opposite
 * ways, about the same PDF.
 *
 * The audit page's rule is the one that survives, because it is the rule the
 * grade ladder already publishes everywhere else: A means nothing was found,
 * B means only minor items remain, C means a real problem, D and F mean do
 * not publish. Treating B as unpublishable contradicted our own scale.
 *
 * The genuine extra caution about auto-remediation — that machine-generated
 * structure can satisfy a checker without being good — has NOT been dropped.
 * It moved out of the verdict and into a note shown at every grade, which is
 * where it belongs: it is equally true of an A.
 */
export function publishVerdictFor(outputAudit: unknown): { text: string; tone: string } {
  const categories = afterCategoriesOf(outputAudit);
  // FAIL CLOSED. No categories means the audit could not be read — a
  // malformed receipt, an older job, a truncated row — and `publicationVerdict`
  // on an empty list returns "ready to publish", because nothing is wrong when
  // nothing is known. That is the correct answer for a genuinely clean report
  // and a dangerous one here: it would tell someone a file is publishable
  // because we failed to assess it. Caught by the existing test for a missing
  // grade, which the old `grade === "A"` gate satisfied by accident.
  if (categories.length === 0) {
    return { text: "Not ready to publish — this file could not be re-checked", tone: "critical" };
  }
  return publicationVerdict(categories);
}

/** Kept for the one place that needs a boolean (which banner style to use).
 *  Derived from the shared verdict so it cannot drift from it. */
export function isPublishReady(outputAudit: unknown): boolean {
  return publishVerdictFor(outputAudit).tone === "ok";
}

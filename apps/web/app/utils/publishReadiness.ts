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
 * Publish-ready ONLY at a clean A — anything else keeps the warning.
 * Strict equality is deliberate: this gate must fail closed for a missing
 * grade, a lowercase "a", an "A+", or any grade below A.
 */
export function isPublishReady(grade: string | null): boolean {
  return grade === "A";
}

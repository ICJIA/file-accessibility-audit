/**
 * What the remediation page says to a screen reader while a job runs and when
 * it ends. The page (pages/remediate/[jobId].vue) cannot be mounted in a unit
 * test, so the wording lives here where it can be tested directly.
 *
 * Two rules:
 *   - a step is announced when the STEP changes, never per poll tick — a
 *     status region that re-speaks once a second is worse than silence;
 *   - the end of the job is announced with the outcome itself, not "done".
 */

export type RemediationOutcomeKind = "complete" | "failed" | "expired";

/** "Step 2 of 4: Adding structure tags." — also the progress bar's value text. */
export function stepAnnouncement(index: number, labels: readonly string[]): string {
  const label = labels[index];
  if (!label) return "";
  return `Step ${index + 1} of ${labels.length}: ${label}.`;
}

export function outcomeAnnouncement(
  kind: RemediationOutcomeKind,
  scores: { before?: number | null; after?: number | null } = {},
): string {
  if (kind === "failed") {
    return "Auto-remediation finished without a usable result. Recommended next steps follow.";
  }
  if (kind === "expired") {
    return "This remediation job is no longer available.";
  }
  const { before, after } = scores;
  const hasScores =
    typeof before === "number" &&
    typeof after === "number" &&
    Number.isFinite(before) &&
    Number.isFinite(after);
  return hasScores
    ? `Auto-remediation complete. Score before: ${Math.round(before)}. Score after: ${Math.round(after)}. Results follow.`
    : "Auto-remediation complete. Results follow.";
}

/**
 * The one predicate for whether the "Even a high score is not a guarantee"
 * warning appears beside a score — the AutomationLimitBand on both report
 * heroes, its box on the printable plan, its band in the HTML export, and the
 * qualifier line in the share email all call this, so the rule cannot drift
 * between surfaces.
 *
 * The rule (user, 2026-08-14): show it for any grade over a 79 — A and B.
 * Those are the grades that LOOK done: under the severity caps, 80+ means the
 * worst automated finding is Minor or nothing, which is exactly when a reader
 * closes the tab satisfied. A C/D/F report already leads with an action plan
 * full of work, and the ManualReviewCard still covers the human half there at
 * every score.
 *
 * Strict letter comparison on purpose: the letter is derived from the score
 * through the published scale on every surface (THE INVARIANT in
 * scorer.test.ts), so gating on it follows any future scale change for free —
 * and junk grades in forged shared reports simply don't summon the band.
 */
export function shouldShowAutomationLimit(grade: string | null | undefined): boolean {
  return grade === "A" || grade === "B";
}

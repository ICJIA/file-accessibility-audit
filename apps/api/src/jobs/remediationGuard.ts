/**
 * The remediation no-regression guard (user decision 2026-11-18).
 *
 * WAS: accept the output if the overall score did not drop. Two problems,
 * found in the 2026-11-18 product review: the guard compared "strict" with
 * "overall", which have been the same profile since v1.21, so it was one
 * check written twice; and an output could trade one category for another —
 * lose alt text, gain headings — and pass with the total unchanged.
 *
 * NOW an output is rejected if ANY of these is true:
 *   - the overall score dropped;
 *   - any category scored in the input scores lower in the output;
 *   - any category scored in the input is no longer assessed in the output
 *     (marking every image decorative makes alt text "not assessed" — that
 *     hides a problem rather than fixing it);
 *   - the output fails a WCAG criterion the input did not.
 *
 * Pure: takes the two stored audits, returns the reasons (empty = accept).
 */

interface AuditLike {
  overallScore?: number;
  categories?: Array<{ id?: string; label?: string; score?: number | null; notAssessed?: boolean }>;
  conformance?: { failures?: Array<{ sc?: string; name?: string }> };
}

export function remediationRegressions(input: unknown, output: unknown): string[] {
  const a = (input ?? {}) as AuditLike;
  const b = (output ?? {}) as AuditLike;
  const reasons: string[] = [];

  if (typeof a.overallScore === "number" && typeof b.overallScore === "number") {
    const d = b.overallScore - a.overallScore;
    if (d < 0) reasons.push(`overall score ${d}`);
  }

  const after = new Map((b.categories ?? []).map((c) => [c.id, c]));
  for (const before of a.categories ?? []) {
    if (!before.id || typeof before.score !== "number") continue;
    const now = after.get(before.id);
    const label = before.label ?? before.id;
    if (!now || typeof now.score !== "number") {
      reasons.push(`${label} could no longer be checked`);
      continue;
    }
    if (now.score < before.score) reasons.push(`${label} ${now.score - before.score}`);
  }

  const failingBefore = new Set((a.conformance?.failures ?? []).map((f) => f.sc));
  for (const f of b.conformance?.failures ?? []) {
    if (f.sc && !failingBefore.has(f.sc)) {
      reasons.push(`new WCAG failure ${f.sc}${f.name ? ` ${f.name}` : ""}`);
      failingBefore.add(f.sc); // report each criterion once
    }
  }
  return reasons;
}

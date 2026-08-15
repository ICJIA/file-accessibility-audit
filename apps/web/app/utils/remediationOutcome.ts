/**
 * Per-category dispositions for the remediation result page.
 *
 * The page used to bucket categories three ways — "fully fixed"
 * (score rose to ≥80), "improved but still low" (rose, still <80), and
 * severity-grouped "outstanding" — which let one category render twice
 * (reading_order 65→85 was both "fully fixed" and "Minor outstanding")
 * and let an unchanged one render with no statement that nothing changed
 * (user report 2026-08-15: text_extractability 85→85 for unembedded
 * fonts, shown only under three positive-sounding findings). The rule
 * now: every category flagged before or after remediation gets exactly
 * one disposition, so the results always say either what changed or that
 * nothing did.
 *
 * Pure module (no Vue) for the same reason as publishReadiness.ts: the
 * remediate page can only be source-scanned in tests, so the logic must
 * be executable on its own (app/__tests__/remediationOutcome.test.ts).
 */

export type RemediationDisposition = "fixed" | "improved" | "unchanged" | "declined" | "new";

interface CategoryLike {
  id?: unknown;
  label?: unknown;
  score?: unknown;
  severity?: unknown;
}

export interface CategoryOutcome {
  id: string;
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  /** Severity while still flagged — from the after audit when it scored
   *  the category, else from the before audit (after-missing edge). */
  severity: string;
  disposition: RemediationDisposition;
}

export interface RemediationOutcome {
  /** Flagged by the input audit, clean in the output audit. */
  fixed: CategoryOutcome[];
  /** Flagged in the output audit (or vanished while flagged) —
   *  Critical → Moderate → Minor, analyzer order within a severity. */
  stillFlagged: CategoryOutcome[];
}

const ISSUE_SEVERITIES = new Set(["Critical", "Moderate", "Minor"]);
const SEVERITY_RANK: Record<string, number> = { Critical: 0, Moderate: 1, Minor: 2 };

function isIssue(severity: unknown): severity is string {
  return typeof severity === "string" && ISSUE_SEVERITIES.has(severity);
}

function scoreOf(c: CategoryLike | undefined): number | null {
  return c && typeof c.score === "number" && Number.isFinite(c.score) ? c.score : null;
}

function sane(categories: unknown): Array<CategoryLike & { id: string }> {
  if (!Array.isArray(categories)) return [];
  return categories.filter(
    (c): c is CategoryLike & { id: string } =>
      !!c && typeof c === "object" && typeof (c as CategoryLike).id === "string",
  );
}

export function buildRemediationOutcome(
  beforeCategories: unknown,
  afterCategories: unknown,
): RemediationOutcome {
  const beforeList = sane(beforeCategories);
  const afterList = sane(afterCategories);
  const beforeById = new Map(beforeList.map((c) => [c.id, c]));
  const afterIds = new Set(afterList.map((c) => c.id));

  const fixed: CategoryOutcome[] = [];
  const stillFlagged: CategoryOutcome[] = [];

  for (const after of afterList) {
    const before = beforeById.get(after.id);
    const beforeScore = scoreOf(before);
    const afterScore = scoreOf(after);
    const delta = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null;
    const label = typeof after.label === "string" && after.label ? after.label : after.id;
    const base = { id: after.id, label, before: beforeScore, after: afterScore, delta };

    if (isIssue(after.severity)) {
      const disposition: RemediationDisposition =
        beforeScore === null
          ? "new"
          : delta !== null && delta > 0
            ? "improved"
            : delta !== null && delta < 0
              ? "declined"
              : "unchanged";
      stillFlagged.push({ ...base, severity: after.severity, disposition });
    } else if (isIssue(before?.severity)) {
      fixed.push({
        ...base,
        severity: String(after.severity ?? "No issues found"),
        disposition: "fixed",
      });
    }
    // Clean or not-applicable on both sides: nothing was flagged, nothing to report.
  }

  // A category the input audit flagged that the output audit doesn't carry
  // at all: there is no evidence it was fixed, so it stays visible.
  for (const before of beforeList) {
    if (afterIds.has(before.id) || !isIssue(before.severity)) continue;
    stillFlagged.push({
      id: before.id,
      label: typeof before.label === "string" && before.label ? before.label : before.id,
      before: scoreOf(before),
      after: null,
      delta: null,
      severity: before.severity,
      disposition: "unchanged",
    });
  }

  // Stable sort: severity first, analyzer emission order within it.
  stillFlagged.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));

  return { fixed, stillFlagged };
}

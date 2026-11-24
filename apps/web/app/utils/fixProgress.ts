/**
 * What the "Fix progress" panel counts, in exact words.
 *
 * WHY THIS EXISTS (2026-11-24). The panel said "5 of 9 checks passed" beside
 * a chart of SIX scored bars, two of them at 100. Both were honest by their
 * own rule — the count treated a check that did not apply (no tables, so no
 * table problem) as passed — but a reader comparing the sentence with the
 * chart saw two numbers that did not agree, and could not tell which checks
 * the sentence meant.
 *
 * So the sentence now says exactly what it counts:
 *   - SCORED checks are the ones with a number (the bars in the chart);
 *   - a check that did NOT APPLY to this document is named as such, not
 *     folded into "passed";
 *   - a check that could NOT BE ASSESSED is named separately again — it was
 *     never assumed good, and still is not.
 *
 * Nothing about the score changes: the score is computed by the engine, and
 * a not-applicable check never counted against it. This is only the wording
 * of the count. Plain counts, not a percentage — a second figure out of 100
 * next to the score would be one more thing to mistake for the grade.
 */

export interface FixProgressCategory {
  score?: number | null;
  notAssessed?: boolean;
}

export interface FixProgress {
  /** Checks that got a number — the bars in "Where the score comes from". */
  scored: number;
  /** Scored checks at 100. */
  passed: number;
  /** Scored checks below 100. */
  failed: number;
  /** No score because the document has nothing for the check to look at. */
  notApplicable: number;
  /** No score because the tool did not, or could not, evaluate it. */
  notAssessed: number;
  /** "2 of 6 scored checks passed" */
  headline: string;
  /** "3 other checks did not apply to this document; 1 could not be
   *  assessed." — null when every check was scored. */
  others: string | null;
  /** Width of the meter, 0–100: passed as a share of scored. */
  barPercent: number;
  /** True when nothing scored below 100 and at least one check was scored or
   *  did not apply — the panel's "every automated check passed" case. */
  nothingFailed: boolean;
}

export function fixProgress(categories: unknown): FixProgress {
  const list = (Array.isArray(categories) ? categories : []).filter(
    (c): c is FixProgressCategory => !!c && typeof c === "object",
  );
  let scored = 0;
  let passed = 0;
  let notApplicable = 0;
  let notAssessed = 0;
  for (const c of list) {
    if (typeof c.score === "number" && Number.isFinite(c.score)) {
      scored++;
      if (c.score === 100) passed++;
    } else if (c.notAssessed === true) {
      notAssessed++;
    } else {
      notApplicable++;
    }
  }
  const failed = scored - passed;

  const headline =
    scored === 0
      ? "No checks were scored"
      : `${passed} of ${scored} scored ${scored === 1 ? "check" : "checks"} passed`;

  const parts: string[] = [];
  if (notApplicable > 0) {
    parts.push(
      `${notApplicable} other ${notApplicable === 1 ? "check" : "checks"} did not apply to this document`,
    );
  }
  if (notAssessed > 0) {
    parts.push(
      `${notAssessed} ${parts.length ? "" : "other "}could not be assessed automatically`.replace(
        /\s+/g,
        " ",
      ),
    );
  }
  const others = parts.length ? `${parts.join("; ")}.` : null;

  return {
    scored,
    passed,
    failed,
    notApplicable,
    notAssessed,
    headline,
    others,
    barPercent: scored === 0 ? 0 : Math.round((passed / scored) * 100),
    nothingFailed: failed === 0 && scored + notApplicable > 0,
  };
}

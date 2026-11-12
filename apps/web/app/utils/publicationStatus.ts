/**
 * The ONE answer to "can this document be published?" — shared by every
 * surface that says so (banner, hero, action plan, printable plan, the
 * remediation result, and every export).
 *
 * WHY THIS EXISTS (review 2026-11-12). Each surface used to decide from
 * category SEVERITY alone. Severity measures extent: a Word file with 19 of
 * 20 images described is Minor on alt text. But the conformance gate measures
 * the rule: that one undescribed image is a confirmed WCAG 2.1 failure (1.1.1,
 * Level A). So the banner said "Optional fixes — this document passes
 * Illinois accessibility", the hero said "ready to publish", and the summary
 * beside them said the document does not meet WCAG 2.1 AA. A reader cannot
 * act on a report that answers its only question both ways.
 *
 * The rule now, in order:
 *   1. a Critical category blocks publication                 (as before)
 *   2. a confirmed WCAG 2.1 failure blocks publication        (NEW)
 *   3. a Moderate category: fixing is recommended             (as before)
 *   4. the gate could not reach a verdict: never a pass       (NEW)
 *   5. otherwise the document may be called ready             (as before)
 *
 * A payload with NO conformance block at all (a report stored before the gate
 * existed) keeps the severity-only answer: there is nothing to contradict.
 *
 * Pure module: no Vue, no DOM. Accepts `unknown` because /report/[id] feeds
 * it attacker-controllable stored JSON.
 */
import { severityForScore } from "@file-audit/shared";
import { tallySeverity, type SeverityTally } from "~/utils/severityTally";

export type VerdictTone = "critical" | "moderate" | "ok";

export type PublicationState =
  /** One or more Critical categories. */
  | "critical"
  /** No Critical category, but the gate confirmed WCAG 2.1 failure(s). */
  | "wcag-fail"
  | "moderate"
  /** The gate ran into a file it could not judge ("incomplete"). */
  | "undetermined"
  | "minor"
  | "clean";

export interface PublicationStatus {
  state: PublicationState;
  tone: VerdictTone;
  tally: SeverityTally;
  /** Confirmed WCAG 2.1 failures in the gate's own list. */
  failureCount: number;
  /** The gate reports a failure (by status, by list, or both). */
  wcagFails: boolean;
  /** The gate is present but reached no verdict ("incomplete"). */
  wcagUndetermined: boolean;
  /** The payload carries a conformance block at all. */
  conformanceKnown: boolean;
  /** The ONLY condition under which a surface may say passes / ready /
   *  optional / nothing to fix. */
  mayClaimPass: boolean;
  /** Anything at all for the author to fix. */
  hasFixes: boolean;
  /** Hero / printout clause — pairs with the grade adjective unless
   *  `tone === "critical"`, when it leads on its own. */
  verdictText: string;
  /** "2 WCAG 2.1 requirements are not met" — null unless the gate fails. */
  requirementSentence: string | null;
}

interface ConformanceLike {
  status?: unknown;
  failures?: unknown;
}

/** Category ids the gate attributes a confirmed failure to. */
export function failingCategoryIds(conformance: unknown): Set<string> {
  const out = new Set<string>();
  const failures = (conformance as ConformanceLike | null | undefined)?.failures;
  if (!Array.isArray(failures)) return out;
  for (const f of failures) {
    const category = (f as { category?: unknown } | null)?.category;
    if (typeof category === "string") out.add(category);
  }
  return out;
}

function countFailures(conformance: ConformanceLike | null): number {
  if (!conformance || !Array.isArray(conformance.failures)) return 0;
  return conformance.failures.filter((f) => !!f && typeof f === "object").length;
}

/** "1 WCAG 2.1 requirement is not met" / "3 WCAG 2.1 requirements are not
 *  met". A fail status with an empty list (a forged or truncated stored
 *  report) still fails — without inventing a number. */
function requirementSentenceFor(n: number): string {
  if (n <= 0) return "WCAG 2.1 requirements are not met";
  return `${n} WCAG 2.1 requirement${n === 1 ? " is" : "s are"} not met`;
}

export function publicationStatus(
  categories: Array<{ severity?: string | null }> | null | undefined,
  conformance?: unknown,
): PublicationStatus {
  const tally = tallySeverity(Array.isArray(categories) ? categories : []);
  const c =
    conformance && typeof conformance === "object" ? (conformance as ConformanceLike) : null;
  const conformanceKnown = c !== null;
  const failureCount = countFailures(c);
  const wcagFails = conformanceKnown && (c.status === "fail" || failureCount > 0);
  // Anything that is neither a failure nor the gate's explicit "none found"
  // is unknown — including a status this build has never heard of.
  const undetermined = conformanceKnown && !wcagFails && c.status !== "no-automated-failures";

  const base = {
    tally,
    failureCount,
    wcagFails,
    wcagUndetermined: undetermined,
    conformanceKnown,
    requirementSentence: wcagFails ? requirementSentenceFor(failureCount) : null,
    hasFixes: tally.critical + tally.moderate + tally.minor > 0 || wcagFails,
  };

  if (tally.critical > 0) {
    const n = tally.critical;
    return {
      ...base,
      state: "critical",
      tone: "critical",
      mayClaimPass: false,
      verdictText: `Not ready to publish — ${n} critical issue${n === 1 ? "" : "s"}`,
    };
  }
  if (wcagFails) {
    return {
      ...base,
      state: "wcag-fail",
      tone: "critical",
      mayClaimPass: false,
      verdictText:
        failureCount > 0
          ? `Not ready to publish — ${failureCount} WCAG 2.1 requirement${failureCount === 1 ? "" : "s"} not met`
          : "Not ready to publish — WCAG 2.1 requirements not met",
    };
  }
  if (tally.moderate > 0) {
    return {
      ...base,
      state: "moderate",
      tone: "moderate",
      mayClaimPass: false,
      verdictText: "fix recommended before publishing",
    };
  }
  if (undetermined) {
    return {
      ...base,
      state: "undetermined",
      tone: "moderate",
      mayClaimPass: false,
      verdictText: "not confirmed ready to publish — the WCAG 2.1 check could not be completed",
    };
  }
  return {
    ...base,
    state: tally.minor > 0 ? "minor" : "clean",
    tone: "ok",
    mayClaimPass: true,
    verdictText: "ready to publish",
  };
}

export const UNDETERMINED_SENTENCE =
  "The WCAG 2.1 check could not be completed for this file, so it is not confirmed ready to publish — a full manual review is needed.";

/** What a plan with NO steps says when a pass may not be claimed — the
 *  on-screen plan and the HTML export share it. */
export function emptyPlanSentence(status: PublicationStatus): string {
  if (status.wcagFails) {
    return `${status.requirementSentence} — fix before publishing. The WCAG 2.1 results in this report list each one.`;
  }
  return UNDETERMINED_SENTENCE;
}

/**
 * The line a surface shows when every scored category is at 100. Returns
 * null when "every automated check passed" may be said as it stands;
 * otherwise the sentence to say INSTEAD — the categories being clean does not
 * make the document clean when the gate failed something or judged nothing.
 */
export function allChecksPassedCaveat(status: PublicationStatus): string | null {
  if (status.mayClaimPass) return null;
  if (status.wcagFails) {
    return `Every scored category is at 100, but ${status.requirementSentence} — fix before publishing.`;
  }
  return "Every scored category is at 100, but the WCAG 2.1 check could not be completed for this file, so that is not confirmed as a pass.";
}

/**
 * The words beside a grade. The adjective ("Excellent") describes the score;
 * when something blocks publication the blocker leads and the adjective is
 * dropped, and when the gate reached no verdict the adjective is qualified.
 * A plain adjective is returned only when it cannot contradict the verdict.
 */
export function gradeLabelFor(adjective: string, status: PublicationStatus): string {
  if (status.tone === "critical") return status.verdictText;
  if (status.state === "undetermined") return `${adjective} — ${status.verdictText}`;
  return adjective;
}

/** Colour class for the action banner. */
export type BannerClass = "critical" | "moderate" | "minor" | "pass";

/**
 * The action banner's one line (Detailed view). `wcagVersion` only appears in
 * the clean-pass sentence, which names the audit's checklist basis.
 * Returns null when there are no categories and nothing is known to fail.
 */
export function publicationBanner(
  status: PublicationStatus,
  wcagVersion = "2.1",
): { text: string; class: BannerClass } | null {
  const t = status.tally;
  if (t.total === 0 && !status.wcagFails) return null;

  switch (status.state) {
    case "critical": {
      if (t.moderate > 0) {
        return {
          class: "critical",
          text: `${t.critical} critical and ${t.moderate} moderate issues must be fixed before publishing.`,
        };
      }
      return {
        class: "critical",
        text: `${t.critical} critical ${t.critical === 1 ? "issue" : "issues"} must be fixed before publishing.`,
      };
    }
    case "wcag-fail": {
      // Small in extent is true only when nothing scored worse than Minor —
      // and it is exactly the case a reader would otherwise wave through.
      const small =
        t.moderate === 0
          ? `, even though the ${status.failureCount === 1 ? "issue is" : "issues are"} small in extent`
          : "";
      return {
        class: "critical",
        text: `${status.requirementSentence} and must be fixed before publishing${small}.`,
      };
    }
    case "moderate":
      return {
        class: "moderate",
        text: `${t.moderate} moderate ${t.moderate === 1 ? "issue" : "issues"} found. Recommended to fix before publishing.`,
      };
    case "undetermined":
      return {
        class: "moderate",
        text:
          t.minor > 0
            ? `${t.minor} minor ${t.minor === 1 ? "issue" : "issues"} found. ${UNDETERMINED_SENTENCE}`
            : UNDETERMINED_SENTENCE,
      };
    case "minor":
      return {
        class: "minor",
        text: `${t.minor} minor ${t.minor === 1 ? "issue" : "issues"} found. Optional fixes — this document passes Illinois accessibility.`,
      };
    default:
      return {
        class: "pass",
        text: `This document passes Illinois IITAA 2.1 + WCAG ${wcagVersion} AA accessibility checks.`,
      };
  }
}

/** Machine-readable per-category status for exports — read from the SAME
 *  severity the screen shows (falling back to the shared thresholds for a
 *  payload with no severity), never from a second set of score bands. "fail"
 *  is the Critical severity; the word is kept because the JSON export has
 *  always used it and scripts may read it. */
export type ExportCategoryStatus =
  "pass" | "minor" | "moderate" | "fail" | "not-assessed" | "not-applicable";

export function exportCategoryStatus(cat: {
  score?: number | null;
  severity?: string | null;
  notAssessed?: boolean;
}): ExportCategoryStatus {
  if (cat.score === null || cat.score === undefined) {
    return cat.notAssessed ? "not-assessed" : "not-applicable";
  }
  switch (cat.severity ?? severityForScore(cat.score)) {
    case "Critical":
      return "fail";
    case "Moderate":
      return "moderate";
    case "Minor":
      return "minor";
    default:
      return "pass";
  }
}

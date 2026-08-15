/**
 * Remediation results must match the audit findings: every category the
 * audit flagged appears in the results with an explicit disposition —
 * changed (fixed / improved / got worse / new) or "No change" — never
 * silently absent, and never listed twice under contradictory headings.
 *
 * User report (2026-08-15): a fact sheet graded down for "Make the text
 * readable by screen readers" (85/Minor, unembedded fonts) was
 * auto-remediated and the results said nothing about it — the category sat
 * 85→85 in a severity list whose three visible findings were all positive
 * statements, while reading_order 65→85 appeared under BOTH "Fully fixed"
 * and "Minor issues still outstanding".
 *
 * Source-scanned like remediateDownloadPlacement.test.ts (a Nuxt page that
 * can't be mounted in isolation); the executable logic lives in
 * ~/utils/remediationOutcome.ts with its own behavior tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "..", "pages", "remediate", "[jobId].vue"), "utf-8");
const code = src.replace(/\/\/[^\n]*/g, "").replace(/<!--[\s\S]*?-->/g, "");

describe("remediate/[jobId].vue — results match the findings", () => {
  it("derives dispositions from utils/remediationOutcome, not inline score heuristics", () => {
    const block = src.match(/import \{[\s\S]*?\} from "~\/utils\/remediationOutcome";/)?.[0] ?? "";
    expect(block).toContain("buildRemediationOutcome");
    // The old inline buckets: "fixed" meant score ≥ 80 even when Minor
    // findings remained, which is how one category rendered as both fixed
    // and outstanding.
    expect(code).not.toMatch(/after\s*>=\s*80/);
  });

  it("states 'No change' in so many words for a category remediation could not improve", () => {
    expect(src).toContain("No change");
  });

  it("labels every disposition a flagged category can have", () => {
    // improved / declined / new all render distinct labels; the exact
    // wording is free to evolve but each state must be distinguishable.
    expect(code).toMatch(/improved/i);
    expect(code).toMatch(/declined|worse/i);
    expect(code).toMatch(/"new"|'new'|New after|Newly/);
  });

  it("shows before → after scores on still-flagged rows, so 'unchanged' is visible as numbers too", () => {
    // The still-flagged list itself renders each row's before and after
    // score (the score-comparison table above doesn't count — it shows the
    // overall score, not the per-finding one).
    expect(code).toMatch(/v-for="o in \w*[sS]tillFlagged\w*"/);
    expect(code).toMatch(/o\.before[\s\S]{0,400}o\.after/);
  });

  it("speaks the audit plan's language: still-flagged rows carry the action-plan step copy", () => {
    const block = src.match(/import \{[\s\S]*?\} from "~\/utils\/actionPlan";/)?.[0] ?? "";
    expect(block).toContain("buildActionPlan");
  });

  it("the fixed list comes from the outcome, so improved-but-still-flagged can never appear in it", () => {
    expect(code).toMatch(/outcome\.value\.fixed|outcome\.fixed/);
    // The severity-grouped triple duplication is gone: outstanding entries
    // render from one list, not three near-identical v-for blocks.
    expect(code).not.toContain("Improved but still needs a closer look");
  });

  it("keeps the outstanding count wired to the same list the rows render from", () => {
    expect(code).toMatch(/outstandingCount[\s\S]{0,120}stillFlagged\.length/);
  });
});

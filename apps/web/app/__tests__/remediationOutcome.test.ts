/**
 * buildRemediationOutcome — the per-category disposition behind the
 * remediation result page.
 *
 * User report (2026-08-15, ARI fact sheet): a category flagged by the audit
 * ("Make the text readable by screen readers", 85/Minor for unembedded
 * fonts) appeared nowhere in the remediation results as changed OR
 * unchanged — it sat 85→85 inside a severity list whose first three shown
 * findings were all positive statements. The rule now: every category that
 * was flagged before or is flagged after gets exactly one disposition —
 * fixed, improved, unchanged, declined, or new — so the results always
 * answer "what did remediation actually do to each finding?".
 *
 * The numbers in these fixtures are the real ARI remediation run
 * (60/D → 77/C): heading_structure 0→100, reading_order 65→85,
 * alt_text 42→46, text_extractability 85→85, title_language 50→50.
 */
import { describe, it, expect } from "vitest";
import { buildRemediationOutcome } from "../utils/remediationOutcome";

const cat = (id: string, score: number | null, severity: string | null) => ({
  id,
  label: id,
  score,
  severity,
});

const ISSUE = { Critical: "Critical", Moderate: "Moderate", Minor: "Minor" } as const;

describe("buildRemediationOutcome", () => {
  const before = [
    cat("text_extractability", 85, ISSUE.Minor),
    cat("title_language", 50, ISSUE.Moderate),
    cat("heading_structure", 0, ISSUE.Critical),
    cat("alt_text", 42, ISSUE.Moderate),
    cat("bookmarks", null, null),
    cat("link_quality", 100, "No issues found"),
    cat("reading_order", 65, ISSUE.Moderate),
  ];
  const after = [
    cat("text_extractability", 85, ISSUE.Minor),
    cat("title_language", 50, ISSUE.Moderate),
    cat("heading_structure", 100, "No issues found"),
    cat("alt_text", 46, ISSUE.Moderate),
    cat("bookmarks", null, null),
    cat("link_quality", 100, "No issues found"),
    cat("reading_order", 85, ISSUE.Minor),
  ];

  const outcome = buildRemediationOutcome(before, after);

  it("a flagged category that comes out clean is fixed", () => {
    expect(outcome.fixed.map((o) => o.id)).toEqual(["heading_structure"]);
    expect(outcome.fixed[0]).toMatchObject({ before: 0, after: 100, delta: 100 });
  });

  it("every still-flagged category appears exactly once, with its disposition", () => {
    const byId = Object.fromEntries(outcome.stillFlagged.map((o) => [o.id, o]));
    expect(byId.text_extractability).toMatchObject({
      disposition: "unchanged",
      before: 85,
      after: 85,
      delta: 0,
    });
    expect(byId.title_language).toMatchObject({ disposition: "unchanged", delta: 0 });
    expect(byId.alt_text).toMatchObject({ disposition: "improved", delta: 4 });
    expect(byId.reading_order).toMatchObject({ disposition: "improved", delta: 20 });
  });

  it("improved-but-still-flagged is NOT also counted as fixed (the reading_order double-listing)", () => {
    // Before this util, reading_order 65→85 rendered under BOTH "Fully
    // fixed" and "Minor issues still outstanding" on the same page.
    expect(outcome.fixed.map((o) => o.id)).not.toContain("reading_order");
    expect(outcome.stillFlagged.map((o) => o.id)).toContain("reading_order");
  });

  it("categories that were never flagged (clean or not applicable) are excluded", () => {
    const all = [...outcome.fixed, ...outcome.stillFlagged].map((o) => o.id);
    expect(all).not.toContain("bookmarks");
    expect(all).not.toContain("link_quality");
  });

  it("orders still-flagged Critical → Moderate → Minor, keeping analyzer order within a severity", () => {
    const b = [
      cat("a_minor", 85, ISSUE.Minor),
      cat("b_critical", 10, ISSUE.Critical),
      cat("c_moderate", 50, ISSUE.Moderate),
      cat("d_moderate", 55, ISSUE.Moderate),
    ];
    const out = buildRemediationOutcome(b, b);
    expect(out.stillFlagged.map((o) => o.id)).toEqual([
      "b_critical",
      "c_moderate",
      "d_moderate",
      "a_minor",
    ]);
  });

  it("a category that got worse is declined, never silently folded into 'unchanged'", () => {
    const out = buildRemediationOutcome(
      [cat("table_markup", 90, "No issues found")],
      [cat("table_markup", 75, ISSUE.Minor)],
    );
    expect(out.stillFlagged[0]).toMatchObject({ disposition: "declined", delta: -15 });
  });

  it("an issue with no scored 'before' (N/A that tagging made assessable) is new", () => {
    const out = buildRemediationOutcome(
      [cat("bookmarks", null, null)],
      [cat("bookmarks", 40, ISSUE.Moderate)],
    );
    expect(out.stillFlagged[0]).toMatchObject({ disposition: "new", before: null, after: 40 });
  });

  it("a flagged category missing from the after audit still shows, as unchanged", () => {
    const out = buildRemediationOutcome([cat("alt_text", 42, ISSUE.Moderate)], []);
    expect(out.stillFlagged[0]).toMatchObject({
      id: "alt_text",
      disposition: "unchanged",
      before: 42,
      after: null,
      severity: "Moderate",
    });
  });

  it("survives malformed input (forged stored receipts)", () => {
    expect(buildRemediationOutcome(null as never, undefined as never)).toEqual({
      fixed: [],
      stillFlagged: [],
    });
    expect(
      buildRemediationOutcome("junk" as never, [cat("alt_text", 42, ISSUE.Moderate)] as never)
        .stillFlagged[0]!.disposition,
    ).toBe("new");
  });
});

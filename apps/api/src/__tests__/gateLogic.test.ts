/**
 * Sabotage tests for the accuracy gates (v1.125.0).
 *
 * Every run of the score ledger, twin rule, and template fill so far has
 * been a happy path — nothing proved the alarms can RING. A gate that
 * cannot fire is theater. These tests feed the gates' pure decision logic
 * (scripts/gateLogic.mjs) exactly the failures they exist to catch and
 * assert the alarm goes off — and stays silent when nothing is wrong.
 */
import { describe, it, expect } from "vitest";
import { diffRow, twinViolations, fill } from "../../../../scripts/gateLogic.mjs";

describe("the golden score ledger can actually catch drift", () => {
  const blessed = {
    score: 89,
    grade: "B",
    categories: { alt_text: "100|none", table_markup: "60|Moderate" },
  };

  it("stays silent when nothing moved", () => {
    expect(diffRow("doc.pdf", blessed, { ...blessed })).toEqual([]);
  });

  it("fires when the overall score moves", () => {
    const drifted = { ...blessed, score: 79, grade: "C" };
    const out = diffRow("doc.pdf", blessed, drifted);
    expect(out.join("\n")).toMatch(/89\/B -> 79\/C/);
  });

  it("fires when only a category verdict moves, even with the score unchanged", () => {
    const drifted = { ...blessed, categories: { ...blessed.categories, alt_text: "0|Critical" } };
    const out = diffRow("doc.pdf", blessed, drifted);
    expect(out.join("\n")).toMatch(/alt_text 100\|none -> 0\|Critical/);
  });

  it("fires when a category disappears entirely", () => {
    const drifted = { ...blessed, categories: { alt_text: "100|none" } };
    const out = diffRow("doc.pdf", blessed, drifted);
    expect(out.join("\n")).toMatch(/table_markup 60\|Moderate -> \(absent\)/);
  });

  it("fires when a file that must keep failing starts succeeding — and vice versa", () => {
    const pinnedFailure = { error: "Unsupported legacy format" };
    const nowSucceeds = { score: 50, grade: "D", categories: {} };
    expect(diffRow("old.xls", pinnedFailure, nowSucceeds).length).toBeGreaterThan(0);
    expect(diffRow("old.xls", nowSucceeds, pinnedFailure).length).toBeGreaterThan(0);
    expect(diffRow("old.xls", pinnedFailure, { ...pinnedFailure })).toEqual([]);
  });
});

describe("the twin rule can actually catch an inversion", () => {
  const doc = (overall: number, altScore: number | null) => ({
    overallScore: overall,
    categories: [{ id: "alt_text", score: altScore }],
  });

  it("holds silent when the correct twin wins", () => {
    expect(twinViolations(doc(69, 40), doc(100, 100), "alt_text")).toEqual([]);
  });

  it("holds silent on a tie — equal is not an inversion", () => {
    expect(twinViolations(doc(89, 100), doc(89, 100), "alt_text")).toEqual([]);
  });

  it("fires when the flawed twin outscores overall", () => {
    const out = twinViolations(doc(95, 40), doc(89, 100), "alt_text");
    expect(out.join("\n")).toMatch(/overall 95 > 89/);
  });

  it("fires when the flawed twin outscores in the defect's own category", () => {
    const out = twinViolations(doc(69, 100), doc(89, 60), "alt_text");
    expect(out.join("\n")).toMatch(/alt_text 100 > 60/);
  });

  it("never compares an unscored (null) category — nothing to invert", () => {
    expect(twinViolations(doc(69, null), doc(89, 100), "alt_text")).toEqual([]);
  });
});

describe("the template fill refuses to ship a broken page", () => {
  it("fills known placeholders", () => {
    expect(fill("All {{TRAPS}} held", { TRAPS: "115" })).toBe("All 115 held");
  });

  it("throws on a placeholder with no value — a template typo must fail the build", () => {
    expect(() => fill("All {{TRPAS}} held", { TRAPS: "115" })).toThrow(/TRPAS/);
  });
});

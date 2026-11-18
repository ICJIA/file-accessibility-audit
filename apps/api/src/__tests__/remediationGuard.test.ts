/**
 * The remediation guard (user decision 2026-11-18): reject an output that
 * makes ANY category worse, stops being able to check one, or fails a WCAG
 * criterion the input did not — not only one whose total drops.
 */
import { describe, it, expect } from "vitest";
import { remediationRegressions } from "../jobs/remediationGuard.js";

const audit = (overall: number, cats: Array<[string, number | null]>, failing: string[] = []) => ({
  overallScore: overall,
  categories: cats.map(([id, score]) => ({ id, label: id, score, notAssessed: score === null })),
  conformance: { failures: failing.map((sc) => ({ sc, name: "x" })) },
});

describe("remediationRegressions", () => {
  it("accepts an output that improves or holds every category", () => {
    expect(
      remediationRegressions(
        audit(
          60,
          [
            ["headings", 40],
            ["alt_text", 50],
          ],
          ["1.3.1"],
        ),
        audit(
          80,
          [
            ["headings", 90],
            ["alt_text", 50],
          ],
          [],
        ),
      ),
    ).toEqual([]);
  });

  it("rejects a trade: one category up, another down, the total unchanged", () => {
    const r = remediationRegressions(
      audit(70, [
        ["headings", 40],
        ["alt_text", 100],
      ]),
      audit(70, [
        ["headings", 100],
        ["alt_text", 40],
      ]),
    );
    expect(r).toEqual(["alt_text -60"]);
  });

  it("rejects hiding a problem: a scored category that is no longer assessed", () => {
    const r = remediationRegressions(audit(50, [["alt_text", 0]]), audit(60, [["alt_text", null]]));
    expect(r).toEqual(["alt_text could no longer be checked"]);
  });

  it("rejects a new WCAG failure even when every score held", () => {
    const r = remediationRegressions(
      audit(80, [["tables", 80]], ["1.3.1"]),
      audit(80, [["tables", 80]], ["1.3.1", "2.4.2"]),
    );
    expect(r).toEqual(["new WCAG failure 2.4.2 x"]);
  });

  it("rejects a drop in the total", () => {
    expect(remediationRegressions(audit(80, []), audit(75, []))).toEqual(["overall score -5"]);
  });

  it("a category not assessed in the input may become assessed (that is progress)", () => {
    expect(
      remediationRegressions(
        audit(50, [["reading_order", null]]),
        audit(60, [["reading_order", 80]]),
      ),
    ).toEqual([]);
  });
});

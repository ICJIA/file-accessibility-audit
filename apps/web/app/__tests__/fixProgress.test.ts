/**
 * The "Fix progress" sentence says exactly what it counts (2026-11-24).
 * A real report read "5 of 9 checks passed" beside a chart of six scored
 * bars, two of them at 100.
 */
import { describe, it, expect } from "vitest";
import { fixProgress } from "../utils/fixProgress";

const scored = (score: number) => ({ score });
const na = { score: null };
const notAssessed = { score: null, notAssessed: true };

describe("fixProgress", () => {
  it("the reported case: 2 of 6 scored, 3 did not apply, 1 not assessed", () => {
    const p = fixProgress([
      scored(100),
      scored(100),
      scored(40),
      scored(0),
      scored(75),
      scored(99),
      na,
      na,
      na,
      notAssessed,
    ]);
    expect(p.headline).toBe("2 of 6 scored checks passed");
    expect(p.others).toBe(
      "3 other checks did not apply to this document; 1 could not be assessed automatically.",
    );
    expect(p).toMatchObject({ scored: 6, passed: 2, failed: 4, notApplicable: 3, notAssessed: 1 });
    expect(p.barPercent).toBe(33);
    expect(p.nothingFailed).toBe(false);
  });

  it("never counts a not-applicable check as passed", () => {
    const p = fixProgress([scored(100), na, na]);
    expect(p.passed).toBe(1);
    expect(p.scored).toBe(1);
    expect(p.headline).toBe("1 of 1 scored check passed");
    expect(p.others).toBe("2 other checks did not apply to this document.");
    expect(p.nothingFailed).toBe(true);
  });

  it("never counts a not-assessed check as passed, and names it", () => {
    const p = fixProgress([scored(100), notAssessed]);
    expect(p.passed).toBe(1);
    expect(p.others).toBe("1 other could not be assessed automatically.");
  });

  it("says nothing extra when every check was scored", () => {
    const p = fixProgress([scored(100), scored(50)]);
    expect(p.headline).toBe("1 of 2 scored checks passed");
    expect(p.others).toBeNull();
    expect(p.barPercent).toBe(50);
  });

  it("a document where nothing could be scored does not read as a failure or a pass count", () => {
    const p = fixProgress([na, na]);
    expect(p.headline).toBe("No checks were scored");
    expect(p.barPercent).toBe(0);
    expect(p.nothingFailed).toBe(true);
  });

  it("only not-assessed checks is not 'nothing failed' — nothing was verified", () => {
    expect(fixProgress([notAssessed]).nothingFailed).toBe(false);
  });

  it("survives junk input (raw stored JSON on the shared page)", () => {
    expect(fixProgress(undefined).headline).toBe("No checks were scored");
    expect(fixProgress("x").scored).toBe(0);
    expect(fixProgress([null, 3, { score: "100" }]).scored).toBe(0);
  });
});

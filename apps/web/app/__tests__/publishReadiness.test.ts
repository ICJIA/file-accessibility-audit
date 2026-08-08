import { describe, it, expect } from "vitest";
import {
  afterGradeOf,
  afterCategoriesOf,
  publishVerdictFor,
  isPublishReady,
} from "../utils/publishReadiness";

// The remediation result page answers exactly one question for a
// non-technical author: can I publish this?
//
// It used to answer it with `grade === "A"`, while the audit report answered
// the same question with `publicationVerdict` (a severity tally). On one real
// file — graded B with three Minor findings and nothing worse — the audit page
// said "ready to publish" and the remediation page said "Not ready to publish
// yet". Same PDF, opposite answers.
//
// The audit page's rule won, because it is the rule the grade ladder already
// publishes everywhere: A = nothing found, B = only minor items, C = a real
// problem, D/F = do not publish. Treating B as unpublishable contradicted our
// own scale. Both surfaces now call the same function, so they cannot drift.

const cat = (severity: string) => ({ severity, score: severity === "No issues found" ? 100 : 50 });

describe("afterGradeOf", () => {
  it("prefers the strict profile's grade over the top-level grade", () => {
    expect(afterGradeOf({ grade: "A", scoreProfiles: { strict: { grade: "C" } } })).toBe("C");
  });

  it("falls back to the top-level grade when there is no strict profile", () => {
    expect(afterGradeOf({ grade: "B" })).toBe("B");
  });

  it("returns null rather than throwing on malformed input", () => {
    expect(afterGradeOf(null)).toBeNull();
    expect(afterGradeOf(undefined)).toBeNull();
    expect(afterGradeOf("nonsense")).toBeNull();
    expect(afterGradeOf({})).toBeNull();
  });
});

describe("afterCategoriesOf", () => {
  it("prefers the strict profile's categories, matching afterGradeOf", () => {
    // The verdict and the grade beside it must describe the same profile.
    const out = {
      categories: [cat("Critical")],
      scoreProfiles: { strict: { categories: [cat("Minor")] } },
    };
    expect(afterCategoriesOf(out)).toEqual([cat("Minor")]);
  });

  it("falls back to top-level categories", () => {
    expect(afterCategoriesOf({ categories: [cat("Moderate")] })).toEqual([cat("Moderate")]);
  });

  it("returns an empty array rather than throwing on malformed input", () => {
    expect(afterCategoriesOf(null)).toEqual([]);
    expect(afterCategoriesOf("nonsense")).toEqual([]);
    expect(afterCategoriesOf({ categories: "junk" })).toEqual([]);
  });
});

describe("publishVerdictFor — the same answer the audit report gives", () => {
  it("blocks on a Critical finding", () => {
    const v = publishVerdictFor({ categories: [cat("Critical"), cat("No issues found")] });
    expect(v.tone).toBe("critical");
    expect(v.text).toContain("Not ready to publish");
  });

  it("cautions on a Moderate finding", () => {
    const v = publishVerdictFor({ categories: [cat("Moderate")] });
    expect(v.tone).toBe("moderate");
    expect(v.text).toBe("fix recommended before publishing");
  });

  it("is READY with only Minor findings — the case that was contradicting itself", () => {
    // The reported file: grade B, three Minor, nothing worse. The audit page
    // called this publishable; the remediation page did not.
    const v = publishVerdictFor({
      categories: [cat("Minor"), cat("Minor"), cat("Minor"), cat("No issues found")],
    });
    expect(v.tone).toBe("ok");
    expect(v.text).toBe("ready to publish");
    expect(isPublishReady({ categories: [cat("Minor")] })).toBe(true);
  });

  it("is ready on a clean sweep", () => {
    expect(isPublishReady({ categories: [cat("No issues found")] })).toBe(true);
  });
});

describe("FAILS CLOSED when the audit cannot be read", () => {
  // publicationVerdict on an empty list returns "ready to publish", because
  // nothing is wrong when nothing is known. Correct for a clean report and
  // dangerous here: it would tell someone a file is publishable because we
  // failed to assess it. The old `grade === "A"` gate got this right by
  // accident (null !== "A"); this now gets it right on purpose.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a non-object", "nonsense"],
    ["an empty object", {}],
    ["malformed categories", { categories: "junk" }],
    ["an empty category list", { categories: [] }],
  ])("is NOT publish-ready for %s", (_label, input) => {
    expect(isPublishReady(input)).toBe(false);
    expect(publishVerdictFor(input).tone).toBe("critical");
  });

  it("says why, rather than implying findings that were never measured", () => {
    expect(publishVerdictFor(null).text).toContain("could not be re-checked");
  });
});

describe("the two surfaces cannot disagree", () => {
  it("derives readiness from the verdict rather than duplicating its thresholds", () => {
    // If someone later changes publicationVerdict's ladder, this moves with
    // it. That coupling is the point of the fix.
    for (const sev of ["Critical", "Moderate", "Minor", "No issues found"]) {
      const audit = { categories: [cat(sev)] };
      const verdict = publishVerdictFor(audit);
      expect(isPublishReady(audit)).toBe(verdict.tone === "ok");
    }
  });
});

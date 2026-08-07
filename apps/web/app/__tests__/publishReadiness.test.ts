import { describe, it, expect } from "vitest";
import { afterGradeOf, isPublishReady } from "../utils/publishReadiness";

describe("afterGradeOf", () => {
  it("prefers the strict profile's grade over the top-level grade", () => {
    expect(afterGradeOf({ grade: "B", scoreProfiles: { strict: { grade: "A" } } })).toBe("A");
  });

  it("falls back to the top-level grade when there's no strict profile", () => {
    expect(afterGradeOf({ grade: "B" })).toBe("B");
  });

  it("falls back to the top-level grade when scoreProfiles.strict has no grade", () => {
    expect(afterGradeOf({ grade: "C", scoreProfiles: {} })).toBe("C");
  });

  it("returns null when neither the strict profile nor the top-level grade is present", () => {
    expect(afterGradeOf({})).toBeNull();
  });

  it("returns null for undefined and null input", () => {
    expect(afterGradeOf(undefined)).toBeNull();
    expect(afterGradeOf(null)).toBeNull();
  });

  it("returns null for malformed/non-object input without throwing", () => {
    expect(() => afterGradeOf("A")).not.toThrow();
    expect(afterGradeOf("A")).toBeNull();
    expect(afterGradeOf(42)).toBeNull();
    expect(afterGradeOf(true)).toBeNull();
    expect(afterGradeOf([])).toBeNull();
  });
});

describe("isPublishReady", () => {
  it("is ready at a clean grade A", () => {
    expect(isPublishReady("A")).toBe(true);
  });

  it("is not ready at grade B", () => {
    expect(isPublishReady("B")).toBe(false);
  });

  it("is not ready when the grade is missing", () => {
    expect(isPublishReady(null)).toBe(false);
  });

  it("fails closed on a lowercase 'a'", () => {
    expect(isPublishReady("a")).toBe(false);
  });

  it('fails closed on "A+"', () => {
    expect(isPublishReady("A+")).toBe(false);
  });
});

// The page never calls either function in isolation — this mirrors the
// actual computed chain (afterGrade -> isPublishReady) so the gate is
// covered exactly as it's exercised in apps/web/app/pages/remediate/[jobId].vue.
describe("afterGradeOf + isPublishReady (the page's actual usage)", () => {
  it("is ready when the strict profile grades a clean A", () => {
    const outputAudit = { grade: "A", scoreProfiles: { strict: { grade: "A" } } };
    expect(isPublishReady(afterGradeOf(outputAudit))).toBe(true);
  });

  it("is not ready at grade B via the strict profile, even if the top-level grade is A", () => {
    const outputAudit = { grade: "A", scoreProfiles: { strict: { grade: "B" } } };
    expect(isPublishReady(afterGradeOf(outputAudit))).toBe(false);
  });

  it("uses the top-level grade when there's no strict profile, and gates on it", () => {
    expect(isPublishReady(afterGradeOf({ grade: "A" }))).toBe(true);
    expect(isPublishReady(afterGradeOf({ grade: "B" }))).toBe(false);
  });

  it("is not ready when the grade is missing entirely", () => {
    expect(isPublishReady(afterGradeOf({}))).toBe(false);
    expect(isPublishReady(afterGradeOf(undefined))).toBe(false);
  });

  it("is not ready for malformed/non-object input, and never throws", () => {
    expect(() => isPublishReady(afterGradeOf("not an object"))).not.toThrow();
    expect(isPublishReady(afterGradeOf("not an object"))).toBe(false);
    expect(isPublishReady(afterGradeOf(123))).toBe(false);
    expect(isPublishReady(afterGradeOf([]))).toBe(false);
  });
});

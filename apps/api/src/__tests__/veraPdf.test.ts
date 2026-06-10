/**
 * Tests for veraPDF JSON verdict extraction (extractVerdict).
 *
 * Shape mirrors veraPDF 1.30.x `--format json` output: ruleSummaries entries
 * carry `ruleStatus` ("FAILED" — a status, NOT an identifier), with the rule
 * identified by specification + clause + testNumber. The UI shows ruleId in
 * a mono span, so it must be the real rule identifier ("7.1-1"), never the
 * status string.
 */
import { describe, it, expect } from "vitest";
import { extractVerdict } from "../services/veraPdf.js";

const vera130NonCompliant = {
  report: {
    jobs: [
      {
        validationResult: [
          {
            profileName: "PDF/UA-1 validation profile",
            isCompliant: false,
            details: {
              passedRules: 100,
              failedRules: 2,
              passedChecks: 512,
              failedChecks: 7,
              ruleSummaries: [
                {
                  ruleStatus: "FAILED",
                  specification: "ISO 14289-1:2014",
                  clause: "7.1",
                  testNumber: 1,
                  status: "failed",
                  failedChecks: 4,
                  description: "Content shall be marked as Artifact or tagged",
                },
                {
                  ruleStatus: "FAILED",
                  specification: "ISO 14289-1:2014",
                  clause: "7.21.4.2",
                  testNumber: 2,
                  status: "failed",
                  failedChecks: 3,
                  description: "Fonts shall be embedded",
                },
              ],
            },
          },
        ],
      },
    ],
  },
};

describe("extractVerdict — veraPDF 1.30.x shape", () => {
  it("uses clause-testNumber as the rule identifier, never the status string", () => {
    const v = extractVerdict(vera130NonCompliant, false);
    expect(v.failures.map((f) => f.ruleId)).toEqual(["7.1-1", "7.21.4.2-2"]);
    expect(v.failures.every((f) => f.ruleId !== "FAILED")).toBe(true);
  });

  it("keeps clause and per-rule counts", () => {
    const v = extractVerdict(vera130NonCompliant, false);
    expect(v.failures[0].clause).toBe("7.1");
    expect(v.failures[0].count).toBe(4);
    expect(v.failures[0].description).toContain("Artifact");
  });

  it("prefers the authoritative details.failedChecks total", () => {
    const v = extractVerdict(vera130NonCompliant, false);
    expect(v.totalFailureCount).toBe(7);
    expect(v.passed).toBe(false);
    expect(v.available).toBe(true);
  });

  it("reports passed for a compliant result", () => {
    const v = extractVerdict(
      {
        report: {
          jobs: [
            {
              validationResult: [
                {
                  profileName: "PDF/UA-1 validation profile",
                  isCompliant: true,
                  details: { failedChecks: 0, ruleSummaries: [] },
                },
              ],
            },
          ],
        },
      },
      false,
    );
    expect(v.passed).toBe(true);
    expect(v.failures).toEqual([]);
  });
});

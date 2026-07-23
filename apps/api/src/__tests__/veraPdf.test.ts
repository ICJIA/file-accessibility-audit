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

describe("extractVerdict — sorting and distinct-rule count", () => {
  it("sorts failing rules by occurrence count (desc) before truncation", () => {
    const parsed = {
      report: {
        jobs: [
          {
            validationResult: [
              {
                profileName: "PDF/UA-1 validation profile",
                isCompliant: false,
                details: {
                  failedChecks: 16,
                  ruleSummaries: [
                    {
                      specification: "ISO 14289-1",
                      clause: "7.1",
                      testNumber: 1,
                      failedChecks: 2,
                      description: "a",
                    },
                    {
                      specification: "ISO 14289-1",
                      clause: "7.2",
                      testNumber: 1,
                      failedChecks: 9,
                      description: "b",
                    },
                    {
                      specification: "ISO 14289-1",
                      clause: "7.3",
                      testNumber: 1,
                      failedChecks: 5,
                      description: "c",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const v = extractVerdict(parsed, false);
    expect(v.failures.map((f) => f.count)).toEqual([9, 5, 2]);
    expect(v.failures[0].ruleId).toBe("7.2-1");
    expect(v.distinctRuleCount).toBe(3);
  });

  it("caps the stored list at 20 but keeps the true distinct count and the highest-count rules", () => {
    const ruleSummaries = Array.from({ length: 25 }, (_, i) => ({
      specification: "ISO 14289-1",
      clause: "8." + (i + 1),
      testNumber: 1,
      failedChecks: i + 1,
      description: "rule " + (i + 1),
    }));
    const parsed = {
      report: {
        jobs: [
          {
            validationResult: [
              {
                profileName: "PDF/UA-1",
                isCompliant: false,
                details: { failedChecks: 325, ruleSummaries },
              },
            ],
          },
        ],
      },
    };
    const v = extractVerdict(parsed, false);
    expect(v.failures).toHaveLength(20);
    expect(v.distinctRuleCount).toBe(25);
    expect(v.failures[0].count).toBe(25); // highest kept, sorted first
    expect(Math.min(...v.failures.map((f) => f.count))).toBe(6); // counts 1..5 dropped
  });

  it("reports distinctRuleCount 0 when veraPDF output has no validation result", () => {
    const v = extractVerdict({}, false);
    expect(v.distinctRuleCount).toBe(0);
    expect(v.error).toBeTruthy();
  });
});

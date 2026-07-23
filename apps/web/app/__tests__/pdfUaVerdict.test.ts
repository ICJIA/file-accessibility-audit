import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PdfUaVerdict from "../components/PdfUaVerdict.vue";

const base = {
  available: true,
  passed: false,
  profile: "ua1",
  totalFailureCount: 2,
  failures: [
    { ruleId: "7.1-1", clause: "7.1", description: "Structure element missing", count: 2 },
  ],
};

describe("PdfUaVerdict.vue", () => {
  it("renders nothing when veraPDF is unavailable", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: { ...base, available: false } } });
    expect(w.text()).toBe("");
  });
  it("frames the non-pass verdict as additional checks — never the bare words Fail or Conformant", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).toMatch(/PDF\/UA-1 machine checks/i);
    expect(w.text()).toMatch(/additional checks could be addressed/i);
    expect(w.text()).not.toMatch(/\bFail\b/);
    expect(w.text()).not.toMatch(/\bConformant\b/);
    expect(w.text()).toMatch(/manual review/i);
  });
  it("hides failed checkpoints by default (collapsed)", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).not.toContain("Structure element missing");
  });
  it("lists failed checkpoints (clause, description, count) after expanding", async () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("7.1");
    expect(w.text()).toContain("Structure element missing");
    expect(w.text()).toContain("2");
  });
  it("shows an actionable 'Fix:' hint under each failed checkpoint", async () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          ...base,
          failures: [
            {
              ruleId: "7.1-2",
              clause: "7.1",
              description:
                "Content shall either be marked as an Artifact or tagged as real content.",
              count: 3,
            },
          ],
        },
      },
    });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("Fix:");
    expect(w.text()).toMatch(/artifact/i);
  });
  it("shows ruleId when clause is only a coarse string-prefix, not a true '<clause>-' match (regression)", async () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          ...base,
          failures: [
            { ruleId: "7.1-3", clause: "7", description: "Unrelated checkpoint", count: 1 },
          ],
        },
      },
    });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("7.1-3");
  });
  it("shows a Pass badge with no checkpoint list when passed", () => {
    const w = mount(PdfUaVerdict, {
      props: { verdict: { ...base, passed: true, totalFailureCount: 0, failures: [] } },
    });
    expect(w.text()).toMatch(/Pass/);
  });
  it("shows a neutral 'Could not validate' state when veraPDF errored, never a Fail verdict", () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          available: true,
          passed: false,
          profile: "ua1",
          error: "veraPDF timed out",
          totalFailureCount: 0,
          failures: [],
        },
      },
    });
    expect(w.text()).toMatch(/could not validate/i);
    expect(w.text()).toContain("veraPDF timed out");
    expect(w.text()).not.toMatch(/\b(Pass|Fail)\b/);
    expect(w.find("button").exists()).toBe(false);
  });
});

describe("PdfUaVerdict.vue — number reframe", () => {
  const failVerdict = (over = {}) => ({
    available: true,
    passed: false,
    profile: "ua1",
    distinctRuleCount: 4,
    totalFailureCount: 1000,
    failures: [
      { ruleId: "7.1-1", clause: "7.1", description: "figure lacks alt text", count: 500 },
      { ruleId: "8.4-2", clause: "8.4", description: "TH cell missing Scope", count: 300 },
      { ruleId: "7.2-1", clause: "7.2", description: "heading skip", count: 100 },
      { ruleId: "6.3-1", clause: "6.3", description: "metadata missing", count: 100 },
    ],
    ...over,
  });

  it("leads with distinct rule types and demotes the occurrence total", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/4 rule types to fix/);
    expect(w.text()).toMatch(/1,000 total occurrences/);
  });

  it("explains that veraPDF counts every occurrence", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/counts every occurrence separately/i);
    expect(w.text()).toMatch(/These 4 rule types account for all 1,000/);
  });

  it("shows the Pareto clause when the top 3 dominate (>=4 types, >=60%)", () => {
    // top 3 = 500 + 300 + 100 = 900 of 1000 = 90%
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/top 3 cause ~90% of them/);
  });

  it("omits the Pareto clause for a flat distribution (<60%)", () => {
    const flat = failVerdict({
      distinctRuleCount: 6,
      totalFailureCount: 600,
      failures: Array.from({ length: 6 }, (_, i) => ({
        ruleId: "9." + (i + 1) + "-1",
        clause: "9." + (i + 1),
        description: "rule " + (i + 1),
        count: 100,
      })),
    });
    const w = mount(PdfUaVerdict, { props: { verdict: flat } });
    expect(w.text()).toMatch(/counts every occurrence separately/i);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("omits the Pareto clause when there are fewer than 4 rule types", () => {
    const three = failVerdict({
      distinctRuleCount: 3,
      totalFailureCount: 520,
      failures: [
        { ruleId: "7.1-1", clause: "7.1", description: "a", count: 500 },
        { ruleId: "7.2-1", clause: "7.2", description: "b", count: 10 },
        { ruleId: "7.3-1", clause: "7.3", description: "c", count: 10 },
      ],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: three } });
    expect(w.text()).toMatch(/3 rule types to fix/);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("uses singular copy for a single rule type", () => {
    const one = failVerdict({
      distinctRuleCount: 1,
      totalFailureCount: 42,
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "a", count: 42 }],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: one } });
    expect(w.text()).toMatch(/1 rule type to fix/);
    expect(w.text()).toMatch(/This rule type accounts for all 42/);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("shows 'top N of M' in the toggle when more distinct rules exist than were stored", () => {
    const many = failVerdict({
      distinctRuleCount: 34,
      totalFailureCount: 5000,
      failures: Array.from({ length: 20 }, (_, i) => ({
        ruleId: "8." + (i + 1) + "-1",
        clause: "8." + (i + 1),
        description: "rule " + (i + 1),
        count: 20 - i,
      })),
    });
    const w = mount(PdfUaVerdict, { props: { verdict: many } });
    expect(w.text()).toMatch(/34 rule types to fix/);
    expect(w.find("button").text()).toMatch(/top 20 of 34 rule types/i);
  });

  it("falls back to the shown list length when distinctRuleCount is absent (legacy report)", () => {
    const legacy = {
      available: true,
      passed: false,
      profile: "ua1",
      totalFailureCount: 8,
      failures: [
        { ruleId: "7.1-1", clause: "7.1", description: "a", count: 5 },
        { ruleId: "7.2-1", clause: "7.2", description: "b", count: 3 },
      ],
    };
    const w = mount(PdfUaVerdict, { props: { verdict: legacy } });
    expect(w.text()).toMatch(/2 rule types to fix/);
  });

  it("orders the expanded list most-frequent-first even if props arrive unsorted", async () => {
    const unsorted = failVerdict({
      distinctRuleCount: 3,
      totalFailureCount: 16,
      failures: [
        { ruleId: "AAA-1", clause: "7.1", description: "low", count: 2 },
        { ruleId: "BBB-1", clause: "7.2", description: "high", count: 9 },
        { ruleId: "CCC-1", clause: "7.3", description: "mid", count: 5 },
      ],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: unsorted } });
    await w.find("button").trigger("click");
    const items = w.findAll("li");
    expect(items.at(0)!.text()).toContain("BBB-1"); // count 9 first
    expect(items.at(2)!.text()).toContain("AAA-1"); // count 2 last
  });
});

describe("PdfUaVerdict.vue — Don't Panic badge + grade-aware reconciliation", () => {
  const failV = (over = {}) => ({
    available: true,
    passed: false,
    profile: "ua1",
    distinctRuleCount: 2,
    totalFailureCount: 5,
    failures: [
      { ruleId: "7.21.4.2-2", clause: "7.21.4.2", description: "CIDSet incomplete", count: 3 },
      {
        ruleId: "7.1-3",
        clause: "7.1",
        description: "Content shall be marked as Artifact",
        count: 2,
      },
    ],
    ...over,
  });

  it("shows the Don't Panic badge (with the Adams wink) when grade is good (A) and veraPDF fails", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failV(), grade: "A" } });
    expect(w.get('[data-testid="pdfua-dont-panic"]').text()).toBe("Don't Panic");
    expect(w.html()).toContain("In large, friendly letters");
    expect(w.html()).toContain("Hitchhiker"); // the deeper Adams nod on hover
    expect(w.text()).toMatch(/You're in good shape/);
  });

  it("also shows the badge for a B grade", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failV(), grade: "B" } });
    expect(w.find('[data-testid="pdfua-dont-panic"]').exists()).toBe(true);
  });

  it("does NOT show the badge for a poor grade (D) — honest framing instead", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failV(), grade: "D" } });
    expect(w.find('[data-testid="pdfua-dont-panic"]').exists()).toBe(false);
    expect(w.text()).toMatch(/Worth your attention/);
    expect(w.text()).not.toMatch(/You're in good shape/);
  });

  it("shows a neutral reconciliation (no badge, no reassurance claim) when no grade is provided", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failV() } });
    expect(w.find('[data-testid="pdfua-dont-panic"]').exists()).toBe(false);
    expect(w.text()).not.toMatch(/You're in good shape/);
    expect(w.text()).toMatch(/different questions/i);
  });

  it("explains why the tools differ (Acrobat/PAC/veraPDF) only on expand", async () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failV(), grade: "A" } });
    expect(w.text()).not.toMatch(/Adobe Acrobat, PAC/); // collapsed by default
    await w.get('[data-testid="pdfua-why-toggle"]').trigger("click");
    expect(w.text()).toMatch(/Adobe Acrobat, PAC, and veraPDF/);
    expect(w.text()).toMatch(/punch-list/i);
    expect(w.text()).toMatch(/WCAG 2\.2 AA/);
  });

  it("shows no badge or reconciliation when veraPDF passes", () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          ...failV(),
          passed: true,
          totalFailureCount: 0,
          failures: [],
          distinctRuleCount: 0,
        },
        grade: "A",
      },
    });
    expect(w.find('[data-testid="pdfua-dont-panic"]').exists()).toBe(false);
    expect(w.find('[data-testid="pdfua-reconcile"]').exists()).toBe(false);
  });

  it("shows no badge or reconciliation in the 'could not validate' state", () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          available: true,
          passed: false,
          profile: "ua1",
          error: "veraPDF timed out",
          totalFailureCount: 0,
          failures: [],
        },
        grade: "A",
      },
    });
    expect(w.find('[data-testid="pdfua-dont-panic"]').exists()).toBe(false);
    expect(w.find('[data-testid="pdfua-reconcile"]').exists()).toBe(false);
  });
});

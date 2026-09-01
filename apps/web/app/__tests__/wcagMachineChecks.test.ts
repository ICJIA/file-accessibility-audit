import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WcagMachineChecks from "../components/WcagMachineChecks.vue";
import type { PdfUaVerdict } from "@file-audit/shared";

// ---------------------------------------------------------------------------
// veraPDF's machine-testable WCAG 2.2 second opinion (v1.97.0). The honesty
// contract under test:
//   - an ABSENT verdict renders NOTHING (stored reports from before the
//     feature, deployments with it off) — never a false "Did not run";
//   - available:false renders the explicit "Did not run" disclosure;
//   - a clean run is NEVER phrased as "Pass" or as WCAG conformance — the
//     conformance verdict owns that claim and most criteria need humans;
//   - SC-shaped clauses are labeled WCAG, ISO clauses labeled Clause;
//   - the panel states it changes nothing about the score.
// ---------------------------------------------------------------------------

function verdict(over: Partial<PdfUaVerdict> = {}): PdfUaVerdict {
  return {
    available: true,
    passed: false,
    profile: "wcag-2.2-machine",
    failures: [],
    totalFailureCount: 0,
    distinctRuleCount: 0,
    ...over,
  };
}

describe("WcagMachineChecks — render states", () => {
  it("renders NOTHING for an absent verdict (pre-v1.97.0 stored reports, feature off)", () => {
    const w = mount(WcagMachineChecks, { props: {} });
    expect(w.find('[data-testid="wcag-machine-checks"]').exists()).toBe(false);
    expect(w.text().trim()).toBe("");
  });

  it("renders the explicit 'Did not run' disclosure for available:false — and says not run never means passed", () => {
    const w = mount(WcagMachineChecks, { props: { verdict: verdict({ available: false }) } });
    const d = w.find('[data-testid="wcag-did-not-run"]');
    expect(d.exists()).toBe(true);
    expect(d.text()).toContain("Did not run");
    expect(d.text()).toMatch(/Not run means not checked, never passed/);
    expect(d.text()).toMatch(/score and\s+categories .*unaffected/);
  });

  it("a clean run says 'No machine-detected failures' — never 'Pass', never conformance", () => {
    const w = mount(WcagMachineChecks, {
      props: { verdict: verdict({ passed: true }) },
    });
    expect(w.find('[data-testid="wcag-clean"]').exists()).toBe(true);
    expect(w.text()).toContain("No machine-detected failures");
    // The word "Pass" must not appear as a status anywhere in this panel.
    expect(w.text()).not.toMatch(/:\s*Pass\b/);
    expect(w.text()).not.toMatch(/\bconformant\b/i);
    expect(w.text()).toMatch(/not.*WCAG conformance/i);
    expect(w.text()).toMatch(/human judgment/);
  });

  it("a flagged run leads with rule-type and occurrence counts and lists rules behind a toggle", async () => {
    const w = mount(WcagMachineChecks, {
      props: {
        verdict: verdict({
          passed: false,
          failures: [
            { ruleId: "1.4.3-1", clause: "1.4.3", description: "contrast ratio", count: 12 },
            { ruleId: "7.1-10", clause: "7.1", description: "ViewerPreferences", count: 2 },
          ],
          totalFailureCount: 14,
          distinctRuleCount: 2,
        }),
      },
    });
    const head = w.find('[data-testid="wcag-flagged"]');
    expect(head.text()).toContain("2 rule types flagged");
    expect(head.text()).toContain("14 occurrences");
    // Collapsed by default; the list appears on toggle.
    expect(w.text()).not.toContain("contrast ratio");
    await w.find("button").trigger("click");
    expect(w.text()).toContain("contrast ratio");
    // SC-shaped clauses labeled WCAG; ISO clauses labeled Clause — a bare
    // number a reader must guess at is the failure mode.
    expect(w.text()).toContain("WCAG 1.4.3");
    expect(w.text()).toContain("Clause 7.1");
  });

  it("three-segment ISO clauses are never labeled WCAG — there is no WCAG 7.18.5", async () => {
    // The old test was /^\d+\.\d+\.\d+$/, which 7.18.5, 7.21.7, 7.4.4 all
    // match. A success criterion's first segment is a principle, 1–4.
    const w = mount(WcagMachineChecks, {
      props: {
        verdict: verdict({
          passed: false,
          failures: [
            {
              ruleId: "7.18.5-1",
              clause: "7.18.5",
              description: "Links shall be tagged according to ISO 32000-1:2008",
              count: 110,
            },
            {
              ruleId: "7.21.7-1",
              clause: "7.21.7",
              description: "The Font dictionary of all fonts shall define the map",
              count: 2,
            },
          ],
          totalFailureCount: 112,
          distinctRuleCount: 2,
        }),
      },
    });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("Clause 7.18.5");
    expect(w.text()).toContain("Clause 7.21.7");
    expect(w.text()).not.toContain("WCAG 7.18.5");
    expect(w.text()).not.toContain("WCAG 7.21.7");
  });

  it("RB: a forged shared-report payload with thousands of failure rows renders at most the top 20", async () => {
    const flood = Array.from({ length: 5000 }, (_, i) => ({
      ruleId: `9.9-${i}`,
      clause: "9.9",
      description: `forged rule ${i}`,
      count: i,
    }));
    const w = mount(WcagMachineChecks, {
      props: {
        verdict: verdict({
          passed: false,
          failures: flood as never,
          totalFailureCount: 5000,
          distinctRuleCount: 5000,
        }),
      },
    });
    await w.find("button").trigger("click");
    expect(w.findAll("li").length).toBeLessThanOrEqual(20);
    expect(w.text()).toContain("the top 20 of 5,000");
  });

  it("an errored run renders the neutral 'Could not validate', never a definitive verdict", () => {
    const w = mount(WcagMachineChecks, {
      props: {
        verdict: verdict({ error: "veraPDF invocation failed", totalFailureCount: 0 }),
      },
    });
    expect(w.text()).toContain("Could not validate");
    expect(w.find('[data-testid="wcag-flagged"]').exists()).toBe(false);
    expect(w.find('[data-testid="wcag-clean"]').exists()).toBe(false);
  });

  it("frames itself as a second opinion that can flag what the score does not compute, changing nothing about the score", () => {
    const w = mount(WcagMachineChecks, { props: { verdict: verdict({ passed: true }) } });
    expect(w.text()).toMatch(/second opinion/);
    expect(w.text()).toMatch(/text contrast/);
    expect(w.text()).toMatch(/changes nothing about your score or grade/);
  });
});

// ---------------------------------------------------------------------------
// Wiring — the twice-burned lesson: a component nobody renders ships green.
// Every PDF report surface must render the panel from the result's
// wcagVerdict, WITHOUT the `?? null` coercion (an absent key must stay
// absent so old reports render nothing). The remediation page must NOT
// render it (remediation runs no WCAG pass).
// ---------------------------------------------------------------------------
const WEB = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("WcagMachineChecks — wiring", () => {
  const sites: Array<[string, string]> = [
    ["components/TechnicalReport.vue", "result.wcagVerdict"],
    ["pages/index.vue", "result.wcagVerdict"],
    ["pages/report/[id].vue", "data.report.wcagVerdict"],
  ];
  for (const [file, expr] of sites) {
    it(`${file} renders <WcagMachineChecks> from ${expr} (no null coercion)`, () => {
      const src = read(file);
      expect(src).toContain("<WcagMachineChecks");
      const tag = src.slice(src.indexOf("<WcagMachineChecks"));
      const block = tag.slice(0, tag.indexOf("/>") + 2);
      expect(block).toContain(`:verdict="${expr}"`);
      expect(block).not.toContain(`${expr} ?? null`);
    });
  }

  it("the remediation result page does NOT render the WCAG panel", () => {
    expect(read("pages/remediate/[jobId].vue")).not.toContain("WcagMachineChecks");
  });
});

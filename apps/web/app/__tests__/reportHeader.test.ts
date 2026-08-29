import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import SeverityTiles from "../components/SeverityTiles.vue";

const sev = (severity: string | null) => ({ severity });

describe("ReportGradeHero", () => {
  it("shows the big grade, the score, and the blocker when one exists", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "D", overallScore: 62, categories: [sev("Critical"), sev("Minor")] },
    });
    expect(w.text()).toContain("D");
    // Score and letter are a matched pair again (v1.58.2): the SCORE is what
    // the severity cap lowers, so 62 -> D comes straight off the published
    // scale. The interim v1.58.1 layout hid the number to paper over a
    // mismatch that no longer exists.
    expect(w.text()).toContain("62");
    expect(w.text()).toContain("/100");
    // The blocker leads and counts itself; the grade adjective is dropped so
    // the sentence can never contradict the tally that produced it.
    expect(w.text()).toContain("Not ready to publish — 1 critical issue");
    expect(w.text()).not.toContain("Poor —");
  });

  it("pluralizes the critical count", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "F", overallScore: 30, categories: [sev("Critical"), sev("Critical")] },
    });
    expect(w.text()).toContain("Not ready to publish — 2 critical issues");
  });

  // The whole point of the change: with the strict weights, one Critical in a
  // 0.05-weight category still averages to an A. The letter stays honest in
  // the circle; the sentence must not say "Excellent" about a blocked file.
  it("a high-scoring file with a Critical never reads as Excellent", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 97, categories: [sev("Critical"), sev("Pass")] },
    });
    expect(w.text()).toContain("A");
    expect(w.text()).toContain("Not ready to publish — 1 critical issue");
    expect(w.text()).not.toContain("Excellent —");
  });

  it("moderate-only keeps the grade adjective", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "B", overallScore: 85, categories: [sev("Moderate")] },
    });
    expect(w.text()).toContain("Good — fix recommended before publishing");
  });

  it("clean report reads 'ready to publish'", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 98, categories: [sev("Pass")] },
    });
    expect(w.text()).toContain("Excellent — ready to publish");
  });

  it("NO publication clause when categories are absent (URL page-audit reports)", () => {
    const w = mount(ReportGradeHero, { props: { grade: "B", overallScore: 88, categories: [] } });
    // Scoped to the label element: a page audit's label is the bare grade
    // adjective, never "— ready to publish" (that clause claims
    // document-level knowledge a page audit doesn't have). The whole-text
    // em-dash scan this used to be broke when the automation-limit band —
    // which legitimately uses em-dashes — joined the hero.
    expect(w.find('[data-testid="grade-label"]').text()).toBe("Good");
    expect(w.text()).not.toContain("publish");
  });
});

describe("SeverityTiles", () => {
  it("counts each severity and always pairs icon + label + number", () => {
    const w = mount(SeverityTiles, {
      props: {
        categories: [sev("Critical"), sev("Critical"), sev("Moderate"), sev("Minor"), sev("Pass")],
      },
    });
    const tiles = w.findAll("[data-testid^='severity-tile-']");
    expect(tiles.length).toBe(3);
    expect(w.find("[data-testid='severity-tile-critical']").text()).toContain("2");
    expect(w.find("[data-testid='severity-tile-critical']").text()).toContain("Critical");
    expect(w.find("[data-testid='severity-tile-moderate']").text()).toContain("1");
    expect(w.find("[data-testid='severity-tile-minor']").text()).toContain("1");
  });

  it("renders zero counts muted, not alarming", () => {
    const w = mount(SeverityTiles, { props: { categories: [sev("Pass")] } });
    expect(w.find("[data-testid='severity-tile-critical']").classes()).toContain("tile-zero");
  });

  it("renders zeros instead of throwing when categories is a non-array (forged stored report)", () => {
    const w = mount(SeverityTiles, { props: { categories: { length: 1 } as any } });
    expect(w.find("[data-testid='severity-tile-critical']").text()).toContain("0");
    expect(w.find("[data-testid='severity-tile-moderate']").text()).toContain("0");
    expect(w.find("[data-testid='severity-tile-minor']").text()).toContain("0");
  });
});

// VerdictStrip was retired in v1.137.0 — the TwoStandardsStrip is the one
// verdict (ONE publish verdict rule), and it names WCAG 2.1, the standard the
// law cites. Its tests live in twoStandardsStrip.test.ts.

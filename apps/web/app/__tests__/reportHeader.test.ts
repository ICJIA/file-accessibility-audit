import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import SeverityTiles from "../components/SeverityTiles.vue";
import VerdictStrip from "../components/VerdictStrip.vue";

const sev = (severity: string | null) => ({ severity });

describe("ReportGradeHero", () => {
  it("shows the big grade, the score, and the blocker when one exists", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "D", overallScore: 62, categories: [sev("Critical"), sev("Minor")] },
    });
    expect(w.text()).toContain("D");
    // The score is still shown, but as labelled progress rather than as a
    // peer of the letter — a bare "62/100" beside a severity-capped "D" was
    // reported as more confusing than the mismatch the cap fixed.
    expect(w.text()).toContain("62 of 100");
    expect(w.text()).not.toContain("62/100");
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
    expect(w.text()).toContain("Good");
    expect(w.text()).not.toContain("—");
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

describe("VerdictStrip", () => {
  it("fail → ✗ heading, failing count, and a link to the technical report", () => {
    const w = mount(VerdictStrip, {
      props: {
        wcagVersion: "2.2",
        conformance: {
          status: "fail",
          headline: "h",
          failures: [
            {
              sc: "1.1.1",
              name: "Non-text Content",
              level: "A",
              category: "alt_text",
              issue: "x",
              url: "https://w3.org",
            },
            {
              sc: "2.4.2",
              name: "Page Titled",
              level: "A",
              category: "title_language",
              issue: "y",
              url: "https://w3.org",
            },
          ],
          notAssessed: [],
        },
      },
    });
    expect(w.text()).toContain("Does not meet WCAG 2.2 Level AA");
    expect(w.text()).toContain("2 criteria failing");
    expect(w.find("a").attributes("href")).toBe("#technical-report");
  });

  it("no-automated-failures → green ✓ wording", () => {
    const w = mount(VerdictStrip, {
      props: {
        wcagVersion: "2.2",
        conformance: {
          status: "no-automated-failures",
          headline: "h",
          failures: [],
          notAssessed: [],
        },
      },
    });
    expect(w.text()).toContain("No automated WCAG failures detected");
  });

  it("renders nothing without a conformance verdict (old stored reports)", () => {
    const w = mount(VerdictStrip, { props: { wcagVersion: "2.2", conformance: null } });
    expect(w.text()).toBe("");
  });
});

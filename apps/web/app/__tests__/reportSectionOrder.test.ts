/**
 * Report layout invariants, now per view.
 *
 * DETAILED view: byte-for-byte today's report — the original invariant holds
 * unchanged: blocking WCAG issues render BEFORE the informational PDF/UA
 * panels (a "Pass" there must never be readable as "done" first).
 *
 * VISUAL view: the same invariant expressed by the new composition — hero →
 * verdict → action plan → bars → technical expander (which contains the
 * PDF/UA panels, i.e. they stay below the blocking information by
 * construction). ReportVisualView owns that order, so its source is asserted
 * once here rather than per page.
 *
 * Source-inspecting for the same reason as before: these are Nuxt pages that
 * can't be mounted meaningfully in isolation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function pageSource(relative: string): string {
  return readFileSync(resolve(__dirname, "..", "pages", relative), "utf-8");
}
function componentSource(name: string): string {
  return readFileSync(resolve(__dirname, "..", "components", name), "utf-8");
}

/** Index of a component's opening tag in the given source slice. */
function at(src: string, component: string): number {
  const i = src.indexOf(`<${component}`);
  expect(i, `${component} not found in source`).toBeGreaterThan(-1);
  return i;
}

describe.each([
  ["audit results page", "index.vue"],
  ["shared report page", "report/[id].vue"],
])("%s — view blocks", (_label, file) => {
  const src = pageSource(file);
  const vi = src.indexOf("<!-- VISUAL VIEW -->");
  const di = src.indexOf("<!-- DETAILED VIEW -->");

  it("has both view markers, visual first (it is the default)", () => {
    expect(vi).toBeGreaterThan(-1);
    expect(di).toBeGreaterThan(vi);
  });

  const visual = src.slice(vi, di === -1 ? undefined : di);
  const detailed = src.slice(di);

  it("visual block renders ReportVisualView; toggle is present", () => {
    expect(visual).toContain("<ReportVisualView");
    expect(src).toContain("<ReportViewToggle");
  });

  describe("detailed block keeps today's exact invariants", () => {
    it("shows the critical-issues action banner before the PDF/UA verdict", () => {
      expect(at(detailed, "ReportActionBanner")).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("shows the list of issues to fix before the PDF/UA verdict", () => {
      expect(at(detailed, "IssuesSummary")).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("still leads with the score, above everything else", () => {
      const score = at(detailed, "ScoreCard");
      expect(score).toBeLessThan(at(detailed, "ReportActionBanner"));
      expect(score).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("shows the PDF/UA-1 signals card after the issues", () => {
      expect(at(detailed, "IssuesSummary")).toBeLessThan(at(detailed, "PdfUaSignalsCard"));
    });
    it("keeps the PDF/UA verdict above the methodology and category detail", () => {
      expect(at(detailed, "PdfUaVerdict")).toBeLessThan(at(detailed, "MethodologyCard"));
    });
  });
});

describe("ReportVisualView.vue — visual composition order", () => {
  const src = componentSource("ReportVisualView.vue");
  it("hero → tiles → verdict → plan → bars → technical report", () => {
    const hero = at(src, "ReportGradeHero");
    const tiles = at(src, "SeverityTiles");
    const verdict = at(src, "VerdictStrip");
    const plan = at(src, "ActionPlan");
    const bars = at(src, "CategoryBars");
    const tech = at(src, "TechnicalReport");
    expect(hero).toBeLessThan(tiles);
    expect(tiles).toBeLessThan(verdict);
    expect(verdict).toBeLessThan(plan);
    expect(plan).toBeLessThan(bars);
    expect(bars).toBeLessThan(tech);
  });
});

describe("TechnicalReport.vue — informational panels stay below blocking info", () => {
  const src = componentSource("TechnicalReport.vue");
  it("findings before PDF/UA panels before methodology", () => {
    expect(at(src, "ReportContent")).toBeLessThan(at(src, "PdfUaSignalsCard"));
    expect(at(src, "PdfUaSignalsCard")).toBeLessThan(at(src, "PdfUaVerdict"));
    expect(at(src, "PdfUaVerdict")).toBeLessThan(at(src, "MethodologyCard"));
  });
});

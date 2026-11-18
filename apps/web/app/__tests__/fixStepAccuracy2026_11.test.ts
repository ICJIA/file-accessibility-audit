/**
 * Fix-step accuracy pass, November 2026 (docs/fix-step-accuracy-2026-11.md).
 * Each test pins one string that was checked against the vendor's own help
 * page on 2026-11-18 and found wrong — so a later edit cannot quietly put
 * the wrong menu back.
 */
import { describe, it, expect } from "vitest";
import { buildActionPlan, PLAN_COPY } from "../utils/actionPlan";
import { WCAG_MAP } from "../utils/wcag";
import { FIX_STEPS_VERSION_NOTE } from "../utils/fixStepVersions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const allPlanText = JSON.stringify(PLAN_COPY);

describe("Excel has no language setting", () => {
  it("no Excel route offers Set Proofing Language (Excel has no such command)", () => {
    for (const entry of Object.values(PLAN_COPY)) {
      for (const step of entry.source.xlsx ?? []) {
        expect(step).not.toMatch(/Proofing Language/);
      }
    }
  });

  it("a PDF made from Excel whose only problem is its language is sent to Acrobat alone", () => {
    const steps = buildActionPlan(
      [
        {
          id: "title_language",
          label: "Title & Language",
          score: 75,
          severity: "Moderate",
          findings: ['Document title: "Grant awards FY26"', "No language declaration found"],
        },
      ] as never,
      "pdf",
      "Microsoft® Excel® for Microsoft 365",
    );
    const step = steps[0]!;
    expect(step.routes.map((r) => r.tool)).toEqual(["acrobat"]);
    expect(JSON.stringify(step)).not.toMatch(/Proofing Language|written for Word/);
  });
});

describe("PowerPoint reading order and tables", () => {
  it("never says to move the title to the TOP of the Selection Pane (the pane lists in reverse)", () => {
    expect(allPlanText).not.toMatch(/Selection Pane[^"]*reorder shapes so the title reads first/);
    expect(WCAG_MAP.reading_order!.remediation).toMatch(/reverse reading order/);
    expect(WCAG_MAP.reading_order!.remediation).toMatch(/BOTTOM/);
    expect(PLAN_COPY.reading_order!.source.pptx!.join(" ")).toMatch(/REVERSE/);
  });

  it("slide-title steps name View → Outline View and Set as Slide Title", () => {
    const steps = PLAN_COPY.slide_titles!.source.pptx!.join(" ");
    expect(steps).not.toMatch(/View → Outline(?! View)/);
    expect(steps).toMatch(/Set as Slide Title/);
  });
});

describe("Acrobat paths name the current interface", () => {
  it("no PDF/UA hint gives File → Properties without the current Document properties path", () => {
    const src = readFileSync(resolve(__dirname, "../components/pdfUaFixHint.ts"), "utf8");
    // Every string literal in the hint table.
    const strings = src.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
    expect(strings.length).toBeGreaterThan(30);
    for (const text of strings) {
      if (/File → Properties/.test(text)) expect(text).toMatch(/Document properties/);
      expect(text).not.toMatch(/(?<!Tools → )Print Production → Preflight/);
      expect(text).not.toMatch(/Make accessible workflow/);
    }
  });

  it("fonts: the plan's Preflight step names the real tool path and the installed-font condition", () => {
    // The fonts step lives in a variant entry, not PLAN_COPY: read the source.
    const src = readFileSync(resolve(__dirname, "../utils/actionPlan.ts"), "utf8");
    const fonts = src.match(/"[^"\n]*Embed missing fonts[^"\n]*"/g) ?? [];
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      expect(f).not.toMatch(/→ Fix →/);
      expect(f).toMatch(/installed on this computer/);
    }
  });
});

describe("the version note", () => {
  it("covers every Office app whose steps it sits beside, and is dated November 2026", () => {
    expect(FIX_STEPS_VERSION_NOTE).toMatch(/November 2026/);
    expect(FIX_STEPS_VERSION_NOTE).toMatch(/PowerPoint/);
    expect(FIX_STEPS_VERSION_NOTE).toMatch(/Excel/);
    expect(FIX_STEPS_VERSION_NOTE).toMatch(/InDesign 2026–2027/);
    expect(FIX_STEPS_VERSION_NOTE).toMatch(/Mac/);
  });
});

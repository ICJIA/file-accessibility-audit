import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// v1.98.0 (user decision): the /technical-details page and the audit page's
// Technical Details collapsible must be IDENTICAL and stay in sync for every
// future change. The mechanism is by-construction — both surfaces render the
// same <TechnicalExplainer /> component — and this file pins the
// construction, because the failure mode is someone re-adding page-local
// prose that then drifts (which is exactly how the two surfaces diverged
// before: the standalone page taught a scoring model retired six weeks
// earlier, fixed in v1.95.2).
// ---------------------------------------------------------------------------

const WEB = resolve(__dirname, "..");
const page = readFileSync(resolve(WEB, "pages/technical-details.vue"), "utf8");
const index = readFileSync(resolve(WEB, "pages/index.vue"), "utf8");

describe("technical-details ⇄ audit-page collapsible: one content source", () => {
  it("states the Best-practices counts from the catalog, never as typed prose", () => {
    // House rule: every count on a public page is computed or countless.
    // These three were typed ("37 … 19 … 18") while the same numbers were
    // separately pinned as literals in the catalog tests, so adding a
    // practice updated the tests and left the sentence quietly wrong.
    const explainer = readFileSync(resolve(WEB, "components/TechnicalExplainer.vue"), "utf8");
    expect(explainer).toMatch(/\{\{ bpTotal \}\} non-scored practices/);
    expect(explainer).toMatch(/\{\{ bpPdf \}\} for PDF and \{\{ bpOffice \}\}/);
    expect(explainer, "a literal count of practices is back in the prose").not.toMatch(
      /\d+ non-scored practices/,
    );
  });

  it("the standalone page renders <TechnicalExplainer /> — the same component the audit page's collapsible renders", () => {
    expect(page).toMatch(/<TechnicalExplainer\s*\/>/);
    expect(index).toMatch(/<LazyTechnicalExplainer[\s>]/);
  });

  it("the page carries NO section prose of its own — chrome only (header, nav, related docs)", () => {
    // The old page's own sections, each a drift risk if re-added here.
    for (const remnant of [
      "The audit pipeline",
      "What is a PDF, really?",
      "Why remediation is fundamentally limited",
      "The remediation pipeline",
      "diagram-led",
      "<DiagramFigure",
      "<table",
      "Weighted sum =",
    ]) {
      expect(page, `page-local prose reappeared: "${remnant}"`).not.toContain(remnant);
    }
  });

  it("the page's header states the identity claim, so a future divergence would make the page lie visibly", () => {
    expect(page).toMatch(/identical to the <em>Technical Details<\/em> section/);
  });

  it("the content the standalone page used to own uniquely now lives in the shared component", () => {
    const explainer = readFileSync(resolve(WEB, "components/TechnicalExplainer.vue"), "utf8");
    // The worked scoring example (current model + severity-cap step)…
    expect(explainer).toContain("Weighted sum = (100×20 + 75×15 + 55×15");
    expect(explainer).toContain("capped at 79 · grade C");
    // …the WCAG 2.2-vs-legal-2.1 alignment section…
    expect(explainer).toContain("WCAG\n          2.2 is a strict superset of it");
    expect(explainer).toMatch(/WCAG 2\.1 AA remains the legal minimum/);
    // …and the toolchain license table.
    expect(explainer).toContain("The Open-Source Toolchain at a Glance");
    expect(explainer).toMatch(/machine-testable WCAG 2\.2 profile \(v1\.97\.0\)/);
  });
});

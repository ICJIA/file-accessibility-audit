/**
 * Report layout: critical WCAG issues must come BEFORE the informational
 * PDF/UA-1 (veraPDF) panel, on both the audit page and a shared report.
 *
 * WHY: the two answer different questions, and only one of them decides
 * whether a document is publishable. The PDF/UA machine check can return a
 * green "✓ Pass" on a document that still has Critical WCAG failures — the
 * exact case a user hit: a report showing "Pass" above "2 critical issues
 * must be fixed before publishing". An author, especially a non-technical
 * one, reads the first green badge as "done" and stops. Ordering is the
 * cheapest, most reliable way to fix that: the blocking information has to
 * be encountered first.
 *
 * These assertions are source-inspecting rather than mounted. The invariant
 * being protected IS the order of components in the page template, and these
 * are Nuxt pages (useRuntimeConfig / useFetch / route state) that cannot be
 * mounted meaningfully in isolation. Source inspection is an established
 * pattern in this suite for exactly that reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// resolve(__dirname, ...) rather than import.meta.url — matches the
// established path pattern in dataRetentionVersion.test.ts.
function pageSource(relative: string): string {
  return readFileSync(resolve(__dirname, "..", "pages", relative), "utf-8");
}

/** Index of a component's opening tag in the template source. */
function at(src: string, component: string): number {
  const i = src.indexOf(`<${component}`);
  expect(i, `${component} not found in page source`).toBeGreaterThan(-1);
  return i;
}

describe.each([
  ["audit results page", "index.vue"],
  ["shared report page", "report/[id].vue"],
])("%s — blocking issues precede the informational PDF/UA panel", (_label, file) => {
  const src = pageSource(file);

  it("shows the critical-issues action banner before the PDF/UA verdict", () => {
    expect(at(src, "ReportActionBanner")).toBeLessThan(at(src, "PdfUaVerdict"));
  });

  it("shows the list of issues to fix before the PDF/UA verdict", () => {
    expect(at(src, "IssuesSummary")).toBeLessThan(at(src, "PdfUaVerdict"));
  });

  it("still leads with the score, above everything else", () => {
    const score = at(src, "ScoreCard");
    expect(score).toBeLessThan(at(src, "ReportActionBanner"));
    expect(score).toBeLessThan(at(src, "PdfUaVerdict"));
  });

  it("keeps the PDF/UA verdict above the methodology and category detail", () => {
    // It is informational, not noise — it should still precede the
    // long-form explanatory sections.
    expect(at(src, "PdfUaVerdict")).toBeLessThan(at(src, "MethodologyCard"));
  });
});

/**
 * Remediation results page: the download block lives INSIDE the "After
 * Remediation" card (grade → explanation → download), carrying a
 * grade-driven readiness banner — a fix-before-publishing warning unless
 * the after-grade is an A.
 *
 * Source-inspected for the same reason as reportSectionOrder.test.ts:
 * this is a Nuxt page that can't be mounted meaningfully in isolation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "..", "pages", "remediate", "[jobId].vue"), "utf-8");

describe("remediate/[jobId].vue — download placement", () => {
  const afterCardStart = src.indexOf("After Remediation");
  const afterCardEnd = src.indexOf("Low-improvement explainer card");
  const afterCard = src.slice(afterCardStart, afterCardEnd);

  it("has the After card followed by the low-improvement explainer (slice anchors hold)", () => {
    expect(afterCardStart).toBeGreaterThan(-1);
    expect(afterCardEnd).toBeGreaterThan(afterCardStart);
  });

  it("renders the download controls inside the After card, after the score content", () => {
    expect(afterCard).toContain('data-testid="after-card-download"');
    expect(afterCard).toContain("Download remediated PDF");
    expect(afterCard).toContain('v-model="filenameChoice"');
    expect(afterCard).toContain("handleDownloadClick");
    // Grade (ScoreCard) renders before the download block within the card.
    expect(afterCard.indexOf("<ScoreCard")).toBeLessThan(
      afterCard.indexOf('data-testid="after-card-download"'),
    );
  });

  it("has exactly one download block — the old standalone section is gone", () => {
    expect(src.split("Download remediated PDF").length - 1).toBe(1);
    expect(src).not.toContain("Download + manual-review notice");
  });

  it("gates the readiness banner on grade A: warning otherwise, ready message on A", () => {
    // Both branches exist inside the card…
    expect(afterCard).toContain('data-testid="publish-warning"');
    expect(afterCard).toContain('data-testid="publish-ready"');
    expect(afterCard).toContain("Not ready to publish yet");
    expect(afterCard).toContain("Grade A — ready to publish");
  });

  // The actual grade-derivation logic (strict-profile-first fallback, exact
  // "A" equality, failing closed for missing/lowercase/"A+" grades) used to
  // live inline here and be "covered" only by a source-text regex on that
  // expression — a test that stays green even if the v-if/v-else branches
  // are inverted or the equality is loosened. It's now a pure function in
  // ~/utils/publishReadiness.ts, executed (not grepped) by
  // app/__tests__/publishReadiness.test.ts. All this file needs to verify
  // is that the page actually uses that module rather than reimplementing
  // the gate inline again.
  it("derives publish-readiness from the utils/publishReadiness module, not an inline expression", () => {
    const publishReadinessImport = src.match(/^import .*publishReadiness.*$/m)?.[0] ?? "";
    expect(publishReadinessImport).toContain('"~/utils/publishReadiness"');
    expect(publishReadinessImport).toContain("afterGradeOf");
    expect(publishReadinessImport).toContain("isPublishReady");
  });

  it("the warning tells the reader to fix remaining issues before publishing", () => {
    expect(afterCard).toMatch(/fixed[\s\S]{0,120}before this PDF\s+is published/);
    // The old blanket note's honest limits survive inside the warning.
    expect(afterCard).toContain("can't write");
    expect(afterCard).toContain("reading order");
  });
});

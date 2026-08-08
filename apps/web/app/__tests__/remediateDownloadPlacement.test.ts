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

  it("uses the SAME publish verdict as the audit report, not a stricter one", () => {
    // The bug this replaces: the banner was gated on `grade === "A"`, so a
    // report graded B with only Minor findings read "ready to publish" on the
    // audit page and "Not ready to publish yet" here — same PDF, opposite
    // answers to the only question a non-technical author actually has.
    expect(src).toContain("publishVerdictFor(receipt.value?.outputAudit)");
    // Comments stripped first: the note explaining what this replaced quotes
    // the old rule verbatim, and matching prose would fail on the explanation
    // rather than on the code.
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/<!--[\s\S]*?-->/g, "");
    expect(code).not.toMatch(/isPublishReadyGrade|grade === "A"/);
    // The verdict text is rendered, never re-worded locally.
    expect(afterCard).toContain("capitalizeFirst(publishVerdict.text)");
  });

  it("keeps the auto-remediation caveat at EVERY grade", () => {
    // It used to live inside the warning branch, so a file good enough to
    // publish never heard it — and it is exactly as true of an A: machine-
    // generated structure can satisfy a checker without being good.
    expect(afterCard).toContain('data-testid="auto-remediation-caveat"');
    expect(afterCard).toMatch(/cannot write meaningful alt text/);
    // Outside both branches of the verdict banner.
    const caveatIdx = afterCard.indexOf('data-testid="auto-remediation-caveat"');
    const warnIdx = afterCard.indexOf('data-testid="publish-warning"');
    expect(caveatIdx).toBeGreaterThan(warnIdx);
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
    // Matched across lines: prettier wraps the import once it names three
    // symbols, so an anchored single-line regex silently matched nothing and
    // asserted against "" — passing for the wrong reason.
    const block = src.match(/import \{[\s\S]*?\} from "~\/utils\/publishReadiness";/)?.[0] ?? "";
    expect(block).toContain('"~/utils/publishReadiness"');
    expect(block).toContain("afterGradeOf");
    expect(block).toContain("publishVerdictFor");
  });

  it("the warning tells the reader where to fix remaining issues", () => {
    expect(afterCard).toMatch(/still list what to fix[\s\S]{0,80}source document/);
  });
});

describe("outstanding issues are visible without a click", () => {
  // Auto-remediation improving a file is the moment someone is most likely to
  // conclude it is finished. The count alone ("3 issues still need attention")
  // reads as a footnote next to a large green "remediated" panel, and the
  // detail behind a closed disclosure was easy never to open. The scope of
  // what remains has to be visible by default.
  //
  // Source-scanned for the same reason as the rest of this file: it is a Nuxt
  // page that cannot be mounted meaningfully in isolation.

  it("opens the outstanding-issues disclosure whenever anything remains", () => {
    expect(src).toContain('<details class="mt-4 group" :open="outstandingCount > 0">');
  });

  it("does not open it when there is nothing left to show", () => {
    // The binding is a condition, not a literal `open` — an empty expanded
    // disclosure under "No issues remain" would be noise.
    expect(src).not.toMatch(/<details class="mt-4 group" open>/);
  });

  it("keeps it collapsible, so the reader can still put it away", () => {
    // Native <details>: `open` is the initial state, not a lock.
    expect(src).toContain("Hide outstanding issues");
  });
});

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

// Exact :result / :verapdf-url bindings each page's Visual view block must
// keep. Pinned as literal strings (not "the attribute exists") because
// `grep -rn ':result="' apps/web/app/__tests__` turns up ZERO hits anywhere
// else in this suite: indexA11y.test.ts mounts index.vue with `shallow:
// true`, which stubs ReportVisualView out before its props are ever
// evaluated, and nothing else here mounts either page's Visual block at
// all. Without this pin, changing `:result="data.report"` to `:result="data"`
// on the shared report page — passing the whole `{report, createdAt,
// expiresAt}` fetch envelope instead of the report itself, so
// `.overallScore`/`.grade` resolve to undefined — would render a hero with
// a blank score and every test in the suite would still pass. The shared
// page additionally gets a real mount + prop assertion in
// reportPageWiring.test.ts (its data comes from an async fetch, which can
// be mocked); index.vue's does not, because its data is local component
// state (`result`), not fetched — for that page this string pin is the
// only net today.
const VISUAL_RESULT_BINDING: Record<string, { result: string; verapdfUrl: string }> = {
  "index.vue": {
    result: ':result="result"',
    verapdfUrl: ":verapdf-url=\"String(runtimeConfig.public.verapdfUrl ?? '')\"",
  },
  "report/[id].vue": {
    result: ':result="data.report"',
    verapdfUrl: ":verapdf-url=\"String(config.public.verapdfUrl ?? '')\"",
  },
};

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

  it("visual block wires :result to the actual report object, not some other in-scope value, and passes a verapdf URL", () => {
    const expected = VISUAL_RESULT_BINDING[file];
    expect(expected, `no pinned binding for ${file}`).toBeDefined();
    expect(visual).toContain(expected!.result);
    expect(visual).toContain(expected!.verapdfUrl);
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
    // The one verdict is the TwoStandardsStrip (VerdictStrip retired
    // v1.137.0 — two stacked verdict banners violated the one-verdict rule,
    // and the old one said "WCAG 2.2" an inch above "only WCAG 2.1 counts").
    const verdict = at(src, "TwoStandardsStrip");
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

describe("Best Practices placement (2026-08-30)", () => {
  it("sits between IssuesSummary and ManualReviewCard in both Detailed views", () => {
    for (const page of ["index.vue", "report/[id].vue"]) {
      const src = pageSource(page);
      const issues = at(src, "IssuesSummary");
      const bp = at(src, "BestPracticesSection");
      const manual = at(src, "ManualReviewCard");
      expect(issues, page).toBeLessThan(bp);
      expect(bp, page).toBeLessThan(manual);
    }
  });

  it("stays above the informational PDF/UA panels — the blocking-first invariant", () => {
    for (const page of ["index.vue", "report/[id].vue"]) {
      const src = pageSource(page);
      expect(at(src, "BestPracticesSection"), page).toBeLessThan(at(src, "PdfUaVerdict"));
    }
  });

  it("renders ONCE per view — never via ReportContent, which TechnicalReport embeds", () => {
    // ReportContent is rendered inside TechnicalReport, which is inside
    // ReportVisualView. A section placed there would appear twice on one
    // page in the Visual view.
    expect(componentSource("ReportContent.vue")).not.toContain("BestPracticesSection");
    const visual = componentSource("ReportVisualView.vue");
    expect(visual.match(/<BestPracticesSection/g) ?? []).toHaveLength(0);
    // Bounded to the ActionPlan tag itself (stops at its own self-closing
    // `/>`) — CORRECTED (Task 9 sabotage check): an unbounded lazy
    // `/<ActionPlan[\s\S]*?:result="result"/` lazily matches PAST ActionPlan
    // into PrintPlanButton's own :result a few lines below, so it kept
    // passing even with :result deleted from ActionPlan — the exact
    // silent-gate failure this suite's "gates must be provable" rule warns
    // about. Every attribute on this tag is a plain identifier/expression
    // with no literal `>`, so `[^>]*` cannot itself run past the tag close.
    const actionPlanTag = visual.match(/<ActionPlan\b[^>]*\/>/)?.[0] ?? "";
    expect(actionPlanTag, "ActionPlan tag not found in ReportVisualView.vue").not.toBe("");
    expect(actionPlanTag).toContain(':result="result"');
    // CLOSE 1 (post-approval review): at() above only ever returns the
    // FIRST index of a tag — it cannot see a second <BestPracticesSection
    // added below ManualReviewCard on either Detailed page, which is
    // exactly the double-render failure this whole placement exists to
    // prevent. Count it explicitly, per page.
    for (const page of ["index.vue", "report/[id].vue"]) {
      expect(pageSource(page).match(/<BestPracticesSection/g), page).toHaveLength(1);
    }
  });

  it("keeps ReportContent's per-category not-scored tier — it is card detail, not the scorecard", () => {
    // Spec §6: the two serve different readers. Removing TIER 2 would strip
    // the not-scored items out of the per-category cards entirely.
    expect(componentSource("ReportContent.vue")).toContain('data-testid="not-scored-tier"');
  });
});

describe("the era gate is wired end to end (2026-08-30)", () => {
  it("/report/[id] passes the shared row's createdAt to every surface that evaluates the catalog", () => {
    const src = pageSource("report/[id].vue");
    const visual = src.match(/<ReportVisualView\b[\s\S]*?\/?>/)?.[0] ?? "";
    expect(visual).toContain(':analyzed-at="data.createdAt"');
    const section = src.match(/<BestPracticesSection\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(section).toContain(':analyzed-at="data.createdAt"');
    const print = src.match(/<PrintPlanButton\b[^>]*\/>/)?.[0] ?? "";
    expect(print).toContain(':analyzed-at="data.createdAt"');
  });
  it("ReportVisualView forwards it to ActionPlan and PrintPlanButton", () => {
    const src = componentSource("ReportVisualView.vue");
    expect(src.match(/<ActionPlan\b[^>]*\/>/)?.[0] ?? "").toContain(':analyzed-at="analyzedAt"');
    expect(src.match(/<PrintPlanButton\b[^>]*\/>/)?.[0] ?? "").toContain(
      ':analyzed-at="analyzedAt"',
    );
  });
  it("the remediation page opts its 'What still needs fixing' printout out of best practices", () => {
    const src = pageSource("remediate/[jobId].vue");
    expect(src.match(/<PrintPlanButton\b[\s\S]*?\/>/)?.[0] ?? "").toContain(
      ':include-best-practices="false"',
    );
  });
});

describe("the analysing overlay is told which document it is working on (2026-08-31)", () => {
  // Source-inspected on purpose. A component test proves the overlay CAN show
  // a filename; only this proves the page actually hands it one. Breaking the
  // page's assignment left every component test green — the failure mode this
  // repo has already shipped twice.
  it("sets the filename when analysis starts, clears it when it ends, and passes it down", () => {
    const src = pageSource("index.vue");
    const overlay = src.match(/<ProcessingOverlay\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(overlay).toContain(':filename="processingFilename"');
    // Set from the real file, not a placeholder.
    expect(src).toMatch(/processingFilename\.value = file\.name;/);
    // And cleared, or the next run shows the previous document's name.
    expect(src).toMatch(/processingFilename\.value = null;/);
  });
});

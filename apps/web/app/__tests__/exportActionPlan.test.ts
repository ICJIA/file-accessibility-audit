import { describe, it, expect } from "vitest";
import { buildHtml } from "../utils/exportFormats/html";
import type { ReportResult, BrandingInfo } from "../utils/exportFormats/shared";

const branding: BrandingInfo = {
  appName: "File Audit",
  siteUrl: "https://audit.example",
  wcagVersion: "2.2",
  wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG22/Understanding/",
};

function result(): ReportResult {
  return {
    filename: "report.pdf",
    pageCount: 3,
    overallScore: 62,
    grade: "D",
    isScanned: false,
    executiveSummary: "Summary text",
    fileType: "pdf",
    categories: [
      {
        id: "title_language",
        label: "Document Title & Language",
        score: 40,
        grade: "F",
        severity: "Moderate",
        findings: ["No title set"],
      },
      {
        id: "text_extractability",
        label: "Text Extractability",
        score: 0,
        grade: "F",
        severity: "Critical",
        // The "--- Adobe Acrobat: How to Fix ---" marker is what
        // partitionCardFindings() looks for to split off a per-document
        // Acrobat block; everything after it becomes `acrobat` steps that
        // buildActionPlan splices into a rendered route — unlike the rest of
        // this category's plan output (title/why/source steps), which come
        // straight from the PLAN_COPY dictionary and never touch this array.
        // Putting the payload here is the only way it flows through the
        // plan block's dynamic (non-dictionary) rendering path.
        findings: [
          "No text layer",
          "--- Adobe Acrobat: How to Fix ---",
          "Step with <script>alert(1)</script> payload",
        ],
      },
      // Unknown id: PLAN_COPY has no entry for it, so buildActionPlan falls
      // back to dynamic fields for EVERYTHING — title becomes `Fix: ${label}`
      // and why becomes firstActionableFinding(findings) — both interpolate
      // attacker-controlled text directly, with no dictionary string as a
      // decoy. Severity "Critical" is deliberate (matches the reviewer's
      // request); see the stable-sort note on the ordering test below for why
      // this doesn't disturb it.
      {
        id: "future_check",
        label: "Future <script>alert(2)</script> Check",
        score: 20,
        grade: "F",
        severity: "Critical",
        findings: ["3 widgets <script>alert(3)</script> broken"],
      },
    ],
  };
}

describe("buildHtml — action plan section", () => {
  it("renders the plan between the hero and the category table, ordered Critical first", () => {
    // Both text_extractability and future_check are Critical; Array.sort is
    // stable and text_extractability is listed first in the fixture, so it
    // still ranks before future_check, which still ranks before the Moderate
    // title_language — the "first < second" comparison below (text
    // extractability vs. title_language) holds regardless of where
    // future_check's own title lands between them.
    const html = buildHtml(result(), branding);
    const plan = html.indexOf("Your Action Plan");
    expect(plan).toBeGreaterThan(-1);
    expect(plan).toBeLessThan(html.indexOf("Category Scores"));
    const first = html.indexOf("Make the text readable by screen readers");
    const second = html.indexOf("Give the document a title and set its language");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
  });

  it("shows severity tiles with counts and the verdict phrase in the hero", () => {
    const html = buildHtml(result(), branding);
    // The export mirrors the hero: the blocker leads, counted, so a
    // downloaded report can never contradict the screen.
    expect(html).toContain("Not ready to publish — 2 critical issues");
    expect(html).not.toContain("Poor — not ready");
    expect(html).toMatch(/1[\s\S]{0,120}CRITICAL/);
    expect(html).toMatch(/1[\s\S]{0,120}MODERATE/);
  });

  it("keeps every legacy section (nothing removed)", () => {
    const html = buildHtml(result(), branding);
    for (const s of ["Executive Summary", "Category Scores", "Detailed Findings"]) {
      expect(html).toContain(s);
    }
  });

  it("escapes finding-derived text that reaches the plan block's own dynamic paths", () => {
    // Each payload is placed so it can ONLY reach the output through code
    // this task added — not merely through the pre-existing (already-tested)
    // Detailed Findings section — so removing any of the plan block's three
    // escapeHtml() calls would make this test fail:
    //   alert(1): text_extractability's Acrobat-marker line -> becomes a
    //     `routes[].steps` entry via partitionCardFindings().acrobat.
    //   alert(2): future_check has no PLAN_COPY entry, so its `title` is the
    //     dynamic `Fix: ${label}` fallback, not a dictionary string.
    //   alert(3): future_check's `why` (and its fallback route step) come
    //     from firstActionableFinding(findings), also dynamic.
    const html = buildHtml(result(), branding);
    expect(html).not.toContain("<script>alert(");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert(3)&lt;/script&gt;");
  });

  it("page-audit-shaped result (no categories): no plan, no pass card, no crash", () => {
    const pageAudit = { ...result(), categories: undefined } as unknown as ReportResult;
    const html = buildHtml(pageAudit, branding);
    expect(html).not.toContain("Your Action Plan");
    expect(html).not.toContain("Nothing to fix");
    expect(html).not.toContain("publish");
  });

  it("clean report renders the pass card instead of a plan", () => {
    const clean: ReportResult = {
      ...result(),
      grade: "A",
      overallScore: 100,
      categories: [
        {
          id: "title_language",
          label: "Document Title & Language",
          score: 100,
          grade: "A",
          severity: "Pass",
          findings: ["Title present"],
        },
      ],
    };
    const html = buildHtml(clean, branding);
    expect(html).toContain("Nothing to fix");
    expect(html).not.toContain("Your Action Plan");
  });
});

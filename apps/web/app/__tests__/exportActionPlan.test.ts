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
        findings: ["No text layer <script>alert(1)</script>"],
      },
    ],
  };
}

describe("buildHtml — action plan section", () => {
  it("renders the plan between the hero and the category table, ordered Critical first", () => {
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
    expect(html).toContain("not ready to publish");
    expect(html).toMatch(/1[\s\S]{0,120}CRITICAL/);
    expect(html).toMatch(/1[\s\S]{0,120}MODERATE/);
  });

  it("keeps every legacy section (nothing removed)", () => {
    const html = buildHtml(result(), branding);
    for (const s of ["Executive Summary", "Category Scores", "Detailed Findings"]) {
      expect(html).toContain(s);
    }
  });

  it("escapes finding-derived text in plan output", () => {
    const html = buildHtml(result(), branding);
    expect(html).not.toContain("<script>alert(1)</script>");
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

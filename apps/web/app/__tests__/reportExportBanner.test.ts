import "./test-helpers";
import { describe, it, expect } from "vitest";
import {
  buildMarkdown,
  buildHtml,
  buildDocx,
} from "../composables/useReportExport";

const branding = {
  appName: "ICJIA Publication Accessibility Audit",
  siteUrl: "https://audit.icjia.app",
};

function baseResult(overrides: any = {}) {
  return {
    filename: "sample.pdf",
    pageCount: 12,
    overallScore: 58,
    grade: "F",
    isScanned: false,
    executiveSummary: "Document has several accessibility gaps.",
    categories: [
      {
        id: "alt_text",
        label: "Alt Text",
        score: 20,
        grade: "F",
        severity: "Critical",
        findings: ["3 images missing alt text"],
        explanation: "Ensures non-decorative images have alt text.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("buildMarkdown banner", () => {
  it("leads with the filename as the H1 heading", () => {
    const md = buildMarkdown(baseResult(), branding);
    expect(md.split("\n")[0]).toBe("# sample.pdf");
  });

  it("keeps an 'Accessibility Report' subtitle with the page/type line", () => {
    const md = buildMarkdown(baseResult(), branding);
    expect(md).toContain("**Accessibility Report**");
    expect(md).toContain("12 pages · PDF");
  });

  it("drops the old generic title and the redundant File: metadata line", () => {
    const md = buildMarkdown(baseResult(), branding);
    expect(md).not.toContain("# PDF Accessibility Report");
    expect(md).not.toContain("**File:**");
  });

  it("still carries the score and grade metadata", () => {
    const md = buildMarkdown(baseResult(), branding);
    expect(md).toContain("**Overall Score:**");
    expect(md).toContain("**Grade:**");
  });
});

describe("buildHtml banner", () => {
  it("renders a filename banner with the eyebrow label", () => {
    const html = buildHtml(baseResult(), branding);
    expect(html).toContain("ACCESSIBILITY REPORT FOR");
    expect(html).toContain("sample.pdf");
  });

  it("places the banner above the report title", () => {
    const html = buildHtml(baseResult(), branding);
    const banner = html.indexOf("ACCESSIBILITY REPORT FOR");
    const h1 = html.indexOf("<h1");
    expect(banner).toBeGreaterThan(-1);
    expect(h1).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(h1);
  });

  it("keeps the filename in the document <title>", () => {
    const html = buildHtml(baseResult(), branding);
    expect(html).toContain("<title>Accessibility Report — sample.pdf</title>");
  });

  it("removes the duplicate gray filename line from the score hero", () => {
    const html = buildHtml(baseResult(), branding);
    expect(html).not.toContain("sample.pdf — 12 page");
  });
});

describe("buildDocx banner", () => {
  // Binary OOXML is not asserted on directly; this exercises the new banner
  // paragraph (shading / border / break runs) so a malformed docx option
  // throws here rather than only in the browser download.
  it("builds a non-empty Word document without throwing", async () => {
    const blob = await buildDocx(baseResult(), branding);
    expect(blob).toBeTruthy();
    expect(blob.size).toBeGreaterThan(0);
  });

  it("builds for a scanned, single-page document too", async () => {
    const blob = await buildDocx(
      baseResult({ isScanned: true, pageCount: 1 }),
      branding,
    );
    expect(blob.size).toBeGreaterThan(0);
  });
});

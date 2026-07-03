import "./test-helpers";
import { describe, it, expect } from "vitest";
import {
  buildMarkdown,
  buildHtml,
  buildText,
} from "../composables/useReportExport";

const branding = {
  appName: "ICJIA Publication Accessibility Audit",
  siteUrl: "https://audit.icjia.app",
  wcagVersion: "2.2",
  wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG22/Understanding/",
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

describe("buildText export", () => {
  it("leads with the filename and includes the score and grade", () => {
    const text = buildText(baseResult(), branding);
    expect(text.startsWith("sample.pdf")).toBe(true);
    expect(text).toContain("Overall score: 58/100");
    expect(text).toContain("CATEGORY SCORES");
    expect(text).toContain("DETAILED FINDINGS");
  });

  it("builds for a scanned, single-page document too", () => {
    const text = buildText(
      baseResult({ isScanned: true, pageCount: 1 }),
      branding,
    );
    expect(text).toContain("Scanned document detected");
    expect(text.length).toBeGreaterThan(0);
  });

  it("is plain text — no markdown table pipes or HTML tags", () => {
    const text = buildText(baseResult(), branding);
    expect(text).not.toMatch(/<[a-z]+>/i);
    expect(text).not.toContain("|---");
  });
});

describe("format-aware export labels", () => {
  it("labels a PowerPoint export with slides and the PowerPoint title", () => {
    const result = baseResult({
      filename: "deck.pptx",
      pageCount: 9,
      fileType: "pptx",
    });
    const md = buildMarkdown(result, branding);
    expect(md).toContain("9 slides · PowerPoint");
    const html = buildHtml(result, branding);
    expect(html).toContain("PowerPoint Accessibility Report");
    expect(html).toContain("9 slides · PowerPoint");
  });

  it("labels an Excel export with sheets and the Excel title", () => {
    const result = baseResult({
      filename: "budget.xlsx",
      pageCount: 4,
      fileType: "xlsx",
    });
    const txt = buildText(result, branding);
    expect(txt).toContain("4 sheets · Excel");
    const html = buildHtml(result, branding);
    expect(html).toContain("Excel Accessibility Report");
  });

  it("keeps the PDF wording for results without a fileType", () => {
    const html = buildHtml(baseResult(), branding);
    expect(html).toContain("PDF Accessibility Report");
    expect(html).toContain("12 pages · PDF");
  });
});

describe("buildHtml / buildMarkdown — conformance finding URL hardening (stored XSS)", () => {
  // Sibling of the helpLinks stored-XSS fix: conformance.failures[].url and
  // conformance.notAssessed[].url render as <a href> (buildHtml) and as
  // markdown link targets (buildMarkdown), and are attacker-controllable on a
  // forged shared report (POST /api/reports). Real extractors only ever emit
  // safe wcagUrl(sc) https literals.
  function resultWithConformanceUrl(url: string) {
    return baseResult({
      conformance: {
        status: "fail",
        headline: "Confirmed failures found.",
        failures: [
          {
            sc: "1.1.1",
            name: "Non-text Content",
            level: "A",
            category: "alt_text",
            issue: "2 images have no alt text",
            url,
          },
        ],
        notAssessed: [
          {
            sc: "1.4.3",
            name: "Contrast (Minimum)",
            level: "AA",
            reason: "not automated",
            url,
          },
        ],
      },
    });
  }

  it("buildHtml drops the href for a javascript: URL but keeps the finding text", () => {
    const html = buildHtml(
      resultWithConformanceUrl("javascript:alert(document.domain)"),
      branding,
    );
    expect(html).toContain("1.1.1");
    expect(html).toContain("Non-text Content");
    expect(html).toContain("1.4.3");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("javascript:alert");
  });

  it("buildHtml keeps the href for a legitimate https URL", () => {
    const html = buildHtml(
      resultWithConformanceUrl(
        "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      ),
      branding,
    );
    expect(html).toContain(
      'href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html"',
    );
  });

  it("buildMarkdown never embeds a javascript: URL as a markdown link target, but keeps the finding text", () => {
    const md = buildMarkdown(
      resultWithConformanceUrl("javascript:alert(document.domain)"),
      branding,
    );
    expect(md).toContain("1.1.1");
    expect(md).toContain("Non-text Content");
    expect(md).toContain("1.4.3");
    expect(md).not.toContain("javascript:");
  });

  it("buildMarkdown keeps a legitimate https URL as the markdown link target", () => {
    const md = buildMarkdown(
      resultWithConformanceUrl(
        "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      ),
      branding,
    );
    expect(md).toContain(
      "[1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)",
    );
  });
});

describe("buildMarkdown — helpLinks URL hardening (stored XSS, live gap)", () => {
  // buildHtml already routes helpLinks[].url through safeHttpUrl (v1.32.0), but
  // buildMarkdown's "Resources" block did not — and GET /api/reports/:id
  // returns stored JSON with NO re-sanitization on read, so any share row
  // persisted before the v1.32.0 store-boundary fix still carries an
  // unsanitized helpLinks[].url in SQLite and would emit `](javascript:...`
  // when a recipient exports it as Markdown. This is a live gap, not just a
  // theoretical one.
  function resultWithHelpLinkUrl(url: string) {
    return baseResult({
      categories: [
        {
          id: "alt_text",
          label: "Alt Text",
          score: 20,
          grade: "F",
          severity: "Critical",
          findings: ["3 images missing alt text"],
          explanation: "Ensures non-decorative images have alt text.",
          helpLinks: [{ label: "CLICK FOR HELP", url }],
        },
      ],
    });
  }

  it("never embeds a javascript: helpLink as a markdown link target, but keeps the label", () => {
    const md = buildMarkdown(
      resultWithHelpLinkUrl("javascript:alert(1)"),
      branding,
    );
    // the label text still appears...
    expect(md).toContain("CLICK FOR HELP");
    // ...but the dangerous scheme never becomes a markdown link target
    expect(md).not.toContain("](javascript:");
    expect(md).not.toContain("javascript:alert");
  });

  it("keeps a legitimate https helpLink as the markdown link target", () => {
    const md = buildMarkdown(
      resultWithHelpLinkUrl("https://www.w3.org/WAI/x.html"),
      branding,
    );
    expect(md).toContain("[CLICK FOR HELP](https://www.w3.org/WAI/x.html)");
  });
});

import "./test-helpers";
import { describe, it, expect } from "vitest";
import {
  baseFilename,
  buildJSON,
  buildHtml,
  buildText,
  buildMarkdown,
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

// ---------------------------------------------------------------------------
// BUG-1 (Fix 3): baseFilename only stripped a trailing `.pdf`, so exporting a
// report for report.docx produced "report.docx-accessibility-report-....html"
// instead of "report-accessibility-report-....html". Now that this app
// audits four formats, the export filename must strip all four extensions.
// ---------------------------------------------------------------------------
describe("baseFilename: strips the source extension for every audited format (BUG-1)", () => {
  it("strips .pdf", () => {
    const name = baseFilename(baseResult({ filename: "report.pdf" }));
    expect(name.startsWith("report-accessibility-report-")).toBe(true);
    expect(name).not.toContain(".pdf");
  });

  it("strips .docx (previously left dangling — the bug)", () => {
    const name = baseFilename(baseResult({ filename: "report.docx" }));
    expect(name.startsWith("report-accessibility-report-")).toBe(true);
    expect(name).not.toContain(".docx");
  });

  it("strips .pptx", () => {
    const name = baseFilename(baseResult({ filename: "deck.pptx" }));
    expect(name.startsWith("deck-accessibility-report-")).toBe(true);
    expect(name).not.toContain(".pptx");
  });

  it("strips .xlsx", () => {
    const name = baseFilename(baseResult({ filename: "budget.xlsx" }));
    expect(name.startsWith("budget-accessibility-report-")).toBe(true);
    expect(name).not.toContain(".xlsx");
  });

  it("is case-insensitive", () => {
    const name = baseFilename(baseResult({ filename: "REPORT.DOCX" }));
    expect(name.startsWith("REPORT-accessibility-report-")).toBe(true);
  });

  it("only strips a trailing extension, not one embedded mid-filename", () => {
    const name = baseFilename(baseResult({ filename: "report.pdf.backup.xlsx" }));
    expect(name.startsWith("report.pdf.backup-accessibility-report-")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 4: JSON export (llmContext + remediationPlan fallback) format-neutral
// wording, and PDF/UA only listed as a standard when the file is actually a
// PDF (the scorer omits PDF/UA signals entirely for docx/pptx/xlsx).
// ---------------------------------------------------------------------------
describe("buildJSON — llmContext.standards includes PDF/UA only for PDFs", () => {
  it("includes PDF/UA (ISO 14289-1) for a PDF result", () => {
    const json = JSON.parse(buildJSON(baseResult({ fileType: "pdf" }), branding));
    expect(json.llmContext.standards).toContain("PDF/UA (ISO 14289-1)");
  });

  it("includes PDF/UA (ISO 14289-1) when fileType is absent (legacy PDF-only reports)", () => {
    const json = JSON.parse(buildJSON(baseResult(), branding));
    expect(json.llmContext.standards).toContain("PDF/UA (ISO 14289-1)");
  });

  it("omits PDF/UA (ISO 14289-1) for a Word result (scorer never computes PDF/UA signals for docx)", () => {
    const json = JSON.parse(
      buildJSON(baseResult({ filename: "report.docx", fileType: "docx" }), branding),
    );
    expect(json.llmContext.standards).not.toContain("PDF/UA (ISO 14289-1)");
  });

  it("omits PDF/UA (ISO 14289-1) for PowerPoint and Excel results", () => {
    const pptxJson = JSON.parse(
      buildJSON(baseResult({ filename: "deck.pptx", fileType: "pptx" }), branding),
    );
    expect(pptxJson.llmContext.standards).not.toContain("PDF/UA (ISO 14289-1)");

    const xlsxJson = JSON.parse(
      buildJSON(baseResult({ filename: "budget.xlsx", fileType: "xlsx" }), branding),
    );
    expect(xlsxJson.llmContext.standards).not.toContain("PDF/UA (ISO 14289-1)");
  });
});

describe("buildJSON — llmContext.prompt is not hard-coded to Adobe Acrobat", () => {
  it("does not claim remediation steps are for Adobe Acrobat regardless of format", () => {
    const docxJson = JSON.parse(
      buildJSON(baseResult({ filename: "report.docx", fileType: "docx" }), branding),
    );
    expect(docxJson.llmContext.prompt).not.toContain("Adobe Acrobat");

    const pdfJson = JSON.parse(buildJSON(baseResult({ fileType: "pdf" }), branding));
    expect(pdfJson.llmContext.prompt).not.toContain("Adobe Acrobat");
  });
});

describe("buildJSON — remediationPlan fallback action is format-neutral", () => {
  it("falls back to 'the source application' (not Adobe Acrobat) for a category with no WCAG_MAP entry", () => {
    // slide_titles (PPTX) and sheet_names (XLSX) have no WCAG_MAP entry, so
    // any failing category using one of those ids exercises the fallback
    // branch in remediationPlan.prioritizedSteps[].action.
    const json = JSON.parse(
      buildJSON(
        baseResult({
          filename: "deck.pptx",
          fileType: "pptx",
          categories: [
            {
              id: "slide_titles",
              label: "Slide Titles",
              score: 40,
              grade: "D",
              severity: "Moderate",
              findings: ["2 slides missing a title"],
            },
          ],
        }),
        branding,
      ),
    );
    const step = json.remediationPlan.prioritizedSteps[0];
    expect(step.action).toBe("Review findings and remediate in the source application.");
    expect(step.action).not.toContain("Adobe Acrobat");
  });
});

// ---------------------------------------------------------------------------
// Fix 4: buildHtml's scanned-document banner claimed "This PDF appears to be
// a scanned image" unconditionally; buildText/buildMarkdown already say
// "document". buildHtml should match.
// ---------------------------------------------------------------------------
describe("buildHtml — scanned-document wording is format-neutral", () => {
  it("says 'This document appears to be a scanned image', not 'This PDF appears...'", () => {
    const html = buildHtml(baseResult({ isScanned: true }), branding);
    expect(html).toContain("This document appears to be a scanned image");
    expect(html).not.toContain("This PDF appears to be a scanned image");
  });
});

// ---------------------------------------------------------------------------
// 2026-09-01: per-category letters removed from every human-readable export.
// The letter beside a category score was read as the DOCUMENT's grade (a B
// document whose 75-point title row showed a C). The overall grade keeps its
// letter; category rows carry score + severity only. JSON keeps `grade` as
// machine data — it is a field, not a chip.
// ---------------------------------------------------------------------------
describe("exports carry no per-category letter (2026-09-01)", () => {
  const result = baseResult({
    categories: [
      {
        id: "title_language",
        label: "Title & Language",
        score: 75,
        grade: "C",
        severity: "Minor",
        findings: ["Document title: something"],
        explanation: "Title and language.",
      },
    ],
  });

  it("text: the category line and findings heading show score + severity, no (C)", () => {
    const out = buildText(result, branding);
    expect(out).not.toContain("(C)");
    expect(out).toMatch(/Title & Language\s+75\/100\s+Minor/);
  });

  it("markdown: the score table has no Grade column and the findings heading no letter", () => {
    const out = buildMarkdown(result, branding);
    expect(out).toContain("| Category | Score | Severity |");
    expect(out).not.toContain("| Grade |");
    expect(out).not.toContain("(C)");
  });

  it("html: no Grade column header and no letter beside the category score", () => {
    const out = buildHtml(result, branding);
    expect(out).not.toMatch(/>\s*Grade\s*</);
    expect(out).not.toContain("(C)");
  });

  it("json: categories[].grade survives as machine data", () => {
    const out = JSON.parse(buildJSON(result, branding));
    const cat = out.categories.find((c: any) => c.id === "title_language");
    expect(cat.grade).toBe("C");
  });
});

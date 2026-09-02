import { describe, it, expect } from "vitest";
import { WCAG_MAP } from "../utils/wcag";

// ---------------------------------------------------------------------------
// WCAG_MAP.remediation strings are rendered in the JSON export
// (categories[].wcag.remediation and remediationPlan.prioritizedSteps[].action)
// for every audited format. They were written purely in Adobe Acrobat /
// Tags-panel terms, which is wrong guidance for a Word/PowerPoint/Excel
// upload — those formats are edited directly (there is no "Tags panel"),
// and several categories (color_contrast, title_language, alt_text,
// table_markup, reading_order) ARE scored for Office formats per
// apps/api/src/services/scorer.ts.
//
// pdf_ua_compliance is intentionally excluded from this fix: PDF/UA
// (ISO 14289-1) is a PDF-only ISO standard with no Office equivalent, and
// the scorer never produces a pdf_ua_compliance category for docx/pptx/xlsx
// — its Acrobat/PAC-only remediation text is accurate as-is.
// ---------------------------------------------------------------------------

describe("WCAG_MAP remediation: Office equivalents added alongside Acrobat steps", () => {
  it("text_extractability notes OCR is a PDF-only concern (Office files are always text-based)", () => {
    const r = WCAG_MAP.text_extractability!.remediation;
    expect(r).toMatch(/Word, PowerPoint, and Excel/);
  });

  it("title_language covers Word/PowerPoint/Excel Properties + language paths, not just Acrobat", () => {
    const r = WCAG_MAP.title_language!.remediation;
    expect(r).toContain("File → Info → Properties → Title");
    expect(r).toMatch(/Word/);
    // Excel has no document-language property (scorer.ts: scoreXlsxTitleLanguage) —
    // must not claim Excel supports setting a language.
    expect(r).toMatch(/Excel .*(does not|do not) store a document language/);
  });

  it("heading_structure adds the Word Styles-gallery equivalent", () => {
    const r = WCAG_MAP.heading_structure!.remediation;
    expect(r).toMatch(/Heading 1.{0,5}6 styles/);
    expect(r).toContain("Home tab");
  });

  it("alt_text adds the Word/PowerPoint/Excel Alt Text pane", () => {
    const r = WCAG_MAP.alt_text!.remediation;
    expect(r).toMatch(/View\/Edit Alt Text|Alt Text pane/);
  });

  it("table_markup adds Word Repeat-Header-Rows and PowerPoint/Excel Header-Row equivalents", () => {
    const r = WCAG_MAP.table_markup!.remediation;
    expect(r).toContain("Repeat Header Rows");
    expect(r).toContain("Header Row");
  });

  it("link_quality no longer frames every fix as 'before exporting to PDF'", () => {
    const r = WCAG_MAP.link_quality!.remediation;
    expect(r).not.toMatch(
      /^Replace raw URLs with descriptive link text in the source document before exporting to PDF\.$/,
    );
    expect(r).toMatch(/Word, PowerPoint, or Excel/);
  });

  it("form_accessibility copy matches the v1.95.0 census honesty: Word/Excel detected-and-disclosed, only PowerPoint still 'uncommon'", () => {
    const r = WCAG_MAP.form_accessibility!.remediation;
    expect(r).toMatch(/Word and Excel form controls/);
    expect(r).toMatch(/detected and disclosed/);
    // The unconditional Office-wide "uncommon" claim is gone — the analyzer
    // now counts Word/Excel controls; "uncommon" may only describe PowerPoint.
    expect(r).not.toMatch(/uncommon in Word/);
    expect(r).toMatch(/PowerPoint form fields are uncommon/);
  });

  it("form_accessibility's WCAG 2.2 note applies to any interactive form, not just PDF forms", () => {
    const note = WCAG_MAP.form_accessibility!.wcag22Note!;
    expect(note).not.toContain("interactive PDF forms");
    expect(note).toContain("interactive forms");
  });

  it("reading_order adds the PowerPoint Selection Pane and Word linear-flow equivalents", () => {
    const r = WCAG_MAP.reading_order!.remediation;
    expect(r).toContain("Selection Pane");
    expect(r).toMatch(/Word/);
  });

  it("bookmarks clarifies it's a PDF-specific category (Word/PowerPoint/Excel are not scored on it)", () => {
    const r = WCAG_MAP.bookmarks!.remediation;
    expect(r).toMatch(/PDF/);
    expect(r).toMatch(/Word, PowerPoint, and Excel .*not scored/);
  });

  it("color_contrast (Fix 1): scopes 'not computed' to PDF and states Office contrast IS checked", () => {
    const r = WCAG_MAP.color_contrast!.remediation;
    expect(r).toMatch(/For PDFs?,/);
    expect(r).toMatch(/Word, PowerPoint, and Excel/);
    expect(r).toMatch(/contrast is checked automatically/i);
    // Must not claim PDF contrast IS checked (it isn't) — accuracy guard.
    expect(r).not.toMatch(/PDF.{0,80}contrast is checked automatically/i);
  });

  it("pdf_ua_compliance no longer exists — the Practical-mode category was retired in v1.21 and its map entry went with it (2026-09-02)", () => {
    expect(WCAG_MAP.pdf_ua_compliance).toBeUndefined();
  });
});

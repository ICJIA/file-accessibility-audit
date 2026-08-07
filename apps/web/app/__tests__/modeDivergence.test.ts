import { describe, it, expect } from "vitest";
import { naReason } from "../utils/modeDivergence";

// ---------------------------------------------------------------------------
// naReason supplies the accessible tooltip/footnote text shown for a blank
// category score. Several of these strings described PDF-only mechanics
// (Acrobat, PAC, MCIDs) as if they applied to every audited format, even
// though this app now also audits Word (.docx), PowerPoint (.pptx), and
// Excel (.xlsx). Ground truth (apps/api/src/services/scorer.ts):
//   - color_contrast IS machine-checked for docx/pptx/xlsx (scoreDocxContrast
//     / scorePptxColorContrast / scoreXlsxColorContrast); only PDF contrast
//     is unimplemented (scoreColorContrast() always returns score: null).
//   - bookmarks is PDF-only — audit.config.ts documents it as "omitted" for
//     DOCX/PPTX/XLSX (no scorePptxBookmarks/scoreXlsxBookmarks exists), so a
//     claim like "pptx scores bookmarks by slide count" would be false.
// ---------------------------------------------------------------------------

describe("naReason: color_contrast — scoped to PDF, plain-language lead for a novice", () => {
  const reason = naReason("color_contrast", true);

  it("leads with a plain, actionable sentence scoped to this PDF (not jargon)", () => {
    // The FIRST sentence must stand alone for a non-technical reader — no
    // "rendered-PDF contrast analysis" mechanism talk up front.
    expect(reason.startsWith("Color contrast wasn't checked for this PDF")).toBe(true);
  });

  it("keeps the genuinely useful manual-check pointers (Acrobat / WebAIM)", () => {
    expect(reason).toContain("Acrobat's Accessibility Checker");
    expect(reason).toContain("WebAIM's Contrast Checker");
  });

  it("does not claim Office formats need manual Acrobat contrast review — they're machine-checked", () => {
    expect(reason).toContain("Word, PowerPoint, and Excel");
    expect(reason).toMatch(/contrast is checked automatically/i);
  });
});

describe("naReason: reading_order — plain-language PDF lead (no undefined MCID jargon), Word equivalent kept", () => {
  const reason = naReason("reading_order", true);

  it("leads with a plain, actionable sentence scoped to this PDF — no undefined jargon up front", () => {
    expect(reason.startsWith("Reading order wasn't checked for this PDF")).toBe(true);
    // MCID is defined nowhere else in the app — it must not appear at all,
    // reader-facing copy should describe the check in plain terms instead.
    expect(reason).not.toContain("MCID");
  });

  it("keeps a genuinely useful manual-check pointer (Acrobat's Order panel / PAC)", () => {
    expect(reason).toContain("Order panel");
    expect(reason).toContain("PAC");
  });

  it("keeps the Word-specific explanation instead of only Acrobat/PAC", () => {
    expect(reason).toContain("Word");
  });
});

describe("naReason: alt_text (notAssessed) — Acrobat/PAC text gets an Office pointer", () => {
  const reason = naReason("alt_text", true);

  it("keeps the Acrobat/PAC guidance for PDFs", () => {
    expect(reason).toContain("Acrobat or PAC");
  });

  it("adds where to look in Word, PowerPoint, or Excel", () => {
    expect(reason).toMatch(/Word, PowerPoint,? (or|and) Excel/);
    expect(reason).toContain("Alt Text");
  });

  it("alt_text not-applicable (no images) branch is unaffected", () => {
    expect(naReason("alt_text", false)).toBe(
      "No images were detected in the document, so alt-text coverage does not apply.",
    );
  });
});

describe("naReason: bookmarks — PDF-only, does NOT claim PowerPoint scores by slide count", () => {
  const reason = naReason("bookmarks");

  it("keeps the existing page-count threshold text (kept verbatim for existing consumers)", () => {
    expect(reason).toContain("10 or more pages");
  });

  it("scopes bookmarks as a PDF-specific category", () => {
    expect(reason).toMatch(/PDF/);
  });

  it("does NOT claim PowerPoint/Excel are scored on bookmarks (scorer omits bookmarks entirely for docx/pptx/xlsx)", () => {
    expect(reason).not.toMatch(/slides?\b.*(scored|score)/i);
    expect(reason).not.toMatch(/(scored|score)\b.*slides?/i);
  });
});

describe("naReason: other categories are unaffected by the format-scoping fix", () => {
  it("table_markup / link_quality / form_accessibility text is unchanged", () => {
    expect(naReason("table_markup")).toBe(
      "No tables were detected in the document, so table-markup quality does not apply.",
    );
    expect(naReason("link_quality")).toBe(
      "No hyperlinks were detected in the document, so link quality does not apply.",
    );
    expect(naReason("form_accessibility")).toBe(
      "No form fields were detected in the document, so form accessibility does not apply.",
    );
  });

  it("generic fallback text for an unknown category id is unchanged", () => {
    expect(naReason("made_up_category", true)).toBe(
      "This category was not assessed for the current document.",
    );
    expect(naReason("made_up_category", false)).toBe(
      "This category does not apply to the current document.",
    );
  });
});

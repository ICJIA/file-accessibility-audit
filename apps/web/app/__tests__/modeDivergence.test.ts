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

describe("naReason: color_contrast — scoped to PDF (was shown as universal)", () => {
  const reason = naReason("color_contrast", true);

  it("still describes the PDF case (kept verbatim for existing consumers)", () => {
    expect(reason).toContain("rendered-PDF contrast analysis is not yet implemented");
  });

  it("explicitly scopes the 'not implemented' claim to PDFs", () => {
    expect(reason).toMatch(/For PDFs?,/);
  });

  it("does not claim Office formats need manual Acrobat contrast review — they're machine-checked", () => {
    expect(reason).toContain("Word, PowerPoint, and Excel");
    expect(reason).toMatch(/contrast is checked automatically/i);
  });
});

describe("naReason: reading_order — PDF MCID explanation scoped, Word equivalent added", () => {
  const reason = naReason("reading_order", true);

  it("keeps the PDF-specific MCID explanation (kept verbatim for existing consumers)", () => {
    expect(reason).toContain("per-page MCID fidelity check");
  });

  it("adds a Word-specific explanation instead of only Acrobat/PAC", () => {
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

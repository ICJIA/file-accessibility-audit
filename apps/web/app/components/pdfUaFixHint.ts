// apps/web/app/components/pdfUaFixHint.ts
//
// Co-located with PdfUaVerdict.vue (NOT app/utils/ or app/composables/) so it
// is never swept up by Nuxt's auto-import scanning — it's imported explicitly
// by relative path from the component and its test.
//
// Maps a veraPDF PDF/UA-1 (ISO 14289-1) failed checkpoint to one short,
// plain-language, Acrobat-oriented "how to fix" sentence. Matching is done on
// keywords in the lowercased `description`, NOT on `clause`/`ruleId` numbers,
// because the same ISO clause carries different concrete rules across
// veraPDF versions while the English description stays a stable signal.
//
// Order is significant: more specific rules are matched before more general
// ones. In particular the Scope-attribute rule (#1) must be checked before
// the generic table-structure rule (#3), because Scope failure text also
// names the TH element ("a table cell of type TH shall have a Scope
// attribute"), which would otherwise satisfy the table rule's own TH match.

export interface PdfUaFailureLike {
  ruleId?: string;
  clause?: string;
  description?: string;
}

export function pdfUaFixHint(f: PdfUaFailureLike): string {
  const d = (f.description ?? "").toLowerCase();

  // 1. Scope attribute (must precede the table-structure rule below — its
  // text also mentions "TH").
  if (d.includes("scope")) {
    return "Give each header cell (TH) a Scope of Row or Column in Acrobat's Table Editor (Table Cell Properties), or associate cells via Headers/IDs.";
  }

  // 2. Untagged / non-artifacted content.
  if (
    d.includes("artifact") ||
    d.includes("tagged as real content") ||
    d.includes("real content")
  ) {
    return "Tag all page content. Best fixed by re-exporting from the source (Word/InDesign) with accessibility tags on; in Acrobat: Prepare for accessibility → Automatically tag PDF, then Fix reading order (mark decorative items as Artifacts).";
  }

  // 3. Table structure (TR/TH/TD nesting).
  if (
    d.includes("tr element") ||
    d.includes("th and td") ||
    /\btr\b/.test(d) ||
    /\bth\b/.test(d) ||
    /\btd\b/.test(d) ||
    d.includes("table")
  ) {
    return "Fix the table tags in Acrobat's Tags panel / Table Editor so each row (TR) contains only header (TH) and data (TD) cells.";
  }

  // 4. Alternate text.
  if (d.includes("alt") || d.includes("alternate") || d.includes("alternative")) {
    return "Add alternate text to each figure (Acrobat: Tags panel → figure → Properties → Alternate Text), or mark purely decorative images as Artifacts.";
  }

  // 5. Heading levels.
  if (d.includes("heading") || /\bh[1-6]\b/.test(d)) {
    return "Tag headings with the correct level (H1–H6) without skipping levels (Acrobat: Tags panel / Reading Order).";
  }

  // 6. Font embedding / glyph coverage.
  if (
    d.includes("cidset") ||
    d.includes("font") ||
    d.includes("embedded") ||
    d.includes("glyph")
  ) {
    return "Re-create the PDF with fully embedded fonts (a complete CIDSet included) — e.g. Distiller or Print-to-PDF with font embedding on.";
  }

  // 7. Document / passage language.
  if (d.includes("lang")) {
    return "Set the document language (Acrobat: File → Properties → Advanced → Reading Language), plus per-passage language where the language changes.";
  }

  // 8. Document title.
  if (d.includes("title")) {
    return "Set a document Title (File → Properties → Description) and enable Initial View → Show → Document Title.";
  }

  // 9. XMP metadata / PDF/UA identifier.
  if (d.includes("metadata") || d.includes("xmp")) {
    return "Add the required XMP metadata — Acrobat's accessibility fix-ups add the PDF/UA identifier and metadata automatically.";
  }

  // 10. Fallback — no keyword matched.
  return `Open the document in Acrobat's Accessibility Checker (or PAC) and address ISO 14289-1 clause ${f.clause ?? "this rule"}.`;
}

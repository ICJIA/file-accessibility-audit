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
  if (d.includes("cidset") || d.includes("font") || d.includes("embedded") || d.includes("glyph")) {
    return "A cosmetic font-embedding technicality (often a Word/Office export artifact); the text still reads fine. To repair the embedded font's CIDSet while keeping your tags, use Acrobat's Preflight font fix-ups or a PDF/UA tool like axesPDF — avoid Print-to-PDF / re-distilling, which strips the tag tree.";
  }

  // 7. Document / passage language.
  if (d.includes("lang")) {
    return "Set the document language (Acrobat: Document properties → Advanced tab → Reading Options → Language; classic UI: File → Properties), plus per-passage language where the language changes.";
  }

  // 8. Document title.
  if (d.includes("title")) {
    return "Set a document Title (Acrobat: Document properties → Description tab; classic UI: File → Properties) and enable Initial View → Show → Document Title.";
  }

  // 9. XMP metadata / PDF/UA identifier.
  if (d.includes("metadata") || d.includes("xmp")) {
    return "Add the required XMP metadata — Acrobat's accessibility fix-ups add the PDF/UA identifier and metadata automatically.";
  }

  // 10. Fallback — no keyword matched.
  return `Open the document in Acrobat's Accessibility Checker (or PAC) and address ISO 14289-1 clause ${f.clause ?? "this rule"}.`;
}

/**
 * Two-route fix guidance for one veraPDF failure: how to prevent it in the
 * SOURCE file (Word/InDesign) and how to repair it in the EXPORTED PDF
 * (Acrobat). Rendered as a per-rule expander in the plan's "Above and
 * beyond" group (v1.134.0) so a reader who chooses to go past the legal
 * floor has a place to start on either side of the export.
 *
 * Same doctrine as pdfUaFixHint above: keyword matching on the lowercased
 * description (clause numbers drift across veraPDF versions; the English
 * stays stable), most-specific first, and CONSERVATIVE — a rule that maps to
 * nothing returns null and renders as a plain row with no advice, because
 * wrong advice under the referee's words is worse than none.
 *
 * ORDER IS LOAD-BEARING. Several veraPDF descriptions contain each other's
 * keywords: the widget/Form rule mentions "annotation", the Tabs rule
 * mentions "annotation", the annotation rule mentions "Alt", the link rules
 * mention "alternate", the DisplayDocTitle and dc:title rules mention
 * "title". Each match below is placed after every rule whose text could
 * satisfy it by accident.
 */
export function pdfUaFixRoutes(f: PdfUaFailureLike): { source: string; pdf: string } | null {
  const d = (f.description ?? "").toLowerCase();
  if (!d) return null;

  // Header-cell direction (must precede the generic table rule — its text
  // also names TH).
  if (d.includes("scope")) {
    return {
      source:
        "Keep tables simple in the source — one header row, marked as such (Word: Table Design → check Header Row) — and re-export. The exporter writes the header direction for you.",
      pdf: "In Acrobat's Table Editor (Prepare for accessibility → Fix reading order → Table Editor), open each header cell's Table Cell Properties and set Scope to Row or Column.",
    };
  }

  // Form fields / widgets — BEFORE Tabs and annotation (its text mentions
  // "widget annotation").
  if (d.includes("widget") || d.includes("form element")) {
    return {
      source:
        "Build forms with the source application's real form controls where possible, or plan to finish the form in Acrobat — exported drawings of forms cannot carry field labels.",
      pdf: "Acrobat: Prepare a form, then Prepare for accessibility — give every field a Tooltip (its spoken label) and check in the Tags panel that each field sits inside a Form tag.",
    };
  }

  // Page tab order — BEFORE the annotation rule (its text mentions
  // "annotation").
  if (d.includes("tabs")) {
    return {
      source:
        "Re-exporting from a current version of Word or InDesign writes this page setting correctly — it is stamped at export time, not something you author.",
      pdf: "Run Acrobat's accessibility fix-ups (Prepare for accessibility → the Make accessible workflow) — they set every page's tab order to follow the document structure. One setting per page, fixed in bulk.",
    };
  }

  // Links needing a spoken description — BEFORE the generic alt/alternate
  // match (its text says "alternate description").
  if (d.includes("link") && (d.includes("alternate") || d.includes("contents"))) {
    return {
      source:
        "Write link text that already says where it goes (\u201cthe SFY25 annual report\u201d, not a bare address) — descriptive link text serves every reader even where this PDF/UA nicety is absent.",
      pdf: "In Acrobat's Tags panel, right-click each Link tag → Properties → Alternate Text and describe the destination in a few words.",
    };
  }

  // Links not tagged as Link elements.
  if (d.includes("link")) {
    return {
      source:
        "Insert links as real hyperlinks in the source (Word: Insert → Link) rather than pasting bare text, then re-export with tags on.",
      pdf: "Acrobat: Prepare for accessibility → Automatically tag PDF usually creates the Link tags; verify in the Tags panel that each link sits inside a Link element.",
    };
  }

  // Annotations needing Contents/Alt — BEFORE the figure/alt match (its text
  // says "Alt entry").
  if (d.includes("annotation")) {
    return {
      source:
        "Comments, stamps, and similar review annotations rarely belong in a published file — remove or flatten them in the source before export.",
      pdf: "Delete annotations that are review leftovers; give each one you keep a short description in its Contents field (Acrobat: open the annotation's properties).",
    };
  }

  // Figures without a text alternative.
  if (d.includes("figure") || d.includes("alt") || d.includes("alternative")) {
    return {
      source:
        "Add alt text on each image in the source (Word: right-click the image → View Alt Text; InDesign: Object → Object Export Options → Alt Text), mark decorative images as decorative, and re-export.",
      pdf: "Acrobat: Prepare for accessibility → Add alternate text walks every figure in turn; purely decorative images should be marked as artifacts instead.",
    };
  }

  // Untagged / non-artifacted content.
  if (d.includes("artifact") || d.includes("real content")) {
    return {
      source:
        "Re-export with tags on (Word: Save As PDF with \u201cDocument structure tags for accessibility\u201d checked; InDesign: Export → Create Tagged PDF). Content the exporter understands is tagged automatically; page furniture becomes artifacts.",
      pdf: "Acrobat: Prepare for accessibility → Automatically tag PDF, then open Fix reading order and mark decorative items — borders, backgrounds, repeated headers and footers — as Background/Artifact.",
    };
  }

  // Show-document-title flag — BEFORE the generic title match.
  if (d.includes("displaydoctitle") || d.includes("viewerpreferences")) {
    return {
      source:
        "Re-export from a current Office or InDesign version — recent exporters set \u201cshow document title\u201d automatically when the file has a title.",
      pdf: "Acrobat: File → Properties → Initial View → Show: Document Title, then save. One checkbox.",
    };
  }

  // XMP dc:title — BEFORE the generic title match.
  if (d.includes("metadata") || d.includes("dc:title") || d.includes("xmp")) {
    return {
      source:
        "Set the document's Title in the source (Word: File → Info → Title; InDesign: File → File Info) and re-export — the exporter writes it into the PDF's metadata for you.",
      pdf: "Acrobat: File → Properties → Description → Title, then save — Acrobat writes the matching metadata entry. The accessibility fix-ups repair it too.",
    };
  }

  // The PDF/UA conformance claim itself.
  if (d.includes("identification") || d.includes("conformance level")) {
    return {
      source:
        "No source application writes this claim — it is added to the finished PDF once the file actually conforms.",
      pdf: "Add the PDF/UA identifier with Acrobat's Preflight (\u201cApply PDF/UA-1 entry\u201d) or a PDF/UA tool — but only AFTER the other items are fixed: this flag is a claim of conformance, not a repair.",
    };
  }

  if (d.includes("title")) {
    return {
      source: "Set the document's Title in the source (Word: File → Info → Title) and re-export.",
      pdf: "Acrobat: File → Properties → Description → Title, and under Initial View choose Show: Document Title.",
    };
  }

  // Embedded-font CIDSet technicality — BEFORE the general embedding match.
  if (d.includes("cidset")) {
    return {
      source:
        "An export artifact, not something you authored — re-exporting from a current version of Word or InDesign usually regenerates the font correctly.",
      pdf: "Use Acrobat's Print Production → Preflight font fix-ups (or a PDF/UA tool such as axesPDF) to repair the embedded font's CIDSet. Avoid Print-to-PDF or re-distilling — both strip the tag tree.",
    };
  }

  if (d.includes("font") || d.includes("embedded") || d.includes("glyph")) {
    return {
      source:
        "Turn on font embedding before exporting (Word: File → Options → Save → \u201cEmbed fonts in the file\u201d; InDesign embeds automatically), then re-export.",
      pdf: "Acrobat: Print Production → Preflight → the \u201cEmbed missing fonts\u201d fix-up. The text reads fine either way — embedding protects how the page looks on machines without the font.",
    };
  }

  if (d.includes("heading") || /\bh[1-6]\b/.test(d)) {
    return {
      source:
        "Use real heading styles in order (Word's Heading 1/2/3; InDesign paragraph styles mapped to H1–H3) without skipping levels, then re-export.",
      pdf: "In Acrobat's Tags panel (or Fix reading order), retag heading elements H1–H6 so the levels descend without gaps.",
    };
  }

  if (/\btr\b/.test(d) || /\bth\b/.test(d) || /\btd\b/.test(d) || d.includes("table")) {
    return {
      source:
        "Rebuild the table as a real table in the source (Insert → Table — never tab stops or a picture of a table) with one marked header row, then re-export.",
      pdf: "In Acrobat's Tags panel, repair the structure so each Table contains TR rows holding only TH and TD cells — the Table Editor in Fix reading order rebuilds most of this.",
    };
  }

  if (d.includes("lang")) {
    return {
      source:
        "Set the document language in the source (Word: Review → Language → Set Proofing Language) and re-export.",
      pdf: "Acrobat: File → Properties → Advanced → Reading Options → Language.",
    };
  }

  if (/\bli\b/.test(d) || d.includes("list")) {
    return {
      source:
        "Use the source's real list controls (Word's bullet and numbering buttons), never typed dashes, then re-export.",
      pdf: "In Acrobat's Tags panel, rebuild the list tags so each L contains LI items (with Lbl and LBody children).",
    };
  }

  return null;
}

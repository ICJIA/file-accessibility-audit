// apps/web/app/components/pdfUaFixHint.ts
//
// Co-located with PdfUaVerdict.vue (NOT app/utils/ or app/composables/) so it
// is never swept up by Nuxt's auto-import scanning — it's imported explicitly
// by relative path from the component and its test.
//
// Maps a veraPDF PDF/UA-1 (ISO 14289-1) failed checkpoint to one short,
// plain-language, Acrobat-oriented "how to fix" sentence, and (below) to the
// two-route source/PDF guidance the plan's expanders render.
//
// MATCHING IS ON THE RULE ID (clause + test number), never on description
// keywords. The keyword doctrine this file used to carry ("the English stays
// stable while clause numbers drift") proved wrong in practice — the English
// is where the collisions live (found 2026-09-01 on real documents): the
// figure-alt rule cites "Table 323" and drew table advice; the annotation
// rule says "except Widget annotations" and drew form-Tooltip advice ×102 on
// a real report; the ToUnicode rule matched "font" and was called "a
// cosmetic technicality — the text still reads fine", although ToUnicode is
// exactly what makes text extractable. Rule ids are stable within a veraPDF
// release; the vendored-profile README requires re-fetching profiles on an
// engine upgrade, which is the moment to re-verify this table (written
// against both 1.30.1 profiles' full rule lists).
//
// DELIBERATELY CONSERVATIVE: an unknown rule id gets the generic fallback
// (hint) or nothing (routes) — wrong advice under the referee's words is
// worse than none.

export interface PdfUaFailureLike {
  ruleId?: string;
  clause?: string;
  description?: string;
}

/** Advice groups. Each key below names one repair; the SETS at the bottom
 *  say which rule ids it fits. */
const HINTS = {
  tagging:
    "Tag all page content. Best fixed by re-exporting from the source (Word/InDesign) with accessibility tags on; in Acrobat: Prepare for accessibility → Automatically tag PDF, then Fix reading order (mark decorative items as Artifacts).",
  roleMap:
    "Map each custom tag to its closest standard structure type in the RoleMap (Acrobat: Tags panel → options menu → Edit Role Map), so assistive technology stops treating it as an anonymous container.",
  scope:
    "Give each header cell (TH) a Scope of Row or Column in Acrobat's Table Editor (Table Cell Properties), or associate cells via Headers/IDs.",
  table:
    "Fix the table tags in Acrobat's Tags panel / Table Editor so each row (TR) contains only header (TH) and data (TD) cells and the grid is regular.",
  list: "Rebuild the list tags in Acrobat's Tags panel so each L contains LI items with Lbl and LBody children.",
  alt: "Add alternate text to each figure (Acrobat: Tags panel → figure → Properties → Alternate Text), or mark purely decorative images as Artifacts.",
  formula:
    "Give each formula a spoken alternative: Tags panel → the Formula tag → Properties → Alternate Text describing what the expression says.",
  annotation:
    "Give each annotation a short description — a Contents entry on the annotation, or Alternate Text on its enclosing tag — and delete review leftovers (comments, stamps) before publishing.",
  linkTag:
    "Tag each link inside a Link structure element (Acrobat: Prepare for accessibility → Automatically tag PDF usually creates them; verify in the Tags panel).",
  linkDesc:
    "Describe each link's destination: in Acrobat's Tags panel, right-click the Link tag → Properties → Alternate Text — and if a PDF/UA validator still flags the annotation's own Contents key, write it with a PDF/UA tool (axesPDF, PAC's guidance).",
  form: "Give every form field a Tooltip (its spoken label) and check in the Tags panel that each field sits inside a Form tag (Acrobat: Prepare a form, then Prepare for accessibility).",
  tabs: "Set every page's tab order to follow the document structure (Acrobat: Page Thumbnails → select all pages → Page Properties → Tab Order → Use Document Structure — the accessibility fix-ups do this in bulk).",
  language:
    "Set the document language (Acrobat: Document properties → Advanced tab → Reading Options → Language; classic UI: File → Properties), plus per-passage language where the language changes.",
  title:
    "Set a document Title (Acrobat: Document properties → Description tab; classic UI: File → Properties) and enable Initial View → Show → Document Title.",
  xmpMetadata:
    "Add the required XMP metadata — Acrobat's accessibility fix-ups add the metadata stream automatically.",
  identifier:
    "Add the PDF/UA identifier with Acrobat's Preflight (“Apply PDF/UA-1 entry”) — but only after the other items are fixed: it is a claim of conformance, not a repair.",
  markInfo:
    "Re-export with tags on, or run Acrobat's accessibility fix-ups — they write the MarkInfo entry that declares the file tagged.",
  headings:
    "Tag headings with the correct level (H1–H6) without skipping levels (Acrobat: Tags panel / Reading Order).",
  fontEmbed:
    "Embed the fonts: re-export with font embedding on (Word: File → Options → Save → “Embed fonts in the file”), or use Acrobat's Print Production → Preflight “Embed missing fonts” fix-up.",
  toUnicode:
    "Fix the character-to-Unicode mapping — without it, copy/paste and screen readers can receive the wrong characters even though the page looks right. Re-export from the source with a current exporter, or use Preflight's font fix-ups; avoid Print-to-PDF / re-distilling, which strips the tag tree.",
  cidSet:
    "A CIDSet/CharSet technicality of the embedded font (often a Word/Office export artifact). To repair it while keeping your tags, use Acrobat's Preflight font fix-ups or a PDF/UA tool like axesPDF — avoid Print-to-PDF / re-distilling, which strips the tag tree.",
  fontProgram:
    "A font-program technicality (encoding, CMap, glyph or width data). Re-export from a current version of the source application, or use Acrobat's Print Production → Preflight font fix-ups.",
  notes:
    "Give each Note tag a unique ID — footnote/endnote exports from current Word versions write these; Acrobat's Preflight can repair them.",
  encryption:
    "Change the file's security settings so assistive technology may read it (Acrobat: Document properties → Security — allow content extraction for accessibility), or remove encryption.",
  xfa: "Rebuild the form without dynamic XFA — export a static form and add fields in Acrobat (Prepare a form).",
} as const;

type HintKey = keyof typeof HINTS;

/** Rule-id sets per advice group. Ids from BOTH 1.30.1 profiles (PDF/UA-1
 *  flavour and WCAG-2-2-Machine); a rule absent here falls back. */
const HINT_RULES: ReadonlyArray<[ids: readonly string[], key: HintKey]> = [
  [["7.1-1", "7.1-2", "7.1-3", "7.1-11", "7.1-12"], "tagging"],
  [["7.1-4"], "tagging"], // Suspects=true — re-tagging clears it
  [["7.1-5", "7.1-6", "7.1-7"], "roleMap"],
  [["7.1-8", "7.2-33"], "xmpMetadata"],
  [["7.1-9", "7.1-10"], "title"],
  [["5-1", "5-2", "5-3", "5-4", "5-5"], "identifier"],
  [["6.2-1"], "markInfo"],
  [
    [
      "7.2-2",
      "7.2-21",
      "7.2-22",
      "7.2-23",
      "7.2-24",
      "7.2-25",
      "7.2-29",
      "7.2-30",
      "7.2-31",
      "7.2-32",
      "7.2-34",
    ],
    "language",
  ],
  [
    [
      "7.2-3",
      "7.2-4",
      "7.2-5",
      "7.2-6",
      "7.2-7",
      "7.2-8",
      "7.2-9",
      "7.2-10",
      "7.2-11",
      "7.2-12",
      "7.2-13",
      "7.2-14",
      "7.2-15",
      "7.2-16",
      "7.2-36",
      "7.2-37",
      "7.2-38",
      "7.2-39",
      "7.2-41",
      "7.2-42",
      "7.2-43",
    ],
    "table",
  ],
  [["7.2-17", "7.2-18", "7.2-19", "7.2-20", "7.2-40"], "list"],
  [["7.5-1", "7.5-2"], "scope"],
  [["7.3-1"], "alt"],
  [["7.7-1"], "formula"],
  [["7.9-1", "7.9-2"], "notes"],
  [["7.15-1"], "xfa"],
  [["7.16-1"], "encryption"],
  [["7.18.1-1", "7.18.1-2"], "annotation"],
  [["7.18.1-3", "7.18.4-1", "7.18.4-2"], "form"],
  [["7.18.3-1"], "tabs"],
  [["7.18.5-1"], "linkTag"],
  [["7.18.5-2", "2.4.9-1"], "linkDesc"],
  [["7.4.2-1", "7.4.4-1", "7.4.4-2", "7.4.4-3"], "headings"],
  [["7.21.4.1-1"], "fontEmbed"],
  [["7.21.7-1", "7.21.7-2"], "toUnicode"],
  [["7.21.4.2-1", "7.21.4.2-2"], "cidSet"],
  [
    [
      "7.21.3.1-1",
      "7.21.3.2-1",
      "7.21.3.3-1",
      "7.21.3.3-2",
      "7.21.3.3-3",
      "7.21.4.1-2",
      "7.21.5-1",
      "7.21.6-1",
      "7.21.6-2",
      "7.21.6-3",
      "7.21.6-4",
      "7.21.8-1",
    ],
    "fontProgram",
  ],
];

const HINT_BY_RULE: ReadonlyMap<string, HintKey> = new Map(
  HINT_RULES.flatMap(([ids, key]) => ids.map((id) => [id, key] as const)),
);

export function pdfUaFixHint(f: PdfUaFailureLike): string {
  const key = HINT_BY_RULE.get((f.ruleId ?? "").trim());
  if (key) return HINTS[key];
  return `Open the document in Acrobat's Accessibility Checker (or PAC) and address ISO 14289-1 clause ${f.clause ?? "this rule"}.`;
}

/**
 * Two-route fix guidance for one veraPDF failure: how to prevent it in the
 * SOURCE file (Word/InDesign) and how to repair it in the EXPORTED PDF
 * (Acrobat). Rendered as a per-rule expander in the plan's "Above and
 * beyond" group (v1.134.0) so a reader who chooses to go past the legal
 * floor has a place to start on either side of the export.
 *
 * Routed by rule id like the hints above, and CONSERVATIVE the same way — a
 * rule that maps to nothing returns null and renders as a plain row with no
 * advice, because wrong advice under the referee's words is worse than none.
 */
const ROUTES = {
  tagging: {
    source:
      "Re-export with tags on (Word: Save As PDF with “Document structure tags for accessibility” checked; InDesign: Export → Create Tagged PDF). Content the exporter understands is tagged automatically; page furniture becomes artifacts.",
    pdf: "Acrobat: Prepare for accessibility → Automatically tag PDF, then open Fix reading order and mark decorative items — borders, backgrounds, repeated headers and footers — as Background/Artifact.",
  },
  roleMap: {
    source:
      "Custom paragraph-style names become custom tags at export — mapping them is a finishing step in the PDF rather than something the source file controls.",
    pdf: "Acrobat: Tags panel → options menu → Edit Role Map — map each custom tag to its closest standard type (P, H1–H6, L…), so assistive technology reads it as what it is.",
  },
  scope: {
    source:
      "Keep tables simple in the source — one header row, marked as such (Word: Table Design → check Header Row) — and re-export. The exporter writes the header direction for you.",
    pdf: "In Acrobat's Table Editor (Prepare for accessibility → Fix reading order → Table Editor), open each header cell's Table Cell Properties and set Scope to Row or Column.",
  },
  table: {
    source:
      "Rebuild the table as a real table in the source (Insert → Table — never tab stops or a picture of a table) with one marked header row, then re-export.",
    pdf: "In Acrobat's Tags panel, repair the structure so each Table contains TR rows holding only TH and TD cells — the Table Editor in Fix reading order rebuilds most of this.",
  },
  list: {
    source:
      "Use the source's real list controls (Word's bullet and numbering buttons), never typed dashes, then re-export.",
    pdf: "In Acrobat's Tags panel, rebuild the list tags so each L contains LI items (with Lbl and LBody children).",
  },
  alt: {
    source:
      "Add alt text on each image in the source (Word: right-click the image → View Alt Text; InDesign: Object → Object Export Options → Alt Text), mark decorative images as decorative, and re-export.",
    pdf: "Acrobat: Prepare for accessibility → Add alternate text walks every figure in turn; purely decorative images should be marked as artifacts instead.",
  },
  formula: {
    source:
      "Write equations with the source's equation editor and give each a spoken alternative in surrounding text where the format allows, then re-export.",
    pdf: "In Acrobat's Tags panel, give each Formula tag Alternate Text that says what the expression means.",
  },
  annotation: {
    source:
      "Comments, stamps, and similar review annotations rarely belong in a published file — remove or flatten them in the source before export.",
    pdf: "Delete annotations that are review leftovers; give each one you keep a short description — its Contents field (open the annotation's properties), or Alternate Text on its enclosing tag.",
  },
  linkTag: {
    source:
      "Insert links as real hyperlinks in the source (Word: Insert → Link) rather than pasting bare text, then re-export with tags on.",
    pdf: "Acrobat: Prepare for accessibility → Automatically tag PDF usually creates the Link tags; verify in the Tags panel that each link sits inside a Link element.",
  },
  linkDesc: {
    source:
      "Write link text that already says where it goes (“the SFY25 annual report”, not a bare address) — descriptive link text serves every reader even where this PDF/UA nicety is absent.",
    pdf: "In Acrobat's Tags panel, right-click each Link tag → Properties → Alternate Text and describe the destination in a few words; if a validator still flags the annotation's Contents key, write it with a PDF/UA tool (axesPDF).",
  },
  form: {
    source:
      "Build forms with the source application's real form controls where possible, or plan to finish the form in Acrobat — exported drawings of forms cannot carry field labels.",
    pdf: "Acrobat: Prepare a form, then Prepare for accessibility — give every field a Tooltip (its spoken label) and check in the Tags panel that each field sits inside a Form tag.",
  },
  tabs: {
    source:
      "Re-exporting from a current version of Word or InDesign writes this page setting correctly — it is stamped at export time, not something you author.",
    pdf: "Run Acrobat's accessibility fix-ups (Prepare for accessibility → the Make accessible workflow) — they set every page's tab order to follow the document structure. One setting per page, fixed in bulk.",
  },
  language: {
    source:
      "Set the document language in the source (Word: Review → Language → Set Proofing Language) and re-export.",
    pdf: "Acrobat: File → Properties → Advanced → Reading Options → Language.",
  },
  displayDocTitle: {
    source:
      "Re-export from a current Office or InDesign version — recent exporters set “show document title” automatically when the file has a title.",
    pdf: "Acrobat: File → Properties → Initial View → Show: Document Title, then save. One checkbox.",
  },
  dcTitle: {
    source:
      "Set the document's Title in the source (Word: File → Info → Title; InDesign: File → File Info) and re-export — the exporter writes it into the PDF's metadata for you.",
    pdf: "Acrobat: File → Properties → Description → Title, then save — Acrobat writes the matching metadata entry. The accessibility fix-ups repair it too.",
  },
  xmpMetadata: {
    source:
      "Set the document's properties in the source (Word: File → Info) and re-export — the exporter writes the metadata stream.",
    pdf: "Run Acrobat's accessibility fix-ups, or set File → Properties → Description fields — Acrobat writes the XMP metadata stream for you.",
  },
  identifier: {
    source:
      "No source application writes this claim — it is added to the finished PDF once the file actually conforms.",
    pdf: "Add the PDF/UA identifier with Acrobat's Preflight (“Apply PDF/UA-1 entry”) or a PDF/UA tool — but only AFTER the other items are fixed: this flag is a claim of conformance, not a repair.",
  },
  markInfo: {
    source:
      "Re-export with tags on (Word: “Document structure tags for accessibility”; InDesign: Create Tagged PDF) — the exporter writes the tagged-file declaration.",
    pdf: "Acrobat: Prepare for accessibility → Automatically tag PDF (or the fix-ups) writes the MarkInfo declaration when it tags the file.",
  },
  headings: {
    source:
      "Use real heading styles in order (Word's Heading 1/2/3; InDesign paragraph styles mapped to H1–H3) without skipping levels, then re-export.",
    pdf: "In Acrobat's Tags panel (or Fix reading order), retag heading elements H1–H6 so the levels descend without gaps.",
  },
  fontEmbed: {
    source:
      "Turn on font embedding before exporting (Word: File → Options → Save → “Embed fonts in the file”; InDesign embeds automatically), then re-export.",
    pdf: "Acrobat: Print Production → Preflight → the “Embed missing fonts” fix-up. Embedding protects how the page renders on machines without the font.",
  },
  toUnicode: {
    source:
      "An export artifact — re-export from a current version of the source application, which writes the character-to-Unicode maps screen readers and copy/paste depend on.",
    pdf: "Use Acrobat's Print Production → Preflight font fix-ups to add ToUnicode maps. Avoid Print-to-PDF or re-distilling — both strip the tag tree.",
  },
  cidSet: {
    source:
      "An export artifact, not something you authored — re-exporting from a current version of Word or InDesign usually regenerates the font correctly.",
    pdf: "Use Acrobat's Print Production → Preflight font fix-ups (or a PDF/UA tool such as axesPDF) to repair the embedded font's CIDSet. Avoid Print-to-PDF or re-distilling — both strip the tag tree.",
  },
  fontProgram: {
    source:
      "A font-program technicality from the exporter — re-export from a current version of the source application, or substitute a mainstream font.",
    pdf: "Use Acrobat's Print Production → Preflight font fix-ups; a PDF/UA tool such as axesPDF repairs these while keeping the tag tree.",
  },
  notes: {
    source:
      "Re-export from a current Word version — its footnote/endnote export writes the Note IDs assistive technology links references to.",
    pdf: "Acrobat's Preflight can add missing Note IDs; otherwise set an ID on each Note tag in the Tags panel (Properties).",
  },
  encryption: {
    source:
      "Publish without restrictive security, or grant accessibility permission when applying it.",
    pdf: "Acrobat: File → Properties → Security — allow content extraction for accessibility, or remove the security settings.",
  },
  xfa: {
    source:
      "Rebuild the form as a static document in the source and plan the fields for Acrobat — dynamic XFA cannot be made PDF/UA conformant.",
    pdf: "Recreate the form as a static PDF: flatten or re-export the content, then add fields with Acrobat's Prepare a form.",
  },
} as const;

type RouteKey = keyof typeof ROUTES;

const ROUTE_RULES: ReadonlyArray<[ids: readonly string[], key: RouteKey]> = [
  [["7.1-1", "7.1-2", "7.1-3", "7.1-4", "7.1-11", "7.1-12"], "tagging"],
  [["7.1-5", "7.1-6", "7.1-7"], "roleMap"],
  [["7.1-8"], "xmpMetadata"],
  [["7.1-9"], "dcTitle"],
  [["7.1-10"], "displayDocTitle"],
  [["5-1", "5-2", "5-3", "5-4", "5-5"], "identifier"],
  [["6.2-1"], "markInfo"],
  [
    [
      "7.2-2",
      "7.2-21",
      "7.2-22",
      "7.2-23",
      "7.2-24",
      "7.2-25",
      "7.2-29",
      "7.2-30",
      "7.2-31",
      "7.2-32",
      "7.2-33",
      "7.2-34",
    ],
    "language",
  ],
  [
    [
      "7.2-3",
      "7.2-4",
      "7.2-5",
      "7.2-6",
      "7.2-7",
      "7.2-8",
      "7.2-9",
      "7.2-10",
      "7.2-11",
      "7.2-12",
      "7.2-13",
      "7.2-14",
      "7.2-15",
      "7.2-16",
      "7.2-36",
      "7.2-37",
      "7.2-38",
      "7.2-39",
      "7.2-41",
      "7.2-42",
      "7.2-43",
    ],
    "table",
  ],
  [["7.2-17", "7.2-18", "7.2-19", "7.2-20", "7.2-40"], "list"],
  [["7.5-1", "7.5-2"], "scope"],
  [["7.3-1"], "alt"],
  [["7.7-1"], "formula"],
  [["7.9-1", "7.9-2"], "notes"],
  [["7.15-1"], "xfa"],
  [["7.16-1"], "encryption"],
  [["7.18.1-1", "7.18.1-2"], "annotation"],
  [["7.18.1-3", "7.18.4-1", "7.18.4-2"], "form"],
  [["7.18.3-1"], "tabs"],
  [["7.18.5-1"], "linkTag"],
  [["7.18.5-2", "2.4.9-1"], "linkDesc"],
  [["7.4.2-1", "7.4.4-1", "7.4.4-2", "7.4.4-3"], "headings"],
  [["7.21.4.1-1"], "fontEmbed"],
  [["7.21.7-1", "7.21.7-2"], "toUnicode"],
  [["7.21.4.2-1", "7.21.4.2-2"], "cidSet"],
  [
    [
      "7.21.3.1-1",
      "7.21.3.2-1",
      "7.21.3.3-1",
      "7.21.3.3-2",
      "7.21.3.3-3",
      "7.21.4.1-2",
      "7.21.5-1",
      "7.21.6-1",
      "7.21.6-2",
      "7.21.6-3",
      "7.21.6-4",
      "7.21.8-1",
    ],
    "fontProgram",
  ],
];

const ROUTE_BY_RULE: ReadonlyMap<string, RouteKey> = new Map(
  ROUTE_RULES.flatMap(([ids, key]) => ids.map((id) => [id, key] as const)),
);

export function pdfUaFixRoutes(f: PdfUaFailureLike): { source: string; pdf: string } | null {
  const key = ROUTE_BY_RULE.get((f.ruleId ?? "").trim());
  return key ? ROUTES[key] : null;
}

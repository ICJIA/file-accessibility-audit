/** Finding codes for the PDF supplementary pass — see ../findingCodes.ts.
 *  Emitted by packages/analyzer/src/scoring/supplementary.ts, which appends
 *  technical-signal sections to PDF categories after they are scored. Nothing
 *  here moves a score, so no code is a "failure": indented lines are
 *  "signal" (including the indented "Advisory — not scored" and "Fix:"
 *  lines — the two leading spaces decide the kind), section headings are
 *  "divider", and the rest are "info", "pass" or "howto". */
import { defineFindingCodes } from "./define.js";

export const PDF_SUPPLEMENTARY_FINDING_CODES = defineFindingCodes({
  // Reading order — list structure, notes, role map, tab order, document
  // behaviors, text overrides
  "pdf.reading_order.lists_section": ["divider", "Heading of the list-structure section."],
  "pdf.reading_order.lists_detected": ["info", "How many tagged lists and list items were found."],
  "pdf.reading_order.lists_item": [
    "signal",
    "One tagged list: its item count, label and body tags, nesting and whether it is well-formed.",
  ],
  "pdf.reading_order.lists_well_formed": [
    "pass",
    "Every tagged list is well-formed: each list item has a body.",
  ],
  "pdf.reading_order.lists_without_labels": [
    "info",
    "Lists have no label (bullet or number) elements, which is optional and not penalized.",
  ],
  "pdf.reading_order.lists_lbody_misspelt": [
    "info",
    "List items appear to lack bodies, but the bodies are present under a tag name that differs from the standard one only in capitalization.",
    ["1.3.1"],
  ],
  "pdf.reading_order.lists_lbody_misspelt_fix": [
    "howto",
    "How to map the misspelt list-body tag to the standard one in the RoleMap.",
  ],
  "pdf.reading_order.lists_missing_lbody": [
    "info",
    "Lists have items with no body element, so their content may not be announced correctly.",
    ["1.3.1"],
  ],
  "pdf.reading_order.lists_missing_lbody_fix": [
    "howto",
    "How to add the missing list-item bodies in Acrobat.",
  ],
  "pdf.reading_order.lists_none_tagged": [
    "info",
    "No tagged lists were found in a tagged document.",
  ],
  "pdf.reading_order.notes_section": ["divider", "Heading of the footnotes and endnotes section."],
  "pdf.reading_order.notes_detected": ["info", "How many note tags were found."],
  "pdf.reading_order.notes_ids_unique": ["signal", "Every note carries a unique ID."],
  "pdf.reading_order.notes_missing_id": ["signal", "Notes have no ID (reported, not scored)."],
  "pdf.reading_order.notes_duplicate_id": [
    "signal",
    "Notes reuse another note's ID (reported, not scored).",
  ],
  "pdf.reading_order.notes_id_fix": ["signal", "How to give each note a unique ID in Acrobat."],
  "pdf.reading_order.structure_signals_section": [
    "divider",
    "Heading of the additional structure signals section.",
  ],
  "pdf.reading_order.rolemap_present": [
    "signal",
    "A role map is present, with how many custom tags it maps.",
  ],
  "pdf.reading_order.rolemap_entry": ["signal", "One role-map entry."],
  "pdf.reading_order.rolemap_entries_more": [
    "signal",
    "How many more role-map entries the list left out.",
  ],
  "pdf.reading_order.rolemap_absent": [
    "signal",
    "No role map is present; all tags use standard roles.",
  ],
  "pdf.reading_order.rolemap_circular": [
    "signal",
    "Role-map entries are circular and never reach a standard type (reported, not scored).",
  ],
  "pdf.reading_order.rolemap_standard_remapped": [
    "signal",
    "The role map remaps standard structure types (reported, not scored).",
  ],
  "pdf.reading_order.rolemap_unmapped_tags": [
    "signal",
    "Custom tag names have no mapping to a standard structure type (reported, not scored).",
  ],
  "pdf.reading_order.rolemap_near_miss_tags": [
    "signal",
    "Some unmapped tags differ from a standard tag only in capitalization or spacing.",
  ],
  "pdf.reading_order.tab_order_all_pages": ["signal", "Tab order is set on every page."],
  "pdf.reading_order.tab_order_some_pages": ["signal", "Tab order is set on only some pages."],
  "pdf.reading_order.tab_order_some_pages_fix": [
    "signal",
    "How to set the tab order on the remaining pages.",
  ],
  "pdf.reading_order.tab_order_not_set": ["signal", "No tab order is set on any page."],
  "pdf.reading_order.tab_order_not_set_fix": [
    "signal",
    "How to set the tab order on all pages in Acrobat.",
  ],
  "pdf.reading_order.behaviors_section": ["divider", "Heading of the document behaviors section."],
  "pdf.reading_order.behaviors_multimedia": [
    "signal",
    "Multimedia annotations are embedded; captions and alternatives need a manual review.",
  ],
  "pdf.reading_order.behaviors_javascript": [
    "signal",
    "JavaScript is present; its accessibility needs a manual review.",
  ],
  "pdf.reading_order.behaviors_layers": ["signal", "Optional-content layers are present."],
  "pdf.reading_order.behaviors_layers_unnamed": [
    "signal",
    "Layer configurations have no name (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_layers_auto_state": [
    "signal",
    "Layer configurations switch content automatically (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_other_annotations": [
    "signal",
    "Annotations other than links and form fields are present.",
  ],
  "pdf.reading_order.behaviors_other_annotations_untagged": [
    "signal",
    "Some of those annotations are not referenced from the tag structure (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_other_annotations_no_contents": [
    "signal",
    "Some of those annotations carry no description (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_reference_xobjects": [
    "signal",
    "The document uses reference XObjects, which PDF/UA prohibits (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_attachments": ["signal", "Embedded file attachments are present."],
  "pdf.reading_order.behaviors_attachments_no_description": [
    "signal",
    "Attachments have no description (reported, not scored).",
  ],
  "pdf.reading_order.behaviors_signature_fields": [
    "signal",
    "Digital-signature fields are present.",
  ],
  "pdf.reading_order.text_overrides_section": [
    "divider",
    "Heading of the screen reader text overrides section.",
  ],
  "pdf.reading_order.text_overrides_actual_text": [
    "signal",
    "Elements carry replacement text for screen readers.",
  ],
  "pdf.reading_order.text_overrides_expansion_text": [
    "signal",
    "Elements carry expansion text for abbreviations.",
  ],
  "pdf.reading_order.text_overrides_note": ["signal", "Why replacement and expansion text help."],

  // Text extractability — structure signals, PDF/UA identifier, artifacts
  "pdf.text_extractability.structure_signals_section": [
    "divider",
    "Heading of the document structure signals section.",
  ],
  "pdf.text_extractability.structure_marked_content": [
    "signal",
    "The document is marked as distinguishing real content from artifacts.",
  ],
  "pdf.text_extractability.structure_marked_not_true": [
    "signal",
    "MarkInfo is present but does not mark the document as distinguishing content from artifacts.",
  ],
  "pdf.text_extractability.structure_marked_not_true_fix": [
    "signal",
    "How to mark decorative elements as artifacts in Acrobat.",
  ],
  "pdf.text_extractability.structure_no_markinfo": [
    "signal",
    "No MarkInfo dictionary was found in a tagged document.",
  ],
  "pdf.text_extractability.structure_no_markinfo_fix": [
    "signal",
    "How to mark decorative elements as artifacts with the Reading Order tool.",
  ],
  "pdf.text_extractability.structure_paragraph_tags": [
    "signal",
    "How many paragraph tags were found.",
  ],
  "pdf.text_extractability.structure_no_paragraph_tags": [
    "signal",
    "No paragraph tags were found in a tagged document.",
  ],
  "pdf.text_extractability.structure_empty_pages": [
    "signal",
    "Empty or near-empty pages were detected.",
  ],
  "pdf.text_extractability.structure_empty_pages_note": [
    "signal",
    "What empty pages may indicate.",
  ],
  "pdf.text_extractability.structure_image_only_pages": [
    "signal",
    "Pages have no text and are filled by an image, like scanned pages inside a text document (reported, not scored here).",
  ],
  "pdf.text_extractability.structure_image_only_pages_fix": [
    "signal",
    "How to fix scanned pages inside a text document.",
  ],
  "pdf.text_extractability.pdfua_section": ["divider", "Heading of the PDF/UA section."],
  "pdf.text_extractability.pdfua_declared": ["signal", "The document declares PDF/UA conformance."],
  "pdf.text_extractability.pdfua_declared_note": ["signal", "What a PDF/UA declaration means."],
  "pdf.text_extractability.pdfua_not_declared": [
    "signal",
    "The document does not declare PDF/UA conformance.",
  ],
  "pdf.text_extractability.pdfua_not_required_note": [
    "signal",
    "PDF/UA conformance is not required for WCAG.",
  ],
  "pdf.text_extractability.artifacts_section": [
    "divider",
    "Heading of the artifact tagging section.",
  ],
  "pdf.text_extractability.artifacts_hide_content": [
    "signal",
    "Elements are marked as artifacts while the tags hold no content, which hides content from screen readers.",
  ],
  "pdf.text_extractability.artifacts_tagged": [
    "signal",
    "Decorative elements are tagged as artifacts.",
  ],
  "pdf.text_extractability.artifacts_none": [
    "signal",
    "No artifact tags were found in a tagged document.",
  ],
  "pdf.text_extractability.artifacts_none_note": [
    "signal",
    "Repeating headers and footers should be tagged as artifacts.",
  ],

  // Title & language — language spans
  "pdf.title_language.lang_spans_section": ["divider", "Heading of the language span section."],
  "pdf.title_language.lang_spans_foreign": [
    "signal",
    "Elements carry language declarations that differ from the document language.",
    ["3.1.2"],
  ],
  "pdf.title_language.lang_spans_language": [
    "signal",
    "How many elements declare one particular language.",
    ["3.1.2"],
  ],
  "pdf.title_language.lang_spans_note": ["signal", "Why language spans help."],
  "pdf.title_language.lang_spans_match_document": [
    "signal",
    "Elements carry language declarations that match the document language.",
  ],

  // The Adobe Acrobat guide appended to each category that has something to
  // fix (one heading code and one step code per category)
  "pdf.text_extractability.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Text Extractability.",
  ],
  "pdf.text_extractability.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Text Extractability.",
  ],
  "pdf.title_language.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Title & Language.",
  ],
  "pdf.title_language.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Title & Language.",
  ],
  "pdf.heading_structure.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Heading Structure.",
  ],
  "pdf.heading_structure.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Heading Structure.",
  ],
  "pdf.alt_text.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Alt Text.",
  ],
  "pdf.alt_text.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Alt Text.",
  ],
  "pdf.bookmarks.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Bookmarks.",
  ],
  "pdf.bookmarks.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Bookmarks.",
  ],
  "pdf.table_markup.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Table Markup.",
  ],
  "pdf.table_markup.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Table Markup.",
  ],
  "pdf.link_quality.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Link Quality.",
  ],
  "pdf.link_quality.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Link Quality.",
  ],
  "pdf.form_accessibility.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Form Accessibility.",
  ],
  "pdf.form_accessibility.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Form Accessibility.",
  ],
  "pdf.reading_order.acrobat_guide_heading": [
    "divider",
    "Heading of the Adobe Acrobat how-to-fix guide for Reading Order.",
  ],
  "pdf.reading_order.acrobat_guide_step": [
    "info",
    "One step of the Adobe Acrobat how-to-fix guide for Reading Order.",
  ],
  "pdf.alt_text.acrobat_guide_text_box_figures": [
    "info",
    "Acrobat step for figures that are really text boxes: retag them instead of describing them.",
  ],
  "pdf.link_quality.acrobat_guide_untagged_links": [
    "info",
    "Acrobat step for tagging links that are not in the tag structure.",
  ],
});

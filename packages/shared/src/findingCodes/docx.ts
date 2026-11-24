/** Finding codes for Word (.docx) — see ../findingCodes.ts. Emitted by
 *  packages/analyzer/src/scoring/docx.ts (and, for the declared-language
 *  findings Word shares with PowerPoint, scoring/common.ts). */
import { defineFindingCodes } from "./define.js";

export const DOCX_FINDING_CODES = defineFindingCodes({
  // Any category
  "docx.general.unread_content_partial": [
    "info",
    "The document's body could not be fully read, so this category's result covers only the content that was read.",
  ],
  "docx.general.unread_content_not_assessed": [
    "info",
    "The document's body could not be read, so this check could not run and the category is not assessed.",
  ],

  // Text extractability
  "docx.text_extractability.no_text": ["info", "No text was found in the document."],
  "docx.text_extractability.images_only_content": [
    "info",
    "Images make up the document's whole content.",
  ],
  "docx.text_extractability.not_assessed": [
    "info",
    "Text extractability was not assessed for this document.",
  ],
  "docx.text_extractability.text_extractable": [
    "pass",
    "The document contains real, extractable text.",
  ],
  "docx.text_extractability.empty_paragraph_runs": [
    "advisory",
    "Runs of three or more empty paragraphs are used for spacing.",
  ],

  // Title & language
  "docx.title_language.title_present": ["pass", "The document has a title."],
  "docx.title_language.title_tool_generated": [
    "failure",
    "The title is a file name or tool-generated string, not a descriptive title.",
    ["2.4.2"],
  ],
  "docx.title_language.title_tool_generated_fix": [
    "howto",
    "How to replace a tool-generated title in Word.",
  ],
  "docx.title_language.title_filename_shaped": [
    "advisory",
    "The title reads like a file name but still names the document.",
    ["2.4.2"],
  ],
  "docx.title_language.title_missing": ["failure", "No document title is set.", ["2.4.2"]],
  "docx.title_language.title_unreadable": [
    "info",
    "The title could not be read because the core-properties part is unparseable; it is not scored.",
  ],
  "docx.title_language.language_declared": ["pass", "The document declares its language."],
  "docx.title_language.language_unusable": [
    "failure",
    "The declared language is not a usable language code.",
    ["3.1.1"],
  ],
  "docx.title_language.language_unusable_fix": [
    "howto",
    "How to fix a language value that is not a standard code.",
  ],
  "docx.title_language.language_mismatch": [
    "failure",
    "The declared language contradicts the language the text is written in.",
    ["3.1.1"],
  ],
  "docx.title_language.language_mismatch_evidence": [
    "info",
    "The word counts behind the language-mismatch finding.",
    ["3.1.1"],
  ],
  "docx.title_language.language_mismatch_fix": [
    "howto",
    "How to mark the text with its real language in Word.",
  ],
  "docx.title_language.language_mismatch_mixed_note": [
    "info",
    "What to do instead if part of the document really is in the declared language.",
  ],
  "docx.title_language.passage_languages": [
    "info",
    "Passages are declared in other languages alongside the document language.",
    ["3.1.2"],
  ],
  "docx.title_language.language_missing": [
    "failure",
    "No document language is declared.",
    ["3.1.1"],
  ],
  "docx.title_language.language_unreadable": [
    "info",
    "The language could not be read because a properties part is unparseable; it is not scored.",
  ],

  // Heading structure
  "docx.heading_structure.no_headings": ["info", "No headings were found."],
  "docx.heading_structure.no_headings_lone_title": [
    "info",
    "No headings were found; one paragraph looks like a title, which is not scored.",
  ],
  "docx.heading_structure.headings_found": ["info", "How many real headings were found."],
  "docx.heading_structure.first_not_h1": ["advisory", "The first heading is not Heading 1."],
  "docx.heading_structure.skipped_level": ["advisory", "Heading levels are skipped."],
  "docx.heading_structure.empty_headings": [
    "failure",
    "Heading-styled paragraphs contain no text.",
    ["1.3.1"],
  ],
  "docx.heading_structure.lone_title_lookalike": [
    "advisory",
    "One paragraph is formatted like a heading; a single title is not scored.",
  ],
  "docx.heading_structure.headings_overwhelmed": [
    "failure",
    "A few real headings sit beside many unmarked ones, so the outline is almost empty.",
    ["1.3.1"],
  ],
  "docx.heading_structure.lookalike_headings": [
    "failure",
    "Paragraphs are formatted to look like headings but are not real Heading styles.",
    ["1.3.1"],
  ],
  "docx.heading_structure.outline_heading": ["divider", "Heading of the heading-outline list."],
  "docx.heading_structure.outline_item": ["signal", "One heading in the document's outline."],
  "docx.heading_structure.outline_more": [
    "signal",
    "How many more headings the outline list left out.",
  ],
  "docx.heading_structure.lookalike_list_heading": [
    "divider",
    "Heading of the list of paragraphs styled like headings.",
  ],
  "docx.heading_structure.lookalike_list_item": [
    "signal",
    "One paragraph that is styled like a heading.",
  ],
  "docx.heading_structure.lookalike_list_more": [
    "signal",
    "How many more heading-like paragraphs the list left out.",
  ],

  // Alt text
  "docx.alt_text.no_images": ["info", "No images were found."],
  "docx.alt_text.all_decorative": ["info", "Every image is marked decorative."],
  "docx.alt_text.images_with_alt": ["info", "How many meaningful images have alt text."],
  "docx.alt_text.images_missing_alt": ["failure", "Images are missing alt text.", ["1.1.1"]],
  "docx.alt_text.placeholder_alt": [
    "failure",
    "Images carry only a file name or placeholder word as their description.",
    ["1.1.1"],
  ],
  "docx.alt_text.drawn_shapes": [
    "failure",
    "Some of the undescribed images are drawn shapes with no text.",
    ["1.1.1"],
  ],
  "docx.alt_text.title_only": [
    "failure",
    "Images have only the Title property filled, which screen readers do not read.",
    ["1.1.1"],
  ],
  "docx.alt_text.in_header_or_footer": [
    "failure",
    "Some of the undescribed images are in a page header or footer.",
    ["1.1.1"],
  ],

  // Table markup
  "docx.table_markup.no_tables": ["info", "No tables were found."],
  "docx.table_markup.tables_found": ["info", "How many tables were found."],
  "docx.table_markup.no_header_row": ["failure", "Data tables have no header row.", ["1.3.1"]],
  "docx.table_markup.bare_grid_layout": [
    "advisory",
    "Bare grids with nothing drawn and no header marks are treated as layout tables.",
    ["1.3.1"],
  ],
  "docx.table_markup.empty_header_row": [
    "advisory",
    "Tables mark a header row whose cells are all empty.",
  ],
  "docx.table_markup.nested_tables": ["advisory", "Nested tables were found."],
  "docx.table_markup.merged_cells": ["advisory", "Tables contain merged cells."],
  "docx.table_markup.empty_rows": ["advisory", "Tables contain entirely empty rows."],

  // Color contrast
  "docx.color_contrast.colors_unresolved": [
    "info",
    "Text colors are inherited or automatic and could not be resolved, so contrast was not evaluated.",
  ],
  "docx.color_contrast.nothing_checkable": [
    "info",
    "No text with a resolvable color was found to evaluate.",
  ],
  "docx.color_contrast.runs_checked": [
    "info",
    "How many colored text runs were checked and how many fall below the contrast minimum.",
    ["1.4.3"],
  ],
  "docx.color_contrast.some_colors_unresolved": [
    "info",
    "Some runs use colors that could not be resolved and need a manual check.",
  ],
  "docx.color_contrast.lowest_ratio": [
    "failure",
    "The lowest contrast ratio found, with its colors.",
    ["1.4.3"],
  ],

  // List structure
  "docx.list_structure.no_lists": ["info", "No lists were found."],
  "docx.list_structure.list_items_census": [
    "info",
    "How many real list items and hand-typed bullet paragraphs were found.",
  ],
  "docx.list_structure.typed_bullets": [
    "failure",
    "Paragraphs use typed bullets or numbers instead of real list formatting.",
    ["1.3.1"],
  ],

  // Link quality
  "docx.link_quality.no_links": ["info", "No hyperlinks were found."],
  "docx.link_quality.links_assessed": [
    "info",
    "How many links were found and how many have no text.",
  ],
  "docx.link_quality.links_unnamed": ["failure", "Links have no link text.", ["4.1.2"]],
  "docx.link_quality.vague_text": ["advisory", "Links use non-descriptive text.", ["2.4.4"]],
  "docx.link_quality.raw_urls": [
    "advisory",
    "Links show the raw URL as their visible text.",
    ["2.4.4"],
  ],

  // Reading order (reported, never scored)
  "docx.reading_order.floating_objects": [
    "info",
    "Floating (anchored) objects were found; their reading position needs a manual check.",
  ],
  "docx.reading_order.floating_objects_check_by_hand": [
    "info",
    "Ordinary paragraphs keep their order; the floating objects are the part to check by hand.",
  ],
  "docx.reading_order.no_floating_objects": [
    "info",
    "No floating objects were found; body content follows Word's linear flow.",
  ],

  // Form accessibility (reported, never scored)
  "docx.form_accessibility.controls_detected": [
    "info",
    "Content controls or legacy form fields were detected; their accessibility is not assessed.",
  ],
  "docx.form_accessibility.no_controls": ["info", "No form controls were detected."],
});

/** Finding codes for Excel (.xlsx) — see ../findingCodes.ts. Emitted by
 *  packages/analyzer/src/scoring/xlsx.ts. */
import { defineFindingCodes } from "./define.js";

export const XLSX_FINDING_CODES = defineFindingCodes({
  // Any category
  "xlsx.general.unread_content_partial": [
    "info",
    "A sheet could not be read, so this category's result covers only the content that was read.",
  ],
  "xlsx.general.unread_content_not_assessed": [
    "info",
    "A sheet could not be read, so this check could not run and the category is not assessed.",
  ],

  // Text extractability
  "xlsx.text_extractability.no_cell_values": [
    "info",
    "The workbook's visible sheets hold no cell values.",
  ],
  "xlsx.text_extractability.text_boxes_hold_content": [
    "info",
    "The workbook's text lives in drawing text boxes, which cell navigation does not reach.",
  ],
  "xlsx.text_extractability.not_assessed": [
    "info",
    "Text extractability was not assessed for this workbook.",
  ],
  "xlsx.text_extractability.cells_extractable": ["pass", "Cell values are real, extractable text."],
  "xlsx.text_extractability.text_boxes_not_audited": [
    "howto",
    "Drawing text boxes also hold text that the cell-based checks do not audit.",
  ],

  // Title & language
  "xlsx.title_language.title_present": ["pass", "The workbook has a title."],
  "xlsx.title_language.title_tool_generated": [
    "failure",
    "The title is a file name or tool-generated string, not a descriptive title.",
    ["2.4.2"],
  ],
  "xlsx.title_language.title_tool_generated_fix": [
    "howto",
    "How to replace a tool-generated title in Excel.",
  ],
  "xlsx.title_language.title_filename_shaped": [
    "advisory",
    "The title reads like a file name but still names the workbook.",
    ["2.4.2"],
  ],
  "xlsx.title_language.title_unreadable": [
    "info",
    "The title could not be read because the core-properties part is unparseable; it is not scored.",
  ],
  "xlsx.title_language.title_missing": ["failure", "No workbook title is set.", ["2.4.2"]],
  "xlsx.title_language.language_not_stored": [
    "info",
    "Excel stores no document language, so language is not assessed.",
  ],

  // Sheet names
  "xlsx.sheet_names.no_visible_sheets": ["info", "No visible sheets were found."],
  "xlsx.sheet_names.all_descriptive": ["pass", "Every visible sheet has a descriptive name."],
  "xlsx.sheet_names.default_name": [
    "advisory",
    "A sheet still has Excel's default name.",
    ["2.4.6"],
  ],
  "xlsx.sheet_names.hidden_sheets_excluded": [
    "howto",
    "Hidden sheets were excluded from the audit.",
  ],
  "xlsx.sheet_names.reported_not_graded": ["info", "Sheet names are reported but never graded."],

  // Table markup
  "xlsx.table_markup.no_tables_or_data": ["info", "No tables or sizable data ranges were found."],
  "xlsx.table_markup.defined_tables_found": ["info", "How many defined Excel Tables were found."],
  "xlsx.table_markup.not_checkable_no_defined_table": [
    "info",
    "No defined Excel Table exists, so header rows could not be checked; the category is not graded.",
  ],
  "xlsx.table_markup.default_header_names": [
    "advisory",
    "Tables still carry Excel's default header names.",
  ],
  "xlsx.table_markup.no_header_row": [
    "failure",
    "Multi-column defined tables have no header row.",
    ["1.3.1"],
  ],
  "xlsx.table_markup.single_column_no_header": [
    "advisory",
    "Single-column tables have the header row off.",
  ],
  "xlsx.table_markup.plain_ranges_no_table": [
    "advisory",
    "Data is laid out as plain cell ranges with no defined Excel Table anywhere.",
  ],
  "xlsx.table_markup.data_outside_tables": [
    "advisory",
    "Some data sits outside the defined tables as plain ranges.",
  ],
  "xlsx.table_markup.pivot_tables": [
    "advisory",
    "Sheets contain pivot tables, which need a manual readability check.",
  ],
  "xlsx.table_markup.data_starts_far_from_a1": [
    "advisory",
    "Data begins far from cell A1, leaving blank rows or columns to navigate.",
  ],
  "xlsx.table_markup.merged_cells": ["advisory", "Sheets contain merged cells."],

  // Alt text
  "xlsx.alt_text.no_images": ["info", "No images were found."],
  "xlsx.alt_text.all_decorative": ["info", "Every image is marked decorative."],
  "xlsx.alt_text.images_with_alt": ["info", "How many meaningful images have alt text."],
  "xlsx.alt_text.images_missing_alt": ["failure", "Images are missing alt text.", ["1.1.1"]],
  "xlsx.alt_text.placeholder_alt": [
    "failure",
    "Images carry only a file name or placeholder word as their description.",
    ["1.1.1"],
  ],
  "xlsx.alt_text.drawn_shapes": [
    "failure",
    "Some of the undescribed images are drawn shapes with no text.",
    ["1.1.1"],
  ],
  "xlsx.alt_text.title_only": [
    "failure",
    "Images have only the Title property filled, which screen readers do not read.",
    ["1.1.1"],
  ],

  // Color contrast
  "xlsx.color_contrast.styles_unchecked": [
    "advisory",
    "Some cell styles could not be checked for contrast.",
  ],
  "xlsx.color_contrast.nothing_checkable": [
    "info",
    "No cell style with a resolvable font color was found to check.",
  ],
  "xlsx.color_contrast.all_pass": ["pass", "Every checked cell style meets the contrast minimum."],
  "xlsx.color_contrast.below_minimum": [
    "failure",
    "Cell styles fall below the contrast minimum.",
    ["1.4.3"],
  ],
  "xlsx.color_contrast.lowest_ratio": [
    "failure",
    "The lowest contrast ratio found, with its colors.",
    ["1.4.3"],
  ],

  // Link quality
  "xlsx.link_quality.no_links": ["info", "No hyperlinks were found."],
  "xlsx.link_quality.text_unresolved": [
    "info",
    "Links were found but their text could not be resolved, so link quality was not assessed.",
  ],
  "xlsx.link_quality.links_assessed": [
    "info",
    "How many links were assessed and how many have no text.",
  ],
  "xlsx.link_quality.some_text_unresolved": [
    "info",
    "Some links had no resolvable text and were not assessed.",
  ],
  "xlsx.link_quality.links_unnamed": ["failure", "Links have no link text.", ["4.1.2"]],
  "xlsx.link_quality.vague_text": ["advisory", "Links use non-descriptive text.", ["2.4.4"]],
  "xlsx.link_quality.raw_urls": [
    "advisory",
    "Links show the raw URL as their visible text.",
    ["2.4.4"],
  ],

  // Form accessibility
  "xlsx.form_accessibility.controls_detected": [
    "info",
    "Legacy form or OLE controls were detected; their accessibility is not assessed.",
  ],
  "xlsx.form_accessibility.no_controls": ["info", "No form controls were detected."],
});

/** Finding codes for PowerPoint (.pptx) — see ../findingCodes.ts. Emitted by
 *  packages/analyzer/src/scoring/pptx.ts (and, for the declared-language
 *  findings PowerPoint shares with Word, scoring/common.ts). */
import { defineFindingCodes } from "./define.js";

export const PPTX_FINDING_CODES = defineFindingCodes({
  // Any category
  "pptx.general.unread_content_partial": [
    "info",
    "A slide could not be read, so this category's result covers only the content that was read.",
  ],
  "pptx.general.unread_content_not_assessed": [
    "info",
    "A slide could not be read, so this check could not run and the category is not assessed.",
  ],

  // Text extractability
  "pptx.text_extractability.no_text": ["info", "No text was found on the visible slides."],
  "pptx.text_extractability.images_only_content": [
    "info",
    "Images make up the presentation's whole content.",
  ],
  "pptx.text_extractability.not_assessed": [
    "info",
    "Text extractability was not assessed for this presentation.",
  ],
  "pptx.text_extractability.text_extractable": [
    "pass",
    "The slides contain real, extractable text.",
  ],

  // Title & language
  "pptx.title_language.title_present": ["pass", "The presentation has a title."],
  "pptx.title_language.title_tool_generated": [
    "failure",
    "The title is a file name or tool-generated string, not a descriptive title.",
    ["2.4.2"],
  ],
  "pptx.title_language.title_tool_generated_fix": [
    "howto",
    "How to replace a tool-generated title in PowerPoint.",
  ],
  "pptx.title_language.title_filename_shaped": [
    "advisory",
    "The title reads like a file name but still names the presentation.",
    ["2.4.2"],
  ],
  "pptx.title_language.title_unreadable": [
    "info",
    "The title could not be read because the core-properties part is unparseable; it is not scored.",
  ],
  "pptx.title_language.title_missing": [
    "failure",
    "No presentation title is set in the file's properties.",
    ["2.4.2"],
  ],
  "pptx.title_language.language_declared": ["pass", "The presentation declares its language."],
  "pptx.title_language.language_missing": [
    "failure",
    "No presentation language is declared.",
    ["3.1.1"],
  ],
  "pptx.title_language.language_unusable": [
    "failure",
    "The declared language is not a usable language code.",
    ["3.1.1"],
  ],
  "pptx.title_language.language_unusable_fix": [
    "howto",
    "How to fix a language value that is not a standard code.",
  ],
  "pptx.title_language.language_mismatch": [
    "failure",
    "The declared language contradicts the language the text is written in.",
    ["3.1.1"],
  ],
  "pptx.title_language.language_mismatch_evidence": [
    "info",
    "The word counts behind the language-mismatch finding.",
    ["3.1.1"],
  ],
  "pptx.title_language.language_mismatch_fix": [
    "howto",
    "How to mark the text with its real language in PowerPoint.",
  ],
  "pptx.title_language.language_mismatch_mixed_note": [
    "info",
    "What to do instead if part of the presentation really is in the declared language.",
  ],

  // Slide titles
  "pptx.slide_titles.no_slides": ["info", "No slides were found."],
  "pptx.slide_titles.lone_typed_heading": [
    "advisory",
    "One slide has its heading typed into a text box; a single title is not scored.",
  ],
  "pptx.slide_titles.typed_headings": [
    "failure",
    "Slides have a heading typed into an ordinary text box instead of the title placeholder.",
    ["1.3.1"],
  ],
  "pptx.slide_titles.headings_overwhelmed": [
    "failure",
    "A few titled slides sit beside many typed headings, so the outline is almost empty.",
    ["1.3.1"],
  ],
  "pptx.slide_titles.typed_heading_list_heading": [
    "divider",
    "Heading of the list of text boxes styled like slide titles.",
  ],
  "pptx.slide_titles.typed_heading_list_item": [
    "signal",
    "One text box that is styled like a slide title.",
  ],
  "pptx.slide_titles.untitled_slides": ["advisory", "Slides have no slide title."],
  "pptx.slide_titles.duplicate_title": ["advisory", "Several slides share the same title."],
  "pptx.slide_titles.hidden_slides_excluded_from_titles": [
    "info",
    "Hidden slides were excluded from title judgment.",
  ],
  "pptx.slide_titles.hidden_slides_excluded": [
    "howto",
    "Hidden slides were excluded from the audit.",
  ],
  "pptx.slide_titles.all_distinct": ["pass", "Every visible slide has a distinct title."],
  "pptx.slide_titles.all_slides_hidden": [
    "info",
    "Every slide is hidden, so the hidden slides were checked as they are.",
  ],

  // Alt text
  "pptx.alt_text.no_images": ["info", "No images were found."],
  "pptx.alt_text.all_decorative": ["info", "Every image is marked decorative."],
  "pptx.alt_text.images_with_alt": ["info", "How many meaningful images have alt text."],
  "pptx.alt_text.images_missing_alt": ["failure", "Images are missing alt text.", ["1.1.1"]],
  "pptx.alt_text.placeholder_alt": [
    "failure",
    "Images carry only a file name or placeholder word as their description.",
    ["1.1.1"],
  ],
  "pptx.alt_text.drawn_shapes": [
    "failure",
    "Some of the undescribed images are drawn shapes with no text.",
    ["1.1.1"],
  ],

  // Reading order
  "pptx.reading_order.not_assessed_no_titled_slides": [
    "info",
    "No titled slides exist to order-check, so reading order was not assessed.",
  ],
  "pptx.reading_order.title_not_first": [
    "advisory",
    "Slides have a title that is not the first shape in reading order.",
    ["1.3.2"],
  ],
  "pptx.reading_order.dense_slides": [
    "info",
    "Slides have more than 10 shapes and need a manual reading-order check.",
  ],
  "pptx.reading_order.titles_read_first": ["pass", "Every titled slide's title reads first."],

  // Table markup
  "pptx.table_markup.no_tables": ["info", "No tables were found."],
  "pptx.table_markup.tables_found": ["info", "How many tables were found."],
  "pptx.table_markup.no_header_row": ["failure", "Data tables have no header row.", ["1.3.1"]],
  "pptx.table_markup.empty_header_row": [
    "advisory",
    "Tables mark a header row whose cells are all empty.",
  ],
  "pptx.table_markup.bare_grid_layout": [
    "advisory",
    "Bare grids with no style, borders, shading or header row are treated as layout tables.",
    ["1.3.1"],
  ],

  // Color contrast
  "pptx.color_contrast.runs_unchecked": [
    "advisory",
    "Some text runs could not be checked for contrast.",
  ],
  "pptx.color_contrast.nothing_checkable": [
    "info",
    "No text with one stated color on one stated background was found to check.",
  ],
  "pptx.color_contrast.all_pass": ["pass", "Every checked text run meets the contrast minimum."],
  "pptx.color_contrast.below_minimum": [
    "failure",
    "Text runs fall below the contrast minimum.",
    ["1.4.3"],
  ],
  "pptx.color_contrast.lowest_ratio": [
    "failure",
    "The lowest contrast ratio found, with its colors.",
    ["1.4.3"],
  ],

  // List structure
  "pptx.list_structure.no_lists": ["info", "No lists were found."],
  "pptx.list_structure.all_real": ["pass", "Every list item uses real list formatting."],
  "pptx.list_structure.list_items_census": [
    "info",
    "How many real list items and hand-typed bullet paragraphs were found.",
  ],
  "pptx.list_structure.typed_bullets": [
    "failure",
    "Paragraphs use typed bullet characters instead of real list formatting.",
    ["1.3.1"],
  ],

  // Link quality
  "pptx.link_quality.no_links": ["info", "No hyperlinks were found."],
  "pptx.link_quality.links_assessed": [
    "info",
    "How many links were found and how many have no text.",
  ],
  "pptx.link_quality.links_unnamed": ["failure", "Links have no link text.", ["4.1.2"]],
  "pptx.link_quality.vague_text": ["advisory", "Links use non-descriptive text.", ["2.4.4"]],
  "pptx.link_quality.raw_urls": [
    "advisory",
    "Links show the raw URL as their visible text.",
    ["2.4.4"],
  ],

  // Form accessibility (never assessed)
  "pptx.form_accessibility.not_assessed": [
    "info",
    "Form controls are not assessed in PowerPoint presentations.",
  ],
});

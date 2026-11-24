/** Finding codes for PDF — see ../findingCodes.ts. Emitted by
 *  packages/analyzer/src/scoring/pdf.ts. (The technical-signal sections the
 *  supplementary pass appends are in pdfSupplementary.ts.) */
import { defineFindingCodes } from "./define.js";

export const PDF_FINDING_CODES = defineFindingCodes({
  // Any category
  "pdf.general.analyzer_failed_not_assessed": [
    "info",
    "An analyzer failed on this file, so this check could not run and the category is not assessed.",
  ],

  // Text extractability
  "pdf.text_extractability.accessibility_denied": [
    "failure",
    "The security settings deny assistive-technology access.",
    ["1.3.1"],
  ],
  "pdf.text_extractability.accessibility_denied_effect": [
    "failure",
    "Screen readers in conforming viewers cannot read any content of the document.",
    ["1.3.1"],
  ],
  "pdf.text_extractability.accessibility_denied_fix": [
    "howto",
    "How to allow screen-reader access in the security settings.",
  ],
  "pdf.text_extractability.text_present": ["pass", "The PDF contains extractable text."],
  "pdf.text_extractability.struct_tree_empty": [
    "failure",
    "A tag structure is present but references no content.",
    ["1.3.1"],
  ],
  "pdf.text_extractability.all_text_outside_tree": [
    "failure",
    "All of the text sits outside the structure tree.",
    ["1.3.1"],
  ],
  "pdf.text_extractability.struct_tree_empty_fix": [
    "howto",
    "How to re-tag a document whose tag structure is empty.",
  ],
  "pdf.text_extractability.tagged": ["pass", "The document is tagged."],
  "pdf.text_extractability.characters_extracted": [
    "info",
    "How many characters of text were extracted.",
  ],
  "pdf.text_extractability.not_tagged": ["failure", "The document is not tagged.", ["1.3.1"]],
  "pdf.text_extractability.not_tagged_fix": ["howto", "How to add tags to an untagged PDF."],
  "pdf.text_extractability.too_little_text_not_scored": [
    "info",
    "Too little extractable text was found to assess the text layer, so the category is not scored.",
  ],
  "pdf.text_extractability.tagged_too_little_text": [
    "info",
    "The document is tagged but has too little text for an automated verdict.",
  ],
  "pdf.text_extractability.no_text_but_tagged": [
    "failure",
    "No extractable text was found, although the document has a tag structure.",
    ["1.1.1"],
  ],
  "pdf.text_extractability.possibly_tagged_scan": [
    "info",
    "The document may be a partially tagged scan that needs OCR.",
  ],
  "pdf.text_extractability.ocr_fix": ["howto", "How to run OCR in Acrobat."],
  "pdf.text_extractability.little_text": [
    "failure",
    "Only a few characters of extractable text were found.",
  ],
  "pdf.text_extractability.no_tag_structure": ["failure", "No tag structure was found.", ["1.3.1"]],
  "pdf.text_extractability.little_text_untagged_fix": [
    "howto",
    "How to tag a document that has only a little text.",
  ],
  "pdf.text_extractability.no_text": ["failure", "No extractable text was found.", ["1.1.1"]],
  "pdf.text_extractability.scanned_image": [
    "failure",
    "The PDF appears to be a scanned image that screen readers cannot read.",
    ["1.1.1"],
  ],
  "pdf.text_extractability.scanned_image_fix": ["howto", "How to OCR and then tag a scanned PDF."],
  "pdf.text_extractability.no_content": ["failure", "No text content was found in the document."],
  "pdf.text_extractability.no_text_no_images": [
    "info",
    "The document contains neither extractable text nor page images.",
  ],
  "pdf.text_extractability.suspects_flag": [
    "info",
    "The producing tool marked the document's tagging as suspect.",
  ],
  "pdf.text_extractability.fonts_heading": ["divider", "Heading of the font-embedding section."],
  "pdf.text_extractability.fonts_census": [
    "signal",
    "How many fonts were found and how many are embedded.",
  ],
  "pdf.text_extractability.fonts_item": ["signal", "One font and whether it is embedded."],
  "pdf.text_extractability.fonts_more": ["signal", "How many more fonts the list left out."],
  "pdf.text_extractability.fonts_not_embedded": [
    "advisory",
    "Fonts that display text are not embedded (a PDF/UA item, not scored).",
  ],
  "pdf.text_extractability.fonts_not_embedded_fix": ["howto", "How to embed fonts."],
  "pdf.text_extractability.fonts_visible_embedded": [
    "pass",
    "Every font that displays text is embedded; the non-embedded ones never show visible text.",
  ],
  "pdf.text_extractability.fonts_all_embedded": ["pass", "All fonts are embedded."],
  "pdf.text_extractability.unmapped_chars_heading": [
    "divider",
    "Heading of the character-mapping section.",
  ],
  "pdf.text_extractability.unmapped_chars": [
    "signal",
    "Extracted characters that cannot be mapped to readable text.",
    ["1.1.1"],
  ],
  "pdf.text_extractability.unmapped_chars_significant": [
    "signal",
    "A meaningful share of the text cannot be read aloud or searched, with how to fix it.",
    ["1.1.1"],
  ],
  "pdf.text_extractability.unmapped_chars_moderate": [
    "advisory",
    "The unmapped characters are probably symbol-font bullets; not scored.",
  ],
  "pdf.text_extractability.unmapped_chars_small": [
    "signal",
    "The unmapped characters are few and probably decorative; no action needed.",
  ],
  "pdf.text_extractability.untagged_content_heading": [
    "divider",
    "Heading of the content-outside-the-tag-structure section.",
  ],
  "pdf.text_extractability.untagged_content": [
    "signal",
    "Visible text is painted outside the tagged content.",
    ["1.3.1"],
  ],
  "pdf.text_extractability.untagged_content_major_fix": [
    "signal",
    "How to bring a large amount of untagged content into the structure.",
  ],
  "pdf.text_extractability.untagged_content_review": [
    "signal",
    "Review the named pages and tag or artifact the untagged text.",
  ],
  "pdf.text_extractability.untagged_content_small": [
    "signal",
    "The untagged text is a small amount, often export residue; not scored.",
  ],

  // Title & language
  "pdf.title_language.title_present": ["info", "The document's title."],
  "pdf.title_language.title_tool_generated": [
    "failure",
    "The title is a file name or tool-generated string, not a descriptive title.",
    ["2.4.2"],
  ],
  "pdf.title_language.title_tool_generated_fix": [
    "howto",
    "How to replace a tool-generated title in Acrobat.",
  ],
  "pdf.title_language.display_doc_title_off": [
    "failure",
    "A title is set but DisplayDocTitle is off, so viewers announce the file name instead.",
    ["2.4.2"],
  ],
  "pdf.title_language.display_doc_title_off_fix": [
    "howto",
    "How to make viewers show the document title.",
  ],
  "pdf.title_language.title_present_displayed": [
    "pass",
    "The document has a title and viewers are set to show it.",
  ],
  "pdf.title_language.title_filename_shaped": [
    "advisory",
    "The title reads like a file name but still names the document.",
    ["2.4.2"],
  ],
  "pdf.title_language.title_missing": ["failure", "No document title is set.", ["2.4.2"]],
  "pdf.title_language.title_missing_fix": ["howto", "How to set the document title in Acrobat."],
  "pdf.title_language.title_missing_why": [
    "info",
    "Why a document title matters to screen-reader users.",
  ],
  "pdf.title_language.language_mismatch": [
    "failure",
    "The declared language contradicts the language the text is written in.",
    ["3.1.1"],
  ],
  "pdf.title_language.language_mismatch_evidence": [
    "info",
    "The word counts behind the language-mismatch finding.",
    ["3.1.1"],
  ],
  "pdf.title_language.language_mismatch_fix": [
    "howto",
    "How to set the language the document is actually written in.",
  ],
  "pdf.title_language.language_mismatch_mixed_note": [
    "info",
    "What to do instead if part of the document really is in the declared language.",
  ],
  "pdf.title_language.language_declared": ["pass", "The document declares its language."],
  "pdf.title_language.language_unusable": [
    "failure",
    "The declared language is not a usable language code.",
    ["3.1.1"],
  ],
  "pdf.title_language.language_unusable_fix": [
    "howto",
    "How to set a standard language code in Acrobat.",
  ],
  "pdf.title_language.language_missing": [
    "failure",
    "No document language is declared.",
    ["3.1.1"],
  ],
  "pdf.title_language.language_missing_fix": [
    "howto",
    "How to set the document language in Acrobat.",
  ],
  "pdf.title_language.language_missing_why": [
    "info",
    "Why a language declaration matters to screen-reader users.",
  ],
  "pdf.title_language.author": ["info", "The document's author."],

  // Heading structure
  "pdf.heading_structure.content_heading": [
    "divider",
    "Heading of the do-the-headings-read-like-headings section.",
  ],
  "pdf.heading_structure.content_empty": ["signal", "Heading tags that carry no text."],
  "pdf.heading_structure.content_fragments": [
    "signal",
    "Heading tags that hold a sentence fragment.",
  ],
  "pdf.heading_structure.content_paragraphs": [
    "signal",
    "Heading tags that hold an entire paragraph.",
  ],
  "pdf.heading_structure.content_usable_share": [
    "signal",
    "How many heading tags read as real headings.",
  ],
  "pdf.heading_structure.content_autotag_note": [
    "signal",
    "Unusable heading content is the signature of automatic tagging; how to repair it.",
  ],
  "pdf.heading_structure.lookalike_headings": [
    "failure",
    "Lines are formatted to look like headings but are tagged as ordinary paragraphs.",
    ["1.3.1"],
  ],
  "pdf.heading_structure.headings_overwhelmed": [
    "failure",
    "A few heading tags sit beside many unmarked ones, so the outline is almost empty.",
    ["1.3.1"],
  ],
  "pdf.heading_structure.lookalike_list_heading": [
    "divider",
    "Heading of the list of lines styled like headings.",
  ],
  "pdf.heading_structure.lookalike_list_item": [
    "signal",
    "One line that is styled like a heading, with its page.",
  ],
  "pdf.heading_structure.lookalike_list_more": [
    "signal",
    "How many more heading-like lines the list left out.",
  ],
  "pdf.heading_structure.no_headings": [
    "info",
    "No headings were found and nothing looks like a visual heading; nothing is scored.",
  ],
  "pdf.heading_structure.no_headings_lone_title": [
    "info",
    "No headings were found; one line looks like a title, which is not scored.",
  ],
  "pdf.heading_structure.rolemap_headings_to_paragraphs_short_doc": [
    "advisory",
    "Heading-like custom tags are mapped to paragraphs in the RoleMap; not scored in a document with no visual sections.",
  ],
  "pdf.heading_structure.no_heading_tags": [
    "failure",
    "No heading tags were found in the document structure.",
    ["1.3.1"],
  ],
  "pdf.heading_structure.visual_headings_untagged": [
    "failure",
    "Lines look like section headings but none is tagged as a heading.",
    ["1.3.1"],
  ],
  "pdf.heading_structure.rolemap_headings_to_paragraphs": [
    "info",
    "Heading-like custom tags are mapped to paragraphs in the RoleMap.",
    ["1.3.1"],
  ],
  "pdf.heading_structure.bookmarks_not_headings": [
    "info",
    "Bookmarks and paragraph tags do not replace heading tags.",
  ],
  "pdf.heading_structure.no_heading_tags_fix": ["howto", "How to tag headings in Acrobat."],
  "pdf.heading_structure.tree_heading": ["divider", "Heading of the heading-tree section."],
  "pdf.heading_structure.tree_levels": [
    "signal",
    "The sequence of heading levels in the document.",
  ],
  "pdf.heading_structure.outline_heading": ["divider", "Heading of the heading-outline list."],
  "pdf.heading_structure.outline_item": ["signal", "One heading in the document's outline."],
  "pdf.heading_structure.outline_more": [
    "signal",
    "How many more headings the outline list left out.",
  ],
  "pdf.heading_structure.generic_h_only": [
    "advisory",
    "Only generic H tags were found, with no numbered levels (a PDF/UA item, not scored).",
  ],
  "pdf.heading_structure.generic_h_only_fix": ["howto", "How to give generic H tags a level."],
  "pdf.heading_structure.level_skip": ["signal", "One place where the heading levels skip."],
  "pdf.heading_structure.multiple_h1": ["info", "The document has more than one H1; not scored."],
  "pdf.heading_structure.mixed_conventions": [
    "advisory",
    "Generic H headings are mixed with numbered ones (a PDF/UA item, not scored).",
  ],
  "pdf.heading_structure.mixed_conventions_fix": [
    "howto",
    "How to convert generic H tags to numbered levels.",
  ],
  "pdf.heading_structure.level_order_gaps": [
    "advisory",
    "Heading levels are skipped (a PDF/UA item, not scored).",
  ],
  "pdf.heading_structure.level_order_gaps_fix": [
    "howto",
    "How to renumber headings so levels never skip.",
  ],
  "pdf.heading_structure.content_may_not_read_as_headings": [
    "advisory",
    "Some heading tags may not read as headings; review by hand.",
  ],
  "pdf.heading_structure.headings_found": ["info", "How many numbered heading tags were found."],

  // Alt text
  "pdf.alt_text.text_figures_heading": [
    "divider",
    "Heading of the figures-that-contain-text section.",
  ],
  "pdf.alt_text.text_figures": ["info", "Figure tags without alt text contain readable text."],
  "pdf.alt_text.text_figures_item": [
    "signal",
    "One text-bearing figure, with its page and a preview.",
  ],
  "pdf.alt_text.text_figures_more": [
    "signal",
    "How many more text-bearing figures the list left out.",
  ],
  "pdf.alt_text.text_figures_retag_advice": [
    "info",
    "Text-bearing figures should be retagged as text, not given alt text.",
  ],
  "pdf.alt_text.all_artifacted_empty_tree": [
    "failure",
    "Every image is marked as an artifact in a document whose tags hold no content.",
    ["1.1.1"],
  ],
  "pdf.alt_text.all_artifacted_empty_tree_why": [
    "failure",
    "Why blanket artifacting is counted as images with no description.",
    ["1.1.1"],
  ],
  "pdf.alt_text.all_artifacted_empty_tree_fix": [
    "howto",
    "How to re-tag the document and describe its pictures.",
  ],
  "pdf.alt_text.all_artifacted": [
    "info",
    "Every image is marked as a decorative artifact, so no alt text is required.",
  ],
  "pdf.alt_text.all_artifacted_verify": [
    "info",
    "A person should confirm that none of the artifacted pictures carries information.",
  ],
  "pdf.alt_text.no_figures_untagged_images": [
    "failure",
    "Content images are painted on the page but none is tagged as a Figure.",
    ["1.1.1"],
  ],
  "pdf.alt_text.no_figures_untagged_images_why": [
    "info",
    "The untagged images are the ones left after excluding correctly artifacted decoration.",
  ],
  "pdf.alt_text.no_figures_untagged_images_fix": [
    "howto",
    "How to tag or artifact untagged images in Acrobat.",
  ],
  "pdf.alt_text.census_heading": ["divider", "Heading of the image-census section."],
  "pdf.alt_text.census_tagged_figures": ["signal", "Image census: tagged Figure elements."],
  "pdf.alt_text.census_untagged_content_images": [
    "signal",
    "Image census: content images painted outside any artifact run.",
  ],
  "pdf.alt_text.census_paint_operations": [
    "signal",
    "Image census: image rendering operations observed.",
  ],
  "pdf.alt_text.census_image_objects": ["signal", "Image census: image objects in the PDF."],
  "pdf.alt_text.image_signals_no_figures": [
    "info",
    "Image-like objects were detected but no tagged Figure elements.",
  ],
  "pdf.alt_text.scoring_skipped_noisy_signals": [
    "info",
    "Alt-text scoring was skipped because raw image detection is too noisy to score.",
  ],
  "pdf.alt_text.manual_review_recommended": ["info", "Manual review of the images is recommended."],
  "pdf.alt_text.review_guidance_heading": [
    "divider",
    "Heading of the image-review-guidance section.",
  ],
  "pdf.alt_text.review_tagged_figures": ["signal", "Image review: tagged figures found."],
  "pdf.alt_text.review_raw_signals": ["signal", "Image review: raw image signals detected."],
  "pdf.alt_text.review_tag_content_images": [
    "signal",
    "Image review: content images should be tagged as Figure with alt text.",
  ],
  "pdf.alt_text.review_artifact_decorative": [
    "signal",
    "Image review: decorative graphics should be marked as artifacts.",
  ],
  "pdf.alt_text.review_image_objects": ["signal", "Image review: image objects found by qpdf."],
  "pdf.alt_text.review_paint_operations": [
    "signal",
    "Image review: image rendering operations seen by pdf.js.",
  ],
  "pdf.alt_text.only_text_figures": [
    "info",
    "There are no images to describe; the only Figure tags are text.",
  ],
  "pdf.alt_text.no_images": ["info", "No images were detected."],
  "pdf.alt_text.no_images_verify": [
    "info",
    "If the document does contain images, they may not be tagged as Figure.",
  ],
  "pdf.alt_text.all_images_have_alt": ["pass", "Every tagged image has alternative text."],
  "pdf.alt_text.alt_details_heading": ["divider", "Heading of the image-alt-text-details list."],
  "pdf.alt_text.alt_details_item": ["signal", "One image and its alt text."],
  "pdf.alt_text.alt_details_more": ["signal", "How many more images the list left out."],
  "pdf.alt_text.images_with_alt": [
    "failure",
    "How many tagged images have alternative text; some do not.",
    ["1.1.1"],
  ],
  "pdf.alt_text.missing_list_heading": [
    "divider",
    "Heading of the list of images missing alt text.",
  ],
  "pdf.alt_text.missing_list_item_placeholder": [
    "signal",
    "One image whose alt text is only a file name or placeholder.",
    ["1.1.1"],
  ],
  "pdf.alt_text.missing_list_item": ["signal", "One image with no alt text.", ["1.1.1"]],
  "pdf.alt_text.missing_list_more": [
    "signal",
    "How many more images without alt text the list left out.",
  ],
  "pdf.alt_text.with_alt_list_heading": [
    "divider",
    "Heading of the list of images that have alt text.",
  ],
  "pdf.alt_text.with_alt_list_item": ["signal", "One image and its alt text."],
  "pdf.alt_text.with_alt_list_more": [
    "signal",
    "How many more images with alt text the list left out.",
  ],
  "pdf.alt_text.images_missing_alt_fix": ["howto", "How to add alt text to a Figure in Acrobat."],
  "pdf.alt_text.drawn_shapes": [
    "failure",
    "Some of the undescribed images are drawn shapes, which may only need marking decorative.",
    ["1.1.1"],
  ],
  "pdf.alt_text.good_alt_tip": ["howto", "What good alt text looks like."],
  "pdf.alt_text.text_like_images_heading": [
    "divider",
    "Heading of the lettering-may-not-be-real-text section.",
  ],
  "pdf.alt_text.text_like_images_described": [
    "info",
    "Described images are shaped like lines of writing; a note, not a problem.",
    ["1.4.5"],
  ],
  "pdf.alt_text.text_like_images": [
    "info",
    "Images are shaped like lines of writing, which usually means words baked into artwork.",
    ["1.4.5"],
  ],
  "pdf.alt_text.text_like_images_why": ["info", "Why a picture of a word is not a word."],
  "pdf.alt_text.text_like_images_self_check": [
    "info",
    "How to check whether the lettering is real text.",
  ],
  "pdf.alt_text.text_like_images_causes": [
    "info",
    "The two ways lettering becomes artwork, and the fix for each.",
  ],
  "pdf.alt_text.text_like_images_not_alt": [
    "info",
    "Why adding a description does not fix lettering that is artwork.",
  ],
  "pdf.alt_text.formulas_heading": ["divider", "Heading of the mathematical-formulas section."],
  "pdf.alt_text.formulas_all_have_alt": ["signal", "Every Formula tag carries a text alternative."],
  "pdf.alt_text.formulas_missing_alt": [
    "signal",
    "Formula tags have no text alternative.",
    ["1.1.1"],
  ],
  "pdf.alt_text.formulas_missing_alt_fix": [
    "signal",
    "How to give a formula a spoken-form alternative.",
  ],
  "pdf.alt_text.image_signals_unclassified": [
    "info",
    "Image-like objects could not be classified as content or decoration and are not counted.",
  ],
  "pdf.alt_text.untagged_content_images": [
    "failure",
    "Further content images are painted but not tagged as Figure at all.",
    ["1.1.1"],
  ],
  "pdf.alt_text.untagged_content_images_fix": [
    "howto",
    "How to tag or artifact the untagged images.",
  ],
  "pdf.alt_text.suspicious_alt_heading": ["divider", "Heading of the alt-text-quality warning."],
  "pdf.alt_text.suspicious_alt": [
    "signal",
    "Images have alt text that needs review (no score penalty).",
  ],
  "pdf.alt_text.suspicious_alt_item": [
    "signal",
    "One image whose alt text looks machine-generated, encoded or self-defeating, and why.",
  ],
  "pdf.alt_text.suspicious_alt_more": [
    "signal",
    "How many more suspicious alt texts the list left out.",
  ],
  "pdf.alt_text.suspicious_alt_review": [
    "signal",
    "Replace auto-generated or encoded alt text with meaningful descriptions.",
  ],

  // Color contrast (not assessed for PDF)
  "pdf.color_contrast.not_computed": [
    "info",
    "Contrast inside PDF page content is not computed by this analyzer.",
  ],
  "pdf.color_contrast.not_applicable_until_implemented": [
    "info",
    "Color contrast stays not applicable until PDF contrast analysis is implemented.",
  ],
  "pdf.color_contrast.shown_for_schema": [
    "info",
    "The category is shown for completeness and does not affect the score.",
  ],

  // Bookmarks (reported, never scored)
  "pdf.bookmarks.not_required_short_document": [
    "info",
    "The document is short enough that bookmarks are not required.",
  ],
  "pdf.bookmarks.does_not_affect_score": [
    "info",
    "The bookmarks category does not affect the score.",
  ],
  "pdf.bookmarks.bookmarks_found": ["pass", "How many bookmarks were found."],
  "pdf.bookmarks.outline_heading": ["divider", "Heading of the bookmark-outline list."],
  "pdf.bookmarks.outline_item": ["signal", "One bookmark title."],
  "pdf.bookmarks.outline_empty": [
    "advisory",
    "A long document has an outline with no entries; not scored.",
    ["2.4.5"],
  ],
  "pdf.bookmarks.outline_empty_fix": ["howto", "How to create bookmarks in Acrobat."],
  "pdf.bookmarks.no_bookmarks": [
    "advisory",
    "A long document has no bookmarks; not scored.",
    ["2.4.5"],
  ],
  "pdf.bookmarks.no_bookmarks_fix": ["howto", "How to create bookmarks in Acrobat."],

  // Table markup
  "pdf.table_markup.no_tables": ["info", "No tables were detected."],
  "pdf.table_markup.overview_heading": ["divider", "Heading of the table-structure overview."],
  "pdf.table_markup.overview_item": [
    "signal",
    "One table's structure: rows, columns, header and data cells, scope, caption.",
  ],
  "pdf.table_markup.bare_grid_layout": [
    "advisory",
    "Tables with no header cells and nothing drawn are treated as layout; not scored.",
    ["1.3.1"],
  ],
  "pdf.table_markup.only_layout_tables": [
    "info",
    "Only single-column layout tables were found, so the category does not affect the score.",
  ],
  "pdf.table_markup.layout_tables_review": [
    "info",
    "If a layout table really presents data, restructure it with header cells.",
  ],
  "pdf.table_markup.layout_tables_excluded": [
    "info",
    "Single-column layout tables are excluded; the multi-column data tables are scored.",
  ],
  "pdf.table_markup.empty_header_cells": [
    "advisory",
    "Tables have header cells with no text; not scored.",
  ],
  "pdf.table_markup.all_have_headers": ["pass", "Every data table has header cells."],
  "pdf.table_markup.some_missing_headers": [
    "failure",
    "Some data tables have no header cells.",
    ["1.3.1"],
  ],
  "pdf.table_markup.missing_headers_item": ["signal", "One table with no header cells.", ["1.3.1"]],
  "pdf.table_markup.some_missing_headers_fix": [
    "howto",
    "How to change data cells to header cells in Acrobat.",
  ],
  "pdf.table_markup.no_headers": ["failure", "No data table has header cells.", ["1.3.1"]],
  "pdf.table_markup.no_headers_item": ["signal", "One table with no header cells.", ["1.3.1"]],
  "pdf.table_markup.no_headers_fix": [
    "howto",
    "How to change data cells to header cells in Acrobat.",
  ],
  "pdf.table_markup.all_have_rows": ["pass", "Every data table has proper row structure."],
  "pdf.table_markup.missing_rows_item": [
    "signal",
    "One table whose cells are not grouped into rows.",
    ["1.3.1"],
  ],
  "pdf.table_markup.no_row_structure": ["failure", "No table has row structure.", ["1.3.1"]],
  "pdf.table_markup.no_row_structure_fix": ["howto", "How to wrap table cells in rows."],
  "pdf.table_markup.scope_not_applicable": [
    "info",
    "Scope could not be checked because there are no header cells.",
  ],
  "pdf.table_markup.all_scope_present": ["pass", "Every header cell has a Scope attribute."],
  "pdf.table_markup.all_associated": [
    "pass",
    "Every table associates its data cells with headers.",
  ],
  "pdf.table_markup.scope_missing_simple_tables": [
    "advisory",
    "Header cells in simple tables have no Scope (a PDF/UA item, not scored).",
  ],
  "pdf.table_markup.scope_missing_simple_tables_fix": [
    "howto",
    "How to set Scope on header cells.",
  ],
  "pdf.table_markup.headers_attribute_without_scope": [
    "advisory",
    "Tables rely on Headers associations without Scope; complete and not scored.",
  ],
  "pdf.table_markup.scope_missing_complex_tables": [
    "failure",
    "Header cells in complex tables have neither Scope nor a Headers association.",
    ["1.3.1"],
  ],
  "pdf.table_markup.scope_missing_item": [
    "signal",
    "One table and how many of its header cells lack Scope.",
    ["1.3.1"],
  ],
  "pdf.table_markup.scope_which_value_fix": [
    "howto",
    "Which Scope value to set on which header cell.",
  ],
  "pdf.table_markup.scope_how_to_set": [
    "info",
    "How to set Scope in Acrobat, and what Word does and does not export.",
  ],
  "pdf.table_markup.scope_which_rule": [
    "info",
    "Why missing Scope on these tables breaks WCAG 1.3.1 and not only PDF/UA.",
    ["1.3.1"],
  ],
  "pdf.table_markup.no_nested_tables": ["pass", "No nested tables were detected."],
  "pdf.table_markup.nested_item": ["signal", "One table that contains a nested table."],
  "pdf.table_markup.nested_tables": [
    "advisory",
    "Nested tables are hard to navigate (a PDF/UA item, not scored).",
  ],
  "pdf.table_markup.nested_tables_fix": ["howto", "How to flatten or split nested tables."],
  "pdf.table_markup.all_have_captions": ["pass", "Every data table has a caption."],
  "pdf.table_markup.some_captions": ["info", "Some tables have a caption; a caption is optional."],
  "pdf.table_markup.no_captions": ["info", "No table has a caption; a caption is optional."],
  "pdf.table_markup.columns_not_checkable": [
    "info",
    "Column consistency could not be checked because there is no row structure.",
  ],
  "pdf.table_markup.columns_consistent": [
    "pass",
    "Every table has the same number of columns in each row.",
  ],
  "pdf.table_markup.columns_inconsistent_item": [
    "signal",
    "One table whose rows cover different numbers of columns.",
    ["1.3.1"],
  ],
  "pdf.table_markup.columns_inconsistent_fix": [
    "howto",
    "How to make every row cover the same number of columns.",
  ],
  "pdf.table_markup.association_headers_attribute": [
    "pass",
    "Tables use explicit Headers associations.",
  ],
  "pdf.table_markup.association_scope": [
    "pass",
    "Header cells are associated with data cells through Scope.",
  ],
  "pdf.table_markup.association_by_shape": [
    "pass",
    "Header cells are associated with data cells by the table's simple shape.",
  ],
  "pdf.table_markup.rows_without_headers_note": [
    "info",
    "Row structure alone does not create header relationships.",
  ],

  // Link quality
  "pdf.link_quality.no_links": ["info", "No links were found."],
  "pdf.link_quality.all_descriptive": ["pass", "Every link uses descriptive text."],
  "pdf.link_quality.details_heading": ["divider", "Heading of the link-details list."],
  "pdf.link_quality.details_item": ["signal", "One link's text and destination."],
  "pdf.link_quality.details_more": ["signal", "How many more links the list left out."],
  "pdf.link_quality.links_unnamed": ["failure", "Links have no link text at all.", ["4.1.2"]],
  "pdf.link_quality.unnamed_list_heading": [
    "divider",
    "Heading of the list of links with no text.",
  ],
  "pdf.link_quality.unnamed_list_item": ["signal", "One link with no text.", ["4.1.2"]],
  "pdf.link_quality.unnamed_list_more": [
    "signal",
    "How many more unnamed links the list left out.",
  ],
  "pdf.link_quality.vague_text": [
    "advisory",
    "Links use non-descriptive text; not scored.",
    ["2.4.4"],
  ],
  "pdf.link_quality.vague_list_heading": [
    "divider",
    "Heading of the list of links with non-descriptive text.",
  ],
  "pdf.link_quality.vague_list_item": ["signal", "One link with non-descriptive text, and why."],
  "pdf.link_quality.vague_list_more": ["signal", "How many more vague links the list left out."],
  "pdf.link_quality.links_untagged": [
    "failure",
    "Links are not tagged in the structure tree.",
    ["1.3.1"],
  ],
  "pdf.link_quality.untagged_list_heading": ["divider", "Heading of the list of untagged links."],
  "pdf.link_quality.untagged_list_item": ["signal", "One untagged link.", ["1.3.1"]],
  "pdf.link_quality.untagged_list_more": [
    "signal",
    "How many more untagged links the list left out.",
  ],
  "pdf.link_quality.untagged_text_caveat": [
    "info",
    "The text shown for an untagged link is read from the page around it.",
  ],
  "pdf.link_quality.links_untagged_fix": ["howto", "How to tag unmarked links."],
  "pdf.link_quality.raw_urls_heading": ["divider", "Heading of the raw-URL link text section."],
  "pdf.link_quality.raw_urls": [
    "info",
    "Links use the raw URL as their visible text; not scored.",
    ["2.4.4"],
  ],
  "pdf.link_quality.raw_urls_item": ["signal", "One link whose text is its raw URL."],
  "pdf.link_quality.raw_urls_more": ["signal", "How many more raw-URL links the list left out."],
  "pdf.link_quality.text_unattributable": [
    "advisory",
    "Links expose no text the tool could attribute; not scored, verify by hand.",
  ],
  "pdf.link_quality.unattributable_list_heading": [
    "divider",
    "Heading of the list of links with no attributable text.",
  ],
  "pdf.link_quality.unattributable_list_item": ["signal", "One link with no attributable text."],
  "pdf.link_quality.unattributable_list_more": [
    "signal",
    "How many more unattributable links the list left out.",
  ],
  "pdf.link_quality.attributable_all_descriptive": [
    "pass",
    "Every link whose text could be read uses descriptive text.",
  ],
  "pdf.link_quality.descriptive_list_heading": [
    "divider",
    "Heading of the list of links with descriptive text.",
  ],
  "pdf.link_quality.descriptive_list_item": ["signal", "One link with descriptive text."],
  "pdf.link_quality.descriptive_list_more": [
    "signal",
    "How many more descriptive links the list left out.",
  ],
  "pdf.link_quality.vague_text_context_note": [
    "howto",
    "Vague link text can be acceptable when the surrounding sentence makes the destination clear.",
  ],
  "pdf.link_quality.vague_text_fix": ["howto", "How to make link text descriptive."],

  // Form accessibility
  "pdf.form_accessibility.no_fields": ["info", "No form fields were found."],
  "pdf.form_accessibility.fields_detected": ["info", "How many form fields were detected."],
  "pdf.form_accessibility.widgets_untagged": [
    "failure",
    "Form-field widgets are not referenced from the tag structure.",
    ["1.3.1"],
  ],
  "pdf.form_accessibility.widgets_untagged_fix": ["howto", "How to tag unmarked form fields."],
  "pdf.form_accessibility.static_xfa": [
    "advisory",
    "The document is a static XFA form whose XFA layer was not separately audited.",
  ],
  "pdf.form_accessibility.all_labeled": [
    "pass",
    "Every form field has an accessible tooltip label.",
  ],
  "pdf.form_accessibility.details_heading": ["divider", "Heading of the form-field details list."],
  "pdf.form_accessibility.labeled_item": ["signal", "One form field that has a tooltip label."],
  "pdf.form_accessibility.details_more": ["signal", "How many more fields the list left out."],
  "pdf.form_accessibility.fields_unlabeled": [
    "failure",
    "Some form fields have no accessible label.",
    ["3.3.2", "4.1.2"],
  ],
  "pdf.form_accessibility.unlabeled_list_heading": [
    "divider",
    "Heading of the list of unlabeled form fields.",
  ],
  "pdf.form_accessibility.unlabeled_item": [
    "signal",
    "One form field with no tooltip label.",
    ["3.3.2", "4.1.2"],
  ],
  "pdf.form_accessibility.unlabeled_list_more": [
    "signal",
    "How many more unlabeled fields the list left out.",
  ],
  "pdf.form_accessibility.labeled_list_heading": [
    "divider",
    "Heading of the list of labeled form fields.",
  ],
  "pdf.form_accessibility.labeled_list_more": [
    "signal",
    "How many more labeled fields the list left out.",
  ],
  "pdf.form_accessibility.fields_unlabeled_fix": [
    "howto",
    "How to add a tooltip label to a form field.",
  ],

  // Reading order
  "pdf.reading_order.no_struct_tree": [
    "failure",
    "There is no structure tree, so reading order cannot be determined.",
    ["1.3.2"],
  ],
  "pdf.reading_order.no_struct_tree_effect": [
    "info",
    "Without tags, screen readers fall back to the raw drawing order.",
  ],
  "pdf.reading_order.no_struct_tree_fix": [
    "howto",
    "How to add tags and then check the reading order.",
  ],
  "pdf.reading_order.struct_tree_empty": [
    "failure",
    "The tag structure contains no content, so it gives no reading order.",
    ["1.3.2"],
  ],
  "pdf.reading_order.struct_tree_empty_effect": [
    "info",
    "With an empty tag structure, screen readers fall back to the raw drawing order.",
  ],
  "pdf.reading_order.struct_tree_empty_fix": [
    "howto",
    "How to re-tag the document and check the reading order.",
  ],
  "pdf.reading_order.tree_depth": ["info", "The depth of the structure tree."],
  "pdf.reading_order.content_items": [
    "info",
    "How many marked-content items the structure tree references.",
  ],
  "pdf.reading_order.structure_census": ["info", "Counts of pages, paragraphs and headings."],
  "pdf.reading_order.flat_tree": [
    "advisory",
    "The structure tree is flat, with no nesting; not scored.",
  ],
  "pdf.reading_order.flat_tree_fix": ["howto", "How to reorganize a flat tag structure."],
  "pdf.reading_order.fidelity": ["info", "How closely the tag order matches the draw order."],
  "pdf.reading_order.fidelity_method": ["info", "How the reading-order comparison was made."],
  "pdf.reading_order.pages_with_drift": [
    "info",
    "Pages where the tag order and draw order noticeably disagree.",
  ],
  "pdf.reading_order.form_not_scored": [
    "info",
    "Reading order is not scored because the document is a form.",
  ],
  "pdf.reading_order.form_manual_check": ["info", "How to check reading order in a form by hand."],
  "pdf.reading_order.order_divergence": [
    "advisory",
    "The tag order and draw order diverge; not scored, verify by hand.",
    ["1.3.2"],
  ],
  "pdf.reading_order.not_verifiable": [
    "info",
    "Reading order could not be verified automatically.",
  ],
  "pdf.reading_order.manual_review_recommended": [
    "info",
    "Manual review of the tag order is recommended.",
  ],
});

// Human-readable reason for why a category's score is blank in the Category
// Scores table. Used to populate the accessible tooltip + footnote.
//
// `notAssessed` distinguishes the two blank states: true = the tool did not
// or could not evaluate the category; false/undefined = the category is
// genuinely not applicable to this document.
export function naReason(categoryId: string, notAssessed?: boolean): string {
  if (categoryId === "reading_order") {
    return "Reading order was not assessed. For PDFs, the audit performs a per-page MCID fidelity check (logical tag order vs. visual draw order) but could not extract enough shared MCIDs from this document to produce a verdict — the structure tree and content stream didn't overlap sufficiently; verify the tag order in Acrobat's Order panel or PAC before publishing. For Word documents, reading order is not automatically verified for floating objects, text boxes, or wrapped images — review those manually in the source file.";
  }
  if (categoryId === "color_contrast") {
    return "For PDFs, color contrast was not assessed — rendered-PDF contrast analysis is not yet implemented. Check contrast manually in Acrobat's Accessibility Checker or WebAIM's Contrast Checker before publishing. For Word, PowerPoint, and Excel files, contrast is checked automatically from the document's explicitly-set colors; this category is blank here because no explicitly-colored text was found, or because inherited theme/style colors could not be resolved automatically — review those manually.";
  }
  if (categoryId === "alt_text") {
    if (notAssessed) {
      return "Alt-text coverage was not assessed: image-like objects were detected, but none are tagged as <Figure> elements, so automated scoring would be unreliable (this applies to PDFs). Review the images manually in Acrobat or PAC — for Word, PowerPoint, or Excel, use the Alt Text pane (right-click an image → View/Edit Alt Text).";
    }
    return "No images were detected in the document, so alt-text coverage does not apply.";
  }
  if (categoryId === "bookmarks") {
    return "Bookmarks are a PDF-specific category, only scored for PDFs with 10 or more pages — shorter PDFs do not need a bookmark tree for navigation. Word, PowerPoint, and Excel files are not scored on bookmarks.";
  }
  if (categoryId === "table_markup") {
    return "No tables were detected in the document, so table-markup quality does not apply.";
  }
  if (categoryId === "link_quality") {
    return "No hyperlinks were detected in the document, so link quality does not apply.";
  }
  if (categoryId === "form_accessibility") {
    return "No form fields were detected in the document, so form accessibility does not apply.";
  }
  return notAssessed
    ? "This category was not assessed for the current document."
    : "This category does not apply to the current document.";
}

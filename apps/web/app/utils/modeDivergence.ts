// Human-readable reason for why a category's score is N/A in the Category
// Scores table. Used to populate the accessible tooltip + footnote.
export function naReason(categoryId: string): string {
  if (categoryId === "reading_order") {
    return "Reading order could not be evaluated. The audit performs a per-page MCID fidelity check (logical tag order vs. visual draw order) but could not extract enough shared MCIDs from this document to produce a verdict — the structure tree and content stream didn't overlap sufficiently. Verify the tag order in Acrobat's Order panel or PAC before publishing.";
  }
  if (categoryId === "color_contrast") {
    return "Rendered-PDF color-contrast analysis is not yet implemented. Check contrast manually in Acrobat's Accessibility Checker or WebAIM's Contrast Checker before publishing.";
  }
  if (categoryId === "bookmarks") {
    return "Bookmarks are only scored for documents with 10 or more pages. Shorter documents do not need a bookmark tree for navigation.";
  }
  if (categoryId === "alt_text") {
    return "No images detected in the document, so alt-text coverage is not applicable.";
  }
  if (categoryId === "table_markup") {
    return "No tables detected in the document, so table-markup quality is not applicable.";
  }
  if (categoryId === "link_quality") {
    return "No hyperlinks detected in the document, so link quality is not applicable.";
  }
  if (categoryId === "form_accessibility") {
    return "No form fields detected in the document, so form accessibility is not applicable.";
  }
  return "This category does not apply to the current document.";
}

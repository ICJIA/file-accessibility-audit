// Human-readable reason for why a category's score is blank in the Category
// Scores table. Used to populate the accessible tooltip + footnote.
//
// `notAssessed` distinguishes the two blank states: true = the tool did not
// or could not evaluate the category; false/undefined = the category is
// genuinely not applicable to this document.
//
// The reading-order and contrast reasons say "this document", not "this PDF":
// both render on Word, PowerPoint, and Excel reports too, where calling the
// file a PDF is simply wrong to the person reading it. (Observed on a .docx
// report while verifying the grade cap.) Each sentence already carries its
// format-specific guidance in a later clause; naReason has no fileType
// parameter, and threading one through its six call sites is a larger change
// than this correction warrants.
export function naReason(categoryId: string, notAssessed?: boolean): string {
  if (categoryId === "reading_order") {
    return "Reading order wasn't checked for this document — check it yourself before publishing, using Acrobat's Order panel (or the free PAC tool) to confirm the page reads in the same order a sighted reader would follow it. (This document didn't have enough shared structure information for the automated logical-vs-visual order check to reach a verdict.) For Word documents, reading order is not automatically verified for floating objects, text boxes, or wrapped images — review those manually in the source file.";
  }
  if (categoryId === "color_contrast") {
    return "Color contrast wasn't checked for this document — check it yourself before publishing, using Acrobat's Accessibility Checker or WebAIM's Contrast Checker (webaim.org/resources/contrastchecker). (Rendered-PDF contrast analysis isn't implemented yet, so this category is always blank for PDF files.) For Word, PowerPoint, and Excel files, contrast is checked automatically wherever a resolvable color pair is set — explicit colors, theme-based colors, and Excel's legacy indexed palette all resolve; this category is blank here because no resolvable pair was found (colors inherited from a named style, or set to automatic, cannot be resolved) — review those manually.";
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

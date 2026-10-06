/**
 * Alt text that is not a description (2026-10-06, user decision: "count it as
 * missing", in every format).
 *
 * WCAG lists it as a failure of 1.1.1: F30, "text alternatives that are not
 * alternatives (e.g., filenames or placeholder text)". Producers write it when
 * the author writes nothing:
 *   - Google Slides and python-pptx put the image's FILE NAME in the
 *     description (a real Google Slides export in the test set, every picture
 *     "GA details.png" and the like; python-pptx 1.0.2, verified);
 *   - openpyxl writes "Picture" on every image (its own source, 3.1.5);
 *   - real PDFs in the test set carry /Alt (image 1) … (image 4).
 *   - OpenDataLoader — the remediation pipeline's auto-tagger — labels
 *     figures it cannot describe "Table (page 30)" or "Illustration
 *     (page 1)" (user decision 2026-10-06, the same "count it as missing"):
 *     real remediated reports jumped a whole grade on alt text made only of
 *     these labels; two agency reports in the test set carry the same label
 *     written "Illustration on page 32".
 * A screen reader announces "GA details dot png" — nothing about the picture.
 *
 * EXACT matches only: the WHOLE description must be an image file name (or a
 * path to one), a single placeholder word optionally numbered, or an object
 * type and a page and nothing else ("Table (page 30)", "Illustration on page
 * 32"). A real description that merely mentions a picture ("Photo of the
 * board members", "Image related to 2008") is never caught — vague, maybe,
 * but a description.
 */
const IMAGE_EXTENSIONS = "png|jpe?g|jfif|gif|bmp|tiff?|emf|wmf|svg|webp|heic|heif";
const FILE_NAME_RE = new RegExp(`^[^<>"|?*\\r\\n]{0,240}\\.(?:${IMAGE_EXTENSIONS})$`, "i");
const PLACEHOLDER_WORD_RE =
  /^(?:picture|image|img|photo|photograph|graphic|figure|spacer|placeholder|untitled)(?:[\s_-]*\d+)?$/i;
/** An object type and a page, nothing else: "Table (page 30)",
 *  "Illustration on page 32". */
const PAGE_LABEL_RE =
  /^(?:table|image|figure|chart|graph|picture|diagram|illustration)\s*(?:\(\s*page\s+\d+\s*\)|on\s+page\s+\d+)$/i;

export function isPlaceholderAltText(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (PLACEHOLDER_WORD_RE.test(t) || PAGE_LABEL_RE.test(t)) return true;
  // A file name, not a sentence that ends with one: no comma-separated
  // clauses, and no more words than a file name plausibly has.
  return FILE_NAME_RE.test(t) && !/,\s/.test(t) && t.split(/\s+/).length <= 8;
}

/** The text a "described" image actually carries, trimmed, when it is a
 *  placeholder — so a report can name it ("GA details.png") — else undefined. */
export function placeholderAltOf(text: string | null | undefined): string | undefined {
  return isPlaceholderAltText(text) ? (text ?? "").trim() : undefined;
}

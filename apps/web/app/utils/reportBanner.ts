/**
 * Single source of truth for the prominent "report for <file>" banner that
 * sits across the top of every report surface — the live result page, the
 * shared report page, and the HTML / Word / Markdown exports. Keeping the
 * eyebrow label and the page-count line here keeps the wording identical
 * everywhere so a downloaded or shared report is never mistaken for another
 * file's.
 */

export const BANNER_EYEBROW = "ACCESSIBILITY REPORT FOR";

/** e.g. "12 pages · PDF" / "1 page · PDF" */
export function bannerMetaLine(pageCount: number): string {
  return `${pageCount} page${pageCount === 1 ? "" : "s"} · PDF`;
}

/**
 * Single source of truth for the prominent "report for <file>" banner that
 * sits across the top of every report surface — the live result page, the
 * shared report page, and the HTML / text / Markdown exports. Keeping the
 * eyebrow label, the format labels, and the page-count line here keeps the
 * wording identical everywhere so a downloaded or shared report is never
 * mistaken for another file's.
 */

export const BANNER_EYEBROW = "ACCESSIBILITY REPORT FOR";

/** Every file type a report can carry. Mirrors the API's DetectedFileType. */
export type ReportFileType = "pdf" | "docx" | "pptx" | "xlsx";

/** User-facing format label, shared by every surface that names the format. */
export const FILE_TYPE_LABELS: Record<ReportFileType, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
};

/** What one "page" of the document is called, per format (singular). */
const PAGE_NOUNS: Record<ReportFileType, string> = {
  pdf: "page",
  docx: "page",
  pptx: "slide",
  xlsx: "sheet",
};

/**
 * Format label with a PDF fallback. Accepts any string because stored
 * /report/:id JSON is caller-controlled; unknown values degrade to "PDF"
 * (the same posture as the old non-docx → PDF ternary).
 */
export function fileTypeLabel(fileType?: string): string {
  return FILE_TYPE_LABELS[(fileType ?? "pdf") as ReportFileType] ?? "PDF";
}

/** "page" / "slide" / "sheet" (singular), with a "page" fallback. */
export function pageNoun(fileType?: string): string {
  return PAGE_NOUNS[(fileType ?? "pdf") as ReportFileType] ?? "page";
}

/** e.g. "12 pages · PDF" / "1 page · Word" / "9 slides · PowerPoint" */
export function bannerMetaLine(
  pageCount: number,
  fileType: ReportFileType | string = "pdf",
): string {
  const noun = pageNoun(fileType);
  return `${pageCount} ${noun}${pageCount === 1 ? "" : "s"} · ${fileTypeLabel(fileType)}`;
}

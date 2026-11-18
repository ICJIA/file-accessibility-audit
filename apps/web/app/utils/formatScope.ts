/**
 * What THIS format's grade covers that another format's would not — shown
 * directly under the letter grade (user decision 2026-11-18).
 *
 * WHY. The same content can grade differently by format, and the reason sat
 * only in the automation-limit band and the Detailed view: color contrast is
 * scored for Word, PowerPoint and Excel (the colours are written in the file)
 * but never for a PDF (the analyzer does not compute rendered contrast inside
 * page content — pdf.ts scoreColorContrast). A deck that loses 15 points for
 * contrast loses nothing once exported to PDF, and a reader comparing the two
 * reports saw two grades and no reason. Excel, in addition, stores no
 * document language, so its title-and-language check covers the title only.
 *
 * Plain language, one or two sentences, no criterion numbers (the band and
 * the Detailed view carry those). null for anything that is not one of the
 * four document formats (web-page audit reports), so no note is invented.
 */
export function formatScopeNote(fileType: string | null | undefined): string | null {
  switch (fileType ?? "pdf") {
    case "pdf":
      return "This grade does not include color contrast: it is not checked automatically in PDFs, so check it by eye. Word, PowerPoint and Excel files are graded on contrast, so the same content can grade differently in those formats.";
    case "docx":
    case "pptx":
      return "This grade includes color contrast. A PDF of the same content is graded without it, because contrast is not checked automatically in PDFs, so the two can grade differently.";
    case "xlsx":
      return "This grade includes color contrast. Excel files store no document language, so the title-and-language check covers the title only. A PDF of the same content is graded without contrast, so the two can grade differently.";
    default:
      return null;
  }
}

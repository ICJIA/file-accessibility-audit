/**
 * Document-metadata presentation, shared by BOTH report views.
 *
 * Extracted from ReportContent.vue's metadataItems computed when the Visual
 * view gained its "About this document" card (user request 2026-08-16:
 * readers may not know what program made a document or when — that context
 * must be visible where the fix steps are read, not only in the Detailed
 * panel). One builder feeding both surfaces means their field inventories
 * cannot drift apart.
 */
import { isInDesignCreator } from "~/utils/actionPlan";

export interface MetadataItem {
  label: string;
  /** null renders as the italic "Not set" — a real answer, not an omission. */
  value: string | null;
}

export function formatMetaDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function metadataItemsFor(result: Record<string, any> | null | undefined): MetadataItem[] {
  if (!result) return [];

  // PDF takes priority whenever present, unconditionally — matches the
  // panel's original (pre-multi-format) behavior exactly, regardless of
  // what `fileType` says.
  const pdf = result.pdfMetadata;
  if (pdf) {
    return [
      { label: "Source Application", value: pdf.creator },
      { label: "PDF Producer", value: pdf.producer },
      { label: "PDF Version", value: pdf.pdfVersion },
      { label: "Page Count", value: pdf.pageCount?.toString() },
      { label: "Author", value: pdf.author },
      { label: "Subject", value: pdf.subject },
      { label: "Keywords", value: pdf.keywords },
      { label: "Created", value: formatMetaDate(pdf.creationDate) },
      { label: "Last Modified", value: formatMetaDate(pdf.modDate) },
      { label: "Encrypted", value: pdf.isEncrypted ? "Yes" : "No" },
    ];
  }

  const { docxMetadata, pptxMetadata, xlsxMetadata, fileType } = result;

  // Discriminate by fileType; when it's missing/unrecognized (older stored
  // reports), fall back to whichever of the three objects is actually set.
  // Only one of the four metadata objects is ever populated per report.
  const docx = docxMetadata && (fileType === "docx" || !fileType) ? docxMetadata : null;
  if (docx) {
    return [
      { label: "Title", value: docx.title },
      { label: "Creator", value: docx.creator },
      { label: "Language", value: docx.language },
      { label: "Pages", value: docx.pageCount?.toString() },
      { label: "Words", value: docx.wordCount?.toString() },
    ];
  }

  const pptx = pptxMetadata && (fileType === "pptx" || !fileType) ? pptxMetadata : null;
  if (pptx) {
    return [
      { label: "Title", value: pptx.title },
      { label: "Creator", value: pptx.creator },
      { label: "Language", value: pptx.language },
      { label: "Slides", value: pptx.slideCount?.toString() },
    ];
  }

  const xlsx = xlsxMetadata && (fileType === "xlsx" || !fileType) ? xlsxMetadata : null;
  if (xlsx) {
    return [
      { label: "Title", value: xlsx.title },
      { label: "Creator", value: xlsx.creator },
      { label: "Sheets", value: xlsx.sheetCount?.toString() },
    ];
  }

  return [];
}

/**
 * One sentence connecting the metadata to the plan: WHICH app the fix steps
 * below are written for, and why. Rendered by both views' metadata surfaces.
 * The InDesign branch keys on the same predicate buildActionPlan uses, so
 * this line and the actual steps can never name different apps.
 */
export function sourceTieInLine(result: Record<string, any> | null | undefined): string {
  const ft = result?.fileType;
  if (ft === "docx")
    return "The Word file you uploaded is the source document — the fix steps in this report work directly in Microsoft Word.";
  if (ft === "pptx")
    return "The PowerPoint file you uploaded is the source document — the fix steps in this report work directly in PowerPoint.";
  if (ft === "xlsx")
    return "The Excel file you uploaded is the source document — the fix steps in this report work directly in Excel.";

  const creator = result?.pdfMetadata?.creator;
  if (isInDesignCreator(creator))
    return "The fix steps in this report are written for Adobe InDesign because this document records it as its source application.";
  // \bword\b: matches "Microsoft® Word for Microsoft 365" but not
  // "WordPerfect" — a claim of "records it as its source" must be literal.
  if (typeof creator === "string" && /\bword\b/i.test(creator))
    return "The fix steps in this report are written for Microsoft Word, which this document records as its source application.";
  return "The fix steps in this report are written for Microsoft Word, the most common source — if you know this document was made in a different program, make the same fixes there.";
}

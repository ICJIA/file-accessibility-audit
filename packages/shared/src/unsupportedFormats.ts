/**
 * Specific, actionable copy for file types this tool recognizes but cannot
 * audit — as opposed to the generic "here is the list of what we accept"
 * fallback, which tells someone holding a real Word document nothing useful.
 *
 * Lives in @file-audit/shared because four call sites need identical strings:
 * the browser drop zone, the upload middleware's extension filter, the
 * analyze route's content-detection failure (a renamed file), and the URL /
 * inventory pipeline. Any drift between them is a support ticket.
 *
 * Two distinct cases, deliberately worded differently:
 *
 *  - **Legacy binary Office** (.doc/.xls/.ppt, and .rtf alongside them) — the
 *    format genuinely cannot carry accessibility structure, so "convert it" is
 *    correct advice. These are OLE2 compound binaries, a different container
 *    from the OOXML this tool audits, not an older version of the same one.
 *
 *  - **CSV** — has no accessibility structure either, but that is not a defect
 *    and telling someone to convert it would be *wrong*. For raw tabular data
 *    CSV is often the right format; accessibility for a published CSV is a
 *    property of the page linking it. Never tell a CSV author to "save as
 *    .xlsx" to score better — it produces a worse artifact and a meaningless
 *    grade.
 */

export type UnsupportedFormat = "doc" | "xls" | "ppt" | "rtf" | "csv" | "ole-unknown";

interface LegacyOfficeHint {
  /** How the format is named to a user, e.g. "legacy Word 97–2003". */
  name: string;
  /** Extension as written, for the parenthetical. */
  ext: string;
  /** Application to open it in. */
  app: string;
  /** Modern OOXML extension this tool audits. */
  modernExt: string;
  /** The "Save as type" entry in that application's Save As dialog. */
  saveAs: string;
  /** The structure this format cannot carry, named concretely. */
  missing: string;
  /** What the user will still have to add after converting. */
  stillNeeded: string;
}

const LEGACY_OFFICE: Record<"doc" | "xls" | "ppt" | "rtf", LegacyOfficeHint> = {
  doc: {
    name: "legacy Word 97–2003 document",
    ext: ".doc",
    app: "Word",
    modernExt: ".docx",
    saveAs: "Word Document",
    missing: "headings, alt text, table headers and document language",
    stillNeeded: "headings and alt text",
  },
  xls: {
    name: "legacy Excel 97–2003 workbook",
    ext: ".xls",
    app: "Excel",
    modernExt: ".xlsx",
    saveAs: "Excel Workbook",
    missing: "table headers, alt text and document language",
    stillNeeded: "table headers and alt text",
  },
  ppt: {
    name: "legacy PowerPoint 97–2003 presentation",
    ext: ".ppt",
    app: "PowerPoint",
    modernExt: ".pptx",
    saveAs: "PowerPoint Presentation",
    missing: "slide titles, alt text and reading order",
    stillNeeded: "slide titles and alt text",
  },
  rtf: {
    // Not an OLE2 binary — plain text with markup — but the same user problem
    // ("an old Word file") and the same inability to carry structure.
    name: "Rich Text Format file",
    ext: ".rtf",
    app: "Word",
    modernExt: ".docx",
    saveAs: "Word Document",
    missing: "headings, alt text and document language",
    stillNeeded: "headings and alt text",
  },
};

/**
 * The message for a recognized-but-unauditable format.
 *
 * The closing sentence on the legacy formats is load-bearing: without it,
 * people convert, re-upload, score badly and feel misled by the tool that told
 * them to convert. Converting carries content across, not structure.
 */
export function unsupportedFormatMessage(format: UnsupportedFormat): string {
  if (format === "csv") {
    return (
      "This is a CSV data file. CSV has no accessibility structure to audit — no table headers, " +
      "alt text, language or formatting — so there is nothing here for this tool to check. That is " +
      "not a defect: for raw tabular data, CSV is often the right format. Accessibility for a " +
      "published CSV is a property of the page that links it — describe what the data contains, " +
      "state the format and size, and identify the header row. If the CSV is the only form the data " +
      "is published in, consider also offering an accessible HTML table or a structured .xlsx."
    );
  }

  if (format === "ole-unknown") {
    return (
      "This is a legacy Microsoft Office binary file. These older formats cannot store the " +
      "accessibility information this audit checks for. Re-save it from the application that " +
      "created it in a modern format — .docx, .pptx or .xlsx — then upload that."
    );
  }

  const h = LEGACY_OFFICE[format];
  return (
    `This is a ${h.name} (${h.ext}), which cannot store the ${h.missing} this audit checks for — ` +
    `${h.app}'s own Accessibility Checker is unavailable for these files too. Open it in ${h.app} ` +
    `→ File → Save As → ${h.saveAs} (${h.modernExt}), then upload that. Converting carries your ` +
    `content across but not accessibility structure, so expect to still add ${h.stillNeeded}.`
  );
}

/** Extensions that map to a format we have specific copy for. */
const EXT_TO_FORMAT: Record<string, UnsupportedFormat> = {
  ".doc": "doc",
  ".xls": "xls",
  ".ppt": "ppt",
  ".rtf": "rtf",
  ".csv": "csv",
  // Tab-separated exports are the same story as CSV and arrive from the same
  // "export this table" workflows.
  ".tsv": "csv",
};

/**
 * Classify by filename extension. Returns null for anything we do not have
 * specific copy for — including the modern formats this tool audits, so
 * `report.docx` never produces an "unsupported" hint.
 */
export function unsupportedFormatFromFilename(filename: string): UnsupportedFormat | null {
  const ext = filename.toLowerCase().match(/\.[^./\\]+$/)?.[0];
  if (!ext) return null;
  return EXT_TO_FORMAT[ext] ?? null;
}

/** Convenience: filename → message, or null to fall back to the generic list. */
export function unsupportedFormatHint(filename: string): string | null {
  const format = unsupportedFormatFromFilename(filename);
  return format === null ? null : unsupportedFormatMessage(format);
}

/**
 * Which optional upload formats the server has enabled, and the strings the
 * upload surfaces (DropZone, index-page hero) derive from them. PDF is always
 * on; Word / PowerPoint / Excel can each be disabled server-side
 * (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false") and the frontend
 * must never invite a format the API will reject.
 */

export interface UploadFlags {
  docx: boolean;
  pptx: boolean;
  xlsx: boolean;
}

interface UploadFormat {
  label: string;
  ext: string;
  mime: string;
}

const PDF_FORMAT: UploadFormat = {
  label: "PDF",
  ext: ".pdf",
  mime: "application/pdf",
};

const OPTIONAL_FORMATS: Array<UploadFormat & { key: keyof UploadFlags }> = [
  {
    key: "docx",
    label: "Word",
    ext: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    key: "pptx",
    label: "PowerPoint",
    ext: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    key: "xlsx",
    label: "Excel",
    ext: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
];

function enabledFormats(flags: UploadFlags): UploadFormat[] {
  return [PDF_FORMAT, ...OPTIONAL_FORMATS.filter((f) => flags[f.key])];
}

/** "PDF" / "PDF or Word" / "PDF, Word, or PowerPoint" (Oxford comma at 3+). */
function joinList(items: string[], conjunction: "or" | "and"): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

/** `accept` attribute for the file input: extensions, then MIME types. */
export function uploadAcceptAttr(flags: UploadFlags): string {
  const formats = enabledFormats(flags);
  return [...formats.map((f) => f.ext), ...formats.map((f) => f.mime)].join(",");
}

/** Lower-case extension allowlist for client-side validation. */
export function uploadExtensions(flags: UploadFlags): string[] {
  return enabledFormats(flags).map((f) => f.ext);
}

/** "PDF, Word, PowerPoint, or Excel" — conjunction selectable for headlines. */
export function uploadNoun(
  flags: UploadFlags,
  conjunction: "or" | "and" = "or",
): string {
  return joinList(
    enabledFormats(flags).map((f) => f.label),
    conjunction,
  );
}

/** "PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)" for error copy. */
export function uploadNounWithExts(flags: UploadFlags): string {
  return joinList(
    enabledFormats(flags).map((f) =>
      f.ext === ".pdf" ? f.label : `${f.label} (${f.ext})`,
    ),
    "or",
  );
}

interface LegacyFormatHint {
  /** App name, e.g. "Excel". */
  app: string;
  /** Modern OOXML extension this tool audits, e.g. ".xlsx". */
  modernExt: string;
  /** The "Save as type" a user picks in the app's Save As dialog. */
  saveAs: string;
}

/**
 * The old binary Office formats (.xls/.doc/.ppt) are OLE compound-binary
 * files — a genuinely different format from the OOXML .xlsx/.docx/.pptx
 * this tool audits, not just an older version of the same one. A user who
 * drops a .xls reads the generic "not supported" list and thinks "but this
 * IS Excel!", so these get a specific, actionable message instead.
 */
const LEGACY_FORMAT_HINTS: Record<string, LegacyFormatHint> = {
  ".xls": { app: "Excel", modernExt: ".xlsx", saveAs: "Excel Workbook" },
  ".doc": { app: "Word", modernExt: ".docx", saveAs: "Word Document" },
  ".ppt": {
    app: "PowerPoint",
    modernExt: ".pptx",
    saveAs: "PowerPoint Presentation",
  },
};

/**
 * Specific rejection copy for a legacy binary Office file, or `null` if
 * `filename` isn't one (including the modern OOXML formats this tool
 * already supports, and any unrelated file type — those fall through to
 * the generic uploadNounWithExts-based message).
 */
export function legacyFormatMessage(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.[^./\\]+$/)?.[0];
  if (!ext) return null;
  const hint = LEGACY_FORMAT_HINTS[ext];
  if (!hint) return null;
  return (
    `The older ${hint.app} format (${ext}) isn't supported. Open it in ${hint.app} ` +
    `and re-save as ${hint.modernExt} (File → Save As → ${hint.saveAs}), then upload that.`
  );
}

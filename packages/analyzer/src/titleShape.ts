/**
 * Title shape — shared by every format since 2026-10-05.
 *
 * Moved out of pdfjsService.ts when Word, PowerPoint and Excel adopted the
 * same F25 check PDF has made since the legal-only sweep: a title that is a
 * bare file name or a tool default fails 2.4.2 whichever program wrote it,
 * and the Office scorers must not import PDF.js to find out. pdfjsService
 * re-exports these names for its existing callers.
 */
// ---------------------------------------------------------------------------
// Title shape (2026-09-02 rewrite).
//
// WCAG failure F25 (2.4.2) covers titles that "do not identify the contents
// or purpose": authoring-tool defaults ("Untitled Document"), placeholders,
// and "filenames that are not descriptive in their own right, such as
// report.html or spk12.html". Until 2026-09-02 one boolean drove both a
// deduction and a CONFIRMED Level A failure, and it condemned "Lewd Sexual
// Display in Prison 2024 Annual Report 1-26-25-250127T16462808" (an export
// timestamp) and "Full_Report_Statewide_Violence_Prevention_Plan_2025-2029"
// (underscores) — titles that plainly identify their documents. Whether such
// a title describes the document WELL is a judgment for a person.
//
// Three shapes now:
//   "tool-generated" — cannot describe anything: a bare file name (an
//                      extension on the end, F25's own example), a tool or
//                      placeholder default, or a pure timestamp/hash. SCORED
//                      and asserted as F25.
//   "filename-shaped" — carries the machinery of a file name (underscores,
//                      hyphen chains, a stamp or hash, a tool prefix) but at
//                      least two real words with it. Unscored advisory.
//   "descriptive"     — everything else, including one-word titles
//                      ("Introduction"), hyphenated words ("Well-Being") and
//                      years ("2024-2025 Budget").
// ---------------------------------------------------------------------------
export type TitleShape = "descriptive" | "filename-shaped" | "tool-generated";

const TITLE_EXTENSION_RE = /\.(pdf|docx?|xlsx?|pptx?|rtf|odt|indd|txt|html?)$/i;
const TITLE_TOOL_PREFIX_RE =
  /^(microsoft (word|excel|powerpoint|office)|libreoffice|openoffice(\.org)?|google (docs|sheets|slides)|adobe (indesign|illustrator|photoshop|acrobat)|apple (pages|numbers|keynote)|wordperfect)\s*[-–—:]\s*/i;
// "PowerPoint Presentation" (2026-10-05): PowerPoint's own default title for
// a new deck — the agency template in the control corpus carries it, so
// every deck made from it does too. It names the program, not the document.
const TITLE_PLACEHOLDER_RE =
  /^(untitled\b.*|(new )?document\s*\d*|presentation\s*\d*|(microsoft )?powerpoint presentation\s*\d*|book\s*\d*|slide\s*\d*|(scan|img|image|dsc|dscn|pict|photo|page)[ _-]?\d+)$/i;
/** Export/download timestamps ("Report-210525T15080148") and long datetime
 *  digit runs ("…20240115120000") — filename machinery, never prose. */
const TITLE_STAMP_RE = /\d{6}t\d{6,}/i;
const TITLE_LONG_DIGITS_RE = /\d{12,}/;
/** A hex hash token of 8+ characters containing at least one digit
 *  ("7c7ba4f4f0"); a plain word like "deadbeef" is not one. */
const TITLE_HEX_HASH_RE = /(?<![a-z0-9])(?=[0-9a-f]*\d)[0-9a-f]{8,}(?![a-z0-9])/i;

/** Count the real words a title carries once its file-name machinery is
 *  stripped: separators become spaces, CamelCase and letter/digit seams are
 *  split, and a word is any run of two or more letters. */
function descriptiveWordCount(title: string): number {
  let t = title.trim().replace(TITLE_TOOL_PREFIX_RE, "").replace(TITLE_EXTENSION_RE, "");
  t = t.replace(new RegExp(TITLE_STAMP_RE.source, "gi"), " ");
  t = t.replace(new RegExp(TITLE_LONG_DIGITS_RE.source, "g"), " ");
  t = t.replace(new RegExp(TITLE_HEX_HASH_RE.source, "gi"), " ");
  t = t.replace(/[_./\\|:;,()[\]{}"'+&-]+/g, " ");
  t = t
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\d)/gu, "$1 $2")
    .replace(/(\d)(\p{L})/gu, "$1 $2");
  return t.split(/\s+/).filter((w) => (w.match(/\p{L}/gu) ?? []).length >= 2).length;
}

export function classifyTitleShape(title: string): TitleShape {
  const t = title.trim();
  if (!t) return "descriptive";
  if (TITLE_PLACEHOLDER_RE.test(t)) return "tool-generated";
  const hasExtension = TITLE_EXTENSION_RE.test(t);
  const hasToolPrefix = TITLE_TOOL_PREFIX_RE.test(t);
  const hasStamp =
    TITLE_STAMP_RE.test(t) || TITLE_LONG_DIGITS_RE.test(t) || TITLE_HEX_HASH_RE.test(t);
  // No whitespace + filename separators: "annual_report", "budget-2024-final".
  // A single hyphen is NOT enough even with digits — "COVID-19",
  // "Section-508", "2024-2025" are legitimate document titles — but a LONG
  // no-space token containing digits is a filename shape, not a title.
  const noSpaceShape =
    !/\s/.test(t) &&
    (t.includes("_") || (t.match(/-/g) ?? []).length >= 2 || (t.length >= 20 && /\d/.test(t)));
  if (!(hasExtension || hasToolPrefix || hasStamp || noSpaceShape)) return "descriptive";
  // A file name as the title is F25's own example, whatever words it holds.
  if (hasExtension) return "tool-generated";
  return descriptiveWordCount(t) >= 2 ? "filename-shaped" : "tool-generated";
}

/** True for every shape that is not plainly descriptive — the broad flag
 *  (advisory + scored cases together). Kept for callers and stored payloads
 *  that predate classifyTitleShape. */
export function isFilenameLikeTitle(title: string): boolean {
  return classifyTitleShape(title) !== "descriptive";
}

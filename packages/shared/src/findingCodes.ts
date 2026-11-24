/**
 * The registry of finding codes — every machine-readable `code` a scorer can
 * put on a `FindingDetail` (types.ts), with what kind of line it is, which
 * format and category it belongs to, and one plain sentence saying what it
 * means.
 *
 * CODES ARE AN API. A code is `<format>.<category>.<what>` — dotted,
 * lowercase, stable. Once a release has shipped a code it never changes
 * meaning; rewording the finding's prose is free (that is the point), but
 * removing or renaming a code is a breaking change for everything that reads
 * reports by code (SARIF output, translations, fix-time estimates, the fleet
 * tools). The frozen list in apps/api/src/__tests__/findingCodes.snapshot.ts
 * fails the suite if a code disappears.
 *
 * ONE CODE PER CONDITION, not per wording: singular/plural and
 * count-interpolated variants share a code and carry their numbers in the
 * detail's `count` / `total`.
 *
 * The entries live in one file per format (findingCodes/*.ts) and are
 * written compactly — `"code": [kind, summary, sc?]`; format and category are
 * read off the code itself, so they cannot disagree with it.
 *
 * Browser-safe: pure data, no Node APIs (this package's rule).
 */
import type { FileType, FindingKind } from "./types.js";
import { PDF_FINDING_CODES } from "./findingCodes/pdf.js";
import { PDF_SUPPLEMENTARY_FINDING_CODES } from "./findingCodes/pdfSupplementary.js";
import { DOCX_FINDING_CODES } from "./findingCodes/docx.js";
import { PPTX_FINDING_CODES } from "./findingCodes/pptx.js";
import { XLSX_FINDING_CODES } from "./findingCodes/xlsx.js";

export interface FindingCodeInfo {
  kind: FindingKind;
  /** The scoring category id the finding appears under, e.g. "alt_text". */
  category: string;
  format: FileType;
  /** One short plain sentence: what this finding means. */
  summary: string;
  /** WCAG success criteria the finding bears on, when it bears on any. */
  sc?: readonly string[];
}

/** The version of the result SHAPE that carries `findingDetails`. Bump only
 *  for a change a reader of stored results has to know about. */
export const RESULT_SCHEMA_VERSION = 1;

/** Shape every code must have: a format, a category, then one or more
 *  further segments. */
export const FINDING_CODE_PATTERN = /^[a-z]+(\.[a-z0-9_]+){2,}$/;

export const FINDING_CODES = {
  ...PDF_FINDING_CODES,
  ...PDF_SUPPLEMENTARY_FINDING_CODES,
  ...DOCX_FINDING_CODES,
  ...PPTX_FINDING_CODES,
  ...XLSX_FINDING_CODES,
} as const;

export type FindingCode = keyof typeof FINDING_CODES;

/** The registry entry for a code, or undefined for a string that is not one
 *  (a stored report from a newer engine may carry codes this build predates). */
export function findingCodeInfo(code: string): FindingCodeInfo | undefined {
  return Object.prototype.hasOwnProperty.call(FINDING_CODES, code)
    ? (FINDING_CODES as Record<string, FindingCodeInfo>)[code]
    : undefined;
}

/**
 * The kind a finding's own PREFIX declares, or null when the prefix declares
 * none (then the kind is the rule's: failure, pass or info). These are the
 * layout conventions the strings have always carried and the report card
 * reads — kept here so the engine and any reader agree on them:
 *
 *   two leading spaces                      → signal
 *   "---"                                   → divider
 *   "How to fix:", "How to fix (optional)",
 *   "Tip:", "Fix:", "Note:", "Review these" → howto
 *   "Advisory — not scored", "Note — not
 *   scored", "PDF/UA only — not scored"     → advisory
 */
export function findingKindFromPrefix(
  text: string,
): "signal" | "divider" | "howto" | "advisory" | null {
  if (text.startsWith("  ")) return "signal";
  if (text.startsWith("---")) return "divider";
  const f = text.toLowerCase();
  if (
    f.startsWith("how to fix:") ||
    f.startsWith("how to fix (optional)") ||
    f.startsWith("tip:") ||
    f.startsWith("fix:") ||
    f.startsWith("note:") ||
    f.startsWith("review these")
  ) {
    return "howto";
  }
  const t = f.trim();
  if (
    t.startsWith("pdf/ua only — not scored") ||
    t.startsWith("advisory — not scored") ||
    t.startsWith("note — not scored")
  ) {
    return "advisory";
  }
  return null;
}

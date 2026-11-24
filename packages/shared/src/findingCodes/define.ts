/**
 * The compact form the per-format registry files are written in:
 *
 *   "xlsx.alt_text.images_missing_alt": ["failure", "Some images have no alt text.", ["1.1.1"]],
 *
 * `defineFindingCodes` expands each entry into a full FindingCodeInfo, reading
 * the format and the category off the code itself (its first two segments) so
 * the three can never disagree.
 */
import type { FindingCodeInfo } from "../findingCodes.js";
import type { FileType, FindingKind } from "../types.js";

export type FindingCodeEntry =
  | readonly [kind: FindingKind, summary: string]
  | readonly [kind: FindingKind, summary: string, sc: readonly string[]];

export function defineFindingCodes<const T extends Record<string, FindingCodeEntry>>(
  entries: T,
): { readonly [K in keyof T]: FindingCodeInfo } {
  const out: Record<string, FindingCodeInfo> = {};
  for (const [code, entry] of Object.entries(entries)) {
    const [format = "", category = ""] = code.split(".");
    const [kind, summary, sc] = entry;
    out[code] = {
      kind,
      category,
      format: format as FileType,
      summary,
      ...(sc ? { sc } : {}),
    };
  }
  return out as { readonly [K in keyof T]: FindingCodeInfo };
}

/**
 * Helpers for the /security page.
 *
 * An entry's `meta` is inline HTML ("Reviewed <strong>2026-11-25</strong>
 * &middot; scope: …"). The page puts it in a <summary>, as TEXT, so the folded
 * row reads as one plain dated line and nothing in it is interpreted as
 * markup. The strings are repository-authored (see data/securityAudits.ts);
 * this is about presentation, not trust.
 */
const ENTITIES: Record<string, string> = {
  "&middot;": "·",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rarr;": "→",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&nbsp;": " ",
  "&sect;": "§",
};

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, " ")
    .trim();
}

/** The review date an entry's meta names, e.g. "2026-11-25", or "". */
export function reviewDate(meta: string): string {
  return /\b(\d{4}-\d{2}-\d{2})\b/.exec(plainText(meta))?.[1] ?? "";
}

/** The scope an entry's meta names, without its label or closing full stop. */
export function reviewScope(meta: string): string {
  const text = plainText(meta);
  const at = text.toLowerCase().indexOf("scope:");
  const scope = at === -1 ? text.replace(/^Reviewed\s+\S+\s*·?\s*/i, "") : text.slice(at + 6);
  return scope.trim().replace(/\.$/, "");
}

/**
 * Escape the HTML-significant characters in a string so untrusted,
 * PDF-derived text (title, alt text, findings, link text/URLs) can be
 * safely embedded in the HTML report export.
 *
 * Covers the full OWASP set including the single quote, so a payload can't
 * break out of a single-quoted attribute even if one is introduced later.
 * Ampersand is replaced first to avoid double-encoding the entities.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

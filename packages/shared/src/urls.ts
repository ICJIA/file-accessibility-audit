/**
 * URL-scheme guard for report help-links. Report JSON is stored verbatim by
 * POST /api/reports and rendered on the public /report/:id page, so a
 * helpLink URL is attacker-controllable. `javascript:` / `data:` / `vbscript:`
 * hrefs execute script on click (CSP still allows javascript: URIs under
 * script-src 'unsafe-inline'), so every href sink and the store boundary run
 * a value through here first. Only absolute http(s) URLs pass.
 */
export function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * The URL if it is a safe absolute http(s) URL, else `undefined` — bind it to
 * `:href` so an unsafe value drops the attribute entirely (an anchor with no
 * href is inert, and the link label still renders as text).
 */
export function safeHttpUrl(value: unknown): string | undefined {
  return isSafeHttpUrl(value) ? (value as string) : undefined;
}

// Human-readable rendering of the /status payload.
//
// /status is a MACHINE endpoint first — UptimeRobot polls it, and a keyword
// alert on "degraded" depends on the response body. Everything here is
// therefore additive: the JSON is unchanged and is still what any non-browser
// client receives. See routes/status.ts for the negotiation rules.
//
// Deliberately NO JavaScript. Collapsing uses native <details>/<summary>, and
// the format toggle is an ordinary link. That means:
//   - nothing to trip the app's nonce-based CSP (script-src has no
//     'unsafe-inline'; an inline <script> would need a nonce threaded through)
//   - it works with JS disabled, and for a reader who has JS blocked on an
//     unfamiliar domain — plausible for someone poking at a status URL
//   - no hydration, no bundle, no client cost
//
// Inline <style> is fine: the CSP keeps style-src 'unsafe-inline'.

/** HTML-escape. Applied to every key and value without exception.
 *
 *  The payload is our own and engine versions are regex-extracted digits, so
 *  nothing here is currently attacker-shaped — but "currently" is the whole
 *  problem with skipping escaping. A future field sourced from a filename or
 *  a subprocess would inherit the gap silently. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A scalar, rendered with a type class so it colours like a JSON viewer. */
function scalar(value: unknown): string {
  if (value === null) return '<span class="v null">null</span>';
  switch (typeof value) {
    case "string":
      return `<span class="v str">"${escapeHtml(value)}"</span>`;
    case "number":
      return `<span class="v num">${escapeHtml(String(value))}</span>`;
    case "boolean":
      return `<span class="v bool">${value}</span>`;
    default:
      return `<span class="v null">${escapeHtml(String(value))}</span>`;
  }
}

function isContainer(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

/** Renders one key/value row, recursing into objects and arrays.
 *
 *  Containers become <details open> so the whole tree is visible on arrival —
 *  a status page nobody has to click through — while still being collapsible. */
function node(key: string | null, value: unknown, isLast: boolean): string {
  const comma = isLast ? "" : '<span class="p">,</span>';
  const label =
    key === null ? "" : `<span class="k">"${escapeHtml(key)}"</span><span class="p">: </span>`;

  if (!isContainer(value)) {
    return `<div class="row">${label}${scalar(value)}${comma}</div>`;
  }

  const isArray = Array.isArray(value);
  const entries: Array<[string | null, unknown]> = isArray
    ? (value as unknown[]).map((v) => [null, v])
    : Object.entries(value as Record<string, unknown>);

  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";

  // Empty container: keep it on one line rather than an empty disclosure.
  if (entries.length === 0) {
    return `<div class="row">${label}<span class="p">${open}${close}</span>${comma}</div>`;
  }

  const children = entries.map(([k, v], i) => node(k, v, i === entries.length - 1)).join("");

  // The summary carries `{ n }` ONLY while collapsed. When open, both the
  // count and this closing brace are hidden by CSS, because the real closing
  // brace is the `.row close` line below — otherwise an expanded object reads
  // as `"engines": {}`, which looks empty when it is anything but.
  return (
    `<details open>` +
    `<summary>${label}<span class="p">${open}</span>` +
    `<span class="fold">${entries.length}</span>` +
    `<span class="p sum-close">${close}</span></summary>` +
    `<div class="children">${children}</div>` +
    `<div class="row close"><span class="p">${close}</span>${comma}</div>` +
    `</details>`
  );
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f19;color:#e6edf3;
 font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
.wrap{max-width:900px;margin:0 auto;padding:20px 16px 64px}
.bar{display:flex;justify-content:flex-end;margin:0 0 14px}
a.toggle{display:inline-block;padding:5px 11px;border:1px solid #30363d;border-radius:7px;
 color:#8b949e;text-decoration:none;font-size:12px;letter-spacing:.02em}
a.toggle:hover,a.toggle:focus-visible{color:#e6edf3;border-color:#8b949e;background:#161b22}
a.toggle:focus-visible{outline:2px solid #58a6ff;outline-offset:2px}
.tree{background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:14px 16px;overflow-x:auto}
.row{white-space:pre}
details{margin:0}
details>summary{cursor:pointer;list-style:none;white-space:pre}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"\\25be";display:inline-block;width:1em;color:#6e7681}
details:not([open])>summary::before{content:"\\25b8"}
details[open]>summary .fold,details[open]>summary .sum-close{display:none}
.fold{color:#6e7681;padding:0 .35em}
.children{margin-left:1em;border-left:1px solid #21262d;padding-left:.85em}
.row.close{margin-left:0}
details>.row.close::before{content:"";display:inline-block;width:1em}
.k{color:#79c0ff}
.p{color:#6e7681}
.v.str{color:#7ee787}
.v.num{color:#ffa657}
.v.bool{color:#d2a8ff}
.v.null{color:#6e7681}
@media (prefers-color-scheme:light){
 :root{color-scheme:light}
 body{background:#f6f8fa;color:#1f2328}
 .tree{background:#fff;border-color:#d0d7de}
 a.toggle{border-color:#d0d7de;color:#57606a}
 a.toggle:hover,a.toggle:focus-visible{color:#1f2328;background:#eaeef2;border-color:#57606a}
 .children{border-left-color:#d0d7de}
 .k{color:#0550ae}.p{color:#6e7781}
 .v.str{color:#0a7b28}.v.num{color:#953800}.v.bool{color:#6639ba}.v.null{color:#6e7781}
}
`.trim();

/**
 * Full HTML document for the status payload.
 *
 * `jsonHref` is where the toggle points. The reverse direction (JSON -> HTML)
 * is deliberately NOT a link in the payload: adding a field for it would
 * change the machine contract and break the top-level key allow-list that
 * statusPrivacy.test.ts enforces. The JSON response advertises the HTML view
 * in a `Link` header instead, where it costs the body nothing.
 */
export function renderStatusHtml(body: Record<string, unknown>, jsonHref = "/status?json"): string {
  const entries = Object.entries(body);
  const children = entries.map(([k, v], i) => node(k, v, i === entries.length - 1)).join("");

  const status = typeof body.status === "string" ? body.status : "unknown";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Status — ${escapeHtml(status)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<div class="bar"><a class="toggle" href="${escapeHtml(jsonHref)}">View raw JSON</a></div>
<div class="tree"><div class="row"><span class="p">{</span></div><div class="children">${children}</div><div class="row"><span class="p">}</span></div></div>
</div>
</body>
</html>`;
}

/**
 * Which representation to send.
 *
 * Precedence, most explicit first:
 *   1. `?json` / `?html`        — bare flags, no value needed
 *   2. `?format=json|html`      — what the in-page toggle links to
 *   3. Accept header            — `text/html` present => HTML, else JSON
 *
 * JSON is the default for everything that is not unambiguously a browser,
 * because this endpoint is monitored: UptimeRobot and curl send a wildcard Accept,
 * which must keep receiving JSON so a keyword alert on "degraded" keeps working.
 *
 * The bare `?json` form exists so a monitor's URL states its own contract.
 * Pointing UptimeRobot at `/status?json` makes it immune to any future change
 * in the negotiation rules above — the URL says what it wants, so no Accept
 * header behaviour can silently hand it HTML and blind a keyword alert.
 */
export function pickFormat(
  accept: string | undefined,
  query: Record<string, unknown> = {},
): "html" | "json" {
  if ("json" in query) return "json";
  if ("html" in query) return "html";
  if (query.format === "json") return "json";
  if (query.format === "html") return "html";
  return typeof accept === "string" && accept.includes("text/html") ? "html" : "json";
}

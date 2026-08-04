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

import { GRADE_THRESHOLDS } from "@file-audit/shared";

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

// ---------------------------------------------------------------------------
// Grade distribution
// ---------------------------------------------------------------------------
// The counts are already in the JSON tree below, but as six bare numbers per
// window they say nothing to a non-technical reader. Rendered as a proportion,
// the same data answers the question people actually arrive with: are the
// documents we audit anywhere near accessible?
//
// Colors and labels come from GRADE_THRESHOLDS (the single source the report UI
// scores against), so an "F" is the same red here as on a report and a rebrand
// of the scale cannot leave this page behind.

interface GradeRow {
  key: string;
  label: string;
  color: string;
}

/** A/B/C/D/F in the order GRADE_THRESHOLDS declares them (best first), plus
 *  the ungraded bucket. `ungraded` is not a grade — it is the rows whose grade
 *  is NULL (failed audits, and rows predating the column). It is rendered only
 *  when non-zero, but it is always counted, so the table sums to the window
 *  total shown in its caption. */
const GRADE_ROWS: GradeRow[] = [
  ...GRADE_THRESHOLDS.map((t) => ({ key: t.grade, label: t.label, color: t.color })),
  { key: "ungraded", label: "Not graded", color: "#6e7681" },
];

interface GradeWindow {
  title: string;
  total: number;
  counts: Record<string, number>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Pulls one window out of the payload, or null if the payload predates the
 *  field. A shared /report page or an older API build must still render. */
function readWindow(
  docs: Record<string, unknown>,
  title: string,
  totalKey: string,
  gradeKey: string,
): GradeWindow | null {
  const raw = asRecord(docs[gradeKey]);
  if (!raw) return null;
  const counts: Record<string, number> = {};
  for (const row of GRADE_ROWS) counts[row.key] = asCount(raw[row.key]);
  return { title, total: asCount(docs[totalKey]), counts };
}

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function renderWindow(win: GradeWindow): string {
  const caption = `${escapeHtml(win.title)} <span class="wt">${win.total.toLocaleString("en-US")} document${win.total === 1 ? "" : "s"}</span>`;

  if (win.total === 0) {
    return (
      `<div class="win"><h3>${caption}</h3>` +
      `<p class="none">Nothing audited in this window.</p></div>`
    );
  }

  // Visible rows: every grade, plus "Not graded" only when it actually
  // occurred — a permanent zero row would be noise on every normal day.
  const rows = GRADE_ROWS.filter((r) => r.key !== "ungraded" || win.counts[r.key]! > 0);

  // Widths use the unrounded share so the segments tile exactly; the printed
  // percentages are rounded and may therefore not total 100. That is expected
  // and is why the document count, not the percentage, is the primary column.
  const stack = rows
    .filter((r) => win.counts[r.key]! > 0)
    .map(
      (r) =>
        `<span style="width:${pct(win.counts[r.key]!, win.total).toFixed(4)}%;background:${r.color}"></span>`,
    )
    .join("");

  const body = rows
    .map((r) => {
      const n = win.counts[r.key]!;
      return (
        `<tr><th scope="row">` +
        `<span class="dot" style="background:${r.color}" aria-hidden="true"></span>` +
        `<span class="gl">${escapeHtml(r.key === "ungraded" ? "—" : r.key)}</span> ` +
        `<span class="gd">${escapeHtml(r.label)}</span></th>` +
        `<td class="n">${n.toLocaleString("en-US")}</td>` +
        `<td class="pc">${Math.round(pct(n, win.total))}%</td></tr>`
      );
    })
    .join("");

  return (
    `<div class="win"><h3>${caption}</h3>` +
    `<div class="stack" aria-hidden="true">${stack}</div>` +
    `<table><thead><tr>` +
    `<th scope="col">Grade</th><th scope="col">Documents</th><th scope="col">Share</th>` +
    `</tr></thead><tbody>${body}</tbody></table></div>`
  );
}

/**
 * The whole distribution block, or "" when the payload has no grade data
 * (older build, or a database-down response where every count is zero).
 *
 * The caveat is not optional decoration. This corpus is self-selected — people
 * upload documents they already suspect are bad, plus test files, plus the same
 * file repeatedly — so a reader who takes "72% F" as a population statistic
 * about their agency's documents has been misled by the page. Stating the
 * sampling up front is what makes the number safe to publish.
 */
export function renderGradeDistribution(body: Record<string, unknown>): string {
  const docs = asRecord(body.documents_audited);
  if (!docs) return "";

  const windows = [
    readWindow(docs, "Last 24 hours", "last_24h", "by_grade_24h"),
    readWindow(docs, "Last 30 days", "last_30d", "by_grade_30d"),
    readWindow(docs, "All time", "total", "by_grade_total"),
  ].filter((w): w is GradeWindow => w !== null);

  if (windows.length === 0) return "";

  return (
    `<section class="dist" aria-labelledby="dist-h">` +
    `<h2 id="dist-h">Grade distribution</h2>` +
    `<p class="caveat"><strong>This describes files uploaded to this tool, not any organization's document library.</strong> ` +
    `Submissions are self-selected — people bring documents they already suspect have problems, alongside test files, ` +
    `and the same file may be uploaded more than once. Read this as a picture of what visitors check here, ` +
    `not as a measure of how accessible any agency's documents are overall.</p>` +
    `<div class="windows">${windows.map(renderWindow).join("")}</div>` +
    `</section>`
  );
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f19;color:#e6edf3;
 font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
.wrap{max-width:900px;margin:0 auto;padding:20px 16px 64px}
.bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin:0 0 14px}
a.toggle{display:inline-block;padding:5px 11px;border:1px solid #30363d;border-radius:7px;
 color:#8b949e;text-decoration:none;font-size:12px;letter-spacing:.02em}
a.toggle:hover,a.toggle:focus-visible{color:#e6edf3;border-color:#8b949e;background:#161b22}
a.toggle:focus-visible{outline:2px solid #58a6ff;outline-offset:2px}
.arrow{padding-right:.45em}
h1{font-size:15px;font-weight:600;letter-spacing:.02em;margin:0 0 14px;color:#e6edf3}
.dist{margin:0 0 18px;background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:14px 16px}
.dist h2{font-size:13px;font-weight:600;margin:0 0 8px;letter-spacing:.02em}
.caveat{margin:0 0 16px;font-size:12px;line-height:1.6;color:#8b949e;max-width:78ch}
.caveat strong{color:#e6edf3;font-weight:600}
.windows{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.win h3{font-size:12px;font-weight:600;margin:0 0 7px;letter-spacing:.02em}
.win .wt{color:#8b949e;font-weight:400}
.win .wt::before{content:"\\00b7";padding:0 .4em}
.stack{display:flex;height:7px;border-radius:4px;overflow:hidden;background:#21262d;margin:0 0 9px}
.stack>span{display:block;height:100%}
.dist table{border-collapse:collapse;width:100%;font-size:12px}
.dist thead th{text-align:left;font-weight:400;color:#6e7681;padding:0 0 5px;border-bottom:1px solid #21262d}
.dist thead th+th{text-align:right}
.dist tbody th{text-align:left;font-weight:400;padding:4px 8px 4px 0;white-space:nowrap}
.dist tbody td{text-align:right;padding:4px 0 4px 8px;font-variant-numeric:tabular-nums}
.dist td.n{color:#e6edf3}
.dist td.pc{color:#8b949e;width:4.5em}
.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:.5em;vertical-align:baseline}
.gl{font-weight:600}
.gd{color:#8b949e}
.none{margin:0;font-size:12px;color:#6e7681}
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
 h1{color:#1f2328}
 .dist{background:#fff;border-color:#d0d7de}
 .caveat{color:#57606a}
 .caveat strong{color:#1f2328}
 .win .wt{color:#57606a}
 .stack{background:#eaeef2}
 .dist thead th{color:#6e7781;border-bottom-color:#d0d7de}
 .dist td.n{color:#1f2328}
 .dist td.pc,.gd{color:#57606a}
 .none{color:#6e7781}
 .k{color:#0550ae}.p{color:#6e7781}
 .v.str{color:#0a7b28}.v.num{color:#953800}.v.bool{color:#6639ba}.v.null{color:#6e7781}
}
`.trim();

/**
 * Full HTML document for the status payload.
 *
 * `jsonHref` is where the format toggle points. The reverse direction
 * (JSON -> HTML) is deliberately NOT a link in the payload: adding a field for
 * it would change the machine contract and break the top-level key allow-list
 * that statusPrivacy.test.ts enforces. The JSON response advertises the HTML
 * view in a `Link` header instead, where it costs the body nothing.
 *
 * `appHref`/`appName` are the way back to the audit tool. This page is a
 * dead end otherwise — it is a bare Nitro route with no site chrome, so a
 * reader who lands here from a monitor alert, a bookmark, or a pasted link
 * has no path into the app at all. The name is passed in rather than
 * hardcoded so it follows BRANDING.APP_SHORT_NAME through a rebrand.
 */
export function renderStatusHtml(
  body: Record<string, unknown>,
  opts: { jsonHref?: string; appHref?: string; appName?: string } = {},
): string {
  const { jsonHref = "/status?json", appHref = "/", appName = "Accessibility Audit" } = opts;

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
<div class="bar"><a class="toggle" href="${escapeHtml(appHref)}"><span class="arrow" aria-hidden="true">&#8592;</span>${escapeHtml(appName)}</a><a class="toggle" href="${escapeHtml(jsonHref)}">View raw JSON</a></div>
<h1>Service status</h1>
${renderGradeDistribution(body)}
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

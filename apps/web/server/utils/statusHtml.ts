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
import { CORE_ENGINE_NAMES } from "./status";

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

/** Human-readable byte size for the backup row. One decimal, binary units —
 *  a status page, not a disk-usage report. */
function formatBytes(value: unknown): string {
  const n = asCount(value);
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** Collapsible card shell around a section. Native <details> — same
 *  no-JavaScript rule as the JSON tree, keyboard-accessible for free.
 *
 *  The interpretive cards are COLLAPSED by default: a first-time reader meets
 *  a stack of one-line summaries instead of a wall of tables. Each summary
 *  carries a `peek` — the card's single headline fact — so a collapsed card
 *  still answers its question, and `open` forces a card open when it carries
 *  something the reader must not miss (a stale backup) or came for in the
 *  first place (the raw payload, this endpoint's primary product). The exact
 *  `<h2 id=…>` markup is preserved inside the summary so heading structure,
 *  aria-labelledby wiring, and the tests pinning both stay intact. */
function fold(o: {
  id: string;
  title: string;
  peek: string;
  body: string;
  open?: boolean;
}): string {
  return (
    `<section class="dist" aria-labelledby="${o.id}">` +
    `<details class="card"${o.open ? " open" : ""}>` +
    `<summary><h2 id="${o.id}">${o.title}</h2><span class="peek">${o.peek}</span></summary>` +
    `<div class="card-body">${o.body}</div>` +
    `</details></section>`
  );
}

/** "3 m", "5 h 12 m", "2 d 4 h" — for the always-visible strip. */
function humanUptime(value: unknown): string {
  const s = asCount(value);
  if (s < 60) return `${Math.floor(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} m`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** The one thing that must never hide behind a fold: is the service up?
 *
 *  With every card collapsed, this strip is the page's at-a-glance answer —
 *  status pill, version, uptime, and the degraded list when there is one.
 *  Everything printed here already appears in the JSON tree below; this is
 *  presentation, not new surface. */
export function renderStatusStrip(body: Record<string, unknown>): string {
  const status = typeof body.status === "string" ? body.status : "unknown";

  const degradedNames = Array.isArray(body.degraded) ? body.degraded.map((d) => String(d)) : [];
  // A CORE name in `degraded` (database, or a CORE_ENGINES entry — see
  // CORE_DEGRADED_NAMES in the Engines section below) means this response is
  // the outage case in apps/api/src/services/status.ts's isCoreFailure:
  // document auditing itself is unavailable, not just one feature. The JSON
  // `status` field cannot say so on its own — it is always exactly "ok" or
  // "degraded", the same string for a dead qpdf as for a dead veraPDF — so
  // without this check a total outage and a minor degradation would print
  // identically here. This strip is the one thing no fold can hide, so it
  // gets the distinction first.
  const coreDown = degradedNames.some((name) => CORE_DEGRADED_NAMES.has(name));

  const pillClass =
    status === "ok" ? "ok" : coreDown ? "down" : status === "degraded" ? "warn" : "down";
  const pillText =
    status === "ok"
      ? "All systems normal"
      : coreDown
        ? "Outage — document auditing unavailable"
        : status === "degraded"
          ? "Degraded"
          : status;

  const bits: string[] = [];
  if (typeof body.version === "string" && body.version !== "")
    bits.push(`v${escapeHtml(body.version)}`);
  if (typeof body.uptime_seconds === "number") bits.push(`up ${humanUptime(body.uptime_seconds)}`);

  const degraded =
    degradedNames.length > 0
      ? `<span class="deg">degraded: ${degradedNames.map((d) => escapeHtml(d)).join(", ")}</span>`
      : "";

  return (
    `<div class="strip"><span class="pill ${pillClass}">${escapeHtml(pillText)}</span>` +
    (bits.length ? `<span class="meta">${bits.join(" · ")}</span>` : "") +
    degraded +
    `</div>`
  );
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

  const total = asCount(docs.total);
  const last24 = asCount(docs.last_24h);
  return fold({
    id: "dist-h",
    title: "Grade distribution",
    peek:
      `${total.toLocaleString("en-US")} document${total === 1 ? "" : "s"} all-time` +
      ` · ${last24.toLocaleString("en-US")} in the last 24 h`,
    body:
      `<p class="caveat"><strong>This describes files uploaded to this tool, not any organization's document library.</strong> ` +
      `Submissions are self-selected — people bring documents they already suspect have problems, alongside test files, ` +
      `and the same file may be uploaded more than once. Read this as a picture of what visitors check here, ` +
      `not as a measure of how accessible any agency's documents are overall.</p>` +
      // Each row records the grade as computed on the day of that audit, and
      // v1.58.0 capped the letter at the document's worst finding. Rows either
      // side of that release are therefore on different scales, and the shift
      // toward lower grades in these totals is partly the rule change rather
      // than a change in what people upload. Saying so is cheaper than a
      // back-fill and more honest than letting the trend be misread.
      `<p class="caveat"><strong>Grades from before tool v1.58.0 are on the older scale.</strong> ` +
      `Each row stores the grade computed at audit time, and v1.58.0 began capping the letter at a ` +
      `document's worst unresolved finding — so a document graded B in July could be graded D today ` +
      `on the same findings. Historic rows are left as they were recorded; expect the all-time ` +
      `distribution to sit higher than the recent windows for that reason alone.</p>` +
      `<div class="windows">${windows.map(renderWindow).join("")}</div>`,
  });
}

// ---------------------------------------------------------------------------
// Audited documents by format
// ---------------------------------------------------------------------------
// Rendered as a labelled section for the same reason the grade split is: as
// bare keys in the JSON tree, `unknown_extension` sitting at 0 next to a
// `documents_rejected.other` that is not zero reads as a contradiction. Spelled
// out in words, the two are obviously different questions.

const FORMAT_ROWS: Array<{ key: string; label: string }> = [
  { key: "pdf", label: "PDF" },
  { key: "docx", label: "Word (.docx)" },
  { key: "pptx", label: "PowerPoint (.pptx)" },
  { key: "xlsx", label: "Excel (.xlsx)" },
  // Deliberately NOT "Other". This is an audited document whose filename could
  // not be classified — almost always a URL audit whose path carries no
  // extension. It is a labelling problem, not a rejection.
  { key: "unknown_extension", label: "Unrecognized extension" },
];

function renderFormatWindow(title: string, total: number, raw: Record<string, unknown>): string {
  const caption = `${escapeHtml(title)} <span class="wt">${total.toLocaleString("en-US")} document${total === 1 ? "" : "s"}</span>`;
  if (total === 0) {
    return (
      `<div class="win"><h3>${caption}</h3>` +
      `<p class="none">Nothing audited in this window.</p></div>`
    );
  }
  const rows = FORMAT_ROWS.map((r) => ({ ...r, n: asCount(raw[r.key]) })).filter((r) => r.n > 0);
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th>` +
        `<td class="n">${r.n.toLocaleString("en-US")}</td>` +
        `<td class="pc">${Math.round(pct(r.n, total))}%</td></tr>`,
    )
    .join("");
  return (
    `<div class="win"><h3>${caption}</h3>` +
    `<table><thead><tr>` +
    `<th scope="col">Format</th><th scope="col">Documents</th><th scope="col">Share</th>` +
    `</tr></thead><tbody>${body}</tbody></table></div>`
  );
}

/** What kinds of document were audited, or "" for a payload without the field. */
export function renderFormatSplit(body: Record<string, unknown>): string {
  const docs = asRecord(body.documents_audited);
  if (!docs) return "";

  const windows: Array<[string, number, Record<string, unknown>]> = [];
  const d30 = asRecord(docs.by_format_30d);
  const dTotal = asRecord(docs.by_format_total);
  if (d30) windows.push(["Last 30 days", asCount(docs.last_30d), d30]);
  if (dTotal) windows.push(["All time", asCount(docs.total), dTotal]);
  if (windows.length === 0) return "";

  // Peek: lead with the dominant all-time format when one exists.
  const allTime = dTotal ?? d30;
  let top: { label: string; n: number } | null = null;
  if (allTime) {
    for (const r of FORMAT_ROWS) {
      const n = asCount(allTime[r.key]);
      if (n > 0 && (top === null || n > top.n)) top = { label: r.label, n };
    }
  }
  return fold({
    id: "fmt-h",
    title: "What was audited",
    peek: top ? `mostly ${escapeHtml(top.label)} — by file type` : "by file type",
    body:
      `<p class="caveat">The same documents as the grades above, split by file type. ` +
      `<strong>Unrecognized extension</strong> means the document was audited normally but its filename ` +
      `carried no extension we could classify — typically a web address ending in something like ` +
      `<code>download?id=123</code>. It is not a refusal; refusals are counted separately below.</p>` +
      `<div class="windows">${windows.map(([t, n, r]) => renderFormatWindow(t, n, r)).join("")}</div>`,
  });
}

// ---------------------------------------------------------------------------
// Refused uploads
// ---------------------------------------------------------------------------
// The counterpart to the grade distribution: what people bring that the tool
// cannot check at all. Rendered separately from documents_audited because a
// refusal has no score — folding the two together would imply a refused file
// was assessed and found wanting, when it was never assessed.

const REJECT_ROWS: Array<{ key: keyof RejectedShape; label: string }> = [
  { key: "doc", label: "Word 97–2003 (.doc)" },
  { key: "xls", label: "Excel 97–2003 (.xls)" },
  { key: "ppt", label: "PowerPoint 97–2003 (.ppt)" },
  { key: "rtf", label: "Rich Text (.rtf)" },
  { key: "csv", label: "CSV / TSV data" },
  { key: "other", label: "Other file types" },
];

interface RejectedShape {
  doc: number;
  xls: number;
  ppt: number;
  rtf: number;
  csv: number;
  other: number;
}

function renderRejectedWindow(title: string, total: number, raw: Record<string, unknown>): string {
  const caption = `${escapeHtml(title)} <span class="wt">${total.toLocaleString("en-US")} file${total === 1 ? "" : "s"}</span>`;
  if (total === 0) {
    return (
      `<div class="win"><h3>${caption}</h3>` +
      `<p class="none">Nothing refused in this window.</p></div>`
    );
  }
  const rows = REJECT_ROWS.map((r) => ({ ...r, n: asCount(raw[r.key]) })).filter((r) => r.n > 0);
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th>` +
        `<td class="n">${r.n.toLocaleString("en-US")}</td>` +
        `<td class="pc">${Math.round(pct(r.n, total))}%</td></tr>`,
    )
    .join("");
  return (
    `<div class="win"><h3>${caption}</h3>` +
    `<table><thead><tr>` +
    `<th scope="col">Format</th><th scope="col">Files</th><th scope="col">Share</th>` +
    `</tr></thead><tbody>${body}</tbody></table></div>`
  );
}

/**
 * The refused-uploads block, or "" when the payload has no rejection data
 * (an older API build).
 *
 * Worth publishing because it answers a question the audit counts cannot:
 * how much of what people try to check is in a format that can never be
 * checked. The caveat differs from the grade distribution's — these are
 * attempts, not documents, so one determined person retrying counts more than
 * once.
 */
export function renderRejectedUploads(body: Record<string, unknown>): string {
  const rej = asRecord(body.documents_rejected);
  if (!rej) return "";

  const windows: Array<[string, number, Record<string, unknown>]> = [];
  const d30 = asRecord(rej.by_format_30d);
  const dTotal = asRecord(rej.by_format_total);
  if (d30) windows.push(["Last 30 days", asCount(rej.last_30d), d30]);
  if (dTotal) windows.push(["All time", asCount(rej.total), dTotal]);
  if (windows.length === 0) return "";

  const total = asCount(rej.total);
  return fold({
    id: "rej-h",
    title: "Files the tool could not check",
    peek:
      total > 0
        ? `${total.toLocaleString("en-US")} attempt${total === 1 ? "" : "s"} all-time`
        : "none yet",
    body:
      `<p class="caveat">Uploads refused because the format cannot carry accessibility information at all — ` +
      `the legacy Office formats, and CSV data files. These are <strong>attempts, not documents</strong>: ` +
      `one person retrying the same file counts each time, and they are counted separately from the audited ` +
      `totals above because a refused file was never assessed.</p>` +
      `<div class="windows">${windows.map(([t, n, r]) => renderRejectedWindow(t, n, r)).join("")}</div>`,
  });
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------
// apps/api/src/services/status.ts probes three engines and splits them:
// CORE_ENGINES = ["qpdf"] — without it nothing can be audited, and its
// failure is the one engine failure that turns this endpoint's own HTTP
// status into a 503 — versus OPTIONAL_ENGINES = ["verapdf", "chromium"],
// each of which only powers one feature (the PDF/UA verdict, and page
// audits, respectively) and can fail while the API stays at 200. The JSON
// payload does not carry that split: engines.qpdf, engines.verapdf, and
// engines.chromium are three identically-shaped {ok, version?, reason?}
// records, so a reader comparing them side by side cannot tell "the service
// cannot audit anything" from "one optional feature is off" without already
// knowing which engine is which.
//
// The split is re-derived from CORE_ENGINE_NAMES — imported from the
// sibling ./status.ts rather than re-declared here, since
// apps/web/app/__tests__/status.test.ts already pins that list against the
// API's own CORE_ENGINES and a third copy would only be one more place for
// the two to quietly drift apart.

/** Display copy for each probed engine. Core-vs-optional membership is NOT
 *  re-declared here — see CORE_DEGRADED_NAMES below — this table only owns
 *  the label and the plain-English consequence of that one engine failing,
 *  paraphrased from CORE_ENGINES/OPTIONAL_ENGINES' own comments in
 *  apps/api/src/services/status.ts. impactHtml is a fixed literal, like
 *  renderBackup's staleNote further down — not payload-derived, so unlike
 *  every other value in this file it is intentionally not run through
 *  escapeHtml. */
const ENGINE_INFO: Record<string, { label: string; impactHtml: string }> = {
  qpdf: {
    label: "qpdf",
    impactHtml: "<strong>no document or URL can be audited</strong>",
  },
  verapdf: {
    label: "veraPDF",
    impactHtml: "<strong>the PDF/UA-1 verdict is unavailable</strong> — other checks continue",
  },
  chromium: {
    label: "Chromium",
    impactHtml: "<strong>page (URL) audits are unavailable</strong> — file uploads continue",
  },
};

/** Rendering order — core engine first. */
const ENGINE_ORDER = ["qpdf", "verapdf", "chromium"] as const;

/** Names that make a response the OUTAGE case rather than a mere
 *  degradation — mirrors isCoreFailure in apps/api/src/services/status.ts,
 *  which is true when the database is down OR a CORE_ENGINES probe failed.
 *  Both can appear as bare strings inside the payload's `degraded` array;
 *  "backup" and either OPTIONAL engine can also appear there but never
 *  belong in this set — degradedList's own comment notes a stale backup is
 *  "Never part of isCoreFailure/503". */
const CORE_DEGRADED_NAMES = new Set<string>(["database", ...CORE_ENGINE_NAMES]);

const REASON_LABELS: Record<string, string> = {
  not_configured: "not configured on this server",
  not_executable: "found, but not executable",
  timeout: "timed out",
  error: "failed its check",
};

/** A probe's ProbeFailureReason (status.ts), in plain English. An
 *  unrecognized value — a future API build, or a malformed payload — falls
 *  back to the raw string rather than disappearing; the caller escapes it
 *  like every other payload-sourced field, so the fallback is exactly as
 *  safe as the known labels. */
function reasonPhrase(reason: unknown): string | null {
  if (typeof reason !== "string" || reason === "") return null;
  return REASON_LABELS[reason] ?? reason;
}

function renderEngineRow(name: string, raw: unknown): string {
  const info = ENGINE_INFO[name];
  const label = info ? info.label : name;
  const r = asRecord(raw);
  const ok = r?.ok === true;
  // Reuses the strip's own pill palette: green for running, red for a down
  // CORE engine (an outage), amber for a down OPTIONAL one (a degradation)
  // — so this row and the always-visible strip agree without a new palette.
  const dot = ok ? "#3fb950" : CORE_DEGRADED_NAMES.has(name) ? "#f85149" : "#d29922";

  if (ok) {
    // A bare version number already signals "healthy" on its own — the "ok"
    // word is reserved for chromium, whose probe never returns one (see
    // defaultProbes.chromium in status.ts). Terse on purpose: this row
    // renders even while collapsed, and keeps the assembled page's prose
    // within the budget "keeps the prose bounded" pins.
    const rawVersion = r?.version;
    const version =
      typeof rawVersion === "string" && rawVersion !== "" ? escapeHtml(rawVersion) : "";
    return (
      `<p class="bak"><span class="dot" style="background:${dot}"></span>` +
      `<strong>${escapeHtml(label)}</strong> ${version || "ok"}</p>`
    );
  }

  const reason = reasonPhrase(r?.reason);
  const reasonBit = reason ? ` (${escapeHtml(reason)})` : "";
  const impactBit = info ? ` — ${info.impactHtml}` : "";
  return (
    `<p class="bak"><span class="dot" style="background:${dot}"></span>` +
    `<strong>${escapeHtml(label)}</strong> down${reasonBit}${impactBit}</p>`
  );
}

/**
 * The per-engine health card, or "" for a payload that predates `engines`
 * (an older API build) — additive like every curated card on this page.
 *
 * Auto-opens when any engine is down, the same rule renderBackup uses for a
 * stale backup: a reader must not have to click to discover that auditing
 * itself is broken.
 */
export function renderEngines(body: Record<string, unknown>): string {
  const engines = asRecord(body.engines);
  if (!engines) return "";

  const names = ENGINE_ORDER.filter((name) => name in engines);
  if (names.length === 0) return "";

  const down = names.filter((name) => asRecord(engines[name])?.ok !== true);
  const coreDown = down.filter((name) => CORE_DEGRADED_NAMES.has(name));

  let peek: string;
  if (down.length === 0) {
    peek = `all ${names.length} ok`;
  } else if (coreDown.length > 0) {
    const label = coreDown.map((name) => ENGINE_INFO[name]?.label ?? name).join(", ");
    peek = `${label} unavailable — audits cannot run`;
  } else {
    const label = down.map((name) => ENGINE_INFO[name]?.label ?? name).join(", ");
    peek = `${label} unavailable`;
  }

  return fold({
    id: "eng-h",
    title: "Checking engines",
    peek,
    open: down.length > 0,
    body: names.map((name) => renderEngineRow(name, engines[name])).join(""),
  });
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
.bak{margin:0 0 8px;font-size:12px;line-height:1.7}
.caveat code{font-size:.95em;padding:1px 4px;border-radius:4px;background:#21262d;color:#e6edf3}
.caveat a{color:#58a6ff}
.caveat a:focus-visible{outline:2px solid #58a6ff;outline-offset:2px;border-radius:3px}
.split{display:grid;gap:14px 22px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:12px 0 0}
.split h3{font-size:12px;font-weight:600;margin:0 0 7px;letter-spacing:.02em}
.split ul{margin:0;padding:0;list-style:none;font-size:12px;line-height:1.55}
.split li{margin:0 0 6px;padding-left:1.4em;text-indent:-1.4em;color:#8b949e}
.split li::before{padding-right:.55em;font-weight:700}
.split .yes h3{color:#3fb950}
.split .yes li::before{content:"\\2713";color:#3fb950}
.split .no h3{color:#f85149}
.split .no li::before{content:"\\2717";color:#f85149}
.why{margin:16px 0 0;font-size:12px;line-height:1.65;color:#8b949e;max-width:78ch}
.why strong{color:#e6edf3;font-weight:600}
.why em{color:#e6edf3;font-style:normal;font-weight:600}
.blmark{margin:12px 0 0;padding:9px 12px;border-radius:8px;font-size:12px;line-height:1.6;
 border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.08);color:#e6edf3;max-width:78ch}
.strip{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px 14px;margin:0 0 18px}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.02em}
.pill.ok{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.4)}
.pill.warn{background:rgba(210,153,34,.15);color:#d29922;border:1px solid rgba(210,153,34,.45)}
.pill.down{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.45)}
.strip .meta{color:#8b949e;font-size:12px}
.strip .deg{color:#d29922;font-size:12px}
details.card>summary{display:flex;align-items:baseline;gap:8px;white-space:normal;cursor:pointer}
details.card>summary h2{margin:0}
details.card>summary .peek{margin-left:auto;color:#8b949e;font-size:12px;font-weight:400;text-align:right}
details.card>summary:hover h2,details.card>summary:focus-visible h2{color:#58a6ff}
details.card>summary:focus-visible{outline:2px solid #58a6ff;outline-offset:4px;border-radius:4px}
details.card>.card-body{margin-top:12px}
.card-body .tree{border:0;padding:0;background:transparent}
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
 .caveat code{background:#eaeef2;color:#1f2328}
 .strip .meta,details.card>summary .peek{color:#57606a}
 .pill.ok{background:rgba(26,127,55,.1);color:#1a7f37;border-color:rgba(26,127,55,.4)}
 .pill.warn{background:rgba(154,103,0,.1);color:#9a6700;border-color:rgba(154,103,0,.45)}
 .pill.down{background:rgba(209,36,47,.1);color:#d1242f;border-color:rgba(209,36,47,.45)}
 .strip .deg{color:#9a6700}
 .caveat a{color:#0969da}
 .caveat a:focus-visible{outline-color:#0969da}
 .split li,.why{color:#57606a}
 .split .yes h3,.split .yes li::before{color:#1a7f37}
 .split .no h3,.split .no li::before{color:#d1242f}
 .why strong,.why em{color:#1f2328}
 .blmark{border-color:rgba(26,127,55,.4);background:rgba(26,127,55,.08);color:#1f2328}
 details.card>summary:hover h2,details.card>summary:focus-visible h2{color:#0969da}
 details.card>summary:focus-visible{outline-color:#0969da}
 .k{color:#0550ae}.p{color:#6e7781}
 .v.str{color:#0a7b28}.v.num{color:#953800}.v.bool{color:#6639ba}.v.null{color:#6e7781}
}
`.trim();

/**
 * What a backup actually contains, as a two-column ✓/✗ split.
 *
 * This card is where the tool's central privacy promise and its operational
 * reality collide in public: the app says "your file is never stored", and
 * then this page announces a nightly backup. A reader who notices both
 * concludes one of them is a lie. The real answer — the DOCUMENT is never
 * saved, the service's own RECORD of the audit is — is not deducible from a
 * completion timestamp, so it is stated here rather than left to inference.
 *
 * Deliberately not "no personal data": the database does hold sign-in email
 * addresses and the routine IP/user-agent connection log, and a file NAME can
 * itself name a person. Overclaiming here would be the one thing that makes a
 * records officer distrust everything else on the page, so the ✓ column lists
 * those plainly and the ✗ column claims only what the code actually
 * guarantees — no document content, and nothing a document could be rebuilt
 * from. The full accounting lives in the data-retention policy, linked below.
 */
function backupExplainer(): string {
  return (
    `<div class="split">` +
    `<div class="yes"><h3>In a backup — the service's own records</h3><ul>` +
    `<li>One line per audit: date, file name, score, grade</li>` +
    `<li>Sign-in email addresses, for people who signed in</li>` +
    `<li>Reports someone chose to save or share — whose findings can quote short labels ` +
    `from the document, such as image alt text or link wording</li>` +
    `<li>The routine connection log every web server keeps (IP address, browser), ` +
    `deleted after 365 days</li>` +
    `</ul></div>` +
    `<div class="no"><h3>Not in a backup — never stored at all</h3><ul>` +
    `<li>The PDF, Word, PowerPoint or Excel file itself</li>` +
    `<li>The pages, paragraphs, images or tables inside it</li>` +
    `<li>Anything a readable copy of a document could be rebuilt from</li>` +
    `</ul></div></div>` +
    `<p class="why"><strong>Why back up anything if documents aren&#39;t stored?</strong> ` +
    `Because two different things are involved. Your <em>document</em> is never saved — it is ` +
    `read in memory, scored, and gone within seconds. The service&#39;s <em>record</em> that a ` +
    `file was checked is kept, so an agency can show what it reviewed and when. The nightly ` +
    `backup protects that record. A document cannot be inside a backup, because no document is ` +
    `ever written to disk in the first place.</p>` +
    `<p class="blmark">Bottom line: a backup could not reproduce one page of anyone&#39;s ` +
    `document. It is a copy of the logbook, not of the files that passed through it.</p>`
  );
}

/**
 * Last-successful-backup row. Additive like every curated section: a payload
 * predating the field (older API build, shared report) renders nothing.
 *
 * "unavailable" is explained, not alarmed about — it is the expected state
 * between deploying the feature and the first scheduled run, and the reader
 * meeting it then must not conclude something is broken.
 */
export function renderBackup(body: Record<string, unknown>): string {
  const raw = body.backup;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "";
  const b = raw as Record<string, unknown>;
  const status = b.status === "ok" || b.status === "stale" ? b.status : "unavailable";

  let line: string;
  if (status === "unavailable") {
    line =
      `<p class="none">No completed backup is visible on this server yet — ` +
      `expected until the first scheduled nightly run finishes.</p>`;
  } else {
    const when =
      typeof b.finished_at_chicago === "string" && b.finished_at_chicago !== ""
        ? b.finished_at_chicago
        : typeof b.finished_at === "string"
          ? b.finished_at
          : "unknown time";
    const age =
      typeof b.age_hours === "number" && Number.isFinite(b.age_hours) && b.age_hours >= 0
        ? b.age_hours
        : 0;
    // Compile-time constants, same convention as the grade colours.
    const dot = status === "ok" ? "#3fb950" : "#d29922";
    const staleNote =
      status === "stale" ? ` — <strong>older than expected</strong> for a nightly schedule` : "";
    line =
      `<p class="bak"><span class="dot" style="background:${dot}"></span>` +
      `Completed <strong>${escapeHtml(when)}</strong> · ${age} h ago · ` +
      `${formatBytes(b.size_bytes)} · ${asCount(b.rows).toLocaleString("en-US")} usage-log records` +
      `${staleNote}</p>`;
  }

  const age =
    typeof b.age_hours === "number" && Number.isFinite(b.age_hours) && b.age_hours >= 0
      ? b.age_hours
      : 0;
  // The peek names WHAT is backed up, not just when. "28.0 MB" beside a
  // service that promises never to keep your file reads as 28 MB of files;
  // "records, not documents" answers that in the four words a collapsed card
  // gets, and the card body proves it.
  const peek =
    status === "ok"
      ? `✓ ${age} h ago · ${formatBytes(b.size_bytes)} of records, not documents`
      : status === "stale"
        ? `⚠ ${age} h ago — older than expected`
        : "none yet — expected before the first scheduled run";

  // A stale backup is the one card state the reader must not have to click
  // for; it arrives pre-opened. Healthy and never-run states stay compact.
  return fold({
    id: "bak-h",
    title: "Last successful backup",
    peek,
    open: status === "stale",
    body:
      line +
      backupExplainer() +
      `<p class="caveat">Recorded only after a snapshot passes its integrity check — this row is ` +
      `the proof the nightly backup ran, not merely that the scheduler fired. Snapshots stay on ` +
      `this server and are never copied off it. Every field kept, how long, and where: ` +
      `<a href="/data-retention#backups-explained">data retention policy, &sect; 7a</a>.</p>`,
  });
}

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
${renderStatusStrip(body)}
${renderEngines(body)}
${renderGradeDistribution(body)}
${renderFormatSplit(body)}
${renderRejectedUploads(body)}
${renderBackup(body)}
${fold({
  id: "raw-h",
  title: "Raw status payload",
  peek: `${entries.length} top-level keys — the exact JSON monitors read`,
  // Open by default, unlike the curated cards above it. This endpoint's
  // primary readers are operators and monitors: the raw payload is the thing
  // they came for, so it should never take a click. The interpretive cards
  // stay folded — they are the optional context.
  open: true,
  body: `<div class="tree"><div class="row"><span class="p">{</span></div><div class="children">${children}</div><div class="row"><span class="p">}</span></div></div>`,
})}
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

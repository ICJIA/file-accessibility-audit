import { describe, it, expect } from "vitest";
import { GRADE_THRESHOLDS, formatBytes } from "@file-audit/shared";
import {
  renderStatusHtml,
  renderGradeDistribution,
  renderFormatSplit,
  renderDocumentProgress,
  renderRejectedUploads,
  renderBackup,
  renderDiskLine,
  renderEngines,
  renderStatusStrip,
  pickFormat,
  escapeHtml,
} from "../../server/utils/statusHtml";

// /status gained a human-readable HTML view. The critical property is that it
// is ADDITIVE: /status is a monitored machine endpoint, and UptimeRobot's
// keyword alert on "degraded" reads the JSON body. Anything that quietly
// served HTML to a monitor would silently disable that alarm — a monitoring
// failure that looks like everything is fine.

const PAYLOAD = {
  status: "ok",
  version: "1.41.2",
  uptime_seconds: 641,
  database: "ok",
  engines: {
    qpdf: { ok: true, version: "11.9.0" },
    verapdf: { ok: true, version: "1.30.1" },
    chromium: { ok: true },
  },
  documents_audited: {
    total: 4121,
    by_format_total: { pdf: 4074, docx: 39, pptx: 2, xlsx: 5, unknown_extension: 0 },
  },
  last_audit_at: "2026-08-03T15:06:51Z",
  last_audit_at_chicago: null,
  web: "ok",
  api: "ok",
};

describe("renderBackup — last successful backup row", () => {
  const BACKUP_OK = {
    status: "ok",
    finished_at: "2026-08-05T08:00:12Z",
    finished_at_chicago: "Aug 5, 2026, 3:00:12 AM CDT",
    age_hours: 6.2,
    size_bytes: 574850,
    rows: 4143,
  };

  it("renders completion time, age, size, and row count when a backup exists", () => {
    const html = renderBackup({ ...PAYLOAD, backup: BACKUP_OK });
    expect(html).toContain("Last successful backup");
    expect(html).toContain("Aug 5, 2026, 3:00:12 AM CDT");
    expect(html).toContain("6.2");
    expect(html).toContain("561.4 KB");
    expect(html).toContain("4,143");
  });

  it("labels a stale backup as older than expected", () => {
    const html = renderBackup({
      ...PAYLOAD,
      backup: { ...BACKUP_OK, status: "stale", age_hours: 40 },
    });
    expect(html).toContain("older than expected");
  });

  it("explains the never-run state instead of alarming", () => {
    const html = renderBackup({
      ...PAYLOAD,
      backup: {
        status: "unavailable",
        finished_at: null,
        finished_at_chicago: null,
        age_hours: null,
        size_bytes: null,
        rows: null,
      },
    });
    expect(html).toContain("No completed backup");
    expect(html).not.toContain("Aug 5");
  });

  it("renders nothing for a payload that predates the field (older API build)", () => {
    expect(renderBackup(PAYLOAD)).toBe("");
    expect(renderStatusHtml(PAYLOAD)).not.toContain("Last successful backup");
  });

  it("appears on the assembled page when the payload carries it", () => {
    const html = renderStatusHtml({ ...PAYLOAD, backup: BACKUP_OK });
    expect(html).toContain("Last successful backup");
  });

  it("escapes whatever arrives in the timestamp field — defense in depth", () => {
    const html = renderBackup({
      ...PAYLOAD,
      backup: { ...BACKUP_OK, finished_at_chicago: '<img src=x onerror="x">' },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("pickFormat — monitors must keep getting JSON", () => {
  it("serves JSON to a client sending */* (curl, UptimeRobot)", () => {
    // The single most important assertion in this file.
    expect(pickFormat("*/*", {})).toBe("json");
  });

  it("serves JSON when no Accept header is sent at all", () => {
    expect(pickFormat(undefined, {})).toBe("json");
  });

  it("serves JSON to a client that explicitly wants JSON", () => {
    expect(pickFormat("application/json", {})).toBe("json");
  });

  it("serves HTML to a browser", () => {
    expect(pickFormat("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", {})).toBe(
      "html",
    );
  });

  it("lets ?format= override the Accept header in both directions", () => {
    // This is what the in-page toggle links to.
    expect(pickFormat("text/html", { format: "json" })).toBe("json");
    expect(pickFormat("*/*", { format: "html" })).toBe("html");
  });

  it("honours the bare ?json flag even from a browser — the monitor URL", () => {
    // /status?json states its own contract, so no future change to Accept
    // negotiation can hand a monitor HTML and silently blind a keyword alert.
    // Nitro parses a valueless key as "".
    expect(pickFormat("text/html,application/xhtml+xml", { json: "" })).toBe("json");
    expect(pickFormat("*/*", { json: "" })).toBe("json");
  });

  it("honours the bare ?html flag from a non-browser client", () => {
    expect(pickFormat("*/*", { html: "" })).toBe("html");
  });

  it("prefers the bare flag over ?format= when both are present", () => {
    expect(pickFormat("text/html", { json: "", format: "html" })).toBe("json");
  });

  it("ignores an unrecognised ?format= and falls back to Accept", () => {
    expect(pickFormat("*/*", { format: "yaml" })).toBe("json");
    expect(pickFormat("text/html", { format: "" })).toBe("html");
  });
});

describe("renderStatusHtml", () => {
  const html = renderStatusHtml(PAYLOAD);

  it("renders a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
  });

  it("contains no JavaScript at all", () => {
    // Collapsing is native <details>; the toggle is a link. That keeps this
    // clear of the app's nonce-based CSP (script-src has no 'unsafe-inline')
    // and keeps it working with JS disabled.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it("uses <details> so the tree collapses without scripting", () => {
    expect(html).toContain("<details open>");
    expect(html).toContain("<summary>");
  });

  it("renders every top-level key and nested values", () => {
    for (const key of Object.keys(PAYLOAD)) {
      expect(html).toContain(`"${key}"`);
    }
    expect(html).toContain("qpdf");
    expect(html).toContain("11.9.0");
    expect(html).toContain("4074");
  });

  it("distinguishes value types the way a JSON viewer does", () => {
    expect(html).toContain('<span class="v str">"ok"</span>');
    expect(html).toContain('<span class="v num">641</span>');
    expect(html).toContain('<span class="v bool">true</span>');
    expect(html).toContain('<span class="v null">null</span>');
  });

  it("links back to the raw JSON using the short explicit form", () => {
    expect(html).toContain('href="/status?json"');
    expect(html).toContain("View raw JSON");
  });

  it("offers a way back to the audit tool", () => {
    // Without this the page is a dead end: it is a bare Nitro route with no
    // site chrome, so someone arriving from a monitor alert or a pasted link
    // has no path into the app at all.
    expect(html).toContain('href="/"');
    expect(html).toContain("Accessibility Audit");
  });

  it("takes the app name from the caller so a rebrand carries through", () => {
    const out = renderStatusHtml(PAYLOAD, { appName: "Some Other Name", appHref: "/app" });
    expect(out).toContain('href="/app"');
    expect(out).toContain("Some Other Name");
  });

  it("hides the back arrow from assistive tech but keeps the link named", () => {
    // The arrow is decoration; "left arrow" announced before the link text
    // is noise. The text after it is the accessible name.
    expect(html).toContain('<span class="arrow" aria-hidden="true">&#8592;</span>');
  });

  it("escapes the app name and both hrefs", () => {
    // These are our own config values today, which is exactly why they are
    // easy to leave unescaped — and exactly why they must not be. The
    // dangerous payload for an href is the quote that breaks out of the
    // attribute, so assert that specifically.
    const out = renderStatusHtml(PAYLOAD, {
      appName: "<script>alert(1)</script>",
      appHref: '"><script>alert(1)</script>',
      jsonHref: '"><script>alert(1)</script>',
    });
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("keeps the ARRIVING page terse — explanation lives behind the folds", () => {
    // Originally "no explanatory prose at all", then a character bound on the
    // whole document. That bound measured hidden text too, and it broke the
    // moment the engines card gained the plain-language description of each
    // engine that this page's actual audience asks for ("what is this thing,
    // and is it really doing what you say?"). Deleting the explanation to
    // satisfy the bound would have been the tail wagging the dog.
    //
    // The intent was never "few characters" — it was "a reader must not meet
    // an essay". Since v1.55.0 every interpretive card is a COLLAPSED
    // <details>, so that intent is now measured where it lives: the text
    // outside every card body, which is all a reader sees on arrival. The
    // explanations are then free to be as long as they need to be, because
    // nobody encounters them without asking.
    const visible = html
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      // Everything inside a collapsed card — the reader has to click for it.
      .replace(/<div class="card-body">[\s\S]*?<\/details>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Title, toolbar, status strip, and each card's one-line summary.
    expect(visible).not.toMatch(/this page|explains|means that|in order to/i);
    expect(visible.length).toBeLessThan(700);

    // And the explanation really is present — otherwise this test would pass
    // just as happily on a page that had thrown the descriptions away.
    expect(html).toContain("maintained publicly since 2008");
    expect(html).toContain("reference implementation of the PDF/UA");
    expect(html).toContain("behind Google Chrome and Microsoft Edge");
  });

  it("does not render an expanded container as an empty '{}' pair", () => {
    // Regression: the summary's closing brace sat immediately after the
    // child-count span. CSS hides the count when open, so an expanded object
    // rendered as `"engines": {}` — visually identical to an empty one. The
    // closing brace in the summary must be independently hideable.
    expect(html).toContain('<span class="p sum-close">}</span>');
    expect(html).toContain("details[open]>summary .sum-close{display:none}");
    // And the real closing brace lives on its own row.
    expect(html).toContain('<div class="row close"><span class="p">}</span>');
  });

  it("renders an empty object inline rather than as an empty disclosure", () => {
    const out = renderStatusHtml({ a: {}, b: [] });
    expect(out).toContain('<span class="p">{}</span>');
    expect(out).toContain('<span class="p">[]</span>');
  });

  it("renders arrays, including the degraded list", () => {
    const out = renderStatusHtml({ status: "degraded", degraded: ["verapdf", "chromium"] });
    expect(out).toContain('"verapdf"');
    expect(out).toContain('"chromium"');
    // The keyword an alert would match must survive into the HTML too, so a
    // browser-shaped monitor is not silently blinded.
    expect(out).toContain("degraded");
  });
});

// ---------------------------------------------------------------------------
// Grade distribution
// ---------------------------------------------------------------------------

/** Every window's buckets sum to its total — the same reconciliation the API
 *  guarantees, so the rendered percentages are meaningful. */
const GRADED = {
  ...PAYLOAD,
  documents_audited: {
    last_24h: 8,
    last_30d: 100,
    total: 1000,
    by_format_total: { pdf: 1000, docx: 0, pptx: 0, xlsx: 0, unknown_extension: 0 },
    by_grade_24h: { A: 2, B: 0, C: 2, D: 0, F: 4, ungraded: 0 },
    by_grade_30d: { A: 10, B: 10, C: 20, D: 10, F: 45, ungraded: 5 },
    by_grade_total: { A: 100, B: 100, C: 200, D: 100, F: 500, ungraded: 0 },
  },
};

describe("grade distribution", () => {
  it("renders nothing when the payload predates the by_grade fields", () => {
    // A shared report or an older API build must still render its status page.
    expect(renderGradeDistribution(PAYLOAD)).toBe("");
  });

  it("renders nothing when documents_audited is absent entirely", () => {
    expect(renderGradeDistribution({ status: "ok" })).toBe("");
  });

  it("renders all three windows", () => {
    const out = renderGradeDistribution(GRADED);
    expect(out).toContain("Last 24 hours");
    expect(out).toContain("Last 30 days");
    expect(out).toContain("All time");
  });

  it("prints counts with thousands separators", () => {
    const out = renderGradeDistribution(GRADED);
    expect(out).toContain("1,000 documents");
    expect(out).toContain(">500<"); // F, all time
  });

  it("computes each grade's share of its own window", () => {
    const out = renderGradeDistribution(GRADED);
    // 24h: A is 2 of 8.
    expect(out).toContain("25%");
    // All time: F is 500 of 1000.
    expect(out).toContain("50%");
  });

  it("singularizes a one-document window", () => {
    const out = renderGradeDistribution({
      documents_audited: {
        last_24h: 1,
        last_30d: 1,
        total: 1,
        by_grade_24h: { A: 1, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
        by_grade_30d: { A: 1, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
        by_grade_total: { A: 1, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
      },
    });
    expect(out).toContain("1 document<");
    expect(out).not.toContain("1 documents");
  });

  it("hides the ungraded row when nothing is ungraded, shows it when something is", () => {
    // All time has ungraded:0 and 30d has ungraded:5, so exactly one
    // "Not graded" row should exist across the three windows.
    const out = renderGradeDistribution(GRADED);
    expect(out.match(/Not graded/g)).toHaveLength(1);
  });

  it("says so plainly when a window has no documents, without dividing by zero", () => {
    const out = renderGradeDistribution({
      documents_audited: {
        last_24h: 0,
        last_30d: 0,
        total: 0,
        by_grade_24h: { A: 0, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
        by_grade_30d: { A: 0, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
        by_grade_total: { A: 0, B: 0, C: 0, D: 0, F: 0, ungraded: 0 },
      },
    });
    expect(out).toContain("Nothing audited in this window.");
    expect(out).not.toContain("NaN");
    expect(out).not.toContain("Infinity");
  });

  it("tolerates a malformed bucket without emitting NaN", () => {
    const out = renderGradeDistribution({
      documents_audited: {
        total: 3,
        by_grade_total: { A: "lots", B: null, C: -5, F: 3 },
      },
    });
    expect(out).not.toContain("NaN");
    expect(out).toContain("All time");
  });

  // -- the caveat is the point, not decoration -------------------------------

  it("states that the sample is uploads, not any organization's documents", () => {
    const out = renderGradeDistribution(GRADED);
    expect(out).toContain("files uploaded to this tool");
    expect(out).toContain("not any organization's document library");
    expect(out).toContain("self-selected");
  });

  it("keeps the caveat in the rendered page, above the raw JSON tree", () => {
    const page = renderStatusHtml(GRADED);
    expect(page).toContain("self-selected");
    expect(page.indexOf("self-selected")).toBeLessThan(page.indexOf('class="tree"'));
  });

  // -- accessibility of the chart itself -------------------------------------

  it("marks the proportional bars decorative and carries meaning in the table", () => {
    const out = renderGradeDistribution(GRADED);
    expect(out).toContain('<div class="stack" aria-hidden="true">');
    expect(out).toContain('<th scope="col">Documents</th>');
    expect(out).toContain('<th scope="row">');
  });

  it("gives the section an accessible name and a heading", () => {
    const out = renderGradeDistribution(GRADED);
    expect(out).toContain('aria-labelledby="dist-h"');
    expect(out).toContain('<h2 id="dist-h">Grade distribution</h2>');
  });

  it("nests the h2 under a real h1 on the full page", () => {
    const page = renderStatusHtml(GRADED);
    expect(page).toContain("<h1>Service status</h1>");
    expect(page.indexOf("<h1>")).toBeLessThan(page.indexOf("<h2"));
  });

  it("uses the same grade colors the report UI scores against", () => {
    const out = renderGradeDistribution(GRADED);
    for (const t of GRADE_THRESHOLDS) {
      expect(out).toContain(t.color);
    }
  });

  it("orders the grades best-first", () => {
    const out = renderGradeDistribution(GRADED);
    const firstRow = out.indexOf('<span class="gl">A</span>');
    const lastRow = out.indexOf('<span class="gl">F</span>');
    expect(firstRow).toBeGreaterThan(-1);
    expect(firstRow).toBeLessThan(lastRow);
  });
});

// ---------------------------------------------------------------------------
// Audited documents by format
// ---------------------------------------------------------------------------
// The point of this section is disambiguation. Two catch-all buckets on one
// page, both once called "other", meant different things — this one is "we
// audited it, we just could not classify the filename", the rejection one is
// "we refused it". Spelled out in words, they stop reading as a contradiction.

const FORMATS = {
  documents_audited: {
    last_30d: 811,
    total: 4143,
    by_format_30d: { pdf: 770, docx: 34, pptx: 2, xlsx: 5, unknown_extension: 0 },
    by_format_total: { pdf: 4088, docx: 48, pptx: 2, xlsx: 4, unknown_extension: 1 },
  },
};

describe("audited formats", () => {
  it("renders nothing when the payload has no documents_audited", () => {
    expect(renderFormatSplit({ status: "ok" })).toBe("");
  });

  it("labels the catch-all 'Unrecognized extension', never 'Other'", () => {
    // "Other" next to documents_rejected's own "Other file types" is exactly
    // the collision this section exists to remove.
    const out = renderFormatSplit(FORMATS);
    expect(out).toContain("Unrecognized extension");
    expect(out).not.toContain(">Other<");
    expect(out).not.toContain("Other file types");
  });

  it("explains the catch-all even in a window where it is zero", () => {
    // The row is hidden at zero, but the term still appears in the caveat —
    // otherwise a reader meeting it for the first time in the JSON tree has
    // nothing to go on.
    const out = renderFormatSplit(FORMATS);
    expect(out).toContain("<strong>Unrecognized extension</strong>");
    expect(out).toContain("download?id=123");
  });

  it("says plainly that an unclassified filename is not a refusal", () => {
    expect(renderFormatSplit(FORMATS)).toContain("not a refusal");
  });

  it("shows the catch-all row only when it is non-zero", () => {
    const row = /<th scope="row">Unrecognized extension<\/th>/;
    const zero = renderFormatSplit({
      documents_audited: {
        total: 10,
        by_format_total: { pdf: 10, docx: 0, pptx: 0, xlsx: 0, unknown_extension: 0 },
      },
    });
    expect(row.test(zero)).toBe(false);
    expect(row.test(renderFormatSplit(FORMATS))).toBe(true);
  });

  it("computes each format's share of its own window", () => {
    const out = renderFormatSplit(FORMATS);
    expect(out).toContain("4,088"); // thousands separator
    expect(out).toContain("99%"); // 4088 of 4143
  });

  it("sits between the grades and the refusals on the assembled page", () => {
    const page = renderStatusHtml({ ...GRADED, ...FORMATS, ...REJECTED });
    expect(page.indexOf('id="dist-h"')).toBeLessThan(page.indexOf('id="fmt-h"'));
    expect(page.indexOf('id="fmt-h"')).toBeLessThan(page.indexOf('id="rej-h"'));
  });

  it("keeps the two catch-alls distinguishable on the same page", () => {
    // The whole point: a reader seeing both must be able to tell them apart.
    const page = renderStatusHtml({ ...GRADED, ...FORMATS, ...REJECTED });
    expect(page).toContain("Unrecognized extension");
    expect(page).toContain("Other file types");
  });
});

// ---------------------------------------------------------------------------
// Refused uploads
// ---------------------------------------------------------------------------

const REJECTED = {
  documents_rejected: {
    last_24h: 3,
    last_30d: 61,
    total: 288,
    by_format_30d: { doc: 30, xls: 10, ppt: 2, rtf: 1, csv: 15, other: 3 },
    by_format_total: { doc: 180, xls: 44, ppt: 9, rtf: 2, csv: 47, other: 6 },
  },
};

describe("refused uploads", () => {
  it("renders nothing when the payload predates the field", () => {
    expect(renderRejectedUploads(PAYLOAD)).toBe("");
  });

  it("renders the 30-day and all-time windows", () => {
    const out = renderRejectedUploads(REJECTED);
    expect(out).toContain("Last 30 days");
    expect(out).toContain("All time");
    expect(out).toContain("288 files");
  });

  it("names the legacy formats in plain language rather than bucket keys", () => {
    const out = renderRejectedUploads(REJECTED);
    expect(out).toContain("Word 97–2003 (.doc)");
    expect(out).toContain("CSV / TSV data");
    expect(out).toContain("Other file types");
    expect(out).not.toContain(">doc<");
  });

  it("computes each format's share of its own window", () => {
    const out = renderRejectedUploads(REJECTED);
    expect(out).toContain("180"); // .doc, all time
    expect(out).toContain("63%"); // 180 of 288
  });

  it("omits format rows with no refusals", () => {
    const out = renderRejectedUploads({
      documents_rejected: {
        total: 2,
        by_format_total: { doc: 2, xls: 0, ppt: 0, rtf: 0, csv: 0, other: 0 },
      },
    });
    expect(out).toContain("Word 97–2003");
    expect(out).not.toContain("Rich Text");
    expect(out).not.toContain("PowerPoint 97");
  });

  it("says so plainly when nothing was refused, without dividing by zero", () => {
    const out = renderRejectedUploads({
      documents_rejected: {
        total: 0,
        by_format_total: { doc: 0, xls: 0, ppt: 0, rtf: 0, csv: 0, other: 0 },
      },
    });
    expect(out).toContain("Nothing refused in this window.");
    expect(out).not.toContain("NaN");
  });

  it("tolerates a malformed bucket without emitting NaN", () => {
    const out = renderRejectedUploads({
      documents_rejected: { total: 3, by_format_total: { doc: "many", csv: null, xls: 3 } },
    });
    expect(out).not.toContain("NaN");
    expect(out).toContain("All time");
  });

  it("states these are attempts rather than documents", () => {
    // The count is inflated by retries in a way the audit counts are not, and
    // saying so is what keeps it from being read as a document census.
    const out = renderRejectedUploads(REJECTED);
    expect(out).toContain("attempts, not documents");
    expect(out).toContain("counted separately");
  });

  it("gives the section its own accessible name, distinct from the grade one", () => {
    const out = renderRejectedUploads(REJECTED);
    expect(out).toContain('aria-labelledby="rej-h"');
    expect(out).toContain('<h2 id="rej-h">');
    expect(out).not.toContain('id="dist-h"');
  });

  it("sits below the grade distribution on the assembled page", () => {
    // Audited documents are the primary story; refusals are context for it.
    const page = renderStatusHtml({ ...GRADED, ...REJECTED });
    expect(page.indexOf('id="dist-h"')).toBeLessThan(page.indexOf('id="rej-h"'));
    expect(page.indexOf('id="rej-h"')).toBeLessThan(page.indexOf('class="tree"'));
  });

  it("keeps refusals visually separate from the audited totals", () => {
    // Same reason they are a sibling key in the payload: a refused file was
    // never assessed, so it must not read as a document that scored badly.
    const page = renderStatusHtml({ ...GRADED, ...REJECTED });
    expect(page).toContain("Grade distribution");
    expect(page).toContain("Files the tool could not check");
  });
});

describe("escaping", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes keys and values, not just values", () => {
    const out = renderStatusHtml({ '<img src=x onerror="alert(1)">': "<script>alert(1)</script>" });
    expect(out).not.toMatch(/<script>alert/);
    expect(out).not.toMatch(/<img src=x/);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;img");
  });

  it("escapes the document title", () => {
    const out = renderStatusHtml({ status: "</title><script>alert(1)</script>" });
    expect(out).not.toMatch(/<\/title><script>/);
  });
});

// ---------------------------------------------------------------------------
// Collapsible cards + always-visible status strip (v1.55.0)
// ---------------------------------------------------------------------------
// The page grew enough cards that a first-time reader met a wall. Every card
// is now a native <details> fold, collapsed by default, whose summary carries
// the card's one headline fact — while the answer people arrive for ("is it
// up?") moved into an always-visible strip that no fold can hide.

describe("renderStatusStrip — the always-visible answer", () => {
  it("shows a green all-systems pill with version and humanized uptime", () => {
    const html = renderStatusStrip(PAYLOAD);
    expect(html).toContain('class="pill ok"');
    expect(html).toContain("All systems normal");
    expect(html).toContain("v1.41.2");
    expect(html).toContain("up 10 m");
  });

  it("shows the degraded list next to an amber pill", () => {
    const html = renderStatusStrip({
      ...PAYLOAD,
      status: "degraded",
      degraded: ["verapdf", "backup"],
    });
    expect(html).toContain('class="pill warn"');
    expect(html).toContain("Degraded");
    expect(html).toContain("degraded: verapdf, backup");
  });

  it("renders down (and anything unexpected) as the red pill, escaped", () => {
    expect(renderStatusStrip({ ...PAYLOAD, status: "down" })).toContain('class="pill down"');
    const weird = renderStatusStrip({ ...PAYLOAD, status: "<b>odd</b>" });
    expect(weird).toContain('class="pill down"');
    expect(weird).toContain("&lt;b&gt;odd&lt;/b&gt;");
    expect(weird).not.toContain("<b>odd</b>");
  });

  it("humanizes long uptimes into days and hours", () => {
    expect(renderStatusStrip({ ...PAYLOAD, uptime_seconds: 3 * 86_400 + 4 * 3600 })).toContain(
      "up 3 d 4 h",
    );
  });

  it("appears on the assembled page between the h1 and the first card", () => {
    const page = renderStatusHtml(PAYLOAD);
    const h1 = page.indexOf("<h1>Service status</h1>");
    const strip = page.indexOf('class="strip"');
    const firstCard = page.indexOf('<details class="card"');
    expect(h1).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(h1);
    expect(firstCard).toBeGreaterThan(strip);
  });
});

/** The `<section>` wrapping one card, so open/closed can be asserted per card
 *  rather than by searching the whole document. */
function cardFor(page: string, headingId: string): string {
  const anchor = page.indexOf(`aria-labelledby="${headingId}"`);
  expect(anchor, `card ${headingId} not found`).toBeGreaterThan(-1);
  const start = page.lastIndexOf("<section", anchor);
  return page.slice(start, page.indexOf("</section>", anchor));
}

describe("collapsible cards", () => {
  const FULL = {
    ...PAYLOAD,
    documents_audited: {
      total: 4121,
      last_24h: 12,
      last_30d: 300,
      by_grade_24h: { A: 1, B: 2, C: 3, D: 3, F: 3, ungraded: 0 },
      by_grade_30d: { A: 10, B: 20, C: 30, D: 40, F: 200, ungraded: 0 },
      by_grade_total: { A: 100, B: 200, C: 300, D: 400, F: 3121, ungraded: 0 },
      by_format_30d: { pdf: 290, docx: 8, pptx: 1, xlsx: 1, unknown_extension: 0 },
      by_format_total: { pdf: 4074, docx: 39, pptx: 2, xlsx: 5, unknown_extension: 1 },
    },
    documents_rejected: {
      total: 17,
      last_30d: 3,
      by_format_30d: { doc: 1, xls: 1, ppt: 0, rtf: 0, csv: 1, other: 0 },
      by_format_total: { doc: 5, xls: 4, ppt: 2, rtf: 1, csv: 5, other: 0 },
    },
    backup: {
      status: "ok",
      finished_at: "2026-08-05T08:00:12Z",
      finished_at_chicago: "Aug 5, 2026, 3:00:12 AM CDT",
      age_hours: 6.2,
      size_bytes: 574850,
      rows: 4143,
    },
  };

  it("collapses the interpretive cards but leaves the raw payload open", () => {
    const page = renderStatusHtml(FULL);
    // The four curated cards fold away…
    for (const id of ["dist-h", "fmt-h", "rej-h", "bak-h"]) {
      expect(cardFor(page, id)).toContain('<details class="card">');
    }
    // …while the JSON this endpoint exists to serve is visible on arrival.
    expect(cardFor(page, "raw-h")).toContain('<details class="card" open>');
  });

  it("each summary carries the card's headline fact as a peek", () => {
    const page = renderStatusHtml(FULL);
    expect(page).toContain("4,121 documents all-time · 12 in the last 24 h");
    expect(page).toContain("mostly PDF — by file type");
    expect(page).toContain("17 attempts all-time");
    expect(page).toContain("✓ 6.2 h ago · 561.4 KB");
  });

  it("keeps the h2 headings (with their ids) inside the summaries", () => {
    const page = renderStatusHtml(FULL);
    expect(page).toContain('<summary><h2 id="dist-h">Grade distribution</h2>');
    expect(page).toContain('<summary><h2 id="bak-h">Last successful backup</h2>');
  });

  it("pre-opens the backup card when the backup is stale — that state must not hide", () => {
    const stale = renderStatusHtml({
      ...FULL,
      backup: { ...FULL.backup, status: "stale", age_hours: 47.3 },
    });
    expect(cardFor(stale, "bak-h")).toContain('<details class="card" open>');
    expect(stale).toContain("⚠ 47.3 h ago — older than expected");
  });

  it("says so in the peek when no backup has ever completed", () => {
    const never = renderStatusHtml({ ...FULL, backup: { status: "unavailable" } });
    expect(never).toContain("none yet — expected before the first scheduled run");
    // Never-run is quiet: the card stays folded (only "stale" forces it open).
    expect(cardFor(never, "bak-h")).toContain('<details class="card">');
  });

  it("wraps the raw JSON tree in its own card, open on arrival", () => {
    const page = renderStatusHtml(FULL);
    expect(page).toContain("Raw status payload");
    expect(page).toContain("top-level keys — the exact JSON monitors read");
    // The tree itself still expands fully once the card is opened.
    expect(page).toContain("<details open>");
  });

  it("still ships zero JavaScript", () => {
    expect(renderStatusHtml(FULL)).not.toContain("<script");
  });
});

// ---------------------------------------------------------------------------
// Engines — CORE (qpdf) vs OPTIONAL (verapdf, chromium)
// ---------------------------------------------------------------------------
// apps/api/src/services/status.ts's CORE_ENGINES = ["qpdf"] (its failure is
// the one thing that turns the endpoint's own HTTP status into a 503) versus
// OPTIONAL_ENGINES = ["verapdf", "chromium"] (either can fail and the API
// stays at 200). Before this feature, the HTML view printed all three
// uniformly, so a reader could not tell "the service cannot audit anything"
// from "one optional feature is off" without already knowing which engine is
// which. These tests pin that the card and the always-visible strip now say
// so plainly, in each of the three shapes a real payload can take.

const ENGINES_HEALTHY = {
  checked_at: "2026-08-06T12:00:00Z",
  qpdf: { ok: true, version: "11.9.0" },
  verapdf: { ok: true, version: "1.30.1" },
  chromium: { ok: true },
};

describe("renderEngines — per-engine health card", () => {
  it("renders nothing, and the assembled page carries no card, for a payload that predates engines", () => {
    const { engines: _engines, ...payloadWithoutEngines } = PAYLOAD;
    expect(renderEngines(payloadWithoutEngines)).toBe("");
    const page = renderStatusHtml(payloadWithoutEngines);
    expect(page).not.toContain("Audit engines");
    // And it still renders a complete, uncrashed document.
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("</html>");
  });

  it("does not crash and adds no card when engines carries none of the known keys", () => {
    expect(renderEngines({ engines: {} })).toBe("");
    expect(renderEngines({ engines: { unknownEngine: { ok: true } } })).toBe("");
  });

  it("all-healthy: card is present, collapsed, and the peek says everything is running", () => {
    const page = renderStatusHtml({ ...PAYLOAD, engines: ENGINES_HEALTHY });
    expect(page).toContain("Audit engines");
    expect(page).toContain("all 3 ok");
    expect(cardFor(page, "eng-h")).toContain('<details class="card">');
  });

  it("lists each healthy engine by name with its version when present", () => {
    const html = renderEngines({ engines: ENGINES_HEALTHY });
    expect(html).toContain("<strong>qpdf</strong> 11.9.0");
    expect(html).toContain("<strong>veraPDF</strong> 1.30.1");
    // chromium's probe never returns a version (status.ts's defaultProbes) —
    // its row must not fabricate one.
    expect(html).toContain("<strong>Chromium</strong> ok</p>");
  });

  it("optional engine down: card auto-opens and names it; the strip does not claim audits are down", () => {
    const payload = {
      ...PAYLOAD,
      status: "degraded",
      degraded: ["chromium"],
      engines: { ...ENGINES_HEALTHY, chromium: { ok: false, reason: "not_configured" } },
    };
    const page = renderStatusHtml(payload);
    expect(cardFor(page, "eng-h")).toContain('<details class="card" open>');
    expect(page).toContain("Chromium");
    expect(page).toContain("not configured");
    expect(page).toContain("page (URL) audits are unavailable");

    const strip = renderStatusStrip(payload);
    expect(strip).toContain('class="pill warn"');
    expect(strip).not.toContain('class="pill down"');
    expect(strip).not.toContain("audit");
  });

  it("core engine down: card auto-opens; the strip states plainly that auditing is unavailable", () => {
    const payload = {
      ...PAYLOAD,
      status: "degraded",
      degraded: ["qpdf"],
      engines: { ...ENGINES_HEALTHY, qpdf: { ok: false, reason: "not_executable" } },
    };
    const page = renderStatusHtml(payload);
    expect(cardFor(page, "eng-h")).toContain('<details class="card" open>');
    expect(page).toContain("qpdf unavailable — audits cannot run");
    expect(page).toContain("no document or URL can be audited");

    const strip = renderStatusStrip(payload);
    expect(strip).toContain('class="pill down"');
    expect(strip).toContain("document auditing unavailable");
    expect(strip).not.toContain('class="pill warn"');
  });

  it("shows a down engine's impact note only on that engine's own row", () => {
    const html = renderEngines({
      engines: { ...ENGINES_HEALTHY, verapdf: { ok: false, reason: "timeout" } },
    });
    expect(html).toContain("timed out");
    expect(html).toContain("PDF/UA-1 verdict is unavailable");
    // qpdf and chromium are still healthy — their notes must not appear.
    expect(html).not.toContain("no document or URL can be audited");
    expect(html).not.toContain("page (URL) audits are unavailable");
  });

  it("falls back to the raw reason string when it does not match a known enum value", () => {
    const html = renderEngines({
      engines: { ...ENGINES_HEALTHY, qpdf: { ok: false, reason: "a_future_reason" } },
    });
    expect(html).toContain("a_future_reason");
  });

  it("escapes a hostile failure reason", () => {
    const html = renderEngines({
      engines: {
        ...ENGINES_HEALTHY,
        qpdf: { ok: false, reason: '<img src=x onerror="alert(1)">' },
      },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;alert(1)&quot;");
  });

  it("gives the card an accessible name and heading, distinct from the other cards", () => {
    const html = renderEngines({ engines: ENGINES_HEALTHY });
    expect(html).toContain('aria-labelledby="eng-h"');
    expect(html).toContain('<h2 id="eng-h">Audit engines</h2>');
  });

  it("sits right after the always-visible strip, before the grade distribution", () => {
    const page = renderStatusHtml({ ...GRADED, engines: ENGINES_HEALTHY });
    const strip = page.indexOf('class="strip"');
    expect(strip).toBeLessThan(page.indexOf('id="eng-h"'));
    expect(page.indexOf('id="eng-h"')).toBeLessThan(page.indexOf('id="dist-h"'));
  });

  it("ships zero JavaScript in every engine state", () => {
    const down = renderStatusHtml({
      ...PAYLOAD,
      status: "degraded",
      degraded: ["qpdf"],
      engines: { ...ENGINES_HEALTHY, qpdf: { ok: false, reason: "error" } },
    });
    expect(down).not.toContain("<script");
  });
});

describe("formatBytes — scales past the backup row's megabytes", () => {
  // The disk line reused the backup row's formatter, which capped at MB, and
  // rendered a 76 GB volume as "78284.0 MB free of ...". Correct, unreadable,
  // and on the page written for people who do not think in megabytes. Found
  // on production because nothing here asserted a gigabyte-scale value.
  const render = (bytes: number) =>
    renderDiskLine({ status: "ok", free_pct: 78, free_bytes: bytes, total_bytes: bytes });

  // The payload publishes these figures formatted too (free_human /
  // total_human / size_human, v1.112.0), and both surfaces now read ONE helper
  // in @file-audit/shared. Asserted against that helper rather than against a
  // literal, so reintroducing a local formatter here fails the moment its
  // output differs — which is exactly how a page ends up saying "54.1 GB"
  // beside a payload saying "54.2 GB".
  it("prints the same strings the payload publishes", () => {
    const free = 58_131_922_944;
    const total = 82_086_711_296;
    const html = renderDiskLine({
      status: "ok",
      free_pct: 71,
      free_bytes: free,
      total_bytes: total,
    });

    expect(html).toContain(`${formatBytes(free)} free of ${formatBytes(total)}`);
    expect(html).toContain("54.1 GB free of 76.4 GB"); // the production figures, spelled out
  });

  it("says a size is unknown rather than rendering it as 0 B", () => {
    // An unreadable figure must not look like an empty disk.
    const html = renderDiskLine({
      status: "ok",
      free_pct: 71,
      free_bytes: "not a number",
      total_bytes: 82_086_711_296,
    });
    expect(html).not.toContain("0 B");
  });

  it("renders a disk-sized volume in GB, not five-digit MB", () => {
    const html = render(82_057_216_000); // ~76 GB, the real production volume
    expect(html).toContain("GB");
    expect(html).not.toMatch(/\d{5,}(\.\d)? MB/);
  });

  it("still renders a backup-sized snapshot in MB", () => {
    // The original caller must not regress into "0.0 GB".
    expect(render(29_360_128)).toContain("28.0 MB");
  });

  it("scales to TB for a large volume", () => {
    expect(render(3_298_534_883_328)).toContain("TB");
  });
});

describe("renderPrivilegedAudits — trusted-tool (privileged) tier volume", () => {
  // After rotating the single shared privileged token, an operator watches
  // this to confirm privileged volume matches the fleet and nothing else is
  // using the token.
  const WITH_PRIV = {
    ...PAYLOAD,
    privileged_audits: { last_24h: 4, last_30d: 8306, total: 8306 },
  };

  it("renders the privileged counts inside the full status page", () => {
    const html = renderStatusHtml(WITH_PRIV);
    expect(html).toContain("Trusted-tool");
    expect(html).toMatch(/8,306/);
  });

  it("omits the section entirely when the payload carries no privileged_audits", () => {
    // Old cached payloads (pre-deploy) have no such field — the section must
    // simply not appear rather than render zeros or throw.
    const html = renderStatusHtml(PAYLOAD);
    expect(html).not.toContain("Trusted-tool");
  });
});

describe("renderDocumentProgress — the remediation-loop card (v1.89.0)", () => {
  const PROGRESS = {
    document_progress_30d: {
      documents: 41,
      reaudited: 12,
      improvable: 9,
      improved: 7,
      reached_a: 5,
      median_lift: 18,
    },
  };

  it("renders nothing when the payload has no progress block (an older API build)", () => {
    expect(renderDocumentProgress(PAYLOAD)).toBe("");
    expect(renderStatusHtml(PAYLOAD)).not.toContain("re-checked");
  });

  it("shows the headline figures, their rates, and where the numbers come from", () => {
    const html = renderDocumentProgress({ ...PAYLOAD, ...PROGRESS });
    expect(html).toMatch(/41/); // documents checked
    expect(html).toMatch(/12/); // re-checked
    expect(html).toMatch(/29\s?%/); // 12 of 41
    expect(html).toMatch(/7 of 9/); // improved of improvable
    expect(html).toMatch(/78\s?%/); // 7 of 9
    expect(html).toMatch(/5 reached an A/);
    expect(html).toContain("+18"); // median lift, signed
    // The provenance sentence the data-retention policy expects: name the
    // fields the figures are computed from, and state what is not shown.
    expect(html).toContain("file name, score, and time of audit");
    expect(html).toContain("No file name");
    // v1.90.0: the card must say the fleet's trusted-tool runs are excluded,
    // and that counting climbs from when the request tier was first recorded.
    expect(html).toContain("trusted-tool");
    expect(html).toMatch(/public uploads only/i);
  });

  it("suppresses rates and the median below the small-sample floor, and says why", () => {
    const html = renderDocumentProgress({
      ...PAYLOAD,
      document_progress_30d: {
        documents: 3,
        reaudited: 1,
        improvable: 1,
        improved: 1,
        reached_a: 0,
        median_lift: null,
      },
    });
    expect(html).toContain("too few");
    expect(html).not.toMatch(/\d\s?%/); // no rate may be derived from 1 document
    expect(html).toContain("3"); // the raw counts themselves stay published
  });

  it("is wired into the page and folds like the other interpretive cards", () => {
    const page = renderStatusHtml({ ...PAYLOAD, ...PROGRESS });
    expect(cardFor(page, "prog-h")).toContain('<details class="card">');
    expect(page).toContain('<summary><h2 id="prog-h">');
  });
});

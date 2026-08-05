import { describe, it, expect } from "vitest";
import { GRADE_THRESHOLDS } from "@file-audit/shared";
import {
  renderStatusHtml,
  renderGradeDistribution,
  renderFormatSplit,
  renderRejectedUploads,
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

  it("keeps the prose bounded — the tree stays the substance of the page", () => {
    // Originally "no explanatory prose at all". The page has since gained
    // three deliberate explanatory sections (grades, formats, refusals), each
    // earning its place by making a number un-misreadable. What still must not
    // happen is the page becoming an essay with a tree at the bottom, so the
    // bound is what this now guards.
    const text = html
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Only the title, the toggle label, and the payload's own content.
    expect(text).not.toMatch(/this page|explains|means that|in order to/i);
    expect(text.length).toBeLessThan(1200);
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

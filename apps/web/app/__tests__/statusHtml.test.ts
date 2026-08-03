import { describe, it, expect } from "vitest";
import { renderStatusHtml, pickFormat, escapeHtml } from "../../server/utils/statusHtml";

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
    by_format_total: { pdf: 4074, docx: 39, pptx: 2, xlsx: 5, other: 0 },
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

  it("links back to the raw JSON", () => {
    expect(html).toContain('href="/status?format=json"');
    expect(html).toContain("View raw JSON");
  });

  it("carries no explanatory prose — just the tree and the toggle", () => {
    // Requested explicitly: the page is the JSON, formatted. Nothing else.
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

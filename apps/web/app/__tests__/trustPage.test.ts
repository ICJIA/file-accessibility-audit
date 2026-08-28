import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// "Can I trust this?" (2026-08-28, user request): the manager-facing brief —
// the plain-English page of verifiable claims about this checker — is served
// by the site itself at /trust.html and linked from BOTH navs.
//
// Two rules pinned here:
//   1. /trust.html is a STATIC file in public/, not a Vue route — so every
//      link to it must be a plain <a>, never NuxtLink (the same twice-shipped
//      trap as /status: a NuxtLink would client-navigate into the SPA 404).
//   2. The served copy must be BYTE-IDENTICAL to docs/brief/checker-brief.html
//      — both are written by `pnpm build-brief` in one run, and this identity
//      is what guarantees the site never shows a different story than the
//      document being emailed around. If this fails, run `pnpm build-brief`.
// ---------------------------------------------------------------------------

const WEB = resolve(__dirname, "..");
const ROOT = resolve(WEB, "../../.."); // apps/web/app -> repo root
const layout = readFileSync(resolve(WEB, "layouts/default.vue"), "utf8");

describe("Can I trust this? — the trust page", () => {
  it("is served as a static file in public/", () => {
    expect(existsSync(resolve(WEB, "../public/trust.html"))).toBe(true);
  });

  it("is byte-identical to the generated brief (pnpm build-brief writes both)", () => {
    const served = readFileSync(resolve(WEB, "../public/trust.html"), "utf8");
    const brief = readFileSync(resolve(ROOT, "docs/brief/checker-brief.html"), "utf8");
    expect(served).toBe(brief);
  });

  it("carries the big date stamp that makes staleness visible", () => {
    const served = readFileSync(resolve(WEB, "../public/trust.html"), "utf8");
    expect(served).toMatch(/Every number below was pulled live/);
    expect(served).toMatch(/class="stamp"/);
  });

  it("the header nav links it as a plain <a>, never NuxtLink", () => {
    const headerNav = layout.slice(0, layout.indexOf("</nav>"));
    expect(headerNav).toMatch(/<a[^>]+href="\/trust\.html"/);
    expect(headerNav).toMatch(/Can I trust this\?/);
    // The /status trap, twice shipped: a NuxtLink to a non-Vue route renders
    // the SPA 404.
    // Component form only — the guard comment beside the link itself says
    // "NOT NuxtLink: /trust.html", which must not trip this.
    expect(headerNav).not.toMatch(/<NuxtLink[^>]*trust/);
  });

  it("the footer links it as a plain <a> too", () => {
    const footer = layout.slice(layout.indexOf("<footer"));
    expect(footer).toMatch(/<a[^>]+href="\/trust\.html"/);
    expect(footer).toMatch(/Can I trust this\?/);
  });
});

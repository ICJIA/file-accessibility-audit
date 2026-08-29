import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// "Can I trust this?" — the manager-facing brief, as a REAL PAGE of the app.
//
// v1.118.0 served it as a static file at /trust.html; v1.119.0 makes it a Vue
// route at /trust so it wears the site's own header nav and footer and stays
// responsive with everything else. The page body is GENERATED — `pnpm
// build-brief` fills the template with live numbers and writes
// app/data/trustBody.ts — and the same fill also produces the emailable
// standalone twins in docs/brief/, so the sync guarantee is containment: the
// app body must appear verbatim inside the standalone page. If these fail,
// run `pnpm build-brief`.
// ---------------------------------------------------------------------------

const WEB = resolve(__dirname, "..");
const ROOT = resolve(WEB, "../../..");
const layout = readFileSync(resolve(WEB, "layouts/default.vue"), "utf8");

describe("Can I trust this? — the /trust page", () => {
  it("is a Vue page of the app, rendering the generated body", () => {
    const page = readFileSync(resolve(WEB, "pages/trust.vue"), "utf8");
    expect(page).toMatch(/from "~\/data\/trustBody"/);
    expect(page).toMatch(/v-html="TRUST_BODY"/);
  });

  it("the generated body exists, carries the date stamp, and the old static file is gone", () => {
    const body = readFileSync(resolve(WEB, "data/trustBody.ts"), "utf8");
    expect(body).toMatch(/pulled live/);
    expect(body).toMatch(/class=\\"stamp\\"|class="stamp"/);
    // The /trust.html era must not linger — two copies of one page is drift.
    expect(existsSync(resolve(WEB, "../public/trust.html"))).toBe(false);
  });

  it("stays in sync with the emailable brief: the app body appears verbatim inside it", () => {
    // Parsed from the generated module rather than imported, so a missing
    // file fails THIS assertion instead of crashing collection.
    const src = readFileSync(resolve(WEB, "data/trustBody.ts"), "utf8");
    // First statement only — the module also exports TRUST_STAMP after it.
    const literal = src.slice(src.indexOf("= ") + 2, src.indexOf(";\n"));
    const body = JSON.parse(literal) as string;
    // The app body drops the template's own <footer> (the layout provides the
    // real one), which cuts a chunk out of the final section — so apply the
    // SAME strip to the standalone before asserting containment.
    const standalone = readFileSync(resolve(ROOT, "docs/brief/checker-brief.html"), "utf8");
    const stripped = standalone
      .replace(/\s*<footer>[\s\S]*?<\/footer>/, "")
      // The app body also drops the standalone's <script> blocks (v-html
      // would never run them; trust.vue carries the behavior CSP-legally).
      .replace(/\s*<!-- Close goes BACK[\s\S]*?<\/script>/g, "")
      .replace(/\s*<script>[\s\S]*?<\/script>/g, "");
    expect(body.length).toBeGreaterThan(5_000);
    expect(stripped).toContain(body.trim());
    // The rendered app body must stay script-free — behavior lives in the
    // page component, where the nonce-based CSP can bless it.
    expect(body).not.toContain("<script");
  });

  it("the modal Close goes back to the page it was opened from", () => {
    // In the app: a delegated handler on the v-html container (inline
    // onclick is dead under the nonce-based CSP). In the standalone brief:
    // a real <script> with the same referrer-gated history.back().
    const page = readFileSync(resolve(WEB, "pages/trust.vue"), "utf8");
    expect(page).toMatch(/onTrustBodyClick/);
    expect(page).toMatch(/a\.tm-close/);
    expect(page).toMatch(/history\.back\(\)/);
    const standalone = readFileSync(resolve(ROOT, "docs/brief/checker-brief.html"), "utf8");
    expect(standalone).toMatch(/tm-close[\s\S]*history\.back\(\)/);
  });

  it("the trap-inventory modal lists every document the stats claim", () => {
    // The trust page says "we built N documents designed to fool it" and
    // offers a modal listing all of them. The modal must carry exactly N
    // cards — a page that claims 100 and lists 60 is the kind of gap a
    // skeptic is right to pounce on. N comes from brief-stats.json, the same
    // number the hero stat is filled from.
    const stats = JSON.parse(
      readFileSync(resolve(WEB, "../../../scripts/brief-stats.json"), "utf8"),
    );
    const body = readFileSync(resolve(WEB, "data/trustBody.ts"), "utf8");
    const cards = body.match(/class=\\"trapm\\"/g) ?? [];
    expect(cards.length).toBe(stats.traps);
    expect(body).toContain('id=\\"all-traps\\"');
    expect(body).toMatch(/FOUND A REAL BUG/);
  });

  it("the header nav links it — a NuxtLink now, because /trust is a real route", () => {
    const headerNav = layout.slice(0, layout.indexOf("</nav>"));
    expect(headerNav).toMatch(/<NuxtLink[^>]*to="\/trust"/);
    expect(headerNav).toMatch(/Can I trust this\?/);
  });

  it("the footer links it like its neighbors", () => {
    const footer = layout.slice(layout.indexOf("<footer"));
    expect(footer).toMatch(/href="\/trust"/);
    expect(footer).toMatch(/Can I trust this\?/);
  });
});

describe("nav rows never wrap mid-label", () => {
  // Reported 2026-08-28 with a screenshot: at laptop widths the footer showed
  // "What's / New", "Can I trust / this?", "Data Retention / Policy". A row
  // may wrap as WHOLE items; a label may not break in half.
  it("every footer nav label is whitespace-nowrap, and the row is allowed to wrap as items", () => {
    const footer = layout.slice(layout.indexOf("<footer"));
    const row = footer.slice(0, footer.indexOf("</div>"));
    expect(row).toMatch(/flex-wrap/);
    const anchors = footer.match(/<a[\s\S]*?<\/a>/g) ?? [];
    const navAnchors = anchors.filter((a) =>
      /Changelog|What's New|Can I trust|Data Retention|Technical Details|Scoring|GitHub/.test(a),
    );
    expect(navAnchors.length).toBeGreaterThanOrEqual(5);
    for (const a of navAnchors) expect(a).toMatch(/whitespace-nowrap/);
  });

  it("header and footer get the wider container; reading content keeps its measure", () => {
    const headerBlock = layout.slice(0, layout.indexOf("</header>"));
    const footerBlock = layout.slice(layout.indexOf("<footer"));
    expect(headerBlock).toMatch(/max-w-6xl/);
    expect(footerBlock).toMatch(/max-w-6xl/);
    // main stays at the comfortable reading width
    const mainTag = layout.slice(layout.indexOf("<main"), layout.indexOf("</main>"));
    expect(mainTag).toMatch(/max-w-4xl/);
  });
});

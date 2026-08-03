import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// The announcement archive (/announcements) exists because the home-page
// banner shows only the newest entry AND is permanently dismissible per id —
// so without an archive, an update a visitor dismissed becomes unreachable.
//
// The property that matters, and the reason these tests exist:
//   dismissing the banner must NEVER be able to hide the archive.
//
// That requires two independent things to stay true:
//   1. The archive is reachable from a surface that renders regardless of
//      banner state — the footer, which is on every page. A link only in the
//      banner would vanish at exactly the moment it becomes useful.
//   2. The archive page itself must not consult the dismissal store.
//
// These follow the source-inspection precedent used by accessibility.test.ts,
// responsive.test.ts and dataRetentionVersion.test.ts: pages and layouts of
// this size are read as source rather than mounted, because this suite's
// plain vitest config does not apply Nuxt's build-time aliases.

const DISMISSAL_STORAGE_KEY = "a11y-audit:dismissed-announcements";

function readSource(relative: string): string {
  return readFileSync(resolve(__dirname, "..", relative), "utf-8");
}

const layout = readSource("layouts/default.vue");
const page = readSource("pages/announcements.vue");
const banner = readSource("components/AnnouncementBanner.vue");

describe("announcement archive: reachability", () => {
  it("is linked from the footer, which renders on every page", () => {
    // The dismissal-proof route. If this disappears, a visitor who dismissed
    // the banner can only reach past updates by guessing the URL.
    expect(layout).toContain('href="/announcements"');
  });

  it("is linked from the header", () => {
    expect(layout).toContain('to="/announcements"');
  });

  it("puts the header link OUTSIDE the auth-gated nav", () => {
    // The header's main <nav> is `v-if="user"`. That nav DOES render for
    // ordinary visitors today, because /api/auth/me returns
    // { email: "anonymous" } rather than null while AUTH.REQUIRE_LOGIN is
    // false — so `user` is truthy. But that is incidental: enabling login,
    // or changing the anonymous sentinel to null, would silently hide
    // anything placed inside it. The archive link must not depend on auth
    // state, so it lives outside that block.
    const gatedNavStart = layout.indexOf('<nav v-if="user"');
    const gatedNavEnd = layout.indexOf("</nav>", gatedNavStart);
    const headerLink = layout.indexOf('to="/announcements"');

    expect(gatedNavStart).toBeGreaterThan(-1);
    expect(headerLink).toBeGreaterThan(-1);
    const insideGatedNav = headerLink > gatedNavStart && headerLink < gatedNavEnd;
    expect(insideGatedNav).toBe(false);
  });

  it("is also linked from the banner itself", () => {
    expect(banner).toContain('to="/announcements"');
  });

  it("uses a plain href in the footer, not a client-side-only construct", () => {
    // /announcements IS a Vue page, so either would work today — but the
    // footer's established pattern is a plain anchor, and matching it keeps
    // the row consistent.
    const footerLink = /<a\s+[^>]*href="\/announcements"/.test(layout);
    expect(footerLink).toBe(true);
  });
});

describe("announcement archive: dismissal cannot hide it", () => {
  it("never reads the banner's dismissal store", () => {
    // This is the core guarantee. If the page ever started filtering by
    // dismissed ids, the archive would hide precisely the entries a visitor
    // most needs it for.
    expect(page).not.toContain(DISMISSAL_STORAGE_KEY);
    expect(page).not.toContain("localStorage");
  });

  it("sources entries from runtimeConfig, which dismissal does not touch", () => {
    expect(page).toContain("useRuntimeConfig");
    expect(page).toContain("announcements");
  });

  it("renders every entry rather than only the newest", () => {
    // The banner deliberately shows one; the archive must not inherit that.
    expect(page).toMatch(/v-for=/);
    expect(page).not.toMatch(/announcements\s*\[\s*0\s*\]/);
  });
});

describe("announcement archive: consistency with the banner", () => {
  it("applies the same WCAG-version filter the banner does", () => {
    // An announcement gated to a different WCAG version does not describe the
    // running configuration, so showing it in the archive would mislead.
    expect(page).toContain("requiresWcagVersion");
    expect(banner).toContain("requiresWcagVersion");
  });

  it("honours linkExternal, so a server-route link does not 404", () => {
    // Same trap the banner hit in v1.39.0: /status is a Nitro server route,
    // and a client-side NuxtLink renders the SPA 404 without ever reaching
    // the server.
    expect(page).toContain("linkExternal");
    expect(page).toMatch(/:external=/);
  });
});

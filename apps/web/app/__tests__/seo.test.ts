import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Sitemap + SEO basics (2026-08-28, user request). The sitemap is REGENERATED
// by `pnpm build-brief` so its <lastmod> stays honest, the same run that
// refreshes the trust page. robots.txt must point at it, and what robots.txt
// disallows must never be listed in it — a sitemap inviting crawlers to a
// disallowed URL is an argument between two files.
// ---------------------------------------------------------------------------

const WEB = resolve(__dirname, "..");
// Lazy reads: a missing file must fail an assertion, not test collection.
const sitemap = () => readFileSync(resolve(WEB, "../public/sitemap.xml"), "utf8");
const robots = () => readFileSync(resolve(WEB, "../public/robots.txt"), "utf8");

describe("sitemap.xml", () => {
  it("lists every public page, absolute and canonical", () => {
    for (const path of [
      "https://audit.icjia.app/",
      "https://audit.icjia.app/trust",
      "https://audit.icjia.app/announcements",
      "https://audit.icjia.app/technical-details",
      "https://audit.icjia.app/data-retention",
      "https://audit.icjia.app/wcag-2-2",
    ]) {
      expect(sitemap()).toContain(`<loc>${path}</loc>`);
    }
  });

  it("never lists what robots.txt disallows", () => {
    for (const blocked of ["/api/", "/healthz", "/status", "/publist"]) {
      expect(robots()).toContain(`Disallow: ${blocked}`);
      expect(sitemap()).not.toContain(`<loc>https://audit.icjia.app${blocked}`);
    }
  });

  it("carries a real lastmod, so the build-brief regeneration shows", () => {
    expect(sitemap()).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("robots.txt points crawlers at it", () => {
    expect(robots()).toMatch(/^Sitemap: https:\/\/audit\.icjia\.app\/sitemap\.xml$/m);
  });
});

describe("/trust page SEO", () => {
  const page = readFileSync(resolve(WEB, "pages/trust.vue"), "utf8");

  it("has its own title, description, canonical, and og tags", () => {
    expect(page).toMatch(/title: "Can I trust this\?/);
    expect(page).toMatch(/name: "description"/);
    expect(page).toMatch(/rel: "canonical"/);
    expect(page).toContain("https://audit.icjia.app/trust");
    expect(page).toMatch(/property: "og:title"/);
  });
});

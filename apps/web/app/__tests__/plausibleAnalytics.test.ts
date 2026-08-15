import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ANALYTICS, DEPLOY } from "../../../../audit.config";

// The Plausible snippet has three parts that must agree or analytics fails
// SILENTLY (no error anywhere; the dashboard just stays empty):
//   1. the <script> tag nuxt.config.ts injects into every page head,
//   2. the CSP allowance for the same origin (covered by csp.test.ts),
//   3. the data-domain, which must equal the production hostname — the
//      self-hosted instance discards events for any site it doesn't know.
// nuxt.config.ts can't be imported here (defineNuxtConfig exists only inside
// the Nuxt build), so this follows the suite's established precedent of
// scanning the source text (see dataRetentionVersion.test.ts).

const nuxtConfig = readFileSync(resolve(__dirname, "../../nuxt.config.ts"), "utf-8");

describe("Plausible analytics snippet wiring", () => {
  it("nuxt.config.ts loads the MANUAL script from the ANALYTICS constants (no hardcoded copy to drift)", () => {
    // script.manual.js, not script.js: the stock script reports every
    // per-job /remediate/<uuid> URL as its own page (user dashboard
    // screenshot, 2026-08-15) AND includes the full URL — query string,
    // download token and all — in its payload. The manual variant sends
    // nothing on its own; the plausible.client plugin reports a normalized,
    // path-only URL instead.
    expect(nuxtConfig).toContain("${ANALYTICS.PLAUSIBLE_HOST}/js/script.manual.js");
    expect(nuxtConfig).not.toContain("/js/script.js");
    expect(nuxtConfig).toContain('"data-domain": ANALYTICS.PLAUSIBLE_DOMAIN');
    expect(nuxtConfig).toMatch(/defer:\s*true/);
  });

  it("the client plugin reports normalized route paths, never the raw location", () => {
    const plugin = readFileSync(resolve(__dirname, "../plugins/plausible.client.ts"), "utf-8");
    // Comments stripped first: the plugin's own comments explain the
    // query-string rule in prose, and the negative assertions below are
    // about the CODE.
    const code = plugin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // Pageviews come from the router's path through the normalizer…
    expect(code).toContain("analyticsPagePath");
    expect(code).toMatch(/afterEach/);
    // …and never from location.href / route query, so tokens and per-file
    // ids cannot leave the page.
    expect(code).not.toContain("location.href");
    expect(code).not.toMatch(/\bquery\b|fullPath|location\.search/);
    // Disabled exactly like the snippet when no host is configured.
    expect(code).toContain("ANALYTICS.PLAUSIBLE_HOST");
  });

  it("data-domain equals the production hostname (events are discarded otherwise)", () => {
    expect(ANALYTICS.PLAUSIBLE_DOMAIN).toBe(new URL(DEPLOY.PRODUCTION_URL).hostname);
  });

  it("the analytics origin is https with no trailing slash (used verbatim in the CSP and the script URL)", () => {
    expect(ANALYTICS.PLAUSIBLE_HOST).toMatch(/^https:\/\/[^/]+$/);
  });
});

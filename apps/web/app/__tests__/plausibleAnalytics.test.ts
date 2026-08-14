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
  it("nuxt.config.ts builds the script tag from the ANALYTICS constants (no hardcoded copy to drift)", () => {
    expect(nuxtConfig).toContain("${ANALYTICS.PLAUSIBLE_HOST}/js/script.js");
    expect(nuxtConfig).toContain('"data-domain": ANALYTICS.PLAUSIBLE_DOMAIN');
    expect(nuxtConfig).toMatch(/defer:\s*true/);
  });

  it("data-domain equals the production hostname (events are discarded otherwise)", () => {
    expect(ANALYTICS.PLAUSIBLE_DOMAIN).toBe(new URL(DEPLOY.PRODUCTION_URL).hostname);
  });

  it("the analytics origin is https with no trailing slash (used verbatim in the CSP and the script URL)", () => {
    expect(ANALYTICS.PLAUSIBLE_HOST).toMatch(/^https:\/\/[^/]+$/);
  });
});

/**
 * analyticsPagePath — the URL that leaves the site for the analytics server.
 *
 * User report (2026-08-15, Plausible dashboard screenshot): every
 * remediation job registered its own page — /remediate/<uuid>, one visit
 * each — so the Top Pages report was filling with hundreds of single-hit
 * rows for per-file URLs. Only the ROUTE is meaningful analytics; the id
 * segment identifies one file's job and belongs to no report.
 *
 * The same normalization applies to /report/<id> (shared-report links are
 * per-file hashes with identical cardinality) and /page-report/<id>
 * (per-audit hashes, missed when the page shipped in v1.82.0 — second
 * screenshot, 2026-08-18), and because the reported
 * URL is built from the route PATH alone, query strings never leave the
 * page — including the remediation download token that the stock
 * script.js used to include in the payload's full URL.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { analyticsPagePath } from "../utils/analyticsUrl";

describe("analyticsPagePath", () => {
  it("collapses per-job remediation URLs to the route", () => {
    expect(analyticsPagePath("/remediate/1eaaee2c-422f-4022-b53c-d24b1ecc633f")).toBe("/remediate");
    expect(analyticsPagePath("/remediate/b3d2e1c3-ee21-4ad3-b8b4-635904bfd28f")).toBe("/remediate");
    expect(analyticsPagePath("/remediate/")).toBe("/remediate");
    expect(analyticsPagePath("/remediate")).toBe("/remediate");
  });

  it("collapses per-file shared-report URLs to the route", () => {
    expect(analyticsPagePath("/report/01ba273c5450058b629af2984fb7b707")).toBe("/report");
    expect(analyticsPagePath("/report")).toBe("/report");
  });

  it("collapses per-audit page-report URLs to the route", () => {
    expect(analyticsPagePath("/page-report/ad1fabf53a709b1088f6a8dd3d9bb3a5")).toBe("/page-report");
    expect(analyticsPagePath("/page-report/5f4593bc172bfd5ce5100000deadbeef")).toBe("/page-report");
    expect(analyticsPagePath("/page-report/")).toBe("/page-report");
    expect(analyticsPagePath("/page-report")).toBe("/page-report");
  });

  it("collapses EVERY dynamic route under pages/ (contract: new [param] routes must be added to the normalizer)", () => {
    // /page-report/[id].vue shipped (v1.82.0) without being added here, so
    // each page audit registered its own UUID row in Plausible (user
    // screenshot, 2026-08-18) — the second route to miss the collapse.
    // This walks the real pages directory: any folder holding a [param].vue
    // is a per-id route and must report as its base path.
    const pagesDir = resolve(__dirname, "../pages");
    const dynamicRoutes = readdirSync(pagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((dir) =>
        readdirSync(resolve(pagesDir, dir.name)).some((f) => /^\[.+\]\.vue$/.test(f)),
      )
      .map((dir) => dir.name);

    expect(dynamicRoutes.length).toBeGreaterThanOrEqual(3);
    for (const route of dynamicRoutes) {
      expect(analyticsPagePath(`/${route}/0123456789abcdef0123456789abcdef`)).toBe(`/${route}`);
    }
  });

  it("leaves every other route untouched", () => {
    for (const p of ["/", "/data-retention", "/technical-details", "/wcag-2-2", "/announcements"]) {
      expect(analyticsPagePath(p)).toBe(p);
    }
  });

  it("does not collapse look-alike prefixes", () => {
    expect(analyticsPagePath("/remediation-guide")).toBe("/remediation-guide");
    expect(analyticsPagePath("/reporting")).toBe("/reporting");
  });
});

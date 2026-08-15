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
 * per-file hashes with identical cardinality), and because the reported
 * URL is built from the route PATH alone, query strings never leave the
 * page — including the remediation download token that the stock
 * script.js used to include in the payload's full URL.
 */
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

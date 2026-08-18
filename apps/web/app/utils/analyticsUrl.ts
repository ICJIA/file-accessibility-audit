/**
 * The page path reported to the self-hosted Plausible instance.
 *
 * Per-id routes collapse to their base route: every remediation job
 * lives at /remediate/<uuid>, every shared report at /report/<hash>,
 * and every page audit at /page-report/<hash>, so the stock
 * auto-tracking script filled the dashboard's Top Pages with
 * single-visit rows for individual files (user screenshots, 2026-08-15
 * and 2026-08-18). The route is the meaningful unit of analytics; which
 * file's job or report was open is not the dashboard's business.
 *
 * /page-report must precede /report only if the patterns overlap — they
 * don't (each is anchored) — but keep every dynamic route listed here:
 * analyticsUrl.test.ts walks pages/ and fails on any [param] route this
 * function does not collapse.
 *
 * Pure function — callers pass a router path (never location.href), so
 * query strings and fragments are out of scope by construction.
 */
export function analyticsPagePath(path: string): string {
  if (/^\/remediate(\/|$)/.test(path)) return "/remediate";
  if (/^\/report(\/|$)/.test(path)) return "/report";
  if (/^\/page-report(\/|$)/.test(path)) return "/page-report";
  return path;
}

/**
 * The page path reported to the self-hosted Plausible instance.
 *
 * Per-file routes collapse to their base route: every remediation job
 * lives at /remediate/<uuid> and every shared report at /report/<hash>,
 * so the stock auto-tracking script filled the dashboard's Top Pages
 * with single-visit rows for individual files (user screenshot,
 * 2026-08-15). The route is the meaningful unit of analytics; which
 * file's job or report was open is not the dashboard's business.
 *
 * Pure function — callers pass a router path (never location.href), so
 * query strings and fragments are out of scope by construction.
 */
export function analyticsPagePath(path: string): string {
  if (/^\/remediate(\/|$)/.test(path)) return "/remediate";
  if (/^\/report(\/|$)/.test(path)) return "/report";
  return path;
}

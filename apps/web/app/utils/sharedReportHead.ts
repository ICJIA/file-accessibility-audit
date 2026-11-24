/**
 * Head and HTTP status for the two shared-report pages
 * (pages/report/[id].vue and pages/page-report/[id].vue).
 *
 * Both are UNLISTED links: anyone holding the URL can read the report, and
 * nothing else should lead to it. Neither page used to set any of this, so
 * each inherited the site-wide head from nuxt.config.ts — the home page's
 * title, the home page's canonical URL, and no robots directive — and a
 * missing or expired report was served as `200 OK`.
 */

type MaybeFetchError = { statusCode?: number; status?: number } | null | undefined;

/**
 * The real HTTP status for a report that could not be shown: 404 (no such
 * report) or 410 (expired). Null for anything else — a transient upstream
 * failure is not a statement about the report, and the page is left as it is.
 */
export function sharedReportErrorStatus(error: MaybeFetchError): 404 | 410 | null {
  const code = error?.statusCode ?? error?.status;
  return code === 404 || code === 410 ? code : null;
}

/**
 * The head for a shared-report page. `title` is plain text — it reaches the
 * document through useHead, which escapes it; it is never placed as HTML.
 *
 *   - robots: noindex, nofollow — an unlisted link stays out of search;
 *   - canonical / og:url: the report's OWN address, replacing the home-page
 *     values the site-wide head would otherwise leave on it;
 *   - og/twitter title: the same title, so a pasted link's preview names the
 *     report instead of the tool's home page.
 */
export interface SharedReportHead {
  title: string;
  meta: Array<
    | { name: "robots" | "twitter:title"; content: string }
    | { property: "og:title" | "og:url"; content: string }
  >;
  link: Array<{ rel: "canonical"; href: string }>;
}

export function sharedReportHead(title: string, selfUrl: string): SharedReportHead {
  return {
    title,
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: title },
      { property: "og:url", content: selfUrl },
      { name: "twitter:title", content: title },
    ],
    link: [{ rel: "canonical", href: selfUrl }],
  };
}

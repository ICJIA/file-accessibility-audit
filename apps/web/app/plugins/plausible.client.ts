/**
 * Manual Plausible pageviews with normalized URLs.
 *
 * nuxt.config.ts loads `script.manual.js`, which sends NOTHING on its
 * own; this plugin reports one pageview per route change, built from the
 * route path through analyticsPagePath(). Two things that must stay true:
 *
 * - Per-id routes (/remediate/<jobId>, /report/<id>, /page-report/<id>)
 *   report as their base route, so the dashboard counts the feature, not
 *   the file.
 * - The reported URL is origin + path, never the raw location — query
 *   strings (including the remediation download token that the stock
 *   script.js used to ship in its payload) never reach the analytics
 *   server.
 *
 * Localhost is still excluded by Plausible's own script, exactly as with
 * the stock snippet, so this stays unconditional in dev.
 */
import { ANALYTICS } from "../../../../audit.config";
import { analyticsPagePath } from "~/utils/analyticsUrl";

type PlausibleFn = ((event: string, opts?: { u?: string }) => void) & { q?: unknown[] };

export default defineNuxtPlugin((nuxtApp) => {
  if (!ANALYTICS.PLAUSIBLE_HOST) return;

  const w = window as unknown as { plausible?: PlausibleFn };
  // Standard Plausible queue stub: calls made before script.manual.js
  // finishes loading are queued and replayed by the script itself.
  w.plausible =
    w.plausible ||
    Object.assign(
      function (this: unknown, ...args: unknown[]) {
        (w.plausible!.q = w.plausible!.q || []).push(args);
      } as unknown as PlausibleFn,
      { q: [] as unknown[] },
    );

  // afterEach fires for the initial client navigation too; the app:mounted
  // fallback covers any load path where it doesn't, and the last-sent guard
  // keeps the two from double-counting one view.
  let lastSent = "";
  const send = (path: string) => {
    const u = window.location.origin + analyticsPagePath(path);
    if (u === lastSent) return;
    lastSent = u;
    w.plausible!("pageview", { u });
  };

  const router = useRouter();
  router.afterEach((to) => send(to.path));
  nuxtApp.hook("app:mounted", () => send(router.currentRoute.value.path));
});

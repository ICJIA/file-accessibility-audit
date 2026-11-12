// Page-audit service — render an HTML page in headless Chromium, run
// axe-core against the rendered DOM, return a normalised result.
//
// Used by POST /api/audit-url-page (the fleet-audit complement to the PDF
// scoring endpoint). filecap's per-PDF Referenced column carries one or
// more page URLs each PDF is linked from; managers ask "is that page
// itself accessible?" — this service is the answer.
//
// Scoring methodology (mirrors the strict-PDF profile shape so filecap
// can render both with the same chip pattern):
//   100 base
//   - 10 per critical violation node
//   - 5  per serious violation node
//   - 2  per moderate violation node
//   - 1  per minor violation node
//   clamped to [0, 100]
// Grade brackets: A 90-100 / B 80-89 / C 70-79 / D 60-69 / F < 60.

import puppeteer, { type Browser, type HTTPRequest } from "puppeteer";
import { AxePuppeteer } from "@axe-core/puppeteer";
import { resolvePublicIp } from "./safeFetch.js";
import { shouldAllowPageRequest } from "./pageAuditGuard.js";

const BASE_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

/**
 * Chromium launch arguments for one page audit. When the document host has
 * been resolved and validated in Node, it is PINNED into Chromium's own
 * resolver (`--host-resolver-rules=MAP host ip`), so the browser connects to
 * exactly the address the private-IP check approved — the same
 * resolve-then-dial guarantee safeFetch gives the PDF path. Without it,
 * Chromium re-resolved on its own and a rebinding or multi-record name could
 * steer the navigation elsewhere (2026-09-02).
 *
 * --no-sandbox remains: the production host runs Chromium under PM2 as a
 * non-root user without unprivileged user namespaces. The SSRF control for
 * this endpoint is the pin plus the per-request interceptor below, not the
 * sandbox; the sandbox question is an ops item (see docs).
 *
 * Only the DOCUMENT host can be pinned: the rule is a launch flag, and the
 * hosts a page will load sub-resources from are not known until it runs.
 * Sub-resources get the per-request check instead — see hardenPage for what
 * that leaves open.
 */
export function chromiumLaunchArgs(pin?: { host: string; ip: string }): string[] {
  const args = [...BASE_ARGS];
  if (pin && pin.host && pin.ip) {
    args.push(`--host-resolver-rules=MAP ${pin.host} ${pin.ip}`);
  }
  return args;
}

// One browser PER AUDIT (not a shared singleton): the resolver pin is a
// launch flag, so it can only be honest per document. Launch cost (~0.5 s)
// is noise beside the 30 s navigation budget and the axe pass.
const activeBrowsers = new Set<Browser>();

async function launchPinnedBrowser(pin?: { host: string; ip: string }): Promise<Browser> {
  const browser = await puppeteer.launch({ headless: true, args: chromiumLaunchArgs(pin) });
  activeBrowsers.add(browser);
  return browser;
}

// Public shutdown for tests / graceful pm2 shutdown: closes every browser
// still open from an in-flight audit.
export async function closeBrowser(): Promise<void> {
  const open = [...activeBrowsers];
  activeBrowsers.clear();
  await Promise.all(open.map((b) => b.close().catch(() => {})));
}

export interface PageAuditIssue {
  id: string;
  impact: string | null;
  description: string;
  helpUrl: string;
  tags: string[];
  nodeCount: number; // mirrors the score's per-node basis (max(1, nodes)) so downstream breakdowns reconcile with bySeverity
  nodes: { target: string[] }[]; // capped to MAX_NODES_PER_RULE — for stable issue identity
}

export interface PageAuditResult {
  url: string;
  pageTitle: string | null;
  audited: string;
  score: number;
  grade: string;
  violationCount: number;
  bySeverity: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  violations: PageAuditIssue[];
  incomplete: PageAuditIssue[];
}

const SEVERITY_WEIGHTS = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
} as const;

type Severity = keyof typeof SEVERITY_WEIGHTS;

function isSeverity(s: string): s is Severity {
  return s === "critical" || s === "serious" || s === "moderate" || s === "minor";
}

function computeScore(violations: Array<{ impact?: string | null; nodes?: unknown[] }>) {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let penalty = 0;
  for (const v of violations) {
    const raw = (v.impact ?? "minor").toLowerCase();
    const impact: Severity = isSeverity(raw) ? raw : "minor";
    const nodeCount = Array.isArray(v.nodes) ? Math.max(1, v.nodes.length) : 1;
    penalty += SEVERITY_WEIGHTS[impact] * nodeCount;
    bySeverity[impact] += nodeCount;
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return { score, bySeverity };
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const MAX_NODES_PER_RULE = 25;

export function slimIssue(v: any): PageAuditIssue {
  const allNodes = Array.isArray(v?.nodes) ? v.nodes : [];
  return {
    id: String(v?.id ?? ""),
    impact: typeof v?.impact === "string" ? v.impact : null,
    description: String(v?.description ?? ""),
    helpUrl: String(v?.helpUrl ?? ""),
    tags: Array.isArray(v?.tags)
      ? v.tags.filter((t: unknown): t is string => typeof t === "string")
      : [],
    nodeCount: Math.max(1, allNodes.length),
    nodes: allNodes.slice(0, MAX_NODES_PER_RULE).map((n: any) => ({
      target: Array.isArray(n?.target) ? n.target.map((s: unknown) => String(s)) : [],
    })),
  };
}

const PAGE_NAV_TIMEOUT_MS = 30_000;
const HYDRATION_WAIT_MS = 2_000;
const MAX_VIOLATIONS_PERSISTED = 50;

// Bound concurrent headless-Chromium page renders. Each render opens a tab,
// navigates with a 30s budget, waits for hydration, and runs axe-core (~32s),
// holding memory the whole time. Without a cap, a burst of page-audit
// requests would spawn unbounded tabs and exhaust the box. Excess callers get
// a busy error (mapped to 503 by the route) rather than queueing forever.
const MAX_CONCURRENT_PAGE_AUDITS = 2;
let activePageAudits = 0;

export class PageAuditBusyError extends Error {
  readonly status = 503;
  constructor() {
    super("Server busy — too many page audits in progress. Try again shortly.");
  }
}

/**
 * The per-request SSRF decision: non-http(s) schemes and off-allowlist
 * document navigations are aborted by shouldAllowPageRequest; anything that
 * needs an IP check is resolved AFRESH on every request — the old per-page
 * cache marked a host public for the page's lifetime, which is exactly the
 * window a DNS-rebinding attack needs (2026-09-02). `isPublicHost` is
 * injectable for tests; production passes resolvePublicIp (every record).
 */
export function createRequestHandler(
  isUrlAllowed: (url: string) => boolean,
  isPublicHost: (host: string) => Promise<boolean>,
): (req: HTTPRequest) => Promise<void> {
  return async (req: HTTPRequest): Promise<void> => {
    try {
      const reqUrl = req.url();
      const isDocument = req.resourceType() === "document";
      // A service-worker SCRIPT fetch announces itself with this header.
      // Refuse it: an installed worker makes its own requests from a context
      // this interceptor never sees (see hardenPage).
      if (isServiceWorkerScriptRequest(req)) {
        await req.abort("blockedbyclient").catch(() => {});
        return;
      }
      const decision = shouldAllowPageRequest(reqUrl, isDocument, isUrlAllowed);
      if (!decision.allow) {
        await req.abort("blockedbyclient").catch(() => {});
        return;
      }
      if (decision.needsIpCheck) {
        const host = new URL(reqUrl).hostname;
        if (!(await isPublicHost(host))) {
          await req.abort("blockedbyclient").catch(() => {});
          return;
        }
      }
      await req.continue().catch(() => {});
    } catch {
      // Fail closed: anything unexpected aborts the request.
      await req.abort("blockedbyclient").catch(() => {});
    }
  };
}

function isServiceWorkerScriptRequest(req: HTTPRequest): boolean {
  try {
    const headers = typeof req.headers === "function" ? req.headers() : {};
    return String(headers?.["service-worker"] ?? "").toLowerCase() === "script";
  } catch {
    return false;
  }
}

/**
 * Runs in the audited page (and every frame) BEFORE any of its own script.
 * Removes the network APIs that do NOT pass through the request interceptor,
 * so the per-request SSRF decision above really is every request the page
 * can make from a document context:
 *
 *   WebSocket / WebSocketStream / WebTransport — never reach Fetch-domain
 *     interception at all; a page could open ws://10.0.0.5/ unchecked.
 *   RTCPeerConnection — ICE connectivity checks probe arbitrary addresses.
 *   SharedWorker — a separate target whose requests bypass page interception.
 *   navigator.serviceWorker.register — an installed worker fetches from its
 *     own context, outside the interceptor.
 *   window.open — a popup is a separate page with no interceptor on it.
 *
 * Each is replaced with a function that throws / rejects, which is how a
 * browser with the feature disabled by policy behaves; pages already handle
 * that. Self-contained on purpose — it is serialised into the page.
 *
 * A STRING, not a function: the API runs under tsx, whose esbuild transform
 * wraps named inner functions in a `__name(...)` helper that does not exist
 * inside the page — a serialised function would throw there on its first
 * line and silently harden nothing. Exported for tests.
 */
export const PAGE_HARDENING_SOURCE = `(() => {
  const g = globalThis;
  const names = ["WebSocket", "WebSocketStream", "WebTransport", "RTCPeerConnection",
    "webkitRTCPeerConnection", "SharedWorker"];
  for (const name of names) {
    try {
      Object.defineProperty(g, name, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: function () {
          throw new Error(name + " is disabled while this page is being audited");
        },
      });
    } catch (e) {}
  }
  try {
    // No popups: a new window is a new page target with NO request
    // interception on it. window.open returns null, as a popup blocker does.
    Object.defineProperty(g, "open", {
      configurable: false,
      writable: false,
      value: function () { return null; },
    });
  } catch (e) {}
  try {
    const container = g.navigator && g.navigator.serviceWorker;
    if (container) {
      Object.defineProperty(Object.getPrototypeOf(container), "register", {
        configurable: false,
        writable: false,
        value: function () {
          return Promise.reject(
            new Error("Service workers are disabled while this page is being audited"));
        },
      });
    }
  } catch (e) {}
})();`;

/**
 * Close the request-interception gaps for one audited page (review
 * 2026-11-12). Must run BEFORE navigation.
 *
 * RESIDUAL GAPS — known, not closed here:
 *   1. Sub-resource DNS. Only the DOCUMENT host is pinned into Chromium's
 *      resolver (chromiumLaunchArgs). A sub-resource host is resolved in Node
 *      for the private-address check and then resolved AGAIN by Chromium when
 *      it connects, so a name that answers public to the first lookup and
 *      private to the second (TTL-0 rebinding) can still be reached. The
 *      resolver pin is a launch flag and sub-resource hosts are not known at
 *      launch; closing this fully needs all browser traffic routed through a
 *      resolve-then-dial proxy in this process.
 *   2. Dedicated Workers (`new Worker(...)`) keep their own global scope, so
 *      the WebSocket removal above does not reach inside one. Blocking
 *      workers outright would change what legitimate pages render, and
 *      therefore what axe reports.
 *   3. A script could recover a removed constructor from a fresh same-origin
 *      realm it creates before this script runs there. evaluateOnNewDocument
 *      covers every frame Chromium creates, so this is believed closed, but
 *      it is defence by script, not by network policy.
 *   4. A popup opened by means other than window.open exists for a moment
 *      before denyPopups guards and closes it; a request issued in that
 *      moment is not intercepted.
 *   The audited page's own HTML is fetched only from an allowlisted (or, for
 *   the privileged tier, operator-chosen) host, which is what keeps these
 *   residual paths hard to reach: the attacker must first control content on
 *   such a host.
 */
export async function hardenPage(page: import("puppeteer").Page): Promise<void> {
  // Never let a service worker answer or issue this page's requests.
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(PAGE_HARDENING_SOURCE);
}

/**
 * Deny popups for the audited page (second pass). window.open is already
 * stubbed out by the hardening script; this is the network-side backstop for
 * any other way a second page can appear (a scripted click on a
 * target="_blank" link, a form with a target): the moment a page target that
 * is not the audited page exists, it gets the SAME request guard — so even a
 * request it manages to start before it is closed is judged like any other —
 * and is then closed.
 *
 * `guard` installs interception on a page (installRequestGuard in
 * production); injectable for tests.
 */
export function denyPopups(
  browser: Browser,
  audited: import("puppeteer").Page,
  guard: (page: import("puppeteer").Page) => Promise<void>,
): void {
  browser.on("targetcreated", (target) => {
    void (async () => {
      try {
        if (String(target.type()) !== "page") return;
        const popup = await target.page();
        if (!popup || popup === audited) return;
        await guard(popup).catch(() => {});
        await popup.close().catch(() => {});
      } catch {
        // best effort
      }
    })();
  });
}

/** Target types whose network activity the page interceptor cannot see. */
const UNINTERCEPTED_TARGETS = new Set(["service_worker", "shared_worker"]);

/**
 * Belt and braces behind hardenPage: if a service worker or shared worker
 * target appears anyway, close it.
 */
export function closeUninterceptedTargets(browser: Browser): void {
  browser.on("targetcreated", (target) => {
    try {
      if (!UNINTERCEPTED_TARGETS.has(String(target.type()))) return;
      void target
        .worker()
        .then((w) => w?.close())
        .catch(() => {});
    } catch {
      // best effort
    }
  });
}

const isPublicHostViaNode = (host: string): Promise<boolean> =>
  resolvePublicIp(host).then(
    () => true,
    () => false, // resolvePublicIp throws on private/reserved or DNS failure
  );

async function installRequestGuard(
  page: import("puppeteer").Page,
  isUrlAllowed: (url: string) => boolean,
): Promise<void> {
  await page.setRequestInterception(true);
  const handler = createRequestHandler(isUrlAllowed, isPublicHostViaNode);
  page.on("request", (req: HTTPRequest) => {
    void handler(req);
  });
}

export async function auditPage(
  url: string,
  isUrlAllowed: (url: string) => boolean,
): Promise<PageAuditResult> {
  if (activePageAudits >= MAX_CONCURRENT_PAGE_AUDITS) {
    throw new PageAuditBusyError();
  }
  activePageAudits++;
  let browser: Browser | null = null;
  let page: import("puppeteer").Page | null = null;
  try {
    // Resolve and validate the document host in Node (every record), then
    // pin that exact address into Chromium's resolver for this audit.
    const host = new URL(url).hostname;
    const ip = await resolvePublicIp(host);
    browser = await launchPinnedBrowser({ host, ip });
    closeUninterceptedTargets(browser);
    page = await browser.newPage();
    // Before any navigation: remove the network APIs that bypass the
    // interceptor (WebSockets, service workers, …), then install it.
    await hardenPage(page);
    await installRequestGuard(page, isUrlAllowed);
    denyPopups(browser, page, (popup) => installRequestGuard(popup, isUrlAllowed));
    await page.setUserAgent("Mozilla/5.0 (compatible; ICJIA-File-Audit/audit.icjia.app)");
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: PAGE_NAV_TIMEOUT_MS,
    });
    // Most ICJIA sites are SPAs (Strapi+Nuxt, vue-cli). networkidle2 fires
    // before Vue hydration completes — give the framework a moment to
    // render the actual content before axe-core scans the DOM.
    await new Promise((r) => setTimeout(r, HYDRATION_WAIT_MS));

    const pageTitle = await page.title().catch(() => null);
    const results = await new AxePuppeteer(page).analyze();

    const { score, bySeverity } = computeScore(results.violations);
    const grade = gradeFromScore(score);

    const violations = results.violations.slice(0, MAX_VIOLATIONS_PERSISTED).map(slimIssue);
    const incomplete = (results.incomplete ?? []).slice(0, MAX_VIOLATIONS_PERSISTED).map(slimIssue);

    return {
      url,
      pageTitle,
      audited: new Date().toISOString(),
      score,
      grade,
      violationCount: results.violations.length,
      bySeverity,
      violations,
      incomplete,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) {
      activeBrowsers.delete(browser);
      await browser.close().catch(() => {});
    }
    activePageAudits--;
  }
}

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

import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer'
import { AxePuppeteer } from '@axe-core/puppeteer'
import { resolvePublicIp } from './safeFetch.js'
import { shouldAllowPageRequest } from './pageAuditGuard.js'

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // --no-sandbox is required for many container / CI environments
      // (incl. typical PM2 deploys on Linux, where Chromium refuses to run
      // as root with the sandbox on). The SSRF control for this endpoint is
      // NOT the sandbox and is NOT safeFetch (Chromium does its own DNS and
      // redirects) — it is the per-request interceptor installed in
      // auditPage() below, which blocks non-http(s) schemes, resolves and
      // rejects private/reserved IPs on every request, and keeps document
      // navigations on the allowlist. See pageAuditGuard.ts.
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    }).catch((err) => {
      // If launch fails (missing system libs, OOM, etc.), clear the cached
      // promise so the NEXT request retries instead of being permanently
      // poisoned. Without this, a transient launch failure (e.g. fixed by
      // apt installing libatk-1.0.so.0 after the first request) requires a
      // pm2 restart to recover.
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

// Public shutdown for tests / graceful pm2 shutdown.
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise
    browserPromise = null
    await b.close().catch(() => {})
  }
}

export interface PageAuditViolationSummary {
  id: string
  impact: string | null
  description: string
  helpUrl: string
  nodes: number
}

export interface PageAuditResult {
  url: string
  pageTitle: string | null
  audited: string
  score: number
  grade: string
  violationCount: number
  bySeverity: {
    critical: number
    serious: number
    moderate: number
    minor: number
  }
  // Top-N violations summarised. Full per-node detail is intentionally
  // omitted from the persisted JSON to keep shared_reports rows small;
  // the report URL surfaces a deeper view if needed.
  violations: PageAuditViolationSummary[]
}

const SEVERITY_WEIGHTS = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
} as const

type Severity = keyof typeof SEVERITY_WEIGHTS

function isSeverity(s: string): s is Severity {
  return s === 'critical' || s === 'serious' || s === 'moderate' || s === 'minor'
}

function computeScore(violations: Array<{ impact?: string | null; nodes?: unknown[] }>) {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  let penalty = 0
  for (const v of violations) {
    const raw = (v.impact ?? 'minor').toLowerCase()
    const impact: Severity = isSeverity(raw) ? raw : 'minor'
    const nodeCount = Array.isArray(v.nodes) ? Math.max(1, v.nodes.length) : 1
    penalty += SEVERITY_WEIGHTS[impact] * nodeCount
    bySeverity[impact] += nodeCount
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)))
  return { score, bySeverity }
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

const PAGE_NAV_TIMEOUT_MS = 30_000
const HYDRATION_WAIT_MS = 2_000
const MAX_VIOLATIONS_PERSISTED = 50

// Bound concurrent headless-Chromium page renders. Each render opens a tab,
// navigates with a 30s budget, waits for hydration, and runs axe-core (~32s),
// holding memory the whole time. Without a cap, a burst of page-audit
// requests would spawn unbounded tabs and exhaust the box. Excess callers get
// a busy error (mapped to 503 by the route) rather than queueing forever.
const MAX_CONCURRENT_PAGE_AUDITS = 2
let activePageAudits = 0

export class PageAuditBusyError extends Error {
  readonly status = 503
  constructor() {
    super('Server busy — too many page audits in progress. Try again shortly.')
  }
}

// Install the SSRF interceptor on a page: every request (main navigation,
// redirects, subresources) is classified by shouldAllowPageRequest, and any
// http(s) request whose host resolves to a private/reserved IP is aborted.
// Per-page resolution cache avoids re-resolving the same host repeatedly.
async function installRequestGuard(
  page: import('puppeteer').Page,
  isUrlAllowed: (url: string) => boolean,
): Promise<void> {
  await page.setRequestInterception(true)
  const resolveCache = new Map<string, Promise<boolean>>() // host → isPublic

  const isPublicHost = (host: string): Promise<boolean> => {
    let cached = resolveCache.get(host)
    if (!cached) {
      cached = resolvePublicIp(host).then(
        () => true,
        () => false, // resolvePublicIp throws on private/reserved or DNS failure
      )
      resolveCache.set(host, cached)
    }
    return cached
  }

  page.on('request', (req: HTTPRequest) => {
    void (async () => {
      try {
        const reqUrl = req.url()
        const isDocument = req.resourceType() === 'document'
        const decision = shouldAllowPageRequest(reqUrl, isDocument, isUrlAllowed)
        if (!decision.allow) {
          await req.abort('blockedbyclient').catch(() => {})
          return
        }
        if (decision.needsIpCheck) {
          const host = new URL(reqUrl).hostname
          if (!(await isPublicHost(host))) {
            await req.abort('blockedbyclient').catch(() => {})
            return
          }
        }
        await req.continue().catch(() => {})
      } catch {
        // Fail closed: anything unexpected aborts the request.
        await req.abort('blockedbyclient').catch(() => {})
      }
    })()
  })
}

export async function auditPage(
  url: string,
  isUrlAllowed: (url: string) => boolean,
): Promise<PageAuditResult> {
  if (activePageAudits >= MAX_CONCURRENT_PAGE_AUDITS) {
    throw new PageAuditBusyError()
  }
  activePageAudits++
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await installRequestGuard(page, isUrlAllowed)
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; ICJIA-File-Audit/audit.icjia.app)',
    )
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PAGE_NAV_TIMEOUT_MS,
    })
    // Most ICJIA sites are SPAs (Strapi+Nuxt, vue-cli). networkidle2 fires
    // before Vue hydration completes — give the framework a moment to
    // render the actual content before axe-core scans the DOM.
    await new Promise((r) => setTimeout(r, HYDRATION_WAIT_MS))

    const pageTitle = await page.title().catch(() => null)
    const results = await new AxePuppeteer(page).analyze()

    const { score, bySeverity } = computeScore(results.violations)
    const grade = gradeFromScore(score)

    const violations = results.violations
      .slice(0, MAX_VIOLATIONS_PERSISTED)
      .map((v: any): PageAuditViolationSummary => ({
        id: String(v.id ?? ''),
        impact: typeof v.impact === 'string' ? v.impact : null,
        description: String(v.description ?? ''),
        helpUrl: String(v.helpUrl ?? ''),
        nodes: Array.isArray(v.nodes) ? v.nodes.length : 0,
      }))

    return {
      url,
      pageTitle,
      audited: new Date().toISOString(),
      score,
      grade,
      violationCount: results.violations.length,
      bySeverity,
      violations,
    }
  } finally {
    await page.close().catch(() => {})
    activePageAudits--
  }
}

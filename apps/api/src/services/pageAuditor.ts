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

import puppeteer, { type Browser } from 'puppeteer'
import { AxePuppeteer } from '@axe-core/puppeteer'

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // --no-sandbox is required for many container / CI environments
      // (incl. typical PM2 deploys on Linux). audit.icjia.app's threat
      // model already gates the page-audit endpoint behind safeFetch's
      // URL allowlist + SSRF block, so the loss of the Chromium sandbox
      // is a localised concern.
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
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

export async function auditPage(url: string): Promise<PageAuditResult> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
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
  }
}

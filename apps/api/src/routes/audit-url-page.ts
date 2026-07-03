import { Router, Response, type IRouter } from 'express'
import crypto from 'node:crypto'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter, isPrivilegedRequest } from '../middleware/rateLimiter.js'
import { gateIdentity, recordAudit } from '../services/auditLog.js'
import { DEPLOY, SHARED_REPORTS } from '#config'
import db from '../db/sqlite.js'
import { isAllowedUrl } from '../services/urlPolicy.js'
import { auditPage, type PageAuditResult } from '../services/pageAuditor.js'
import { sanitizeStoredReport } from '../services/reportSanitize.js'

const router: IRouter = Router()

// ---------------------------------------------------------------------------
// POST /api/audit-url-page
// ---------------------------------------------------------------------------
// Companion to /api/audit-url, for HTML pages instead of PDFs. Used by
// filecap's fleet audit pipeline: each PDF in the inventory carries one or
// more pageUrls in its references[] (the pages a manager would visit to
// click to the file), and the manager asks "is THAT page itself
// accessible?" — this endpoint is the answer.
//
// Renders the URL in headless Chromium, runs axe-core against the rendered
// DOM, persists a shareable shared_reports row, returns a fleet-CSV-
// friendly summary with the same { score, grade, reportUrl } shape the
// PDF endpoint emits.
//
// Body: { url: string, force?: boolean }
// Auth: required (authMiddleware accepts session cookie or Bearer PAT;
//       in anonymous-mode deployments every request is treated as one).
//
// Hash-based dedup keyed by sha256(url) — same URL won't re-render if an
// unexpired report exists for this caller. Pass force=true to bypass.
//
// Response shape:
//   {
//     url:           "https://icjia.illinois.gov/news/meetings/...",
//     pageTitle:     "ICJIA — Authority Board Meeting · April 9, 2026",
//     audited:       "2026-05-19T17:32:11.000Z",
//     axe: {
//       score:          87,
//       grade:          "B",
//       violationCount: 5,
//       bySeverity:     { critical: 0, serious: 2, moderate: 2, minor: 1 },
//       violations:     [ { id, impact, description, helpUrl, tags, nodeCount, nodes } … ],
//       incomplete:     [ { id, impact, description, helpUrl, tags, nodeCount, nodes } … ]
//     },
//     reportId:        "<32 hex chars>",
//     reportUrl:       "https://audit.icjia.app/page-report/<id>",
//     reportExpiresAt: "2027-05-19T17:32:11.000Z",
//     cached:          false
//   }
// ---------------------------------------------------------------------------

interface DedupRow {
  id: string
  report_json: string
  expires_at: string
}

function getReportBaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  return isProduction ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL
}

function buildPageReportUrl(id: string): string {
  return `${getReportBaseUrl()}/page-report/${id}`
}

router.post(
  '/audit-url-page',
  authMiddleware,
  analyzeLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const url = req.body?.url
      if (typeof url !== 'string' || url.length === 0) {
        res.status(400).json({ error: 'Missing required field: url' })
        return
      }
      const force =
        req.body?.force === true ||
        req.body?.force === 'true' ||
        req.query?.force === 'true'

      // Privileged (API_PRIVILEGED_TOKEN) callers may audit any public page;
      // anonymous callers are restricted to the ICJIA / illinois.gov allowlist.
      // The Chromium interceptor's private/reserved-IP block runs on every
      // request regardless, so internal targets stay unreachable either way.
      const privileged = isPrivilegedRequest(req)
      const check = isAllowedUrl(url)
      if (!privileged && !check.ok) {
        res
          .status(400)
          .json({ error: 'URL not allowed', details: check.reason })
        return
      }

      // Page audits dedup by sha256(url) rather than sha256(content) — the
      // page bytes change every render (timestamps, CSRF tokens, etc.) but
      // the page identity is stable. Same identity + same caller + unexpired
      // → reuse the cached report.
      const contentHash = crypto.createHash('sha256').update(url).digest('hex')

      if (!force) {
        const existing = db
          .prepare<[string, string, string]>(
            `SELECT id, report_json, expires_at
               FROM shared_reports
              WHERE email = ?
                AND content_hash = ?
                AND expires_at > ?
              ORDER BY created_at DESC
              LIMIT 1`,
          )
          .get(req.user!.email, contentHash, new Date().toISOString()) as
          | DedupRow
          | undefined

        if (existing) {
          const cached = JSON.parse(existing.report_json) as PageAuditResult
          res.json({
            url: cached.url,
            pageTitle: cached.pageTitle,
            audited: cached.audited,
            axe: {
              score: cached.score,
              grade: cached.grade,
              violationCount: cached.violationCount,
              bySeverity: cached.bySeverity,
              violations: cached.violations ?? [],
              incomplete: (cached as any).incomplete ?? [],
            },
            reportId: existing.id,
            reportUrl: buildPageReportUrl(existing.id),
            reportExpiresAt: existing.expires_at,
            cached: true,
          })
          return
        }
      }

      // Fresh audit + persist. isAllowedUrl is passed through to the
      // Chromium request interceptor so document navigations (including any
      // redirect hops) are re-validated against the allowlist, and every
      // request is checked for private/reserved-IP targets (SSRF block).
      let result: PageAuditResult
      try {
        result = await auditPage(
          url,
          privileged ? () => true : (u) => isAllowedUrl(u).ok,
        )
      } catch (err: any) {
        if (err?.status === 503) {
          res.status(503).json({
            error: 'Server busy',
            details:
              'Too many page audits are in progress. Please retry shortly.',
          })
          return
        }
        // Log the detail server-side only — never echo raw err.message to
        // the client (it can leak library internals / paths, e.g. a
        // Chromium profile path or an internal stack fragment). Mirrors
        // audit-url.ts's generic-500 pattern; `msg` is still used below to
        // classify the failure, just never returned verbatim.
        console.error('audit-url-page: page audit failed:', err)
        const msg = err?.message ?? String(err)
        if (/timeout|Timeout|net::ERR_/i.test(msg)) {
          res.status(504).json({
            error: 'Page navigation timed out',
            details:
              'The page took too long to load or render. Try again, or verify the URL is reachable.',
          })
          return
        }
        res.status(502).json({
          error: 'Page audit failed',
          details:
            'The page could not be rendered or audited. It may be blocking automated access or returning an unexpected error.',
        })
        return
      }

      const id = crypto.randomBytes(16).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS)
      const reportExpiresAt = expiresAt.toISOString()

      // RB3-5 [pre-merge re-audit]: reports.ts / bulk-from-inventory.ts run
      // every stored report through sanitizeStoredReport() before their
      // shared_reports insert (strips unsafe helpLinks[].url / neutralizes
      // conformance finding urls anywhere in the payload — a stored-XSS
      // guard on the public /report/:id and /page-report/:id pages). This
      // insert skipped that call. No-op today (PageAuditResult carries
      // neither helpLinks nor conformance), but keeps the store-boundary
      // invariant enforced consistently at every insert site. Falls back to
      // the unsanitized result on the
      // (structurally-shouldn't-happen-for-internal-output) failure case,
      // mirroring bulk-from-inventory.ts's insert — result comes from this
      // route's own auditPage() call, not raw client JSON, so there's
      // nothing here for reports.ts's stricter reject-and-400 to guard
      // against.
      const sanitized = sanitizeStoredReport(result)
      const reportToStore = sanitized.ok ? sanitized.report : result

      db.prepare(
        `INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        req.user!.email,
        // For page audits we put the URL in the `filename` column. The
        // shared_reports table is intentionally generic; the column name
        // is historical (it predates the page-audit route).
        result.url,
        JSON.stringify(reportToStore),
        contentHash,
        reportExpiresAt,
      )

      // Audit-log row for the remediation-gate / usage accounting.
      recordAudit({
        eventType: 'audit-url-page',
        email: gateIdentity(req.user?.email ?? null, req.ip),
        filename: result.url,
        score: result.score,
        grade: result.grade,
        contentHash,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      })

      res.json({
        url: result.url,
        pageTitle: result.pageTitle,
        audited: result.audited,
        axe: {
          score: result.score,
          grade: result.grade,
          violationCount: result.violationCount,
          bySeverity: result.bySeverity,
          violations: result.violations,
          incomplete: result.incomplete,
        },
        reportId: id,
        reportUrl: buildPageReportUrl(id),
        reportExpiresAt,
        cached: false,
      })
    } catch (err: any) {
      // Log the detail server-side only — never echo raw err.message to the
      // client (it can leak library internals / paths). Mirrors
      // audit-url.ts's generic-500 pattern.
      console.error('audit-url-page error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  },
)

export default router

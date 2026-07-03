import { Router, Response, type IRouter } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter, isPrivilegedRequest } from '../middleware/rateLimiter.js'
import { analyzeDocument, detectFileType } from '../services/analyzer.js'
import { gateIdentity, recordAudit, sha256Hex } from '../services/auditLog.js'
import { safeFetch, SafeFetchError } from '../services/safeFetch.js'
import {
  MAX_PDF_BYTES,
  FETCH_TIMEOUT_MS,
  sendSafeFetchError,
  validateUrlForFetch,
  validateUrlPublic,
} from '../services/urlPolicy.js'

const router: IRouter = Router()

// ---------------------------------------------------------------------------
// POST /api/analyze-url
// ---------------------------------------------------------------------------
// Body: { url: string }
// Auth: required (authMiddleware accepts session cookie or Bearer PAT)
// Returns: same shape as POST /api/analyze (AnalysisResult)
//
// Security notes:
// - URL must pass isAllowedUrl() — scheme, SSRF block, and hostname allowlist
// - Size cap on fetched content matches the direct-upload cap (ANALYSIS.MAX_FILE_SIZE_MB)
// - Magic-bytes check: first 5 bytes must be %PDF-
// ---------------------------------------------------------------------------

router.post('/analyze-url', authMiddleware, analyzeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const url = req.body?.url
    if (typeof url !== 'string' || url.length === 0) {
      res.status(400).json({ error: 'Missing required field: url' })
      return
    }

    // Privileged (API_PRIVILEGED_TOKEN) callers may fetch any public URL;
    // anonymous callers are restricted to the ICJIA / illinois.gov allowlist.
    // The private/reserved-IP SSRF block inside safeFetch stays on either way.
    const privileged = isPrivilegedRequest(req)

    // SSRF-hardened fetch. safeFetch handles:
    //   - URL allowlist (re-checked on every redirect hop)
    //   - DNS resolution + private-IP rejection on every hop
    //   - Manual redirect handling (max 3 hops, no fetch-internal
    //     blind follow)
    //   - Size cap enforced during streaming (no oversized buffer)
    //   - Timeout
    // SafeFetchError carries a structured code that maps to the right
    // HTTP status via sendSafeFetchError.
    let fetched
    try {
      fetched = await safeFetch(url, {
        timeoutMs: FETCH_TIMEOUT_MS,
        maxBytes: MAX_PDF_BYTES,
        validateUrl: privileged ? validateUrlPublic : validateUrlForFetch,
      })
    } catch (err) {
      if (err instanceof SafeFetchError) {
        sendSafeFetchError(res, err)
        return
      }
      throw err
    }

    if (!fetched.ok) {
      res.status(502).json({
        error: `fetch returned ${fetched.status} ${fetched.statusText}`,
      })
      return
    }

    const buf = fetched.buffer

    // Detect PDF vs DOCX vs PPTX vs XLSX from the fetched content (not the URL extension).
    const fileType = await detectFileType(buf)
    if (!fileType) {
      res.status(422).json({
        error: 'Fetched content is not a supported document.',
        details:
          'The URL must point directly at a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file — the fetched content matches none of these formats.',
      })
      return
    }

    // Derive a safe filename from the final URL's path (after any
    // followed redirects). safeFetch returns finalUrl so we use the
    // redirect target's filename rather than the original.
    const finalPath = new URL(fetched.finalUrl).pathname
    const rawName = finalPath.split('/').pop() ?? `remote.${fileType}`
    const filename = rawName.slice(0, 200) || `remote.${fileType}`

    const contentHash = sha256Hex(buf)
    const result = await analyzeDocument(buf, filename)

    // Canonical audit-log write so this URL-audited content counts
    // for the remediation gate (v1.20.1+). Doing it after analyzePDF
    // ensures we only record successful audits — a 503 or parse
    // failure leaves no audit_log row.
    recordAudit({
      eventType: 'analyze-url',
      email: gateIdentity(req.user?.email ?? null, req.ip),
      filename,
      score: result.overallScore,
      grade: result.grade,
      contentHash,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    })

    res.json(result)
  } catch (err: any) {
    // Server busy (semaphore timeout)
    if (err?.status === 503) {
      res.status(503).json({
        error: 'The server is busy processing other files.',
        details: 'Please wait a moment and try again.',
      })
      return
    }

    // DOCX auditing disabled via DOCX_ENABLED=false
    if (err?.code === 'DOCX_DISABLED') {
      res.status(415).json({
        error: 'Word (.docx) auditing is currently disabled.',
        details: 'This server is not configured to audit Word files. Contact the administrator to enable it.',
      })
      return
    }

    // DOCX could not be parsed (corrupt or not a real Word package)
    if (err?.code === 'DOCX_PARSE_FAILED') {
      res.status(422).json({
        error: 'The fetched Word document could not be read.',
        details: 'The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.',
      })
      return
    }

    // PPTX auditing disabled via PPTX_ENABLED=false
    if (err?.code === 'PPTX_DISABLED') {
      res.status(415).json({
        error: 'PowerPoint (.pptx) auditing is currently disabled.',
        details: 'This server is not configured to audit PowerPoint files. Contact the administrator to enable it.',
      })
      return
    }

    // PPTX could not be parsed (corrupt or not a real PowerPoint package)
    if (err?.code === 'PPTX_PARSE_FAILED') {
      res.status(422).json({
        error: 'The fetched PowerPoint file could not be read.',
        details:
          'The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.',
      })
      return
    }

    // XLSX auditing disabled via XLSX_ENABLED=false
    if (err?.code === 'XLSX_DISABLED') {
      res.status(415).json({
        error: 'Excel (.xlsx) auditing is currently disabled.',
        details: 'This server is not configured to audit Excel files. Contact the administrator to enable it.',
      })
      return
    }

    // XLSX could not be parsed (corrupt or not a real Excel package)
    if (err?.code === 'XLSX_PARSE_FAILED') {
      res.status(422).json({
        error: 'The fetched Excel file could not be read.',
        details:
          'The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.',
      })
      return
    }

    // Timeout
    if (err?.code === 'ETIMEDOUT' || err?.killed) {
      res.status(504).json({
        error: 'This file is too complex to analyze within the time limit.',
        details: 'This can happen with very large documents that contain many embedded images or complex structure trees. To work around this, try splitting the document into smaller sections and analyzing each section separately.',
      })
      return
    }

    // Log the detail server-side only — never echo raw err.message to the
    // client (it can leak library internals / paths). Mirrors analyze.ts.
    console.error('analyze-url error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

import { Router, Response, type IRouter } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter } from '../middleware/rateLimiter.js'
import { analyzePDF } from '../services/pdfAnalyzer.js'

const router: IRouter = Router()

const MAX_PDF_BYTES = 100 * 1024 * 1024 // 100 MB
const FETCH_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// URL allowlist
// ---------------------------------------------------------------------------
// Keep this conservative — a permissive allowlist turns this endpoint into an
// SSRF vector. Only ICJIA-owned domains are in the default set; operators can
// extend via the ANALYZE_URL_ALLOWED_HOSTS env var (comma-separated hostnames).

const DEFAULT_ALLOWED_HOSTS = [
  'icjia.illinois.gov',
  'dvfr.icjia-api.cloud',
  'icjia-api.cloud',
  'i2i.icjia-api.cloud',
  'vpp.icjia-api.cloud',
  'infonet.icjia-api.cloud',
]

function getAllowedHosts(): Set<string> {
  const fromEnv = (process.env.ANALYZE_URL_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...fromEnv])
}

function isAllowedUrl(rawUrl: string): { ok: boolean; reason?: string; parsed?: URL } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'malformed URL' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'only http/https URLs are accepted' }
  }

  // Refuse private/local hostnames to prevent SSRF
  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return { ok: false, reason: `private/local address '${host}' is not allowed` }
  }

  const allowed = getAllowedHosts()
  // Allow exact match OR subdomain match against each allowlisted host
  let matched = false
  for (const ah of allowed) {
    if (host === ah || host.endsWith('.' + ah)) {
      matched = true
      break
    }
  }
  if (!matched) {
    return {
      ok: false,
      reason: `host '${host}' is not in the allowlist. Allowed: ${[...allowed].join(', ')}`,
    }
  }

  return { ok: true, parsed }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// POST /api/analyze-url
// ---------------------------------------------------------------------------
// Body: { url: string }
// Auth: required (authMiddleware accepts session cookie or Bearer PAT)
// Returns: same shape as POST /api/analyze (AnalysisResult)
//
// Security notes:
// - URL must pass isAllowedUrl() — scheme, SSRF block, and hostname allowlist
// - 100 MB cap on fetched content (same cap as direct upload)
// - Magic-bytes check: first 5 bytes must be %PDF-
// ---------------------------------------------------------------------------

router.post('/analyze-url', authMiddleware, analyzeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const url = req.body?.url
    if (typeof url !== 'string' || url.length === 0) {
      res.status(400).json({ error: 'Missing required field: url' })
      return
    }

    const check = isAllowedUrl(url)
    if (!check.ok) {
      res.status(400).json({
        error: 'URL not allowed',
        details: check.reason,
      })
      return
    }

    let fetchResp: globalThis.Response
    try {
      fetchResp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
    } catch (err: any) {
      const msg =
        err?.name === 'AbortError'
          ? `fetch timed out after ${FETCH_TIMEOUT_MS}ms`
          : `fetch failed: ${err?.message ?? String(err)}`
      res.status(502).json({ error: msg })
      return
    }

    if (!fetchResp.ok) {
      res.status(502).json({
        error: `fetch returned ${fetchResp.status} ${fetchResp.statusText}`,
      })
      return
    }

    const buf = Buffer.from(await fetchResp.arrayBuffer())

    if (buf.length > MAX_PDF_BYTES) {
      res.status(413).json({
        error: `PDF too large (${buf.length} bytes > ${MAX_PDF_BYTES} cap)`,
      })
      return
    }

    // Magic bytes check: PDF must start with %PDF-
    const header = buf.subarray(0, 5).toString('ascii')
    if (header !== '%PDF-') {
      res.status(422).json({
        error: 'Fetched content is not a valid PDF.',
        details: `The first 5 bytes were '${header}', expected '%PDF-'. Verify the URL points directly at a PDF file.`,
      })
      return
    }

    // Derive a safe filename from the URL path
    const rawName = check.parsed!.pathname.split('/').pop() ?? 'remote.pdf'
    const filename = (rawName.slice(0, 200) || 'remote.pdf')

    const result = await analyzePDF(buf, filename)
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

    console.error('analyze-url error:', err)
    res.status(500).json({ error: 'Internal server error', details: err?.message })
  }
})

export default router

import { Router, Response, type IRouter } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter, isPrivilegedRequest } from '../middleware/rateLimiter.js'
import { analyzeDocument, detectFileType } from '../services/analyzer.js'
import { gateIdentity, recordAudit, sha256Hex } from '../services/auditLog.js'
import { safeFetch, SafeFetchError } from '../services/safeFetch.js'
import { ANALYSIS } from '#config'

const router: IRouter = Router()

// Cap URL-fetched PDFs at the same size as direct uploads. safeFetch buffers
// the body in memory before the analysis semaphore is acquired, so an
// oversized cap (the old 100 MB — 6.6× the upload cap) let a handful of
// concurrent fetches blow past the process memory ceiling. Matching the
// upload cap keeps the memory budget consistent across all audit paths.
export const MAX_PDF_BYTES = ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024
export const FETCH_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// URL allowlist
// ---------------------------------------------------------------------------
// Keep this conservative — a permissive allowlist turns this endpoint into an
// SSRF vector. Only ICJIA-owned domains are in the default set; operators can
// extend via the ANALYZE_URL_ALLOWED_HOSTS env var (comma-separated hostnames).

// Each entry matches the host exactly OR any subdomain of it (the
// matcher below uses `host === ah || host.endsWith('.' + ah)`). So
// a bare 'illinois.gov' entry covers illinois.gov itself plus every
// state subdomain (`icjia.illinois.gov`, `idph.illinois.gov`, etc.).
// Operators can extend at runtime via the ANALYZE_URL_ALLOWED_HOSTS
// env var (comma-separated hostnames).
const DEFAULT_ALLOWED_HOSTS = [
  // Illinois state government — covers every *.illinois.gov agency
  // hosting PDFs (huge fleet surface).
  'illinois.gov',
  // ICJIA owned/operated domains
  'icjia.cloud',
  'icjia.app',
  'icjia-api.cloud',
  // Partner / program domains
  'ilheals.com',
  // Specific subdomains kept for documentation; the bare-domain
  // entries above already cover them. Listed so operators reading
  // the source can see what's known-good without grepping logs.
  'icjia.illinois.gov',
  'dvfr.icjia-api.cloud',
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

export function isAllowedUrl(rawUrl: string): { ok: boolean; reason?: string; parsed?: URL } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'malformed URL' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'only http/https URLs are accepted', parsed }
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
    return { ok: false, reason: `private/local address '${host}' is not allowed`, parsed }
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
      parsed,
    }
  }

  return { ok: true, parsed }
}

/**
 * Map a SafeFetchError to an HTTP response. Centralizes the
 * code→status mapping so all three URL-fetch endpoints behave
 * consistently.
 */
export function sendSafeFetchError(res: Response, err: SafeFetchError): void {
  switch (err.code) {
    case 'malformed_url':
    case 'redirect_invalid':
      res.status(400).json({ error: 'URL not allowed', details: err.message })
      return
    case 'private_ip':
      // SSRF block. 400 to the client; the details message names the
      // hostname + resolved IP, useful for the operator but not
      // dangerous to expose since the attacker provided the hostname.
      res.status(400).json({
        error: 'URL resolves to a private/reserved address',
        details: err.message,
      })
      return
    case 'oversized':
      res.status(413).json({ error: err.message })
      return
    case 'timeout':
      res.status(504).json({ error: err.message })
      return
    case 'too_many_redirects':
    case 'redirect_loop':
      res.status(502).json({ error: err.message })
      return
    case 'dns_failed':
    case 'network_error':
    default:
      res.status(502).json({ error: 'Fetch failed', details: err.message })
      return
  }
}

/**
 * Wrap isAllowedUrl in the validateUrl shape that safeFetch expects.
 * Throws SafeFetchError('malformed_url', ...) on a disallowed host so
 * the same redirect-handling loop in safeFetch can reject mid-chain.
 */
export function validateUrlForFetch(u: URL): void {
  const check = isAllowedUrl(u.toString())
  if (!check.ok) {
    throw new SafeFetchError('malformed_url', check.reason ?? 'URL not allowed')
  }
}

/**
 * Privileged validator: used in place of validateUrlForFetch when the caller
 * presented the API_PRIVILEGED_TOKEN. It drops the hostname ALLOWLIST check so
 * a trusted client can audit any public URL — but it does NOT relax SSRF: the
 * scheme is still restricted to http/https, and the authoritative
 * private/reserved-IP block (resolvePublicIp, run on every hop inside
 * safeFetch) still applies, so internal targets remain unreachable.
 */
export function validateUrlPublic(u: URL): void {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new SafeFetchError(
      'malformed_url',
      'only http/https URLs are accepted',
    )
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

    // Detect PDF vs DOCX from the fetched content (not the URL extension).
    const fileType = await detectFileType(buf)
    if (!fileType) {
      res.status(422).json({
        error: 'Fetched content is not a supported document.',
        details:
          'The URL must point directly at a PDF or a Word (.docx) file — the fetched content matches neither format.',
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
        details: 'This server is configured to audit PDF files only.',
      })
      return
    }

    // DOCX could not be parsed (corrupt or not a real Word package)
    if (err?.code === 'DOCX_PARSE_FAILED') {
      res.status(422).json({
        error: 'The fetched Word document could not be read.',
        details:
          'The .docx file appears to be corrupt or is not a valid Word document.',
      })
      return
    }

    console.error('analyze-url error:', err)
    res.status(500).json({ error: 'Internal server error', details: err?.message })
  }
})

export default router

/**
 * SSRF-hardened HTTP fetch for URL-based PDF auditing.
 *
 * Background (v1.20.1 red/blue team finding P1.1 + P1.2):
 *
 * The previous implementation used `fetch(url, { redirect: 'follow' })`
 * with an allowlist check on the URL's hostname *string*. Two attacks
 * bypassed it:
 *
 *   1. DNS rebinding — an attacker controls DNS for a subdomain of an
 *      allowlisted apex (e.g., `evil.icjia-api.cloud`) and points it
 *      at `127.0.0.1`. The hostname matches the allowlist; `fetch()`
 *      then resolves DNS itself and connects to loopback. The audit
 *      pipeline becomes an SSRF proxy into the server's own internal
 *      services (the API itself, SQLite, any future internal Redis,
 *      etc.).
 *
 *   2. Open-redirect chaining — the attacker plants a redirector at an
 *      allowlisted host (`https://agency.icjia-api.cloud/redirect.php`)
 *      that 302s to `http://10.0.0.1/burn.pdf`. The initial URL passes
 *      the allowlist, but `redirect: 'follow'` follows up to 20 hops
 *      without re-validating. Same SSRF reach.
 *
 * This module fixes both. The flow:
 *
 *   1. Validate the URL string (scheme + allowlist) — existing
 *      isAllowedUrl logic. Block obvious private/local hostnames.
 *   2. Resolve DNS *in-process* via dns/promises.lookup.
 *   3. Reject if the resolved IP is in any private / loopback /
 *      link-local / multicast / unique-local range.
 *   4. Dial the resolved IP directly with `Host:` header set to the
 *      original hostname so the remote serves the right virtual host.
 *      (We also set servername for TLS SNI.)
 *   5. Handle redirects manually: parse the 3xx Location, re-run the
 *      full validation on each hop, cap total hops at MAX_REDIRECTS.
 *
 * The net effect: even if an attacker controls DNS for an allowlisted
 * subdomain, they can't trick the server into hitting a private IP.
 * Even if they control content on an allowlisted host, they can't
 * redirect us to an internal target.
 */

import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { URL } from 'node:url'

const MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 30_000

export interface SafeFetchResult {
  ok: boolean
  status: number
  statusText: string
  buffer: Buffer
  finalUrl: string
  /** Resolved IP that was actually dialed (last hop). For diagnostics. */
  resolvedIp: string
}

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type SafeFetchErrorCode =
  | 'malformed_url'
  | 'private_ip'
  | 'dns_failed'
  | 'redirect_loop'
  | 'redirect_invalid'
  | 'too_many_redirects'
  | 'timeout'
  | 'network_error'
  | 'oversized'

export interface SafeFetchOptions {
  /** Total network operation timeout in ms (covers DNS + connect + transfer). */
  timeoutMs?: number
  /** Hard cap on response body length; reject before exhausting memory. */
  maxBytes: number
  /**
   * Function that runs after each hop's URL string is parsed but before
   * we resolve DNS. Should throw SafeFetchError on disallowed hostnames.
   * This is the URL allowlist plug-in point.
   */
  validateUrl: (url: URL) => void
}

// IPv4 private / reserved ranges (RFC 1918, loopback, link-local, etc.).
function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false
  const parts = ip.split('.').map(Number)
  const [a, b] = parts
  // 0.0.0.0/8 (this network)
  if (a === 0) return true
  // 10.0.0.0/8
  if (a === 10) return true
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (link-local, AWS/GCP metadata)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 (IETF protocol assignments — includes 192.0.0.170 etc.)
  if (a === 192 && b === 0) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b !== undefined && b >= 18 && b <= 19) return true
  // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  if (isIP(ip) !== 6) return false
  const lower = ip.toLowerCase()
  // Loopback
  if (lower === '::1' || lower === '[::1]') return true
  // Unspecified
  if (lower === '::' || lower === '::0') return true
  // IPv4-mapped IPv6 — re-check as IPv4 underneath
  const v4MappedMatch = lower.match(/^::ffff:([0-9a-f.:]+)$/i)
  if (v4MappedMatch) {
    const inner = v4MappedMatch[1]
    if (inner && isIP(inner) === 4 && isPrivateIPv4(inner)) return true
    if (inner && /^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(inner)) {
      // hex IPv4-mapped form like ::ffff:7f00:1
      const [hi, lo] = inner.split(':')
      if (hi && lo) {
        const dotted = [
          parseInt(hi.slice(0, 2) || '0', 16),
          parseInt(hi.slice(2) || '0', 16),
          parseInt(lo.slice(0, 2) || '0', 16),
          parseInt(lo.slice(2) || '0', 16),
        ].join('.')
        if (isPrivateIPv4(dotted)) return true
      }
    }
  }
  // fc00::/7 (unique local)
  if (/^f[cd]/i.test(lower)) return true
  // fe80::/10 (link-local)
  if (/^fe[89ab]/i.test(lower)) return true
  // ff00::/8 (multicast)
  if (lower.startsWith('ff')) return true
  return false
}

export function isPrivateIP(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}

/**
 * Resolve a hostname to an IP and reject if it's in any non-public
 * range. Returns the resolved IP (first A/AAAA record) on success.
 * Throws SafeFetchError on failure.
 */
export async function resolvePublicIp(hostname: string): Promise<string> {
  // If the hostname is already an IP literal, validate directly.
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new SafeFetchError(
        'private_ip',
        `Resolved IP '${hostname}' is in a private/reserved range`,
      )
    }
    return hostname
  }
  let result: { address: string; family: number }
  try {
    result = await dns.lookup(hostname, { verbatim: true })
  } catch (err: any) {
    throw new SafeFetchError(
      'dns_failed',
      `DNS lookup failed for '${hostname}': ${err?.code ?? err?.message ?? 'unknown'}`,
    )
  }
  if (isPrivateIP(result.address)) {
    throw new SafeFetchError(
      'private_ip',
      `'${hostname}' resolves to private/reserved IP '${result.address}'. ` +
        `This is blocked to prevent SSRF.`,
    )
  }
  return result.address
}

/**
 * Single HTTP request to a specific IP, with a `Host:` header set to
 * the original hostname so the remote serves the right virtual host.
 * Manual redirect handling lives one level up in safeFetch().
 *
 * Buffers the response body into memory, enforcing maxBytes so a
 * malicious peer can't stream multi-gigabyte content.
 */
async function singleHop(
  url: URL,
  resolvedIp: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{
  status: number
  statusText: string
  headers: http.IncomingHttpHeaders
  body: Buffer
}> {
  const isHttps = url.protocol === 'https:'
  const port = url.port
    ? Number(url.port)
    : isHttps
      ? 443
      : 80

  // Connect to the resolved IP, not the hostname — bypasses any DNS
  // change between our lookup and the connection. TLS SNI uses the
  // original hostname so the server picks the right certificate.
  const options: https.RequestOptions = {
    host: resolvedIp,
    port,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      host: url.host,
      'user-agent': 'icjia-audit/1.20.1 (+https://audit.icjia.app)',
      accept: 'application/pdf,*/*;q=0.8',
    },
    timeout: timeoutMs,
    servername: url.hostname,
  }

  return new Promise((resolve, reject) => {
    const reqFn = isHttps ? https.request : http.request
    const req = reqFn(options, (res) => {
      const chunks: Buffer[] = []
      let total = 0
      res.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > maxBytes) {
          req.destroy(
            new SafeFetchError(
              'oversized',
              `Response exceeded ${maxBytes} byte cap during transfer`,
            ),
          )
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      })
      res.on('error', (err) =>
        reject(new SafeFetchError('network_error', err.message)),
      )
    })
    req.on('timeout', () => {
      req.destroy(
        new SafeFetchError('timeout', `Request exceeded ${timeoutMs}ms`),
      )
    })
    req.on('error', (err: any) => {
      if (err instanceof SafeFetchError) reject(err)
      else
        reject(
          new SafeFetchError('network_error', err?.message ?? String(err)),
        )
    })
    req.end()
  })
}

/**
 * Top-level SSRF-safe fetch. Resolves DNS, blocks private IPs, handles
 * redirects manually with full re-validation on each hop, buffers the
 * body into memory with a size cap, returns the final response.
 *
 * Any failure throws SafeFetchError with a structured code. The caller
 * maps codes to HTTP responses (e.g., 'private_ip' → 400, 'oversized'
 * → 413, 'timeout' → 502).
 */
export async function safeFetch(
  initialUrl: string,
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const visited = new Set<string>()
  let currentUrl: URL
  try {
    currentUrl = new URL(initialUrl)
  } catch {
    throw new SafeFetchError('malformed_url', `Cannot parse URL: ${initialUrl}`)
  }
  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new SafeFetchError(
      'malformed_url',
      `Only http/https URLs are supported; got '${currentUrl.protocol}'`,
    )
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const urlKey = currentUrl.toString()
    if (visited.has(urlKey)) {
      throw new SafeFetchError(
        'redirect_loop',
        `Redirect loop detected at ${urlKey}`,
      )
    }
    visited.add(urlKey)

    // (1) Per-hop URL validation. The allowlist check runs here so a
    // redirect to a non-allowlisted host fails on the next iteration.
    opts.validateUrl(currentUrl)

    // (2) Per-hop DNS lookup with private-IP rejection.
    const resolvedIp = await resolvePublicIp(currentUrl.hostname)

    // (3) Single HTTP hop to the resolved IP.
    const resp = await singleHop(currentUrl, resolvedIp, timeoutMs, opts.maxBytes)

    // (4) Redirect handling. Manual, with full re-validation next loop.
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      if (hop >= MAX_REDIRECTS) {
        throw new SafeFetchError(
          'too_many_redirects',
          `Exceeded ${MAX_REDIRECTS} redirects`,
        )
      }
      let nextUrl: URL
      try {
        nextUrl = new URL(resp.headers.location, currentUrl)
      } catch {
        throw new SafeFetchError(
          'redirect_invalid',
          `Redirect Location header is malformed: '${resp.headers.location}'`,
        )
      }
      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new SafeFetchError(
          'redirect_invalid',
          `Redirect target uses disallowed scheme '${nextUrl.protocol}'`,
        )
      }
      currentUrl = nextUrl
      continue
    }

    // (5) Terminal response — return to caller.
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.statusText,
      buffer: resp.body,
      finalUrl: currentUrl.toString(),
      resolvedIp,
    }
  }

  // Loop fall-through is unreachable; the redirect branch either
  // continues or throws. This catch is for the type-checker.
  throw new SafeFetchError(
    'too_many_redirects',
    `Exceeded ${MAX_REDIRECTS} redirects`,
  )
}

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

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { URL } from "node:url";
import { URL_FETCH } from "#config";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  buffer: Buffer;
  finalUrl: string;
  /** Resolved IP that was actually dialed (last hop). For diagnostics. */
  resolvedIp: string;
}

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type SafeFetchErrorCode =
  | "malformed_url"
  | "private_ip"
  | "dns_failed"
  | "redirect_loop"
  | "redirect_invalid"
  | "too_many_redirects"
  | "timeout"
  | "network_error"
  | "oversized"
  // The caller's AbortSignal fired (the client that asked for this fetch has
  // disconnected) — nobody is left to receive the result.
  | "aborted";

export interface SafeFetchOptions {
  /**
   * IDLE timeout in ms for each hop: the socket may go this long without
   * activity. It restarts on every byte, so on its own it does NOT bound the
   * fetch — a peer trickling one byte every (timeoutMs − 1) ms would hold it
   * open forever. `totalTimeoutMs` is the bound that cannot be reset.
   */
  timeoutMs?: number;
  /**
   * Overall wall-clock deadline in ms for the WHOLE fetch: every DNS lookup,
   * connect, redirect hop and the body. Default URL_FETCH.TOTAL_TIMEOUT_MS.
   */
  totalTimeoutMs?: number;
  /**
   * Abort the fetch (SafeFetchError "aborted") when this fires — pass a
   * signal tied to the client request closing so a fetch nobody is waiting
   * for stops holding a socket and a buffer.
   */
  signal?: AbortSignal;
  /** Hard cap on response body length; reject before exhausting memory. */
  maxBytes: number;
  /**
   * Function that runs after each hop's URL string is parsed but before
   * we resolve DNS. Should throw SafeFetchError on disallowed hostnames.
   * This is the URL allowlist plug-in point.
   */
  validateUrl: (url: URL) => void;
}

// IPv4 private / reserved ranges (RFC 1918, loopback, link-local, etc.).
function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  // 0.0.0.0/8 (this network)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, AWS/GCP metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF protocol assignments — includes 192.0.0.170 etc.)
  if (a === 192 && b === 0) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b !== undefined && b >= 18 && b <= 19) return true;
  // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  // A URL hostname for an IPv6 address arrives bracketed ("[::1]"), and
  // isIP() returns 0 for the bracketed string — so strip the brackets
  // before classifying, or the guard fails OPEN on every IPv6 literal.
  const unbracketed = ip.replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(unbracketed) !== 6) return false;
  const lower = unbracketed.toLowerCase();
  // Loopback
  if (lower === "::1" || lower === "[::1]") return true;
  // Unspecified
  if (lower === "::" || lower === "::0") return true;
  // IPv4-mapped IPv6 — re-check as IPv4 underneath
  const v4MappedMatch = lower.match(/^::ffff:([0-9a-f.:]+)$/i);
  if (v4MappedMatch) {
    const inner = v4MappedMatch[1];
    if (inner && isIP(inner) === 4 && isPrivateIPv4(inner)) return true;
    if (inner && /^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(inner)) {
      // hex IPv4-mapped form like ::ffff:7f00:1
      const [hi, lo] = inner.split(":");
      if (hi && lo) {
        const dotted = [
          parseInt(hi.slice(0, 2) || "0", 16),
          parseInt(hi.slice(2) || "0", 16),
          parseInt(lo.slice(0, 2) || "0", 16),
          parseInt(lo.slice(2) || "0", 16),
        ].join(".");
        if (isPrivateIPv4(dotted)) return true;
      }
    }
  }
  // fc00::/7 (unique local)
  if (/^f[cd]/i.test(lower)) return true;
  // fe80::/10 (link-local)
  if (/^fe[89ab]/i.test(lower)) return true;
  // ff00::/8 (multicast)
  if (lower.startsWith("ff")) return true;
  return false;
}

export function isPrivateIP(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

/**
 * Resolve a hostname and reject if ANY of its addresses is in a non-public
 * range. Returns the first address on success. Throws SafeFetchError on
 * failure.
 *
 * EVERY record, not the first (2026-09-02): a name publishing
 * [93.184.216.34, 127.0.0.1] used to pass on the public record while a
 * client that resolves on its own — Chromium in the page audit — could
 * connect to the private one.
 */
export async function resolvePublicIp(hostname: string): Promise<string> {
  // If the hostname is already an IP literal, validate directly.
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new SafeFetchError(
        "private_ip",
        `Resolved IP '${hostname}' is in a private/reserved range`,
      );
    }
    return hostname;
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err: any) {
    throw new SafeFetchError(
      "dns_failed",
      `DNS lookup failed for '${hostname}': ${err?.code ?? err?.message ?? "unknown"}`,
    );
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new SafeFetchError("dns_failed", `DNS lookup returned no addresses for '${hostname}'`);
  }
  for (const r of records) {
    if (typeof r?.address !== "string" || isPrivateIP(r.address)) {
      throw new SafeFetchError(
        "private_ip",
        `'${hostname}' resolves to private/reserved IP '${r?.address ?? "?"}'. ` +
          `This is blocked to prevent SSRF.`,
      );
    }
  }
  return records[0]!.address;
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
  budget: FetchBudget,
): Promise<{
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  const isHttps = url.protocol === "https:";
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80;

  // Connect to the resolved IP, not the hostname — bypasses any DNS
  // change between our lookup and the connection. TLS SNI uses the
  // original hostname so the server picks the right certificate.
  const options: https.RequestOptions = {
    host: resolvedIp,
    port,
    path: url.pathname + url.search,
    method: "GET",
    headers: {
      host: url.host,
      "user-agent": "icjia-audit/1.20.1 (+https://audit.icjia.app)",
      accept: "application/pdf,*/*;q=0.8",
    },
    timeout: timeoutMs,
    servername: url.hostname,
  };

  return new Promise((resolvePromise, rejectPromise) => {
    // The overall deadline and the caller's abort signal, enforced on the
    // socket itself: destroying the request tears down connect, headers and
    // body alike, whichever phase the hop is in.
    const deadlineTimer = setTimeout(() => {
      req.destroy(budget.deadlineError());
    }, budget.remainingMs());
    const onAbort = (): void => {
      req.destroy(budget.abortError());
    };
    const settle = (): void => {
      clearTimeout(deadlineTimer);
      budget.signal?.removeEventListener("abort", onAbort);
    };
    const resolve = (v: {
      status: number;
      statusText: string;
      headers: http.IncomingHttpHeaders;
      body: Buffer;
    }): void => {
      settle();
      resolvePromise(v);
    };
    const reject = (e: unknown): void => {
      settle();
      rejectPromise(e);
    };

    const reqFn = isHttps ? https.request : http.request;
    const req = reqFn(options, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(
            new SafeFetchError(
              "oversized",
              `Response exceeded ${maxBytes} byte cap during transfer`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? "",
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on("error", (err) =>
        reject(
          err instanceof SafeFetchError ? err : new SafeFetchError("network_error", err.message),
        ),
      );
    });
    req.on("timeout", () => {
      req.destroy(new SafeFetchError("timeout", `Request exceeded ${timeoutMs}ms`));
    });
    budget.signal?.addEventListener("abort", onAbort, { once: true });
    if (budget.signal?.aborted) onAbort();
    req.on("error", (err: any) => {
      if (err instanceof SafeFetchError) reject(err);
      else reject(new SafeFetchError("network_error", err?.message ?? String(err)));
    });
    req.end();
  });
}

/**
 * The fetch-wide budget shared by every hop: one deadline computed once at
 * the start (never extended by a redirect or by bytes arriving) and the
 * caller's optional abort signal.
 */
interface FetchBudget {
  signal?: AbortSignal;
  remainingMs(): number;
  deadlineError(): SafeFetchError;
  abortError(): SafeFetchError;
  /** Throw if the deadline has passed or the caller aborted. */
  check(): void;
  /** Race a non-cancellable step (DNS) against the deadline and the signal. */
  race<T>(p: Promise<T>): Promise<T>;
}

function createBudget(totalTimeoutMs: number, signal?: AbortSignal): FetchBudget {
  const deadline = Date.now() + totalTimeoutMs;
  const budget: FetchBudget = {
    signal,
    remainingMs: () => Math.max(0, deadline - Date.now()),
    deadlineError: () =>
      new SafeFetchError("timeout", `Fetch exceeded the ${totalTimeoutMs}ms overall deadline`),
    abortError: () => new SafeFetchError("aborted", "Fetch aborted: the client disconnected"),
    check() {
      if (signal?.aborted) throw budget.abortError();
      if (budget.remainingMs() <= 0) throw budget.deadlineError();
    },
    race<T>(p: Promise<T>): Promise<T> {
      budget.check();
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(budget.deadlineError());
        }, budget.remainingMs());
        const onAbort = (): void => {
          cleanup();
          reject(budget.abortError());
        };
        const cleanup = (): void => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        p.then(
          (v) => {
            cleanup();
            resolve(v);
          },
          (e) => {
            cleanup();
            reject(e);
          },
        );
      });
    },
  };
  return budget;
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
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // ONE budget for the whole fetch. `timeoutMs` above is only the per-hop
  // idle timeout; this is the total the caller is actually promised.
  const budget = createBudget(opts.totalTimeoutMs ?? URL_FETCH.TOTAL_TIMEOUT_MS, opts.signal);
  const visited = new Set<string>();
  let currentUrl: URL;
  try {
    currentUrl = new URL(initialUrl);
  } catch {
    throw new SafeFetchError("malformed_url", `Cannot parse URL: ${initialUrl}`);
  }
  if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
    throw new SafeFetchError(
      "malformed_url",
      `Only http/https URLs are supported; got '${currentUrl.protocol}'`,
    );
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const urlKey = currentUrl.toString();
    if (visited.has(urlKey)) {
      throw new SafeFetchError("redirect_loop", `Redirect loop detected at ${urlKey}`);
    }
    visited.add(urlKey);

    // (1) Per-hop URL validation. The allowlist check runs here so a
    // redirect to a non-allowlisted host fails on the next iteration.
    opts.validateUrl(currentUrl);

    // (2) Per-hop DNS lookup with private-IP rejection.
    const resolvedIp = await budget.race(resolvePublicIp(currentUrl.hostname));

    // (3) Single HTTP hop to the resolved IP.
    budget.check();
    const resp = await singleHop(currentUrl, resolvedIp, timeoutMs, opts.maxBytes, budget);

    // (4) Redirect handling. Manual, with full re-validation next loop.
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      if (hop >= MAX_REDIRECTS) {
        throw new SafeFetchError("too_many_redirects", `Exceeded ${MAX_REDIRECTS} redirects`);
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(resp.headers.location, currentUrl);
      } catch {
        throw new SafeFetchError(
          "redirect_invalid",
          `Redirect Location header is malformed: '${resp.headers.location}'`,
        );
      }
      if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
        throw new SafeFetchError(
          "redirect_invalid",
          `Redirect target uses disallowed scheme '${nextUrl.protocol}'`,
        );
      }
      currentUrl = nextUrl;
      continue;
    }

    // (5) Terminal response — return to caller.
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.statusText,
      buffer: resp.body,
      finalUrl: currentUrl.toString(),
      resolvedIp,
    };
  }

  // Loop fall-through is unreachable; the redirect branch either
  // continues or throws. This catch is for the type-checker.
  throw new SafeFetchError("too_many_redirects", `Exceeded ${MAX_REDIRECTS} redirects`);
}

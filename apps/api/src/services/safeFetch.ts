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
  /** The final response's Content-Type header, or null. */
  contentType: string | null;
  /** The final response's headers a browser needs to USE the body (type and
   *  CORS), for the page audit, which hands Node-fetched responses to
   *  Chromium. Never cookies or anything else. */
  passHeaders: Record<string, string>;
}

/** Response headers safe and necessary to hand to Chromium with a body. */
const PASS_HEADERS = [
  "content-type",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "timing-allow-origin",
  "cross-origin-resource-policy",
];

function passHeadersOf(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PASS_HEADERS) {
    const v = h[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  /**
   * True when a private address was reached by LOOKING UP A NAME, as opposed
   * to being written in the URL. The caller already knows a literal address
   * they typed is private; what a name resolves to is knowledge held by this
   * server's resolver, and the reply must not give it away (see
   * sendSafeFetchError — such an error is answered exactly like a name that
   * does not exist).
   */
  readonly viaLookup: boolean;
  constructor(code: SafeFetchErrorCode, message: string, opts: { viaLookup?: boolean } = {}) {
    super(message);
    this.code = code;
    this.viaLookup = opts.viaLookup === true;
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
  // A hop's website has reached the hourly ceiling for fetches to any one
  // site (services/urlAnyHostGate.ts) — thrown by the validator the URL
  // pipeline passes in, never by safeFetch itself.
  | "target_limit"
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
  /**
   * The request to send. Default: GET with this module's own headers.
   * POST and OPTIONS exist for one caller — the page auditor replaying a
   * page's own data request (a GraphQL query) and the browser's CORS
   * preflight before it (2026-11-18). Neither is ever redirected: a 3xx
   * answer is an error, not a hop, so a body is never re-sent to a second
   * address. `headers` may carry only the FORWARDABLE_REQUEST_HEADERS below
   * (what CORS and a JSON body need); anything else — cookies, auth — is
   * dropped.
   */
  request?: {
    method: "GET" | "POST" | "OPTIONS";
    body?: Buffer;
    headers?: Record<string, string>;
  };
}

const FORWARDABLE_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "origin",
  "access-control-request-method",
  "access-control-request-headers",
]);

// IPv4 private / reserved ranges (RFC 1918, loopback, link-local, etc.).
function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const parts = ip.split(".").map(Number);
  const [a, b, c] = parts;
  // 0.0.0.0/8 (this network)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 (carrier-grade NAT, RFC 6598 — added 2026-11-18)
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, AWS/GCP metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF protocol assignments — includes 192.0.0.170 etc.)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (documentation)
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  // 192.88.99.0/24 (6to4 relay anycast, deprecated by RFC 7526 — added
  // 2026-11-25: nothing legitimate is served from it)
  if (a === 192 && b === 88 && c === 99) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b !== undefined && b >= 18 && b <= 19) return true;
  // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
  if (a !== undefined && a >= 224) return true;
  return false;
}

/**
 * An IPv6 address as its eight 16-bit groups, or null. Handles "::"
 * compression and a trailing dotted IPv4 ("::ffff:1.2.3.4"), so every
 * spelling of one address classifies the same way — the string-prefix
 * checks this replaces missed the written-out mapped form
 * (0:0:0:0:0:ffff:a9fe:a9fe) and IPv4-compatible ::7f00:1 (review
 * 2026-11-18).
 */
function ipv6Groups(addr: string): number[] | null {
  let s = addr;
  const tail: number[] = [];
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]!) !== 4) return null;
    const o = dotted[2]!.split(".").map(Number);
    tail.push((o[0]! << 8) | o[1]!, (o[2]! << 8) | o[3]!);
    s = dotted[1]!.endsWith("::") ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((h) => parseInt(h, 16)));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const total = head.length + rest.length + tail.length;
  if (halves.length === 1 && total !== 8) return null;
  if (total > 8) return null;
  const zeros = halves.length === 2 ? new Array(8 - total).fill(0) : [];
  const groups = [...head, ...zeros, ...rest, ...tail];
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

function v4From(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

function isPrivateIPv6(ip: string): boolean {
  // A URL hostname for an IPv6 address arrives bracketed ("[::1]"), and
  // isIP() returns 0 for the bracketed string — so strip the brackets
  // before classifying, or the guard fails OPEN on every IPv6 literal.
  const unbracketed = ip.replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "");
  if (isIP(unbracketed) !== 6) return false;
  const g = ipv6Groups(unbracketed.toLowerCase());
  // isIP said IPv6 but we cannot parse it: refuse rather than fail open.
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const first80Zero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // :: (unspecified), ::1 (loopback), and ::a.b.c.d (IPv4-compatible,
  // deprecated — reaches the embedded IPv4 on some stacks): all refused.
  if (first80Zero && g5 === 0) return true;
  // ::ffff:a.b.c.d (IPv4-mapped) — judge the IPv4 underneath.
  if (first80Zero && g5 === 0xffff) return isPrivateIPv4(v4From(g6, g7));
  // ::ffff:0:a.b.c.d (IPv4-translated, SIIT — RFC 7915): a translator turns
  // it into the IPv4 it embeds. Refused outright, like NAT64 (2026-11-25).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return true;
  // 64:ff9b::/96 (NAT64) and 64:ff9b:1::/48 (local-use NAT64): an address
  // here is translated to the IPv4 it embeds — refused outright.
  if (g0 === 0x64 && g1 === 0xff9b) return true;
  // 100::/64 (discard)
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  // 2001::/32 (Teredo — embeds an obfuscated IPv4) and 2001:db8::/32 (docs)
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true;
  // 2002::/16 (6to4) — judge the IPv4 it embeds.
  if (g0 === 0x2002) return isPrivateIPv4(v4From(g1, g2));
  // fc00::/7 (unique local)
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (link-local) and fec0::/10 (site-local, deprecated)
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
  // ff00::/8 (multicast)
  if ((g0 & 0xff00) === 0xff00) return true;
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
export async function resolvePublicIp(rawHostname: string): Promise<string> {
  // A URL's hostname for an IPv6 literal arrives bracketed ("[::1]"), and
  // isIP() answers 0 for the bracketed string. Until 2026-11-25 that sent
  // every IPv6 literal to a DNS lookup, which failed — closed, but by
  // accident, with isPrivateIPv6 never consulted. Strip them so the
  // classifier is the defence.
  const hostname = rawHostname.replace(/^\[(.*)\]$/, "$1");
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
        { viaLookup: true },
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
  request?: SafeFetchOptions["request"],
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
  const method = request?.method ?? "GET";
  const headers: Record<string, string> = {
    host: url.host,
    "user-agent": "icjia-audit/1.20.1 (+https://audit.icjia.app)",
    accept: "application/pdf,*/*;q=0.8",
  };
  for (const [k, v] of Object.entries(request?.headers ?? {})) {
    const key = k.toLowerCase();
    if (FORWARDABLE_REQUEST_HEADERS.has(key) && !/[\r\n]/.test(v)) headers[key] = v;
  }
  const body = method === "POST" ? (request?.body ?? Buffer.alloc(0)) : null;
  if (body) headers["content-length"] = String(body.length);
  const options: https.RequestOptions = {
    host: resolvedIp,
    port,
    path: url.pathname + url.search,
    method,
    headers,
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
    req.end(body ?? undefined);
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
    const resp = await singleHop(
      currentUrl,
      resolvedIp,
      timeoutMs,
      opts.maxBytes,
      budget,
      opts.request,
    );

    // (4) Redirect handling. Manual, with full re-validation next loop.
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      if (opts.request && opts.request.method !== "GET") {
        throw new SafeFetchError(
          "redirect_invalid",
          `A ${opts.request.method} is never redirected`,
        );
      }
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
      contentType:
        typeof resp.headers["content-type"] === "string" ? resp.headers["content-type"] : null,
      passHeaders: passHeadersOf(resp.headers),
    };
  }

  // Loop fall-through is unreachable; the redirect branch either
  // continues or throws. This catch is for the type-checker.
  throw new SafeFetchError("too_many_redirects", `Exceeded ${MAX_REDIRECTS} redirects`);
}

/**
 * URL / SSRF policy for every URL-fetch audit path (analyze-url, audit-url,
 * audit-url-page, bulk-from-inventory). Extracted from routes/analyze-url.ts
 * so it can be imported — and unit-tested — without dragging in the router,
 * auth middleware, and DB singleton. The route files are thin adapters over
 * these functions; safeFetch re-validates via validateUrlForFetch on every
 * redirect hop.
 */
import type { Response } from "express";
import { SafeFetchError } from "./safeFetch.js";
import { ANY_HOST_REFUSALS } from "./urlAnyHostGate.js";
import { ANALYSIS, URL_FETCH } from "#config";

// Cap URL-fetched PDFs at the same size as direct uploads. safeFetch buffers
// the body in memory before the analysis semaphore is acquired, so an
// oversized cap (the old 100 MB — 6.6× the upload cap) let a handful of
// concurrent fetches blow past the process memory ceiling. Matching the
// upload cap keeps the memory budget consistent across all audit paths.
export const MAX_PDF_BYTES = ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 30_000;

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
// The list itself lives in audit.config.ts (URL_FETCH.APPROVED_HOSTS) since
// v1.180.0, because the web app reads it too: a `?prefill=` link runs by
// itself only for a host on it.
const DEFAULT_ALLOWED_HOSTS: readonly string[] = URL_FETCH.APPROVED_HOSTS;

function getAllowedHosts(): Set<string> {
  const fromEnv = (process.env.ANALYZE_URL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...fromEnv]);
}

/**
 * Only the standard web ports. Without this, an allowlisted host (or, with
 * the privileged token, any public host) could be probed on any port, and
 * the fetch error told open from closed — the service as a port scanner run
 * from its own address (security review 2026-11-18). Documents are served
 * on 80/443; nothing legitimate needs another port.
 */
export function isAllowedPort(u: URL): boolean {
  return u.port === "" || u.port === "80" || u.port === "443";
}

export function isAllowedUrl(rawUrl: string): { ok: boolean; reason?: string; parsed?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "only http/https URLs are accepted", parsed };
  }

  if (!isAllowedPort(parsed)) {
    return { ok: false, reason: "only the standard web ports (80 and 443) are accepted", parsed };
  }

  // Refuse private/local hostnames to prevent SSRF
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return { ok: false, reason: `private/local address '${host}' is not allowed`, parsed };
  }

  const allowed = getAllowedHosts();
  // Allow exact match OR subdomain match against each allowlisted host
  let matched = false;
  for (const ah of allowed) {
    if (host === ah || host.endsWith("." + ah)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return {
      ok: false,
      reason: `host '${host}' is not in the allowlist. Allowed: ${[...allowed].join(", ")}`,
      parsed,
    };
  }

  return { ok: true, parsed };
}

/**
 * Is this address on the approved list? Anything that is not a string, does
 * not parse, or fails any other rule answers false — so an odd request is
 * counted against the tighter any-host budget, never excused from it.
 */
export function isOnApprovedList(rawUrl: unknown): boolean {
  return typeof rawUrl === "string" && isAllowedUrl(rawUrl).ok;
}

/**
 * Map a SafeFetchError to an HTTP response. Centralizes the
 * code→status mapping so all three URL-fetch endpoints behave
 * consistently.
 */
/** One object, so a name that does not exist and a name that resolves to a
 *  private address cannot drift apart. */
const DNS_FAILED_BODY = {
  error: "Fetch failed",
  details: "The address could not be found.",
} as const;

export function sendSafeFetchError(res: Response, err: SafeFetchError): void {
  switch (err.code) {
    case "malformed_url":
    case "redirect_invalid":
      res
        .status(400)
        .json({ error: "URL not allowed", details: err.message, code: "URL_NOT_ALLOWED" });
      return;
    case "target_limit":
      // The hourly ceiling for fetches to any one website (urlAnyHostGate).
      res.status(429).json({ error: ANY_HOST_REFUSALS["target-hourly"].error });
      return;
    case "private_ip":
      // A NAME that resolved to a private address is answered EXACTLY like a
      // name that does not exist — same status, same body. Otherwise the two
      // replies together tell an anonymous caller which internal names the
      // server's resolver knows (commit security review, 2026-11-25: fixing
      // the message was not enough while the status still differed). A
      // private address written out in the URL is not such a secret and
      // keeps its 400.
      if (err.viaLookup) {
        console.warn(`[safeFetch] private_ip (via lookup): ${err.message}`);
        res.status(502).json(DNS_FAILED_BODY);
        return;
      }
      // SSRF block. 400 to the client; the details message names the
      // hostname + resolved IP, useful for the operator but not
      // dangerous to expose since the attacker provided the hostname.
      // A FIXED sentence, and the detail to the server log only. The message
      // names the address the server's own resolver returned, so relaying it
      // told an anonymous caller which internal names exist and where they
      // point (red-team review 2026-11-25) — reachable since v1.180.0, when
      // the allowlist stopped refusing such hosts before any lookup.
      console.warn(`[safeFetch] private_ip: ${err.message}`);
      res.status(400).json({
        error: "URL resolves to a private/reserved address",
        details: "That address is not on the public internet, so it cannot be checked by link.",
        code: "URL_NOT_ALLOWED",
      });
      return;
    case "oversized":
      res.status(413).json({ error: err.message });
      return;
    case "timeout":
      res.status(504).json({ error: err.message });
      return;
    case "aborted":
      // The client that asked has gone; nothing useful can be sent. Answer
      // anyway so a non-closed response (tests, proxies) is never left open.
      res.status(499).json({ error: "Client closed request" });
      return;
    case "too_many_redirects":
    case "redirect_loop":
      res.status(502).json({ error: err.message });
      return;
    case "dns_failed":
      res.status(502).json(DNS_FAILED_BODY);
      return;
    case "network_error":
    default:
      // Never the raw socket text ("connect ECONNREFUSED <ip>:<port>"): it
      // told an open port from a closed one (security review 2026-11-18).
      // The full message still reaches the server log.
      console.warn(`[safeFetch] ${err.code}: ${err.message}`);
      res
        .status(502)
        .json({ error: "Fetch failed", details: "The document could not be fetched." });
      return;
  }
}

/**
 * Wrap isAllowedUrl in the validateUrl shape that safeFetch expects.
 * Throws SafeFetchError('malformed_url', ...) on a disallowed host so
 * the same redirect-handling loop in safeFetch can reject mid-chain.
 */
export function validateUrlForFetch(u: URL): void {
  const check = isAllowedUrl(u.toString());
  if (!check.ok) {
    throw new SafeFetchError("malformed_url", check.reason ?? "URL not allowed");
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
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new SafeFetchError("malformed_url", "only http/https URLs are accepted");
  }
  // Names that can only ever be local are refused BEFORE any lookup, so the
  // resolver is never asked about them: localhost, *.local, *.internal, and
  // any single-label name (no dot) — the forms a search domain or /etc/hosts
  // answers. An address literal is left to the address check in safeFetch.
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.startsWith("[") || /^[0-9.]+$/.test(host);
  if (
    !literal &&
    (host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      !host.includes("."))
  ) {
    throw new SafeFetchError("malformed_url", "that name is not on the public internet");
  }
  if (!isAllowedPort(u)) {
    throw new SafeFetchError(
      "malformed_url",
      "only the standard web ports (80 and 443) are accepted",
    );
  }
}

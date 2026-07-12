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
import { ANALYSIS } from "#config";

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
const DEFAULT_ALLOWED_HOSTS = [
  // Illinois state government — covers every *.illinois.gov agency
  // hosting PDFs (huge fleet surface).
  "illinois.gov",
  // ICJIA owned/operated domains
  "icjia.cloud",
  "icjia.app",
  "icjia-api.cloud",
  // Partner / program domains
  "ilheals.com",
  // Specific subdomains kept for documentation; the bare-domain
  // entries above already cover them. Listed so operators reading
  // the source can see what's known-good without grepping logs.
  "icjia.illinois.gov",
  "dvfr.icjia-api.cloud",
  "i2i.icjia-api.cloud",
  "vpp.icjia-api.cloud",
  "infonet.icjia-api.cloud",
];

function getAllowedHosts(): Set<string> {
  const fromEnv = (process.env.ANALYZE_URL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...fromEnv]);
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
 * Map a SafeFetchError to an HTTP response. Centralizes the
 * code→status mapping so all three URL-fetch endpoints behave
 * consistently.
 */
export function sendSafeFetchError(res: Response, err: SafeFetchError): void {
  switch (err.code) {
    case "malformed_url":
    case "redirect_invalid":
      res.status(400).json({ error: "URL not allowed", details: err.message });
      return;
    case "private_ip":
      // SSRF block. 400 to the client; the details message names the
      // hostname + resolved IP, useful for the operator but not
      // dangerous to expose since the attacker provided the hostname.
      res.status(400).json({
        error: "URL resolves to a private/reserved address",
        details: err.message,
      });
      return;
    case "oversized":
      res.status(413).json({ error: err.message });
      return;
    case "timeout":
      res.status(504).json({ error: err.message });
      return;
    case "too_many_redirects":
    case "redirect_loop":
      res.status(502).json({ error: err.message });
      return;
    case "dns_failed":
    case "network_error":
    default:
      res.status(502).json({ error: "Fetch failed", details: err.message });
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
}

/**
 * SSRF guard for the headless-browser page-audit path.
 *
 * The PDF-fetch endpoints route through safeFetch (in-process DNS + private-IP
 * block + IP-pinned connect). The page-audit endpoint renders a URL in
 * Chromium, which resolves DNS and follows redirects/subresource loads on its
 * own — so the protection has to live in a request interceptor instead.
 *
 * `shouldAllowPageRequest` is the pure, synchronous half of each interception
 * decision (scheme + allowlist); the caller pairs it with an async private-IP
 * resolution (resolvePublicIp) when `needsIpCheck` is true. Splitting it this
 * way keeps the scheme/allowlist policy unit-testable without a live browser.
 */

export interface PageRequestDecision {
  /** Whether to let the request proceed at all. */
  allow: boolean;
  /**
   * When true, the caller must resolve the host and abort if it maps to a
   * private/reserved IP before continuing. Only http(s) requests need this;
   * data:/blob:/about: never touch the network.
   */
  needsIpCheck: boolean;
  /** Reason for a block, for diagnostics. */
  reason?: string;
}

const NO_NETWORK_SCHEMES = new Set(["data:", "blob:", "about:"]);

export function shouldAllowPageRequest(
  rawUrl: string,
  isDocument: boolean,
  isUrlAllowed: (url: string) => boolean,
): PageRequestDecision {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allow: false, needsIpCheck: false, reason: "malformed URL" };
  }

  // Non-network schemes (inline data, blob, about:blank) can't reach the
  // network, so they're SSRF-irrelevant and must be allowed or legit pages
  // fail to render their inline assets.
  if (NO_NETWORK_SCHEMES.has(parsed.protocol)) {
    return { allow: true, needsIpCheck: false };
  }

  // Only http(s) may touch the network. file:, ftp:, gopher:, dict:, etc.
  // are blocked outright.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      allow: false,
      needsIpCheck: false,
      reason: `disallowed scheme '${parsed.protocol}'`,
    };
  }

  // A bare "http://" with no host is malformed for our purposes.
  if (!parsed.hostname) {
    return { allow: false, needsIpCheck: false, reason: "missing host" };
  }

  // Document navigations (the main frame and its redirect chain) must stay on
  // the allowlist — this is what stops an open-redirect on an allowlisted host
  // from steering Chromium to an arbitrary internal target. Subresources are
  // NOT allowlist-gated so legitimate public CDN assets still load; they are
  // still subject to the private-IP check below via needsIpCheck.
  if (isDocument && !isUrlAllowed(rawUrl)) {
    return {
      allow: false,
      needsIpCheck: false,
      reason: "document navigation off the allowlist",
    };
  }

  return { allow: true, needsIpCheck: true };
}

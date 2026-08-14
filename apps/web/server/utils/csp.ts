import { ANALYTICS } from "../../../../audit.config";

/**
 * Builds the production Content-Security-Policy header for a single request.
 *
 * `script-src` carries a per-request nonce and NO 'unsafe-inline', so only the
 * scripts Nuxt emits (stamped with the same nonce in the render:html hook) run
 * — an injected inline script or a `javascript:` URI is refused. `style-src`
 * keeps 'unsafe-inline' because Vue `:style` object bindings emit inline style
 * *attributes*, which CSP nonces cannot cover (that would need 'unsafe-hashes'
 * or a full refactor — out of scope).
 *
 * The self-hosted Plausible origin (ANALYTICS.PLAUSIBLE_HOST) is the ONLY
 * external origin allowed, and only where the snippet needs it: script-src
 * (loading /js/script.js) and connect-src (the page-view POST to /api/event).
 * Omitting either breaks analytics silently, so csp.test.ts asserts both.
 * An empty PLAUSIBLE_HOST (analytics off) drops the allowance entirely.
 *
 * Pure and Nitro-free so it is unit-testable without the server runtime.
 */
export function buildCspHeader(nonce: string): string {
  const plausible = ANALYTICS.PLAUSIBLE_HOST ? ` ${ANALYTICS.PLAUSIBLE_HOST}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${plausible}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${plausible}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Builds the production Content-Security-Policy header for a single request.
 *
 * `script-src` carries a per-request nonce and NO 'unsafe-inline', so only the
 * scripts Nuxt emits (stamped with the same nonce in the render:html hook) run
 * — an injected inline script or a `javascript:` URI is refused. `style-src`
 * keeps 'unsafe-inline' because Vue `:style` object bindings emit inline style
 * *attributes*, which CSP nonces cannot cover (that would need 'unsafe-hashes'
 * or a full refactor — out of scope). All other directives are unchanged from
 * the previous static policy.
 *
 * Pure and dependency-free so it is unit-testable without the Nitro runtime.
 */
export function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

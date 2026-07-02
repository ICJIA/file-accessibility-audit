import { randomBytes } from "node:crypto";
import { buildCspHeader } from "../utils/csp";

/**
 * Production-only nonce-based Content-Security-Policy.
 *
 * A static CSP header can't carry a per-request nonce, so it lives here instead
 * of nuxt.config's routeRules (which still sets the other, nonce-free security
 * headers). Two steps per request:
 *   1. `request`: mint a fresh nonce, stash it on the event, and set the CSP
 *      header (script-src 'self' 'nonce-…', no 'unsafe-inline').
 *   2. `render:html`: stamp that nonce onto every <script> Nuxt emits — the
 *      hydration payload, the color-mode init script, and the JSON-LD block —
 *      so they satisfy the policy while injected inline scripts do not.
 *
 * Dev is intentionally left CSP-free (HMR uses inline eval); this matches the
 * previous production-only routeRules behavior.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("request", (event) => {
    if (import.meta.dev) return;
    const nonce = randomBytes(16).toString("base64");
    event.context.cspNonce = nonce;
    setResponseHeader(event, "Content-Security-Policy", buildCspHeader(nonce));
  });

  nitro.hooks.hook("render:html", (html, { event }) => {
    const nonce = event.context.cspNonce as string | undefined;
    if (!nonce) return;
    // Add nonce="…" to any <script that doesn't already have one. Covers the
    // head (color-mode, JSON-LD, entry/preload) and the body (hydration data).
    const stamp = (chunk: string) =>
      chunk.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`);
    html.head = html.head.map(stamp);
    html.bodyPrepend = html.bodyPrepend.map(stamp);
    html.bodyAppend = html.bodyAppend.map(stamp);
  });
});

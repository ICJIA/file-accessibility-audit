# CSP Nonce Hardening — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation
**Scope:** Remove `'unsafe-inline'` from the production `script-src` CSP directive, replacing it with a per-request nonce.

## Problem

The production Content-Security-Policy (set in `apps/web/nuxt.config.ts` `$production.routeRules['/**'].headers`) uses:

```
script-src 'self' 'unsafe-inline'
```

`'unsafe-inline'` permits **any** inline `<script>` and — critically — `javascript:` URIs to execute. The 2026-07-02 red/blue audit confirmed a stored-XSS (F1) that executed precisely because CSP did not block a `javascript:` href. That specific sink was fixed at the app layer (scheme-validated help-link URLs), but `'unsafe-inline'` leaves the whole *class* of inline-script/`javascript:`-URI injection unmitigated at the CSP layer. Removing it is the documented follow-up hardening (already noted in the `nuxt.config.ts` comment).

## Goal & non-goals

**Goal:** Production `script-src` contains no `'unsafe-inline'`; every inline script Nuxt emits (hydration payload, `@nuxt/ui` color-mode init script, the `app.vue` JSON-LD block) carries a valid per-request nonce; the app renders, hydrates, and toggles color mode with zero CSP violations.

**Non-goals:**
- **`style-src` stays `'unsafe-inline'`.** Vue `:style` object bindings (used throughout, e.g. `ReportContent`/`ScoreCard` `:style="{ color: catColor(cat) }"`) emit inline `style=""` *attributes*. CSP nonces apply only to `<style>` *elements*, never style attributes — removing `'unsafe-inline'` from `style-src` would require `'unsafe-hashes'` + hashing every inline style or refactoring every binding to a class. Large effort, low security payoff (style injection ≠ script execution). Out of scope.
- No `'strict-dynamic'`. The app is fully self-contained and same-origin: bundle chunks load via `<script src="/_nuxt/…">` which matches `'self'`, and inline scripts match the nonce. `'strict-dynamic'` adds complexity with no benefit here. Noted as an optional future step.
- Dev is unchanged (no CSP in dev today — HMR relies on inline eval; the plugin is production-only).

## Established context (verified)

- **SSR.** `ssr` is unset (defaults `true`); prod is `node .output/server/index.mjs` (Nitro node server). Per-request nonces are viable.
- **Inline-script inventory** (what the nonce must cover): Nuxt hydration scripts (`__NUXT_DATA__` + entry, dynamic per page — *cannot* be hashed, forcing a nonce); the `@nuxt/ui` color-mode FOUC-prevention init script; the `app.vue` JSON-LD block (`useHead({ script: [{ type: 'application/ld+json', innerHTML: … }] })` — CSP `script-src` governs all `<script>` elements, including this non-executable data block).
- **Mermaid is gone** at runtime (replaced by build-time SVGs in v1.28.0; `DiagramFigure.vue` confirms "no mermaid runtime"). The old CSP comment mentioning Mermaid is stale and will be corrected.
- **Nuxt-official pattern.** Nuxt 4 docs (via Context7) document the `render:html` Nitro hook reading `event.context.cspNonce` and regex-stamping `nonce=` onto `<script` tags. This is the sanctioned approach, not a workaround.

## Architecture

A single production-only Nitro server plugin: `apps/web/server/plugins/csp.ts`.

### Piece 1 — `buildCspHeader(nonce: string): string` (pure, exported, unit-tested)

Returns the full CSP header string. Identical to today's directives except:
`script-src 'self' 'nonce-${nonce}'` (was `'self' 'unsafe-inline'`). `style-src 'unsafe-inline'` and all other directives unchanged.

### Piece 2 — request hook (generate nonce + set header)

```ts
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    if (import.meta.dev) return
    const nonce = randomBytes(16).toString('base64')
    event.context.cspNonce = nonce
    setResponseHeader(event, 'Content-Security-Policy', buildCspHeader(nonce))
  })
  // Piece 3 below
})
```

- Production-only via `import.meta.dev` guard (dev stays CSP-free).
- Runs for every request the Nitro server handles. Static `_nuxt/*` assets are typically served by nginx in prod (they don't need the header; `'self'` covers them). Harmless if the header lands on any Nitro-served asset.

### Piece 3 — `render:html` hook (stamp the nonce onto scripts)

```ts
nitro.hooks.hook('render:html', (html, { event }) => {
  const nonce = event.context.cspNonce
  if (!nonce) return
  const stamp = (s: string) =>
    s.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`)
  html.head = html.head.map(stamp)
  html.bodyPrepend = html.bodyPrepend.map(stamp)
  html.bodyAppend = html.bodyAppend.map(stamp)
})
```

- The negative-lookahead `(?![^>]*\snonce=)` skips any tag that already has a nonce (idempotent).
- Covers head (color-mode, JSON-LD, preload/entry) **and** body (`__NUXT_DATA__`, hydration) — the hydration payload is typically in `bodyAppend`.

### Config change

In `apps/web/nuxt.config.ts`:
- Remove **only** the `'Content-Security-Policy'` entry from `$production.routeRules['/**'].headers`. The plugin now owns CSP (it needs the per-request nonce, which a static routeRules header cannot carry).
- Keep `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` in routeRules (static, no nonce needed).
- Update the comment: Mermaid removed; script-src now nonce-based via the plugin.

## Data flow

Request → Nitro `request` hook generates nonce, sets `event.context.cspNonce` + CSP response header → Nuxt renders → `render:html` stamps the same nonce onto every emitted `<script>` → browser receives HTML whose scripts' `nonce=` matches the header's `'nonce-…'` → inline scripts execute; any injected inline script or `javascript:` URI without the nonce is blocked.

## Error handling / edge cases

- **Missing nonce** (e.g. a non-HTML Nitro response with no render): `render:html` early-returns; no stamping, no error.
- **Streaming SSR:** the regex approach works for both buffered and streamed responses (per Nuxt docs).
- **Idempotency:** the skip-if-present regex means double-invocation never double-stamps.
- **Failure mode:** a script Nuxt emits outside head/bodyPrepend/bodyAppend would be un-nonced and blocked → visible breakage, caught by the live verification below (not a silent security gap).

## Testing

**Unit** (`apps/web/server/__tests__/csp.test.ts` or colocated): `buildCspHeader('NONCE')` asserts:
- `script-src 'self' 'nonce-NONCE'` present; `script-src` contains no `'unsafe-inline'`.
- `style-src 'unsafe-inline'` still present (scope guard).
- Core directives present: `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`.

**Live (production build)** — `pnpm --filter web build` → `node .output/server/index.mjs` on a test port:
1. `curl -sI` a page → CSP header has `script-src 'self' 'nonce-<base64>'` and **no** `'unsafe-inline'` in the script-src directive.
2. Extract the header nonce; assert every `<script` in the served HTML body carries `nonce="<same value>"` (and none is un-nonced).
3. chrome-devtools: load the prod-preview URL → **zero** CSP violation messages in the console; hydration works (interact with an element / the upload dropzone); the color-mode toggle flips theme with no FOUC; the JSON-LD `<script type="application/ld+json">` is present and nonced.
4. Defense-in-depth spot check: a `javascript:` href on the page is refused by CSP (console shows the block), confirming the F1 class is now mitigated at the CSP layer.

**Regression:** `pnpm build` + `pnpm test` stay green (no app-code behavior change; only server headers + head/body script attributes).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A Nuxt-emitted inline script is missed by the stamp → CSP blocks it → broken page | Low | Official head+body regex; live prod-preview console-violation check before merge |
| nginx strips/overrides the CSP header in prod | Low | Verify header presence on the deployed prod response post-deploy; nginx currently passes the Nuxt-set CSP through |
| Older browsers without nonce support block all inline scripts | Negligible | Nonce support is universal since ~2016; gov-tool audience |

## Rollback

Revert the plugin + restore the `script-src 'self' 'unsafe-inline'` line in `routeRules`. Single-commit revert; no data or schema involved.

# Privileged API token — rate-limit tier + allowlist bypass

- **Date:** 2026-06-27
- **Status:** Implemented in `apps/api`, verified (tsc clean, 510 tests pass); pending release + deploy
- **Branch:** `feat/page-audit-detail`

## Problem

The public audit API runs with auth off (`AUTH.REQUIRE_LOGIN = false`). Its rate
limits had been cranked up for the ICJIA fleet-audit campaign (analyze 5000/hr,
global 1000/min) **for everyone**. Goals:

1. Revert anonymous limits to a strict abuse ceiling — "the API can't be hit for
   thousands of requests an hour."
2. Let a trusted automated client get generous limits via a **single bearer
   token** — without turning on the OTP/JWT/DB-PAT auth system.
3. Let that trusted client audit domains **outside** the ICJIA / illinois.gov
   allowlist (e.g. ICJIA sites hosted on `*.netlify.app`); anonymous callers stay
   restricted to the allowlist.

## Design

A single static token supplied via the `API_PRIVILEGED_TOKEN` env var. A request
carrying `Authorization: Bearer <token>` that matches it (constant-time compare)
is **privileged** and gets two things, nothing more:

1. **Rate limits** — the generous tier instead of the strict one.
2. **URL allowlist** — bypassed (any *public* URL) instead of ICJIA/illinois-only.

| Limiter | No token (anon) | With token (privileged) |
|---|---|---|
| `analyze` — the 4 audit endpoints | 500 / hour / IP | 5000 / hour |
| `global` — catch-all burst guard | 100 / min / IP | 1000 / min |

Anonymous requests are keyed per IP (existing behaviour); privileged requests
share one `'privileged'` bucket (it's a single trusted client).

### Security invariant (the important part)

The token grants ONLY (higher limits + allowlist bypass). It never bypasses:

- **Private/reserved-IP SSRF block.**
  - PDF path: `resolvePublicIp` runs on *every hop* inside `safeFetch`,
    independent of the `validateUrl` allowlist function, and the connection is
    pinned to the resolved IP (anti-rebinding).
  - Page path: `shouldAllowPageRequest` returns `needsIpCheck: true` for *every*
    http(s) request, independent of the allow predicate, so the Chromium
    interceptor resolves + aborts private/reserved targets.
  - Both verified by tests (`pageAuditGuard.test.ts` asserts the allow-all
    predicate still yields `needsIpCheck: true`).
- **Size caps** (15 MB), **concurrency semaphores** (2 PDF / 2 page), **scheme**
  restriction (http/https only).

Net: a leaked token cannot reach internal services. Worst case is auditing
arbitrary *public* URLs at 5000/hr — still serialized through 2 concurrent slots.
Unset/empty token → feature off → everyone is anonymous (fail-safe to strict).

## Files changed

- `audit.config.ts` — `RATE_LIMITS.analyze` / `.global` are now `{ windowMs, anon,
  privileged }`; doc block for `API_PRIVILEGED_TOKEN`.
- `apps/api/src/middleware/rateLimiter.ts` — `isPrivilegedRequest` (constant-time,
  reads `process.env` like authMiddleware), `tierLimit` / `tierKey`,
  `tieredLimiter`; `analyzeLimiter` and `globalLimiter` are now tiered.
- `apps/api/src/routes/analyze-url.ts` — `isAllowedUrl` returns `parsed` on
  allowlist/scheme/private failures; new `validateUrlPublic`; handler swaps the
  validator when privileged.
- `apps/api/src/routes/audit-url.ts` — privileged skips the allowlist rejection,
  swaps validator, `check.parsed?` for filename.
- `apps/api/src/routes/audit-url-page.ts` — privileged passes an allow-all
  predicate to `auditPage` (private-IP check in the interceptor still runs).
- `apps/api/src/__tests__/rateLimiter.test.ts` (new), `pageAuditGuard.test.ts`
  (+1) — 13 new tests.
- `ecosystem.config.cjs` — forwards `API_PRIVILEGED_TOKEN` to the API process.

## Verification

- `pnpm --filter api build` (`tsc --noEmit`): clean.
- `pnpm --filter api test`: 510 passed.

## Deploy

1. Generate a token: `openssl rand -hex 32`.
2. Set `API_PRIVILEGED_TOKEN=<token>` in Forge env / `/etc/environment` (it is
   forwarded to PM2 via `ecosystem.config.cjs`).
3. `./rebuild.sh` (pulls `main` + restarts).
4. The trusted client sends `Authorization: Bearer <token>`.

## Notes

- Anonymous 500/hr fits `icjia-drone-app`'s ~320 single-IP files with ~180
  headroom — but cache hits and retries also count against it (the limiter runs
  before the dedup handler), so it's ~one pass per hour without the token.
- `drone.icjia.app` is already allow-listed (subdomain of `icjia.app`); the token
  is only needed for non-ICJIA public domains.
- In dev, `localhost` file URLs are rejected by the private-IP block for everyone,
  privileged included — point local testing at real public URLs.

# Site Password Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Password-protect the whole site with a single shared password — server-enforced (view-source-proof), remembered 7 days — while keeping the API reachable by the fleet audit via a bearer token.

**Architecture:** A Nitro server middleware on the web app intercepts every request before any page renders; without a valid `site_access` cookie it redirects to a self-contained `/unlock` page, so a real page's HTML is never sent. A successful unlock sets a 7-day signed cookie whose value is `sha256(salt:password)` — unforgeable, and auto-invalidated when the password is rotated. A parallel Express middleware on the API accepts the same cookie (humans) **or** a `fap_` personal access token (scripts/fleet audit). The gate is active only when `SITE_PASSWORD` is set in the environment, so local dev is frictionless by default.

**Tech Stack:** Nuxt 4 / Nitro server routes & middleware (`apps/web/server/`), Express middleware (`apps/api`), `node:crypto`, Vitest. Shared constants in root `audit.config.ts`.

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `audit.config.ts` | Modify | Add `SITE_GATE` constants (cookie name, max-age, token salt). No secrets, no crypto. |
| `apps/web/server/utils/site-gate.ts` | Create | Pure, testable helpers: token derivation, exempt-path check, unlock check, constant-time compare. |
| `apps/web/server/utils/unlock-page.ts` | Create | `renderUnlockPage()` — self-contained inline-HTML unlock form. |
| `apps/web/server/middleware/0.site-gate.ts` | Create | Nitro middleware — redirects un-cookied requests to `/unlock`. `0.` prefix runs it first. |
| `apps/web/server/routes/unlock.get.ts` | Create | Serves the unlock form. |
| `apps/web/server/routes/unlock.post.ts` | Create | Verifies the password, sets the cookie, rate-limited. |
| `apps/api/src/middleware/siteGate.ts` | Create | Express middleware — accepts `site_access` cookie OR `fap_` token; health endpoints exempt. |
| `apps/api/src/index.ts` | Modify | Mount `siteGate` after `cookieParser`/`globalLimiter`, before routes. |
| `apps/web/app/__tests__/site-gate.test.ts` | Create | Tests for the web pure helpers. |
| `apps/api/src/__tests__/siteGate.test.ts` | Create | Tests for the API middleware. |
| `ecosystem.config.cjs` | Modify | Forward `process.env.SITE_PASSWORD` into both PM2 apps. |
| `apps/web/.env` | Create (gitignored) | `SITE_PASSWORD=Icjia60605!!` for local dev. |
| `CHANGELOG.md`, `README.md`, `apps/web/app/pages/data-retention.vue`, 3× `package.json` | Modify | v1.23.0 release. |

**Why the API does NOT auto-load `apps/api/.env`:** verified — the API has no `dotenv`/`--env-file`. Prod env comes from PM2 `ecosystem.config.cjs` + Forge. So the password reaches the API in prod via ecosystem forwarding; in dev, via a shell `export` (documented).

---

## Task 1: `SITE_GATE` shared constants

**Files:**
- Modify: `audit.config.ts` (insert a new export after the `AUTH` block, ~line 556)

- [ ] **Step 1: Add the constants block**

Insert after the closing `};` of the `AUTH` export:

```ts
// ---------------------------------------------------------------------------
// SITE ACCESS GATE
// ---------------------------------------------------------------------------
// A single shared password that gates the whole site, independent of the
// OTP user-auth above. Active only when the SITE_PASSWORD environment
// variable is set (unset = gate disabled, e.g. local dev).
//
// The password itself is NEVER stored here or committed — it lives only in
// the environment (Forge "Environment" page / ecosystem.config.cjs).
// ---------------------------------------------------------------------------
export const SITE_GATE = {
  /** Cookie that records a successful unlock. */
  COOKIE_NAME: "site_access",
  /** How long an unlock is remembered, in days. */
  COOKIE_MAX_AGE_DAYS: 7,
  /**
   * Public domain-separation prefix mixed into the cookie-token hash. Bump
   * the version suffix to force every existing cookie to expire without
   * changing the password.
   */
  TOKEN_SALT: "file-audit-site-gate:v1",
} as const;
```

- [ ] **Step 2: Verify both projects still type-check**

Run: `pnpm build`
Expected: `Build complete!` (API `tsc --noEmit` + web build both clean).

- [ ] **Step 3: Commit**

```bash
git add audit.config.ts
git commit -m "feat(site-gate): add SITE_GATE shared constants"
```

---

## Task 2: Web pure helpers (`site-gate.ts`) — TDD

**Files:**
- Create: `apps/web/server/utils/site-gate.ts`
- Test: `apps/web/app/__tests__/site-gate.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/app/__tests__/site-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveSiteToken,
  isExemptPath,
  isUnlocked,
  safeCompare,
} from "../../server/utils/site-gate";

describe("deriveSiteToken", () => {
  it("is a 64-char hex string, deterministic per password", () => {
    const a = deriveSiteToken("hunter2");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveSiteToken("hunter2")).toBe(a);
  });
  it("differs when the password differs", () => {
    expect(deriveSiteToken("hunter2")).not.toBe(deriveSiteToken("hunter3"));
  });
});

describe("isExemptPath", () => {
  it("exempts the unlock route and the API proxy", () => {
    expect(isExemptPath("/unlock")).toBe(true);
    expect(isExemptPath("/api/analyze")).toBe(true);
  });
  it("does not exempt normal pages", () => {
    expect(isExemptPath("/")).toBe(false);
    expect(isExemptPath("/report/abc")).toBe(false);
  });
});

describe("isUnlocked", () => {
  it("is open when the gate is disabled (no password)", () => {
    expect(isUnlocked(undefined, "")).toBe(true);
  });
  it("rejects a missing or wrong cookie when the gate is on", () => {
    expect(isUnlocked(undefined, "pw")).toBe(false);
    expect(isUnlocked("wrong", "pw")).toBe(false);
  });
  it("accepts the cookie holding the correct token", () => {
    expect(isUnlocked(deriveSiteToken("pw"), "pw")).toBe(true);
  });
});

describe("safeCompare", () => {
  it("matches equal strings and rejects unequal ones", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
    expect(safeCompare("abc", "abd")).toBe(false);
    expect(safeCompare("abc", "abcd")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter web test site-gate`
Expected: FAIL — cannot resolve `../../server/utils/site-gate`.

- [ ] **Step 3: Implement `site-gate.ts`**

`apps/web/server/utils/site-gate.ts`:

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import { SITE_GATE } from "../../../../audit.config";

export const COOKIE_NAME = SITE_GATE.COOKIE_NAME;

/** The configured site password, or "" when the gate is disabled. */
export function sitePassword(): string {
  return process.env.SITE_PASSWORD ?? "";
}

/** Derive the opaque cookie token for a given site password. */
export function deriveSiteToken(password: string): string {
  return createHash("sha256")
    .update(`${SITE_GATE.TOKEN_SALT}:${password}`)
    .digest("hex");
}

/** Constant-time string compare (length-safe via hashing). */
export function safeCompare(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/** Paths the gate never blocks — the unlock flow and the API proxy. */
export function isExemptPath(path: string): boolean {
  return path === "/unlock" || path.startsWith("/api/");
}

/**
 * True when a request carrying `cookieValue` may pass: the gate is off, or
 * the cookie holds the token derived from the current password.
 */
export function isUnlocked(
  cookieValue: string | undefined,
  password: string,
): boolean {
  if (!password) return true; // gate disabled
  if (!cookieValue) return false;
  return safeCompare(cookieValue, deriveSiteToken(password));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter web test site-gate`
Expected: PASS (all 9 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/site-gate.ts apps/web/app/__tests__/site-gate.test.ts
git commit -m "feat(site-gate): web access-gate helpers with tests"
```

---

## Task 3: Unlock page HTML (`unlock-page.ts`)

**Files:**
- Create: `apps/web/server/utils/unlock-page.ts`

- [ ] **Step 1: Implement `unlock-page.ts`**

`apps/web/server/utils/unlock-page.ts`:

```ts
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Self-contained unlock page — inline CSS, no JS, no app assets. */
export function renderUnlockPage(opts: {
  next: string;
  error?: boolean;
  tooMany?: boolean;
}): string {
  const next = escapeAttr(opts.next || "/");
  const err = opts.tooMany
    ? `<p class="err">Too many attempts. Wait a few minutes and try again.</p>`
    : opts.error
      ? `<p class="err">Incorrect password.</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Access required</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
    justify-content:center; background:#0a0a0a; color:#e5e5e5;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { width:100%; max-width:340px; margin:16px; padding:32px; box-sizing:border-box;
    background:#161616; border:1px solid #2a2a2a; border-radius:12px; }
  h1 { margin:0 0 4px; font-size:18px; }
  p.sub { margin:0 0 20px; font-size:13px; color:#a3a3a3; }
  label { display:block; font-size:13px; margin-bottom:6px; }
  input { width:100%; padding:10px 12px; font-size:15px; box-sizing:border-box;
    background:#0a0a0a; border:1px solid #2a2a2a; border-radius:8px; color:#e5e5e5; }
  input:focus { outline:2px solid #14b8a6; outline-offset:1px; }
  button { width:100%; margin-top:16px; padding:11px; font-size:15px; font-weight:600;
    background:#14b8a6; color:#0a0a0a; border:0; border-radius:8px; cursor:pointer; }
  .err { margin:12px 0 0; font-size:13px; color:#f87171; }
</style>
</head>
<body>
  <main>
    <h1>This site is password-protected</h1>
    <p class="sub">Enter the access password to continue.</p>
    <form method="post" action="/unlock">
      <input type="hidden" name="next" value="${next}">
      <label for="pw">Password</label>
      <input id="pw" name="password" type="password" required autofocus
        autocomplete="current-password">
      <button type="submit">Unlock</button>
      ${err}
    </form>
  </main>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/unlock-page.ts
git commit -m "feat(site-gate): unlock page renderer"
```

---

## Task 4: Web Nitro middleware + unlock routes

**Files:**
- Create: `apps/web/server/middleware/0.site-gate.ts`
- Create: `apps/web/server/routes/unlock.get.ts`
- Create: `apps/web/server/routes/unlock.post.ts`

- [ ] **Step 1: Implement the gate middleware**

`apps/web/server/middleware/0.site-gate.ts`:

```ts
import { isExemptPath, isUnlocked, sitePassword, COOKIE_NAME } from "../utils/site-gate";

// Runs first on every request (the `0.` filename prefix orders it ahead of
// any other middleware). Un-cookied page requests are redirected to /unlock,
// so a protected page's HTML is never rendered or sent.
export default defineEventHandler((event) => {
  const password = sitePassword();
  if (!password) return; // gate disabled

  const path = event.path.split("?")[0];
  if (isExemptPath(path)) return;

  if (isUnlocked(getCookie(event, COOKIE_NAME), password)) return;

  return sendRedirect(event, `/unlock?next=${encodeURIComponent(event.path)}`, 302);
});
```

- [ ] **Step 2: Implement the unlock form route**

`apps/web/server/routes/unlock.get.ts`:

```ts
import { isUnlocked, sitePassword, COOKIE_NAME } from "../utils/site-gate";
import { renderUnlockPage } from "../utils/unlock-page";

export default defineEventHandler((event) => {
  const password = sitePassword();
  // Gate off, or already unlocked → no reason to show the form.
  if (!password || isUnlocked(getCookie(event, COOKIE_NAME), password)) {
    return sendRedirect(event, "/", 302);
  }
  const q = getQuery(event);
  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
  return renderUnlockPage({
    next: typeof q.next === "string" ? q.next : "/",
    error: q.error === "1",
  });
});
```

- [ ] **Step 3: Implement the verify route (rate-limited)**

`apps/web/server/routes/unlock.post.ts`:

```ts
import { deriveSiteToken, safeCompare, sitePassword, COOKIE_NAME } from "../utils/site-gate";
import { renderUnlockPage } from "../utils/unlock-page";
import { SITE_GATE } from "../../../../audit.config";

// Simple in-memory per-IP throttle. Resets on server restart — adequate for
// a brute-force deterrent on a strong shared password.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10;

/** Only allow same-site relative redirect targets. */
function safeNext(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}

export default defineEventHandler(async (event) => {
  const password = sitePassword();
  if (!password) return sendRedirect(event, "/", 302);

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  const now = Date.now();
  const rec = attempts.get(ip);
  const throttled =
    rec && now - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS;

  if (throttled) {
    setResponseStatus(event, 429);
    setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
    return renderUnlockPage({ next: "/", tooMany: true });
  }

  const body = await readBody(event);
  const submitted = typeof body?.password === "string" ? body.password : "";
  const next = safeNext(body?.next);

  if (!safeCompare(submitted, password)) {
    if (rec && now - rec.first < WINDOW_MS) rec.count += 1;
    else attempts.set(ip, { count: 1, first: now });
    return sendRedirect(
      event,
      `/unlock?error=1&next=${encodeURIComponent(next)}`,
      302,
    );
  }

  attempts.delete(ip);
  setCookie(event, COOKIE_NAME, deriveSiteToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_GATE.COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
  });
  return sendRedirect(event, next, 302);
});
```

- [ ] **Step 4: Manual verification (web gate end-to-end)**

```bash
SITE_PASSWORD=Icjia60605!! pnpm --filter web dev
```

In a browser at `http://localhost:5102`:
- Visiting `/` redirects to `/unlock`. **View source** → only the unlock form, no app HTML.
- Wrong password → "Incorrect password.", stays on `/unlock`.
- Correct password → redirected to `/`, the app loads normally.
- Reload `/` → no prompt (cookie present). DevTools → Application → Cookies: `site_access`, ~7-day expiry, `HttpOnly`.
- Stop dev, restart **without** `SITE_PASSWORD` → no gate (open).

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/middleware/0.site-gate.ts apps/web/server/routes/unlock.get.ts apps/web/server/routes/unlock.post.ts
git commit -m "feat(site-gate): Nitro gate middleware + unlock routes"
```

---

## Task 5: API site gate (`siteGate.ts`) — TDD

**Files:**
- Create: `apps/api/src/middleware/siteGate.ts`
- Modify: `apps/api/src/index.ts` (mount after line 54)
- Test: `apps/api/src/__tests__/siteGate.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/siteGate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { siteGate } from "../middleware/siteGate.js";
import { SITE_GATE } from "#config";
import db from "../db/sqlite.js";

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res as Response;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

function mockReq(over: Partial<Request> = {}): Request {
  return { path: "/api/analyze", cookies: {}, headers: {}, ...over } as Request;
}

const PW = "test-secret";
const token = createHash("sha256")
  .update(`${SITE_GATE.TOKEN_SALT}:${PW}`)
  .digest("hex");

describe("siteGate", () => {
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
  });

  it("passes everything through when SITE_PASSWORD is unset", () => {
    const next = vi.fn();
    siteGate(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a request with no credentials when the gate is on", () => {
    process.env.SITE_PASSWORD = PW;
    const next = vi.fn();
    const res = mockRes();
    siteGate(mockReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid site_access cookie", () => {
    process.env.SITE_PASSWORD = PW;
    const next = vi.fn();
    siteGate(mockReq({ cookies: { site_access: token } }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a wrong site_access cookie", () => {
    process.env.SITE_PASSWORD = PW;
    const next = vi.fn();
    const res = mockRes();
    siteGate(mockReq({ cookies: { site_access: "wrong" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("always exempts the health endpoints", () => {
    process.env.SITE_PASSWORD = PW;
    const next = vi.fn();
    siteGate(mockReq({ path: "/api/health" }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("accepts a valid fap_ bearer token", () => {
    process.env.SITE_PASSWORD = PW;
    const raw = "fap_sitegatetest000000000000000000";
    const hash = createHash("sha256").update(raw).digest("hex");
    db.prepare(
      "INSERT INTO access_tokens (id, email, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("sg-test-1", "test@illinois.gov", "sitegate-test", hash, new Date().toISOString());
    try {
      const next = vi.fn();
      siteGate(
        mockReq({ headers: { authorization: `Bearer ${raw}` } }),
        mockRes(),
        next,
      );
      expect(next).toHaveBeenCalledOnce();
    } finally {
      db.prepare("DELETE FROM access_tokens WHERE id = ?").run("sg-test-1");
    }
  });
});
```

> **Note:** confirm the `access_tokens` column list against `apps/api/src/db/sqlite.ts` before running — adjust the `INSERT` to the real schema (it has `id, email, name, token_hash, created_at, last_used_at, revoked_at`; the test inserts the non-null subset).

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter api test siteGate`
Expected: FAIL — cannot resolve `../middleware/siteGate.js`.

- [ ] **Step 3: Implement `siteGate.ts`**

`apps/api/src/middleware/siteGate.ts`:

```ts
import { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { SITE_GATE } from "#config";
import db from "../db/sqlite.js";

const TOKEN_PREFIX = "fap_";
// Non-sensitive endpoints kept open for uptime monitoring.
const EXEMPT = new Set(["/", "/api", "/api/health"]);

function deriveSiteToken(password: string): string {
  return createHash("sha256")
    .update(`${SITE_GATE.TOKEN_SALT}:${password}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Outermost site-access gate. Active only when SITE_PASSWORD is set. A request
 * passes when it carries either a valid `site_access` cookie (a human who
 * unlocked the site) or a valid `fap_` personal access token (a script — e.g.
 * the fleet audit). Independent of the OTP user-auth in authMiddleware.
 */
export function siteGate(req: Request, res: Response, next: NextFunction): void {
  const password = process.env.SITE_PASSWORD ?? "";
  if (!password) {
    next();
    return;
  }
  if (EXEMPT.has(req.path)) {
    next();
    return;
  }

  // 1. Human path — the site_access cookie.
  const cookie = req.cookies?.[SITE_GATE.COOKIE_NAME];
  if (typeof cookie === "string" && safeEqual(cookie, deriveSiteToken(password))) {
    next();
    return;
  }

  // 2. Script path — a personal access token. (Mirrors the PAT lookup in
  //    authMiddleware; kept self-contained so the gate has no dependency on
  //    the user-auth layer.)
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith(`Bearer ${TOKEN_PREFIX}`)) {
    const raw = authHeader.slice("Bearer ".length);
    const hash = createHash("sha256").update(raw).digest("hex");
    const row = db
      .prepare("SELECT id FROM access_tokens WHERE token_hash = ? AND revoked_at IS NULL")
      .get(hash);
    if (row) {
      next();
      return;
    }
  }

  res.status(401).json({
    error: "Site access required.",
    details:
      "This site is password-protected. Open it in a browser to enter the access password, or supply a valid API token (Authorization: Bearer fap_…).",
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter api test siteGate`
Expected: PASS (6 assertions).

- [ ] **Step 5: Mount the middleware in `index.ts`**

In `apps/api/src/index.ts`, add the import alongside the others (after line 5):

```ts
import { siteGate } from './middleware/siteGate.js'
```

And mount it between the global rate limit and the routes (after line 54, `app.use(globalLimiter)`):

```ts
// Global rate limit
app.use(globalLimiter)

// Site access gate — outermost layer; see middleware/siteGate.ts.
app.use(siteGate)

// Routes
```

- [ ] **Step 6: Full suite + build**

Run: `pnpm --filter api test` → all API tests pass.
Run: `pnpm build` → `Build complete!`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/siteGate.ts apps/api/src/__tests__/siteGate.test.ts apps/api/src/index.ts
git commit -m "feat(site-gate): API gate accepting site cookie or fap_ token"
```

---

## Task 6: Environment wiring

**Files:**
- Modify: `ecosystem.config.cjs`
- Create: `apps/web/.env` (gitignored)

- [ ] **Step 1: Forward `SITE_PASSWORD` in `ecosystem.config.cjs`**

Add a `siteGateEnv` const next to `remediationEnv`:

```js
const siteGateEnv = {
  // Site-wide access password. Unset = gate disabled. Set this on the
  // server (Forge "Environment" page or /etc/environment).
  SITE_PASSWORD: process.env.SITE_PASSWORD || '',
}
```

Spread it into **both** app `env` blocks alongside `...remediationEnv`:

```js
      env: {
        NODE_ENV: 'production',
        PORT: 5103,
        ...remediationEnv,
        ...siteGateEnv,
      },
```

(and likewise for the `file-audit-web` app, `PORT: 5102`).

- [ ] **Step 2: Seed the local dev env file**

Create `apps/web/.env` (already covered by `.gitignore`):

```
SITE_PASSWORD=Icjia60605!!
```

Nuxt auto-loads this in `pnpm dev`, so the web gate is active locally. (To exercise the **API** gate locally too, `export SITE_PASSWORD=Icjia60605!!` in the shell before `pnpm dev` — the API does not auto-load `.env`.)

- [ ] **Step 3: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "feat(site-gate): forward SITE_PASSWORD through PM2 ecosystem"
```
(`apps/web/.env` is gitignored — not committed.)

---

## Task 7: Release v1.23.0

**Files:** `CHANGELOG.md`, `README.md`, `apps/web/app/pages/data-retention.vue`, root + `apps/web` + `apps/api` `package.json`, `apps/web/nuxt.config.ts` (`dateModified`).

- [ ] **Step 1: Version bump** — `1.22.3` → `1.23.0` in all three `package.json`; `dateModified` in `nuxt.config.ts` → today's date.

- [ ] **Step 2: `CHANGELOG.md`** — new `## [1.23.0]` entry: `### Added — Site access password gate`, describing the shared-password gate, the 7-day cookie, view-source protection, and the API accepting the cookie or a `fap_` token.

- [ ] **Step 3: `README.md`** — add a short "Site access password" subsection under `## Authentication` (how to set `SITE_PASSWORD`, that it's a 7-day cookie, how to rotate, that the fleet audit uses a PAT); add the `### v1.23.0` entry to the `## Security` log (new feature — describe the gate and its threat model: shared password, hashed cookie, rate-limited unlock, no new data egress).

- [ ] **Step 4: `data-retention.vue` § 10** — add a `<!-- v1.23.0 audit entry -->` `<article>` (plain language: the site now requires a password; nothing about data collection/retention changed).

- [ ] **Step 5: Build + full test suite**

Run: `pnpm --filter api test && pnpm --filter web test && pnpm build`
Expected: all green, `Build complete!`

- [ ] **Step 6: Commit, tag, push**

```bash
git add -A
git commit -m "chore(release): v1.23.0 — site access password gate"
git tag v1.23.0
git push origin main v1.23.0
```

---

## Deploy prerequisites (operator — do before/at deploy)

1. **Mint a fleet-audit PAT *now*, while the API is still open:** one authenticated `POST /api/tokens` call → save the returned `fap_…` string into the fleet-audit config. (Once the gate is live you need an existing credential to mint new tokens.)
2. On the server, set `SITE_PASSWORD=Icjia60605!!` in Forge's Environment page (or `/etc/environment`), then `git pull` + `./rebuild.sh`.
3. To rotate weekly: change `SITE_PASSWORD`, `pm2 restart ecosystem.config.cjs`. Every existing cookie is invalidated automatically; the fleet-audit PAT is unaffected.

---

## Self-Review

**Spec coverage:**
- "Add the password `Icjia60605!!`" → Task 6 (env var; gitignored `.env` local, Forge env prod). ✓
- "Wiseguy can't view source / all pages protected" → Task 4 middleware redirects before render. ✓
- "No daily prompt, save 7 days" → 7-day `httpOnly` cookie (Task 4 / Task 1 `COOKIE_MAX_AGE_DAYS`). ✓
- "Rotate every 7 days" → env-var change + restart; rotation auto-invalidates cookies (Task 1 token salt + Task 4). ✓
- "API: same password OR bearer token; fleet audit without issues" → Task 5 (`site_access` cookie OR `fap_` PAT; PAT is long-lived, unaffected by rotation). ✓

**Placeholder scan:** none — all code is complete. One flagged verification: the `access_tokens` `INSERT` column list in the Task 5 test must be checked against `db/sqlite.ts` before running.

**Type/name consistency:** `COOKIE_NAME`, `deriveSiteToken`, `safeCompare`, `isUnlocked`, `isExemptPath`, `sitePassword`, `siteGate`, `SITE_GATE.{COOKIE_NAME,COOKIE_MAX_AGE_DAYS,TOKEN_SALT}` — used consistently across web and API. The web token derivation (`site-gate.ts`) and API token derivation (`siteGate.ts`) both compute `sha256(SITE_GATE.TOKEN_SALT + ":" + password)` — identical, so the cookie validates on both sides.

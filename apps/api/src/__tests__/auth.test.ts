import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Response, NextFunction } from "express";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Force auth-enabled mode for these tests
vi.mock("#config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#config")>();
  return { ...actual, AUTH: { ...actual.AUTH, REQUIRE_LOGIN: true } };
});

// C4: authMiddleware's session branch now checks the jti denylist (a real
// SQLite query), so — like remediationJobs.test.ts / migrations.test.ts —
// DB_PATH must point at an isolated temp file BEFORE the dynamic import
// below triggers db/sqlite.js's module-load side effects. Previously this
// file never actually touched the db (the cookie/JWT branch had no db
// access at all), so this wasn't needed until now.
const tmpDir = mkdtempSync(join(tmpdir(), "auth-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");

const { authMiddleware, adminMiddleware } = await import("../middleware/authMiddleware.js");
import type { AuthRequest } from "../middleware/authMiddleware.js";
const { revokeJti, isJtiRevoked } = await import("../services/jtiDenylist.js");

// ---------------------------------------------------------------------------
// Helpers: mock Express req / res / next
// ---------------------------------------------------------------------------

const JWT_SECRET = "dev-secret-do-not-use-in-production";

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    cookies: {},
    ...overrides,
  } as AuthRequest;
}

function makeRes(): Response {
  const res: any = {
    _status: 0,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };
  return res as Response;
}

function makeNext(): NextFunction & { called: boolean } {
  const fn: any = () => {
    fn.called = true;
  };
  fn.called = false;
  return fn;
}

// ---------------------------------------------------------------------------
// authMiddleware
// ---------------------------------------------------------------------------

describe("authMiddleware", () => {
  it("returns 401 when no token cookie is present", () => {
    const req = makeReq({ cookies: {} });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect((res as any)._json.error).toContain("Authentication required");
    expect(next.called).toBe(false);
  });

  it("returns 401 when cookies object is undefined", () => {
    const req = makeReq();
    // Simulate no cookie-parser: cookies is undefined
    (req as any).cookies = undefined;
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect(next.called).toBe(false);
  });

  it("returns 401 when token is invalid", () => {
    const req = makeReq({ cookies: { token: "garbage.token.here" } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect((res as any)._json.error).toContain("expired");
    expect(next.called).toBe(false);
  });

  it("returns 401 when token is expired", () => {
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s", // already expired
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect(next.called).toBe(false);
  });

  it("returns 401 when token uses wrong algorithm", () => {
    // Sign with HS384 but middleware only accepts HS256
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS384",
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect(next.called).toBe(false);
  });

  it("returns 401 when token signed with wrong secret", () => {
    const token = jwt.sign({ email: "user@illinois.gov" }, "wrong-secret", {
      algorithm: "HS256",
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect(next.called).toBe(false);
  });

  it("sets req.user and calls next() with a valid token", () => {
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect(next.called).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user!.email).toBe("user@illinois.gov");
  });

  it("preserves full email from token payload", () => {
    const token = jwt.sign({ email: "admin@icjia.illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect(req.user!.email).toBe("admin@icjia.illinois.gov");
  });
});

// ---------------------------------------------------------------------------
// authMiddleware: jti denylist (C4 — server-side JWT revocation on logout)
// ---------------------------------------------------------------------------

describe("authMiddleware: jti denylist", () => {
  it("accepts a token carrying a jti that has NOT been revoked, and surfaces jti/exp on req.user", () => {
    const jti = "not-revoked-jti";
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: jti,
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect(next.called).toBe(true);
    expect(req.user!.jti).toBe(jti);
    expect(typeof req.user!.exp).toBe("number");
  });

  it("rejects (401) a token whose jti has been revoked, even though the signature and exp are otherwise valid", () => {
    const jti = "revoked-jti";
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: jti,
    });
    revokeJti(jti, Date.now() + 60 * 60_000);

    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect((res as any)._status).toBe(401);
    expect(next.called).toBe(false);
  });

  it("a token with NO jti at all (legacy, signed before this feature existed) is still accepted until its own expiry", () => {
    // No `jwtid` option — mirrors every token minted before C4.
    const token = jwt.sign({ email: "user@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const req = makeReq({ cookies: { token } });
    const res = makeRes();
    const next = makeNext();

    authMiddleware(req, res, next);

    expect(next.called).toBe(true);
    expect(req.user!.jti).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// /verify and /logout routes: jti is minted at login and revoked at logout
// (C4). The route module is imported for real (not reimplemented) via
// extractHandler, the same pattern audit-url.test.ts / audit-url-page.test.ts
// use to invoke a real Express route handler without supertest or a running
// server: a router.post(path, ...middleware, handler) registration stores
// each function as a Layer in `.stack`; the LAST layer of the matching
// route is the async handler itself (rate limiters / authMiddleware — the
// earlier layers — are never invoked, so they need no mocking here).
// ---------------------------------------------------------------------------

function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

function makeRouteRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    _cookies: {} as Record<string, { value: string; options: unknown }>,
    _clearedCookies: [] as string[],
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
    cookie(name: string, value: string, options: unknown) {
      res._cookies[name] = { value, options };
      return res;
    },
    clearCookie(name: string) {
      res._clearedCookies.push(name);
      return res;
    },
  };
  return res;
}

describe("POST /verify: issues a JWT containing a jti", () => {
  it("a successful OTP verify sets a session cookie whose JWT carries a jti claim", async () => {
    const db = (await import("../db/sqlite.js")).default;
    const router = (await import("../routes/auth.js")).default;
    const handler = extractHandler(router, "/verify");

    const email = "verify-jti@illinois.gov";
    const otp = "123456";
    const otpHash = await bcrypt.hash(otp, 10);
    db.prepare(
      "INSERT INTO otp_codes (email, otp_hash, attempts, expires_at) VALUES (?, ?, 0, datetime('now', '+10 minutes'))",
    ).run(email, otpHash);

    const req = { body: { email, otp }, ip: "203.0.113.5", get: vi.fn(() => undefined) };
    const res = makeRouteRes();

    await handler(req, res);

    expect(res._json).toEqual({ ok: true });
    const cookie = res._cookies.token;
    expect(cookie).toBeDefined();
    const decoded = jwt.verify(cookie.value, JWT_SECRET, { algorithms: ["HS256"] }) as {
      email: string;
      jti?: string;
    };
    expect(decoded.email).toBe(email);
    expect(typeof decoded.jti).toBe("string");
    expect(decoded.jti!.length).toBeGreaterThan(0);
  });
});

describe("POST /logout: revokes the session's jti", () => {
  it("logout inserts the session jti into the denylist; a subsequent request with that token is then rejected (401)", async () => {
    const router = (await import("../routes/auth.js")).default;
    const handler = extractHandler(router, "/logout");

    const jti = "logout-flow-jti";
    const token = jwt.sign({ email: "logout@illinois.gov" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: jti,
    });
    // Simulate what authMiddleware would have already set on req.user by
    // the time the logout handler runs (authMiddleware itself is an
    // earlier layer in the SAME route registration and is not re-invoked
    // by extractHandler — see the file-level comment above).
    const decoded = jwt.decode(token) as { email: string; jti: string; exp: number };
    const req = {
      user: { email: decoded.email, jti: decoded.jti, exp: decoded.exp, authMethod: "session" },
      ip: "203.0.113.5",
      get: vi.fn(() => undefined),
    };
    const res = makeRouteRes();

    expect(isJtiRevoked(jti)).toBe(false);

    handler(req, res);

    expect(res._json).toEqual({ ok: true });
    expect(res._clearedCookies).toContain("token");
    expect(isJtiRevoked(jti)).toBe(true);

    // And the same token is now rejected by authMiddleware.
    const req2 = makeReq({ cookies: { token } });
    const res2 = makeRes();
    const next2 = makeNext();
    authMiddleware(req2, res2, next2);
    expect((res2 as any)._status).toBe(401);
    expect(next2.called).toBe(false);
  });

  it("logout is a no-op on the denylist for a legacy session with no jti (nothing to revoke)", async () => {
    const router = (await import("../routes/auth.js")).default;
    const handler = extractHandler(router, "/logout");

    const req = {
      user: { email: "legacy@illinois.gov", authMethod: "session" },
      ip: "203.0.113.5",
      get: vi.fn(() => undefined),
    };
    const res = makeRouteRes();

    expect(() => handler(req, res)).not.toThrow();
    expect(res._json).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// adminMiddleware
// ---------------------------------------------------------------------------

describe("adminMiddleware", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalEnv;
    }
  });

  it("returns 403 when user is not in ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "boss@illinois.gov";
    const req = makeReq();
    req.user = { email: "regular@illinois.gov" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect((res as any)._status).toBe(403);
    expect((res as any)._json.error).toContain("Admin");
    expect(next.called).toBe(false);
  });

  it("returns 403 when req.user is not set", () => {
    process.env.ADMIN_EMAILS = "boss@illinois.gov";
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect((res as any)._status).toBe(403);
    expect(next.called).toBe(false);
  });

  it("returns 403 when ADMIN_EMAILS is empty", () => {
    process.env.ADMIN_EMAILS = "";
    const req = makeReq();
    req.user = { email: "anyone@illinois.gov" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect((res as any)._status).toBe(403);
    expect(next.called).toBe(false);
  });

  it("calls next() when user email matches ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "boss@illinois.gov,admin@illinois.gov";
    const req = makeReq();
    req.user = { email: "admin@illinois.gov" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it("comparison is case-insensitive", () => {
    process.env.ADMIN_EMAILS = "Admin@Illinois.GOV";
    const req = makeReq();
    req.user = { email: "admin@illinois.gov" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it("handles whitespace in ADMIN_EMAILS list", () => {
    process.env.ADMIN_EMAILS = " boss@illinois.gov , admin@illinois.gov ";
    const req = makeReq();
    req.user = { email: "admin@illinois.gov" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it("NEVER admits the anonymous sentinel, even if misconfigured into ADMIN_EMAILS", () => {
    // In no-auth mode authMiddleware injects email:'anonymous'. The admin
    // gate must reject it unconditionally so an operator can't accidentally
    // expose the cross-tenant audit log by adding 'anonymous' to the list.
    process.env.ADMIN_EMAILS = "anonymous,boss@illinois.gov";
    const req = makeReq();
    req.user = { email: "anonymous" };
    const res = makeRes();
    const next = makeNext();

    adminMiddleware(req, res, next);

    expect((res as any)._status).toBe(403);
    expect(next.called).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAllowedEmail — tested via the auth route module
// ---------------------------------------------------------------------------

describe("isAllowedEmail (via auth route)", () => {
  // isAllowedEmail is not exported, but we can test the regex from the config
  // and the domain logic by importing AUTH directly.

  // We import the regex from config and test it directly since the function
  // is private to the auth route module.
  let ALLOWED_EMAIL_REGEX: RegExp;

  beforeEach(async () => {
    const config = await import("#config");
    ALLOWED_EMAIL_REGEX = config.AUTH.ALLOWED_EMAIL_REGEX;
  });

  it("accepts user@illinois.gov", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@illinois.gov")).toBe(true);
  });

  it("accepts user@icjia.illinois.gov (subdomain)", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@icjia.illinois.gov")).toBe(true);
  });

  it("accepts user@dhs.illinois.gov (another subdomain)", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@dhs.illinois.gov")).toBe(true);
  });

  it("accepts user@deep.sub.illinois.gov (deep subdomain)", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@deep.sub.illinois.gov")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(ALLOWED_EMAIL_REGEX.test("User@ILLINOIS.GOV")).toBe(true);
  });

  it("rejects user@gmail.com", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@gmail.com")).toBe(false);
  });

  it("rejects user@notillinois.gov", () => {
    expect(ALLOWED_EMAIL_REGEX.test("user@notillinois.gov")).toBe(false);
  });

  it("rejects user@illinois.gov.evil.com", () => {
    // The regex anchors with $, so this should not match
    expect(ALLOWED_EMAIL_REGEX.test("user@illinois.gov.evil.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(ALLOWED_EMAIL_REGEX.test("")).toBe(false);
  });

  it("rejects email without @ sign", () => {
    expect(ALLOWED_EMAIL_REGEX.test("userillinois.gov")).toBe(false);
  });

  it("rejects @illinois.gov without local part", () => {
    expect(ALLOWED_EMAIL_REGEX.test("@illinois.gov")).toBe(false);
  });
});

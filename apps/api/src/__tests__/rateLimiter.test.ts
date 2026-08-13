import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isPrivilegedRequest,
  tierLimit,
  tierKey,
  tieredLimiter,
  isRemediationStatusRequest,
  isStatusRequest,
  isGlobalLimitExempt,
  globalLimiter,
  remediationStatusLimiter,
  authOutcome,
  warnIfTokenRejected,
  resetBadTokenWarnThrottle,
} from "../middleware/rateLimiter.js";
import { RATE_LIMITS } from "#config";

// ---------------------------------------------------------------------------
// Privileged bearer-token tier for the rate limiters.
//
// isPrivilegedRequest reads process.env.API_PRIVILEGED_TOKEN directly (the same
// pattern authMiddleware uses for JWT_SECRET), so these tests just set/clear
// the env var — no #config mocking required.
// ---------------------------------------------------------------------------

const TOKEN = "super-secret-privileged-token-123";

function makeReq(overrides: any = {}): any {
  return {
    ip: "203.0.113.7",
    headers: {},
    app: { get: (k: string) => (k === "trust proxy" ? 1 : undefined) },
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN;
});
afterEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN;
});

describe("isPrivilegedRequest", () => {
  it("returns false when no token is configured (feature off)", () => {
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } }))).toBe(
      false,
    );
  });

  it("returns true for the exact configured token", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } }))).toBe(
      true,
    );
  });

  it("returns false for a wrong token", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: "Bearer wrong-token" } }))).toBe(
      false,
    );
  });

  it("returns false when the Authorization header is missing", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(isPrivilegedRequest(makeReq())).toBe(false);
  });

  it("returns false for a non-Bearer scheme", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: TOKEN } }))).toBe(false);
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: `Basic ${TOKEN}` } }))).toBe(
      false,
    );
  });

  it("returns false for an empty bearer value", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(isPrivilegedRequest(makeReq({ headers: { authorization: "Bearer " } }))).toBe(false);
  });

  it("returns false for a token that is a prefix of the configured one", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN.slice(0, -1)}` } })),
    ).toBe(false);
  });

  it("returns false for a token longer than the configured one", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    expect(
      isPrivilegedRequest(makeReq({ headers: { authorization: `Bearer ${TOKEN}extra` } })),
    ).toBe(false);
  });
});

describe("tier selection (tierLimit / tierKey)", () => {
  const cfg = { anon: 500, privileged: 5000 };

  it("anonymous → strict limit, per-IP key", () => {
    const req = makeReq({ ip: "198.51.100.9" });
    expect(tierLimit(req, cfg)).toBe(500);
    expect(tierKey(req)).toBe("198.51.100.9");
  });

  it("valid token → generous limit, single shared bucket", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    const req = makeReq({
      ip: "198.51.100.9",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(tierLimit(req, cfg)).toBe(5000);
    expect(tierKey(req)).toBe("privileged");
  });

  it("wrong token → falls back to the strict anonymous tier", () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    const req = makeReq({
      ip: "198.51.100.9",
      headers: { authorization: "Bearer nope" },
    });
    expect(tierLimit(req, cfg)).toBe(500);
    expect(tierKey(req)).toBe("198.51.100.9");
  });
});

describe("tieredLimiter (integration)", () => {
  function makeRes(onResponse: () => void): any {
    const res: any = {
      _status: 200,
      headersSent: false,
      statusCode: 200,
      _headers: {} as Record<string, unknown>,
      status(code: number) {
        res._status = code;
        res.statusCode = code;
        return res;
      },
      json() {
        onResponse();
        return res;
      },
      send() {
        onResponse();
        return res;
      },
      setHeader(k: string, v: unknown) {
        res._headers[k] = v;
        return res;
      },
      getHeader(k: string) {
        return res._headers[k];
      },
      removeHeader(k: string) {
        delete res._headers[k];
        return res;
      },
      on() {
        return res;
      },
      end() {
        onResponse();
        return res;
      },
    };
    return res;
  }

  // Drive one request through a limiter; resolve whether it was rate-limited.
  function hit(limiter: any, req: any): Promise<{ limited: boolean; status: number }> {
    return new Promise((resolve) => {
      const res = makeRes(() => resolve({ limited: true, status: res._status }));
      limiter(req, res, () => resolve({ limited: false, status: 200 }));
    });
  }

  it("caps anonymous callers at the anon limit, but lets a token exceed it on the same IP", async () => {
    process.env.API_PRIVILEGED_TOKEN = TOKEN;
    const limiter = tieredLimiter({
      name: "test",
      windowMs: 60_000,
      anon: 2,
      privileged: 6,
      message: { error: "x" },
    });

    const anon = () => makeReq({ ip: "198.51.100.50" });
    expect((await hit(limiter, anon())).limited).toBe(false); // 1
    expect((await hit(limiter, anon())).limited).toBe(false); // 2
    const third = await hit(limiter, anon());
    expect(third.limited).toBe(true); // 3rd > anon cap of 2
    expect(third.status).toBe(429);

    // Same IP, now WITH the token → a separate, more generous bucket.
    const priv = () =>
      makeReq({ ip: "198.51.100.50", headers: { authorization: `Bearer ${TOKEN}` } });
    for (let i = 0; i < 6; i++) {
      expect((await hit(limiter, priv())).limited).toBe(false); // 1..6 allowed
    }
    expect((await hit(limiter, priv())).limited).toBe(true); // 7th > privileged cap of 6
  });

  // -------------------------------------------------------------------------
  // Remediation status-poll exemption (the 2026-07 "auto remediate reported
  // Too many requests" bug): the progress page polls GET
  // /api/remediate/:jobId/status, which must not drain the global burst
  // budget. It gets its own generous limiter instead.
  // -------------------------------------------------------------------------

  describe("isRemediationStatusRequest", () => {
    it("matches GET /api/remediate/:jobId/status", () => {
      expect(
        isRemediationStatusRequest(
          makeReq({ method: "GET", path: "/api/remediate/abc-123/status" }),
        ),
      ).toBe(true);
    });

    it("does not match other methods, other remediation routes, or other paths", () => {
      const cases = [
        { method: "POST", path: "/api/remediate/abc-123/status" },
        { method: "GET", path: "/api/remediate/abc-123/download" },
        { method: "GET", path: "/api/remediate/abc-123/receipt" },
        { method: "GET", path: "/api/remediate" },
        { method: "GET", path: "/api/remediate//status" },
        { method: "GET", path: "/api/remediate/a/b/status" },
        { method: "GET", path: "/api/analyze" },
      ];
      for (const c of cases) {
        expect(isRemediationStatusRequest(makeReq(c))).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Public /api/status exemption. The Nitro tier proxies /status over
  // loopback, so every browser hit arrives as 127.0.0.1 and shares ONE global
  // bucket. Under globalLimiter, ordinary site traffic could 429 the status
  // page — making it unavailable exactly when someone is checking whether the
  // service is healthy.
  // -------------------------------------------------------------------------

  describe("isStatusRequest", () => {
    it("matches GET /api/status", () => {
      expect(isStatusRequest(makeReq({ method: "GET", path: "/api/status" }))).toBe(true);
    });

    it("does not match other methods or lookalike paths", () => {
      const cases = [
        { method: "POST", path: "/api/status" },
        { method: "GET", path: "/api/status/detail" },
        { method: "GET", path: "/api/statuses" },
        { method: "GET", path: "/status" },
        { method: "GET", path: "/api/remediate/abc/status" },
      ];
      for (const c of cases) {
        expect(isStatusRequest(makeReq(c))).toBe(false);
      }
    });
  });

  describe("isGlobalLimitExempt", () => {
    it("exempts both the remediation poll and the public status document", () => {
      expect(isGlobalLimitExempt(makeReq({ method: "GET", path: "/api/status" }))).toBe(true);
      expect(
        isGlobalLimitExempt(makeReq({ method: "GET", path: "/api/remediate/abc/status" })),
      ).toBe(true);
    });

    it("exempts nothing else — the global cap still covers every real route", () => {
      const cases = [
        { method: "POST", path: "/api/analyze" },
        { method: "GET", path: "/api/health" },
        { method: "GET", path: "/api/reports/abc" },
        { method: "POST", path: "/api/status" },
      ];
      for (const c of cases) {
        expect(isGlobalLimitExempt(makeReq(c))).toBe(false);
      }
    });
  });

  it("tieredLimiter skip: skipped requests are never limited and do not drain the bucket", async () => {
    const limiter = tieredLimiter({
      name: "test",
      windowMs: 60_000,
      anon: 2,
      privileged: 6,
      message: { error: "x" },
      skip: (req: any) => req.path === "/exempt",
    });
    const exempt = () => makeReq({ ip: "198.51.100.60", path: "/exempt" });
    const normal = () => makeReq({ ip: "198.51.100.60", path: "/other" });

    // Far more exempt hits than the cap — none limited.
    for (let i = 0; i < 5; i++) {
      expect((await hit(limiter, exempt())).limited).toBe(false);
    }
    // The bucket is untouched: the anon cap of 2 is still fully available.
    expect((await hit(limiter, normal())).limited).toBe(false); // 1
    expect((await hit(limiter, normal())).limited).toBe(false); // 2
    expect((await hit(limiter, normal())).limited).toBe(true); // 3rd > cap
  });

  it("globalLimiter exempts remediation status polls but still caps everything else", async () => {
    const ip = "198.51.100.70";
    const statusPoll = () => makeReq({ ip, method: "GET", path: "/api/remediate/job-1/status" });
    const other = () => makeReq({ ip, method: "GET", path: "/api/health" });

    // Sustained polling past the anon cap (100/min) — never limited.
    for (let i = 0; i < RATE_LIMITS.global.anon + 20; i++) {
      expect((await hit(globalLimiter, statusPoll())).limited).toBe(false);
    }

    // The polling consumed nothing: the full anon budget remains for
    // ordinary routes, and the cap still enforces beyond it.
    for (let i = 0; i < RATE_LIMITS.global.anon; i++) {
      expect((await hit(globalLimiter, other())).limited).toBe(false);
    }
    const overCap = await hit(globalLimiter, other());
    expect(overCap.limited).toBe(true);
    expect(overCap.status).toBe(429);
  });

  it("remediationStatusLimiter caps a single IP at its own generous limit", async () => {
    const ip = "198.51.100.80";
    const statusPoll = () => makeReq({ ip, method: "GET", path: "/api/remediate/job-1/status" });

    for (let i = 0; i < RATE_LIMITS.remediationStatus.max; i++) {
      expect((await hit(remediationStatusLimiter, statusPoll())).limited).toBe(false);
    }
    const overCap = await hit(remediationStatusLimiter, statusPoll());
    expect(overCap.limited).toBe(true);
    expect(overCap.status).toBe(429);
  });

  it("remediationStatusLimiter is sized so legitimate polling cannot trip it", () => {
    // Client polls at 1 s → 60/min/job. The cap must comfortably allow
    // several concurrent tabs/jobs from one office IP.
    expect(RATE_LIMITS.remediationStatus.windowMs).toBe(60_000);
    expect(RATE_LIMITS.remediationStatus.max).toBeGreaterThanOrEqual(300);
  });

  // -------------------------------------------------------------------------
  // Observability (added after the 2026-08-12 "server is offline" incident,
  // which was an unlogged anonymous-tier throttle of a fleet-audit run).
  // -------------------------------------------------------------------------
  describe("authOutcome", () => {
    it("reports 'none' when no Bearer credential is presented", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      expect(authOutcome(makeReq())).toBe("none");
      expect(authOutcome(makeReq({ headers: { authorization: `Basic ${TOKEN}` } }))).toBe("none");
    });

    it("reports 'valid' for the configured token", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      expect(authOutcome(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } }))).toBe("valid");
    });

    it("distinguishes a WRONG token from an UNCONFIGURED server", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      expect(authOutcome(makeReq({ headers: { authorization: "Bearer nope" } }))).toBe("invalid");

      delete process.env.API_PRIVILEGED_TOKEN;
      expect(authOutcome(makeReq({ headers: { authorization: "Bearer nope" } }))).toBe(
        "unconfigured",
      );
    });
  });

  describe("warnIfTokenRejected", () => {
    let warn: any;
    beforeEach(() => {
      resetBadTokenWarnThrottle();
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it("warns when a presented token does not match", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      expect(warnIfTokenRejected(makeReq({ headers: { authorization: "Bearer nope" } }))).toBe(
        true,
      );
      expect(warn.mock.calls[0][0]).toContain("did NOT match");
      expect(warn.mock.calls[0][0]).toContain("ANONYMOUS");
    });

    it("warns when a token is presented but the server has none configured", () => {
      expect(warnIfTokenRejected(makeReq({ headers: { authorization: "Bearer nope" } }))).toBe(
        true,
      );
      expect(warn.mock.calls[0][0]).toContain("unset");
    });

    it("stays silent for a valid token and for ordinary anonymous traffic", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      expect(warnIfTokenRejected(makeReq({ headers: { authorization: `Bearer ${TOKEN}` } }))).toBe(
        false,
      );
      expect(warnIfTokenRejected(makeReq())).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("throttles to once a minute so a bad client cannot flood the log", () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      const bad = () => makeReq({ headers: { authorization: "Bearer nope" } });
      const t0 = 1_000_000;

      expect(warnIfTokenRejected(bad(), t0)).toBe(true);
      expect(warnIfTokenRejected(bad(), t0 + 1)).toBe(false);
      expect(warnIfTokenRejected(bad(), t0 + 59_999)).toBe(false);
      expect(warnIfTokenRejected(bad(), t0 + 60_000)).toBe(true);
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });

  describe("429 logging", () => {
    let warn: any;
    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it("logs the limiter, tier, path and resolved limit when it rejects", async () => {
      const limiter = tieredLimiter({
        name: "analyze",
        windowMs: 60_000,
        anon: 1,
        privileged: 9,
        message: { error: "x" },
      });
      const req = () => makeReq({ ip: "198.51.100.90", path: "/api/audit-url" });

      expect((await hit(limiter, req())).limited).toBe(false);
      expect((await hit(limiter, req())).limited).toBe(true);

      const line = warn.mock.calls.map((c: any[]) => c[0]).find((l: string) => l.includes("429"));
      expect(line).toContain("limiter=analyze");
      expect(line).toContain("tier=anon");
      expect(line).toContain("auth=none");
      expect(line).toContain("path=/api/audit-url");
      expect(line).toContain("limit=1/60s");
    });

    it("names the privileged tier when a valid token is throttled", async () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      const limiter = tieredLimiter({
        name: "analyze",
        windowMs: 60_000,
        anon: 5,
        privileged: 1,
        message: { error: "x" },
      });
      const req = () =>
        makeReq({
          ip: "198.51.100.91",
          path: "/api/audit-url",
          headers: { authorization: `Bearer ${TOKEN}` },
        });

      expect((await hit(limiter, req())).limited).toBe(false);
      expect((await hit(limiter, req())).limited).toBe(true);

      const line = warn.mock.calls.map((c: any[]) => c[0]).find((l: string) => l.includes("429"));
      expect(line).toContain("tier=privileged");
      expect(line).toContain("auth=valid");
    });

    // The service stores no identity (v1.68.0) and the published retention
    // policy says so. A log line is disk. This test is the guard.
    it("NEVER writes the caller's IP or the token value to the log", async () => {
      process.env.API_PRIVILEGED_TOKEN = TOKEN;
      const limiter = tieredLimiter({
        name: "analyze",
        windowMs: 60_000,
        anon: 1,
        privileged: 1,
        message: { error: "x" },
      });
      const ip = "198.51.100.92";
      const req = () =>
        makeReq({ ip, path: "/api/audit-url", headers: { authorization: "Bearer leaky-token" } });

      await hit(limiter, req());
      await hit(limiter, req());

      const all = warn.mock.calls.map((c: any[]) => String(c[0])).join("\n");
      expect(all).not.toContain(ip);
      expect(all).not.toContain("leaky-token");
      expect(all).not.toContain(TOKEN);
    });
  });
});

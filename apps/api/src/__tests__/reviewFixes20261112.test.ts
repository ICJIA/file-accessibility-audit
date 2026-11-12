/**
 * Review 2026-11-12 — the smaller fixes, each with its wiring:
 *
 *   7  page-audit SSRF guard: service workers / WebSockets, launch wiring
 *   10 analyze-job status polling exempt from the global limiter
 *   11 analyze-job capacity checked BEFORE the upload is buffered
 *   migrations 16 + 17
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

vi.mock("../db/sqlite.js", () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) })) },
}));

// --- puppeteer double for the page-audit wiring test -----------------------
const { order, fakePage, fakeBrowser, launch } = vi.hoisted(() => {
  const order: string[] = [];
  const fakePage: any = {
    setBypassServiceWorker: async (v: boolean) => void order.push(`bypassServiceWorker:${v}`),
    evaluateOnNewDocument: async (src: unknown) =>
      void order.push(`evaluateOnNewDocument:${typeof src}`),
    setRequestInterception: async () => void order.push("setRequestInterception"),
    on: () => {},
    setUserAgent: async () => {},
    goto: async () => void order.push("goto"),
    title: async () => "T",
    close: async () => {},
  };
  const fakeBrowser: any = {
    on: (ev: string) => void order.push(`browser.on:${ev}`),
    newPage: async () => fakePage,
    close: async () => {},
  };
  const launch = async (opts: { args: string[] }) => {
    order.push(`launch:${opts.args.find((a) => a.startsWith("--host-resolver-rules")) ?? ""}`);
    return fakeBrowser;
  };
  return { order, fakePage, fakeBrowser, launch };
});
vi.mock("puppeteer", () => ({ default: { launch } }));
vi.mock("@axe-core/puppeteer", () => ({
  AxePuppeteer: class {
    async analyze() {
      return { violations: [], incomplete: [] };
    }
  },
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  resolvePublicIp: vi.fn(async () => "93.184.216.34"),
}));

import {
  auditPage,
  closeUninterceptedTargets,
  createRequestHandler,
  denyPopups,
  hardenPage,
  PAGE_HARDENING_SOURCE,
} from "../services/pageAuditor.js";
import { shouldAllowPageRequest } from "../services/pageAuditGuard.js";
import {
  globalLimiter,
  analyzeJobStatusLimiter,
  isAnalyzeJobStatusRequest,
  isGlobalLimitExempt,
} from "../middleware/rateLimiter.js";
import analyzeJobRouter, { requireJobCapacity } from "../routes/analyzeJob.js";
import {
  _reservedUploads,
  _resetAnalyzeJobs,
  createAnalyzeJob,
  finishJob,
  hasAnalyzeJobCapacity,
  MAX_JOBS,
} from "../services/analyzeJobs.js";
import { retryWhileBusy, setBusyRetryAfter } from "../services/busy.js";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { MIGRATIONS, runMigrationList, runMigrations } from "../db/migrations.js";
import { ANALYSIS, ANALYZE_JOB, RATE_LIMITS } from "#config";

beforeEach(() => {
  order.length = 0;
  _resetAnalyzeJobs();
});

// ===========================================================================
// 7. Page-audit SSRF guard
// ===========================================================================
describe("page audit — requests that bypass the interceptor are removed (finding 7)", () => {
  /** Run the injected script against a stand-in global, as the page would. */
  function runHardening(g: Record<string, unknown>): void {
    new Function("globalThis", PAGE_HARDENING_SOURCE)(g);
  }

  it("is a plain script string with no bundler helpers the page would not have", () => {
    expect(typeof PAGE_HARDENING_SOURCE).toBe("string");
    expect(PAGE_HARDENING_SOURCE).not.toMatch(/__name|__publicField|import\(/);
  });

  it("replaces WebSocket, WebTransport, RTCPeerConnection and SharedWorker with throwing stubs", () => {
    const g: Record<string, any> = {
      WebSocket: class {},
      WebSocketStream: class {},
      WebTransport: class {},
      RTCPeerConnection: class {},
      SharedWorker: class {},
      fetch: () => "untouched",
    };
    runHardening(g);
    for (const name of [
      "WebSocket",
      "WebSocketStream",
      "WebTransport",
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
      "SharedWorker",
    ]) {
      expect(() => new g[name]("ws://10.0.0.5/")).toThrow(
        /disabled while this page is being audited/,
      );
    }
    // … and the page cannot simply put the original back.
    const original = class {};
    try {
      g.WebSocket = original;
    } catch {
      /* strict-mode assignment to a read-only property throws; either way: */
    }
    expect(g.WebSocket).not.toBe(original);
    expect(() => Object.defineProperty(g, "WebSocket", { value: original })).toThrow();
    // Ordinary, interceptable APIs are left alone.
    expect(g.fetch()).toBe("untouched");
  });

  it("makes navigator.serviceWorker.register reject", async () => {
    class Container {
      register() {
        return Promise.resolve("registered");
      }
    }
    const g: Record<string, any> = { navigator: { serviceWorker: new Container() } };
    runHardening(g);
    await expect(g.navigator.serviceWorker.register("/sw.js")).rejects.toThrow(
      /Service workers are disabled/,
    );
  });

  it("does not throw in a context with none of these APIs", () => {
    expect(() => runHardening({})).not.toThrow();
  });

  it("hardenPage bypasses service workers and installs the script for every new document", async () => {
    await hardenPage(fakePage);
    expect(order).toEqual(["bypassServiceWorker:true", "evaluateOnNewDocument:string"]);
  });

  it("the interceptor refuses a service-worker script fetch, whatever its host", async () => {
    const calls: string[] = [];
    const req = {
      url: () => "https://icjia.illinois.gov/sw.js",
      resourceType: () => "other",
      headers: () => ({ "service-worker": "script" }),
      abort: async () => void calls.push("abort"),
      continue: async () => void calls.push("continue"),
    };
    await createRequestHandler(
      () => true,
      async () => true,
    )(req as never);
    expect(calls).toEqual(["abort"]);
  });

  it("an ordinary sub-resource with headers still loads", async () => {
    const calls: string[] = [];
    const req = {
      url: () => "https://cdn.example.gov/app.js",
      resourceType: () => "script",
      headers: () => ({ accept: "*/*" }),
      abort: async () => void calls.push("abort"),
      continue: async () => void calls.push("continue"),
    };
    await createRequestHandler(
      () => true,
      async () => true,
    )(req as never);
    expect(calls).toEqual(["continue"]);
  });

  it("non-http(s) schemes are denied; ws/wss never get an IP check they could pass", () => {
    for (const url of [
      "ws://10.0.0.5/socket",
      "wss://example.gov/socket",
      "file:///etc/passwd",
      "ftp://example.gov/x",
      "gopher://example.gov/",
      "chrome://settings/",
    ]) {
      expect(shouldAllowPageRequest(url, false, () => true)).toMatchObject({ allow: false });
    }
    expect(shouldAllowPageRequest("https://example.gov/a.css", false, () => true)).toEqual({
      allow: true,
      needsIpCheck: true,
    });
  });

  it("closes a service-worker or shared-worker target if one appears anyway", async () => {
    let listener: ((t: any) => void) | undefined;
    const browser: any = { on: (_ev: string, fn: (t: any) => void) => (listener = fn) };
    closeUninterceptedTargets(browser);
    const closed: string[] = [];
    const target = (type: string) => ({
      type: () => type,
      worker: async () => ({ close: async () => void closed.push(type) }),
    });
    for (const t of ["service_worker", "shared_worker", "page", "other"]) listener!(target(t));
    await new Promise((r) => setImmediate(r));
    expect(closed.sort()).toEqual(["service_worker", "shared_worker"]);
  });

  it("window.open is denied (returns null, like a popup blocker) and cannot be restored", () => {
    const original = () => "a new window";
    const g: Record<string, any> = { open: original };
    runHardening(g);
    expect(g.open("https://10.0.0.5/")).toBeNull();
    expect(() => Object.defineProperty(g, "open", { value: original })).toThrow();
  });

  it("denyPopups guards then closes any page that is not the audited one", async () => {
    let listener: ((t: any) => void) | undefined;
    const browser: any = { on: (_ev: string, fn: (t: any) => void) => (listener = fn) };
    const audited: any = { name: "audited", close: vi.fn() };
    const steps: string[] = [];
    const popup: any = { close: async () => void steps.push("close") };
    denyPopups(browser, audited, async (p) => {
      expect(p).toBe(popup);
      steps.push("guard");
    });
    listener!({ type: () => "page", page: async () => popup });
    listener!({ type: () => "page", page: async () => audited }); // never the audited page
    listener!({ type: () => "other", page: async () => popup });
    await new Promise((r) => setImmediate(r));
    // Interception goes on FIRST, so a request it starts is judged, then it is closed.
    expect(steps).toEqual(["guard", "close"]);
    expect(audited.close).not.toHaveBeenCalled();
  });

  it("WIRING: auditPage pins the host, hardens the page and installs the guard BEFORE navigating", async () => {
    const result = await auditPage("https://icjia.illinois.gov/page", () => true);
    expect(result.score).toBe(100);
    expect(order[0]).toBe("launch:--host-resolver-rules=MAP icjia.illinois.gov 93.184.216.34");
    const at = (s: string) => order.indexOf(s);
    // Two target listeners: worker targets, and popups.
    expect(order.filter((o) => o === "browser.on:targetcreated")).toHaveLength(2);
    for (const step of [
      "bypassServiceWorker:true",
      "evaluateOnNewDocument:string",
      "setRequestInterception",
    ]) {
      expect(at(step)).toBeGreaterThan(-1);
      expect(at(step)).toBeLessThan(at("goto"));
    }
    void fakeBrowser;
  });
});

// ===========================================================================
// 10. analyze-job polling vs the global limiter
// ===========================================================================
describe("analyze-job status polling is exempt from the global limiter (finding 10)", () => {
  const req = (over: Record<string, unknown>) =>
    ({ method: "GET", headers: {}, ip: "198.51.100.77", ...over }) as any;

  function hit(limiter: any, r: any): Promise<number> {
    return new Promise((resolve) => {
      const res: any = {
        statusCode: 200,
        setHeader() {},
        getHeader() {},
        status(c: number) {
          res.statusCode = c;
          return res;
        },
        json() {
          resolve(res.statusCode);
        },
        send() {
          resolve(res.statusCode);
        },
      };
      void limiter(r, res, () => resolve(200));
    });
  }

  it("matches GET /api/analyze-job/:id only", () => {
    expect(isAnalyzeJobStatusRequest(req({ path: "/api/analyze-job/abc-123" }))).toBe(true);
    expect(isGlobalLimitExempt(req({ path: "/api/analyze-job/abc-123" }))).toBe(true);
    for (const r of [
      { method: "POST", path: "/api/analyze-job" }, // the upload itself stays limited
      { method: "POST", path: "/api/analyze-job/abc" },
      { method: "GET", path: "/api/analyze-job" },
      { method: "GET", path: "/api/analyze-job/abc/extra" },
      { method: "GET", path: "/api/analyze" },
    ]) {
      expect(isGlobalLimitExempt(req(r))).toBe(false);
    }
  });

  it("two people behind one NAT polling at once no longer 429 each other — or anything else", async () => {
    const ip = "198.51.100.78";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Far more polls than the anon global budget, all from one address.
    for (let i = 0; i < RATE_LIMITS.global.anon * 3; i++) {
      expect(await hit(globalLimiter, req({ ip, path: `/api/analyze-job/job-${i % 2}` }))).toBe(
        200,
      );
    }
    // The shared budget is untouched: real requests still have all of it …
    for (let i = 0; i < RATE_LIMITS.global.anon; i++) {
      expect(await hit(globalLimiter, req({ ip, path: "/api/health" }))).toBe(200);
    }
    // … and it still exists.
    expect(await hit(globalLimiter, req({ ip, path: "/api/health" }))).toBe(429);
  });

  it("the poll has its own generous flood guard, wired onto the route ahead of the handler", async () => {
    expect(RATE_LIMITS.analyzeJobStatus.max).toBeGreaterThanOrEqual(300);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ip = "198.51.100.79";
    for (let i = 0; i < RATE_LIMITS.analyzeJobStatus.max; i++) {
      expect(await hit(analyzeJobStatusLimiter, req({ ip, path: "/api/analyze-job/x" }))).toBe(200);
    }
    expect(await hit(analyzeJobStatusLimiter, req({ ip, path: "/api/analyze-job/x" }))).toBe(429);

    const layer = (analyzeJobRouter as any).stack.find(
      (l: any) => l.route?.path === "/analyze-job/:id" && l.route.methods.get,
    );
    const handlers = layer.route.stack.map((s: any) => s.handle);
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(analyzeJobStatusLimiter);
  });

  it("the exempt route answers only to the job's own token", () => {
    const layer = (analyzeJobRouter as any).stack.find(
      (l: any) => l.route?.path === "/analyze-job/:id",
    );
    const get = layer.route.stack[layer.route.stack.length - 1].handle;
    const job = createAnalyzeJob(true)!;
    const call = (t: string) => {
      const res: any = { _s: 200, status: (c: number) => ((res._s = c), res), json: () => res };
      get({ params: { id: job.id }, query: { t } }, res);
      return res._s;
    };
    expect(call("wrong-token")).toBe(404);
    expect(call("")).toBe(404);
    expect(call(job.token)).toBe(200);
  });
});

// ===========================================================================
// 11. analyze-job: capacity before the body
// ===========================================================================
describe("analyze-job capacity is checked AND reserved before the upload is buffered (finding 11)", () => {
  function run() {
    const res: any = new EventEmitter();
    Object.assign(res, {
      _status: 0,
      _headers: {} as Record<string, string>,
      locals: {} as Record<string, unknown>,
      setHeader: (k: string, v: string) => (res._headers[k] = v),
      status: (c: number) => ((res._status = c), res),
      json: (b: unknown) => ((res._json = b), res),
    });
    const next = vi.fn();
    requireJobCapacity({} as never, res, next);
    return { res, next };
  }
  const CAP = ANALYZE_JOB.MAX_UNFINISHED_JOBS;

  it("passes through while there is room, holding one place", () => {
    const { res, next } = run();
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBe(0);
    expect(_reservedUploads()).toBe(1);
  });

  it("THE GAP: a burst of simultaneous uploads cannot all pass before any job exists", () => {
    // 40 requests reach the check before a single body has been read.
    const burst = Array.from({ length: 40 }, run);
    const admitted = burst.filter((b) => b.next.mock.calls.length === 1);
    const refused = burst.filter((b) => b.res._status === 503);
    expect(admitted).toHaveLength(CAP);
    expect(refused).toHaveLength(40 - CAP);
    expect(refused[0]!.res._headers["Retry-After"]).toBe(String(ANALYSIS.BUSY_RETRY_AFTER_S));
    expect(refused[0]!.res._json.error).toMatch(/busy/);
    expect(refused[0]!.next).not.toHaveBeenCalled();
  });

  it("a place is released when the request ends without a job (refused file, dropped upload)", () => {
    const burst = Array.from({ length: CAP }, run);
    expect(run().res._status).toBe(503);
    burst[0]!.res.emit("close"); // that upload was aborted
    expect(_reservedUploads()).toBe(CAP - 1);
    expect(run().next).toHaveBeenCalledOnce();
    // Releasing twice (close after the handler already released) is harmless.
    burst[1]!.res.locals.releaseJobSlot();
    burst[1]!.res.emit("close");
    expect(_reservedUploads()).toBe(CAP - 1);
  });

  it("WIRING: the handler trades its reservation for the job, so capacity is never double-counted", async () => {
    const layer = (analyzeJobRouter as any).stack.find(
      (l: any) => l.route?.path === "/analyze-job" && l.route.methods.post,
    );
    const handle = layer.route.stack[layer.route.stack.length - 1].handle;
    const { res } = run();
    expect(_reservedUploads()).toBe(1);
    await handle({ file: { buffer: Buffer.from("x"), originalname: "a.pdf" }, headers: {} }, res);
    expect(res._status).toBe(202);
    expect(_reservedUploads()).toBe(0); // now a job, not a reservation
    res.emit("close");
    expect(_reservedUploads()).toBe(0);
  });

  it("unfinished jobs count against the same limit; finished ones do not", () => {
    const made = Array.from({ length: CAP }, () => createAnalyzeJob(true)!);
    expect(hasAnalyzeJobCapacity()).toBe(false);
    expect(run().res._status).toBe(503);
    finishJob(made[0]!.id, { error: { status: 500, body: { error: "x" } } });
    expect(hasAnalyzeJobCapacity()).toBe(true); // its buffer is gone
    expect(MAX_JOBS).toBeGreaterThan(CAP);
  });

  it("WIRING: on the route it sits after the rate limiter and BEFORE the multer body parser", () => {
    const layer = (analyzeJobRouter as any).stack.find(
      (l: any) => l.route?.path === "/analyze-job" && l.route.methods.post,
    );
    const handlers: unknown[] = layer.route.stack.map((s: any) => s.handle);
    expect(handlers.indexOf(requireJobCapacity)).toBe(1);
    expect(handlers).toHaveLength(4);
    expect(typeof uploadMiddleware.single).toBe("function");
  });
});

// ===========================================================================
// 6. A full analysis line: Retry-After on the synchronous routes, retry in jobs
// ===========================================================================
describe("busy (503) handling", () => {
  const busy = () => Object.assign(new Error("Server busy"), { status: 503 });

  it("retryWhileBusy retries a busy error with backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const out = await retryWhileBusy(
      async () => {
        if (++calls < 4) throw busy();
        return "done";
      },
      { totalMs: 60_000, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(out).toBe("done");
    expect(calls).toBe(4);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it("gives up with the busy error once the bounded total wait is spent", async () => {
    let clock = 0;
    let calls = 0;
    await expect(
      retryWhileBusy(
        async () => {
          calls++;
          throw busy();
        },
        { totalMs: 10_000, now: () => clock, sleep: async (ms) => void (clock += ms) },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(clock).toBe(10_000); // never waits past the bound
    expect(calls).toBeGreaterThan(3);
  });

  it("does not retry any other error", async () => {
    let calls = 0;
    await expect(
      retryWhileBusy(
        async () => {
          calls++;
          throw Object.assign(new Error("x"), { code: "DOCX_PARSE_FAILED" });
        },
        { totalMs: 60_000, sleep: async () => {} },
      ),
    ).rejects.toMatchObject({ code: "DOCX_PARSE_FAILED" });
    expect(calls).toBe(1);
  });

  it("setBusyRetryAfter sets the configured header", () => {
    const headers: Record<string, string> = {};
    setBusyRetryAfter({
      setHeader: (k: string, v: string) => ((headers[k] = v), undefined),
    } as never);
    expect(headers).toEqual({ "Retry-After": String(ANALYSIS.BUSY_RETRY_AFTER_S) });
    expect(ANALYSIS.BUSY_RETRY_AFTER_S).toBeGreaterThan(0);
    expect(ANALYZE_JOB.BUSY_RETRY_TOTAL_MS).toBeLessThan(ANALYZE_JOB.HARD_TIMEOUT_MS);
  });

  it("WIRING: every synchronous audit route that can answer 'busy' sets Retry-After", () => {
    const read = (f: string) =>
      readFileSync(fileURLToPath(new URL(`../routes/${f}`, import.meta.url)), "utf8");
    for (const f of [
      "analyze.ts",
      "analyze-url.ts",
      "audit-url.ts",
      "audit-url-page.ts",
      "remediate.ts",
    ]) {
      const src = read(f);
      // No 503 is sent from a busy branch without the header being set first.
      const busyBranches = [...src.matchAll(/status === 503\) \{?\s*([\s\S]{0,80})/g)];
      expect(busyBranches.length, f).toBeGreaterThan(0);
      for (const m of busyBranches) expect(m[1], f).toContain("setBusyRetryAfter(res)");
    }
  });
});

// ===========================================================================
// Migrations 16 + 17
// ===========================================================================
describe("migrations 16 (started_at), 17 (engine_version) and 18 (worker_pid)", () => {
  const cols = (db: InstanceType<typeof Database>, table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  it("a fresh database has both columns", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    expect(cols(db, "remediation_jobs")).toContain("started_at");
    expect(cols(db, "shared_reports")).toContain("engine_version");
    expect(cols(db, "remediation_jobs")).toContain("worker_pid");
    expect(db.pragma("user_version", { simple: true })).toBe(18);
  });

  it("a v15 database with data gains them as NULL, and re-running is a no-op", () => {
    const db = new Database(":memory:");
    runMigrationList(
      db,
      MIGRATIONS.filter((m) => m.version <= 15),
      0,
    );
    expect(cols(db, "remediation_jobs")).not.toContain("started_at");
    db.prepare(
      `INSERT INTO remediation_jobs (id, input_filename, status, progress_pct, created_at, expires_at)
       VALUES ('j1', 'a.pdf', 'running', 5, 1, 2)`,
    ).run();
    db.prepare(
      `INSERT INTO shared_reports (id, filename, report_json, content_hash, expires_at)
       VALUES ('r1', 'a.pdf', '{}', 'h', '2999-01-01T00:00:00.000Z')`,
    ).run();

    runMigrations(db);
    expect(db.prepare("SELECT started_at FROM remediation_jobs").get()).toEqual({
      started_at: null,
    });
    expect(db.prepare("SELECT engine_version FROM shared_reports").get()).toEqual({
      engine_version: null,
    });

    // Probe-before-ALTER: running the two migrations again must not throw.
    for (const m of MIGRATIONS.filter((x) => x.version >= 16)) expect(() => m.up(db)).not.toThrow();
  });
});

/**
 * Graceful shutdown (services/shutdown.ts).
 *
 * The API had no SIGTERM / SIGINT handler: a stop signal ended the process
 * mid-audit, with page-audit browsers running and the database handle open.
 * These tests pin the ORDER of the steps, the deadline, the second-signal
 * exit, and the 503 a request receives while the process is draining — with
 * every effect injected, so nothing here listens, exits or sleeps for real.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createInFlightTracker,
  createShutdown,
  drainMiddleware,
  trackRequests,
  type ShutdownDeps,
} from "../services/shutdown.js";
import { SHUTDOWN } from "#config";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Timers the test fires by hand. */
function manualTimers() {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return { unref: () => {} };
    },
    fire: (ms: number) => {
      for (const t of timers.filter((x) => x.ms === ms)) t.fn();
    },
  };
}

function harness(over: Partial<ShutdownDeps> = {}) {
  const calls: string[] = [];
  const tracker = createInFlightTracker();
  const t = manualTimers();
  const exit = vi.fn((code: number) => {
    calls.push(`exit:${code}`);
  });
  const deps: ShutdownDeps = {
    stopAccepting: () => {
      calls.push("stopAccepting");
    },
    stopSweep: () => {
      calls.push("stopSweep");
    },
    tracker,
    closeBrowsers: async () => {
      calls.push("closeBrowsers");
    },
    closeDatabase: () => {
      calls.push("closeDatabase");
    },
    exit,
    drainDeadlineMs: 30_000,
    forceExitGraceMs: 5_000,
    log: () => {},
    setTimer: t.setTimer,
    ...over,
  };
  return { calls, tracker, exit, timers: t, shutdown: createShutdown(deps) };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

describe("createShutdown — the order of the steps", () => {
  it("idle: stop accepting → stop the sweep → browsers → database → exit 0", async () => {
    const h = harness();
    await h.shutdown.onSignal("SIGTERM");
    expect(h.calls).toEqual([
      "stopAccepting",
      "stopSweep",
      "closeBrowsers",
      "closeDatabase",
      "exit:0",
    ]);
  });

  it("is draining from the first signal on — before anything is closed", async () => {
    const seen: boolean[] = [];
    const h = harness();
    const h2 = harness({
      stopAccepting: () => {
        seen.push(h2.shutdown.isDraining());
      },
    });
    expect(h.shutdown.isDraining()).toBe(false);
    await h2.shutdown.onSignal("SIGINT");
    expect(seen).toEqual([true]);
  });

  it("waits for work in flight, and closes NOTHING until it has finished", async () => {
    const h = harness();
    const end = h.tracker.begin();
    const done = h.shutdown.onSignal("SIGTERM");
    await tick();
    // Accepting has stopped; the database and browsers are still open.
    expect(h.calls).toEqual(["stopAccepting", "stopSweep"]);
    expect(h.exit).not.toHaveBeenCalled();

    end();
    await done;
    expect(h.calls).toEqual([
      "stopAccepting",
      "stopSweep",
      "closeBrowsers",
      "closeDatabase",
      "exit:0",
    ]);
  });

  it("waits for background work too (an audit that carries on after its 202)", async () => {
    const h = harness();
    let finish!: () => void;
    void h.tracker.track(new Promise<void>((r) => (finish = r)));
    const done = h.shutdown.onSignal("SIGTERM");
    await tick();
    expect(h.calls).not.toContain("closeDatabase");
    finish();
    await done;
    expect(h.calls.at(-1)).toBe("exit:0");
  });

  it("a step that throws does not stop the steps after it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness({
      closeBrowsers: async () => {
        throw new Error("chromium would not close");
      },
    });
    await h.shutdown.onSignal("SIGTERM");
    expect(h.calls).toEqual(["stopAccepting", "stopSweep", "closeDatabase", "exit:0"]);
  });
});

describe("createShutdown — the deadline and the second signal", () => {
  it("at the deadline it stops waiting, still closes browsers and database, and exits 1", async () => {
    const h = harness();
    h.tracker.begin(); // never ends
    const done = h.shutdown.onSignal("SIGTERM");
    await tick();
    expect(h.exit).not.toHaveBeenCalled();

    h.timers.fire(30_000);
    await done;
    expect(h.calls).toEqual([
      "stopAccepting",
      "stopSweep",
      "closeBrowsers",
      "closeDatabase",
      "exit:1",
    ]);
  });

  it("a backstop is armed for deadline + grace, and exits even if a step hangs", async () => {
    const h = harness({ closeBrowsers: () => new Promise<void>(() => {}) }); // hangs for ever
    void h.shutdown.onSignal("SIGTERM");
    await tick();
    expect(h.timers.timers.map((t) => t.ms)).toContain(35_000);
    expect(h.exit).not.toHaveBeenCalled();

    h.timers.fire(35_000);
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it("a second signal exits at once, without waiting", async () => {
    const h = harness();
    h.tracker.begin(); // never ends
    void h.shutdown.onSignal("SIGTERM");
    await tick();
    await h.shutdown.onSignal("SIGTERM");
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.calls).not.toContain("closeDatabase");
  });

  it("exit is called once however the paths race", async () => {
    const h = harness();
    await h.shutdown.onSignal("SIGTERM"); // exits 0
    h.timers.fire(35_000); // the backstop fires late
    await h.shutdown.onSignal("SIGINT"); // and another signal arrives
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(0);
  });
});

describe("in-flight tracker", () => {
  it("counts begin/end, ends are idempotent, and whenIdle resolves at zero", async () => {
    const t = createInFlightTracker();
    await t.whenIdle(); // already idle
    const a = t.begin();
    const b = t.begin();
    expect(t.count()).toBe(2);
    let idle = false;
    void t.whenIdle().then(() => (idle = true));
    a();
    a(); // a second call must not count twice
    await tick();
    expect(t.count()).toBe(1);
    expect(idle).toBe(false);
    b();
    await tick();
    expect(idle).toBe(true);
  });

  it("track() releases on rejection as well as on success", async () => {
    const t = createInFlightTracker();
    const failing = t.track(Promise.reject(new Error("x")));
    expect(t.count()).toBe(1);
    await failing.catch(() => {});
    await tick();
    expect(t.count()).toBe(0);
  });

  it("trackRequests holds a request until its response CLOSES", () => {
    const t = createInFlightTracker();
    const listeners: Array<() => void> = [];
    const res: any = { once: (_e: string, fn: () => void) => listeners.push(fn) };
    const next = vi.fn();
    trackRequests(t)({} as any, res, next);
    expect(next).toHaveBeenCalled();
    expect(t.count()).toBe(1);
    listeners[0]!();
    expect(t.count()).toBe(0);
  });
});

describe("drainMiddleware — requests that arrive during shutdown", () => {
  function run(draining: boolean) {
    const headers: Record<string, string> = {};
    const res: any = {
      _status: 200,
      _json: null,
      setHeader: (k: string, v: string) => (headers[k] = v),
      status(c: number) {
        res._status = c;
        return res;
      },
      json(b: unknown) {
        res._json = b;
        return res;
      },
    };
    const next = vi.fn();
    drainMiddleware(() => draining, 15)({} as any, res, next);
    return { res, headers, next };
  }

  it("passes every request through while the process is running normally", () => {
    const r = run(false);
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.res._json).toBeNull();
  });

  it("answers 503 + Retry-After in the API's error shape, and handles nothing", () => {
    const r = run(true);
    expect(r.next).not.toHaveBeenCalled();
    expect(r.res._status).toBe(503);
    expect(r.headers["Retry-After"]).toBe("15");
    expect(r.headers.Connection).toBe("close");
    expect(r.res._json).toEqual({
      error: "The service is restarting.",
      details: "Please try again in a few seconds.",
      code: "SHUTTING_DOWN",
    });
  });
});

describe("WIRING", () => {
  const root = resolve(__dirname, "../../../..");
  const index = readFileSync(resolve(__dirname, "../index.ts"), "utf8");

  it("index.ts handles SIGTERM and SIGINT with the real effects", () => {
    expect(index).toMatch(/for \(const signal of \["SIGTERM", "SIGINT"\] as const\)/);
    expect(index).toMatch(/process\.on\(signal,/);
    expect(index).toMatch(/closeBrowsers: closeBrowser,/);
    expect(index).toMatch(/stopSweep: stopCleanupInterval,/);
    expect(index).toMatch(/db\.close\(\)/);
    expect(index).toMatch(/listener\.server\?\.close\(\)/);
    expect(index).toMatch(/listener\.server = server;/);
    expect(index).toMatch(/drainDeadlineMs: SHUTDOWN\.DRAIN_DEADLINE_MS,/);
    expect(index).toMatch(/createApp\(\{ isDraining: shutdown\.isDraining \}\)/);
  });

  it("PM2 waits longer than the API can take to stop", () => {
    const ecosystem = createRequire(import.meta.url)(resolve(root, "ecosystem.config.cjs")) as {
      apps: Array<{ name: string; kill_timeout?: number }>;
    };
    const api = ecosystem.apps.find((a) => a.name === "file-audit-api")!;
    expect(api.kill_timeout).toBeGreaterThan(
      SHUTDOWN.DRAIN_DEADLINE_MS + SHUTDOWN.FORCE_EXIT_GRACE_MS,
    );
  });
});

/**
 * Graceful shutdown for the API process (SIGTERM / SIGINT).
 *
 * Until this existed the process had no signal handler at all: PM2's stop
 * signal ended it at once, mid-audit, with page-audit browsers still running
 * and the SQLite handle never closed. The order is the point:
 *
 *   1. start draining — new requests are answered 503 + Retry-After
 *      (`drainMiddleware`), and the listener stops accepting connections;
 *   2. stop the retention sweep's timer;
 *   3. wait for the work already in flight — open requests and audits that
 *      carry on after their 202 — up to SHUTDOWN.DRAIN_DEADLINE_MS;
 *   4. close any page-audit browser still open;
 *   5. close the database;
 *   6. exit: 0 when everything finished, 1 when the deadline cut it short.
 *
 * A SECOND signal exits at once. A backstop timer (deadline + grace) exits
 * even if a step above hangs. PM2's `kill_timeout` for the API is set above
 * that total in ecosystem.config.cjs.
 *
 * Every effect is injected, so the ordering and the deadline are unit-tested
 * without a server, a database or a real exit (shutdown.test.ts).
 */
import type { NextFunction, Request, Response } from "express";

/** Counts the work a shutdown has to wait for. */
export interface InFlightTracker {
  /** Requests being handled plus background work still running. */
  count(): number;
  /** Mark one piece of work started; call the returned function when it ends. */
  begin(): () => void;
  /** Track a promise as background work (an audit running after its 202). */
  track<T>(work: Promise<T>): Promise<T>;
  /** Resolves when count() reaches zero (at once if it already is). */
  whenIdle(): Promise<void>;
}

export function createInFlightTracker(): InFlightTracker {
  let active = 0;
  let idleWaiters: Array<() => void> = [];
  const settle = (): void => {
    if (active > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  };
  const begin = (): (() => void) => {
    active++;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      active--;
      settle();
    };
  };
  return {
    count: () => active,
    begin,
    track<T>(work: Promise<T>): Promise<T> {
      const end = begin();
      work.then(end, end);
      return work;
    },
    whenIdle: () =>
      active === 0 ? Promise.resolve() : new Promise<void>((r) => idleWaiters.push(r)),
  };
}

/** The process-wide tracker: app.ts counts requests, the job route its audits. */
export const inFlight = createInFlightTracker();

export interface ShutdownDeps {
  /** Stop accepting connections (http.Server#close). Not awaited: it only
   *  calls back once every connection has ended, which step 3 waits for. */
  stopAccepting(): void;
  /** Stop the retention sweep's interval. */
  stopSweep(): void;
  tracker: Pick<InFlightTracker, "count" | "whenIdle">;
  /** Close page-audit browsers (services/pageAuditor.ts closeBrowser). */
  closeBrowsers(): Promise<void>;
  /** Close the SQLite handle. */
  closeDatabase(): void;
  exit(code: number): void;
  drainDeadlineMs: number;
  forceExitGraceMs: number;
  log?: (line: string) => void;
  /** Injectable timers for tests. */
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void };
}

export interface ShutdownController {
  /** True from the first signal on. */
  isDraining(): boolean;
  /** Handle a stop signal. Resolves after exit() has been called. */
  onSignal(signal: string): Promise<void>;
}

export function createShutdown(deps: ShutdownDeps): ShutdownController {
  const log = deps.log ?? ((line: string) => console.log(line));
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  let draining = false;
  let exited = false;

  const exit = (code: number): void => {
    if (exited) return;
    exited = true;
    deps.exit(code);
  };

  /** Run one step; a step that throws must not stop the ones after it. */
  const step = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      console.error(`[shutdown] ${name} failed:`, e);
    }
  };

  async function onSignal(signal: string): Promise<void> {
    if (draining) {
      log(`[shutdown] ${signal} received again — exiting now`);
      exit(1);
      return;
    }
    draining = true;
    const waitingFor = deps.tracker.count();
    log(
      `[shutdown] ${signal} received — no new requests; waiting up to ` +
        `${Math.round(deps.drainDeadlineMs / 1000)}s for ${waitingFor} in flight`,
    );

    // Backstop: exits whatever state the steps below are in.
    setTimer(() => {
      if (exited) return;
      log("[shutdown] did not finish in time — exiting now");
      exit(1);
    }, deps.drainDeadlineMs + deps.forceExitGraceMs).unref?.();

    await step("stopAccepting", () => deps.stopAccepting());
    await step("stopSweep", () => deps.stopSweep());

    let drained = true;
    await step("drain", async () => {
      drained = await new Promise<boolean>((resolve) => {
        setTimer(() => resolve(false), deps.drainDeadlineMs).unref?.();
        void deps.tracker.whenIdle().then(() => resolve(true));
      });
    });
    if (exited) return;
    if (!drained) {
      log(
        `[shutdown] deadline reached with ${deps.tracker.count()} still in flight — ` +
          `closing anyway`,
      );
    }

    await step("closeBrowsers", () => deps.closeBrowsers());
    await step("closeDatabase", () => deps.closeDatabase());
    if (exited) return;
    log(`[shutdown] done — exiting ${drained ? "cleanly" : "after the deadline"}`);
    exit(drained ? 0 : 1);
  }

  return { isDraining: () => draining, onSignal };
}

/**
 * Answers 503 + Retry-After to every request that arrives once shutdown has
 * begun (on a connection that was already open — the listener itself has
 * stopped accepting). `Connection: close` so the client reconnects, to the
 * next process, instead of reusing this one.
 */
export function drainMiddleware(isDraining: () => boolean, retryAfterS: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!isDraining()) {
      next();
      return;
    }
    res.setHeader("Retry-After", String(retryAfterS));
    res.setHeader("Connection", "close");
    res.status(503).json({
      error: "The service is restarting.",
      details: "Please try again in a few seconds.",
      code: "SHUTTING_DOWN",
    });
  };
}

/** Counts each request as in flight until its response has closed. */
export function trackRequests(tracker: Pick<InFlightTracker, "begin">) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.once("close", tracker.begin());
    next();
  };
}

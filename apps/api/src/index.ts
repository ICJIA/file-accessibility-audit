import { createApp } from "./app.js";
import {
  purgeTempFilesAtBoot,
  runScheduledSweep,
  startCleanupInterval,
  stopCleanupInterval,
} from "./services/remediationCleanup.js";
import { reconcileWorkers } from "./services/remediationQueue.js";
import { closeBrowser } from "./services/pageAuditor.js";
import { createShutdown, inFlight } from "./services/shutdown.js";

// Import db to trigger table creation on startup
import db from "./db/sqlite.js";
import { ACTIVITY_EXPORT, DEPLOY, SHUTDOWN } from "#config";
import { resolveBindHost } from "./bindHost.js";
import { installErrorLogTee } from "./services/errorLog.js";
import { activityLogDir } from "./services/dataDir.js";

// First thing: tee stderr into logs/errors-YYYY-MM-DD.log (v1.88.0), so an
// unexpected error can be diagnosed from the same directory as the activity
// files. The original console call still runs — PM2's stream is unchanged.
installErrorLogTee({
  dir: activityLogDir(),
  timeZone: DEPLOY.LOCAL_TIME_ZONE,
  maxBytesPerDay: ACTIVITY_EXPORT.ERROR_LOG_MAX_BYTES_PER_DAY,
});

const PORT = Number(process.env.PORT) || 5103;
const isProduction = process.env.NODE_ENV === "production";

// Temp copies of documents left by a process that was killed mid-audit: gone
// before this one accepts a request (services/remediationCleanup.ts).
const staleTempFiles = purgeTempFilesAtBoot();
if (staleTempFiles > 0) {
  console.log(`[API] Deleted ${staleTempFiles} temp file(s) left by a previous process`);
}

// Graceful shutdown (services/shutdown.ts). Declared before the app so the
// app's first middleware can refuse new requests once a stop signal arrives;
// the listener is filled in below, before any signal handler is registered.
const listener: { server?: import("node:http").Server } = {};
const shutdown = createShutdown({
  stopAccepting: () => {
    listener.server?.close();
  },
  stopSweep: stopCleanupInterval,
  tracker: inFlight,
  closeBrowsers: closeBrowser,
  closeDatabase: () => {
    db.close();
  },
  exit: (code) => process.exit(code),
  drainDeadlineMs: SHUTDOWN.DRAIN_DEADLINE_MS,
  forceExitGraceMs: SHUTDOWN.FORCE_EXIT_GRACE_MS,
});

// Every middleware and route, in order: app.ts.
const app = createApp({ isDraining: shutdown.isDraining });

// Bind loopback in production so the port is reachable only from the same host
// (nginx proxies to 127.0.0.1); bind all interfaces in dev so the Nuxt proxy's
// localhost/::1 target still resolves. See resolveBindHost + DEPLOY.BIND_HOST.
const HOST = resolveBindHost(isProduction, DEPLOY.BIND_HOST);
const onListen = () => {
  console.log(`[API] Running on http://${HOST ?? "localhost"}:${PORT}`);
  console.log(`[API] Environment: ${process.env.NODE_ENV || "development"}`);

  // Remediation cleanup: one-shot on startup to reconcile from any crash,
  // then a periodic sweep. Gated internally on REMEDIATION.ENABLED so it's
  // a no-op until the feature is turned on. Run after listen on purpose —
  // the first sweep after a deploy can materialise a year of activity
  // files and must not hold up readiness.
  // Always logs one "[sweep] …" summary line (v1.88.1), so `pm2 logs` answers
  // "did the sweep run, and what did it write?" after every restart.
  //
  // First, synchronously: reconcile remediation job rows with the worker
  // processes that actually exist. A restart that tree-killed the workers
  // would otherwise leave their rows holding every slot for 10–15 minutes.
  const reconciled = reconcileWorkers();
  if (reconciled > 0) {
    console.log(`[API] Ended ${reconciled} remediation job(s) whose worker was no longer running`);
  }
  void runScheduledSweep({ always: true });
  startCleanupInterval();
};
// Conditional call rather than passing an undefined host, so the dev path is an
// unambiguous listen(port, callback) with no reliance on how the overload
// treats an explicit undefined in the host position.
const server = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen);
listener.server = server;

// Stop signals. PM2 sends SIGINT on stop / restart / reload and waits
// `kill_timeout` (ecosystem.config.cjs) before SIGKILL; SIGTERM is what
// systemd, Docker and `kill` send. Both drain the same way; a second signal
// exits at once.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown.onSignal(signal);
  });
}

// Process-level safety nets. Without these, an unhandled rejection anywhere
// in the process (a stray promise in a route handler, a background job, a
// dependency) crashes the process with Node's default handler — or, worse,
// is silently swallowed depending on Node version/flags — with no
// application-level log line. A genuinely uncaught exception means the
// process is in an unknown state, so that case fails fast instead: stop
// accepting new connections, let in-flight responses drain, then exit. The
// timer guarantees the process still exits even if `server.close()`'s
// callback never fires (e.g. a connection that never ends).
process.on("unhandledRejection", (reason) => {
  console.error("[API] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[API] Uncaught exception:", err);
  process.exitCode = 1;
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

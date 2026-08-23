import express from "express";
import helmet from "helmet";
import cors from "cors";
import { globalLimiter, tokenAuditMiddleware } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import analyzeRoutes from "./routes/analyze.js";
import reportsRoutes from "./routes/reports.js";
import bulkInventoryRoutes from "./routes/bulk-from-inventory.js";
import analyzeUrlRoutes from "./routes/analyze-url.js";
import auditUrlRoutes from "./routes/audit-url.js";
import auditUrlPageRoutes from "./routes/audit-url-page.js";
import remediateRoutes from "./routes/remediate.js";
import statusRoutes, { service as statusService } from "./routes/status.js";
import { runScheduledSweep, startCleanupInterval } from "./services/remediationCleanup.js";
import { formatUptime } from "./services/status.js";

// Import db to trigger table creation on startup
import "./db/sqlite.js";
import { ACTIVITY_EXPORT, DEPLOY } from "#config";
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

const app = express();
const PORT = Number(process.env.PORT) || 5103;
const isProduction = process.env.NODE_ENV === "production";

// Trust proxy — behind nginx in production, behind Nuxt proxy in development
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: isProduction ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL,
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: "1mb" }));
// text/plain is used by bulk-from-inventory when the caller pipes NDJSON directly
app.use(express.text({ limit: "5mb", type: "text/plain" }));

// Public status document. Mounted BEFORE globalLimiter and carrying its own
// limiter: the Nitro tier proxies /status over loopback, so every browser hit
// arrives as 127.0.0.1 and shares one global bucket. Under globalLimiter,
// ordinary site traffic could 429 the status page — making it unavailable
// exactly when someone is checking whether the service is healthy.
// (globalLimiter also skips this path, so the ordering is belt and braces.)
app.use("/api", statusRoutes);

// Surfaces a Bearer token the server rejects (or one presented when no
// API_PRIVILEGED_TOKEN is configured). Mounted BEFORE globalLimiter so a
// misconfigured automated client is named on its FIRST request, rather than
// only once it has already been throttled in the anonymous tier. Logs at most
// once a minute and records no identifiers.
app.use(tokenAuditMiddleware);

// Global rate limit
app.use(globalLimiter);

// Routes
app.use("/api", analyzeRoutes);
app.use("/api", reportsRoutes);
app.use("/api", bulkInventoryRoutes);
app.use("/api", analyzeUrlRoutes);
app.use("/api", auditUrlRoutes);
app.use("/api", auditUrlPageRoutes);
app.use("/api", remediateRoutes);

// Health check — also serves as the root API response
const startedAt = new Date();

function healthPayload() {
  const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  // `status` is the SAME verdict /status computes, read from already-cached
  // state — so the always-visible header indicator can say "degraded" instead
  // of a green "online" while /status reports a stale backup, a low disk or a
  // dead engine. It previously answered only "is this process alive", which is
  // a different and much weaker question.
  //
  // Computed here rather than by polling /status because that endpoint is
  // capped at 120/min shared globally; see getHealthSummary's note.
  const summary = statusService.getHealthSummary();
  return {
    status: summary.status,
    uptime: formatUptime(uptimeSec),
    ...(summary.degraded.length > 0 ? { degraded: summary.degraded } : {}),
    // The per-system list behind the verdict, so the header's tooltip can name
    // what "online" is actually claiming. Static labels and one-word states
    // only — nothing here /status does not already publish in more detail.
    systems: summary.systems,
  };
}

app.get("/", (_req, res) => res.json(healthPayload()));
app.get("/api", (_req, res) => res.json(healthPayload()));
app.get("/api/health", (_req, res) => res.json(healthPayload()));

// Global error handler — never leak internals (middleware/errorHandler.ts).
app.use(errorHandler);

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
  void runScheduledSweep({ always: true });
  startCleanupInterval();
};
// Conditional call rather than passing an undefined host, so the dev path is an
// unambiguous listen(port, callback) with no reliance on how the overload
// treats an explicit undefined in the host position.
const server = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen);

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

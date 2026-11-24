/**
 * The Express application, assembled — every middleware and every route, in
 * order, with nothing started. index.ts imports it, listens, and owns the
 * process (signals, the startup sweep); tests import it and drive the same
 * stack production runs (errorCodes.test.ts, openapi.test.ts).
 *
 * Importing this module opens the database (the routes do), so a test sets
 * DB_PATH first.
 */
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { globalLimiter, tokenAuditMiddleware } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { bodyParsers } from "./middleware/bodyParsers.js";
import analyzeRoutes from "./routes/analyze.js";
import analyzeJobRoutes from "./routes/analyzeJob.js";
import reportsRoutes from "./routes/reports.js";
import bulkInventoryRoutes from "./routes/bulk-from-inventory.js";
import analyzeUrlRoutes from "./routes/analyze-url.js";
import auditUrlRoutes from "./routes/audit-url.js";
import auditUrlPageRoutes from "./routes/audit-url-page.js";
import remediateRoutes from "./routes/remediate.js";
import openApiRoutes from "./routes/openapi.js";
import statusRoutes, { service as statusService } from "./routes/status.js";
import { formatUptime } from "./services/status.js";
import { stampErrorCodes } from "./services/apiError.js";
import { REQUEST_ID_HEADER, requestIdMiddleware } from "./services/requestContext.js";
import { drainMiddleware, inFlight, trackRequests } from "./services/shutdown.js";
import { DEPLOY, SHUTDOWN } from "#config";

export interface CreateAppOptions {
  /** True once the process has been told to stop (services/shutdown.ts). */
  isDraining?: () => boolean;
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Trust proxy — behind nginx in production, behind Nuxt proxy in development
  app.set("trust proxy", 1);

  // First, before anything that can answer or log:
  //   - a random id for the request, returned as X-Request-Id and carried on
  //     that request's error-log lines (services/requestContext.ts);
  //   - a `code` on every JSON error body (services/apiError.ts);
  //   - 503 + Retry-After for requests that arrive during shutdown;
  //   - a count of requests in flight, which shutdown waits for.
  app.use(requestIdMiddleware);
  app.use(stampErrorCodes);
  app.use(drainMiddleware(opts.isDraining ?? (() => false), SHUTDOWN.RETRY_AFTER_S));
  app.use(trackRequests(inFlight));

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: isProduction ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL,
      credentials: true,
      // Readable by the page's own scripts when the API is called cross-origin.
      exposedHeaders: [REQUEST_ID_HEADER, "Retry-After"],
    }),
  );

  // Body parsing (JSON, and text/plain for bulk-from-inventory's piped NDJSON)
  app.use(bodyParsers);

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
  app.use("/api", analyzeJobRoutes);
  app.use("/api", reportsRoutes);
  app.use("/api", bulkInventoryRoutes);
  app.use("/api", analyzeUrlRoutes);
  app.use("/api", auditUrlRoutes);
  app.use("/api", auditUrlPageRoutes);
  app.use("/api", remediateRoutes);
  // The machine-readable description of all of the above (GET /api/openapi.json).
  app.use("/api", openApiRoutes);

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

  // Anything else: the API's own JSON 404, in the one error shape, instead
  // of Express's HTML "Cannot GET /x" page.
  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Global error handler — never leak internals (middleware/errorHandler.ts).
  app.use(errorHandler);

  return app;
}

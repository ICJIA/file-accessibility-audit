import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { RATE_LIMITS } from "#config";
import { clientKeyFromIp } from "../services/clientKey.js";

// Per-IP rate-limit bucket key. The IP is used TRANSIENTLY, in memory only —
// the service stores no identity anywhere (v1.68.0); express-rate-limit's
// default MemoryStore never touches disk and forgets everything on restart.
//
// The key is NOT the bare address: IPv6 callers are bucketed by their /64 and
// IPv4-mapped IPv6 by the embedded IPv4 address (services/clientKey.ts —
// shared with the remediation cap), so one /64 cannot rotate addresses past
// every limit. Exported for the wiring tests.
export function ipKey(req: any): string {
  return clientKeyFromIp(req?.ip);
}

// ---------------------------------------------------------------------------
// Privileged-tier bearer token
// ---------------------------------------------------------------------------
// A single static token, supplied via the API_PRIVILEGED_TOKEN env var, that
// promotes a request from the strict anonymous tier to the generous one AND
// lets it audit URLs outside the ICJIA / illinois.gov allowlist (the bypass is
// applied in the route handlers; see analyze-url.ts / audit-url.ts /
// audit-url-page.ts).
//
// This is a service credential for the fleet integration, not a user
// account — the tool has no user accounts or sign-in (v1.68.0). It grants
// ONLY higher limits + the allowlist bypass — never a private/reserved-IP
// SSRF bypass, a size-cap bypass, or a concurrency bypass. A leaked token
// cannot reach internal services.
//
// Read from process.env at request time so it is never committed and
// rotates on restart.
// Empty/unset → feature off → every request is anonymous (fail-safe to strict).
//
// The compare hashes both sides to fixed-length SHA-256 digests and uses
// timingSafeEqual, so neither the token value nor its length leaks via timing.
export function isPrivilegedRequest(req: any): boolean {
  const configured = process.env.API_PRIVILEGED_TOKEN;
  if (!configured) return false;

  const header = req?.headers?.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;

  const presented = header.slice("Bearer ".length);
  if (presented.length === 0) return false;

  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Two-tier selection helpers (exported for testing + reuse)
// ---------------------------------------------------------------------------
// privileged → generous limit, single shared 'privileged' bucket
// anonymous  → strict limit, per-IP bucket (existing behaviour)
export function tierLimit(req: any, cfg: { anon: number; privileged: number }): number {
  return isPrivilegedRequest(req) ? cfg.privileged : cfg.anon;
}

export function tierKey(req: any): string {
  return isPrivilegedRequest(req) ? "privileged" : ipKey(req);
}

// ---------------------------------------------------------------------------
// RATE-LIMIT OBSERVABILITY
// ---------------------------------------------------------------------------
// Why this exists: on 2026-08-12 a fleet-audit run appeared to take the service
// "offline". It had not — the run called the audit endpoints with no privileged
// token, sat in the anonymous tier (500/hour), and was throttled. Nothing
// recorded that: this site's nginx vhost has `access_log off`, and the limiters
// rejected silently. The one fact that would have answered the question in
// seconds had to be reconstructed from process uptime and an absence of errors.
//
// PRIVACY: these lines carry NO identifiers — no IP, no Authorization value, no
// user agent. The service stores no identity (v1.68.0) and the limiter buckets
// hold IPs in memory only; writing them to a log file would put them on disk and
// contradict the published retention policy (§14). Tier, path, and limit are
// enough to diagnose throttling without recording who was throttled.
// ---------------------------------------------------------------------------

/** How a request's Authorization header related to API_PRIVILEGED_TOKEN. */
export type AuthOutcome =
  | "none" // no Bearer credential presented — ordinary anonymous caller
  | "valid" // matched the configured token → privileged tier
  | "invalid" // a Bearer token was presented but did NOT match
  | "unconfigured"; // a Bearer token was presented but the server has none set

export function authOutcome(req: any): AuthOutcome {
  const header = req?.headers?.authorization;
  const presented =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : "";
  if (presented.length === 0) return "none";
  if (!process.env.API_PRIVILEGED_TOKEN) return "unconfigured";
  return isPrivilegedRequest(req) ? "valid" : "invalid";
}

/** One line per throttled request, naming the limiter that rejected it. */
export function logRateLimitRejection(args: {
  limiter: string;
  path: string;
  limit: number;
  windowMs: number;
  auth: AuthOutcome;
}): void {
  const tier = args.auth === "valid" ? "privileged" : "anon";
  const windowSeconds = Math.round(args.windowMs / 1000);
  console.warn(
    `[rate-limit] 429 limiter=${args.limiter} tier=${tier} auth=${args.auth} ` +
      `path=${args.path} limit=${args.limit}/${windowSeconds}s`,
  );
}

// A client presenting a token the server rejects is the failure mode that looks
// like nothing at all: it drops silently to the anonymous tier and is throttled
// 10x sooner, with a 429 indistinguishable from ordinary abuse. Warn on it —
// but at most once a minute, so a misconfigured automated client making
// thousands of requests cannot flood the log.
const BAD_TOKEN_WARN_INTERVAL_MS = 60_000;
let lastBadTokenWarnAt = 0;

/** Test seam — clears the once-a-minute throttle. */
export function resetBadTokenWarnThrottle(): void {
  lastBadTokenWarnAt = 0;
}

export function warnIfTokenRejected(req: any, now: number = Date.now()): boolean {
  const outcome = authOutcome(req);
  if (outcome !== "invalid" && outcome !== "unconfigured") return false;
  if (lastBadTokenWarnAt !== 0 && now - lastBadTokenWarnAt < BAD_TOKEN_WARN_INTERVAL_MS) {
    return false;
  }
  lastBadTokenWarnAt = now;
  console.warn(
    outcome === "unconfigured"
      ? "[rate-limit] a Bearer token was presented but API_PRIVILEGED_TOKEN is unset on this " +
          "server — caller stays in the ANONYMOUS tier"
      : "[rate-limit] a Bearer token was presented but did NOT match API_PRIVILEGED_TOKEN — " +
          "caller stays in the ANONYMOUS tier",
  );
  return true;
}

/**
 * Express middleware form, mounted ahead of the limiters in index.ts so the
 * warning fires on the FIRST request of a misconfigured run rather than only
 * once that run has already been throttled.
 */
export function tokenAuditMiddleware(req: any, _res: any, next: () => void): void {
  warnIfTokenRejected(req);
  next();
}

// Shared 429 responder: logs the rejection, then answers in the same JSON shape
// as the rest of the API (the library default uses res.send) so clients only
// ever parse one format. `req.rateLimit.limit` is the limit express-rate-limit
// actually resolved for THIS request — the two-tier limiters compute it per
// request, so options.limit would still be the unresolved function.
function loggedHandler(limiterName: string, message: Record<string, string>) {
  return (req: any, res: any, _next: unknown, options: any): void => {
    logRateLimitRejection({
      limiter: limiterName,
      path: typeof req?.path === "string" ? req.path : "unknown",
      limit: typeof req?.rateLimit?.limit === "number" ? req.rateLimit.limit : 0,
      windowMs: typeof options?.windowMs === "number" ? options.windowMs : 0,
      auth: authOutcome(req),
    });
    res.status(options.statusCode).json(message);
  };
}

// ---------------------------------------------------------------------------
// Remediation status-poll exemption
// ---------------------------------------------------------------------------
// The remediation progress page polls GET /api/remediate/:jobId/status once
// per second until the job finishes. Counting those polls against the global
// burst guard made the app rate-limit itself: any job longer than ~25 s
// drained the anon 100/min budget and the UI reported "Too many requests"
// mid-remediation. The poll is exempt from globalLimiter and governed by
// remediationStatusLimiter (below) on the route instead.
const REMEDIATION_STATUS_PATH = /^\/api\/remediate\/[^/]+\/status$/;

export function isRemediationStatusRequest(req: any): boolean {
  return (
    req?.method === "GET" && typeof req?.path === "string" && REMEDIATION_STATUS_PATH.test(req.path)
  );
}

// GET /api/status — the public service-status document. Exempt from
// globalLimiter and governed by statusLimiter (below) instead.
//
// The Nitro tier proxies /status over loopback, so every browser hit lands
// on the API as 127.0.0.1 and shares ONE global bucket. Under globalLimiter,
// ordinary site traffic could therefore exhaust the budget and 429 the status
// page — making it fail precisely when someone is checking whether the
// service is healthy.
export function isStatusRequest(req: any): boolean {
  return req?.method === "GET" && req?.path === "/api/status";
}

// GET /api/analyze-job/:id — the audit progress poll (review 2026-11-12).
// Same failure as the remediation poll above, one NAT wider: two people in one
// office polling their own audits shared the anon 100/min global budget,
// 429'd each other and lost healthy audits. Exempt from globalLimiter and
// governed by analyzeJobStatusLimiter on the route instead. Safe to exempt:
// the route answers only to the job's own bearer token (404 otherwise) and is
// an in-memory Map lookup. POST /api/analyze-job is NOT exempt.
const ANALYZE_JOB_STATUS_PATH = /^\/api\/analyze-job\/[^/]+$/;

export function isAnalyzeJobStatusRequest(req: any): boolean {
  return (
    req?.method === "GET" && typeof req?.path === "string" && ANALYZE_JOB_STATUS_PATH.test(req.path)
  );
}

// Single skip predicate for globalLimiter. Kept separate from the individual
// predicates so each stays independently testable.
export function isGlobalLimitExempt(req: any): boolean {
  return isRemediationStatusRequest(req) || isStatusRequest(req) || isAnalyzeJobStatusRequest(req);
}

// ---------------------------------------------------------------------------
// Two-tier limiter factory
// ---------------------------------------------------------------------------
// One express-rate-limit instance whose per-request limit and bucket key
// depend on whether the caller presented the privileged token. The window is
// identical across tiers, so only the limit and key vary.
export interface TierConfig {
  /** Names this limiter in the [rate-limit] log line. */
  name: string;
  windowMs: number;
  anon: number;
  privileged: number;
  message: Record<string, string>;
  /** Requests matching this are neither limited nor counted. */
  skip?: (req: any) => boolean;
  /** Evaluated when the response finishes: a request for which this returns
   *  true is refunded (its hit is taken back out of the bucket). Unlike
   *  `skip`, the request was still subject to the limit on the way in. */
  refund?: (req: any, res: any) => boolean;
}

export function tieredLimiter(cfg: TierConfig) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: (req) => tierLimit(req, cfg),
    keyGenerator: (req) => tierKey(req),
    skip: cfg.skip,
    // express-rate-limit's "successful request" hook is its only refund
    // mechanism: with skipSuccessfulRequests on, a request for which
    // requestWasSuccessful returns true is decremented on "finish". Here
    // "successful" means "refundable" — it is not the library's default
    // status < 400 test.
    ...(cfg.refund ? { skipSuccessfulRequests: true, requestWasSuccessful: cfg.refund } : {}),
    message: cfg.message,
    // Keep standardHeaders on: express-rate-limit sets Retry-After from it
    // BEFORE delegating to a custom handler, and the fleet client honors that
    // header in full. Turning it off would silently downgrade every automated
    // client to blind exponential backoff.
    standardHeaders: true,
    legacyHeaders: false,
    handler: loggedHandler(cfg.name, cfg.message),
  });
}

// ---------------------------------------------------------------------------
// Privileged cache hits are free (2026-11-04)
// ---------------------------------------------------------------------------
// /api/audit-url and /api/audit-url-page answer a repeat request from the
// stored report (content-hash / URL-hash dedup) without running an analysis.
// Those answers used to cost a full hit of the hourly `analyze` budget, so a
// fleet run whose local cache had expired — every document re-asked, almost
// all answered from this server's store in milliseconds — exhausted the
// privileged 5000/hour bucket in about ten minutes (2026-11-04: ~5,000
// requests, 87 actual analyses) and then sat in 15-minute Retry-After waits.
//
// Now a PRIVILEGED request answered from the store is refunded once its
// response finishes. Deliberately privileged-only: for an anonymous caller a
// /audit-url cache hit still costs a full outbound download + hash, so the
// strict tier keeps counting it. globalLimiter (1000/min privileged) still
// counts every request, so the refund cannot turn into an unbounded flood.

let privilegedCacheHits = 0;

/** Route handlers call this on their dedup (served-from-store) branch, before
 *  responding. Flags the response for the refund and counts it. */
export function markServedFromStore(req: any, res: any): void {
  if (res?.locals) res.locals.servedFromStore = true;
  if (isPrivilegedRequest(req)) privilegedCacheHits++;
}

/** The analyze limiter's refund predicate. */
export function isRefundablePrivilegedHit(req: any, res: any): boolean {
  return (
    res?.locals?.servedFromStore === true &&
    typeof res.statusCode === "number" &&
    res.statusCode < 400 &&
    isPrivilegedRequest(req)
  );
}

/** Test seam — zeroes the since-restart cache-hit counter. */
export function resetPrivilegedCacheHits(): void {
  privilegedCacheHits = 0;
}

// Two-tier: anonymous (per-IP) vs privileged (API_PRIVILEGED_TOKEN).
export const analyzeLimiter = tieredLimiter({
  name: "analyze",
  windowMs: RATE_LIMITS.analyze.windowMs,
  anon: RATE_LIMITS.analyze.anon,
  privileged: RATE_LIMITS.analyze.privileged,
  message: { error: "Upload limit reached. Please try again later." },
  refund: isRefundablePrivilegedHit,
});

/** Shape published on /api/status as `privileged_window`. Counts only — the
 *  bucket key is the constant "privileged", never an IP. */
export interface PrivilegedWindow {
  /** Requests counted against the privileged `analyze` budget in the current
   *  window (refunded cache hits excluded). */
  used: number;
  limit: number;
  /** ISO time the current window ends, or null when no window is open. */
  resets_at: string | null;
  /** Privileged requests answered from the stored report since the API
   *  process started (not counted against the budget). */
  cache_hits_since_restart: number;
}

/** Current state of the privileged `analyze` bucket — the figure that would
 *  have explained the 2026-11-04 throttle in one glance. */
export async function privilegedWindowStatus(
  limiter: { getKey: (key: string) => unknown } = analyzeLimiter,
  nowMs: number = Date.now(),
): Promise<PrivilegedWindow> {
  const info = (await limiter.getKey("privileged")) as
    { totalHits?: number; resetTime?: Date } | undefined;
  const reset = info?.resetTime instanceof Date ? info.resetTime.getTime() : null;
  const open = reset !== null && reset > nowMs;
  return {
    used: open ? Math.max(0, Number(info?.totalHits) || 0) : 0,
    limit: RATE_LIMITS.analyze.privileged,
    resets_at: open ? new Date(reset).toISOString().replace(/\.\d{3}Z$/, "Z") : null,
    cache_hits_since_restart: privilegedCacheHits,
  };
}

const REPORTS_MESSAGE = { error: "Share limit reached. Please try again later." };
export const reportsLimiter = rateLimit({
  windowMs: RATE_LIMITS.reports.windowMs,
  max: RATE_LIMITS.reports.max,
  keyGenerator: ipKey,
  message: REPORTS_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: loggedHandler("reports", REPORTS_MESSAGE),
});

const BULK_MESSAGE = { error: "Bulk audit limit reached. Please try again later." };
/** /api/bulk-from-inventory: 100 fetches + analyses per request, so a
 *  budget of its own (2026-09-02). */
export const bulkLimiter = rateLimit({
  windowMs: RATE_LIMITS.bulk.windowMs,
  max: RATE_LIMITS.bulk.max,
  keyGenerator: ipKey,
  message: BULK_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: loggedHandler("bulk", BULK_MESSAGE),
});

// Two-tier catch-all burst guard, applied to every route in index.ts.
// Remediation status polls and the public /api/status document are exempt
// (each has its own limiter below) so neither a long-running job's progress
// page nor the status page can be starved by the shared budget.
export const globalLimiter = tieredLimiter({
  name: "global",
  windowMs: RATE_LIMITS.global.windowMs,
  anon: RATE_LIMITS.global.anon,
  privileged: RATE_LIMITS.global.privileged,
  message: { error: "Too many requests. Please slow down." },
  skip: isGlobalLimitExempt,
});

// Flood guard for the (cheap, poll-heavy) remediation status endpoint —
// the only cap that applies to it, since globalLimiter skips it. The
// client treats a 429 from here as back-off feedback, not a job failure.
const REMEDIATION_STATUS_MESSAGE = { error: "Too many status requests. Please slow down." };
export const remediationStatusLimiter = rateLimit({
  windowMs: RATE_LIMITS.remediationStatus.windowMs,
  max: RATE_LIMITS.remediationStatus.max,
  keyGenerator: ipKey,
  message: REMEDIATION_STATUS_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: loggedHandler("remediationStatus", REMEDIATION_STATUS_MESSAGE),
});

// Flood guard for the audit progress poll (GET /api/analyze-job/:id) — the
// only cap that applies to it, since globalLimiter skips it.
const ANALYZE_JOB_STATUS_MESSAGE = { error: "Too many status requests. Please slow down." };
export const analyzeJobStatusLimiter = rateLimit({
  windowMs: RATE_LIMITS.analyzeJobStatus.windowMs,
  max: RATE_LIMITS.analyzeJobStatus.max,
  keyGenerator: ipKey,
  message: ANALYZE_JOB_STATUS_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: loggedHandler("analyzeJobStatus", ANALYZE_JOB_STATUS_MESSAGE),
});

// Flood guard for the public /api/status document — the only cap that
// applies to it, since globalLimiter skips it. Keyed by IP rather than
// ipKey: the endpoint is unauthenticated by design, so there is no
// user to key by.
const STATUS_MESSAGE = { error: "Too many status requests. Please slow down." };
export const statusLimiter = rateLimit({
  windowMs: RATE_LIMITS.status.windowMs,
  max: RATE_LIMITS.status.max,
  keyGenerator: ipKey,
  message: STATUS_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: loggedHandler("status", STATUS_MESSAGE),
});

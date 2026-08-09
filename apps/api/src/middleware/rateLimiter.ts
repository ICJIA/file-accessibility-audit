import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { RATE_LIMITS } from "#config";

// Per-IP rate-limit bucket key. The IP is used TRANSIENTLY, in memory only —
// the service stores no identity anywhere (v1.68.0); express-rate-limit's
// default MemoryStore never touches disk and forgets everything on restart.
function ipKey(req: any): string {
  return req.ip || "unknown";
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

// Single skip predicate for globalLimiter. Kept separate from the two
// individual predicates so each stays independently testable.
export function isGlobalLimitExempt(req: any): boolean {
  return isRemediationStatusRequest(req) || isStatusRequest(req);
}

// ---------------------------------------------------------------------------
// Two-tier limiter factory
// ---------------------------------------------------------------------------
// One express-rate-limit instance whose per-request limit and bucket key
// depend on whether the caller presented the privileged token. The window is
// identical across tiers, so only the limit and key vary.
export interface TierConfig {
  windowMs: number;
  anon: number;
  privileged: number;
  message: Record<string, string>;
  /** Requests matching this are neither limited nor counted. */
  skip?: (req: any) => boolean;
}

export function tieredLimiter(cfg: TierConfig) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: (req) => tierLimit(req, cfg),
    keyGenerator: (req) => tierKey(req),
    skip: cfg.skip,
    message: cfg.message,
    standardHeaders: true,
    legacyHeaders: false,
    // Respond in the same JSON shape as the rest of the API (the library's
    // default handler uses res.send) so clients only ever parse one format.
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json(cfg.message);
    },
  });
}

// Two-tier: anonymous (per-IP) vs privileged (API_PRIVILEGED_TOKEN).
export const analyzeLimiter = tieredLimiter({
  windowMs: RATE_LIMITS.analyze.windowMs,
  anon: RATE_LIMITS.analyze.anon,
  privileged: RATE_LIMITS.analyze.privileged,
  message: { error: "Upload limit reached. Please try again later." },
});

export const reportsLimiter = rateLimit({
  windowMs: RATE_LIMITS.reports.windowMs,
  max: RATE_LIMITS.reports.max,
  keyGenerator: ipKey,
  message: { error: "Share limit reached. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Two-tier catch-all burst guard, applied to every route in index.ts.
// Remediation status polls and the public /api/status document are exempt
// (each has its own limiter below) so neither a long-running job's progress
// page nor the status page can be starved by the shared budget.
export const globalLimiter = tieredLimiter({
  windowMs: RATE_LIMITS.global.windowMs,
  anon: RATE_LIMITS.global.anon,
  privileged: RATE_LIMITS.global.privileged,
  message: { error: "Too many requests. Please slow down." },
  skip: isGlobalLimitExempt,
});

// Flood guard for the (cheap, poll-heavy) remediation status endpoint —
// the only cap that applies to it, since globalLimiter skips it. The
// client treats a 429 from here as back-off feedback, not a job failure.
export const remediationStatusLimiter = rateLimit({
  windowMs: RATE_LIMITS.remediationStatus.windowMs,
  max: RATE_LIMITS.remediationStatus.max,
  keyGenerator: ipKey,
  message: { error: "Too many status requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Flood guard for the public /api/status document — the only cap that
// applies to it, since globalLimiter skips it. Keyed by IP rather than
// ipKey: the endpoint is unauthenticated by design, so there is no
// user to key by.
export const statusLimiter = rateLimit({
  windowMs: RATE_LIMITS.status.windowMs,
  max: RATE_LIMITS.status.max,
  keyGenerator: (req) => req.ip || "unknown",
  message: { error: "Too many status requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

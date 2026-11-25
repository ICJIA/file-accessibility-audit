/**
 * Admission control for link checks to hosts OFF the approved list
 * (POST /api/analyze-url, anonymous — v1.180.0).
 *
 * WHY. Until v1.180.0 only an approved host could supply the body of a URL
 * fetch. Now any public host can, and safeFetch buffers that body in memory
 * BEFORE the analysis semaphore is reached. The per-IP hourly budget
 * (urlAnyHostLimiter) bounds how MANY fetches one address starts; it says
 * nothing about how many are open at once. Red-team review 2026-11-25:
 *
 *   - one address firing its 20 requests together at a host that sends
 *     ~25 MB and then stalls holds ~500 MB against the API's 768 MB cap; a
 *     second address tips it over, and the restart wipes every in-memory
 *     limiter, so it repeats;
 *   - a `?prefill=` link spreads the fetches across visitors' addresses, so
 *     a per-IP budget alone does not bound what one third-party site
 *     receives from this server.
 *
 * So four bounds, all in process memory (transient, written nowhere — the
 * same posture as services/remediationCap.ts):
 *
 *   in flight, everyone    URL_FETCH.ANY_HOST_MAX_CONCURRENT
 *   in flight, one caller  URL_FETCH.ANY_HOST_MAX_PER_CALLER
 *   per hour, everyone     URL_FETCH.ANY_HOST_MAX_PER_HOUR
 *   per hour, one target   URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR
 *                          (counted per HOP — see chargeAnyHostTarget)
 *
 * Worst case held in memory by this path: MAX_CONCURRENT × the 25 MB cap.
 */
import { URL_FETCH } from "#config";

export type AnyHostRefusal = "busy" | "caller-busy" | "hourly" | "target-hourly";

export type AnyHostAdmission =
  { ok: true; release: () => void } | { ok: false; reason: AnyHostRefusal };

const HOUR_MS = 60 * 60 * 1000;

let inFlight = 0;
const inFlightByCaller = new Map<string, number>();
/** Start times of admitted fetches in the last hour, oldest first. */
let started: number[] = [];
const startedByTarget = new Map<string, number[]>();

function prune(now: number): void {
  const cutoff = now - HOUR_MS;
  started = started.filter((t) => t > cutoff);
  for (const [host, times] of startedByTarget) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length) startedByTarget.set(host, kept);
    else startedByTarget.delete(host);
  }
}

/**
 * The website a host belongs to, for the per-target ceiling: its last two
 * labels ("docs.example.com" → "example.com"), or its last three when the
 * last two look like a shared public suffix ("a.example.co.uk" →
 * "example.co.uk"). An approximation of the registrable domain, on purpose:
 * there is no public-suffix list here, and the two ways it can be wrong are
 * both safe for a CEILING — sites sharing an unusual suffix share a budget,
 * which only ever refuses sooner. An address literal is its own target.
 */
export function targetOf(hostname: string): string {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host || host.includes(":") || /^[0-9.]+$/.test(host)) return host;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1]!;
  const sld = labels[labels.length - 2]!;
  const sharedSuffix = tld.length === 2 && sld.length <= 3;
  return labels.slice(sharedSuffix ? -3 : -2).join(".");
}

/**
 * Count one fetch toward a website, and say whether it is still within the
 * hourly ceiling for that site. Called for EVERY hop of an off-list fetch —
 * the first address and each redirect — by the validator the pipeline hands
 * to safeFetch. Charging only the address the caller typed (as this did when
 * first written, earlier the same day) let a caller name their own host and
 * have it redirect to the site they meant to aim at: the redirect target was
 * fetched and never counted (commit security review, 2026-11-25).
 */
export function chargeAnyHostTarget(hostname: string, now: number = Date.now()): boolean {
  prune(now);
  const target = targetOf(hostname);
  const forTarget = startedByTarget.get(target) ?? [];
  if (forTarget.length >= URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR) return false;
  startedByTarget.set(target, [...forTarget, now]);
  return true;
}

export function admitAnyHostFetch(callerKey: string, now: number = Date.now()): AnyHostAdmission {
  prune(now);
  if ((inFlightByCaller.get(callerKey) ?? 0) >= URL_FETCH.ANY_HOST_MAX_PER_CALLER) {
    return { ok: false, reason: "caller-busy" };
  }
  if (inFlight >= URL_FETCH.ANY_HOST_MAX_CONCURRENT) return { ok: false, reason: "busy" };
  if (started.length >= URL_FETCH.ANY_HOST_MAX_PER_HOUR) return { ok: false, reason: "hourly" };

  inFlight += 1;
  inFlightByCaller.set(callerKey, (inFlightByCaller.get(callerKey) ?? 0) + 1);
  started.push(now);

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      inFlight -= 1;
      const left = (inFlightByCaller.get(callerKey) ?? 1) - 1;
      if (left > 0) inFlightByCaller.set(callerKey, left);
      else inFlightByCaller.delete(callerKey);
    },
  };
}

/** What each refusal answers. 503 for "the service is full", 429 for "this
 *  caller, or this target, has had its share" — the codes follow from the
 *  status (services/apiError.ts). Every message names the way forward. */
export const ANY_HOST_REFUSALS: Record<AnyHostRefusal, { status: number; error: string }> = {
  busy: {
    status: 503,
    error: "The link checker is busy right now. Try again in a moment, or upload the file instead.",
  },
  "caller-busy": {
    status: 429,
    error:
      "Link check limit reached: one link at a time. Wait for the first to finish, or upload the file instead.",
  },
  hourly: {
    status: 503,
    error:
      "The link checker has reached its hourly limit for sites outside the approved list. Upload the file instead, or try again later.",
  },
  "target-hourly": {
    status: 429,
    error:
      "Link check limit reached for that website this hour. Upload the file instead, or try again later.",
  },
};

/** Tests only. */
export function resetAnyHostGate(): void {
  inFlight = 0;
  inFlightByCaller.clear();
  started = [];
  startedByTarget.clear();
}

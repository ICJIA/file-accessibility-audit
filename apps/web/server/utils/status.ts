// Aggregation behind GET /status — the public service-status document.
//
// Structured like server/utils/health.ts: pure and probe-injected, so it can
// be unit-tested without a live API. The route supplies the real $fetch probe.
//
// Division of responsibility with the Express tier:
//   - Express (services/status.ts) owns everything measurable: engines,
//     database, counts, version, uptime.
//   - This tier owns `web` and `api`, which NEITHER process can self-report.
//     `web` is ok by construction whenever this code runs at all; `api` is ok
//     only if the loopback probe answered.

/** The Express payload, as far as this tier needs to understand it. Kept
 *  loose deliberately — the web tier passes the body through rather than
 *  re-validating a shape the API already owns, so adding a field to the API
 *  payload never requires a matching edit here. */
export interface ApiStatusPayload {
  status?: string;
  database?: string;
  engines?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StatusResult {
  httpStatus: 200 | 503;
  body: Record<string, unknown> & {
    status: string;
    web: "ok";
    api: "ok" | "down";
  };
}

/** Returned when the API cannot be reached.
 *
 *  Deliberately minimal rather than partial: without the API, no version, no
 *  engine result and no count is knowable, and emitting zeros would be a
 *  false statement rather than a missing one. Consumers must treat everything
 *  except status/web/api as optional. */
const API_DOWN: StatusResult = {
  httpStatus: 503,
  body: { status: "down", web: "ok", api: "down" },
};

/** Engines whose failure means the service cannot audit at all. Mirrors
 *  CORE_ENGINES in apps/api/src/services/status.ts. Duplicated rather than
 *  imported because the web tier does not depend on the API package;
 *  statusCoreEngines.test.ts asserts the two lists stay in agreement. */
export const CORE_ENGINE_NAMES = ["qpdf"] as const;

/** Does this payload describe an outage (503) rather than a degradation (200)?
 *
 *  Computed here rather than trusting an HTTP code from the API, because the
 *  Express route is reached over loopback and its own status code is not
 *  visible to $fetch on the success path. */
export function isOutage(payload: ApiStatusPayload): boolean {
  if (payload.database === "down") return true;
  const engines = payload.engines;
  if (!engines || typeof engines !== "object") return false;
  return CORE_ENGINE_NAMES.some((name) => {
    const engine = engines[name] as { ok?: unknown } | undefined;
    // Absent engine data is not evidence of failure — only an explicit
    // ok:false is. A payload from an older API that lacks the key should not
    // be reported as an outage.
    return engine !== undefined && engine.ok === false;
  });
}

/** Reached the API, but it returned something with no status data — a 429
 *  from its own limiter, or an error body. The process is demonstrably alive
 *  (it answered), so reporting "down" would be false; but nothing about the
 *  service's health is known, so claiming "ok" would be equally false. */
const API_UP_NO_DATA: StatusResult = {
  httpStatus: 200,
  body: { status: "unknown", web: "ok", api: "ok" },
};

export async function resolveStatus(
  probeApi: () => Promise<ApiStatusPayload>,
): Promise<StatusResult> {
  let api: ApiStatusPayload;
  try {
    api = await probeApi();
  } catch (err) {
    // The route passes ignoreResponseError, so reaching here means a
    // transport failure — unreachable, timeout, DNS. A 429 arrives as a body
    // instead and is handled below.
    if ((err as { statusCode?: number } | null)?.statusCode === 429) {
      return API_UP_NO_DATA;
    }
    return API_DOWN;
  }

  if (!api || typeof api !== "object") return API_DOWN;

  // A CORE failure (missing qpdf, dead database) makes Express answer 503
  // WITH a full payload naming the broken component. Because the probe
  // ignores response errors, that payload arrives here intact and must be
  // passed through — discarding it in favour of a bare "api down" would
  // throw away the exact diagnosis this endpoint exists to deliver.
  //
  // An error body with no `status` field is the other case: a 429 or a
  // handler failure. Nothing is knowable from it, so report reachable-but-
  // unknown rather than spreading the limiter's message into the response.
  if (typeof api.status !== "string") {
    return API_UP_NO_DATA;
  }

  return {
    httpStatus: isOutage(api) ? 503 : 200,
    body: { ...api, status: api.status, web: "ok", api: "ok" },
  };
}

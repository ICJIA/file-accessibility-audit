// Aggregated health decision for GET /healthz — the single uptime-monitor URL.
// The Nuxt tier serves the route, so "web" is ok by construction whenever this
// code runs; the API tier is ok only if its /api/health probe answers
// { status: "ok" }. Pure and probe-injected so it can be unit-tested without a
// live API (see app/__tests__/healthz.test.ts); the route supplies the real
// $fetch probe.

export interface ApiHealthPayload {
  status?: string;
  uptime?: string;
}

export interface HealthzResult {
  httpStatus: 200 | 503;
  body: {
    status: "ok" | "down";
    web: "ok";
    api: "ok" | "down";
    apiUptime?: string;
  };
}

const API_DOWN: HealthzResult = {
  httpStatus: 503,
  body: { status: "down", web: "ok", api: "down" },
};

export async function resolveHealthz(
  probeApi: () => Promise<ApiHealthPayload>,
): Promise<HealthzResult> {
  try {
    const api = await probeApi();
    if (api?.status !== "ok") return API_DOWN;
    return {
      httpStatus: 200,
      body: { status: "ok", web: "ok", api: "ok", apiUptime: api.uptime },
    };
  } catch (err) {
    // /healthz itself is unauthenticated and un-throttled (Nitro tier), while
    // its loopback probe shares the API's 127.0.0.1 rate bucket. A 429 from
    // the API's own limiter still proves the process is alive — without this,
    // flooding /healthz (>100 req/min) would fake an "api down" uptime alert.
    // Only 429 counts: any other HTTP error stays "down".
    if ((err as { statusCode?: number } | null)?.statusCode === 429) {
      return {
        httpStatus: 200,
        body: { status: "ok", web: "ok", api: "ok" },
      };
    }
    return API_DOWN;
  }
}

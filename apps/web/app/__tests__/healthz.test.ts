import { describe, it, expect } from "vitest";
import { resolveHealthz, type ApiHealthPayload } from "../../server/utils/health";

// /healthz is the single uptime-monitor URL covering both tiers: the Nuxt
// process serves it, and it reports 200 only when the Express API's
// /api/health also answers ok. The monitoring-critical property is that ANY
// API-side failure — unreachable, timeout, or a non-ok body — yields HTTP 503
// so the monitor flags the site down, while the JSON body still names the
// failing tier for whoever investigates.

describe("resolveHealthz", () => {
  it("returns 200 with both tiers ok and the API uptime when the API answers ok", async () => {
    const result = await resolveHealthz(async () => ({
      status: "ok",
      uptime: "3d 4h 5m 6s",
    }));
    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({
      status: "ok",
      web: "ok",
      api: "ok",
      apiUptime: "3d 4h 5m 6s",
    });
  });

  it("returns 503 with api down when the probe rejects (API unreachable or timed out)", async () => {
    const result = await resolveHealthz(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5103");
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body).toEqual({ status: "down", web: "ok", api: "down" });
  });

  it("treats a 429 from the API's own rate limiter as alive (a flood at /healthz must not fake an outage)", async () => {
    const rateLimited = Object.assign(new Error("429 Too Many Requests"), {
      statusCode: 429,
    });
    const result = await resolveHealthz(async () => {
      throw rateLimited;
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({ status: "ok", web: "ok", api: "ok" });
  });

  it("still treats a non-429 HTTP error from the probe as down", async () => {
    const serverError = Object.assign(new Error("500 Internal Server Error"), {
      statusCode: 500,
    });
    const result = await resolveHealthz(async () => {
      throw serverError;
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body).toEqual({ status: "down", web: "ok", api: "down" });
  });

  it("returns 503 when the API responds but not with status ok", async () => {
    const result = await resolveHealthz(async () => ({ status: "degraded" }));
    expect(result.httpStatus).toBe(503);
    expect(result.body).toEqual({ status: "down", web: "ok", api: "down" });
  });

  it("returns 503 when the API responds with an empty body", async () => {
    const result = await resolveHealthz(async () => ({}));
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe("down");
  });

  it("returns 503 when the API responds with a null body", async () => {
    const result = await resolveHealthz(async () => null as unknown as ApiHealthPayload);
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe("down");
  });

  it("omits apiUptime when the API is down", async () => {
    const result = await resolveHealthz(async () => {
      throw new Error("timeout");
    });
    expect("apiUptime" in result.body).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { resolveStatus, isOutage, CORE_ENGINE_NAMES } from "../../server/utils/status";

// /status is the public service-status document, served by the Nuxt tier so a
// single URL can report on both processes. The Express tier owns every
// measurable figure; this tier owns only `web` and `api`, which neither
// process can self-report, and the choice of HTTP status code.
//
// The monitoring-critical property is that a CORE failure reaches the caller
// as 503 *with the payload intact* — Express answers 503 when qpdf or the
// database is broken, and that payload names the broken component. Throwing
// it away in favour of a bare "api down" would defeat the endpoint's purpose.

const OK_PAYLOAD = {
  status: "ok",
  version: "1.38.2",
  database: "ok",
  engines: {
    checked_at: "2026-08-03T14:19:44Z",
    qpdf: { ok: true, version: "12.3.2" },
    verapdf: { ok: true, version: "1.26.1" },
    chromium: { ok: true },
  },
  documents_audited: { last_24h: 3, last_30d: 20, total: 100 },
};

describe("resolveStatus", () => {
  it("passes the API payload through and adds web/api when everything is ok", async () => {
    const result = await resolveStatus(async () => OK_PAYLOAD);
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe("ok");
    expect(result.body.web).toBe("ok");
    expect(result.body.api).toBe("ok");
    // The web tier must not re-shape what the API reported.
    expect(result.body.documents_audited).toEqual(OK_PAYLOAD.documents_audited);
    expect(result.body.engines).toEqual(OK_PAYLOAD.engines);
  });

  it("returns 503 but KEEPS the payload when a core engine is down", async () => {
    const result = await resolveStatus(async () => ({
      ...OK_PAYLOAD,
      status: "degraded",
      degraded: ["qpdf"],
      engines: { ...OK_PAYLOAD.engines, qpdf: { ok: false, reason: "not_executable" } },
    }));

    expect(result.httpStatus).toBe(503);
    // The whole point: a monitor sees 503 AND an investigator can still read
    // which engine broke.
    expect(result.body.degraded).toEqual(["qpdf"]);
    expect((result.body.engines as any).qpdf).toEqual({
      ok: false,
      reason: "not_executable",
    });
    expect(result.body.api).toBe("ok");
  });

  it("stays 200 when only optional engines are down", async () => {
    const result = await resolveStatus(async () => ({
      ...OK_PAYLOAD,
      status: "degraded",
      degraded: ["verapdf"],
      engines: { ...OK_PAYLOAD.engines, verapdf: { ok: false, reason: "not_configured" } },
    }));

    // veraPDF being unavailable removes the PDF/UA verdict but leaves
    // document auditing working — not an outage, must not page anyone.
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe("degraded");
  });

  it("returns 503 when the database is down", async () => {
    const result = await resolveStatus(async () => ({
      ...OK_PAYLOAD,
      status: "degraded",
      database: "down",
    }));
    expect(result.httpStatus).toBe(503);
  });

  it("returns a minimal payload — not a partial one — when the API is unreachable", async () => {
    const result = await resolveStatus(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5103");
    });
    expect(result.httpStatus).toBe(503);
    // No version, no counts, no engines: none of it is knowable without the
    // API, and emitting zeros would be a false statement rather than an
    // absent one.
    expect(result.body).toEqual({ status: "down", web: "ok", api: "down" });
  });

  it("reports reachable-but-unknown for a rate-limit body carrying no status", async () => {
    const result = await resolveStatus(async () => ({
      error: "Too many status requests. Please slow down.",
    }));
    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({ status: "unknown", web: "ok", api: "ok" });
    // The limiter's message must not be spread into the public response.
    expect(JSON.stringify(result.body)).not.toContain("Too many");
  });

  it("treats a thrown 429 as alive but unknown", async () => {
    const rateLimited = Object.assign(new Error("429 Too Many Requests"), {
      statusCode: 429,
    });
    const result = await resolveStatus(async () => {
      throw rateLimited;
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({ status: "unknown", web: "ok", api: "ok" });
  });

  it("treats a non-object body as the API being down", async () => {
    const result = await resolveStatus(async () => null as any);
    expect(result.httpStatus).toBe(503);
    expect(result.body.api).toBe("down");
  });

  it("never lets the API payload override web/api", async () => {
    // A compromised or buggy API must not be able to assert that the web
    // tier is down, or that it is itself up when it is not.
    const result = await resolveStatus(async () => ({
      ...OK_PAYLOAD,
      web: "down",
      api: "down",
    }));
    expect(result.body.web).toBe("ok");
    expect(result.body.api).toBe("ok");
  });
});

describe("isOutage", () => {
  it("does not treat missing engine data as a failure", () => {
    // A payload from an older API that lacks the key must not be reported as
    // an outage — absence of evidence is not evidence of breakage.
    expect(isOutage({ status: "ok" })).toBe(false);
    expect(isOutage({ status: "ok", engines: {} })).toBe(false);
  });

  it("only counts an explicit ok:false", () => {
    expect(isOutage({ engines: { qpdf: { ok: true } } })).toBe(false);
    expect(isOutage({ engines: { qpdf: { ok: false } } })).toBe(true);
  });

  it("ignores optional engines", () => {
    expect(isOutage({ engines: { verapdf: { ok: false }, chromium: { ok: false } } })).toBe(false);
  });

  it("lists qpdf as the only core engine", () => {
    // Guards the tier split: promoting veraPDF or Chromium to core would
    // start paging operators for a degradation that leaves auditing intact.
    expect([...CORE_ENGINE_NAMES]).toEqual(["qpdf"]);
  });
});

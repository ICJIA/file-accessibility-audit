/**
 * Tests for the public status document behind GET /api/status.
 *
 * These build a real ":memory:" database through the actual migration runner
 * rather than hand-writing a schema, so the SQL under test runs against the
 * same columns and types production has. That matters here more than usual:
 * audit_log.created_at is a UTC datetime STRING while
 * remediation_jobs.created_at is an INTEGER ms epoch, and a hand-copied
 * fixture that got either wrong would let a broken query pass.
 *
 * The clock is injected everywhere, so the two independent cache TTLs are
 * exercised by advancing a number rather than by sleeping.
 */
import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrations.js";
import { STATUS } from "#config";
import {
  createStatusService,
  collectAggregates,
  degradedList,
  isCoreFailure,
  payloadIsCoreFailure,
  extractVersion,
  formatUptime,
  isoSeconds,
  sqliteUtcToIso,
  type EngineProbes,
  type EngineSnapshot,
  type StatusDb,
} from "../services/status.js";

type DB = InstanceType<typeof Database>;

const T0 = Date.UTC(2026, 7, 3, 14, 22, 10); // 2026-08-03T14:22:10Z
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function freshDb(): DB {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

/** Inserts an audit_log row `agoMs` before T0. created_at is written the way
 *  SQLite's CURRENT_TIMESTAMP would: "YYYY-MM-DD HH:MM:SS", UTC, no zone. */
function seedAudit(
  db: DB,
  opts: { eventType: string; filename: string; agoMs?: number; email?: string },
): void {
  const at = new Date(T0 - (opts.agoMs ?? 0)).toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO audit_log (event_type, email, filename, score, grade, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(opts.eventType, opts.email ?? "anonymous", opts.filename, 80, "B", at);
}

function seedRemediation(db: DB, status: string, agoMs = 0): void {
  db.prepare(
    `INSERT INTO remediation_jobs (id, input_filename, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(`job-${Math.random()}`, "x.pdf", status, T0 - agoMs, T0 + DAY);
}

const OK_ENGINES: EngineProbes = {
  qpdf: async () => ({ ok: true, version: "12.3.2" }),
  verapdf: async () => ({ ok: true, version: "1.26.1" }),
  chromium: async () => ({ ok: true }),
};

function makeService(db: DB, probes: EngineProbes = OK_ENGINES, clock = { now: T0 }) {
  return createStatusService({
    now: () => clock.now,
    db: db as unknown as StatusDb,
    probes,
    version: "1.38.2",
    startedAtMs: T0 - (2 * DAY + 3 * HOUR),
    remediationEnabled: true,
  });
}

// ---------------------------------------------------------------------------

describe("document counting", () => {
  it("counts every document-audit event type and excludes page audits and auth events", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "a.pdf" });
    seedAudit(db, { eventType: "analyze-url", filename: "b.pdf" });
    seedAudit(db, { eventType: "audit-url", filename: "c.pdf" });
    seedAudit(db, { eventType: "bulk-from-inventory", filename: "d.pdf" });

    // Must NOT be counted: a page audit stores a URL in the filename column,
    // so counting it would inflate the total AND corrupt the format split.
    seedAudit(db, { eventType: "audit-url-page", filename: "https://example.gov/page" });
    seedAudit(db, { eventType: "login", filename: "" });
    seedAudit(db, { eventType: "otp_request", filename: "" });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.total).toBe(4);
    expect(payload.documents_audited.by_format_total.pdf).toBe(4);
    // The page audit's URL must not have landed in any bucket.
    expect(payload.documents_audited.by_format_total.other).toBe(0);
  });

  it("splits by filename extension, case-insensitively", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "report.pdf" });
    seedAudit(db, { eventType: "analyze", filename: "SHOUTING.PDF" });
    seedAudit(db, { eventType: "analyze", filename: "memo.docx" });
    seedAudit(db, { eventType: "analyze", filename: "deck.pptx" });
    seedAudit(db, { eventType: "analyze", filename: "sheet.xlsx" });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.by_format_total).toEqual({
      pdf: 2,
      docx: 1,
      pptx: 1,
      xlsx: 1,
      other: 0,
    });
  });

  it("buckets an extension-less filename as 'other' rather than dropping it", async () => {
    // URL-derived filenames can arrive without an extension. Silently
    // dropping them would make the format split disagree with the total.
    const db = freshDb();
    seedAudit(db, { eventType: "audit-url", filename: "download?id=123" });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.total).toBe(1);
    expect(payload.documents_audited.by_format_total.other).toBe(1);
  });

  it("applies the 24h and 30d windows correctly", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "now.pdf", agoMs: HOUR });
    seedAudit(db, { eventType: "analyze", filename: "yesterday.pdf", agoMs: 2 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "old.pdf", agoMs: 90 * DAY });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.last_24h).toBe(1);
    expect(payload.documents_audited.last_30d).toBe(2);
    expect(payload.documents_audited.total).toBe(3);
    // The 30d format split must respect the window too.
    expect(payload.documents_audited.by_format_30d.pdf).toBe(2);
    expect(payload.documents_audited.by_format_total.pdf).toBe(3);
  });

  it("reports last_audit_at as UTC ISO, not a bare SQLite datetime", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "a.pdf", agoMs: 5 * HOUR });

    const payload = await makeService(db).getStatus();
    // Without the Z, some engines parse the value as local time and shift
    // every timestamp by the server's offset.
    expect(payload.last_audit_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(payload.last_audit_at).toBe("2026-08-03T09:22:10Z");
  });

  it("renders last_audit_at_chicago for the same instant", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "a.pdf", agoMs: 5 * HOUR });

    const payload = await makeService(db).getStatus();
    // 09:22:10Z is 04:22:10 CDT — the local rendering must describe the same
    // moment as the UTC field, not a re-read of the clock.
    expect(payload.last_audit_at_chicago).toBe("Aug 3, 2026, 4:22:10 AM CDT");
  });

  it("leaves last_audit_at_chicago null when there is no audit", async () => {
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.last_audit_at).toBeNull();
    expect(payload.last_audit_at_chicago).toBeNull();
  });

  it("returns nulls and zeros on an empty database rather than throwing", async () => {
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.documents_audited.total).toBe(0);
    expect(payload.last_audit_at).toBeNull();
    expect(payload.status).toBe("ok");
  });
});

describe("remediation counts", () => {
  it("counts completed and failed jobs in the last 24h using the ms-epoch column", async () => {
    const db = freshDb();
    seedRemediation(db, "complete", HOUR);
    seedRemediation(db, "complete", 2 * HOUR);
    seedRemediation(db, "failed", 3 * HOUR);
    seedRemediation(db, "complete", 2 * DAY); // outside the window
    seedRemediation(db, "running", HOUR); // neither complete nor failed

    const payload = await makeService(db).getStatus();
    expect(payload.remediation.jobs_24h).toEqual({ complete: 2, failed: 1 });
  });
});

describe("tiered failure semantics", () => {
  it("is ok with every engine healthy", async () => {
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.status).toBe("ok");
    expect(payload.degraded).toBeUndefined();
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("treats a broken qpdf as a core failure", async () => {
    const payload = await makeService(freshDb(), {
      ...OK_ENGINES,
      qpdf: async () => ({ ok: false, reason: "not_executable" }),
    }).getStatus();

    expect(payload.status).toBe("degraded");
    expect(payload.degraded).toContain("qpdf");
    // qpdf underpins every audit path, so this is an outage.
    expect(payloadIsCoreFailure(payload)).toBe(true);
  });

  it("treats a broken veraPDF as degraded, NOT an outage", async () => {
    const payload = await makeService(freshDb(), {
      ...OK_ENGINES,
      verapdf: async () => ({ ok: false, reason: "not_configured" }),
    }).getStatus();

    expect(payload.status).toBe("degraded");
    expect(payload.degraded).toEqual(["verapdf"]);
    // Document auditing still works — paging an operator would be wrong.
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("treats a broken Chromium as degraded, NOT an outage", async () => {
    const payload = await makeService(freshDb(), {
      ...OK_ENGINES,
      chromium: async () => ({ ok: false, reason: "not_executable" }),
    }).getStatus();
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("lists every failure, core first", async () => {
    const payload = await makeService(freshDb(), {
      qpdf: async () => ({ ok: false, reason: "error" }),
      verapdf: async () => ({ ok: false, reason: "timeout" }),
      chromium: async () => ({ ok: false, reason: "not_executable" }),
    }).getStatus();
    expect(payload.degraded).toEqual(["qpdf", "verapdf", "chromium"]);
  });

  it("treats a failing database as a core failure and still answers", async () => {
    const brokenDb: StatusDb = {
      prepare() {
        throw new Error("SQLITE_CORRUPT: database disk image is malformed");
      },
    };
    const service = createStatusService({
      now: () => T0,
      db: brokenDb,
      probes: OK_ENGINES,
      version: "1.38.2",
      startedAtMs: T0 - DAY,
      remediationEnabled: false,
    });

    // Reporting breakage is the endpoint's job; it must not itself break.
    const payload = await service.getStatus();
    expect(payload.database).toBe("down");
    expect(payload.degraded).toContain("database");
    expect(payloadIsCoreFailure(payload)).toBe(true);
    expect(payload.documents_audited.total).toBe(0);
  });
});

describe("independent cache TTLs", () => {
  // This is the test that protects an uptime monitor from spawning a veraPDF
  // JVM on every poll. It asserts probe INVOCATION COUNTS, never elapsed
  // wall-clock, so it cannot become flaky under load.
  function countingProbes() {
    const calls = { qpdf: 0, verapdf: 0, chromium: 0 };
    const probes: EngineProbes = {
      qpdf: async () => (calls.qpdf++, { ok: true, version: "12.3.2" }),
      verapdf: async () => (calls.verapdf++, { ok: true, version: "1.26.1" }),
      chromium: async () => (calls.chromium++, { ok: true }),
    };
    return { calls, probes };
  }

  it("does not re-run engine probes when only the aggregate TTL has expired", async () => {
    const db = freshDb();
    const { calls, probes } = countingProbes();
    const clock = { now: T0 };
    const service = makeService(db, probes, clock);

    await service.getStatus();
    expect(calls.verapdf).toBe(1);

    // Past the 60s aggregate TTL but well inside the 10-minute engine TTL.
    clock.now = T0 + STATUS.AGGREGATE_TTL_MS + 1000;
    seedAudit(db, { eventType: "analyze", filename: "new.pdf" });
    const second = await service.getStatus();

    // Counts refreshed...
    expect(second.documents_audited.total).toBe(1);
    // ...but no JVM was started.
    expect(calls.verapdf).toBe(1);
    expect(calls.qpdf).toBe(1);
  });

  it("re-runs engine probes once the engine TTL expires", async () => {
    const { calls, probes } = countingProbes();
    const clock = { now: T0 };
    const service = makeService(freshDb(), probes, clock);

    await service.getStatus();
    clock.now = T0 + STATUS.ENGINE_PROBE_TTL_MS + 1000;
    await service.getStatus();

    expect(calls.verapdf).toBe(2);
  });

  it("serves cached aggregates inside the aggregate TTL", async () => {
    const db = freshDb();
    const service = makeService(db);

    const first = await service.getStatus();
    expect(first.documents_audited.total).toBe(0);

    seedAudit(db, { eventType: "analyze", filename: "new.pdf" });
    const second = await service.getStatus();
    // Same instant, so the cached snapshot is correct to serve.
    expect(second.documents_audited.total).toBe(0);
  });

  it("coalesces concurrent probe runs into a single computation", async () => {
    const { calls, probes } = countingProbes();
    const slow: EngineProbes = {
      qpdf: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return probes.qpdf();
      },
      verapdf: probes.verapdf,
      chromium: probes.chromium,
    };
    const service = makeService(freshDb(), slow);

    // Ten simultaneous callers must not start ten JVMs.
    await Promise.all(Array.from({ length: 10 }, () => service.getStatus()));
    expect(calls.verapdf).toBe(1);
  });
});

describe("probe error handling", () => {
  it("converts a throwing probe into a reported failure, not an exception", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = makeService(freshDb(), {
      ...OK_ENGINES,
      qpdf: async () => {
        throw Object.assign(new Error("spawn qpdf ENOENT"), { code: "ENOENT" });
      },
    });

    // Reporting that an engine is broken is this endpoint's entire purpose;
    // a broken engine must never break the response that reports it.
    const payload = await service.getStatus();
    expect(payload.engines.qpdf).toEqual({ ok: false, reason: "not_executable" });
    expect(payload.engines.verapdf.ok).toBe(true);
    spy.mockRestore();
  });

  it("never leaks a subprocess error string — which would carry a path", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = makeService(freshDb(), {
      ...OK_ENGINES,
      verapdf: async () => {
        throw new Error("Error: ENOENT /opt/verapdf/verapdf --version failed");
      },
    });

    const json = JSON.stringify(await service.getStatus());
    expect(json).not.toContain("/opt/verapdf");
    expect(json).not.toContain("ENOENT");
    // The real error still reaches operators via the server log.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("times out a hung probe instead of holding the response open", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const service = makeService(freshDb(), {
        ...OK_ENGINES,
        chromium: () => new Promise<never>(() => {}), // never settles
      });

      const pending = service.getStatus();
      await vi.advanceTimersByTimeAsync(STATUS.PROBE_TIMEOUT_MS + 100);
      const payload = await pending;

      expect(payload.engines.chromium).toEqual({ ok: false, reason: "timeout" });
      // A hung optional engine is a degradation, never an outage.
      expect(payloadIsCoreFailure(payload)).toBe(false);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });
});

describe("payload shape", () => {
  it("includes every documented key", async () => {
    const payload = await makeService(freshDb()).getStatus();

    expect(payload.version).toBe("1.38.2");
    expect(payload.uptime_seconds).toBe(2 * 86400 + 3 * 3600);
    expect(payload.uptime).toBe("2d 3h 0m 0s");
    expect(payload.checked_at).toBe("2026-08-03T14:22:10Z");
    expect(payload.database).toBe("ok");
    expect(payload.engines.qpdf).toEqual({ ok: true, version: "12.3.2" });
    expect(payload.engines.checked_at).toBe("2026-08-03T14:22:10Z");
    expect(payload.remediation.enabled).toBe(true);
  });

  it("omits `degraded` entirely on the happy path", async () => {
    const payload = await makeService(freshDb()).getStatus();
    // A reader scanning healthy JSON should see no failure vocabulary at all.
    expect("degraded" in payload).toBe(false);
  });

  it("does NOT expose pages_audited", async () => {
    // Excluded by design: the document-versus-page distinction is
    // inscrutable to the non-technical reader this endpoint targets. The
    // plumbing exists (STATUS.PAGE_EVENT_TYPES) so it can be added later,
    // but adding it must be a deliberate decision, not an accident.
    const payload = await makeService(freshDb()).getStatus();
    expect("pages_audited" in payload).toBe(false);
  });

  it("does NOT expose any report-sharing figure", async () => {
    // Rejected because sharing is unobservable: a row records that a report
    // was generated, never whether its link was copied or sent.
    const json = JSON.stringify(await makeService(freshDb()).getStatus());
    expect(json).not.toContain("shared");
    expect(json).not.toContain("reports");
  });
});

describe("helpers", () => {
  it("formats uptime with days, hours, minutes and seconds", () => {
    expect(formatUptime(0)).toBe("0m 0s");
    expect(formatUptime(65)).toBe("1m 5s");
    expect(formatUptime(3665)).toBe("1h 1m 5s");
    expect(formatUptime(90065)).toBe("1d 1h 1m 5s");
  });

  it("renders ISO timestamps at second precision", () => {
    // Millisecond noise invites false "did it change?" comparisons between
    // polls of a page that is mostly cached anyway.
    expect(isoSeconds(T0 + 123)).toBe("2026-08-03T14:22:10Z");
  });

  it("converts SQLite UTC datetimes without shifting the zone", () => {
    expect(sqliteUtcToIso("2026-08-03 09:22:10")).toBe("2026-08-03T09:22:10Z");
    expect(sqliteUtcToIso("2026-08-03T09:22:10Z")).toBe("2026-08-03T09:22:10Z");
    expect(sqliteUtcToIso(null)).toBeNull();
    expect(sqliteUtcToIso("")).toBeNull();
  });

  it("extracts a bare version number instead of echoing tool output", () => {
    // Some tools print an install path alongside the version; echoing the
    // raw line would leak it.
    expect(extractVersion("qpdf version 12.3.2")).toBe("12.3.2");
    expect(extractVersion("veraPDF 1.26.1")).toBe("1.26.1");
    expect(extractVersion("greenfield 1.28")).toBe("1.28");
    expect(extractVersion("no numbers here")).toBeUndefined();
  });

  it("degradedList and isCoreFailure agree about tiers", () => {
    const engines: EngineSnapshot = {
      checked_at: "2026-08-03T14:22:10Z",
      qpdf: { ok: true },
      verapdf: { ok: false, reason: "timeout" },
      chromium: { ok: true },
    };
    expect(degradedList(engines, "ok")).toEqual(["verapdf"]);
    expect(isCoreFailure(engines, "ok")).toBe(false);
    expect(isCoreFailure(engines, "down")).toBe(true);
  });
});

describe("collectAggregates", () => {
  it("logs but does not rethrow a database failure", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = collectAggregates(
      {
        prepare() {
          throw new Error("disk I/O error");
        },
      },
      T0,
    );
    expect(result.database).toBe("down");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

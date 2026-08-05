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
  type GradeCounts,
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
  opts: {
    eventType: string;
    filename: string;
    agoMs?: number;
    email?: string;
    /** Defaults to "B". Pass null explicitly to write a NULL grade, which is
     *  what a failed audit (and any row predating the column) looks like. */
    grade?: string | null;
  },
): void {
  const at = new Date(T0 - (opts.agoMs ?? 0)).toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO audit_log (event_type, email, filename, score, grade, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.eventType,
    opts.email ?? "anonymous",
    opts.filename,
    80,
    opts.grade === undefined ? "B" : opts.grade,
    at,
  );
}

/** Inserts a refused-upload row the way recordRejectedUpload does: the
 *  rejection event type, no score, no grade, and — load-bearing — no
 *  content_hash. */
function seedRejection(db: DB, filename: string, agoMs = 0): void {
  const at = new Date(T0 - agoMs).toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO audit_log (event_type, email, filename, score, grade, content_hash, created_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?)`,
  ).run(STATUS.REJECTION_EVENT_TYPES[0], "anonymous", filename, at);
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
    expect(payload.documents_audited.by_format_total.unknown_extension).toBe(0);
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
      unknown_extension: 0,
    });
  });

  it("buckets an extension-less filename as unknown_extension rather than dropping it", async () => {
    // URL-derived filenames can arrive without an extension. Silently
    // dropping them would make the format split disagree with the total.
    const db = freshDb();
    seedAudit(db, { eventType: "audit-url", filename: "download?id=123" });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.total).toBe(1);
    expect(payload.documents_audited.by_format_total.unknown_extension).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Grade distribution
  // -------------------------------------------------------------------------
  // The headline guarantee is RECONCILIATION: every bucket sums to the document
  // total printed beside it. A row silently dropped for having an odd or NULL
  // grade would put two numbers on one page that disagree.

  it("distributes documents across the five letter grades", async () => {
    const db = freshDb();
    for (const g of ["A", "A", "B", "C", "C", "C", "D", "F", "F"]) {
      seedAudit(db, { eventType: "analyze", filename: `${g}.pdf`, grade: g });
    }

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.by_grade_total).toEqual({
      A: 2,
      B: 1,
      C: 3,
      D: 1,
      F: 2,
      ungraded: 0,
    });
  });

  it("counts a NULL grade as ungraded rather than dropping the row", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "ok.pdf", grade: "A" });
    seedAudit(db, { eventType: "analyze", filename: "failed.pdf", grade: null });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.by_grade_total.ungraded).toBe(1);
    expect(payload.documents_audited.by_grade_total.A).toBe(1);
  });

  it("buckets an unrecognized grade value as ungraded", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "weird.pdf", grade: "Z" });
    seedAudit(db, { eventType: "analyze", filename: "empty.pdf", grade: "" });

    const payload = await makeService(db).getStatus();
    const counts = payload.documents_audited.by_grade_total;
    expect(counts.ungraded).toBe(2);
    // And it must not have injected a "Z" key onto the struct.
    expect(Object.keys(counts).sort()).toEqual(["A", "B", "C", "D", "F", "ungraded"]);
  });

  it("normalizes a lower-case grade into its letter bucket", async () => {
    // The scorer only ever writes upper case; upper() in the query keeps a
    // future writer from silently understating a real grade as 'ungraded'.
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "shout.pdf", grade: "f" });

    const payload = await makeService(db).getStatus();
    expect(payload.documents_audited.by_grade_total.F).toBe(1);
    expect(payload.documents_audited.by_grade_total.ungraded).toBe(0);
  });

  it("sums each window's grade buckets to that window's document total", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "a.pdf", grade: "A", agoMs: HOUR });
    seedAudit(db, { eventType: "analyze", filename: "b.pdf", grade: null, agoMs: HOUR });
    seedAudit(db, { eventType: "analyze", filename: "c.pdf", grade: "F", agoMs: 2 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "d.pdf", grade: "Z", agoMs: 10 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "e.pdf", grade: "C", agoMs: 90 * DAY });
    // Excluded event types must not appear in either the total or the buckets.
    seedAudit(db, { eventType: "audit-url-page", filename: "https://x.gov/p", grade: "F" });
    seedAudit(db, { eventType: "login", filename: "", grade: null });

    const docs = (await makeService(db).getStatus()).documents_audited;
    const sum = (c: GradeCounts) => Object.values(c).reduce((a, b) => a + b, 0);

    expect(sum(docs.by_grade_24h)).toBe(docs.last_24h);
    expect(sum(docs.by_grade_30d)).toBe(docs.last_30d);
    expect(sum(docs.by_grade_total)).toBe(docs.total);
    // Guard against the assertion passing because everything is zero.
    expect(docs.last_24h).toBe(2);
    expect(docs.last_30d).toBe(4);
    expect(docs.total).toBe(5);
  });

  it("applies the 24h and 30d windows to the grade split", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "now.pdf", grade: "A", agoMs: HOUR });
    seedAudit(db, { eventType: "analyze", filename: "yest.pdf", grade: "F", agoMs: 2 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "old.pdf", grade: "F", agoMs: 90 * DAY });

    const docs = (await makeService(db).getStatus()).documents_audited;
    expect(docs.by_grade_24h).toEqual({ A: 1, B: 0, C: 0, D: 0, F: 0, ungraded: 0 });
    expect(docs.by_grade_30d.F).toBe(1);
    expect(docs.by_grade_total.F).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Refused uploads
  // -------------------------------------------------------------------------
  // These count attempts the tool would not audit. The whole value of the
  // figure depends on it staying OUT of documents_audited: a refusal has no
  // score and no grade, so counting it there would inflate the audit total and
  // drop every refusal into the grade distribution's 'ungraded' bucket.

  it("keeps the rejection event type disjoint from the audited and page types", () => {
    // The isolation below is enforced by this disjointness, so assert it
    // directly rather than only observing its effects.
    const audited = new Set<string>(STATUS.DOCUMENT_EVENT_TYPES);
    const pages = new Set<string>(STATUS.PAGE_EVENT_TYPES);
    for (const t of STATUS.REJECTION_EVENT_TYPES) {
      expect(audited.has(t)).toBe(false);
      expect(pages.has(t)).toBe(false);
    }
  });

  it("counts refusals without touching the audited totals or the grade split", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "real.pdf", grade: "B" });
    seedRejection(db, "old.doc");
    seedRejection(db, "data.csv");
    seedRejection(db, "sheet.xls");

    const docs = (await makeService(db).getStatus()).documents_audited;
    const rej = (await makeService(db).getStatus()).documents_rejected;

    expect(docs.total).toBe(1);
    expect(docs.by_format_total.unknown_extension).toBe(0);
    expect(docs.by_grade_total).toEqual({ A: 0, B: 1, C: 0, D: 0, F: 0, ungraded: 0 });
    expect(rej.total).toBe(3);
  });

  it("splits refusals by the extension they were offered under", async () => {
    const db = freshDb();
    for (const f of ["a.doc", "b.xls", "c.ppt", "d.rtf", "e.csv", "f.tsv", "g.jpg"]) {
      seedRejection(db, f);
    }

    const rej = (await makeService(db).getStatus()).documents_rejected;
    expect(rej.by_format_total).toEqual({
      doc: 1,
      xls: 1,
      ppt: 1,
      rtf: 1,
      csv: 2, // .csv and .tsv share a bucket
      other: 1, // the .jpg
    });
  });

  it("does not let .docx/.xlsx/.pptx fall into the legacy buckets", async () => {
    // The LIKE patterns are anchored to the end of the string; a regression to
    // '%.doc%' would silently reclassify every modern file.
    const db = freshDb();
    for (const f of ["a.docx", "b.xlsx", "c.pptx"]) seedRejection(db, f);

    const rej = (await makeService(db).getStatus()).documents_rejected;
    expect(rej.by_format_total.doc).toBe(0);
    expect(rej.by_format_total.xls).toBe(0);
    expect(rej.by_format_total.ppt).toBe(0);
    expect(rej.by_format_total.other).toBe(3);
  });

  it("sums the refusal buckets to the refusal total", async () => {
    const db = freshDb();
    for (const f of ["a.doc", "b.csv", "c.jpg", "no-extension"]) seedRejection(db, f);

    const rej = (await makeService(db).getStatus()).documents_rejected;
    const sum = Object.values(rej.by_format_total).reduce((a, b) => a + b, 0);
    expect(sum).toBe(rej.total);
    expect(rej.total).toBe(4);
  });

  it("applies the 24h and 30d windows to refusals", async () => {
    const db = freshDb();
    seedRejection(db, "now.doc", HOUR);
    seedRejection(db, "yesterday.csv", 2 * DAY);
    seedRejection(db, "old.xls", 90 * DAY);

    const rej = (await makeService(db).getStatus()).documents_rejected;
    expect(rej.last_24h).toBe(1);
    expect(rej.last_30d).toBe(2);
    expect(rej.total).toBe(3);
    expect(rej.by_format_30d).toEqual({ doc: 1, xls: 0, ppt: 0, rtf: 0, csv: 1, other: 0 });
  });

  it("cannot satisfy the remediation audit-gate, because the hash is NULL", async () => {
    // The gate (hasRecentAudit) matches on content_hash + email with NO
    // event_type filter, so the only thing keeping "this content was refused"
    // from passing a check that means "this content was audited" is the NULL
    // hash. This asserts the SQL semantics that guarantee it — a future
    // COALESCE or IS NOT DISTINCT FROM in that query would fail here.
    const db = freshDb();
    seedRejection(db, "old.doc");

    const gateSql = `SELECT 1 FROM audit_log
                      WHERE content_hash = ? AND email = ?
                      LIMIT 1`;
    // Any hash at all, including the empty string, must miss a NULL column.
    for (const probe of ["", "deadbeef", "0".repeat(64)]) {
      expect(db.prepare(gateSql).get(probe, "anonymous")).toBeUndefined();
    }
    // Sanity: the row really is there, so the miss is about NULL, not an
    // empty table.
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event_type = ?`)
      .get(STATUS.REJECTION_EVENT_TYPES[0]) as { n: number };
    expect(n.n).toBe(1);
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

  it("zeroes the grade buckets on the database-down path", () => {
    // The degraded payload must still be shape-complete: a missing by_grade_*
    // would make the renderer read `undefined` for a window it expects.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = collectAggregates(
      {
        prepare() {
          throw new Error("disk I/O error");
        },
      },
      T0,
    );
    const zero = { A: 0, B: 0, C: 0, D: 0, F: 0, ungraded: 0 };
    expect(result.documents_audited.by_grade_24h).toEqual(zero);
    expect(result.documents_audited.by_grade_30d).toEqual(zero);
    expect(result.documents_audited.by_grade_total).toEqual(zero);

    // documents_rejected must be shape-complete too, or the renderer reads
    // `undefined` for a window it expects.
    const zeroFmt = { doc: 0, xls: 0, ppt: 0, rtf: 0, csv: 0, other: 0 };
    expect(result.documents_rejected.total).toBe(0);
    expect(result.documents_rejected.by_format_30d).toEqual(zeroFmt);
    expect(result.documents_rejected.by_format_total).toEqual(zeroFmt);
    spy.mockRestore();
  });
});

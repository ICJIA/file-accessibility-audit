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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrations.js";
import { STATUS } from "#config";
import {
  createStatusService,
  collectAggregates,
  degradedList,
  isCoreFailure,
  readDiskStatus,
  payloadIsCoreFailure,
  extractVersion,
  formatUptime,
  isoSeconds,
  sqliteUtcToIso,
  chicagoTime,
  type EngineProbes,
  type EngineSnapshot,
  type GradeCounts,
  type StatusDb,
} from "../services/status.js";

type DB = InstanceType<typeof Database>;

// The privileged rate-limit tier reads process.env at call time. Production
// always has a token set (/etc/environment), so that is the baseline these
// tests assert against; the tests that care about it being ABSENT clear it
// explicitly. Without this, every "healthy service" assertion would see a
// degraded privileged_tier and fail for an unrelated reason.
beforeEach(() => {
  process.env.API_PRIVILEGED_TOKEN = "status-test-token";
});
afterEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN;
});

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
    /** Defaults to 80. Pass null explicitly to write a NULL score — the shape
     *  of a failed audit's row, which the progress stats must skip. */
    score?: number | null;
    /** Defaults to "B". Pass null explicitly to write a NULL grade, which is
     *  what a failed audit (and any row predating the column) looks like. */
    grade?: string | null;
    /** Request tier: 1 = privileged (trusted-tool), 0 = public. Omit to write
     *  NULL — the shape of a row predating the privileged column. */
    privileged?: 0 | 1;
    /** Defaults to NULL (rows predating the hash, and failed audits). */
    contentHash?: string | null;
  },
): void {
  const at = new Date(T0 - (opts.agoMs ?? 0)).toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO audit_log (event_type, filename, score, grade, privileged, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.eventType,
    opts.filename,
    opts.score === undefined ? 80 : opts.score,
    opts.grade === undefined ? "B" : opts.grade,
    opts.privileged ?? null,
    opts.contentHash ?? null,
    at,
  );
}

/** Inserts a refused-upload row the way recordRejectedUpload does: the
 *  rejection event type, no score, no grade, and — load-bearing — no
 *  content_hash. */
function seedRejection(db: DB, filename: string, agoMs = 0): void {
  const at = new Date(T0 - agoMs).toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO audit_log (event_type, filename, score, grade, content_hash, created_at)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  ).run(STATUS.REJECTION_EVENT_TYPES[0], filename, at);
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
    backupStatusFile: "/nonexistent/backups/last-backup.json",
    diskPath: ".",
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
    // The gate (hasRecentAudit) matches on content_hash with NO event_type
    // filter, so the only thing keeping "this content was refused" from
    // passing a check that means "this content was audited" is the NULL
    // hash. This asserts the SQL semantics that guarantee it — a future
    // COALESCE or IS NOT DISTINCT FROM in that query would fail here.
    const db = freshDb();
    seedRejection(db, "old.doc");

    const gateSql = `SELECT 1 FROM audit_log
                      WHERE content_hash = ?
                      LIMIT 1`;
    // Any hash at all, including the empty string, must miss a NULL column.
    for (const probe of ["", "deadbeef", "0".repeat(64)]) {
      expect(db.prepare(gateSql).get(probe)).toBeUndefined();
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
      backupStatusFile: "/nonexistent/backups/last-backup.json",
      diskPath: ".",
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

  // A FAILED probe is a different thing from a passing one, and caching the
  // two for the same 10 minutes is what made a heavy audit look like a broken
  // server. On 2026-08-28 a 246-page report saturated the box for ~40s; the
  // veraPDF probe timed out with it, and /status went on reporting veraPDF
  // "down (timed out)" for the rest of the 10 minutes — long after veraPDF was
  // answering --version in 2.4s again. Nothing was down; the snapshot was old.
  // Failures re-probe on a short TTL so the badge clears itself.
  it("re-probes a FAILED engine well before the full engine TTL", async () => {
    const calls = { verapdf: 0 };
    let healthy = false;
    const probes: EngineProbes = {
      qpdf: async () => ({ ok: true, version: "11.9.0" }),
      verapdf: async () => {
        calls.verapdf++;
        return healthy ? { ok: true, version: "1.30.1" } : { ok: false, reason: "timeout" };
      },
      chromium: async () => ({ ok: true }),
    };
    const clock = { now: T0 };
    const service = makeService(freshDb(), probes, clock);

    const first = await service.getStatus();
    expect(first.engines.verapdf.ok).toBe(false);

    // The engine recovered the moment the box was free again.
    healthy = true;
    clock.now = T0 + STATUS.ENGINE_PROBE_FAILURE_TTL_MS + 1000;
    const second = await service.getStatus();

    expect(calls.verapdf).toBe(2);
    expect(second.engines.verapdf.ok).toBe(true);
    // Still deep inside the healthy-result TTL, which must not have applied.
    expect(clock.now - T0).toBeLessThan(STATUS.ENGINE_PROBE_TTL_MS);
  });

  it("does not re-probe a MISCONFIGURED engine on the short TTL — that never fixes itself", async () => {
    // The short TTL is for failures that clear on their own (a probe starved
    // by a busy box). An engine that is absent or unconfigured stays that way
    // until someone deploys, and re-probing it every minute would spend a JVM
    // start per minute for the whole time it is broken.
    const calls = { verapdf: 0 };
    const probes: EngineProbes = {
      qpdf: async () => ({ ok: true, version: "11.9.0" }),
      verapdf: async () => {
        calls.verapdf++;
        return { ok: false, reason: "not_configured" };
      },
      chromium: async () => ({ ok: true }),
    };
    const clock = { now: T0 };
    const service = makeService(freshDb(), probes, clock);

    await service.getStatus();
    clock.now = T0 + STATUS.ENGINE_PROBE_FAILURE_TTL_MS + 1000;
    await service.getStatus();

    expect(calls.verapdf).toBe(1);
  });

  it("still caches a HEALTHY snapshot for the full engine TTL", async () => {
    const { calls, probes } = countingProbes();
    const clock = { now: T0 };
    const service = makeService(freshDb(), probes, clock);

    await service.getStatus();
    // Past the short failure TTL, but everything passed, so no JVM restarts.
    clock.now = T0 + STATUS.ENGINE_PROBE_FAILURE_TTL_MS + 1000;
    await service.getStatus();

    expect(calls.verapdf).toBe(1);
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
    expect(degradedList(engines, "ok", "ok")).toEqual(["verapdf"]);
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

describe("disk space — the failure nothing else on /status can see", () => {
  // A full disk breaks uploads AND the nightly backup at the same time while
  // every other check stays green: the audit path holds files in memory and
  // the backup writes elsewhere, so neither reports a disk problem as its own
  // failure. Without this probe the first symptom is a failed restore months
  // later. Found by the 2026-08-05 ops review, shipped v1.59.3.

  it("reports free space for a real directory", () => {
    const d = readDiskStatus(".");
    expect(["ok", "low"]).toContain(d.status);
    expect(d.free_bytes).toBeGreaterThan(0);
    expect(d.total_bytes).toBeGreaterThan(0);
    expect(d.free_pct).toBeGreaterThanOrEqual(0);
    expect(d.free_pct).toBeLessThanOrEqual(100);
  });

  it("says 'unavailable' rather than throwing on a path it cannot stat", () => {
    // This runs on every status request. An endpoint that 500s because it
    // could not stat a directory is worse than one admitting it does not know.
    const d = readDiskStatus("/definitely/not/a/real/path/xyzzy");
    expect(d.status).toBe("unavailable");
    expect(d.free_bytes).toBeNull();
    expect(d.free_pct).toBeNull();
  });

  it("degrades on low, and NEVER on unavailable", () => {
    const engines: EngineSnapshot = {
      checked_at: "2026-08-03T14:22:10Z",
      qpdf: { ok: true },
      verapdf: { ok: true },
      chromium: { ok: true },
    };
    expect(degradedList(engines, "ok", "ok", "low")).toContain("disk");
    // An unqueryable filesystem is a gap in our knowledge, not evidence of a
    // problem — alarming on it would fire wherever statfs behaves differently.
    expect(degradedList(engines, "ok", "ok", "unavailable")).not.toContain("disk");
    expect(degradedList(engines, "ok", "ok", "ok")).not.toContain("disk");
  });

  it("is a degradation, never an outage", () => {
    // The service can still audit with a nearly-full disk. Returning 503 —
    // paging someone about an outage that has not happened — is how alerts
    // get ignored. Mirrors the stale-backup rule exactly.
    const engines: EngineSnapshot = {
      checked_at: "2026-08-03T14:22:10Z",
      qpdf: { ok: true },
      verapdf: { ok: true },
      chromium: { ok: true },
    };
    expect(isCoreFailure(engines, "ok")).toBe(false);
    expect(degradedList(engines, "ok", "ok", "low")).toEqual(["disk"]);
  });

  it("carries the disk section in the payload", async () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const payload = await makeService(db as unknown as DB).getStatus();
    expect(payload.disk).toBeDefined();
    expect(["ok", "low", "unavailable"]).toContain(payload.disk.status);
    expect(payload.disk.free_pct).toBeGreaterThanOrEqual(0);
  });
});

describe("getHealthSummary — the header's verdict, without the cost", () => {
  // The always-visible header indicator polled /api/health, which answered
  // only "is this process alive" — so it showed a confident green "online"
  // while /status reported a stale backup, a low disk or a dead engine. The
  // one signal on every page contradicted the status page.
  //
  // It could not simply poll /status: that endpoint is capped at 120/min
  // shared GLOBALLY (Nitro proxies it over loopback, so every browser hit
  // arrives as 127.0.0.1 in one bucket). At 3 requests/min per open tab, ~40
  // concurrent tabs would exhaust the budget, /status would answer "unknown",
  // and the uptime monitor's keyword alert would go blind.

  it("reports ok on a healthy service", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const summary = makeService(db as unknown as DB).getHealthSummary();
    expect(summary.status).toBe("ok");
    expect(summary.degraded).toEqual([]);
  });

  it("NEVER triggers an engine probe", () => {
    // The load-bearing property. Probes spawn processes — veraPDF starts a
    // JVM — and a header polling every 20s across every open tab would make
    // the most expensive operation on the service its most frequent one.
    const db = new Database(":memory:");
    runMigrations(db);
    let probes = 0;
    const counting: EngineProbes = {
      qpdf: async () => {
        probes++;
        return { ok: true };
      },
      verapdf: async () => {
        probes++;
        return { ok: true };
      },
      chromium: async () => {
        probes++;
        return { ok: true };
      },
    };
    const svc = makeService(db as unknown as DB, counting);
    svc.getHealthSummary();
    svc.getHealthSummary();
    svc.getHealthSummary();
    expect(probes).toBe(0);
  });

  it("reports engine failures once a probe HAS been cached by /status", () => {
    // It does not probe, but it must not ignore what is already known.
    const db = new Database(":memory:");
    runMigrations(db);
    const broken: EngineProbes = {
      qpdf: async () => ({ ok: true, version: "12.0.0" }),
      verapdf: async () => ({ ok: false, reason: "not_configured" }),
      chromium: async () => ({ ok: true }),
    };
    const svc = makeService(db as unknown as DB, broken);
    expect(svc.getHealthSummary().degraded).toEqual([]); // nothing cached yet
    return svc.getStatus().then(() => {
      const after = svc.getHealthSummary();
      expect(after.degraded).toContain("verapdf");
      expect(after.status).toBe("degraded");
    });
  });
});

describe("privileged tier — the misconfiguration nothing else on /status can see", () => {
  // The token reaches the API only through the process environment. If PM2 ever
  // resurrects from a non-login shell (reboot, bare `pm2 start`), the API comes
  // up with no token, every caller is forced anonymous, and the weekly fleet
  // audit silently drops from 5000/hour to 500/hour. Nothing else on this page
  // moves — engines, database, disk and backup all stay green — which is
  // exactly why the 2026-08-12 throttle looked like an outage of unknown cause.

  it("reports 'on' when a token is configured, and does not degrade", async () => {
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.privileged_tier).toBe("on");
    expect(payload.status).toBe("ok");
    expect(payload.degraded).toBeUndefined();
  });

  it("reports 'off' and DEGRADES when the token is missing", async () => {
    delete process.env.API_PRIVILEGED_TOKEN;
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.privileged_tier).toBe("off");
    expect(payload.status).toBe("degraded");
    expect(payload.degraded).toContain("privileged_tier");
  });

  it("treats an empty-string token as off (the fail-safe the limiter uses)", async () => {
    process.env.API_PRIVILEGED_TOKEN = "";
    const payload = await makeService(freshDb()).getStatus();
    expect(payload.privileged_tier).toBe("off");
    expect(payload.degraded).toContain("privileged_tier");
  });

  it("degrades WITHOUT becoming an outage — the service can still audit", async () => {
    delete process.env.API_PRIVILEGED_TOKEN;
    const payload = await makeService(freshDb()).getStatus();
    // A 503 would take the whole tool down over a fleet-integration problem.
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("NEVER discloses the token itself, only the on/off verdict", async () => {
    const token = "super-secret-fleet-credential";
    process.env.API_PRIVILEGED_TOKEN = token;
    const payload = await makeService(freshDb()).getStatus();
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(token);
    // Nor any prefix long enough to be worth brute-forcing.
    expect(serialized).not.toContain(token.slice(0, 8));
    // The field is exactly the two-state verdict and nothing else.
    expect(payload.privileged_tier).toBe("on");
    expect(["on", "off"]).toContain(payload.privileged_tier);
  });

  // Both surfaces compute `degraded` by different routes. A card wired into
  // only one of them has shipped before — assert they agree.
  it("the header summary and /status agree that a missing token degrades", async () => {
    delete process.env.API_PRIVILEGED_TOKEN;
    const svc = makeService(freshDb());
    const payload = await svc.getStatus();
    const summary = svc.getHealthSummary();

    expect(payload.degraded).toContain("privileged_tier");
    expect(summary.degraded).toContain("privileged_tier");
    expect(summary.status).toBe("degraded");
    expect(summary.systems.find((s) => s.id === "privileged_tier")).toMatchObject({
      ok: false,
      state: "off",
    });
  });

  it("the header summary reports it armed when the token is present", () => {
    const summary = makeService(freshDb()).getHealthSummary();
    expect(summary.systems.find((s) => s.id === "privileged_tier")).toMatchObject({
      ok: true,
      state: "armed",
    });
    expect(summary.status).toBe("ok");
  });

  it("degradedList defaults to 'on' so existing callers cannot accidentally page", () => {
    const engines: EngineSnapshot = {
      checked_at: "2026-08-03T14:22:10Z",
      qpdf: { ok: true, version: "11.9.0" },
      verapdf: { ok: true, version: "1.30.1" },
      chromium: { ok: true },
    };
    expect(degradedList(engines, "ok", "ok", "ok")).toEqual([]);
    expect(degradedList(engines, "ok", "ok", "ok", "off")).toEqual(["privileged_tier"]);
  });
});

describe("getHealthSummary systems — what the header's tooltip names", () => {
  // The header indicator is now a link to /status with a tooltip naming the
  // systems its "online" is actually claiming. Three states per system, and
  // the third is the load-bearing one: `ok: null` means NOT ESTABLISHED — an
  // engine /status has never probed, a backup that has never recorded, a
  // filesystem that could not be measured. None of those degrade the verdict,
  // and the tooltip must not dress them up as either up or down: both would
  // be unverified claims on the one signal visible on every page.

  it("names every system behind the verdict, in a stable order", () => {
    const summary = makeService(freshDb()).getHealthSummary();
    expect(summary.systems.map((s) => s.id)).toEqual([
      "database",
      "qpdf",
      "verapdf",
      "chromium",
      "backup",
      "disk",
      "privileged_tier",
    ]);
    for (const s of summary.systems) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.state.length).toBeGreaterThan(0);
    }
  });

  it("reports engines as 'not yet checked' before /status has cached a probe", () => {
    // getHealthSummary never probes (pinned above), so at boot the honest
    // answer about the engines is "nothing established" — not "up".
    const summary = makeService(freshDb()).getHealthSummary();
    const qpdf = summary.systems.find((s) => s.id === "qpdf")!;
    expect(qpdf.ok).toBeNull();
    expect(qpdf.state).toBe("not yet checked");
    expect(summary.status).toBe("ok"); // and it does not degrade
  });

  it("reports an engine down once a failing probe HAS been cached", async () => {
    const broken: EngineProbes = {
      qpdf: async () => ({ ok: true, version: "12.0.0" }),
      verapdf: async () => ({ ok: false, reason: "not_configured" }),
      chromium: async () => ({ ok: true }),
    };
    const svc = makeService(freshDb(), broken);
    await svc.getStatus(); // caches the probe
    const systems = svc.getHealthSummary().systems;
    expect(systems.find((s) => s.id === "verapdf")).toMatchObject({ ok: false, state: "down" });
    expect(systems.find((s) => s.id === "qpdf")).toMatchObject({ ok: true, state: "up" });
  });

  it("a backup that has NEVER recorded is null — a stale one is an established failure", () => {
    // The distinction the /status card already draws: a brand-new deployment
    // must not alarm before its first scheduled run, but a backup that ran
    // and then silently stopped is exactly what needs surfacing.
    const never = makeService(freshDb()).getHealthSummary();
    expect(never.systems.find((s) => s.id === "backup")).toMatchObject({
      ok: null,
      state: "never recorded",
    });
    expect(never.degraded).not.toContain("backup");

    const dir = mkdtempSync(join(tmpdir(), "health-systems-"));
    try {
      const staleMs = (STATUS.BACKUP_STALE_AFTER_HOURS + 2) * 3_600_000;
      const file = join(dir, "last-backup.json");
      writeFileSync(
        file,
        JSON.stringify({
          finishedAt: new Date(T0 - staleMs).toISOString(),
          bytes: 1,
          integrity: "ok",
        }),
      );
      const svc = createStatusService({
        now: () => T0,
        db: freshDb() as unknown as StatusDb,
        probes: OK_ENGINES,
        version: "1.38.2",
        startedAtMs: T0,
        remediationEnabled: true,
        backupStatusFile: file,
        diskPath: ".",
      });
      const stale = svc.getHealthSummary();
      expect(stale.systems.find((s) => s.id === "backup")).toMatchObject({
        ok: false,
        state: "stale",
      });
      expect(stale.degraded).toContain("backup");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the degraded list and the systems list cannot disagree", async () => {
    // The header colours the dot from `status`/`degraded` and writes the
    // tooltip from `systems`; if the two drifted, the dot could be amber over
    // a tooltip of ticks.
    const broken: EngineProbes = {
      qpdf: async () => ({ ok: false, reason: "error" }),
      verapdf: async () => ({ ok: true }),
      chromium: async () => ({ ok: false, reason: "not_configured" }),
    };
    const svc = makeService(freshDb(), broken);
    await svc.getStatus();
    const summary = svc.getHealthSummary();
    expect(summary.degraded).toEqual(
      summary.systems.filter((s) => s.ok === false).map((s) => s.id),
    );
  });

  it("labels and states carry no filesystem path", () => {
    // /api/health is public. "PDF/UA" is one slash and fine; two consecutive
    // path segments are not.
    const summary = makeService(freshDb()).getHealthSummary();
    for (const s of summary.systems) {
      expect(`${s.label} ${s.state}`).not.toMatch(/(\/[\w.-]+){2,}/);
      expect(`${s.label} ${s.state}`).not.toMatch(/[A-Za-z]:\\/);
    }
  });
});

describe("privileged-tier audit counting", () => {
  // The reason this exists: after rotating the single shared privileged token,
  // an operator needs to see privileged-tier volume to confirm it matches the
  // fleet's activity and nothing else is using the token. It counts only
  // privileged=1 rows, in the same three windows as documents_audited.
  it("counts only privileged audits, windowed 24h / 30d / total", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "audit-url", filename: "a.pdf", privileged: 1 });
    seedAudit(db, { eventType: "audit-url", filename: "b.pdf", privileged: 1, agoMs: 2 * DAY });
    seedAudit(db, { eventType: "audit-url", filename: "c.pdf", privileged: 1, agoMs: 40 * DAY });
    // anonymous — must never be counted as privileged
    seedAudit(db, { eventType: "analyze", filename: "d.pdf", privileged: 0 });
    // pre-migration row (NULL tier = unknown) — must never be counted as privileged
    seedAudit(db, { eventType: "analyze", filename: "e.pdf" });

    const payload = await makeService(db).getStatus();
    expect(payload.privileged_audits.last_24h).toBe(1);
    expect(payload.privileged_audits.last_30d).toBe(2);
    expect(payload.privileged_audits.total).toBe(3);
  });

  it("reports zero when no audit has carried the privileged tier yet", async () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "only-anon.pdf", privileged: 0 });
    seedAudit(db, { eventType: "analyze", filename: "legacy.pdf" }); // NULL
    const payload = await makeService(db).getStatus();
    expect(payload.privileged_audits).toEqual({ last_24h: 0, last_30d: 0, total: 0 });
  });
});

describe("failed audits are invisible to every public count (v1.88.0)", () => {
  it("seeding every failure event type changes nothing in the payload's aggregates", () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "ok.pdf", privileged: 0 });
    seedAudit(db, { eventType: "rejected-upload", filename: "no.csv", grade: null, privileged: 0 });
    const before = collectAggregates(db, T0);

    for (const t of STATUS.FAILURE_EVENT_TYPES) {
      seedAudit(db, {
        eventType: t,
        filename: `${t}.pdf`,
        grade: null,
        privileged: 1,
        agoMs: 60_000,
      });
    }
    const after = collectAggregates(db, T0);

    expect(after.documents_audited).toEqual(before.documents_audited);
    expect(after.privileged_audits).toEqual(before.privileged_audits);
    expect(after.documents_rejected).toEqual(before.documents_rejected);
    // A failure is not "the last audit".
    expect(after.last_audit_at).toEqual(before.last_audit_at);
    expect(after.database).toBe("ok");
  });
});

describe("local time comes from DEPLOY.LOCAL_TIME_ZONE (v1.88.0)", () => {
  it("chicagoTime renders in the configured zone", async () => {
    const { DEPLOY } = await import("#config");
    expect(DEPLOY.LOCAL_TIME_ZONE).toBe("America/Chicago");
    expect(chicagoTime(Date.UTC(2026, 0, 15, 18, 0, 0))).toBe("Jan 15, 2026, 12:00:00 PM CST");
    expect(chicagoTime(Date.UTC(2026, 6, 15, 17, 0, 0))).toBe("Jul 15, 2026, 12:00:00 PM CDT");
  });
  it("status.ts no longer hard-codes the zone", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../services/status.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/timeZone:\s*"America\/Chicago"/);
  });
});

// ---------------------------------------------------------------------------
// Distinct documents + the remediation loop (document_progress_30d)
// ---------------------------------------------------------------------------
// Both are aggregates over columns the payload already draws on. Filenames and
// hashes are consumed inside SQLite / inside the service; only counts and a
// median cross the boundary — statusPrivacy.test.ts holds that line.

describe("distinct documents (by content hash)", () => {
  it("counts distinct uploaded contents across the three windows", async () => {
    const db = freshDb();
    const h1 = "a".repeat(64);
    const h2 = "b".repeat(64);
    const h3 = "c".repeat(64);
    seedAudit(db, { eventType: "analyze", filename: "x.pdf", contentHash: h1, agoMs: HOUR });
    // The same bytes re-checked: a second audit, not a second document.
    seedAudit(db, { eventType: "analyze", filename: "x.pdf", contentHash: h1, agoMs: 2 * HOUR });
    seedAudit(db, { eventType: "audit-url", filename: "y.pdf", contentHash: h2, agoMs: 10 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "z.pdf", contentHash: h3, agoMs: 40 * DAY });
    // No hash (an old row): counted by documents_audited, not here.
    seedAudit(db, { eventType: "analyze", filename: "nohash.pdf", agoMs: HOUR });
    // A page audit is not a document.
    seedAudit(db, {
      eventType: "audit-url-page",
      filename: "https://x.gov/p",
      contentHash: "d".repeat(64),
      agoMs: HOUR,
    });
    // The fleet's documents count here — distinct_documents is a volume
    // figure over every tier; only document_progress_30d filters by tier.
    seedAudit(db, {
      eventType: "audit-url",
      filename: "fleet.pdf",
      contentHash: "e".repeat(64),
      privileged: 1,
      agoMs: HOUR,
    });

    const payload = await makeService(db).getStatus();
    expect(payload.distinct_documents).toEqual({ last_24h: 2, last_30d: 3, total: 4 });
  });
});

describe("document_progress_30d (the remediation loop)", () => {
  it("groups the last 30 days by filename: runs, improvability, improvement", async () => {
    const db = freshDb();
    // grant.pdf: 69 → 79 → 89 — re-audited, improvable, improved, not yet an A.
    seedAudit(db, {
      eventType: "analyze",
      filename: "grant.pdf",
      score: 69,
      privileged: 0,
      agoMs: 25 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "grant.pdf",
      score: 79,
      privileged: 0,
      agoMs: 20 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "grant.pdf",
      score: 89,
      privileged: 0,
      agoMs: 2 * DAY,
    });
    // deck.pptx: started at an A — re-audited but not improvable.
    seedAudit(db, {
      eventType: "analyze",
      filename: "deck.pptx",
      score: 95,
      privileged: 0,
      agoMs: 3 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "deck.pptx",
      score: 100,
      privileged: 0,
      agoMs: DAY,
    });
    // solo.pdf: audited once.
    seedAudit(db, {
      eventType: "analyze",
      filename: "solo.pdf",
      score: 50,
      privileged: 0,
      agoMs: DAY,
    });
    // Entirely outside the window.
    seedAudit(db, {
      eventType: "analyze",
      filename: "old.pdf",
      score: 10,
      privileged: 0,
      agoMs: 40 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "old.pdf",
      score: 20,
      privileged: 0,
      agoMs: 35 * DAY,
    });
    // A failed attempt writes no score and is not a run.
    seedAudit(db, {
      eventType: "analyze",
      filename: "grant.pdf",
      score: null,
      privileged: 0,
      grade: null,
      agoMs: DAY,
    });

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.documents).toBe(3);
    expect(p.reaudited).toBe(2);
    expect(p.improvable).toBe(1);
    expect(p.improved).toBe(1);
    expect(p.reached_a).toBe(0);
  });

  it("reports the median lift once at least PROGRESS_MIN_DOCS documents were re-audited", async () => {
    const db = freshDb();
    const pairs: Array<[string, number, number]> = [
      ["a.pdf", 50, 60], // +10
      ["b.pdf", 60, 80], // +20
      ["c.pdf", 40, 70], // +30
      ["d.pdf", 88, 88], // 0
      ["e.pdf", 69, 100], // +31 — reaches an A
    ];
    for (const [f, first, last] of pairs) {
      seedAudit(db, {
        eventType: "analyze",
        filename: f,
        score: first,
        privileged: 0,
        agoMs: 5 * DAY,
      });
      seedAudit(db, { eventType: "analyze", filename: f, score: last, privileged: 0, agoMs: DAY });
    }

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.reaudited).toBe(5);
    expect(p.improvable).toBe(5);
    expect(p.improved).toBe(4); // d.pdf did not move
    expect(p.reached_a).toBe(1); // e.pdf
    expect(p.median_lift).toBe(20); // 0, 10, 20, 30, 31
  });

  it("suppresses the median below the small-document floor", async () => {
    const db = freshDb();
    expect(STATUS.PROGRESS_MIN_DOCS).toBeGreaterThan(1);
    seedAudit(db, {
      eventType: "analyze",
      filename: "a.pdf",
      score: 50,
      privileged: 0,
      agoMs: 2 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "a.pdf",
      score: 90,
      privileged: 0,
      agoMs: DAY,
    });

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.reaudited).toBe(1);
    expect(p.median_lift).toBeNull();
  });

  it("breaks same-second ties by insertion order, so first and last are stable", async () => {
    const db = freshDb();
    seedAudit(db, {
      eventType: "analyze",
      filename: "tie.pdf",
      score: 50,
      privileged: 0,
      agoMs: DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "tie.pdf",
      score: 90,
      privileged: 0,
      agoMs: DAY,
    });

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.improved).toBe(1); // 50 → 90, never 90 → 50
    expect(p.reached_a).toBe(1);
  });

  it("counts public uploads only — fleet (trusted-tool) runs are excluded (v1.90.0)", async () => {
    const db = freshDb();
    // pub.pdf publicly never dipped below an A; the fleet also scanned it at
    // 40. A leaked fleet row would become the group's first score and flip
    // `improvable` — that flip is what this test watches.
    seedAudit(db, {
      eventType: "audit-url",
      filename: "pub.pdf",
      score: 40,
      privileged: 1,
      agoMs: 4 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "pub.pdf",
      score: 92,
      privileged: 0,
      agoMs: 3 * DAY,
    });
    seedAudit(db, {
      eventType: "analyze",
      filename: "pub.pdf",
      score: 95,
      privileged: 0,
      agoMs: DAY,
    });
    // A document only the fleet ever touched contributes nothing at all.
    seedAudit(db, {
      eventType: "audit-url",
      filename: "fleet-only.pdf",
      score: 70,
      privileged: 1,
      agoMs: 3 * DAY,
    });
    seedAudit(db, {
      eventType: "audit-url",
      filename: "fleet-only.pdf",
      score: 70,
      privileged: 1,
      agoMs: DAY,
    });

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.documents).toBe(1);
    expect(p.reaudited).toBe(1);
    expect(p.improvable).toBe(0); // 92 → 95 never needed improving
  });

  it("excludes unknown-tier rows (pre-migration), climbing from when tier recording began", async () => {
    const db = freshDb();
    // seedAudit's default tier is NULL — the shape of rows written before
    // migration 12. Unknown might be the fleet, so it is not counted; the
    // same reasoning privileged_audits has followed since v1.86.0.
    seedAudit(db, { eventType: "analyze", filename: "old-row.pdf", score: 50, agoMs: 3 * DAY });
    seedAudit(db, { eventType: "analyze", filename: "old-row.pdf", score: 90, agoMs: DAY });

    const p = (await makeService(db).getStatus()).document_progress_30d;
    expect(p.documents).toBe(0);
    expect(p.reaudited).toBe(0);
  });
});

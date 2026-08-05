// Physical retention for shared_reports (v1.51.0). Before this,
// SHARED_REPORTS.EXPIRY_DAYS only gated reads: an expired row answered 410
// forever and was never deleted — the unbounded-growth finding from the
// 2026-08-05 assessment (rows carry up to 1 MB of report_json each, written
// per-file by four paths, with no DELETE anywhere in the codebase).
//
// Two properties pinned here beyond "old rows get deleted":
//
//   1. The purge fires only after a GRACE WINDOW past expiry. The read gate
//      deliberately answers 410 "This report link has expired" while the row
//      exists — more informative than a bare 404 — so a row expired last
//      week must survive the sweep; only rows past expiry + PURGE_GRACE_DAYS
//      are deleted (after which the same URL answers 404, as for any unknown
//      id).
//
//   2. Retention must not depend on the remediation feature flag.
//      REMEDIATION_ENABLED is "false" for this whole file, and the interval
//      test asserts the sweep still runs on schedule — the old
//      startCleanupInterval early-returned when the flag was off, which
//      silently stopped the audit_log purge too (assessment finding #3).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DB_PATH and the flag must be set before the dynamic imports — db and the
// prepared statements bind at import time; vitest gives each test file its
// own module graph.
const tmpDir = mkdtempSync(join(tmpdir(), "shared-reports-purge-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.REMEDIATION_ENABLED = "false";

let cleanup: typeof import("../services/remediationCleanup.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let SHARED_REPORTS: (typeof import("#config"))["SHARED_REPORTS"];
let REMEDIATION: (typeof import("#config"))["REMEDIATION"];

beforeAll(async () => {
  ({ SHARED_REPORTS, REMEDIATION } = await import("#config"));
  cleanup = await import("../services/remediationCleanup.js");
  db = (await import("../db/sqlite.js")).default;
});

afterAll(() => {
  cleanup.stopCleanupInterval();
  vi.useRealTimers();
});

const DAY = 86_400_000;

function insertReport(id: string, expiresAtMs: number): void {
  db.prepare(
    `INSERT INTO shared_reports (id, email, filename, report_json, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "auditor@agency.illinois.gov",
    "report.pdf",
    "{}",
    new Date(expiresAtMs).toISOString(),
    new Date(expiresAtMs - 365 * DAY).toISOString(),
  );
}

function has(id: string): boolean {
  return db.prepare("SELECT 1 FROM shared_reports WHERE id = ?").get(id) !== undefined;
}

describe("shared_reports purge (sweep step 8)", () => {
  it("deletes only rows past expiry + grace; expired-in-grace rows keep their 410", async () => {
    const now = Date.now();
    insertReport("active-row", now + 10 * DAY);
    insertReport("expired-in-grace", now - 10 * DAY);
    insertReport("expired-past-grace", now - (SHARED_REPORTS.PURGE_GRACE_DAYS + 10) * DAY);

    const result = await cleanup.runCleanup();

    expect(result.purgedSharedReports).toBe(1);
    expect(has("active-row")).toBe(true);
    // Still present: the read gate can keep answering 410 "expired" for the
    // grace window instead of collapsing straight to 404.
    expect(has("expired-in-grace")).toBe(true);
    expect(has("expired-past-grace")).toBe(false);
  });

  it("is idempotent — the next sweep purges nothing new", async () => {
    const result = await cleanup.runCleanup();
    expect(result.purgedSharedReports).toBe(0);
    expect(has("active-row")).toBe(true);
    expect(has("expired-in-grace")).toBe(true);
  });

  it("runs on the interval even with remediation disabled", async () => {
    const now = Date.now();
    insertReport("purge-via-interval", now - (SHARED_REPORTS.PURGE_GRACE_DAYS + 30) * DAY);

    vi.useFakeTimers();
    try {
      cleanup.startCleanupInterval();
      await vi.advanceTimersByTimeAsync(REMEDIATION.CLEANUP_INTERVAL_MS + 50);
    } finally {
      vi.useRealTimers();
      cleanup.stopCleanupInterval();
    }

    expect(has("purge-via-interval")).toBe(false);
  });
});

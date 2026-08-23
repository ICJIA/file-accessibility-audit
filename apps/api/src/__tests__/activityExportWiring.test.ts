/**
 * THE WIRING: runCleanup() must actually run the activity export as step 8,
 * against the real data directory (DB_PATH's parent), and report what it
 * did. Same file-backed pattern as sharedReportsPurge.test.ts — DB_PATH is
 * set before the dynamic imports because the singleton binds at import.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "activity-wiring-"));
process.env.DB_PATH = join(tmpDir, "test.db");
// The export writes to <repo-root>/logs by default; point it at the temp dir so
// the test never touches the real checkout.
process.env.ACTIVITY_LOG_DIR = join(tmpDir, "logs");
process.env.REMEDIATION_ENABLED = "false";

let cleanup: typeof import("../services/remediationCleanup.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let days: typeof import("../services/activityDays.js");
let DEPLOY: (typeof import("#config"))["DEPLOY"];
const LOG_DIR = process.env.ACTIVITY_LOG_DIR!;

beforeAll(async () => {
  ({ DEPLOY } = await import("#config"));
  cleanup = await import("../services/remediationCleanup.js");
  db = (await import("../db/sqlite.js")).default;
  days = await import("../services/activityDays.js");
});
afterAll(() => {
  cleanup.stopCleanupInterval();
  rmSync(tmpDir, { recursive: true, force: true });
});

const DAY = 86_400_000;
const sqliteStamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

describe("retention sweep step 8: daily activity export", () => {
  it("writes the file for a complete day into ACTIVITY_LOG_DIR and reports it", async () => {
    const twoDaysAgo = Date.now() - 2 * DAY;
    db.prepare(
      `INSERT INTO audit_log (event_type, filename, score, grade, privileged, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("analyze", "wired.pdf", 80, "B", 0, sqliteStamp(twoDaysAgo));

    const result = await cleanup.runCleanup();

    const day = days.localDate(twoDaysAgo, DEPLOY.LOCAL_TIME_ZONE);
    expect(result.errors.filter((e) => e.step === "activityExport")).toEqual([]);
    expect(result.activityFilesWritten).toBeGreaterThanOrEqual(1);
    expect(result.activityFilesPruned).toBe(0);
    expect(existsSync(join(LOG_DIR, days.activityFileName(day)))).toBe(true);
  });

  it("the next sweep writes nothing new", async () => {
    const result = await cleanup.runCleanup();
    expect(result.activityFilesWritten).toBe(0);
  });

  it("prunes old error-log files in the same step and reports it", async () => {
    writeFileSync(join(LOG_DIR, "errors-2025-01-01.log"), "ancient");
    writeFileSync(join(LOG_DIR, "errors-2099-01-01.log"), "future — kept");
    const result = await cleanup.runCleanup();
    expect(result.errorLogFilesPruned).toBe(1);
    expect(readdirSync(LOG_DIR)).toContain("errors-2099-01-01.log");
    expect(readdirSync(LOG_DIR)).not.toContain("errors-2025-01-01.log");
    rmSync(join(LOG_DIR, "errors-2099-01-01.log"), { force: true });
  });

  it("a failing export is reported under step 'activityExport' and blocks nothing else", async () => {
    rmSync(LOG_DIR, { recursive: true, force: true });
    writeFileSync(LOG_DIR, "a file where the directory should be");

    const result = await cleanup.runCleanup();

    expect(result.errors.map((e) => e.step)).toEqual(["activityExport"]);
    expect(result.activityFilesWritten).toBe(0);
    rmSync(LOG_DIR, { force: true });
    expect(readdirSync(tmpDir)).not.toContain("logs");
  });
});

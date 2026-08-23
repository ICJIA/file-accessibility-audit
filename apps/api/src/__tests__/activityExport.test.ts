/**
 * The export runner against a real migrated ":memory:" database and a temp
 * directory. The file's existence is the only state: every run writes each
 * complete local day inside the window that has no file, never rewrites one,
 * and prunes only names it would have written whose date is at or before
 * the cutoff day.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrations.js";
import { CSV_BOM, ACTIVITY_CSV_COLUMNS } from "../services/activityCsv.js";
import { runActivityExport, rowsForDay } from "../services/activityExport.js";

type DB = InstanceType<typeof Database>;
const TZ = "America/Chicago";
// 2026-08-22 07:00 CDT. Retention 3 days → cutoffDay 2026-08-19; last complete day 2026-08-21.
const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const OPTS = { nowMs: NOW, retentionDays: 3, graceMinutes: 5, timeZone: TZ };

let db: DB;
let dir: string;

function seed(createdAtUtc: string, filename: string, eventType = "analyze"): void {
  db.prepare(
    `INSERT INTO audit_log (event_type, filename, score, grade, content_hash, privileged, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(eventType, filename, 80, "B", "hash", 0, null, createdAtUtc);
}

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  dir = join(mkdtempSync(join(tmpdir(), "activity-export-")), "activity");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

const fileText = (day: string) => readFileSync(join(dir, `activity-${day}.csv`), "utf8");
const dataLines = (day: string) =>
  fileText(day).slice(CSV_BOM.length).trimEnd().split("\n").slice(1);

describe("rowsForDay", () => {
  it("buckets rows by their LOCAL date, across the UTC midnight", () => {
    seed("2026-08-20 14:00:00", "noon-aug20.pdf"); // 09:00 CDT Aug 20
    seed("2026-08-21 04:30:00", "late-aug20.pdf"); // 23:30 CDT Aug 20
    seed("2026-08-21 12:00:00", "aug21.pdf"); // 07:00 CDT Aug 21
    expect(rowsForDay(db, "2026-08-20", TZ).map((r) => r.filename)).toEqual([
      "noon-aug20.pdf",
      "late-aug20.pdf",
    ]);
    expect(rowsForDay(db, "2026-08-21", TZ).map((r) => r.filename)).toEqual(["aug21.pdf"]);
  });
});

describe("runActivityExport", () => {
  it("writes every complete day inside the window and nothing outside it", () => {
    seed("2026-08-19 12:00:00", "cutoff-day.pdf"); // the boundary day: never written
    seed("2026-08-20 14:00:00", "aug20.pdf");
    seed("2026-08-21 04:30:00", "aug20-late.pdf");
    seed("2026-08-22 06:00:00", "today.pdf"); // 01:00 CDT Aug 22: today, not complete

    const result = runActivityExport({ db, dir, ...OPTS });

    expect(result).toEqual({ written: 2, pruned: 0, days: ["2026-08-20", "2026-08-21"] });
    expect(readdirSync(dir).sort()).toEqual(["activity-2026-08-20.csv", "activity-2026-08-21.csv"]);
    expect(dataLines("2026-08-20")).toHaveLength(2);
    expect(dataLines("2026-08-20")[1]).toContain("aug20-late.pdf");
    // Aug 21 had no rows: header-only, an explicit "nothing happened".
    expect(fileText("2026-08-21")).toBe(`${CSV_BOM}${ACTIVITY_CSV_COLUMNS.join(",")}\n`);
  });

  it("is idempotent and never rewrites a complete day's file", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS });
    writeFileSync(join(dir, "activity-2026-08-20.csv"), "hand-edited");
    seed("2026-08-20 15:00:00", "late-arrival.pdf"); // cannot happen in production; proves the rule

    const again = runActivityExport({ db, dir, ...OPTS });

    expect(again.written).toBe(0);
    expect(fileText("2026-08-20")).toBe("hand-edited");
  });

  it("prunes only activity files dated at or before the cutoff day, and touches nothing else", () => {
    runActivityExport({ db, dir, ...OPTS }); // creates the directory
    writeFileSync(join(dir, "activity-2026-08-18.csv"), "old");
    writeFileSync(join(dir, "activity-2026-08-19.csv"), "cutoff");
    writeFileSync(join(dir, "activity-2026-08-18.csv.tmp"), "stale tmp");
    writeFileSync(join(dir, "notes.txt"), "a human's file");
    writeFileSync(join(dir, "activity-2026-02-30.csv"), "not a real day");

    const result = runActivityExport({ db, dir, ...OPTS });

    expect(result.pruned).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      "activity-2026-02-30.csv",
      "activity-2026-08-18.csv.tmp",
      "activity-2026-08-20.csv",
      "activity-2026-08-21.csv",
      "notes.txt",
    ]);
  });

  it("writes atomically with private permissions and leaves no .tmp behind", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS });
    expect(readdirSync(dir).some((n) => n.endsWith(".tmp"))).toBe(false);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "activity-2026-08-20.csv")).mode & 0o777).toBe(0o600);
  });

  it("overwrites a stale .tmp from a crashed run for a day that still has no file", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS, nowMs: Date.UTC(2026, 7, 20, 12, 0, 0) }); // writes Aug 18–19 (both later pruned); Aug 20 not yet complete
    writeFileSync(join(dir, "activity-2026-08-20.csv.99999.tmp"), "half-written");
    const result = runActivityExport({ db, dir, ...OPTS });
    expect(result.days).toContain("2026-08-20");
    expect(readdirSync(dir).some((n) => n.endsWith(".tmp"))).toBe(false);
    expect(dataLines("2026-08-20")).toHaveLength(1);
  });

  it("fails loudly when the directory cannot be created (a file is in the way)", () => {
    writeFileSync(dir, "not a directory");
    expect(() => runActivityExport({ db, dir, ...OPTS })).toThrow();
  });

  it("fails loudly on an unknown time zone rather than cutting UTC days", () => {
    expect(() => runActivityExport({ db, dir, ...OPTS, timeZone: "Not/AZone" })).toThrow();
  });
});

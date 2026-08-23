import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { ACTIVITY_EXPORT, DEPLOY, STATUS } from "#config";
import { MIGRATIONS, runMigrations } from "../db/migrations.js";

describe("STATUS.FAILURE_EVENT_TYPES", () => {
  it("is exactly the '-failed' twin of every document and page event type", () => {
    const expected = [...STATUS.DOCUMENT_EVENT_TYPES, ...STATUS.PAGE_EVENT_TYPES].map(
      (t) => `${t}-failed`,
    );
    expect([...STATUS.FAILURE_EVENT_TYPES].sort()).toEqual(expected.sort());
  });

  it("overlaps no other event-type list, so the allow-list counters exclude it by construction", () => {
    const others = new Set<string>([
      ...STATUS.DOCUMENT_EVENT_TYPES,
      ...STATUS.PAGE_EVENT_TYPES,
      ...STATUS.REJECTION_EVENT_TYPES,
    ]);
    for (const t of STATUS.FAILURE_EVENT_TYPES) expect(others.has(t)).toBe(false);
  });
});

describe("migration 13: audit_log.reason", () => {
  it("a fresh database has a nullable TEXT reason column and lands at the latest version", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const cols = db.pragma("table_info(audit_log)") as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const reason = cols.find((c) => c.name === "reason");
    expect(reason).toBeDefined();
    expect(reason!.type).toBe("TEXT");
    expect(reason!.notnull).toBe(0);
    expect(db.pragma("user_version", { simple: true })).toBe(
      MIGRATIONS[MIGRATIONS.length - 1].version,
    );
    expect(MIGRATIONS.some((m) => m.version === 13)).toBe(true);
  });

  it("is safe to re-run on a database that already has the column", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const m13 = MIGRATIONS.find((m) => m.version === 13)!;
    expect(() => m13.up(db)).not.toThrow();
  });
});

describe("export configuration", () => {
  it("names a real IANA zone and sane export settings", () => {
    expect(
      () => new Intl.DateTimeFormat("en-US", { timeZone: DEPLOY.LOCAL_TIME_ZONE }),
    ).not.toThrow();
    expect(DEPLOY.LOCAL_TIME_ZONE).toBe("America/Chicago");
    expect(ACTIVITY_EXPORT.DIR_NAME).toBe("logs");
    expect(ACTIVITY_EXPORT.FILE_PREFIX).toBe("activity-");
    expect(ACTIVITY_EXPORT.GRACE_MINUTES).toBeGreaterThan(0);
  });
});

/**
 * Tests for the numbered SQLite migration runner (C3). These construct their
 * OWN better-sqlite3 instances directly (":memory:" databases) rather than
 * going through the app's DB_PATH-based singleton (../db/sqlite.js), so each
 * test controls its starting schema/user_version precisely.
 *
 * The single most important property tested here: an already-provisioned
 * legacy production database (every current column already present, but
 * user_version still at SQLite's default of 0 because that tracking didn't
 * exist yet) must fast-forward WITHOUT re-running any ALTER TABLE ADD
 * COLUMN — that throws in SQLite on a column that already exists and would
 * crash the API on deploy. The legacy fixture below is built by literally
 * running the CURRENT pre-migration schema code (copied verbatim from git
 * history into helpers/legacyPreMigrationSchema.ts), not a hand-approximation
 * of it.
 */
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import {
  MIGRATIONS,
  runMigrations,
  runMigrationList,
  runMigrationsWith,
  type Migration,
} from "../db/migrations.js";
import { buildLegacyPreMigrationSchema } from "./helpers/legacyPreMigrationSchema.js";

type DB = InstanceType<typeof Database>;

function freshDb(): DB {
  return new Database(":memory:");
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function tableExists(db: DB, table: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

describe("runMigrations: fresh database", () => {
  it("lands a brand-new database at the latest user_version with the full schema", () => {
    const db = freshDb();
    runMigrations(db);

    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);

    for (const table of [
      "audit_log",
      "otp_codes",
      "shared_reports",
      "access_tokens",
      "remediation_jobs",
      "remediation_events",
    ]) {
      expect(tableExists(db, table)).toBe(true);
    }

    // Every backfilled column is present too — migration 1's baseline
    // already declares these, and migrations 2+ must not choke on that.
    expect(hasColumn(db, "audit_log", "content_hash")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "input_audit_json")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "output_audit_json")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "verapdf_available")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "verapdf_passed")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "verapdf_summary_json")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "original_filename")).toBe(true);
    expect(hasColumn(db, "shared_reports", "content_hash")).toBe(true);

    // The table actually WORKS (columns aren't just declared but usable).
    expect(() =>
      db
        .prepare(
          `INSERT INTO remediation_jobs
             (id, input_filename, status, created_at, expires_at)
           VALUES ('job-1', 'r.pdf', 'pending', 0, 0)`,
        )
        .run(),
    ).not.toThrow();
  });

  it("re-running on an already-latest database is a no-op (idempotent re-open)", () => {
    const db = freshDb();
    runMigrations(db);
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);

    // Must not throw (this is exactly the "ALTER on an existing column"
    // crash scenario if migrations aren't properly version-gated) and must
    // leave user_version unchanged.
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);
  });

  it("does not touch WAL mode or foreign_keys pragmas set before it runs", () => {
    const db = freshDb();
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    // :memory: databases report journal_mode as "memory" regardless of the
    // WAL request (a well-known SQLite behavior for in-memory databases) —
    // the meaningful assertion here is that runMigrations doesn't ISSUE its
    // own conflicting journal_mode/foreign_keys pragma call that would
    // override what the caller (sqlite.ts) already set.
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});

describe("runMigrationList: version-selection algorithm (fake migrations, precise)", () => {
  function fakeMigrations(versions: number[], calls: number[]): Migration[] {
    return versions.map((version) => ({
      version,
      name: `fake-${version}`,
      up: () => {
        calls.push(version);
      },
    }));
  }

  it("a database snapshotted at version N gets exactly the N+1..latest migrations", () => {
    const db = freshDb();
    const calls: number[] = [];
    const migrations = fakeMigrations([1, 2, 3, 4, 5], calls);
    db.pragma("user_version = 2");

    runMigrationList(db, migrations, 2);

    expect(calls).toEqual([3, 4, 5]);
    expect(db.pragma("user_version", { simple: true })).toBe(5);
  });

  it("re-open at the latest version runs nothing", () => {
    const db = freshDb();
    const calls: number[] = [];
    const migrations = fakeMigrations([1, 2, 3], calls);
    db.pragma("user_version = 3");

    runMigrationList(db, migrations, 3);

    expect(calls).toEqual([]);
    expect(db.pragma("user_version", { simple: true })).toBe(3);
  });

  it("a fresh database (version 0) runs every migration in order", () => {
    const db = freshDb();
    const calls: number[] = [];
    const migrations = fakeMigrations([1, 2, 3], calls);

    runMigrationList(db, migrations, 0);

    expect(calls).toEqual([1, 2, 3]);
    expect(db.pragma("user_version", { simple: true })).toBe(3);
  });

  it("bumps user_version after EACH migration, not just once at the end (crash-mid-migration resume)", () => {
    const db = freshDb();
    const versionsSeenDuring: number[] = [];
    const migrations: Migration[] = [1, 2, 3].map((version) => ({
      version,
      name: `fake-${version}`,
      up: (d) => {
        // Captures user_version as it stood WHILE this migration's own
        // transaction was running — must equal the PREVIOUS migration's
        // version, proving each bump commits before the next migration
        // starts (not batched at the end).
        versionsSeenDuring.push(d.pragma("user_version", { simple: true }) as number);
      },
    }));

    runMigrationList(db, migrations, 0);

    expect(versionsSeenDuring).toEqual([0, 1, 2]);
  });
});

describe("runMigrations: legacy pre-migration-runner database (number-one requirement)", () => {
  it("fast-forwards WITHOUT re-running any ALTER — does not throw on a fully-provisioned legacy DB at user_version=0", () => {
    const db = freshDb();
    buildLegacyPreMigrationSchema(db);

    // Faithfully reproduces the real-world scenario: every column already
    // exists (the old inline code ran its backfills already), but
    // user_version is still 0 because that tracking is brand new.
    expect(db.pragma("user_version", { simple: true })).toBe(0);
    expect(hasColumn(db, "remediation_jobs", "original_filename")).toBe(true);

    // THE crash this whole task exists to prevent: ALTER TABLE ADD COLUMN
    // on a column that already exists throws in SQLite. If runMigrations
    // blindly replayed every migration's ALTER without the legacy
    // fast-forward (or without each migration's own probe-before-ALTER
    // guard), this call would throw and the API would crash on deploy.
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("lands the legacy DB at the latest version with the schema intact", () => {
    const db = freshDb();
    buildLegacyPreMigrationSchema(db);
    runMigrations(db);

    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);
    expect(hasColumn(db, "audit_log", "content_hash")).toBe(true);
    expect(hasColumn(db, "shared_reports", "content_hash")).toBe(true);
  });

  it("preserves existing data in the legacy DB across the fast-forward (not a rebuild)", () => {
    const db = freshDb();
    buildLegacyPreMigrationSchema(db);
    db.prepare(
      `INSERT INTO remediation_jobs
         (id, input_filename, status, created_at, expires_at)
       VALUES ('legacy-job', 'old.pdf', 'complete', 1000, 2000)`,
    ).run();

    runMigrations(db);

    const row = db.prepare("SELECT * FROM remediation_jobs WHERE id = 'legacy-job'").get() as {
      input_filename: string;
    };
    expect(row.input_filename).toBe("old.pdf");
  });

  it("a legacy DB that is NOT fully provisioned (missing one backfilled column) still migrates safely via each migration's own guard, not just the fast-forward", () => {
    // Simulates an unlikely but possible intermediate legacy state: build
    // the legacy schema, then drop back to a bare table lacking the LAST
    // backfilled column so isLegacyFullyProvisioned's probe correctly
    // returns false and the normal migration loop (not the fast-forward)
    // has to carry the weight — proving the per-migration guards are load-
    // bearing on their own, not just redundant with the fast-forward.
    const db = freshDb();
    db.exec(`
      CREATE TABLE remediation_jobs (
        id TEXT PRIMARY KEY,
        email TEXT,
        input_filename TEXT NOT NULL,
        content_hash TEXT,
        page_count INTEGER,
        status TEXT NOT NULL,
        step TEXT,
        progress_pct INTEGER DEFAULT 0,
        input_score REAL,
        output_score REAL,
        output_valid INTEGER,
        output_path TEXT,
        download_token_hash TEXT,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        expires_at INTEGER NOT NULL
      );
    `);
    expect(hasColumn(db, "remediation_jobs", "original_filename")).toBe(false);

    expect(() => runMigrations(db)).not.toThrow();
    expect(hasColumn(db, "remediation_jobs", "original_filename")).toBe(true);
    expect(hasColumn(db, "remediation_jobs", "input_audit_json")).toBe(true);
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION);
  });

  it("migrations beyond the legacy baseline still run after the fast-forward (does not fast-forward past unrun migrations)", () => {
    const db = freshDb();
    buildLegacyPreMigrationSchema(db);
    runMigrations(db);
    const versionAfterFastForward = db.pragma("user_version", { simple: true }) as number;

    // Simulate a migration added AFTER the legacy baseline (e.g. C4's
    // revoked_jtis table) by appending one more fake migration and running
    // the SAME list this database is already partway through.
    let ran = false;
    const withFutureMigration: Migration[] = [
      ...MIGRATIONS,
      {
        version: LATEST_VERSION + 1,
        name: "fake-future-migration",
        up: () => {
          ran = true;
        },
      },
    ];
    runMigrationList(db, withFutureMigration, versionAfterFastForward);

    expect(ran).toBe(true);
    expect(db.pragma("user_version", { simple: true })).toBe(LATEST_VERSION + 1);
  });

  it("fast-forwards to the injected FIXED baseline, not the injected migration list's current length/last entry (regression guard for the exact bug this design avoids)", () => {
    // Directly pins the property MIGRATIONS currently being 9-long can't
    // discriminate on its own (today, LEGACY_BASELINE_VERSION === the real
    // latest version, so a mutation that fast-forwards to "whichever
    // version is last in the list" instead of the fixed baseline constant
    // would be invisible against the real MIGRATIONS array). Injects a
    // migration list LONGER than the baseline, with extra migrations
    // between the baseline and the list's end that must NOT be skipped.
    const db = freshDb();
    buildLegacyPreMigrationSchema(db);
    const injectedBaseline = 9;
    const ranAfterBaseline: number[] = [];
    const migrations: Migration[] = [
      ...MIGRATIONS,
      { version: 10, name: "fake-10", up: () => ranAfterBaseline.push(10) },
      { version: 11, name: "fake-11", up: () => ranAfterBaseline.push(11) },
    ];

    runMigrationsWith(db, migrations, injectedBaseline, () => true);

    // Both post-baseline migrations ran — proving the fast-forward landed
    // on injectedBaseline (9), not migrations[migrations.length-1].version
    // (11), which would have skipped them entirely.
    expect(ranAfterBaseline).toEqual([10, 11]);
    expect(db.pragma("user_version", { simple: true })).toBe(11);
  });
});

describe("LEGACY_BASELINE_VERSION regression guard", () => {
  // isLegacyFullyProvisioned's column probe corresponds EXACTLY to
  // migrations 2..9 (the original inline ALTER blocks) — it must be a fixed
  // historical constant, never bumped when a new migration is appended
  // (see migrations.ts's doc comment). This test fails loudly if a future
  // change accidentally widens the legacy fast-forward target past what the
  // probe actually checks for.
  it("MIGRATIONS currently has exactly 9 entries, matching the documented legacy baseline", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

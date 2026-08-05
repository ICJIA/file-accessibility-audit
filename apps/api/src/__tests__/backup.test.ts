// Nightly database backup (apps/api/scripts/backup-db.mjs).
//
// The backup must use SQLite's online backup API, never a file copy: the
// production DB runs in WAL mode, and a plain `cp` of the main file misses
// every committed row still sitting in the -wal — a stale or torn snapshot
// that looks fine until the day it's restored. These tests pin the properties
// that make the backup trustworthy: WAL contents included, integrity
// verified, wrong/missing sources refused loudly, old snapshots rotated,
// and a machine-readable status file for monitoring.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import Database from "better-sqlite3";

import { runBackup, verifySnapshot } from "../../scripts/backup-db.mjs";

let workDir: string;
let dbPath: string;
let destDir: string;

/** Create a WAL-mode source DB shaped like production (audit_log present). */
function createSourceDb(rows: number): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(
    `CREATE TABLE audit_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       event_type TEXT NOT NULL DEFAULT 'analyze',
       filename TEXT,
       created_at TEXT DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  const insert = db.prepare("INSERT INTO audit_log (filename) VALUES (?)");
  for (let i = 0; i < rows; i++) insert.run(`file-${i}.pdf`);
  return db;
}

function snapshotFiles(): string[] {
  return readdirSync(destDir)
    .filter((f) => /^audit-\d{4}-\d{2}-\d{2}T\d{6}\.db\.gz$/.test(f))
    .sort();
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "backup-test-"));
  dbPath = join(workDir, "audit.db");
  destDir = join(workDir, "backups");
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("runBackup", () => {
  it("produces a gzipped snapshot whose contents match the source", async () => {
    const src = createSourceDb(25);
    try {
      const result = await runBackup({ dbPath, destDir, keepCount: 5 });

      expect(result.auditLogRows).toBe(25);
      expect(snapshotFiles()).toHaveLength(1);
      expect(result.snapshotPath.endsWith(".db.gz")).toBe(true);
      expect(statSync(result.snapshotPath).size).toBe(result.bytes);

      const raw = gunzipSync(readFileSync(result.snapshotPath));
      const restoredPath = join(workDir, "restored.db");
      writeFileSync(restoredPath, raw);
      const restored = new Database(restoredPath, { readonly: true });
      try {
        expect(restored.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
        const count = restored.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as {
          n: number;
        };
        expect(count.n).toBe(25);
      } finally {
        restored.close();
      }
    } finally {
      src.close();
    }
  });

  it("includes committed rows still sitting in the WAL (the case a plain cp loses)", async () => {
    const src = createSourceDb(0);
    try {
      // Insert with the connection held open so nothing is checkpointed into
      // the main file yet — the rows live only in audit.db-wal.
      const insert = src.prepare("INSERT INTO audit_log (filename) VALUES (?)");
      for (let i = 0; i < 40; i++) insert.run(`wal-${i}.pdf`);
      expect(existsSync(`${dbPath}-wal`)).toBe(true);
      expect(statSync(`${dbPath}-wal`).size).toBeGreaterThan(0);

      const result = await runBackup({ dbPath, destDir, keepCount: 5 });
      expect(result.auditLogRows).toBe(40);
    } finally {
      src.close();
    }
  });

  it("refuses to run when the source database does not exist, creating nothing", async () => {
    await expect(runBackup({ dbPath, destDir, keepCount: 5 })).rejects.toThrow();
    // The classic trap: a backup job pointed at the wrong path must not
    // manufacture an empty database and "successfully" back that up.
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(destDir) ? snapshotFiles() : []).toHaveLength(0);
  });

  it("fails loudly when pointed at a database without audit_log (wrong file)", async () => {
    const stray = new Database(dbPath);
    stray.exec("CREATE TABLE not_our_schema (id INTEGER)");
    stray.close();

    await expect(runBackup({ dbPath, destDir, keepCount: 5 })).rejects.toThrow(/audit_log/);
  });

  it("keeps only the newest keepCount snapshots and leaves foreign files alone", async () => {
    const src = createSourceDb(1);
    try {
      // Three pre-existing snapshots (names are chronological because the
      // timestamp format sorts lexicographically) plus one foreign file.
      const older = [
        "audit-2026-01-01T020000.db.gz",
        "audit-2026-01-02T020000.db.gz",
        "audit-2026-01-03T020000.db.gz",
      ];
      const foreign = join(destDir, "notes.txt");
      await runBackup({ dbPath, destDir, keepCount: 10 });
      for (const name of older) writeFileSync(join(destDir, name), "old");
      writeFileSync(foreign, "keep me");

      // 4 existing snapshots + the new one = 5; keepCount 2 keeps the new
      // one and the newest of the old, rotating the three oldest.
      const result = await runBackup({ dbPath, destDir, keepCount: 2 });

      expect(result.rotated).toEqual(expect.arrayContaining(older.slice(0, 2)));
      expect(result.rotated).toHaveLength(3);
      expect(existsSync(join(destDir, older[0]!))).toBe(false);
      expect(existsSync(join(destDir, older[1]!))).toBe(false);
      expect(existsSync(foreign)).toBe(true);
      expect(snapshotFiles()).toHaveLength(2);
    } finally {
      src.close();
    }
  });

  it("defaults to keeping 5 snapshots", async () => {
    const src = createSourceDb(2);
    try {
      const result = await runBackup({ dbPath, destDir });
      expect(result.auditLogRows).toBe(2);

      const status = JSON.parse(readFileSync(join(destDir, "last-backup.json"), "utf8"));
      expect(status.keepCount).toBe(5);
    } finally {
      src.close();
    }
  });

  it("writes a last-backup.json status file for monitoring", async () => {
    const src = createSourceDb(3);
    try {
      const result = await runBackup({ dbPath, destDir, keepCount: 5 });

      const status = JSON.parse(readFileSync(join(destDir, "last-backup.json"), "utf8"));
      expect(status.integrity).toBe("ok");
      expect(status.auditLogRows).toBe(3);
      expect(status.keepCount).toBe(5);
      expect(status.snapshotPath).toBe(result.snapshotPath);
      expect(status.bytes).toBe(result.bytes);
      expect(Number.isNaN(Date.parse(status.finishedAt))).toBe(false);
    } finally {
      src.close();
    }
  });
});

describe("verifySnapshot", () => {
  it("reports ok with the row count for a valid snapshot", async () => {
    const src = createSourceDb(7);
    try {
      const { snapshotPath } = await runBackup({ dbPath, destDir, keepCount: 5 });
      const verdict = await verifySnapshot(snapshotPath);
      expect(verdict).toEqual({ ok: true, auditLogRows: 7 });
    } finally {
      src.close();
    }
  });

  it("throws on a corrupt snapshot rather than reporting success", async () => {
    const bad = join(workDir, "audit-2026-08-05T020000.db.gz");
    writeFileSync(bad, "this is not a gzip file");
    await expect(verifySnapshot(bad)).rejects.toThrow();
  });
});

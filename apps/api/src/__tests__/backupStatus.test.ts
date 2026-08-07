// The /status payload's `backup` section — surfacing last-backup.json (written
// by apps/api/scripts/backup-db.mjs only after a snapshot passes its
// integrity check) so "backups silently stopped" is observable remotely.
//
// Design constraints pinned here:
//   - The section NEVER contains a filesystem path. The status file's own
//     sourcePath/snapshotPath fields are server paths, and /status is public;
//     statusPrivacy.test.ts fails the build on leaked paths, and this suite
//     asserts the same property at the unit level.
//   - A missing, unreadable, malformed, or failed-integrity file all read as
//     "unavailable" — never a crash, and never mistaken for a success.
//   - Staleness is judged against STATUS.BACKUP_STALE_AFTER_HOURS so a dead
//     cron eventually becomes visible, but a server where backups have never
//     run shows "unavailable", not an alarm — rollout must not page anyone.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { STATUS } from "#config";
import { runMigrations } from "../db/migrations.js";
import {
  createStatusService,
  defaultBackupStatusFile,
  payloadIsCoreFailure,
  readBackupStatus,
  type EngineProbes,
  type StatusDb,
} from "../services/status.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NOW = Date.UTC(2026, 7, 5, 15, 0, 0);

let workDir: string;
let statusFile: string;

function writeStatusFile(overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    statusFile,
    JSON.stringify({
      finishedAt: new Date(NOW - 6 * 3_600_000).toISOString(),
      sourcePath: "/home/forge/audit.icjia.app/apps/api/data/audit.db",
      snapshotPath: "/home/forge/backups/audit-db/audit-2026-08-05T090000.db.gz",
      bytes: 574850,
      auditLogRows: 4143,
      integrity: "ok",
      keepCount: 5,
      rotated: [],
      ...overrides,
    }),
  );
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "backup-status-"));
  statusFile = join(workDir, "last-backup.json");
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("defaultBackupStatusFile", () => {
  it("defaults to a backups/ directory BESIDE the repository checkout", () => {
    // Beside, never inside: backups inside the working tree would be deleted
    // by the same `git clean -xdf` that deletes the database — the exact
    // disaster they exist to survive. The sibling directory keeps them one
    // `ls` away in the Forge site folder without that coupling, and matches
    // scripts/backup-db.sh's default so the two agree without shared config.
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    expect(defaultBackupStatusFile()).toBe(join(dirname(repoRoot), "backups", "last-backup.json"));
  });

  it("honors a BACKUP_DIR override, same as the backup script", () => {
    const prev = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = "/custom/backups";
    try {
      expect(defaultBackupStatusFile()).toBe(join("/custom/backups", "last-backup.json"));
    } finally {
      if (prev === undefined) delete process.env.BACKUP_DIR;
      else process.env.BACKUP_DIR = prev;
    }
  });
});

describe("readBackupStatus", () => {
  it("reports ok with age, size, and rows for a fresh status file", () => {
    writeStatusFile();
    const r = readBackupStatus(statusFile, NOW);

    expect(r.status).toBe("ok");
    expect(r.finished_at).toBe(new Date(NOW - 6 * 3_600_000).toISOString());
    expect(r.age_hours).toBe(6);
    expect(r.size_bytes).toBe(574850);
    expect(r.rows).toBe(4143);
    expect(typeof r.finished_at_chicago).toBe("string");
  });

  it("reports stale once the file is older than BACKUP_STALE_AFTER_HOURS", () => {
    const staleMs = (STATUS.BACKUP_STALE_AFTER_HOURS + 2) * 3_600_000;
    writeStatusFile({ finishedAt: new Date(NOW - staleMs).toISOString() });
    const r = readBackupStatus(statusFile, NOW);

    expect(r.status).toBe("stale");
    expect(r.age_hours).toBe(STATUS.BACKUP_STALE_AFTER_HOURS + 2);
  });

  it("reports unavailable when the file does not exist", () => {
    const r = readBackupStatus(join(workDir, "missing.json"), NOW);
    expect(r).toEqual({
      status: "unavailable",
      finished_at: null,
      finished_at_chicago: null,
      age_hours: null,
      size_bytes: null,
      rows: null,
    });
  });

  it("reports unavailable on malformed JSON rather than throwing", () => {
    writeFileSync(statusFile, "{ not json");
    expect(readBackupStatus(statusFile, NOW).status).toBe("unavailable");
  });

  it("reports unavailable when the recorded integrity is not ok", () => {
    writeStatusFile({ integrity: "failed" });
    expect(readBackupStatus(statusFile, NOW).status).toBe("unavailable");
  });

  it("never includes a filesystem path, even though the source file carries two", () => {
    writeStatusFile();
    const r = readBackupStatus(statusFile, NOW);
    const flat = JSON.stringify(r);
    expect(flat).not.toContain("/");
    expect(flat).not.toContain("home");
    expect(flat).not.toContain("audit-db");
  });

  it("clamps a future finishedAt (clock skew) to age zero instead of negative", () => {
    writeStatusFile({ finishedAt: new Date(NOW + 10 * 60_000).toISOString() });
    const r = readBackupStatus(statusFile, NOW);
    expect(r.status).toBe("ok");
    expect(r.age_hours).toBe(0);
  });
});

describe("status payload backup section", () => {
  const OK_ENGINES: EngineProbes = {
    qpdf: async () => ({ ok: true, version: "12.3.2" }),
    verapdf: async () => ({ ok: true, version: "1.26.1" }),
    chromium: async () => ({ ok: true }),
  };

  function build(backupStatusFile: string, probes: EngineProbes = OK_ENGINES) {
    const db = new Database(":memory:");
    runMigrations(db);
    return createStatusService({
      now: () => NOW,
      db: db as unknown as StatusDb,
      probes,
      version: "test",
      startedAtMs: NOW - 60_000,
      remediationEnabled: false,
      backupStatusFile,
      diskPath: ".",
    }).getStatus();
  }

  it("carries the backup section in the payload, with no degraded entry when fresh", async () => {
    writeStatusFile();
    const payload = await build(statusFile);
    expect(payload.backup.status).toBe("ok");
    expect(payload.backup.rows).toBe(4143);
    expect(payload.status).toBe("ok");
    expect(payload.degraded).toBeUndefined();
  });

  it("promotes a STALE backup into the degraded list — a dead backup cron now pages", async () => {
    // v1.52.0: with a nightly cadence on record, an overdue backup is a real
    // operational failure. "backup" in `degraded` flips status to "degraded",
    // which the uptime monitor's existing keyword alert matches with no
    // monitor-side change.
    const staleMs = (STATUS.BACKUP_STALE_AFTER_HOURS + 5) * 3_600_000;
    writeStatusFile({ finishedAt: new Date(NOW - staleMs).toISOString() });
    const payload = await build(statusFile);

    expect(payload.backup.status).toBe("stale");
    expect(payload.status).toBe("degraded");
    expect(payload.degraded).toContain("backup");
    // Degraded, never an outage: a stale backup must not turn /status into a
    // 503 — the service can still audit.
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("lists a stale backup alongside other degraded components", async () => {
    const staleMs = (STATUS.BACKUP_STALE_AFTER_HOURS + 5) * 3_600_000;
    writeStatusFile({ finishedAt: new Date(NOW - staleMs).toISOString() });
    const payload = await build(statusFile, {
      ...OK_ENGINES,
      verapdf: async () => ({ ok: false, reason: "timeout" }),
    });

    expect(payload.degraded).toEqual(expect.arrayContaining(["verapdf", "backup"]));
    expect(payloadIsCoreFailure(payload)).toBe(false);
  });

  it("stays 'ok' overall when backups are unavailable — a fresh install must not page", async () => {
    // Unchanged by v1.52.0, deliberately: "unavailable" means no backup has
    // ever completed (or the status file is unreadable) — the expected state
    // of a new deployment before its first scheduled run. Only staleness,
    // which requires a backup to have succeeded before, raises the flag.
    const payload = await build(join(workDir, "missing.json"));
    expect(payload.backup.status).toBe("unavailable");
    expect(payload.status).toBe("ok");
    expect(payload.degraded).toBeUndefined();
  });
});

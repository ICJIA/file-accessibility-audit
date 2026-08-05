// Hand-written declarations for backup-db.mjs. The implementation is plain
// JavaScript on purpose (cron runs it with bare `node`, no tsx — see the
// header there); this file exists so `tsc --noEmit` can type-check the
// importers (backup.test.ts) without enabling allowJs repo-wide. Keep the
// signatures in sync with backup-db.mjs — the test suite exercises the real
// shapes, so drift fails loudly there.

/** Absolute path of the source DB: DB_PATH (resolved against apps/api) or apps/api/data/audit.db. */
export function resolveDbPath(): string;

export interface BackupResult {
  /** Absolute path of the gzipped snapshot that was written. */
  snapshotPath: string;
  /** Size of the gzipped snapshot in bytes. */
  bytes: number;
  /** Row count of audit_log inside the verified snapshot. */
  auditLogRows: number;
  /** Basenames of older snapshots deleted by count-based rotation. */
  rotated: string[];
}

export function runBackup(options: {
  dbPath: string;
  destDir: string;
  /** How many snapshots to retain (newest kept). Defaults to 5; floored at 1. */
  keepCount?: number;
}): Promise<BackupResult>;

export function verifySnapshot(gzPath: string): Promise<{ ok: boolean; auditLogRows: number }>;

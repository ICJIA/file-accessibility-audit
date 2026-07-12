/**
 * Numbered SQLite migrations, keyed on `PRAGMA user_version`.
 *
 * Each migration is `{ version, name, up(db) }`. `runMigrations(db)`:
 *   1. Reads the current `user_version`.
 *   2. If it's 0, checks whether this is an ALREADY-PROVISIONED legacy
 *      database (see `isLegacyFullyProvisioned` below) — one created by a
 *      pre-migration-runner version of this file, which already ran every
 *      backfill ALTER inline (probe-then-conditionally-ALTER, the same
 *      pattern each migration below still keeps) but never touched
 *      `user_version`. If so, fast-forwards `user_version` straight to
 *      `LEGACY_BASELINE_VERSION` WITHOUT executing any migration's `up()` —
 *      this is the number-one correctness requirement here: `ALTER TABLE
 *      ADD COLUMN` on a column that already exists throws in SQLite, and
 *      would crash the API on deploy against the real production database.
 *   3. Runs every migration with `version > currentVersion`, each in its own
 *      transaction, bumping `user_version` to that migration's number
 *      immediately after it commits — so a crash mid-migration never
 *      leaves the version pointing past what actually ran.
 *
 * Every migration's `up()` ALSO keeps the exact probe-before-ALTER guard the
 * original inline code used (`PRAGMA table_info` before each `ALTER TABLE
 * ADD COLUMN`) — belt-and-braces alongside the legacy fast-forward above,
 * and NOT redundant: migration 1's baseline CREATE TABLE statements already
 * declare every column the later migrations backfill (that's how a BRAND
 * NEW database ends up fully provisioned in one step), so on a fresh
 * install migrations 2+ must see their target column already present (from
 * migration 1) and skip their own ALTER — the exact same guard that
 * protects a legacy database also makes a fresh one correct.
 */
import type Database from "better-sqlite3";

type DB = InstanceType<typeof Database>;

export interface Migration {
  version: number;
  name: string;
  up(db: DB): void;
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline schema (audit_log, otp_codes, shared_reports, access_tokens, remediation_jobs, remediation_events)",
    up(db) {
      // Verbatim baseline schema — unchanged from the pre-migration-runner
      // sqlite.ts. CREATE TABLE/INDEX IF NOT EXISTS is naturally idempotent,
      // so this is always safe to run against a fresh OR a legacy database.
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          email TEXT NOT NULL,
          filename TEXT,
          score INTEGER,
          grade TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_audit_email ON audit_log(email);
        CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);

        CREATE TABLE IF NOT EXISTS otp_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          otp_hash TEXT NOT NULL,
          attempts INTEGER DEFAULT 0,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);

        CREATE TABLE IF NOT EXISTS shared_reports (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          filename TEXT NOT NULL,
          report_json TEXT NOT NULL,
          content_hash TEXT,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_shared_reports_expires ON shared_reports(expires_at);
        -- The partial index supporting /api/audit-url hash-dedup is created
        -- by migration 9 below — that migration guarantees the content_hash
        -- column exists on pre-1.19.0 databases before the index references
        -- it.

        CREATE TABLE IF NOT EXISTS access_tokens (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          last_used_at TEXT,
          revoked_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_access_tokens_email ON access_tokens(email);
        CREATE INDEX IF NOT EXISTS idx_access_tokens_hash_active ON access_tokens(token_hash) WHERE revoked_at IS NULL;

        -- PDF auto-remediation (v1)
        -- Tracks each remediation job and its lifecycle. PDF content is never
        -- stored here; only metadata (filename, scores, status, timestamps,
        -- content hash for later verification lookups).
        CREATE TABLE IF NOT EXISTS remediation_jobs (
          id TEXT PRIMARY KEY,
          email TEXT,
          input_filename TEXT NOT NULL,
          original_filename TEXT,
          content_hash TEXT,
          page_count INTEGER,
          status TEXT NOT NULL CHECK (status IN ('pending','running','complete','failed','expired')),
          step TEXT,
          progress_pct INTEGER DEFAULT 0,
          input_score REAL,
          output_score REAL,
          output_valid INTEGER,
          output_path TEXT,
          download_token_hash TEXT,
          failure_reason TEXT,
          input_audit_json TEXT,
          output_audit_json TEXT,
          verapdf_available INTEGER,
          verapdf_passed INTEGER,
          verapdf_summary_json TEXT,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          expires_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_remediation_jobs_email_created
          ON remediation_jobs(email, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_remediation_jobs_expires
          ON remediation_jobs(expires_at);
        CREATE INDEX IF NOT EXISTS idx_remediation_jobs_status
          ON remediation_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_remediation_jobs_content_hash
          ON remediation_jobs(content_hash);
        CREATE INDEX IF NOT EXISTS idx_remediation_jobs_filename
          ON remediation_jobs(input_filename);

        -- Append-only lifecycle event log for the auditor receipt and
        -- compliance reporting. Each row represents one observed event
        -- (received, processing_started, input_deleted, verified_absent, etc.)
        -- with a server-side timestamp. Never contains PDF content.
        CREATE TABLE IF NOT EXISTS remediation_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          event TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          details TEXT,
          FOREIGN KEY (job_id) REFERENCES remediation_jobs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_remediation_events_job
          ON remediation_events(job_id, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_remediation_events_event
          ON remediation_events(event);
      `);
    },
  },
  {
    version: 2,
    name: "audit_log.content_hash backfill + index",
    up(db) {
      // SQLite doesn't support `ADD COLUMN IF NOT EXISTS`, so probe first.
      if (!hasColumn(db, "audit_log", "content_hash")) {
        db.exec("ALTER TABLE audit_log ADD COLUMN content_hash TEXT");
        db.exec("CREATE INDEX IF NOT EXISTS idx_audit_content_hash ON audit_log(content_hash)");
      }
    },
  },
  {
    version: 3,
    name: "remediation_jobs.input_audit_json backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "input_audit_json")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN input_audit_json TEXT");
      }
    },
  },
  {
    version: 4,
    name: "remediation_jobs.output_audit_json backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "output_audit_json")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN output_audit_json TEXT");
      }
    },
  },
  {
    version: 5,
    name: "remediation_jobs.verapdf_available backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "verapdf_available")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN verapdf_available INTEGER");
      }
    },
  },
  {
    version: 6,
    name: "remediation_jobs.verapdf_passed backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "verapdf_passed")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN verapdf_passed INTEGER");
      }
    },
  },
  {
    version: 7,
    name: "remediation_jobs.verapdf_summary_json backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "verapdf_summary_json")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN verapdf_summary_json TEXT");
      }
    },
  },
  {
    version: 8,
    // v1.20.0+: preserve the user's exact uploaded filename (spaces and
    // everything) so the download endpoint can serve the file under the
    // original name — critical for CMS file-replacement workflows where
    // the filename is what links resolve against.
    name: "remediation_jobs.original_filename backfill",
    up(db) {
      if (!hasColumn(db, "remediation_jobs", "original_filename")) {
        db.exec("ALTER TABLE remediation_jobs ADD COLUMN original_filename TEXT");
      }
    },
  },
  {
    version: 9,
    // v1.19.0+: used by POST /api/audit-url for hash-based dedup so
    // re-auditing an unchanged URL returns the existing report instead of
    // creating a new row.
    name: "shared_reports.content_hash backfill + dedup index",
    up(db) {
      if (!hasColumn(db, "shared_reports", "content_hash")) {
        db.exec("ALTER TABLE shared_reports ADD COLUMN content_hash TEXT");
      }
      // Always (re)attempt to create the dedup index. CREATE INDEX IF NOT
      // EXISTS is idempotent, and by the time we get here the column is
      // guaranteed to exist whether the table was freshly created or just
      // backfilled.
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_shared_reports_dedup " +
          "ON shared_reports(email, content_hash, expires_at) " +
          "WHERE content_hash IS NOT NULL",
      );
    },
  },
];

/**
 * The `user_version` a fully-provisioned LEGACY database (one that ran every
 * migration above via the original inline probe+ALTER code, before
 * `user_version` tracking existed) should fast-forward to. This is a FIXED
 * historical constant — it must never be bumped when a new migration is
 * appended (unlike `MIGRATIONS`, which grows over time). Bumping it would
 * make the fast-forward path skip newly-added migrations (e.g. a later
 * migration creating a brand-new table) on a legacy database, since they'd
 * never run and never get the chance to create what they're supposed to.
 */
const LEGACY_BASELINE_VERSION = 9;

/**
 * True if every column migrations 2..LEGACY_BASELINE_VERSION would add is
 * ALREADY present — i.e. this is a legacy database that a pre-migration-
 * runner version of sqlite.ts already fully provisioned inline, and
 * `user_version` is only 0 because that tracking didn't exist yet. A fresh
 * (brand new, no tables yet) database naturally fails this check via the
 * table-existence probe, so it falls through to the normal migration loop.
 */
function isLegacyFullyProvisioned(db: DB): boolean {
  const hasTable = (name: string): boolean =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined;

  if (!hasTable("audit_log") || !hasTable("remediation_jobs") || !hasTable("shared_reports")) {
    return false;
  }
  return (
    hasColumn(db, "audit_log", "content_hash") &&
    hasColumn(db, "remediation_jobs", "input_audit_json") &&
    hasColumn(db, "remediation_jobs", "output_audit_json") &&
    hasColumn(db, "remediation_jobs", "verapdf_available") &&
    hasColumn(db, "remediation_jobs", "verapdf_passed") &&
    hasColumn(db, "remediation_jobs", "verapdf_summary_json") &&
    hasColumn(db, "remediation_jobs", "original_filename") &&
    hasColumn(db, "shared_reports", "content_hash")
  );
}

/**
 * Fast-forward-aware runner, parameterized on the migration list, the
 * legacy-detector, and the FIXED baseline version to fast-forward to — so
 * migrations.test.ts can pin the "fast-forward targets a fixed baseline
 * constant, never `migrations`'s current length/last entry" property
 * directly (inject a baseline that deliberately differs from the injected
 * list's length) rather than only being able to observe it indirectly
 * through however many real migrations happen to exist today.
 * runMigrations() below is the real, production-facing entry point that
 * calls this with the actual MIGRATIONS/LEGACY_BASELINE_VERSION/
 * isLegacyFullyProvisioned.
 */
export function runMigrationsWith(
  db: DB,
  migrations: Migration[],
  legacyBaselineVersion: number,
  isLegacyFullyProvisionedFn: (db: DB) => boolean,
): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;

  if (currentVersion === 0 && isLegacyFullyProvisionedFn(db)) {
    db.pragma(`user_version = ${legacyBaselineVersion}`);
    runMigrationList(db, migrations, legacyBaselineVersion);
    return;
  }

  runMigrationList(db, migrations, currentVersion);
}

/**
 * Run every migration with `version > current user_version`, in order, each
 * inside its own transaction — committing the schema change and the
 * `user_version` bump atomically, so a crash mid-migration can always
 * safely resume from the last COMPLETED migration on next boot.
 *
 * Safe to call on every process start (fresh DB, partially-migrated DB, a
 * DB already fully migrated — a no-op — or a legacy pre-migration-runner
 * DB, which fast-forwards per `isLegacyFullyProvisioned` above without
 * re-running any ALTER).
 */
export function runMigrations(db: DB): void {
  runMigrationsWith(db, MIGRATIONS, LEGACY_BASELINE_VERSION, isLegacyFullyProvisioned);
}

/**
 * Core version-selection algorithm, factored out of runMigrations() so it
 * can be unit-tested directly against a small fake migration list (see
 * migrations.test.ts) independent of the real production schema above.
 * Runs every migration in `migrations` whose `version > fromVersion`, in
 * ascending order, each inside its own transaction.
 */
export function runMigrationList(db: DB, migrations: Migration[], fromVersion: number): void {
  for (const migration of migrations) {
    if (migration.version <= fromVersion) continue;
    const applyMigration = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    applyMigration();
  }
}

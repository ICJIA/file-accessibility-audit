import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const dbPath = process.env.DB_PATH || './data/audit.db'

// Ensure the data directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db: InstanceType<typeof Database> = new Database(dbPath)

// Enable WAL mode for concurrent reads during writes
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create tables idempotently
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
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_shared_reports_expires ON shared_reports(expires_at);

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
`)

// Backfill: add content_hash to audit_log if it doesn't exist yet.
// SQLite doesn't support `ADD COLUMN IF NOT EXISTS`, so we probe the
// schema first.
const auditLogColumns = db
  .prepare("PRAGMA table_info(audit_log)")
  .all() as { name: string }[]
if (!auditLogColumns.some((c) => c.name === 'content_hash')) {
  db.exec('ALTER TABLE audit_log ADD COLUMN content_hash TEXT')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_audit_content_hash ON audit_log(content_hash)',
  )
}

// Backfill: add input_audit_json / output_audit_json to remediation_jobs
// for the category-level before/after view on the result page. Created
// idempotently in case an earlier dev run already created the table.
const remediationJobsColumns = db
  .prepare("PRAGMA table_info(remediation_jobs)")
  .all() as { name: string }[]
if (
  remediationJobsColumns.length > 0 &&
  !remediationJobsColumns.some((c) => c.name === 'input_audit_json')
) {
  db.exec('ALTER TABLE remediation_jobs ADD COLUMN input_audit_json TEXT')
}
if (
  remediationJobsColumns.length > 0 &&
  !remediationJobsColumns.some((c) => c.name === 'output_audit_json')
) {
  db.exec('ALTER TABLE remediation_jobs ADD COLUMN output_audit_json TEXT')
}
if (
  remediationJobsColumns.length > 0 &&
  !remediationJobsColumns.some((c) => c.name === 'verapdf_available')
) {
  db.exec('ALTER TABLE remediation_jobs ADD COLUMN verapdf_available INTEGER')
}
if (
  remediationJobsColumns.length > 0 &&
  !remediationJobsColumns.some((c) => c.name === 'verapdf_passed')
) {
  db.exec('ALTER TABLE remediation_jobs ADD COLUMN verapdf_passed INTEGER')
}
if (
  remediationJobsColumns.length > 0 &&
  !remediationJobsColumns.some((c) => c.name === 'verapdf_summary_json')
) {
  db.exec('ALTER TABLE remediation_jobs ADD COLUMN verapdf_summary_json TEXT')
}

export default db

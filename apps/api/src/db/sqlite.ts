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
`)

export default db

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "./migrations.js";

const dbPath = process.env.DB_PATH || "./data/audit.db";

// Ensure the data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: InstanceType<typeof Database> = new Database(dbPath);

// Enable WAL mode for concurrent reads during writes
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Numbered migrations keyed on PRAGMA user_version (see migrations.ts for
// the full migration list and — critically — the legacy-database
// fast-forward that lets an already-provisioned production database adopt
// version tracking without re-running any ALTER TABLE ADD COLUMN).
runMigrations(db);

export default db;

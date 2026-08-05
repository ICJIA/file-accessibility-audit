// Nightly online backup of the SQLite database.
//
// Plain JavaScript on purpose: this runs from cron (Forge Scheduler), where
// the PATH is minimal — `node <this file>` is the whole toolchain, with
// better-sqlite3 resolved from apps/api/node_modules because the script
// lives inside apps/api. No tsx, no pnpm, no shell pipeline.
//
// Why not `cp`: the production DB runs in WAL mode. Copying the main file
// misses every committed row still sitting in audit.db-wal — a stale or
// torn snapshot that looks fine until the day it is restored. SQLite's
// online backup API (better-sqlite3 `db.backup()`) produces a consistent
// snapshot of the committed state, safe to run while the API is writing.
//
// Safety properties, each pinned by src/__tests__/backup.test.ts:
//   - refuses a missing source (fileMustExist) — never manufactures an
//     empty DB and "successfully" backs that up
//   - refuses a source without audit_log — backing up the wrong file is
//     an error, not a success
//   - verifies integrity_check on the snapshot before compressing it
//   - keeps only the newest N snapshots (default 5), deleting older ones;
//     rotation touches only its own `audit-*.db.gz` files, never foreign files
//   - writes last-backup.json (atomically) so staleness is observable
import Database from "better-sqlite3";
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  renameSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";

const SNAPSHOT_RE = /^audit-\d{4}-\d{2}-\d{2}T\d{6}\.db\.gz$/;
const DEFAULT_KEEP_COUNT = 5;

/** Default source: apps/api/data/audit.db, resolved from this file's
 *  location (never from cwd — a wrong cwd must not target a wrong DB). */
export function resolveDbPath() {
  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return process.env.DB_PATH
    ? resolve(apiDir, process.env.DB_PATH)
    : join(apiDir, "data", "audit.db");
}

function timestampName(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `audit-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.db.gz`
  );
}

/** Second-granular names collide when runs are seconds apart (or tests run
 *  twice in one second); bump the rendered time until the name is free. */
function freeSnapshotName(destDir, date) {
  let candidate = date;
  for (;;) {
    const name = timestampName(candidate);
    if (!existsSync(join(destDir, name))) return name;
    candidate = new Date(candidate.getTime() + 1000);
  }
}

/** Open a DB file read-only and return its audit_log row count, throwing on
 *  integrity failure or missing table. Used on both source and snapshot. */
function inspect(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error(`integrity_check failed for ${path}: ${JSON.stringify(integrity)}`);
    }
    // Throws "no such table: audit_log" for a foreign database — deliberate.
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM audit_log").get();
    return n;
  } finally {
    db.close();
  }
}

export async function runBackup({ dbPath, destDir, keepCount = DEFAULT_KEEP_COUNT }) {
  // Open the source before touching destDir: a missing source must fail
  // without leaving a backups directory behind.
  const src = new Database(dbPath, { readonly: true, fileMustExist: true });
  let rawPath;
  try {
    mkdirSync(destDir, { recursive: true });
    const name = freeSnapshotName(destDir, new Date());
    rawPath = join(destDir, name.replace(/\.gz$/, ""));
    await src.backup(rawPath);
  } finally {
    src.close();
  }

  let snapshotPath;
  let auditLogRows;
  try {
    auditLogRows = inspect(rawPath);
    snapshotPath = `${rawPath}.gz`;
    writeFileSync(snapshotPath, gzipSync(readFileSync(rawPath)));
  } finally {
    unlinkSync(rawPath);
  }
  const bytes = statSync(snapshotPath).size;

  // Count-based rotation: keep the newest `keepCount` snapshots, delete the
  // rest. Names sort chronologically (zero-padded timestamp), so ordering by
  // name is deterministic and immune to mtime drift. Never below 1 — the
  // snapshot just written must survive its own run.
  const keep = Math.max(1, Math.floor(keepCount));
  const snapshots = readdirSync(destDir)
    .filter((file) => SNAPSHOT_RE.test(file))
    .sort()
    .reverse();
  const rotated = [];
  for (const file of snapshots.slice(keep)) {
    unlinkSync(join(destDir, file));
    rotated.push(file);
  }

  const status = {
    finishedAt: new Date().toISOString(),
    sourcePath: dbPath,
    snapshotPath,
    bytes,
    auditLogRows,
    integrity: "ok",
    keepCount: keep,
    rotated,
  };
  const statusPath = join(destDir, "last-backup.json");
  writeFileSync(`${statusPath}.tmp`, JSON.stringify(status, null, 2) + "\n");
  renameSync(`${statusPath}.tmp`, statusPath);

  return { snapshotPath, bytes, auditLogRows, rotated };
}

/** Decompress a snapshot to a temp file and run the same inspection the
 *  backup ran — the restore drill's proof that a snapshot is restorable. */
export async function verifySnapshot(gzPath) {
  const raw = gunzipSync(readFileSync(gzPath));
  const tempPath = join(tmpdir(), `audit-verify-${process.pid}-${Date.now()}.db`);
  writeFileSync(tempPath, raw);
  try {
    return { ok: true, auditLogRows: inspect(tempPath) };
  } finally {
    unlinkSync(tempPath);
  }
}

function parseArgs(argv) {
  const args = { db: resolveDbPath(), dest: null, keep: DEFAULT_KEEP_COUNT, verify: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db") args.db = resolve(argv[++i]);
    else if (a === "--dest") args.dest = resolve(argv[++i]);
    else if (a === "--keep") args.keep = Number(argv[++i]);
    else if (a === "--verify") args.verify = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.verify) {
      const verdict = await verifySnapshot(args.verify);
      console.log(JSON.stringify({ action: "verify", file: args.verify, ...verdict }));
    } else {
      if (!args.dest) throw new Error("--dest <backup directory> is required");
      if (!Number.isInteger(args.keep) || args.keep < 1)
        throw new Error("--keep must be a positive whole number of snapshots to retain");
      const result = await runBackup({ dbPath: args.db, destDir: args.dest, keepCount: args.keep });
      console.log(JSON.stringify({ action: "backup", db: args.db, ...result }));
    }
  } catch (err) {
    console.error(`backup-db: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

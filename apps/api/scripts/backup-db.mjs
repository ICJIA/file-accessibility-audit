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
//   - never publishes a partial snapshot (2026-11-12): the gzip is written to
//     a `.partial` name, fsynced, read back and integrity-checked, and only
//     then renamed to its final `audit-*.db.gz` name. It used to be written
//     straight to the final name, so a full disk left a truncated file that
//     looked like a snapshot — and once space returned, rotation counted it
//     among "the newest five" and deleted a good older one to make room
//   - rotation counts only snapshots that still decompress cleanly: a damaged
//     file never takes a good snapshot's place among the kept ones, and is
//     named in last-backup.json (`unverified`). Rotation runs only after the
//     new snapshot has been verified — a failed backup deletes nothing
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
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";

const SNAPSHOT_RE = /^audit-\d{4}-\d{2}-\d{2}T\d{6}\.db\.gz$/;
/** SQLite's own sidecars of this script's temporary copies. The source runs
 *  in WAL mode and a copy inherits that, so merely OPENING a copy to inspect
 *  it creates `<copy>-wal` and `<copy>-shm` — and a read-only connection does
 *  not remove them on close. Before 2026-11-12 two of these were left in the
 *  backup directory by every run, for ever. */
const SIDECAR_RE = /^audit-\d{4}-\d{2}-\d{2}T\d{6}\.db(\.verify)?-(wal|shm)$/;
/** This script's other temporary files: the raw copy (`audit-….db`), its
 *  read-back (`….db.verify`) and the unpublished gzip (`….db.gz.partial`).
 *  A run that is killed outright (power loss, SIGKILL, the OOM killer) leaves
 *  them behind — the raw copy is the full size of the database. */
const TEMP_RE = /^audit-\d{4}-\d{2}-\d{2}T\d{6}\.db(\.verify|\.gz\.partial)?$/;
/** A leftover is only swept once it is this old. A backup takes seconds; an
 *  hour cannot be another run's file still being written. */
const STALE_TEMP_MS = 60 * 60 * 1000;
const DEFAULT_KEEP_COUNT = 5;

/** Remove a temporary database copy together with its -wal/-shm sidecars. */
function removeDbCopy(path) {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
}

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

/**
 * Pick a snapshot name nobody else has, and RESERVE it.
 *
 * Names are second-granular, so two runs in the same second (a deploy's
 * pre-restart snapshot racing the nightly job, tests) would otherwise choose
 * the same one and write over each other's files. The reservation is the
 * `<name>.partial` file, created with the exclusive flag — the filesystem
 * lets exactly one run create it. On a collision the rendered time is bumped
 * a second and tried again. The caller writes the gzip into that same
 * `.partial` and must remove it if the backup fails.
 */
function reserveSnapshotName(destDir, date) {
  let candidate = date;
  for (;;) {
    const name = timestampName(candidate);
    const taken =
      existsSync(join(destDir, name)) || existsSync(join(destDir, name.replace(/\.gz$/, "")));
    if (!taken) {
      try {
        closeSync(openSync(join(destDir, `${name}.partial`), "wx", 0o600));
        return name;
      } catch (err) {
        if (err?.code !== "EEXIST") throw err;
      }
    }
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

/** Write `data` to `path` and force it to disk before returning. A short
 *  write (ENOSPC) throws here, while the file still carries a name no reader
 *  or rotation pass mistakes for a snapshot. */
function writeFileDurably(path, data) {
  const fd = openSync(path, "w", 0o600);
  try {
    let offset = 0;
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** fsync a directory so a rename inside it survives a crash. Best effort:
 *  not every platform lets a directory be opened this way. */
function syncDir(dir) {
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // unsupported here — the rename itself is still atomic
  }
}

/** True when a `.gz` file decompresses completely (gzip carries a CRC-32 and
 *  a length trailer, so a truncated or damaged file fails here). */
function decompressesCleanly(gzPath) {
  try {
    gunzipSync(readFileSync(gzPath));
    return true;
  } catch {
    return false;
  }
}

export async function runBackup({ dbPath, destDir, keepCount = DEFAULT_KEEP_COUNT }) {
  // Open the source before touching destDir: a missing source must fail
  // without leaving a backups directory behind.
  const src = new Database(dbPath, { readonly: true, fileMustExist: true });
  let rawPath;
  try {
    mkdirSync(destDir, { recursive: true });
    const name = reserveSnapshotName(destDir, new Date());
    rawPath = join(destDir, name.replace(/\.gz$/, ""));
    await src.backup(rawPath);
  } catch (err) {
    // A copy that died half-way (disk full) must not be left behind, and
    // neither must the name reservation.
    if (rawPath) {
      removeDbCopy(rawPath);
      rmSync(`${rawPath}.gz.partial`, { force: true });
    }
    throw err;
  } finally {
    src.close();
  }

  // The snapshot earns its final name last. Everything before the rename
  // happens under `<name>.partial`, which SNAPSHOT_RE does not match: a
  // failure anywhere in here (disk full, a corrupt read-back) leaves nothing
  // that rotation, the restore drill or a person could mistake for a backup.
  const snapshotPath = `${rawPath}.gz`;
  const partialPath = `${snapshotPath}.partial`;
  let auditLogRows;
  try {
    auditLogRows = inspect(rawPath);
    writeFileDurably(partialPath, gzipSync(readFileSync(rawPath)));
    // Prove what is ON DISK, not what was in memory: decompress the written
    // file and run the same integrity + audit_log inspection restore-db.sh
    // runs before it trusts a snapshot. The raw copy goes first, so the
    // read-back needs no more disk than the backup always did.
    removeDbCopy(rawPath);
    const verifyPath = `${rawPath}.verify`;
    try {
      writeFileSync(verifyPath, gunzipSync(readFileSync(partialPath)));
      const rowsOnDisk = inspect(verifyPath);
      if (rowsOnDisk !== auditLogRows) {
        throw new Error(
          `snapshot read-back mismatch: ${rowsOnDisk} audit_log rows on disk, ${auditLogRows} expected`,
        );
      }
    } finally {
      removeDbCopy(verifyPath);
    }
    renameSync(partialPath, snapshotPath);
    syncDir(destDir);
  } catch (err) {
    rmSync(partialPath, { force: true });
    throw err;
  } finally {
    removeDbCopy(rawPath);
  }
  const bytes = statSync(snapshotPath).size;

  // Sweep what earlier runs left behind: SQLite sidecars (SIDECAR_RE) and the
  // temporary files of a run that was killed outright (TEMP_RE). Only files
  // older than STALE_TEMP_MS — a younger one may belong to another run that
  // is writing it right now. This run's own temporaries are already gone.
  const staleBefore = Date.now() - STALE_TEMP_MS;
  for (const file of readdirSync(destDir)) {
    if (!SIDECAR_RE.test(file) && !TEMP_RE.test(file)) continue;
    const full = join(destDir, file);
    try {
      if (statSync(full).mtimeMs < staleBefore) rmSync(full, { force: true });
    } catch {
      // vanished between the listing and the stat — someone else's cleanup
    }
  }

  // Count-based rotation: keep the newest `keepCount` VERIFIED snapshots and
  // delete everything older than the last of them. Names sort chronologically
  // (zero-padded timestamp), so ordering by name is deterministic and immune
  // to mtime drift. The snapshot just written is ALWAYS one of the kept ones,
  // wherever its name sorts: after a backwards clock step (or a same-second
  // name bump on another run) it can sort older than snapshots already
  // there, and rotation by name alone then deleted the file it had just
  // reported as the backup. Reached only when the new snapshot verified: every throw
  // above leaves the directory's existing snapshots exactly as they were.
  //
  // A file that matches the name but does not decompress (a truncated
  // leftover from before partial names existed, bit rot) is NOT one of the
  // kept snapshots: counting it would push a good snapshot out of the kept
  // set — the original defect. While it is newer than the oldest kept
  // snapshot it is left alone and reported; once `keepCount` good snapshots
  // are newer than it, it is deleted with everything else that old. If fewer
  // than `keepCount` good snapshots exist, nothing is deleted at all.
  const keep = Math.max(1, Math.floor(keepCount));
  const snapshots = readdirSync(destDir)
    .filter((file) => SNAPSHOT_RE.test(file))
    .sort()
    .reverse();
  const rotated = [];
  const unverified = [];
  let kept = 1; // the snapshot just written, verified above
  for (const file of snapshots) {
    const full = join(destDir, file);
    if (full === snapshotPath) continue;
    if (kept >= keep) {
      unlinkSync(full);
      rotated.push(file);
      continue;
    }
    if (decompressesCleanly(full)) kept++;
    else unverified.push(file);
  }
  if (unverified.length > 0) {
    console.error(
      `backup-db: WARNING — ${unverified.length} file(s) named like a snapshot do not decompress; they were not counted among the kept snapshots: ${unverified.join(", ")}`,
    );
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
    unverified,
  };
  const statusPath = join(destDir, "last-backup.json");
  writeFileSync(`${statusPath}.tmp`, JSON.stringify(status, null, 2) + "\n");
  renameSync(`${statusPath}.tmp`, statusPath);

  return { snapshotPath, bytes, auditLogRows, rotated, unverified };
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
    removeDbCopy(tempPath);
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

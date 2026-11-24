/**
 * The one directory short-lived temp copies of documents are written to.
 *
 * qpdf and veraPDF read from a file, so an uploaded document is written to
 * disk for the seconds the tool runs and deleted in a `finally`. That delete
 * never runs when the process is killed mid-audit, and the copies used to go
 * straight into the shared system temp directory, where nothing could tell
 * them from anyone else's files. They now go into a directory of their own —
 * owner-only (0700) — so the API can delete what a killed process left behind
 * (at startup and in its retention sweep) without touching anything else.
 *
 *   TMP_DIR set   → <TMP_DIR>/file-audit-tmp
 *   otherwise     → <os.tmpdir()>/file-audit-tmp
 *
 * The files themselves are still created 0600 by their writers.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AUDIT_TEMP_DIR_NAME = "file-audit-tmp";

/**
 * The names this code gives its temp copies: `<random UUID>.pdf`. The purge
 * helpers delete ONLY files of this shape, so pointing TMP_DIR at a directory
 * that holds other things can never cost those other things.
 */
export const AUDIT_TEMP_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

/** Where the directory is (or will be). Creates nothing. */
export function auditTempDirPath(): string {
  // Always our own subfolder — also when TMP_DIR is set. The shipped .env
  // examples set TMP_DIR=/tmp; using that directory itself would put the
  // copies in a folder every account on the machine can list, and the
  // data-retention policy says only the service's account can open it.
  return path.join(process.env.TMP_DIR || os.tmpdir(), AUDIT_TEMP_DIR_NAME);
}

/**
 * The temp directory, created (0700) if it does not exist yet. Called at each
 * write site, so a directory removed while the process runs comes back.
 *
 * Refuses a path that is not a real directory owned by this user: in a
 * world-writable parent (/tmp) another account could otherwise put a symlink
 * or its own directory there first and receive every document.
 */
export function auditTempDir(): string {
  const dir = auditTempDirPath();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // Not fatal here: the write that follows fails with the real reason.
  }
  // The folder is ours in every configuration, so it is always checked: a
  // folder of this name that someone else created could be read by them.
  let st: fs.Stats;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return dir; // as above — the write reports it
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!st.isDirectory() || (uid !== null && st.uid !== uid)) {
    throw new Error("temp directory is not a directory owned by this user");
  }
  return dir;
}

/**
 * Delete temp copies in `dir` last modified more than `olderThanMs` ago
 * (0 = all of them). Only `<uuid>.pdf` regular files are considered; a
 * missing directory is nothing to do. Never throws. Returns how many files
 * were deleted.
 */
export function purgeAuditTempFiles(
  olderThanMs: number,
  nowMs: number = Date.now(),
  dir: string = auditTempDirPath(),
): number {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let deleted = 0;
  for (const name of names) {
    if (!AUDIT_TEMP_FILE_PATTERN.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.lstatSync(file);
      if (!st.isFile()) continue;
      if (olderThanMs > 0 && nowMs - st.mtimeMs < olderThanMs) continue;
      fs.unlinkSync(file);
      deleted++;
    } catch {
      // gone already, or not ours to delete — the next sweep looks again
    }
  }
  return deleted;
}

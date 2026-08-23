/**
 * Daily activity export (v1.88.0): one CSV per complete local calendar day,
 * DERIVED from audit_log — never a second source of truth.
 *
 * Per run (spec § 2.4):
 *   cutoffDay       = local day containing (now − retention)
 *   lastCompleteDay = the day before the local date of (now − grace)
 *   for each day d, cutoffDay < d <= lastCompleteDay, with no file yet:
 *       write activity-d.csv from the rows whose LOCAL date is d
 *   prune every activity-YYYY-MM-DD.csv whose date <= cutoffDay
 *
 * Consequences, all deliberate: the first run after deploy materialises the
 * whole retention window from the rows still in the DB; a missed midnight
 * self-heals (the file's existence is the only state); a complete day's file
 * is never rewritten (delete it to regenerate); an empty day is a header-only
 * file; the boundary day is excluded, so a file exists only for days fully
 * inside the window the rows share; pruning deletes ONLY names this module
 * would have written. Writes are tmp + rename. Any failure throws — the
 * caller (the retention sweep) records it; nothing here falls back silently.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatActivityCsv, type ActivityRow } from "./activityCsv.js";
import {
  activityFileName,
  addDays,
  daysAfter,
  exportWindow,
  localDate,
  parseActivityFileName,
} from "./activityDays.js";
import { sqliteUtcToIso } from "./sqliteTime.js";

/** The slice of better-sqlite3's Database this module needs. */
export interface ActivityExportDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface ActivityExportOptions {
  db: ActivityExportDb;
  /** Absolute or cwd-relative directory; created 0700 if missing. */
  dir: string;
  nowMs: number;
  retentionDays: number;
  graceMinutes: number;
  timeZone: string;
}

export interface ActivityExportResult {
  written: number;
  pruned: number;
  /** The days written this run, ascending. */
  days: string[];
}

// A local day spans at most [d−1, d+2) in UTC for any zone; the filter below
// does the exact cut. created_at is "YYYY-MM-DD HH:MM:SS" (UTC), so string
// comparison against the same shape is chronological.
const SELECT_WINDOW = `
  SELECT id, created_at, event_type, filename, score, grade, content_hash, privileged, reason
    FROM audit_log
   WHERE created_at >= ? AND created_at < ?
   ORDER BY id`;

export function rowsForDay(db: ActivityExportDb, day: string, timeZone: string): ActivityRow[] {
  const from = `${addDays(day, -1)} 00:00:00`;
  const to = `${addDays(day, 2)} 00:00:00`;
  const rows = db.prepare(SELECT_WINDOW).all(from, to) as ActivityRow[];
  return rows.filter((r) => {
    const iso = sqliteUtcToIso(r.created_at);
    if (iso === null) return false;
    const ms = Date.parse(iso);
    return !Number.isNaN(ms) && localDate(ms, timeZone) === day;
  });
}

export function runActivityExport(opts: ActivityExportOptions): ActivityExportResult {
  const { cutoffDay, lastCompleteDay } = exportWindow(opts.nowMs, opts);
  mkdirSync(opts.dir, { recursive: true, mode: 0o700 });

  const days: string[] = [];
  for (const day of daysAfter(cutoffDay, lastCompleteDay)) {
    const final = join(opts.dir, activityFileName(day));
    if (existsSync(final)) continue;

    // A crashed run — this process's own earlier attempt, or another
    // process's (the API's sweep and an operator's hand-run
    // `pnpm tsx src/services/remediationCleanup.ts` can overlap) — can
    // leave a per-pid .tmp file for this day behind. Clean those up before
    // writing a fresh one so they never accumulate.
    const staleTmpPrefix = `${activityFileName(day)}.`;
    for (const name of readdirSync(opts.dir)) {
      if (name.startsWith(staleTmpPrefix) && name.endsWith(".tmp")) {
        rmSync(join(opts.dir, name), { force: true });
      }
    }

    const csv = formatActivityCsv(rowsForDay(opts.db, day, opts.timeZone), opts.timeZone);
    // Per-process name so two concurrent runs never share a tmp file — a
    // shared name could rename a partially written file into place, and a
    // complete day's file is never rewritten to recover from that.
    const tmp = `${final}.${process.pid}.tmp`;
    writeFileSync(tmp, csv, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, final);
    days.push(day);
  }

  let pruned = 0;
  for (const name of readdirSync(opts.dir)) {
    const day = parseActivityFileName(name);
    if (day !== null && day <= cutoffDay) {
      rmSync(join(opts.dir, name), { force: true });
      pruned++;
    }
  }

  return { written: days.length, pruned, days };
}

/**
 * Application error log (v1.88.0): logs/errors-YYYY-MM-DD.log.
 *
 * A TEE, not a logger. Every unexpected error the service knows about already
 * reaches console.error — the route catch blocks, the global handler's 5xx
 * path, the sweep's error list, the unhandledRejection / uncaughtException
 * hooks, engine failures — so wrapping console.error and console.warn once at
 * startup captures all of them with zero call-site changes and cannot miss a
 * new one. The original call runs first: PM2's stderr stream and `pm2 logs`
 * are unchanged; this file is the copy that is easy to find and outlives PM2's
 * rotation.
 *
 * Contracts (errorLog.test.ts):
 *   - entry = "<ISO UTC seconds> [error|warn] <util.format(args)>\n" — exactly
 *     what the terminal shows, an Error's stack included;
 *   - one file per LOCAL (DEPLOY.LOCAL_TIME_ZONE) day, 0600 in a 0700 dir;
 *   - a day's file stops at maxBytesPerDay after one notice line;
 *   - nothing here ever throws: a write failure notifies stderr once (via the
 *     ORIGINAL console.error, never the wrapper) and disables the tee for the
 *     rest of that day;
 *   - pruneErrorLogs deletes only `errors-YYYY-MM-DD.log` at/before the cutoff.
 *
 * Privacy: the file holds what stderr holds. The service writes no requester IP,
 * token, user agent or request body to stderr (third-party error text can name a
 * target server's address) (rateLimiter.test.ts, errorHandler.test.ts,
 * audit-url-page.test.ts pin the app-written lines).
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";
import { ACTIVITY_EXPORT } from "#config";
import { datedFileName, localDate, parseDatedFileName } from "./activityDays.js";

export type ErrorLogLevel = "error" | "warn";

export interface ErrorLogOptions {
  /** Directory for the files; created 0700 if missing. */
  dir: string;
  timeZone: string;
  maxBytesPerDay: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface ErrorLogTee {
  /** Restore console.error / console.warn. */
  uninstall(): void;
  /** The file entries go to right now. */
  currentFile(): string;
}

const LIMIT_NOTICE = "[error-log] daily size limit reached; further entries go to stderr only";

export function errorLogFileName(day: string): string {
  return datedFileName(ACTIVITY_EXPORT.ERROR_FILE_PREFIX, day, ".log");
}

export function parseErrorLogFileName(name: string): string | null {
  return parseDatedFileName(name, ACTIVITY_EXPORT.ERROR_FILE_PREFIX, ".log");
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatErrorLogEntry(level: ErrorLogLevel, args: unknown[], nowMs: number): string {
  return `${stamp(nowMs)} [${level}] ${format(...(args as [unknown, ...unknown[]]))}\n`;
}

export function installErrorLogTee(opts: ErrorLogOptions): ErrorLogTee {
  const now = opts.now ?? Date.now;
  const original = { error: console.error, warn: console.warn };
  let day = "";
  let bytes = 0;
  /** The local day on which the tee gave up (cap reached or write failed). */
  let offForDay = "";

  const fileFor = (d: string) => join(opts.dir, errorLogFileName(d));

  function rollover(d: string): void {
    day = d;
    try {
      bytes = statSync(fileFor(d)).size;
    } catch {
      bytes = 0;
    }
  }

  /** Append, never throw. On failure: one notice via the ORIGINAL console.error
   *  (the wrapper would recurse) and off for the rest of the day. */
  function append(d: string, text: string): boolean {
    try {
      mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
      appendFileSync(fileFor(d), text, { encoding: "utf8", mode: 0o600 });
      bytes += Buffer.byteLength(text);
      return true;
    } catch (e) {
      offForDay = d;
      original.error(
        `[error-log] cannot write ${fileFor(d)}: ${(e as Error).message} — stderr only for the rest of the day`,
      );
      return false;
    }
  }

  function tee(level: ErrorLogLevel, args: unknown[]): void {
    try {
      const ms = now();
      const d = localDate(ms, opts.timeZone);
      if (d !== day) rollover(d);
      if (offForDay === d) return;
      const entry = formatErrorLogEntry(level, args, ms);
      if (bytes + Buffer.byteLength(entry) > opts.maxBytesPerDay) {
        append(d, `${stamp(ms)} ${LIMIT_NOTICE}\n`);
        offForDay = d;
        return;
      }
      append(d, entry);
    } catch {
      // The original console call has already run; a tee failure is never a
      // caller's problem.
    }
  }

  console.error = (...args: unknown[]) => {
    original.error(...args);
    tee("error", args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    tee("warn", args);
  };

  return {
    uninstall() {
      console.error = original.error;
      console.warn = original.warn;
    },
    currentFile() {
      return fileFor(day || localDate(now(), opts.timeZone));
    },
  };
}

/** Delete `errors-YYYY-MM-DD.log` files dated at or before the cutoff day.
 *  Touches nothing else; a missing directory is simply nothing to prune. */
export function pruneErrorLogs(
  dir: string,
  nowMs: number,
  retentionDays: number,
  timeZone: string,
): number {
  const cutoffDay = localDate(nowMs - retentionDays * 86_400_000, timeZone);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let pruned = 0;
  for (const name of names) {
    const d = parseErrorLogFileName(name);
    if (d !== null && d <= cutoffDay) {
      rmSync(join(dir, name), { force: true });
      pruned++;
    }
  }
  return pruned;
}

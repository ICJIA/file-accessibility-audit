/**
 * The application error log (v1.88.0): a tee of console.error/console.warn into
 * logs/errors-YYYY-MM-DD.log so a fault can be diagnosed from the same directory
 * the activity files live in. The original console call must still run (PM2's
 * stream is unchanged), nothing here may ever throw, a day's file is size-capped,
 * and pruning touches only the files this module writes.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  errorLogFileName,
  formatErrorLogEntry,
  installErrorLogTee,
  parseErrorLogFileName,
  pruneErrorLogs,
  type ErrorLogTee,
} from "../services/errorLog.js";

const TZ = "America/Chicago";
const T_AUG19 = Date.UTC(2026, 7, 19, 14, 3, 22); // 09:03:22 CDT Aug 19
let dir = "";
let tee: ErrorLogTee | null = null;
const realError = console.error;
const realWarn = console.warn;

afterEach(() => {
  tee?.uninstall();
  tee = null;
  console.error = realError;
  console.warn = realWarn;
  if (dir) rmSync(join(dir, ".."), { recursive: true, force: true });
  dir = "";
});

function fresh(opts: { now?: () => number; maxBytesPerDay?: number } = {}) {
  dir = join(mkdtempSync(join(tmpdir(), "error-log-")), "logs");
  const calls: unknown[][] = [];
  console.error = (...a: unknown[]) => {
    calls.push(["error", ...a]);
  };
  console.warn = (...a: unknown[]) => {
    calls.push(["warn", ...a]);
  };
  tee = installErrorLogTee({
    dir,
    timeZone: TZ,
    maxBytesPerDay: opts.maxBytesPerDay ?? 50 * 1024 * 1024,
    now: opts.now ?? (() => T_AUG19),
  });
  return { calls };
}

describe("file names", () => {
  it("encode and parse errors-YYYY-MM-DD.log and nothing else", () => {
    expect(errorLogFileName("2026-08-19")).toBe("errors-2026-08-19.log");
    expect(parseErrorLogFileName("errors-2026-08-19.log")).toBe("2026-08-19");
    expect(parseErrorLogFileName("errors-2026-08-19.log.gz")).toBeNull();
    expect(parseErrorLogFileName("activity-2026-08-19.csv")).toBeNull();
  });
});

describe("formatErrorLogEntry", () => {
  it("prefixes the UTC timestamp and level and prints an Error's stack like the console does", () => {
    const entry = formatErrorLogEntry("error", ["audit-url error:", new Error("boom")], T_AUG19);
    expect(
      entry.startsWith("2026-08-19T14:03:22Z [error] audit-url error: Error: boom\n    at "),
    ).toBe(true);
    expect(entry.endsWith("\n")).toBe(true);
    expect(formatErrorLogEntry("warn", ["[rate-limit] 429 limiter=%s", "global"], T_AUG19)).toBe(
      "2026-08-19T14:03:22Z [warn] [rate-limit] 429 limiter=global\n",
    );
  });
});

describe("installErrorLogTee", () => {
  it("tees error and warn into the day's file and still calls the original console", () => {
    const { calls } = fresh();
    console.error("Analysis error:", new Error("PDF parsing failed"));
    console.warn("[api] 413 LIMIT_FILE_SIZE POST /api/analyze");
    const text = readFileSync(join(dir, "errors-2026-08-19.log"), "utf8");
    expect(text).toContain(
      "2026-08-19T14:03:22Z [error] Analysis error: Error: PDF parsing failed\n    at ",
    );
    expect(text).toContain(
      "2026-08-19T14:03:22Z [warn] [api] 413 LIMIT_FILE_SIZE POST /api/analyze\n",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("error");
    expect(calls[1][0]).toBe("warn");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "errors-2026-08-19.log")).mode & 0o777).toBe(0o600);
  });

  it("opens a new file when the LOCAL day changes", () => {
    let now = Date.UTC(2026, 7, 20, 4, 59, 59); // 23:59:59 CDT Aug 19
    fresh({ now: () => now });
    console.error("late");
    now = Date.UTC(2026, 7, 20, 5, 0, 0); // 00:00:00 CDT Aug 20
    console.error("early");
    expect(readFileSync(join(dir, "errors-2026-08-19.log"), "utf8")).toContain("[error] late");
    expect(readFileSync(join(dir, "errors-2026-08-20.log"), "utf8")).toContain("[error] early");
    expect(tee!.currentFile()).toBe(join(dir, "errors-2026-08-20.log"));
  });

  it("stops at the per-day byte cap after one notice, and resumes the next day", () => {
    let now = T_AUG19;
    const { calls } = fresh({ now: () => now, maxBytesPerDay: 60 });
    console.error("one");
    console.error("two");
    console.error("three");
    const text = readFileSync(join(dir, "errors-2026-08-19.log"), "utf8");
    expect(text).toContain("[error] one");
    expect(text).toContain(
      "[error-log] daily size limit reached; further entries go to stderr only",
    );
    expect(text).not.toContain("[error] three");
    expect(text).not.toContain("[error] two");
    expect(calls).toHaveLength(3); // stderr still got every call
    now = Date.UTC(2026, 7, 20, 12, 0, 0);
    console.error("next day");
    expect(readFileSync(join(dir, "errors-2026-08-20.log"), "utf8")).toContain("[error] next day");
  });

  it("never throws when the directory cannot be written — it notifies stderr once and stays off for the day", () => {
    const { calls } = fresh();
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, "a file where the directory should be");
    expect(() => console.error("first")).not.toThrow();
    expect(() => console.error("second")).not.toThrow();
    const notices = calls.filter((c) => String(c[1]).startsWith("[error-log] cannot write"));
    expect(notices).toHaveLength(1);
    expect(calls.filter((c) => c[1] === "first" || c[1] === "second")).toHaveLength(2);
  });

  it("uninstall restores the console", () => {
    fresh();
    const wrapped = console.error;
    tee!.uninstall();
    expect(console.error).not.toBe(wrapped);
    console.error("after");
    expect(existsSync(join(dir, "errors-2026-08-19.log"))).toBe(false);
    tee = null;
  });
});

describe("pruneErrorLogs", () => {
  it("deletes only errors-*.log dated at or before the cutoff day", () => {
    dir = join(mkdtempSync(join(tmpdir(), "error-log-prune-")), "logs");
    rmSync(dir, { recursive: true, force: true });
    expect(pruneErrorLogs(dir, T_AUG19, 30, TZ)).toBe(0); // missing dir is fine
    mkdirSync(dir, { recursive: true });
    const mk = (name: string) => writeFileSync(join(dir, name), "x");
    mk("errors-2026-07-19.log"); // 31 days before Aug 19 → pruned
    mk("errors-2026-07-20.log"); // cutoff day itself → pruned
    mk("errors-2026-07-21.log"); // inside the window → kept
    mk("activity-2026-07-01.csv"); // another module's file → untouched
    mk("errors-2026-07-19.log.gz"); // not our shape → untouched
    expect(pruneErrorLogs(dir, T_AUG19, 30, TZ)).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      "activity-2026-07-01.csv",
      "errors-2026-07-19.log.gz",
      "errors-2026-07-21.log",
    ]);
  });
});

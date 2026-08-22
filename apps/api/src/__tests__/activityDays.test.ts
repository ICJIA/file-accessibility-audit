/**
 * Calendar arithmetic for the daily activity export. A row belongs to the
 * file for the LOCAL (America/Chicago) date of its UTC timestamp; DST is
 * handled by Intl, not by offset math. Day strings are "YYYY-MM-DD", so
 * string comparison is chronological.
 */
import { describe, it, expect } from "vitest";
import {
  activityFileName,
  addDays,
  datedFileName,
  dayBefore,
  daysAfter,
  exportWindow,
  localDate,
  localStamp,
  parseActivityFileName,
  parseDatedFileName,
} from "../services/activityDays.js";

const TZ = "America/Chicago";

describe("localDate / localStamp", () => {
  it("cuts days at LOCAL midnight, in summer (UTC-5) and winter (UTC-6)", () => {
    expect(localDate(Date.UTC(2026, 7, 20, 4, 59, 59), TZ)).toBe("2026-08-19"); // 23:59:59 CDT
    expect(localDate(Date.UTC(2026, 7, 20, 5, 0, 0), TZ)).toBe("2026-08-20"); // 00:00:00 CDT
    expect(localDate(Date.UTC(2026, 0, 16, 5, 59, 59), TZ)).toBe("2026-01-15"); // 23:59:59 CST
    expect(localDate(Date.UTC(2026, 0, 16, 6, 0, 0), TZ)).toBe("2026-01-16"); // 00:00:00 CST
  });

  it("renders a sortable 24-hour local stamp with the zone abbreviation", () => {
    expect(localStamp(Date.UTC(2026, 7, 19, 14, 3, 22), TZ)).toBe("2026-08-19 09:03:22 CDT");
    expect(localStamp(Date.UTC(2026, 0, 15, 18, 0, 0), TZ)).toBe("2026-01-15 12:00:00 CST");
    expect(localStamp(Date.UTC(2026, 7, 20, 5, 0, 0), TZ)).toBe("2026-08-20 00:00:00 CDT");
  });

  it("follows the 2026 DST transitions", () => {
    // Spring forward: 2026-03-08 02:00 CST → 03:00 CDT
    expect(localStamp(Date.UTC(2026, 2, 8, 7, 59, 59), TZ)).toBe("2026-03-08 01:59:59 CST");
    expect(localStamp(Date.UTC(2026, 2, 8, 8, 0, 0), TZ)).toBe("2026-03-08 03:00:00 CDT");
    // Fall back: 2026-11-01 — 01:30 happens twice
    expect(localStamp(Date.UTC(2026, 10, 1, 6, 30, 0), TZ)).toBe("2026-11-01 01:30:00 CDT");
    expect(localStamp(Date.UTC(2026, 10, 1, 7, 30, 0), TZ)).toBe("2026-11-01 01:30:00 CST");
    expect(localDate(Date.UTC(2026, 10, 1, 7, 30, 0), TZ)).toBe("2026-11-01");
  });

  it("an unknown zone throws instead of silently falling back to UTC", () => {
    expect(() => localDate(0, "Not/AZone")).toThrow();
  });
});

describe("day arithmetic", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
  it("daysAfter is exclusive at the start, inclusive at the end, ascending", () => {
    expect(daysAfter("2026-08-01", "2026-08-03")).toEqual(["2026-08-02", "2026-08-03"]);
    expect(daysAfter("2026-08-03", "2026-08-03")).toEqual([]);
    expect(daysAfter("2026-08-05", "2026-08-03")).toEqual([]);
  });
  it("rejects a string that is not a calendar day", () => {
    expect(() => addDays("2026-8-1", 1)).toThrow();
  });
});

describe("exportWindow", () => {
  const opts = { retentionDays: 365, graceMinutes: 5, timeZone: TZ };
  it("the previous local day becomes complete only after the grace period", () => {
    // 2026-08-22 00:03 CDT — inside the grace window: Aug 21 is not complete yet.
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 3, 0), opts).lastCompleteDay).toBe("2026-08-20");
    // 2026-08-22 00:06 CDT — Aug 21 is complete.
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), opts).lastCompleteDay).toBe("2026-08-21");
  });
  it("the cutoff day is the local day containing (now − retention)", () => {
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), opts).cutoffDay).toBe("2025-08-22");
    expect(
      exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), { ...opts, retentionDays: 3 }).cutoffDay,
    ).toBe("2026-08-19");
  });
});

describe("file names", () => {
  it("encodes and parses the activity-YYYY-MM-DD.csv shape, and nothing else", () => {
    expect(activityFileName("2026-08-19")).toBe("activity-2026-08-19.csv");
    expect(parseActivityFileName("activity-2026-08-19.csv")).toBe("2026-08-19");
    expect(parseActivityFileName("activity-2026-08-19.csv.tmp")).toBeNull();
    expect(parseActivityFileName("activity-2026-02-30.csv")).toBeNull();
    expect(parseActivityFileName("notes.txt")).toBeNull();
    expect(parseActivityFileName("activity-2026-08-19.CSV")).toBeNull();
    expect(parseActivityFileName("old-activity-2026-08-19.csv")).toBeNull();
  });
  it("the generic codec serves any prefix/extension pair (the error log uses errors-*.log)", () => {
    expect(datedFileName("errors-", "2026-08-19", ".log")).toBe("errors-2026-08-19.log");
    expect(parseDatedFileName("errors-2026-08-19.log", "errors-", ".log")).toBe("2026-08-19");
    expect(parseDatedFileName("errors-2026-08-19.log", "activity-", ".csv")).toBeNull();
    expect(parseDatedFileName("errors-2026-08-19.log.1", "errors-", ".log")).toBeNull();
    expect(parseDatedFileName("errors-2026-13-01.log", "errors-", ".log")).toBeNull();
  });
});

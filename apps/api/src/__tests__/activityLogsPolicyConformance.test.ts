/**
 * "Verify that the logs abide by the data retention policy" (user, 2026-08-22):
 * the policy page is prose, the code is constants, and the two drift silently.
 * This reads the policy's own section sources (as the web suite's
 * backupsExplained.test.ts does) and pins them to the constants the sweep and
 * the writers actually use. A retention change in either place fails here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ACTIVITY_EXPORT, SHARED_REPORTS } from "#config";
import { AUDIT_FAILURE_REASONS } from "../services/auditFailure.js";

const SECTIONS = resolve(__dirname, "../../../web/app/components/dataRetention");
const read = (f: string) => readFileSync(resolve(SECTIONS, f), "utf8");
const visible = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  expect(i, `marker "${start}"`).toBeGreaterThan(-1);
  const j = text.indexOf(end, i + start.length);
  expect(j, `end marker "${end}"`).toBeGreaterThan(-1);
  return text.slice(i, j);
};

const s07 = read("Section07RetentionTable.vue");
const s08 = read("Section08Stored.vue");

describe("the data-retention policy states what the code enforces", () => {
  it("§ 7: the activity files' window is the usage log's constant", () => {
    const row = visible(between(s07, "Daily activity files", "</tr>"));
    expect(row).toContain(`${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`);
    expect(row).toContain("SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS");
    expect(visible(between(s07, "Usage log", "</tr>"))).toContain(
      `${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`,
    );
  });
  it("§ 7: the error log's window is the config constant", () => {
    const row = visible(between(s07, "Application error log", "</tr>"));
    expect(row).toContain(`${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS} days`);
    expect(row).toContain("ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS");
    expect(visible(s07)).toContain(`${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS}-day window`);
  });
  it("§ 7 and § 8 name the directory the code writes to", () => {
    for (const marker of ["Daily activity files", "Application error log"]) {
      expect(visible(between(s07, marker, "</tr>"))).toContain(`${ACTIVITY_EXPORT.DIR_NAME}/`);
      expect(visible(between(s08, marker, "</li>"))).toContain(`${ACTIVITY_EXPORT.DIR_NAME}/`);
    }
  });
  it("§ 8 lists exactly the closed reason set the writer accepts", () => {
    const bullet = visible(between(s08, "For a failed audit", "</li>"));
    for (const r of AUDIT_FAILURE_REASONS) expect(bullet).toContain(r);
    const listed = bullet
      .match(/[a-z]+(?:-[a-z]+)*/g)!
      .filter((w) => (AUDIT_FAILURE_REASONS as readonly string[]).includes(w));
    expect(new Set(listed).size).toBe(AUDIT_FAILURE_REASONS.length);
  });
  it("§ 8 lists 30 days for the error log and 365 for the activity files, as the code does", () => {
    expect(visible(between(s08, "Application error log", "</li>"))).toContain(
      `Kept ${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS} days`,
    );
    expect(visible(between(s08, "Daily activity files", "</li>"))).toContain(
      `Deleted after ${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`,
    );
  });
});

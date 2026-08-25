/**
 * Policy v1.12 (tool v1.88.0): failed audits are recorded with a one-word
 * reason, and a daily activity CSV derived from the usage log lives on the
 * server for the same 365 days. Like backupsExplained.test.ts this reads the
 * section sources — the page cannot be mounted under plain vitest — and
 * pins the claims a reader relies on, plus the overclaim guard on the NEW
 * copy only (older copy is covered elsewhere).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), "utf8");
const visible = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** The text between two markers, so assertions land on the new copy only. */
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  expect(i, `marker "${start}"`).toBeGreaterThan(-1);
  const j = text.indexOf(end, i + start.length);
  expect(j, `end marker "${end}"`).toBeGreaterThan(-1);
  return text.slice(i, j);
};

const s07 = read("app/components/dataRetention/Section07RetentionTable.vue");
const s08 = read("app/components/dataRetention/Section08Stored.vue");
const s08a = read("app/components/dataRetention/Section08aStorageVerification.vue");
const s14 = read("app/components/dataRetention/Section14ChangeLog.vue");

const REASONS = ["unreadable", "timeout", "fetch-failed", "navigation-failed", "internal"];

describe("data-retention policy v1.12: failed audits + daily activity files", () => {
  it("§ 7 lists the activity files: usage-log window, on-server, outside backups, one setting", () => {
    const row = visible(between(s07, "Daily activity files", "</tr>"));
    expect(row).toMatch(/logs\/ at the application's root/);
    expect(row).toMatch(/365 days — the usage log's window/);
    expect(row).toMatch(/not part of the nightly backup/);
    expect(row).toMatch(/SHARED_REPORTS\.AUDIT_LOG_RETENTION_DAYS \(shared with the usage log/);
  });

  it("§ 7's usage-log row and the sweep paragraph include failed audits and the export step", () => {
    const t = visible(s07);
    expect(t).toMatch(/Usage log — audits, failed audits, and refused-upload attempts/);
    expect(t).toMatch(/eight tasks/);
    expect(t).toMatch(/write the previous day's activity file/);
    expect(t).not.toMatch(/seven tasks/);
  });

  it("§ 8 says what a failed-audit row holds — the closed reason set, never error text — and describes the files", () => {
    const failed = visible(between(s08, "For a failed audit", "</li>"));
    for (const r of REASONS) expect(failed).toContain(r);
    expect(failed).toMatch(/never the error text/);
    expect(failed).toMatch(/no score, no grade, no content hash/);
    const files = visible(between(s08, "Daily activity files", "</li>"));
    expect(files).toMatch(/same fields/);
    expect(files).toMatch(/file name is the one field that can carry personal information/);
    expect(files).toMatch(/Deleted after 365 days/);
    expect(files).toMatch(/not downloadable/);
  });

  it("§ 8a shows the migration-13 schema with the reason column", () => {
    expect(s08a).toContain("shape after migration 13");
    expect(s08a).not.toContain("shape after migration 12");
    expect(s08a).toMatch(/reason TEXT/);
    expect(visible(s08a)).toMatch(/one-word reason code/);
    expect(visible(s08a)).toMatch(/migration 13's reason code/);
  });

  it("§ 14 keeps the v1.12 entry — history is append-only", () => {
    // The header constant has moved on (dataRetentionVersion.test.ts holds it
    // to the NEWEST § 14 entry); this test owns the v1.12 entry itself.
    expect(s14).toMatch(/<strong>v1\.12 · 2026-08-22<\/strong>/);
    const entry = visible(between(s14, "v1.12 · 2026-08-22", "</li>"));
    expect(entry).toMatch(/no change to any retention period/i);
    expect(entry).toMatch(/not part of the nightly backup/);
  });

  it("§ 7 and § 8 describe the application error log: what it holds, 30 days, not backed up, never served", () => {
    const row = visible(between(s07, "Application error log", "</tr>"));
    expect(row).toMatch(/error message and stack trace/);
    expect(row).toMatch(/30 days/);
    expect(row).toMatch(/ACTIVITY_EXPORT\.ERROR_LOG_RETENTION_DAYS/);
    expect(row).toMatch(/not part of the nightly backup; never served/);
    const bullet = visible(between(s08, "Application error log", "</li>"));
    expect(bullet).toMatch(
      /never writes the address of the person making the request, their browser identifier, or a token/,
    );
    expect(bullet).toMatch(/Kept 30 days/);
    expect(visible(between(s14, "v1.12 · 2026-08-22", "</li>"))).toMatch(/Application error log/);
    expect(visible(s07)).toMatch(/error-log files past their 30-day window/);
  });

  it("the new copy never overclaims", () => {
    const fresh = [
      between(s07, "Daily activity files", "</tr>"),
      between(s07, "Application error log", "</tr>"),
      between(s08, "For a failed audit", "</li>"),
      between(s08, "Daily activity files", "</li>"),
      between(s08, "Application error log", "</li>"),
      between(s14, "v1.12 · 2026-08-22", "</li>"),
    ].map(visible);
    for (const t of fresh) {
      expect(t).not.toMatch(/no personal (data|information|details)/i);
      expect(t).not.toMatch(/(contains|holds) no PII/i);
      expect(t).not.toMatch(/anonymous|anonymi[sz]ed/i);
      expect(t).not.toMatch(/\bstrong\b/i);
    }
  });
});

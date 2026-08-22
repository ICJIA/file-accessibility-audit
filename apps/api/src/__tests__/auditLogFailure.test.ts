/**
 * recordAuditFailure (v1.88.0): a failed audit leaves a `<type>-failed` row —
 * the same fields as a successful audit, score/grade/content_hash NULL, and a
 * one-word reason. Exercised against a REAL migrated ":memory:" database via
 * the same singleton mock auditLogTier.test.ts uses, so the actual INSERT runs.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db/sqlite.js", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { runMigrations } = await import("../db/migrations.js");
  const db = new Database(":memory:");
  runMigrations(db);
  return { default: db };
});

const db = (await import("../db/sqlite.js")).default as unknown as {
  prepare: (sql: string) => { get: (...a: unknown[]) => unknown };
  exec: (sql: string) => void;
};
const { STATUS } = await import("#config");
const { recordAudit, recordAuditFailure, recordRejectedUpload } =
  await import("../services/auditLog.js");

interface Row {
  event_type: string;
  filename: string;
  score: number | null;
  grade: string | null;
  content_hash: string | null;
  privileged: number | null;
  reason: string | null;
}

function rowFor(filename: string): Row {
  return db
    .prepare(
      `SELECT event_type, filename, score, grade, content_hash, privileged, reason
         FROM audit_log WHERE filename = ?`,
    )
    .get(filename) as Row;
}

describe("recordAuditFailure", () => {
  it("writes <base>-failed with NULL score/grade/hash, the tier and the reason", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: true,
      filename: "broken.pdf",
      reason: "unreadable",
    });
    expect(rowFor("broken.pdf")).toEqual({
      event_type: "analyze-failed",
      filename: "broken.pdf",
      score: null,
      grade: null,
      content_hash: null,
      privileged: 1,
      reason: "unreadable",
    });
  });

  it("every FailureEventBase lands in STATUS.FAILURE_EVENT_TYPES", () => {
    const bases = [
      "analyze",
      "analyze-url",
      "audit-url",
      "audit-url-page",
      "bulk-from-inventory",
    ] as const;
    for (const base of bases) {
      recordAuditFailure({
        eventType: base,
        privileged: false,
        filename: `f-${base}`,
        reason: "internal",
      });
      expect(STATUS.FAILURE_EVENT_TYPES as readonly string[]).toContain(
        rowFor(`f-${base}`).event_type,
      );
    }
  });

  it("sanitises a FILE name (basename, one line, allowed characters) like the other writers", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: false,
      filename: "../../tmp/evil\nname<b>.pdf",
      reason: "internal",
    });
    const stored = db
      .prepare(
        `SELECT filename FROM audit_log WHERE event_type = 'analyze-failed' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { filename: string };
    expect(stored.filename).not.toContain("/");
    expect(stored.filename).not.toContain("\n");
    expect(stored.filename).not.toContain("<");
  });

  it("keeps a URL intact for the URL-bearing events (only newlines collapse, length clamps)", () => {
    const url = "https://example.gov/files/a%20b.pdf?x=1";
    recordAuditFailure({
      eventType: "audit-url-page",
      privileged: false,
      filename: url,
      reason: "navigation-failed",
    });
    expect(rowFor(url).event_type).toBe("audit-url-page-failed");

    const long = "https://example.gov/" + "a".repeat(600);
    recordAuditFailure({
      eventType: "audit-url",
      privileged: false,
      filename: long,
      reason: "fetch-failed",
    });
    const stored = db
      .prepare(
        `SELECT filename FROM audit_log WHERE event_type = 'audit-url-failed' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { filename: string };
    expect(stored.filename.length).toBe(512);

    recordAuditFailure({
      eventType: "analyze-url",
      privileged: false,
      filename: "https://x.gov/a\nb.pdf",
      reason: "timeout",
    });
    expect(rowFor("https://x.gov/a b.pdf").event_type).toBe("analyze-url-failed");
  });

  it("a reason outside the closed set is stored as 'internal', never as given", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: false,
      filename: "odd.pdf",
      reason: "<script>alert(1)</script>" as unknown as "internal",
    });
    expect(rowFor("odd.pdf").reason).toBe("internal");
  });

  it("recordAudit and recordRejectedUpload leave reason NULL", () => {
    recordAudit({
      eventType: "analyze",
      filename: "ok.pdf",
      score: 90,
      grade: "A",
      privileged: false,
    });
    recordRejectedUpload({ filename: "refused.csv", privileged: false });
    expect(rowFor("ok.pdf").reason).toBeNull();
    expect(rowFor("refused.csv").reason).toBeNull();
  });

  it("never throws when the insert fails — the HTTP response must not change", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.exec("DROP TABLE audit_log");
    expect(() =>
      recordAuditFailure({
        eventType: "analyze",
        privileged: false,
        filename: "x.pdf",
        reason: "internal",
      }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

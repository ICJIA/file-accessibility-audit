/**
 * The write half of the privileged-tier metric: recordAudit must persist which
 * rate-limit tier an audit came through, so /status can count privileged usage.
 *
 * This exercises the REAL recordAudit against a REAL (in-memory, migrated)
 * SQLite database — the singleton is mocked to a migrated ":memory:" instance,
 * so the actual INSERT runs and we read the stored value back. Asserting on a
 * genuine round-trip, not on a spy.
 */
import { describe, it, expect, vi } from "vitest";

// Replace the DB singleton with a real migrated in-memory database. The async
// factory may use dynamic import; recordAudit binds its prepared INSERT to
// whatever this returns, and the test imports the same instance to read back.
vi.mock("../db/sqlite.js", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { runMigrations } = await import("../db/migrations.js");
  const db = new Database(":memory:");
  runMigrations(db);
  return { default: db };
});

const db = (await import("../db/sqlite.js")).default as unknown as {
  prepare: (sql: string) => { get: (...a: unknown[]) => unknown };
};
const { recordAudit, recordRejectedUpload } = await import("../services/auditLog.js");

function tierOf(filename: string): unknown {
  return (
    db.prepare(`SELECT privileged FROM audit_log WHERE filename = ?`).get(filename) as {
      privileged: unknown;
    }
  ).privileged;
}

describe("recordAudit persists the request tier", () => {
  it("stores privileged = 1 for a trusted-tool audit", () => {
    recordAudit({
      eventType: "audit-url",
      filename: "fleet.pdf",
      score: 90,
      grade: "A",
      privileged: true,
    });
    expect(tierOf("fleet.pdf")).toBe(1);
  });

  it("stores privileged = 0 for a public audit", () => {
    recordAudit({
      eventType: "analyze",
      filename: "public.pdf",
      score: 90,
      grade: "A",
      privileged: false,
    });
    expect(tierOf("public.pdf")).toBe(0);
  });

  it("carries the tier through a refused upload too", () => {
    recordRejectedUpload({ filename: "refused.csv", privileged: false });
    expect(tierOf("refused.csv")).toBe(0);
  });
});

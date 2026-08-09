/**
 * GET /api/reports/:id against a REAL migrated database.
 *
 * Regression: v1.68.0's migration 11 dropped shared_reports.email, but this
 * route's SELECT still named the column — better-sqlite3 threw "no such
 * column" on prepare, the catch-all returned 500, and EVERY shared-report
 * link (including the fleet's stable reportUrls) broke in production while
 * the rest of the suite stayed green, because no test exercised this route
 * on the migrated schema. This file closes that hole with the same
 * isolated-DB_PATH + extractHandler pattern remediateAuthz.test.ts uses.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "reports-route-test-"));
process.env.DB_PATH = join(tmpDir, "audit.db");

let db: (typeof import("../db/sqlite.js"))["default"];
let router: (typeof import("../routes/reports.js"))["default"];

beforeAll(async () => {
  db = (await import("../db/sqlite.js")).default;
  router = (await import("../routes/reports.js")).default;
});

function extractHandler(r: any, path: string, method = "get") {
  const layer = r.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`route ${method} ${path} not found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeRes() {
  const res: any = {
    _status: 200,
    _json: undefined,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res;
}

describe("GET /api/reports/:id on the migrated (identity-free) schema", () => {
  it("serves a stored report — the SELECT must not name dropped columns", () => {
    db.prepare(
      `INSERT INTO shared_reports (id, filename, report_json, content_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "a".repeat(32),
      "report.pdf",
      JSON.stringify({ filename: "report.pdf", overallScore: 91, grade: "A", categories: [] }),
      "hash-1",
      new Date(Date.now() + 86_400_000).toISOString(),
    );

    const handler = extractHandler(router, "/reports/:id");
    const res = makeRes();
    handler({ params: { id: "a".repeat(32) } }, res);

    expect(res._status).toBe(200);
    expect(res._json?.report?.filename).toBe("report.pdf");
    expect(res._json?.expiresAt).toBeTruthy();
    // The sharer identity concept no longer exists — nothing email-shaped
    // may appear in the payload.
    expect(JSON.stringify(res._json)).not.toMatch(/email/i);
  });

  it("still 404s an unknown id and 410s an expired one", () => {
    const handler = extractHandler(router, "/reports/:id");

    const missing = makeRes();
    handler({ params: { id: "b".repeat(32) } }, missing);
    expect(missing._status).toBe(404);

    db.prepare(
      `INSERT INTO shared_reports (id, filename, report_json, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      "c".repeat(32),
      "old.pdf",
      JSON.stringify({ filename: "old.pdf", overallScore: 50, grade: "F", categories: [] }),
      new Date(Date.now() - 86_400_000).toISOString(),
    );
    const expired = makeRes();
    handler({ params: { id: "c".repeat(32) } }, expired);
    expect(expired._status).toBe(410);
  });
});

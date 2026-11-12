/**
 * Review 2026-11-12, finding 6 — POST /api/audit-url's content-hash dedup.
 *
 *  (a) It ignored the engine version: a hit returned the stored result for up
 *      to a year, and regradeStoredReport only re-derives the GRADE. After a
 *      detection change, fleet callers that never send `force` kept the old
 *      findings. Each stored report now records the engine version; another
 *      version — or none (rows from before migration 17) — is a cache miss.
 *  (b) A cache hit wrote no audit_log row, so remediating straight after a
 *      cached audit-url answered 403 "Audit required" although that message
 *      says audit-url counts. A hit now satisfies the gate like a fresh audit.
 *
 * Real SQLite on the migrated schema; the real route handler.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "audit-url-version-test-"));
process.env.DB_PATH = join(tmpDir, "audit.db");

const { analyzeDocument, safeFetch } = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  safeFetch: vi.fn(),
}));
vi.mock("../services/analyzer.js", () => ({
  analyzeDocument,
  detectFileType: vi.fn(async () => "pdf"),
  detectLegacyFormat: vi.fn(() => null),
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  safeFetch,
}));

let db: (typeof import("../db/sqlite.js"))["default"];
let handler: (req: any, res: any) => Promise<void>;
let auditLog: typeof import("../services/auditLog.js");
let engineVersion: () => string;

const URL_A = "https://icjia.illinois.gov/files/report.pdf";
const BYTES = Buffer.from("%PDF-1.4 the same bytes every time");

beforeAll(async () => {
  db = (await import("../db/sqlite.js")).default;
  auditLog = await import("../services/auditLog.js");
  engineVersion = (await import("../services/engineVersion.js")).engineVersion;
  const router: any = (await import("../routes/audit-url.js")).default;
  const layer = router.stack.find((l: any) => l.route?.path === "/audit-url");
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks();
  db.exec("DELETE FROM shared_reports; DELETE FROM audit_log;");
  safeFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    buffer: BYTES,
    finalUrl: URL_A,
    resolvedIp: "93.184.216.34",
  });
  analyzeDocument.mockImplementation(async () => ({
    filename: "report.pdf",
    pageCount: 4,
    fileType: "pdf",
    overallScore: 72,
    grade: "C",
    isScanned: false,
    executiveSummary: "",
    categories: [],
  }));
});

async function call(body: Record<string, unknown> = {}) {
  const res: any = {
    _status: 200,
    _json: null,
    status(c: number) {
      res._status = c;
      return res;
    },
    json(b: unknown) {
      res._json = b;
      return res;
    },
  };
  await handler({ body: { url: URL_A, ...body }, query: {}, headers: {} }, res);
  return res;
}
const rows = () =>
  db.prepare("SELECT id, engine_version FROM shared_reports ORDER BY created_at, rowid").all() as {
    id: string;
    engine_version: string | null;
  }[];
const logTypes = () =>
  (
    db.prepare("SELECT event_type FROM audit_log ORDER BY id").all() as { event_type: string }[]
  ).map((r) => r.event_type);

describe("audit-url dedup is engine-version aware", () => {
  it("has a real engine version to compare", () => {
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("stores the engine version with a fresh audit, and serves it from cache on the same version", async () => {
    const first = await call();
    expect(first._json.cached).toBe(false);
    expect(rows()).toEqual([{ id: first._json.reportId, engine_version: engineVersion() }]);

    const second = await call();
    expect(second._json.cached).toBe(true);
    expect(second._json.reportId).toBe(first._json.reportId);
    expect(analyzeDocument).toHaveBeenCalledTimes(1);
  });

  it("treats a report from ANOTHER engine version as a cache miss and re-audits", async () => {
    const first = await call();
    db.prepare("UPDATE shared_reports SET engine_version = ?").run("1.0.0");

    const second = await call();
    expect(second._json.cached).toBe(false);
    expect(analyzeDocument).toHaveBeenCalledTimes(2);
    expect(second._json.reportId).not.toBe(first._json.reportId);
    // The new report carries the current version; the old link still exists.
    expect(
      rows()
        .map((r) => r.engine_version)
        .sort(),
    ).toEqual(["1.0.0", engineVersion()].sort());

    // … and the NEW row is what later calls hit.
    const third = await call();
    expect(third._json.cached).toBe(true);
    expect(third._json.reportId).toBe(second._json.reportId);
  });

  it("treats a row with NO recorded version (written before the column) as a cache miss", async () => {
    await call();
    db.prepare("UPDATE shared_reports SET engine_version = NULL").run();
    const second = await call();
    expect(second._json.cached).toBe(false);
    expect(analyzeDocument).toHaveBeenCalledTimes(2);
  });

  it("force still bypasses the cache", async () => {
    await call();
    const forced = await call({ force: true });
    expect(forced._json.cached).toBe(false);
    expect(analyzeDocument).toHaveBeenCalledTimes(2);
  });
});

describe("a cache hit satisfies the remediation audit-gate", () => {
  const hash = () => auditLog.sha256Hex(BYTES);

  it("records the hit with the content hash, under its own event type", async () => {
    await call();
    // Remove the fresh audit's row: only a row written by the HIT can now
    // satisfy the gate.
    db.exec("DELETE FROM audit_log");
    expect(auditLog.hasRecentAudit(hash(), 60 * 60_000)).toBe(false);

    const hit = await call();
    expect(hit._json.cached).toBe(true);
    expect(auditLog.hasRecentAudit(hash(), 60 * 60_000)).toBe(true);
    expect(logTypes()).toEqual(["audit-url-cached"]);

    const row = db.prepare("SELECT * FROM audit_log").get() as Record<string, unknown>;
    expect(row).toMatchObject({ score: 72, grade: "C", content_hash: hash(), privileged: 0 });
  });

  it("the cache-hit event type is outside every /status counting list", async () => {
    const { STATUS } = await import("#config");
    const counted = [
      ...STATUS.DOCUMENT_EVENT_TYPES,
      ...STATUS.PAGE_EVENT_TYPES,
      ...STATUS.REJECTION_EVENT_TYPES,
      ...STATUS.FAILURE_EVENT_TYPES,
    ] as readonly string[];
    expect(counted).not.toContain("audit-url-cached");
  });

  it("a fresh audit still records exactly one ordinary audit-url row", async () => {
    await call();
    expect(logTypes()).toEqual(["audit-url"]);
  });
});

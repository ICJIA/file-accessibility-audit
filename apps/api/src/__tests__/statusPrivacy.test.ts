/**
 * Privacy guard for the PUBLIC /status document.
 *
 * GET /api/status is unauthenticated and reachable by anyone at
 * https://audit.icjia.app/status. Everything it reports must be either an
 * aggregate COUNT(*) or a boolean about a local engine.
 *
 * These tests exist because the failure mode is silent: a well-meaning change
 * that adds "last audited file" or echoes a probe's stderr would leak
 * government document names or server paths without breaking anything
 * visible. v1.38.0 fixed exactly that class of bug (veraPDF path disclosure),
 * so the constraint is enforced here rather than left to review.
 *
 * The approach is deliberately blunt: seed the database with distinctive
 * identifying values, build the real payload, serialize it, and assert none
 * of them appear anywhere in the JSON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrations.js";
import { createStatusService, type EngineProbes, type StatusDb } from "../services/status.js";

type DB = InstanceType<typeof Database>;

const T0 = Date.UTC(2026, 7, 3, 14, 22, 10);

// Distinctive enough that an accidental appearance cannot be a coincidence.
// v1.68.0: the schema no longer HAS email/IP/user-agent columns — that
// absence is itself asserted below — so the seeded secrets are the values
// that still exist: the uploaded filename and the content hash.
const SECRET_FILENAME = "ZZTOP-Confidential-Budget-Memo-2026.pdf";
const SECRET_HASH = "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";
const SECRET_PATH = "/opt/verapdf/verapdf";

function seededDb(): DB {
  const db = new Database(":memory:");
  runMigrations(db);
  db.prepare(
    `INSERT INTO audit_log
       (event_type, filename, score, grade, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("analyze", SECRET_FILENAME, 42, "F", SECRET_HASH, "2026-08-03 09:22:10");
  db.prepare(
    `INSERT INTO remediation_jobs (id, input_filename, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("job-1", SECRET_FILENAME, "complete", T0 - 1000, T0 + 1000);
  return db;
}

const OK_ENGINES: EngineProbes = {
  qpdf: async () => ({ ok: true, version: "12.3.2" }),
  verapdf: async () => ({ ok: true, version: "1.26.1" }),
  chromium: async () => ({ ok: true }),
};

function build(probes: EngineProbes = OK_ENGINES, db: DB = seededDb()) {
  return createStatusService({
    now: () => T0,
    db: db as unknown as StatusDb,
    probes,
    version: "1.38.2",
    startedAtMs: T0 - 86_400_000,
    remediationEnabled: true,
    // Nonexistent on purpose: the privacy suite must hold with the backup
    // section in its "unavailable" shape, and the path itself (a server
    // path) must never appear in the payload.
    backupStatusFile: "/nonexistent/backups/last-backup.json",
    diskPath: ".",
  }).getStatus();
}

// Match production, where the privileged token is always set. Without it the
// payload would carry a `degraded` key too, and the allow-list below would be
// asserting the shape of an unhealthy service rather than a healthy one.
beforeEach(() => {
  process.env.API_PRIVILEGED_TOKEN = "privacy-test-token";
});
afterEach(() => {
  delete process.env.API_PRIVILEGED_TOKEN;
});

describe("/status never discloses identifying data", () => {
  it("counts the seeded row without revealing anything about it", async () => {
    const payload = await build();
    const json = JSON.stringify(payload);

    // Proves the row was actually read — otherwise the assertions below
    // would pass trivially against an empty result set.
    expect(payload.documents_audited.total).toBe(1);
    expect(payload.documents_audited.by_format_total.pdf).toBe(1);
    expect(payload.remediation.jobs_24h.complete).toBe(1);

    expect(json).not.toContain(SECRET_FILENAME);
    expect(json).not.toContain(SECRET_HASH);
  });

  it("the database physically cannot hold email, IP, or user-agent (v1.68.0)", () => {
    const db = seededDb();
    for (const table of ["audit_log", "remediation_jobs", "shared_reports"]) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const names = cols.map((c) => c.name);
      expect(names).not.toContain("email");
      expect(names).not.toContain("ip_address");
      expect(names).not.toContain("user_agent");
    }
  });

  it("contains no email address at all", async () => {
    const json = JSON.stringify(await build());
    expect(json).not.toMatch(/@/);
  });

  it("contains no filesystem path", async () => {
    const json = JSON.stringify(await build());
    // Catches absolute paths (/opt/..., /usr/..., /home/...) and Windows
    // drive paths, while tolerating the legitimate "/" inside nothing —
    // the payload has no URLs, so any slash-led token is suspect.
    expect(json).not.toMatch(/"[^"]*\/(opt|usr|home|var|tmp|etc|Users)\//);
    expect(json).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it("does not echo a probe's error text when an engine fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = JSON.stringify(
      await build({
        ...OK_ENGINES,
        verapdf: async () => {
          throw new Error(`Command failed: ${SECRET_PATH} --version\nENOENT`);
        },
      }),
    );

    expect(json).not.toContain(SECRET_PATH);
    expect(json).not.toContain("Command failed");
    // Replaced by the fixed enum. An error carrying no errno classifies as
    // the generic "error" — the point is that SOME closed-set value appears
    // in place of the message, not which one.
    expect(json).toContain('"reason":"error"');
    spy.mockRestore();
  });

  it("reports only values from the closed reason enum", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const allowed = new Set(["not_configured", "not_executable", "timeout", "error"]);

    const payload = await build({
      qpdf: async () => {
        throw new Error("weird failure with /var/lib/secrets in it");
      },
      verapdf: async () => ({ ok: false, reason: "not_configured" }),
      chromium: async () => {
        throw Object.assign(new Error("nope"), { code: "EACCES" });
      },
    });

    for (const name of ["qpdf", "verapdf", "chromium"] as const) {
      const engine = payload.engines[name];
      if (!engine.ok) {
        expect(allowed.has(engine.reason as string)).toBe(true);
      }
    }
    spy.mockRestore();
  });

  it("exposes only version numbers for engines, never raw tool output", async () => {
    const payload = await build({
      ...OK_ENGINES,
      // Real qpdf output is a full line that can name its install prefix.
      qpdf: async () => ({ ok: true, version: "12.3.2" }),
    });
    expect(payload.engines.qpdf.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it("reports free space without ever naming the filesystem it measured", async () => {
    // The disk probe is handed a real path; the payload must carry only
    // numbers. A path here would leak the server's directory layout on a
    // public endpoint — the same rule the backup section follows.
    const payload = await build();
    const serialized = JSON.stringify(payload.disk);
    expect(serialized).not.toMatch(/[/\\]/);
    expect(Object.keys(payload.disk).sort()).toEqual(
      ["free_bytes", "free_pct", "status", "total_bytes"].sort(),
    );
  });

  it("keeps the top-level key set to the documented allow-list", async () => {
    // A new key is not automatically a leak, but it must be a deliberate
    // decision — this test makes an accidental addition fail loudly.
    const payload = await build();
    expect(Object.keys(payload).sort()).toEqual(
      [
        "backup",
        "checked_at",
        "checked_at_chicago",
        "database",
        "disk",
        "documents_audited",
        "documents_rejected",
        "engines",
        "last_audit_at",
        "last_audit_at_chicago",
        // on/off only — never the token, its length, or a hash of it.
        "privileged_tier",
        "remediation",
        "status",
        "uptime",
        "uptime_seconds",
        "version",
      ].sort(),
    );
  });
});

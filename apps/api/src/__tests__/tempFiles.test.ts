/**
 * Temp copies of uploaded documents must not outlive the process.
 *
 * qpdf and veraPDF read from a file, so each audit writes `<uuid>.pdf` and
 * deletes it in a `finally` — which never runs when the process is killed
 * mid-audit. The copies used to go straight into /tmp, where nothing could
 * tell them from anyone else's files, so nothing ever cleaned them up.
 *
 * Now: a dedicated owner-only directory (packages/analyzer tempDir.ts), a
 * purge at startup, and an age-based step in the retention sweep. Real
 * directories and real files throughout; the sweep runs against a real
 * SQLite database. Also here: the audit_log purge's cutoff format (the sweep's
 * step 6), which shares the database set-up.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const root = mkdtempSync(join(tmpdir(), "temp-files-test-"));
// TMP_DIR names the BASE; the copies live in a dedicated subfolder of it
// (file-audit-tmp), so a TMP_DIR of /tmp never means "the shared /tmp itself".
const tempBase = join(root, "audit-tmp");
const tempDir = join(tempBase, "file-audit-tmp");
process.env.DB_PATH = join(root, "test.db");
process.env.ACTIVITY_LOG_DIR = join(root, "logs");
process.env.REMEDIATION_ENABLED = "false";
process.env.TMP_DIR = tempBase;

let helper: typeof import("@file-audit/analyzer/tempDir");
let cleanup: typeof import("../services/remediationCleanup.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let cfg: typeof import("#config");

beforeAll(async () => {
  cfg = await import("#config");
  helper = await import("@file-audit/analyzer/tempDir");
  cleanup = await import("../services/remediationCleanup.js");
  db = (await import("../db/sqlite.js")).default;
});

afterAll(() => {
  cleanup.stopCleanupInterval();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.TMP_DIR = tempBase;
  rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A temp copy as the writers name it, last modified `ageMs` ago. */
function tempCopy(ageMs: number, dir = tempDir): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${randomUUID()}.pdf`);
  writeFileSync(file, "%PDF-1.4 a document", { mode: 0o600 });
  const when = new Date(Date.now() - ageMs);
  utimesSync(file, when, when);
  return file;
}

describe("auditTempDir — the dedicated directory", () => {
  it("uses a dedicated subfolder of TMP_DIR when it is set, creating it owner-only", () => {
    expect(existsSync(tempDir)).toBe(false);
    expect(helper.auditTempDir()).toBe(tempDir);
    expect(statSync(tempDir).isDirectory()).toBe(true);
    expect(statSync(tempDir).mode & 0o777).toBe(0o700);
  });

  it("defaults to <os.tmpdir()>/file-audit-tmp, created 0700", () => {
    delete process.env.TMP_DIR;
    vi.spyOn(os, "tmpdir").mockReturnValue(root);
    const dir = helper.auditTempDir();
    expect(dir).toBe(join(root, "file-audit-tmp"));
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("comes back if it is removed while the process runs", () => {
    helper.auditTempDir();
    rmSync(tempDir, { recursive: true, force: true });
    helper.auditTempDir();
    expect(existsSync(tempDir)).toBe(true);
  });

  it("refuses a default location that is a symlink to somewhere else", () => {
    delete process.env.TMP_DIR;
    const fakeTmp = mkdtempSync(join(root, "shared-tmp-"));
    const elsewhere = mkdtempSync(join(root, "someone-elses-"));
    symlinkSync(elsewhere, join(fakeTmp, "file-audit-tmp"));
    vi.spyOn(os, "tmpdir").mockReturnValue(fakeTmp);
    expect(() => helper.auditTempDir()).toThrow(/not a directory owned by this user/);
  });

  it("the real qpdf writer puts its copy there, 0600, and removes it", async () => {
    const { analyzeWithQpdfAsync } = await import("../services/qpdfService.js");
    const seen: Array<{ name: string; mode: number }> = [];
    const fsMod = (await import("node:fs")).default;
    const realWrite = fsMod.writeFileSync;
    vi.spyOn(fsMod, "writeFileSync").mockImplementation(((p: any, d: any, o: any) => {
      realWrite(p, d, o);
      if (String(p).startsWith(tempDir)) {
        seen.push({ name: String(p), mode: statSync(String(p)).mode & 0o777 });
      }
    }) as typeof fsMod.writeFileSync);

    await analyzeWithQpdfAsync(
      readFileSync(new URL("./fixtures/accessible.pdf", import.meta.url)),
    ).catch(() => undefined);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.name).toMatch(/audit-tmp\/[0-9a-f-]{36}\.pdf$/);
    expect(seen[0]!.mode).toBe(0o600);
    expect(readdirSync(tempDir)).toEqual([]); // deleted in the writer's finally
  });
});

describe("purgeAuditTempFiles", () => {
  it("deletes copies older than the age given and keeps younger ones", () => {
    const old = tempCopy(20 * 60_000);
    const fresh = tempCopy(5_000);
    expect(helper.purgeAuditTempFiles(15 * 60_000)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it("age 0 deletes every copy", () => {
    tempCopy(0);
    tempCopy(60_000);
    expect(helper.purgeAuditTempFiles(0)).toBe(2);
    expect(readdirSync(tempDir)).toEqual([]);
  });

  it("touches ONLY <uuid>.pdf files — never anything else in the directory", () => {
    mkdirSync(tempDir, { recursive: true });
    const old = new Date(Date.now() - 86_400_000);
    const others = ["notes.pdf", "report.docx", `${randomUUID()}.txt`, "socket.sock"];
    for (const name of others) {
      writeFileSync(join(tempDir, name), "x");
      utimesSync(join(tempDir, name), old, old);
    }
    const dirLikeAFile = join(tempDir, `${randomUUID()}.pdf`);
    mkdirSync(dirLikeAFile);
    utimesSync(dirLikeAFile, old, old);
    tempCopy(86_400_000);

    expect(helper.purgeAuditTempFiles(0)).toBe(1);
    expect(readdirSync(tempDir).sort()).toEqual([...others, dirLikeAFile.split("/").pop()!].sort());
  });

  it("a missing directory is nothing to do", () => {
    expect(helper.purgeAuditTempFiles(0)).toBe(0);
  });
});

describe("the API purges at startup and in the sweep", () => {
  it("startup: copies a killed process left are deleted; one written seconds ago is not", () => {
    const stale = tempCopy(cfg.TEMP_FILES.BOOT_PURGE_MIN_AGE_MS + 5_000);
    // A remediation worker that survived the restart may be reading this one.
    const live = tempCopy(1_000);
    expect(cleanup.purgeTempFilesAtBoot()).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(live)).toBe(true);
  });

  it("sweep: deletes copies past TEMP_FILES.MAX_AGE_MS and reports the count", async () => {
    const old1 = tempCopy(cfg.TEMP_FILES.MAX_AGE_MS + 60_000);
    const old2 = tempCopy(cfg.TEMP_FILES.MAX_AGE_MS + 3_600_000);
    const young = tempCopy(cfg.TEMP_FILES.MAX_AGE_MS - 60_000);

    const result = await cleanup.runCleanup();

    expect(result.tempFilesPurged).toBe(2);
    expect(existsSync(old1)).toBe(false);
    expect(existsSync(old2)).toBe(false);
    expect(existsSync(young)).toBe(true);
    expect(cleanup.summarizeCleanup(result)).toContain(" · temp files purged: 2 · ");
  });

  it("a sweep that only deleted temp files still prints its summary line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const idle = {
      expiredOutputs: 0,
      stuckJobs: 0,
      queueExpiredJobs: 0,
      jobDirsPurged: 0,
      orphanDirs: 0,
      purgedJobs: 0,
      purgedEvents: 0,
      purgedAuditLog: 0,
      purgedSharedReports: 0,
      activityFilesWritten: 0,
      activityFilesPruned: 0,
      errorLogFilesPruned: 0,
      tempFilesPurged: 0,
      errors: [],
    };
    cleanup.logCleanupResult(idle, { always: false });
    expect(log).not.toHaveBeenCalled();
    cleanup.logCleanupResult({ ...idle, tempFilesPurged: 1 }, { always: false });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("the default age is 15 minutes, above every tool's own time limit", () => {
    expect(cfg.TEMP_FILES.MAX_AGE_MS).toBe(15 * 60_000);
    expect(cfg.TEMP_FILES.MAX_AGE_MS).toBeGreaterThan(
      cfg.REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS + cfg.REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS,
    );
    expect(cfg.TEMP_FILES.MAX_AGE_MS).toBeGreaterThan(cfg.ANALYSIS.QPDF_TIMEOUT_MS);
  });

  it("WIRING: index.ts purges before it starts listening", () => {
    const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const purgeAt = src.indexOf("purgeTempFilesAtBoot()");
    expect(purgeAt).toBeGreaterThan(-1);
    expect(purgeAt).toBeLessThan(src.indexOf("app.listen(PORT, HOST,"));
  });

  it("WIRING: both writers use the helper — no bare /tmp left", () => {
    for (const f of [
      "../services/veraPdfBuffer.ts",
      "../../../../packages/analyzer/src/qpdfService.ts",
    ]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).toContain("auditTempDir()");
      expect(src, f).not.toMatch(/process\.env\.TMP_DIR \|\| "\/tmp"/);
    }
  });
});

describe("audit_log purge — the cutoff is in the format the rows are stored in", () => {
  const DAY = 86_400_000;
  // SQLite's CURRENT_TIMESTAMP form: "YYYY-MM-DD HH:MM:SS", UTC.
  const sqliteStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

  function insert(name: string, createdAtMs: number): void {
    db.prepare(
      "INSERT INTO audit_log (event_type, filename, created_at) VALUES ('analyze', ?, ?)",
    ).run(name, sqliteStamp(createdAtMs));
  }
  const has = (name: string) =>
    db.prepare("SELECT 1 FROM audit_log WHERE filename = ?").get(name) !== undefined;

  it("keeps a row from the cutoff's calendar day that is still inside the window", async () => {
    // Noon UTC, so "one hour inside" and "one hour past" the cutoff both fall
    // on the cutoff's calendar day — the case the old ISO cutoff got wrong:
    // "2025-…-24 13:00:00" < "2025-…-24T12:00:00.000Z" as text (space < T),
    // so the row was purged 23 hours early.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T12:00:00.000Z"));
    const now = Date.now();
    const cutoff = now - cfg.SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS * DAY;

    db.exec("DELETE FROM audit_log");
    insert("inside-by-an-hour.pdf", cutoff + 3_600_000);
    insert("inside-by-a-second.pdf", cutoff + 1_000);
    insert("past-by-an-hour.pdf", cutoff - 3_600_000);
    insert("recent.pdf", now - DAY);

    const result = await cleanup.runCleanup();

    expect(has("inside-by-an-hour.pdf")).toBe(true);
    expect(has("inside-by-a-second.pdf")).toBe(true);
    expect(has("recent.pdf")).toBe(true);
    expect(has("past-by-an-hour.pdf")).toBe(false);
    expect(result.purgedAuditLog).toBe(1);
    expect(result.errors).toEqual([]);
  });
});

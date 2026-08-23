/**
 * The retention sweep's one-line report (v1.88.1).
 *
 * Until now the startup sweep and the 5-minute interval logged NOTHING on
 * success — and step errors captured in `result.errors` were never logged at
 * all outside the hand-run CLI. So "did the first activity-export
 * materialisation run?" was unanswerable from `pm2 logs`, and a step that
 * failed every five minutes was invisible. `summarizeCleanup` renders one
 * line; `logCleanupResult` prints it when something happened (or always, at
 * startup) and prints every captured step error on stderr so it reaches the
 * error log; `runScheduledSweep` is the single entry point index.ts and the
 * interval share.
 *
 * The last test runs the REAL sweep against a temp database and directory —
 * DB_PATH and ACTIVITY_LOG_DIR are set before the dynamic imports, exactly as
 * activityExportWiring.test.ts does, so nothing touches the checkout.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "cleanup-summary-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.ACTIVITY_LOG_DIR = join(tmpDir, "logs");
process.env.REMEDIATION_ENABLED = "false";

let cleanup: typeof import("../services/remediationCleanup.js");

beforeAll(async () => {
  cleanup = await import("../services/remediationCleanup.js");
});
afterAll(() => {
  cleanup.stopCleanupInterval();
  rmSync(tmpDir, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

const idle = () => ({
  expiredOutputs: 0,
  stuckJobs: 0,
  orphanDirs: 0,
  purgedJobs: 0,
  purgedEvents: 0,
  purgedAuditLog: 0,
  purgedSharedReports: 0,
  activityFilesWritten: 0,
  activityFilesPruned: 0,
  errorLogFilesPruned: 0,
  errors: [] as Array<{ step: string; message: string }>,
});

describe("summarizeCleanup", () => {
  it("renders every count on one line, activity files first", () => {
    const line = cleanup.summarizeCleanup({
      ...idle(),
      activityFilesWritten: 364,
      purgedAuditLog: 12,
      expiredOutputs: 2,
    });
    expect(line).toBe(
      "[sweep] activity files: 364 written, 0 pruned · error logs pruned: 0 · audit_log rows purged: 12 · shared reports purged: 0 · remediation: 2 expired, 0 stuck, 0 orphans, 0 jobs purged, 0 events purged · errors: 0",
    );
    expect(line).not.toContain("\n");
  });

  it("names each failed step in the errors clause", () => {
    const line = cleanup.summarizeCleanup({
      ...idle(),
      errors: [
        { step: "activityExport", message: "export boom" },
        { step: "errorLogPrune", message: "EACCES" },
      ],
    });
    expect(line).toMatch(/errors: 2 \(activityExport: export boom; errorLogPrune: EACCES\)$/);
  });
});

describe("logCleanupResult", () => {
  it("stays silent for an idle interval sweep, so pm2 logs are not filled every 5 minutes", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanup.logCleanupResult(idle(), { always: false });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("always reports at startup, even when idle", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    cleanup.logCleanupResult(idle(), { always: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(/^\[sweep\] activity files: 0 written/);
  });

  it("reports an interval sweep that did something", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    cleanup.logCleanupResult({ ...idle(), activityFilesWritten: 1 }, { always: false });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("activity files: 1 written");
  });

  it("prints every captured step error on stderr (the error log sees it) plus the summary", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanup.logCleanupResult(
      { ...idle(), errors: [{ step: "activityExport", message: "export boom" }] },
      { always: false },
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toBe("[sweep] step activityExport failed: export boom");
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("errors: 1 (activityExport: export boom)");
  });
});

describe("runScheduledSweep (what index.ts and the interval call)", () => {
  it("runs the real sweep and logs the startup summary line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await cleanup.runScheduledSweep({ always: true });
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => /^\[sweep\] activity files: \d+ written, \d+ pruned · /.test(l))).toBe(
      true,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("never rejects — a thrown sweep is reported on stderr", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      cleanup.runScheduledSweep({ always: false }, async () => {
        throw new Error("sweep boom");
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toBe("Remediation cleanup sweep failed:");
  });
});

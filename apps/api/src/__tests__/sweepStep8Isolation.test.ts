/**
 * Step 8 isolation (v1.88.0 final-review fix): the daily activity export and
 * the error-log prune run under their OWN try/catch blocks inside step 8 —
 * an export failure must never stop the error-log prune from running. Same
 * file-backed pattern as activityExportWiring.test.ts: DB_PATH and
 * ACTIVITY_LOG_DIR point at a fresh temp dir, set before any dynamic import
 * because the DB singleton and the activity-log dir helper both bind at
 * import time. runActivityExport itself is mocked to always throw, isolating
 * the assertion to step 8's error-handling structure rather than any real
 * export behavior (already covered by activityExportWiring.test.ts and
 * activityExport.test.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "sweep-step8-isolation-"));
process.env.DB_PATH = join(tmpDir, "test.db");
// The export writes to <repo-root>/logs by default; point it at the temp dir so
// the test never touches the real checkout.
process.env.ACTIVITY_LOG_DIR = join(tmpDir, "logs");
process.env.REMEDIATION_ENABLED = "false";
const LOG_DIR = process.env.ACTIVITY_LOG_DIR;

let cleanup: typeof import("../services/remediationCleanup.js");

beforeAll(async () => {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(join(LOG_DIR, "errors-2025-01-01.log"), "ancient");

  vi.doMock("../services/activityExport.js", () => ({
    runActivityExport: () => {
      throw new Error("export boom");
    },
  }));
  cleanup = await import("../services/remediationCleanup.js");
});

afterAll(() => {
  cleanup.stopCleanupInterval();
  vi.doUnmock("../services/activityExport.js");
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("retention sweep step 8: an export failure never blocks the error-log prune", () => {
  it("records the export failure under 'activityExport' and still prunes old error-log files", async () => {
    const result = await cleanup.runCleanup();

    expect(result.errors).toEqual([{ step: "activityExport", message: "export boom" }]);
    expect(result.errorLogFilesPruned).toBe(1);
    expect(existsSync(join(LOG_DIR, "errors-2025-01-01.log"))).toBe(false);
  });
});

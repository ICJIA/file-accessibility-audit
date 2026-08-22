import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { ACTIVITY_EXPORT } from "#config";
import { activityLogDir, defaultDataDir, repoRoot } from "../services/dataDir.js";
import { defaultDataDir as reExported } from "../services/status.js";

const originalDb = process.env.DB_PATH;
const originalLogDir = process.env.ACTIVITY_LOG_DIR;
afterEach(() => {
  if (originalDb === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = originalDb;
  if (originalLogDir === undefined) delete process.env.ACTIVITY_LOG_DIR;
  else process.env.ACTIVITY_LOG_DIR = originalLogDir;
});

describe("defaultDataDir", () => {
  it("is the database file's directory when DB_PATH is set", () => {
    process.env.DB_PATH = "/srv/audit/data/audit.db";
    expect(defaultDataDir()).toBe("/srv/audit/data");
  });
  it("falls back to ./data, exactly as db/sqlite.ts derives the database path", () => {
    delete process.env.DB_PATH;
    expect(defaultDataDir()).toBe("./data");
  });
  it("is the same function status.ts re-exports (the disk probe and the export agree)", () => {
    expect(reExported).toBe(defaultDataDir);
  });
});

describe("repoRoot / activityLogDir", () => {
  it("repoRoot is the checkout root, found from the module's own location, not the cwd", () => {
    expect(isAbsolute(repoRoot())).toBe(true);
    expect(existsSync(join(repoRoot(), "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(repoRoot(), "audit.config.ts"))).toBe(true);
  });
  it("the activity log directory defaults to <repo-root>/logs", () => {
    delete process.env.ACTIVITY_LOG_DIR;
    expect(ACTIVITY_EXPORT.DIR_NAME).toBe("logs");
    expect(activityLogDir()).toBe(join(repoRoot(), "logs"));
  });
  it("ACTIVITY_LOG_DIR overrides it (tests, containers)", () => {
    process.env.ACTIVITY_LOG_DIR = "/var/tmp/audit-logs";
    expect(activityLogDir()).toBe("/var/tmp/audit-logs");
  });
});

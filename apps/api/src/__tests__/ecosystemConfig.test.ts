/**
 * PM2 must start the SERVER, not a wrapper around it (v1.168.1).
 *
 * Both apps used to be registered as `pnpm start`. PM2 measures memory on the
 * one process it spawns and does not add up children, so the figure it
 * compared with `max_memory_restart` was the pnpm wrapper's — about 42 MB on
 * production while the API was using 241 MB. The cap could never fire.
 *
 * The ecosystem file now starts `node` with the same command line each app's
 * own "start" script uses. These tests fail if the two drift apart, or if a
 * wrapper comes back.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");
const cjsRequire = createRequire(import.meta.url);

interface PmApp {
  name: string;
  cwd: string;
  script: string;
  args: string;
  interpreter: string;
  max_memory_restart: string;
}

const ecosystem = cjsRequire(resolve(root, "ecosystem.config.cjs")) as { apps: PmApp[] };

const startScriptOf = (pkgDir: string): string =>
  (
    JSON.parse(readFileSync(resolve(root, pkgDir, "package.json"), "utf8")) as {
      scripts: { start: string };
    }
  ).scripts.start;

const app = (name: string): PmApp => {
  const found = ecosystem.apps.find((a) => a.name === name);
  if (!found) throw new Error(`${name} missing from ecosystem.config.cjs`);
  return found;
};

describe("ecosystem.config.cjs starts each server directly", () => {
  it.each([
    ["file-audit-api", "apps/api"],
    ["file-audit-web", "apps/web"],
  ])("%s runs exactly what its package.json start script runs", (name, pkgDir) => {
    const a = app(name);
    expect(`${a.script} ${a.args}`).toBe(startScriptOf(pkgDir));
    expect(resolve(root, a.cwd)).toBe(resolve(root, pkgDir));
  });

  it.each(["file-audit-api", "file-audit-web"])(
    "%s is not started through a package-manager wrapper",
    (name) => {
      const a = app(name);
      expect(a.script).toBe("node");
      // "none": PM2 executes `node` itself instead of loading the script
      // into its own fork container.
      expect(a.interpreter).toBe("none");
    },
  );

  it("gives the API a higher memory cap than the web app", () => {
    expect(app("file-audit-api").max_memory_restart).toBe("768M");
    expect(app("file-audit-web").max_memory_restart).toBe("512M");
  });
});

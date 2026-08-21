import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { DEPLOY } from "#config";

// The 2026-08-20 audit found both app processes listening on 0.0.0.0. Binding
// loopback is split across two files — the API in code (index.ts →
// resolveBindHost), the web via the HOST env in ecosystem.config.cjs (Nitro
// reads it). This pins both so neither can silently regress to 0.0.0.0, and
// that the two agree on the interface.
const cjsRequire = createRequire(import.meta.url);
const ecosystem = cjsRequire(resolve(__dirname, "../../../../ecosystem.config.cjs")) as {
  apps: Array<{ name: string; env?: Record<string, unknown> }>;
};

function webApp() {
  return ecosystem.apps.find((a) => a.name === "file-audit-web");
}

describe("production processes bind loopback, not 0.0.0.0", () => {
  it("the web (Nitro) process sets HOST to the configured loopback interface", () => {
    expect(webApp()?.env?.HOST).toBe("127.0.0.1");
  });

  it("the web HOST agrees with DEPLOY.BIND_HOST, the single source of truth", () => {
    expect(webApp()?.env?.HOST).toBe(DEPLOY.BIND_HOST);
  });

  it("the API binds through resolveBindHost(isProduction, DEPLOY.BIND_HOST)", () => {
    const src = readFileSync(resolve(__dirname, "../index.ts"), "utf-8");
    expect(src).toMatch(/resolveBindHost\(isProduction, DEPLOY\.BIND_HOST\)/);
    expect(src).toMatch(/app\.listen\(PORT, HOST,/);
  });
});

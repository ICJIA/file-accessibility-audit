import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { VERSION } from "../version.js";

// A3: index.ts and commands/audit.ts each hard-coded their own '1.0.0'
// VERSION literal for the --version/-v flag — permanently stuck at the
// package's initial release version, never matching what actually shipped.
// VERSION is now a single export read live from apps/cli/package.json (see
// version.ts). Pinning VERSION === the real package.json field (rather than
// re-hardcoding an expected string here) is what actually prevents the two
// values from drifting apart again.
describe("CLI VERSION", () => {
  it("matches the version field in apps/cli/package.json", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "..", "..", "package.json"), "utf-8"),
    ) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it("is not the stale hardcoded 1.0.0", () => {
    expect(VERSION).not.toBe("1.0.0");
  });

  it("index.ts and commands/audit.ts no longer hardcode their own VERSION literal", () => {
    const indexSource = readFileSync(resolve(__dirname, "..", "index.ts"), "utf-8");
    const auditSource = readFileSync(resolve(__dirname, "..", "commands/audit.ts"), "utf-8");
    expect(indexSource).not.toMatch(/const VERSION\s*=\s*['"]/);
    expect(auditSource).not.toMatch(/const VERSION\s*=\s*['"]/);
    expect(indexSource).toMatch(/from ['"]\.\/version\.js['"]/);
    expect(auditSource).toMatch(/from ['"]\.\.\/version\.js['"]/);
  });
});

/**
 * One version, everywhere it is written down.
 *
 * A release touches the version in six package.json files, the README badge,
 * the newest CHANGELOG heading and the newest entry of the public security
 * log. Until this test, only two of those pairs were pinned (the CLI to
 * itself, the web package to the security log), so a release that missed one
 * file passed every check. `pnpm release` (scripts/release.ts) writes all of
 * them; this test fails when any of them is left behind, however the release
 * was made.
 *
 * Files are read as text, never imported: the security log lives in the web
 * app behind Nuxt's `~` alias, and this suite runs in the API package.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");
const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");

const PACKAGE_FILES = [
  "package.json",
  "apps/web/package.json",
  "apps/api/package.json",
  "apps/cli/package.json",
  "packages/shared/package.json",
  "packages/analyzer/package.json",
];

const versionOf = (rel: string): string => (JSON.parse(read(rel)) as { version: string }).version;

const rootVersion = versionOf("package.json");

describe("the release version is written the same everywhere", () => {
  it("the root version is plain semver", () => {
    expect(rootVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(PACKAGE_FILES)("%s carries the root version", (rel) => {
    expect(versionOf(rel)).toBe(rootVersion);
  });

  it("the README version badge matches", () => {
    const badge = read("README.md").match(/img\.shields\.io\/badge\/version-(\d+\.\d+\.\d+)-/);
    expect(badge, "README.md has no version badge").not.toBeNull();
    expect(badge![1]).toBe(rootVersion);
  });

  it("the newest CHANGELOG heading matches", () => {
    const heading = read("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+)\]/m);
    expect(heading, "CHANGELOG.md has no `## [x.y.z]` heading").not.toBeNull();
    expect(heading![1]).toBe(rootVersion);
  });

  it("the newest security-log entry matches", () => {
    const source = read("apps/web/app/data/securityAudits.ts");
    const entries = source.slice(source.indexOf("export const SECURITY_AUDIT_ENTRIES"));
    const first = entries.match(/version:\s*"v(\d+\.\d+\.\d+)"/);
    expect(first, "securityAudits.ts has no versioned entry").not.toBeNull();
    expect(first![1]).toBe(rootVersion);
  });

  it("the newest README § Security entry matches", () => {
    const first = read("README.md").match(/^### v(\d+\.\d+\.\d+) — /m);
    expect(first, "README.md has no `### vX.Y.Z — ` review-history entry").not.toBeNull();
    expect(first![1]).toBe(rootVersion);
  });
});

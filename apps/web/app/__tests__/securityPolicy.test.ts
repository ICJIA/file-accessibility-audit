/**
 * The vulnerability-disclosure surfaces added on 2026-09-02 (final security
 * pass): a SECURITY.md at the repo root and an RFC 9116 security.txt served
 * from the site's public directory. Both point reporters at GitHub's private
 * vulnerability reporting instead of a personal mailbox.
 *
 * The one thing that rots silently is security.txt's mandatory `Expires`
 * line — a stale file is treated as invalid by RFC 9116 and by every
 * scanner that reads it. This test starts failing 30 days before that date
 * so the renewal rides an ordinary release instead of being discovered by
 * a reporter.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const securityTxtPath = resolve(repoRoot, "apps", "web", "public", ".well-known", "security.txt");
const securityMdPath = resolve(repoRoot, "SECURITY.md");

const PRIVATE_REPORTING_URL =
  "https://github.com/ICJIA/file-accessibility-audit/security/advisories/new";
const SECURITY_LOG_URL = "https://audit.icjia.app/data-retention#security-audits";

describe("security.txt (RFC 9116)", () => {
  it("exists in the web app's public directory", () => {
    expect(existsSync(securityTxtPath)).toBe(true);
  });

  it("carries the mandatory and expected fields", () => {
    const txt = readFileSync(securityTxtPath, "utf-8");
    const field = (name: string) =>
      txt
        .split("\n")
        .filter((l) => l.startsWith(`${name}:`))
        .map((l) => l.slice(name.length + 1).trim());
    expect(field("Contact")).toEqual([PRIVATE_REPORTING_URL]);
    expect(field("Canonical")).toEqual(["https://audit.icjia.app/.well-known/security.txt"]);
    expect(field("Policy")[0]).toMatch(
      /^https:\/\/github\.com\/ICJIA\/file-accessibility-audit\/.*SECURITY\.md$/,
    );
    expect(field("Preferred-Languages")).toEqual(["en"]);
    expect(field("Expires")).toHaveLength(1);
  });

  it("has not expired and is not about to — renew Expires before it is 30 days out", () => {
    const txt = readFileSync(securityTxtPath, "utf-8");
    const line = txt.split("\n").find((l) => l.startsWith("Expires:"))!;
    const expires = new Date(line.slice("Expires:".length).trim());
    expect(Number.isNaN(expires.getTime())).toBe(false);
    const daysLeft = (expires.getTime() - Date.now()) / 86_400_000;
    expect(daysLeft, `security.txt Expires is ${daysLeft.toFixed(0)} days out`).toBeGreaterThan(30);
    // RFC 9116 §2.5.5: MUST be less than a year in the future.
    expect(daysLeft).toBeLessThan(366);
  });

  it("names no mailbox — the channel is private reporting, not an address", () => {
    const txt = readFileSync(securityTxtPath, "utf-8");
    expect(txt).not.toMatch(/mailto:|@/);
  });
});

describe("SECURITY.md", () => {
  it("exists at the repository root and routes reports to private vulnerability reporting", () => {
    expect(existsSync(securityMdPath)).toBe(true);
    const md = readFileSync(securityMdPath, "utf-8");
    expect(md).toContain(PRIVATE_REPORTING_URL);
    expect(md).toContain(SECURITY_LOG_URL);
    expect(md).toContain("/.well-known/security.txt");
  });

  it("follows the project's copy rules: no personal address, no 'strong'", () => {
    const md = readFileSync(securityMdPath, "utf-8");
    expect(md).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(md).not.toMatch(/\bstrong\b/i);
  });
});

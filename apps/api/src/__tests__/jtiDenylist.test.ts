import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// C4: server-side JWT revocation via a jti denylist. The db singleton reads
// DB_PATH at import time, so the env var MUST be set before the dynamic
// import below (see remediationJobs.test.ts for the same pattern). Each
// vitest file has its own module registry, so this isolated DB never leaks
// into other test files.
// ---------------------------------------------------------------------------
const tmpDir = mkdtempSync(join(tmpdir(), "jti-denylist-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");

let denylist: typeof import("../services/jtiDenylist.js");
let db: (typeof import("../db/sqlite.js"))["default"];

beforeAll(async () => {
  denylist = await import("../services/jtiDenylist.js");
  db = (await import("../db/sqlite.js")).default;
});

describe("revokeJti / isJtiRevoked", () => {
  it("isJtiRevoked is false for a jti that was never revoked", () => {
    expect(denylist.isJtiRevoked("never-seen-jti")).toBe(false);
  });

  it("revokeJti records a jti; isJtiRevoked then returns true for it", () => {
    const jti = "jti-1";
    denylist.revokeJti(jti, Date.now() + 60_000);
    expect(denylist.isJtiRevoked(jti)).toBe(true);
    // An unrelated jti is unaffected.
    expect(denylist.isJtiRevoked("jti-unrelated")).toBe(false);
  });

  it("isJtiRevoked is false once the recorded expiry has passed", () => {
    const jti = "jti-already-expired";
    denylist.revokeJti(jti, Date.now() - 1000);
    expect(denylist.isJtiRevoked(jti)).toBe(false);
  });

  it("revoking the same jti twice does not throw (INSERT OR REPLACE)", () => {
    const jti = "jti-double-revoke";
    expect(() => {
      denylist.revokeJti(jti, Date.now() + 60_000);
      denylist.revokeJti(jti, Date.now() + 120_000);
    }).not.toThrow();
    expect(denylist.isJtiRevoked(jti)).toBe(true);
  });
});

describe("purgeExpiredJtis: expired denylist rows purged opportunistically", () => {
  it("purgeExpiredJtis deletes only rows past their expiry, leaves active ones, and returns the count removed", () => {
    const expiredA = "purge-expired-a";
    const expiredB = "purge-expired-b";
    const active = "purge-active";
    db.prepare("INSERT INTO revoked_jtis (jti, expires_at) VALUES (?, ?)").run(
      expiredA,
      Date.now() - 5000,
    );
    db.prepare("INSERT INTO revoked_jtis (jti, expires_at) VALUES (?, ?)").run(
      expiredB,
      Date.now() - 1,
    );
    db.prepare("INSERT INTO revoked_jtis (jti, expires_at) VALUES (?, ?)").run(
      active,
      Date.now() + 60_000,
    );

    const removed = denylist.purgeExpiredJtis();

    expect(removed).toBeGreaterThanOrEqual(2);
    expect(db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ?").get(expiredA)).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ?").get(expiredB)).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ?").get(active)).toBeDefined();
  });

  it("revokeJti opportunistically purges already-expired rows before inserting the new one", () => {
    const stale = "opportunistic-stale";
    db.prepare("INSERT INTO revoked_jtis (jti, expires_at) VALUES (?, ?)").run(
      stale,
      Date.now() - 10_000,
    );
    expect(db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ?").get(stale)).toBeDefined();

    denylist.revokeJti("opportunistic-new", Date.now() + 60_000);

    // The stale row is gone as a side effect of the NEW revocation call,
    // not because anything explicitly targeted it.
    expect(db.prepare("SELECT 1 FROM revoked_jtis WHERE jti = ?").get(stale)).toBeUndefined();
    expect(denylist.isJtiRevoked("opportunistic-new")).toBe(true);
  });
});

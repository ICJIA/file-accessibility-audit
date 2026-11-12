/**
 * Review 2026-11-12, finding 3: every per-IP bucket was keyed on the FULL
 * address. An IPv6 caller owns a whole /64, and express-rate-limit 7.x does
 * no subnet masking, so rotating addresses inside one /64 walked past every
 * limiter and the daily remediation cap. One shared helper now keys IPv6 by
 * /64 — and this file pins both the helper and that EVERY limiter and the cap
 * actually use it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clientKeyFromIp } from "../services/clientKey.js";
import { ipKey, tierKey } from "../middleware/rateLimiter.js";
import {
  capKeyFromIp,
  reserveRemediationSlot,
  _resetRemediationCap,
} from "../services/remediationCap.js";

describe("clientKeyFromIp", () => {
  it("leaves an IPv4 address unchanged", () => {
    expect(clientKeyFromIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys every address in one IPv6 /64 identically", () => {
    const a = clientKeyFromIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const b = clientKeyFromIp("2001:db8:1:2::1");
    const c = clientKeyFromIp("2001:0db8:0001:0002:ffff:ffff:ffff:ffff");
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("keeps different /64s apart", () => {
    expect(clientKeyFromIp("2001:db8:1:2::1")).not.toBe(clientKeyFromIp("2001:db8:1:3::1"));
  });

  it("treats IPv4-mapped IPv6 (dotted and hex) as the IPv4 caller it is", () => {
    expect(clientKeyFromIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(clientKeyFromIp("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(clientKeyFromIp("0:0:0:0:0:ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("strips brackets and zone identifiers", () => {
    expect(clientKeyFromIp("[2001:db8:1:2::9]")).toBe("2001:db8:1:2::/64");
    expect(clientKeyFromIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("handles loopback and compressed forms", () => {
    expect(clientKeyFromIp("::1")).toBe("0:0:0:0::/64");
    expect(clientKeyFromIp("2001:db8::")).toBe("2001:db8:0:0::/64");
  });

  it("answers 'unknown' for anything that is not an address", () => {
    for (const bad of [undefined, null, "", "not-an-ip", "1.2.3", "::gggg"]) {
      expect(clientKeyFromIp(bad as never)).toBe("unknown");
    }
  });
});

describe("wiring: the limiters and the cap all use the shared key", () => {
  beforeEach(() => _resetRemediationCap());

  it("ipKey (every plain per-IP limiter) buckets a /64 together", () => {
    expect(ipKey({ ip: "2001:db8:1:2::1" })).toBe(ipKey({ ip: "2001:db8:1:2:9:9:9:9" }));
    expect(ipKey({ ip: "::ffff:198.51.100.4" })).toBe("198.51.100.4");
    expect(ipKey({})).toBe("unknown");
  });

  it("tierKey (the two-tier limiters) buckets an anonymous /64 together", () => {
    expect(tierKey({ ip: "2001:db8:1:2::1", headers: {} })).toBe(
      tierKey({ ip: "2001:db8:1:2:ffff::2", headers: {} }),
    );
  });

  it("no limiter in rateLimiter.ts builds its own key from req.ip", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../middleware/rateLimiter.ts", import.meta.url)),
      "utf8",
    );
    // Every keyGenerator is ipKey or tierKey …
    const generators = [...src.matchAll(/keyGenerator:\s*([^,\n]+)/g)].map((m) => m[1]!.trim());
    expect(generators.length).toBeGreaterThanOrEqual(6);
    for (const g of generators) expect(["ipKey", "(req) => tierKey(req)"]).toContain(g);
    // … and req.ip is read in exactly one place: ipKey itself.
    expect(src.match(/req\??\.ip\b/g)).toHaveLength(1);
  });

  it("the remediation cap cannot be escaped by rotating inside a /64", () => {
    const day = 24 * 60 * 60_000;
    expect(capKeyFromIp("2001:db8:1:2::1")).toBe(capKeyFromIp("2001:db8:1:2::2"));
    expect(reserveRemediationSlot(capKeyFromIp("2001:db8:1:2::1"), 2, day)).toBe(true);
    expect(reserveRemediationSlot(capKeyFromIp("2001:db8:1:2::2"), 2, day)).toBe(true);
    // A third address from the same /64 is the same caller: refused.
    expect(reserveRemediationSlot(capKeyFromIp("2001:db8:1:2::3"), 2, day)).toBe(false);
    // A different /64 is unaffected.
    expect(reserveRemediationSlot(capKeyFromIp("2001:db8:1:99::1"), 2, day)).toBe(true);
  });
});

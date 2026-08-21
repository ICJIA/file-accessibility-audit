import { describe, it, expect } from "vitest";
import { resolveBindHost } from "../bindHost.js";

// The network interface each app process listens on. The 2026-08-20 audit
// found the API (5103) and web (5102) bound to 0.0.0.0 — reachable on every
// interface, with only the host firewall between them and the internet. nginx
// proxies to 127.0.0.1, and nothing legitimate hits the raw ports from
// off-host (the fleet goes through https://audit.icjia.app), so production can
// bind loopback and drop the exposure entirely.
describe("resolveBindHost", () => {
  it("binds the configured loopback host in production", () => {
    expect(resolveBindHost(true, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("binds all interfaces in development (undefined host)", () => {
    // Dev must NOT force IPv4 loopback: the Nuxt dev proxy talks to
    // `localhost:5103`, which resolves to ::1 first on some systems, so a
    // 127.0.0.1-only bind would break the dev proxy intermittently. Dev runs
    // on a laptop where binding all interfaces is a non-issue.
    expect(resolveBindHost(false, "127.0.0.1")).toBeUndefined();
  });

  it("passes through whatever loopback value is configured", () => {
    // If BIND_HOST were ever set to 0.0.0.0 (a containerized deploy behind a
    // proxy on another interface), production honors it rather than hardcoding.
    expect(resolveBindHost(true, "0.0.0.0")).toBe("0.0.0.0");
  });
});

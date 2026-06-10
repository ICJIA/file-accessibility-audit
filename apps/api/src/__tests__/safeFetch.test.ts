/**
 * Tests for the SSRF guard's private-IP classifier.
 *
 * Regression focus: isPrivateIP must NOT fail open on bracketed IPv6
 * literals or IPv4-mapped IPv6 forms. A URL's hostname for an IPv6
 * address arrives bracketed (e.g. "[::1]", "[::ffff:7f00:1]"), and
 * isIP() returns 0 for the bracketed string — so the old code treated
 * loopback/mapped-private addresses as public.
 */
import { describe, it, expect } from "vitest";
import { isPrivateIP } from "../services/safeFetch.js";

describe("isPrivateIP — public addresses pass through", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "treats %s as public",
    (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    },
  );
});

describe("isPrivateIP — IPv4 private/reserved ranges", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
  ])("blocks %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });
});

describe("isPrivateIP — IPv6 literals (bracketed and bare)", () => {
  it.each([
    "::1",
    "[::1]",
    "fe80::1",
    "[fe80::1]",
    "fc00::1",
    "[fc00::1]",
    "::",
  ])("blocks IPv6 private/loopback/link-local %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    "::ffff:127.0.0.1",
    "[::ffff:127.0.0.1]",
    "::ffff:7f00:1", // hex form of 127.0.0.1
    "[::ffff:7f00:1]",
    "::ffff:169.254.169.254", // mapped metadata address
    "[::ffff:a9fe:a9fe]",
    "::ffff:10.0.0.1",
  ])("blocks IPv4-mapped-IPv6 form %s (must not fail open)", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it("treats a public IPv4-mapped address as public", () => {
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIP("[::ffff:8.8.8.8]")).toBe(false);
  });
});

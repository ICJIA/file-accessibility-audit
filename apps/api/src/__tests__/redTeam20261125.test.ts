/**
 * 2026-11-25. For one day (v1.180.0 – v1.181.3) /api/analyze-url fetched a
 * document from ANY public host for an anonymous caller. A red-team review
 * that day found ten things to fix, and the owner then withdrew the feature
 * altogether: the site takes uploaded files, not links.
 *
 * This file pins two things:
 *   1. THE WITHDRAWAL — an anonymous caller is refused any host off the
 *      approved list again, and none of the any-host machinery remains.
 *   2. THE HARDENING THAT WAS KEPT — fixes from that review that also
 *      protect the approved-list and service-token paths.
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RATE_LIMITS, URL_FETCH } from "#config";
import { SafeFetchError, isPrivateIP, resolvePublicIp } from "../services/safeFetch.js";
import {
  isAllowedUrl,
  sendSafeFetchError,
  validateUrlForFetch,
  validateUrlPublic,
} from "../services/urlPolicy.js";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("the withdrawal — link checks are for approved hosts only", () => {
  it("an anonymous caller's validator refuses any host off the approved list", () => {
    for (const url of [
      "https://example.com/a.pdf",
      "https://illinois.gov.example.com/a.pdf",
      "https://notillinois.gov/a.pdf",
    ]) {
      expect(isAllowedUrl(url).ok, url).toBe(false);
      expect(() => validateUrlForFetch(new URL(url)), url).toThrow();
    }
    expect(isAllowedUrl("https://icjia.illinois.gov/a.pdf").ok).toBe(true);
  });

  it("the route chooses the validator from the service token alone", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toContain(
      "validateUrl: privileged ? validateUrlPublic : validateUrlForFetch,",
    );
    const route = src("routes/analyze-url.ts");
    expect(route).toContain('runUrlAudit({ url, privileged, res, eventType: "analyze-url" })');
  });

  it("nothing of the any-host path is left to switch back on by accident", () => {
    expect(existsSync(resolve(__dirname, "../services/urlAnyHostGate.ts"))).toBe(false);
    for (const file of [
      "routes/analyze-url.ts",
      "routes/audit-url.ts",
      "routes/audit-url-page.ts",
      "routes/bulk-from-inventory.ts",
      "services/urlAuditPipeline.ts",
      "services/urlPolicy.ts",
      "services/safeFetch.ts",
      "middleware/rateLimiter.ts",
    ]) {
      const text = src(file);
      for (const gone of ["anyPublicHost", "urlAnyHost", "AnyHost", "onResolved", "target_limit"]) {
        expect(text, `${file} still mentions ${gone}`).not.toContain(gone);
      }
    }
    expect(Object.keys(RATE_LIMITS)).not.toContain("urlAnyHost");
    expect(Object.keys(URL_FETCH).filter((k) => k.startsWith("ANY_HOST"))).toEqual([]);
  });
});

describe("kept — a refusal does not report what the server's resolver knows", () => {
  const reply = (err: SafeFetchError) => {
    let status = 0;
    let body: unknown = null;
    const res: any = {
      status(code: number) {
        status = code;
        return this;
      },
      json(b: unknown) {
        body = b;
      },
    };
    sendSafeFetchError(res, err);
    return { status, body: JSON.stringify(body) };
  };

  it("the private-address reply is one fixed sentence; the detail goes to the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = reply(
      new SafeFetchError("private_ip", "'db.internal' resolves to private/reserved IP '10.1.2.3'."),
    );
    expect(out.status).toBe(400);
    expect(out.body).toContain("URL_NOT_ALLOWED");
    expect(out.body).not.toContain("10.1.2.3");
    expect(out.body).not.toContain("db.internal");
    expect(warn.mock.calls.flat().join(" ")).toContain("10.1.2.3");
    warn.mockRestore();
  });

  it("a name that resolved to a private address is answered exactly like a missing name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const internal = reply(
      new SafeFetchError("private_ip", "'db.corp' resolves to private/reserved IP '10.1.2.3'.", {
        viaLookup: true,
      }),
    );
    const missing = reply(new SafeFetchError("dns_failed", "DNS lookup failed for 'nope.corp'"));
    expect(internal).toEqual(missing);
    warn.mockRestore();
  });

  it("resolvePublicIp marks a looked-up private address, and not a literal one", async () => {
    await expect(resolvePublicIp("127.0.0.1")).rejects.toMatchObject({
      code: "private_ip",
      viaLookup: false,
    });
    // "localhost" is in every hosts file, so this needs no network.
    await expect(resolvePublicIp("localhost")).rejects.toMatchObject({
      code: "private_ip",
      viaLookup: true,
    });
  });

  it("for the service token: names that can only be local are refused before any lookup", () => {
    for (const host of [
      "localhost",
      "db",
      "intranet",
      "db.internal",
      "printer.local",
      "x.localhost",
    ]) {
      expect(() => validateUrlPublic(new URL(`http://${host}/a.pdf`)), host).toThrow(
        /not on the public internet/,
      );
    }
    expect(() => validateUrlPublic(new URL("https://example.com/a.pdf"))).not.toThrow();
    expect(() => validateUrlPublic(new URL("https://example.com:8443/a.pdf"))).toThrow();
    expect(() => validateUrlPublic(new URL("ftp://example.com/a.pdf"))).toThrow();
  });
});

describe("kept — a remote host's status line is not relayed", () => {
  it("the 502 carries the status number only", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toContain("error: `fetch returned ${Number(fetched.status) || 0}`");
    expect(pipeline).not.toMatch(/error: `[^`]*statusText/);
  });
});

describe("kept — IPv6 literals are judged by the classifier, not by a failed lookup", () => {
  it("a bracketed loopback or mapped-private literal is refused as PRIVATE", async () => {
    for (const host of [
      "[::1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.1]",
      "[fe80::1]",
      "[fd00::1]",
    ]) {
      await expect(resolvePublicIp(host), host).rejects.toMatchObject({ code: "private_ip" });
    }
  });

  it("a bracketed PUBLIC literal resolves to itself, without the brackets", async () => {
    await expect(resolvePublicIp("[2606:4700:4700::1111]")).resolves.toBe("2606:4700:4700::1111");
  });

  it("IPv4-translated (SIIT) addresses and the 6to4 relay range are private", () => {
    expect(isPrivateIP("::ffff:0:10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:0:93.184.216.34")).toBe(true);
    expect(isPrivateIP("192.88.99.1")).toBe(true);
    expect(isPrivateIP("93.184.216.34")).toBe(false);
    expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
  });
});

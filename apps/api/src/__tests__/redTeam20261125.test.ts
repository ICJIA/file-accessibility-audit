/**
 * Red-team review 2026-11-25, of the v1.180.0 change that lets an anonymous
 * caller check a document on ANY public host. One test (or group) per
 * finding; each fails if its fix is taken out.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { URL_FETCH } from "#config";
import {
  ANY_HOST_REFUSALS,
  addressBlockOf,
  admitAnyHostFetch,
  chargeAnyHostAddress,
  chargeAnyHostTarget,
  resetAnyHostGate,
  targetOf,
} from "../services/urlAnyHostGate.js";
import { chargeAnyHostHopAddress, validateAnyHostHop } from "../services/urlAuditPipeline.js";
import { SafeFetchError, isPrivateIP, resolvePublicIp } from "../services/safeFetch.js";
import { sendSafeFetchError, validateUrlPublic } from "../services/urlPolicy.js";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("finding 1 — off-list fetches cannot be stacked up in memory", () => {
  beforeEach(() => resetAnyHostGate());

  it("the most this path can hold fits well inside the API's memory cap", () => {
    // 25 MB is the fetch cap; the body is buffered before analysis.
    expect(URL_FETCH.ANY_HOST_MAX_CONCURRENT * 25).toBeLessThanOrEqual(128);
    expect(URL_FETCH.ANY_HOST_MAX_PER_CALLER).toBeLessThan(URL_FETCH.ANY_HOST_MAX_CONCURRENT);
    expect(URL_FETCH.ANY_HOST_TOTAL_TIMEOUT_MS).toBeLessThan(URL_FETCH.TOTAL_TIMEOUT_MS);
  });

  it("one caller gets one fetch at a time, and the slot comes back on release", () => {
    const first = admitAnyHostFetch("ip-a");
    expect(first.ok).toBe(true);
    expect(admitAnyHostFetch("ip-a")).toEqual({ ok: false, reason: "caller-busy" });
    if (first.ok) {
      first.release();
      first.release(); // idempotent: a double release must not free a second slot
    }
    expect(admitAnyHostFetch("ip-a").ok).toBe(true);
  });

  it("many callers together cannot exceed the global number in flight", () => {
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_CONCURRENT; i++) {
      expect(admitAnyHostFetch(`ip-${i}`).ok).toBe(true);
    }
    expect(admitAnyHostFetch("ip-late")).toEqual({ ok: false, reason: "busy" });
  });

  it("the route holds the slot for the fetch and always gives it back", () => {
    const route = src("routes/analyze-url.ts");
    expect(route).toMatch(/admitAnyHostFetch\(ipKey\(req\)\)/);
    expect(route).toMatch(/\} finally \{\s*release\?\.\(\);/);
    expect(src("services/urlAuditPipeline.ts")).toContain(
      "totalTimeoutMs: URL_FETCH.ANY_HOST_TOTAL_TIMEOUT_MS",
    );
  });
});

describe("finding 2 — the server cannot be aimed at one site, however many visitors ask", () => {
  beforeEach(() => resetAnyHostGate());

  it("a single website has an hourly ceiling, whatever subdomain or spelling names it", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR; i++) {
      expect(chargeAnyHostTarget(`files${i}.Victim.example.`, t0 + i), `fetch ${i + 1}`).toBe(true);
    }
    expect(chargeAnyHostTarget("victim.example", t0 + 999)).toBe(false);
    expect(chargeAnyHostTarget("www.victim.example", t0 + 999)).toBe(false);
    // Another site is unaffected, and the ceiling lifts once the hour has passed.
    expect(chargeAnyHostTarget("elsewhere.example", t0 + 999)).toBe(true);
    expect(chargeAnyHostTarget("victim.example", t0 + 60 * 60 * 1000 + 1000)).toBe(true);
  });

  it("groups a host under its website, and never merges two sites under a shared suffix", () => {
    expect(targetOf("docs.example.com")).toBe("example.com");
    expect(targetOf("a.b.example.co.uk")).toBe("example.co.uk");
    expect(targetOf("other.co.uk")).toBe("other.co.uk");
    expect(targetOf("example.com.")).toBe("example.com");
    expect(targetOf("93.184.216.34")).toBe("93.184.216.34");
    expect(targetOf("[2606:4700::1111]")).toBe("2606:4700::1111");
  });

  it("there is a ceiling for everyone that no number of addresses raises", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_HOUR; i++) {
      const a = admitAnyHostFetch(`v-${i}`, t0);
      expect(a.ok).toBe(true);
      if (a.ok) a.release();
    }
    expect(admitAnyHostFetch("v-new", t0 + 1)).toEqual({ ok: false, reason: "hourly" });
  });

  it("every refusal says what to do instead, and uses a status the client handles", () => {
    for (const r of Object.values(ANY_HOST_REFUSALS)) {
      expect([429, 503]).toContain(r.status);
      expect(r.error).toMatch(/upload the file/i);
    }
  });
});

// The two below were found by the automated review of the commit that carried
// the fixes above — both were real gaps in those fixes.
describe("follow-up A — a redirect cannot reach a site without being counted against it", () => {
  beforeEach(() => resetAnyHostGate());

  it("the off-list validator charges EVERY hop's website, and refuses once it is full", () => {
    const t = new URL("https://attacker.example/start");
    expect(() => validateAnyHostHop(t)).not.toThrow();
    // The attacker's host redirects to the victim, again and again.
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR; i++) {
      expect(() => validateAnyHostHop(new URL(`https://victim.example/f${i}.pdf`))).not.toThrow();
    }
    let thrown: unknown;
    try {
      validateAnyHostHop(new URL("https://cdn.victim.example/another.pdf"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ code: "target_limit" });
  });

  it("the pipeline hands safeFetch that validator, and the refusal is a 429 that says to upload", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toMatch(/validateUrl: input\.anyPublicHost\s*\?\s*validateAnyHostHop/);
    let status = 0;
    let body: any = null;
    const res: any = {
      status(code: number) {
        status = code;
        return this;
      },
      json(b: unknown) {
        body = b;
      },
    };
    sendSafeFetchError(res, new SafeFetchError("target_limit", "x"));
    expect(status).toBe(429);
    expect(body.error).toMatch(/upload the file/i);
  });

  it("the public-address rules still run first on every hop", () => {
    expect(() => validateAnyHostHop(new URL("https://example.com:8443/a.pdf"))).toThrow();
  });
});

describe("follow-up B — the reply does not tell an internal name from one that does not exist", () => {
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

  it("names that can only be local are refused before any lookup", () => {
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
    // Address literals are left to the address check, not refused here.
    expect(() => validateUrlPublic(new URL("http://93.184.216.34/a.pdf"))).not.toThrow();
  });
});

describe("finding 3 — a refusal does not report what the server's resolver knows", () => {
  it("the private-address reply is one fixed sentence; the detail goes to the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let status = 0;
    let body: any = null;
    const res: any = {
      status(code: number) {
        status = code;
        return this;
      },
      json(b: unknown) {
        body = b;
      },
    };
    sendSafeFetchError(
      res,
      new SafeFetchError("private_ip", "'db.internal' resolves to private/reserved IP '10.1.2.3'."),
    );
    expect(status).toBe(400);
    expect(body.code).toBe("URL_NOT_ALLOWED");
    expect(JSON.stringify(body)).not.toContain("10.1.2.3");
    expect(JSON.stringify(body)).not.toContain("db.internal");
    expect(warn.mock.calls.flat().join(" ")).toContain("10.1.2.3");
    warn.mockRestore();
  });
});

describe("finding 4 — a third party's status line is not relayed", () => {
  it("the 502 carries the status number only", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toContain("error: `fetch returned ${Number(fetched.status) || 0}`");
    expect(pipeline).not.toMatch(/error: `[^`]*statusText/);
  });
});

describe("finding 6 — IPv6 literals are judged by the classifier, not by a failed lookup", () => {
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
    // Unchanged: an ordinary public address is still public.
    expect(isPrivateIP("93.184.216.34")).toBe(false);
    expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
  });
});

// Found by the automated review of v1.181.0: the per-website ceiling follows
// the NAME, and the caller chooses the name.
describe("follow-up C — the ceiling follows the server, not only the name", () => {
  beforeEach(() => resetAnyHostGate());

  it("any number of names pointed at one address share that address's budget", () => {
    const t0 = 9_000_000;
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_ADDRESS_PER_HOUR; i++) {
      // A different name each time — attacker-n.example, a.t.co, b.t.co …
      expect(chargeAnyHostTarget(`name-${i}.attacker-${i}.example`, t0)).toBe(true);
      expect(chargeAnyHostAddress("93.184.216.34", t0), `fetch ${i + 1}`).toBe(true);
    }
    expect(chargeAnyHostAddress("93.184.216.34", t0 + 1)).toBe(false);
    // A neighbour in the same /24 shares it; another network does not.
    expect(chargeAnyHostAddress("93.184.216.200", t0 + 1)).toBe(false);
    expect(chargeAnyHostAddress("93.184.217.34", t0 + 1)).toBe(true);
    // And it lifts after the hour.
    expect(chargeAnyHostAddress("93.184.216.34", t0 + 60 * 60 * 1000 + 1000)).toBe(true);
  });

  it("groups IPv4 by /24 and IPv6 by /64", () => {
    expect(addressBlockOf("93.184.216.34")).toBe("v4:93.184.216");
    expect(addressBlockOf("2606:4700:4700:0:1:2:3:4")).toBe("v6:2606:4700:4700:0");
    expect(addressBlockOf("[2606:4700:4700:0::1111]")).toBe("v6:2606:4700:4700:0");
    expect(addressBlockOf("2606:4700:4700:0::1")).toBe(addressBlockOf("2606:4700:4700:0::ffff"));
  });

  it("the pipeline charges the address on every hop, through safeFetch's own hook", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toMatch(/onResolved: chargeAnyHostHopAddress/);
    const fetcher = src("services/safeFetch.ts");
    // Inside the redirect loop, straight after the name is resolved.
    expect(fetcher).toMatch(
      /resolvePublicIp\(currentUrl\.hostname\)\);\s*opts\.onResolved\?\.\(resolvedIp, currentUrl\);/,
    );
    let thrown: unknown;
    for (let i = 0; i <= URL_FETCH.ANY_HOST_MAX_PER_ADDRESS_PER_HOUR; i++) {
      try {
        chargeAnyHostHopAddress("203.0.114.9");
      } catch (err) {
        thrown = err;
      }
    }
    expect(thrown).toMatchObject({ code: "target_limit" });
  });

  it("the address ceiling is looser than the per-website one, and still far below the total", () => {
    expect(URL_FETCH.ANY_HOST_MAX_PER_ADDRESS_PER_HOUR).toBeGreaterThanOrEqual(
      URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR,
    );
    expect(URL_FETCH.ANY_HOST_MAX_PER_ADDRESS_PER_HOUR).toBeLessThan(
      URL_FETCH.ANY_HOST_MAX_PER_HOUR,
    );
  });
});

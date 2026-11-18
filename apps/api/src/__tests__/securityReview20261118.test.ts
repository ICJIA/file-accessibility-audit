/**
 * Security review 2026-11-18 — the Low/Info findings, fixed together:
 *   - Chromium (the page audit) inherited the API's secrets;
 *   - URL fetches accepted any port, and the error told open from closed;
 *   - isPrivateIP missed some reserved ranges and IPv6 spellings.
 * (The High zip-entry finding is in zipEntryPrecheck.test.ts; the Medium
 * job-store finding in analyzeJobEviction.test.ts.)
 */
import { describe, it, expect, vi } from "vitest";

const { launchOpts } = vi.hoisted(() => ({ launchOpts: [] as Array<Record<string, unknown>> }));
vi.mock("puppeteer", () => ({
  default: {
    launch: async (opts: Record<string, unknown>) => {
      launchOpts.push(opts);
      throw new Error("stop after launch");
    },
  },
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  resolvePublicIp: vi.fn(async () => "93.184.216.34"),
}));

import { auditPage } from "../services/pageAuditor.js";
import { isAllowedUrl, sendSafeFetchError, validateUrlPublic } from "../services/urlPolicy.js";
import { isPrivateIP, SafeFetchError } from "../services/safeFetch.js";

describe("Chromium does not inherit the API's secrets", () => {
  it("launches with an environment that has no privileged token or seal secret", async () => {
    process.env.API_PRIVILEGED_TOKEN = "tok-should-not-leak";
    process.env.REPORT_SEAL_SECRET = "seal-should-not-leak";
    try {
      await auditPage("https://icjia.illinois.gov/page", () => true).catch(() => {});
      expect(launchOpts.length).toBeGreaterThan(0);
      const env = launchOpts[0]!.env as Record<string, string> | undefined;
      expect(env, "puppeteer.launch must receive an explicit env").toBeDefined();
      expect(env).not.toHaveProperty("API_PRIVILEGED_TOKEN");
      expect(env).not.toHaveProperty("REPORT_SEAL_SECRET");
      expect(env!.PATH).toBe(process.env.PATH);
    } finally {
      delete process.env.API_PRIVILEGED_TOKEN;
      delete process.env.REPORT_SEAL_SECRET;
    }
  });
});

describe("only the standard web ports", () => {
  it.each([
    "https://icjia.illinois.gov/a.pdf",
    "http://icjia.illinois.gov:80/a.pdf",
    "https://icjia.illinois.gov:443/a.pdf",
  ])("accepts %s", (u) => expect(isAllowedUrl(u).ok).toBe(true));
  it.each([
    "https://icjia.illinois.gov:22/",
    "http://icjia.illinois.gov:8080/a.pdf",
    "https://icjia.illinois.gov:6379/",
  ])("refuses %s (allowlist path)", (u) => expect(isAllowedUrl(u).ok).toBe(false));
  it("the privileged validator skips the allowlist, never the port rule", () => {
    expect(() => validateUrlPublic(new URL("https://example.com/a.pdf"))).not.toThrow();
    expect(() => validateUrlPublic(new URL("https://example.com:22/"))).toThrow(SafeFetchError);
  });
  it("a network error never echoes the raw socket text to the client", () => {
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendSafeFetchError(
      res,
      new SafeFetchError("network_error", "connect ECONNREFUSED 10.1.2.3:22"),
    );
    warn.mockRestore();
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|:22/);
  });
});

describe("isPrivateIP covers every spelling and reserved range", () => {
  it.each([
    "100.64.0.1", // carrier-grade NAT
    "100.127.255.254",
    "192.0.2.10", // documentation
    "0:0:0:0:0:ffff:a9fe:a9fe", // written-out IPv4-mapped 169.254.169.254
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::7f00:1", // IPv4-compatible 127.0.0.1
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe", // NAT64
    "64:ff9b:1::1",
    "2002:7f00:0001::1", // 6to4 of 127.0.0.1
    "2002:0a00:0001::", // 6to4 of 10.0.0.1
    "2001:0:4136:e378::1", // Teredo
    "2001:db8::1", // documentation
    "fec0::1", // site-local
    "fe80::1%eth0",
    "[::1]",
    "::",
  ])("refuses %s", (ip) => expect(isPrivateIP(ip)).toBe(true));

  it.each([
    "93.184.216.34",
    "100.128.0.1",
    "2606:4700::1111",
    "2002:5db8:d822::1",
    "::ffff:93.184.216.34",
  ])("allows public %s", (ip) => expect(isPrivateIP(ip)).toBe(false));
});

/**
 * Page audit, second hostname (closed 2026-11-18): Chromium resolves only
 * the pinned document host. Every request to another host is fetched in Node
 * (safeFetch: resolve, check every record, connect to the checked address)
 * and handed to Chromium as bytes, so a rebinding name never reaches a
 * browser lookup.
 */
describe("page audit: requests to other hosts are fetched by Node, never resolved by Chromium", () => {
  async function run(
    url: string,
    method = "GET",
    fetched: unknown = {
      status: 200,
      headers: { "content-type": "text/css" },
      body: Buffer.from("a{}"),
    },
    opts: { resourceType?: string; postData?: string } = {},
  ) {
    const { createRequestHandler } = await import("../services/pageAuditor.js");
    const calls: string[] = [];
    let responded: any = null;
    const req: any = {
      url: () => url,
      method: () => method,
      resourceType: () => opts.resourceType ?? "stylesheet",
      headers: () => ({ "content-type": "application/json", cookie: "a=b" }),
      postData: () => opts.postData,
      hasPostData: () => opts.postData !== undefined,
      fetchPostData: async () => opts.postData,
      continue: async () => void calls.push("continue"),
      abort: async () => void calls.push("abort"),
      respond: async (r: unknown) => {
        calls.push("respond");
        responded = r;
      },
    };
    const offFetch = vi.fn(async () => fetched as any);
    const handler = createRequestHandler(
      () => true,
      async () => true,
      { pinnedHost: "icjia.illinois.gov", fetch: offFetch },
    );
    await handler(req);
    return { calls, responded, offFetch };
  }

  it("the pinned document host goes to Chromium (its address is pinned at launch)", async () => {
    const { calls, offFetch } = await run("https://icjia.illinois.gov/style.css");
    expect(calls).toEqual(["continue"]);
    expect(offFetch).not.toHaveBeenCalled();
  });

  it("another host is fetched by Node and handed back — Chromium never continues it", async () => {
    const { calls, responded, offFetch } = await run("https://rebind.attacker.example/x.css");
    expect(offFetch).toHaveBeenCalledWith(
      "https://rebind.attacker.example/x.css",
      false,
      undefined,
    );
    expect(calls).toEqual(["respond"]);
    expect(responded.body.toString()).toBe("a{}");
  });

  it("a refused Node fetch (private address, bad port, too big) aborts the request", async () => {
    const { calls } = await run("https://rebind.attacker.example/x.css", "GET", null);
    expect(calls).toEqual(["abort"]);
  });

  // 2026-11-18 (v1.175.3): GET/HEAD-only emptied every ICJIA single-page
  // site, whose content arrives by GraphQL POST to another host.
  it("a page's data POST to another host goes through Node, body and headers with it", async () => {
    const q = '{"query":"{ news { title } }"}';
    const { calls, offFetch } = await run(
      "https://agency.icjia-api.cloud/graphql",
      "POST",
      undefined,
      {
        resourceType: "fetch",
        postData: q,
      },
    );
    expect(calls).toEqual(["respond"]);
    const [, isDoc, request] = offFetch.mock.calls[0] as any;
    expect(isDoc).toBe(false);
    expect(request.method).toBe("POST");
    expect(request.body.toString()).toBe(q);
  });

  it("the CORS preflight before it is forwarded too, so the real server's answer decides", async () => {
    const { calls, offFetch } = await run(
      "https://agency.icjia-api.cloud/graphql",
      "OPTIONS",
      undefined,
      {
        resourceType: "preflight",
      },
    );
    expect(calls).toEqual(["respond"]);
    expect((offFetch.mock.calls[0] as any)[2].method).toBe("OPTIONS");
  });

  it.each([
    ["a POST that navigates the page (a form submission)", "POST", "document", "x=1"],
    ["a POST body over 256 KB", "POST", "fetch", "x".repeat(256 * 1024 + 1)],
    ["PUT", "PUT", "fetch", undefined],
    ["DELETE", "DELETE", "fetch", undefined],
  ])("refused: %s", async (_label, method, resourceType, postData) => {
    const { calls, offFetch } = await run("https://other.example/api", method, undefined, {
      resourceType,
      postData,
    });
    expect(calls).toEqual(["abort"]);
    expect(offFetch).not.toHaveBeenCalled();
  });

  it("WIRING: auditPage installs the guard with the pinned host and a Node fetcher", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../services/pageAuditor.ts", import.meta.url), "utf8");
    expect(src).toMatch(/installRequestGuard\(page, isUrlAllowed, host, budget\)/);
    expect(src).toMatch(/const budget = new OffHostBudget\(\)/);
    expect(src).toMatch(/fetch: offHostFetchFor\(isUrlAllowed, budget\)/);
  });
});

/**
 * Automated review of v1.174.0: Node-fetched files live in the API's memory,
 * so one audit's downloads are bounded — concurrency, request count, and a
 * byte budget reserved before each download starts.
 */
describe("page audit: the per-audit download budget", () => {
  const body = (n: number) => ({ body: Buffer.alloc(n) });

  it("never runs more than maxInFlight downloads at once", async () => {
    const { OffHostBudget } = await import("../services/pageAuditor.js");
    const b = new OffHostBudget(3, 1e9, 100);
    let now = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const jobs = Array.from({ length: 10 }, () =>
      b.run(async () => {
        now++;
        peak = Math.max(peak, now);
        await new Promise<void>((r) => releases.push(r));
        now--;
        return body(1);
      }),
    );
    while (releases.length || now) {
      await new Promise((r) => setTimeout(r, 0));
      releases.shift()?.();
    }
    await Promise.all(jobs);
    expect(peak).toBe(3);
  });

  it("reserves bytes BEFORE downloading, so concurrent downloads cannot overshoot", async () => {
    const { OffHostBudget, OFF_HOST_MAX_BYTES } = await import("../services/pageAuditor.js");
    const b = new OffHostBudget(10, OFF_HOST_MAX_BYTES * 2, 100);
    const caps: number[] = [];
    const releases: Array<() => void> = [];
    const jobs = Array.from({ length: 4 }, () =>
      b.run(async (cap) => {
        caps.push(cap);
        if (cap > 0) await new Promise<void>((r) => releases.push(r));
        return body(cap);
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    // Two full allowances fit; the other two get nothing while those run.
    expect(caps.filter((c) => c > 0)).toHaveLength(2);
    expect(caps.reduce((a, c) => a + c, 0)).toBeLessThanOrEqual(OFF_HOST_MAX_BYTES * 2);
    releases.forEach((r) => r());
    const results = await Promise.all(jobs);
    expect(results.filter((x) => x === null)).toHaveLength(2);
  });

  it("refunds the unused part of a reservation", async () => {
    const { OffHostBudget } = await import("../services/pageAuditor.js");
    const b = new OffHostBudget(1, 1000, 100);
    await b.run(async () => body(100));
    expect(b.bytesCommitted).toBe(100);
    const got = await b.run(async (cap) => {
      expect(cap).toBe(900);
      return body(10);
    });
    expect(got).not.toBeNull();
    expect(b.bytesCommitted).toBe(110);
  });

  it("stops after maxRequests", async () => {
    const { OffHostBudget } = await import("../services/pageAuditor.js");
    const b = new OffHostBudget(6, 1e9, 2);
    expect(await b.run(async () => body(1))).not.toBeNull();
    expect(await b.run(async () => body(1))).not.toBeNull();
    expect(await b.run(async () => body(1))).toBeNull();
  });
});

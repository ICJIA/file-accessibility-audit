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
  admitAnyHostFetch,
  resetAnyHostGate,
  targetOf,
} from "../services/urlAnyHostGate.js";
import { SafeFetchError, isPrivateIP, resolvePublicIp } from "../services/safeFetch.js";
import { sendSafeFetchError } from "../services/urlPolicy.js";

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
    const first = admitAnyHostFetch("ip-a", "https://a.example/1.pdf");
    expect(first.ok).toBe(true);
    const second = admitAnyHostFetch("ip-a", "https://b.example/2.pdf");
    expect(second).toEqual({ ok: false, reason: "caller-busy" });
    if (first.ok) {
      first.release();
      first.release(); // idempotent: a double release must not free a second slot
    }
    expect(admitAnyHostFetch("ip-a", "https://b.example/2.pdf").ok).toBe(true);
  });

  it("many callers together cannot exceed the global number in flight", () => {
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_CONCURRENT; i++) {
      expect(admitAnyHostFetch(`ip-${i}`, `https://h${i}.example/x.pdf`).ok).toBe(true);
    }
    expect(admitAnyHostFetch("ip-late", "https://late.example/x.pdf")).toEqual({
      ok: false,
      reason: "busy",
    });
  });

  it("the route holds the slot for the fetch and always gives it back", () => {
    const route = src("routes/analyze-url.ts");
    expect(route).toMatch(/admitAnyHostFetch\(ipKey\(req\), url\)/);
    expect(route).toMatch(/\} finally \{\s*release\?\.\(\);/);
    expect(src("services/urlAuditPipeline.ts")).toContain(
      "totalTimeoutMs: URL_FETCH.ANY_HOST_TOTAL_TIMEOUT_MS",
    );
  });
});

describe("finding 2 — the server cannot be aimed at one site, however many visitors ask", () => {
  beforeEach(() => resetAnyHostGate());

  it("a single target has an hourly ceiling across all callers", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_TARGET_PER_HOUR; i++) {
      const a = admitAnyHostFetch(`visitor-${i}`, "https://Victim.example./big.pdf", t0 + i);
      expect(a.ok, `fetch ${i + 1}`).toBe(true);
      if (a.ok) a.release();
    }
    // Same site, spelled without the trailing dot and in lower case.
    expect(admitAnyHostFetch("visitor-x", "https://victim.example/other.pdf", t0 + 999)).toEqual({
      ok: false,
      reason: "target-hourly",
    });
    // Another site is unaffected…
    expect(admitAnyHostFetch("visitor-x", "https://elsewhere.example/a.pdf", t0 + 999).ok).toBe(
      true,
    );
    // …and the ceiling lifts once the hour has passed.
    const later = t0 + 60 * 60 * 1000 + 1000;
    expect(admitAnyHostFetch("visitor-y", "https://victim.example/a.pdf", later).ok).toBe(true);
  });

  it("there is a ceiling for everyone that no number of addresses raises", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < URL_FETCH.ANY_HOST_MAX_PER_HOUR; i++) {
      const a = admitAnyHostFetch(`v-${i}`, `https://site-${i}.example/a.pdf`, t0);
      expect(a.ok).toBe(true);
      if (a.ok) a.release();
    }
    expect(admitAnyHostFetch("v-new", "https://fresh.example/a.pdf", t0 + 1)).toEqual({
      ok: false,
      reason: "hourly",
    });
  });

  it("every refusal says what to do instead, and uses a status the client handles", () => {
    for (const r of Object.values(ANY_HOST_REFUSALS)) {
      expect([429, 503]).toContain(r.status);
      expect(r.error).toMatch(/upload the file/i);
    }
    expect(targetOf("not a url")).toBe("");
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

/**
 * Review 2026-11-12, finding 4: safeFetch's `timeoutMs` is the socket IDLE
 * timeout — it restarts on every byte — while its own doc comment called it
 * the total. A server trickling one byte just inside the idle window held the
 * fetch (and its buffer) open indefinitely. There is now an overall deadline
 * covering DNS + connect + redirects + body, and an AbortSignal so a fetch is
 * dropped when the client that asked for it disconnects.
 *
 * Real sockets, real timers: a local HTTP server stands in for the remote
 * host. Only DNS and the dial target are redirected (safeFetch refuses
 * loopback by design, so the test resolves a public-looking address and
 * points the connection at the local server).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";

const { target } = vi.hoisted(() => ({ target: { port: 0 } }));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async (host: string) => {
      if (host === "slow-dns.example") await new Promise((r) => setTimeout(r, 5_000));
      return [{ address: "93.184.216.34", family: 4 }];
    }),
  },
}));

vi.mock("node:http", async (importActual) => {
  const actual = await importActual<typeof import("node:http")>();
  const request = (opts: any, cb: any) =>
    actual.request({ ...opts, host: "127.0.0.1", port: target.port }, cb);
  return { ...actual, default: { ...actual, request }, request };
});

import http from "node:http";
import { safeFetch, SafeFetchError } from "../services/safeFetch.js";

let server: import("node:http").Server;
const open = new Set<import("node:net").Socket>();

beforeAll(async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  server = actual.createServer((req, res) => {
    if (req.url === "/trickle") {
      // One byte every 40 ms, forever: never idle for long, never finished.
      res.writeHead(200, { "content-type": "application/pdf" });
      const timer = setInterval(() => res.write("x"), 40);
      res.on("close", () => clearInterval(timer));
      return;
    }
    if (req.url === "/hop") {
      // A redirect chain whose every hop stalls a little: the deadline must
      // span the hops, not restart on each.
      setTimeout(() => {
        res.writeHead(302, { location: "/hop2" });
        res.end();
      }, 120);
      return;
    }
    if (req.url === "/hop2") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 400);
      return;
    }
    res.writeHead(200);
    res.end("%PDF-1.4 ok");
  });
  server.on("connection", (s) => {
    open.add(s);
    s.on("close", () => open.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  target.port = (server.address() as AddressInfo).port;
  void http; // the mocked module is what safeFetch imports
});

afterAll(async () => {
  for (const s of open) s.destroy();
  await new Promise((r) => server.close(r));
});

const base = { maxBytes: 1024 * 1024, validateUrl: () => {} };

async function failure(p: Promise<unknown>): Promise<SafeFetchError> {
  try {
    await p;
  } catch (e) {
    return e as SafeFetchError;
  }
  throw new Error("expected the fetch to fail");
}

describe("safeFetch — overall deadline", () => {
  it("a normal fetch still succeeds", async () => {
    const r = await safeFetch("http://files.example/ok", { ...base, totalTimeoutMs: 2_000 });
    expect(r.ok).toBe(true);
    expect(r.buffer.toString()).toBe("%PDF-1.4 ok");
  });

  it("ends a trickling body at the deadline even though the idle timeout never fires", async () => {
    const started = Date.now();
    const err = await failure(
      safeFetch("http://files.example/trickle", {
        ...base,
        timeoutMs: 1_000, // idle: bytes arrive every 40 ms, so this never trips
        totalTimeoutMs: 300,
      }),
    );
    const elapsed = Date.now() - started;
    expect(err).toBeInstanceOf(SafeFetchError);
    expect(err.code).toBe("timeout");
    expect(err.message).toMatch(/overall deadline/);
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(900);
  });

  it("is ONE budget across redirect hops, not a fresh one per hop", async () => {
    // hop 1 answers at ~120 ms, hop 2 would answer at ~520 ms total.
    const err = await failure(
      safeFetch("http://files.example/hop", { ...base, timeoutMs: 1_000, totalTimeoutMs: 350 }),
    );
    expect(err.code).toBe("timeout");
  });

  it("covers DNS resolution too", async () => {
    const started = Date.now();
    const err = await failure(
      safeFetch("http://slow-dns.example/ok", { ...base, totalTimeoutMs: 150 }),
    );
    expect(err.code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("defaults to URL_FETCH.TOTAL_TIMEOUT_MS when the caller passes none", async () => {
    const { URL_FETCH } = await import("#config");
    expect(URL_FETCH.TOTAL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(URL_FETCH.TOTAL_TIMEOUT_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("safeFetch — abort when the client has gone", () => {
  it("stops an in-flight body as soon as the signal fires", async () => {
    const ac = new AbortController();
    const started = Date.now();
    setTimeout(() => ac.abort(), 100);
    const err = await failure(
      safeFetch("http://files.example/trickle", {
        ...base,
        totalTimeoutMs: 5_000,
        signal: ac.signal,
      }),
    );
    expect(err.code).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("refuses to start when the signal has already fired", async () => {
    const ac = new AbortController();
    ac.abort();
    const err = await failure(safeFetch("http://files.example/ok", { ...base, signal: ac.signal }));
    expect(err.code).toBe("aborted");
  });
});

/**
 * v1.175.3 (2026-11-18): safeFetch can replay a page's own data request — a
 * POST and the OPTIONS preflight before it — for the page auditor. Real
 * sockets: a local server stands in for the remote host (DNS and the dial
 * target are redirected, as in safeFetchDeadline.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";

const { target } = vi.hoisted(() => ({ target: { port: 0 } }));

vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) },
}));
vi.mock("node:http", async (importActual) => {
  const actual = await importActual<typeof import("node:http")>();
  const request = (opts: any, cb: any) =>
    actual.request({ ...opts, host: "127.0.0.1", port: target.port }, cb);
  return { ...actual, default: { ...actual, request }, request };
});

import { safeFetch } from "../services/safeFetch.js";

let server: import("node:http").Server;
let seen: { method?: string; headers?: Record<string, unknown>; body?: string } = {};

beforeAll(async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  server = actual.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen = { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
      if (req.url === "/moved") {
        res.writeHead(307, { location: "/graphql" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "https://icjia.illinois.gov",
        "access-control-allow-methods": "POST",
        "set-cookie": "session=secret",
      });
      res.end('{"data":{}}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  target.port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const base = { maxBytes: 1e6, validateUrl: () => {} };
const pageHeaders = {
  "content-type": "application/json",
  origin: "https://icjia.illinois.gov",
  cookie: "session=abc",
  authorization: "Bearer xyz",
  "x-custom": "1",
};

describe("safeFetch replays a page's data request", () => {
  it("POST sends the body and only content-type / accept / origin / CORS headers", async () => {
    const r = await safeFetch("http://api.example/graphql", {
      ...base,
      request: { method: "POST", body: Buffer.from('{"query":"{x}"}'), headers: pageHeaders },
    });
    expect(r.status).toBe(200);
    expect(seen.method).toBe("POST");
    expect(seen.body).toBe('{"query":"{x}"}');
    expect(seen.headers!["content-type"]).toBe("application/json");
    expect(seen.headers!.origin).toBe("https://icjia.illinois.gov");
    for (const h of ["cookie", "authorization", "x-custom"])
      expect(seen.headers![h]).toBeUndefined();
    // The CORS answer goes back to Chromium; cookies never do.
    expect(r.passHeaders["access-control-allow-origin"]).toBe("https://icjia.illinois.gov");
    expect(r.passHeaders["set-cookie"]).toBeUndefined();
  });

  it("the OPTIONS preflight is forwarded with its CORS request headers", async () => {
    await safeFetch("http://api.example/graphql", {
      ...base,
      request: {
        method: "OPTIONS",
        headers: {
          origin: "https://icjia.illinois.gov",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      },
    });
    expect(seen.method).toBe("OPTIONS");
    expect(seen.headers!["access-control-request-method"]).toBe("POST");
    expect(seen.body).toBe("");
  });

  it.each(["POST", "OPTIONS"] as const)(
    "a %s is never redirected (no body re-sent elsewhere)",
    async (method) => {
      await expect(
        safeFetch("http://api.example/moved", {
          ...base,
          request: { method, body: Buffer.from("x") },
        }),
      ).rejects.toMatchObject({ code: "redirect_invalid" });
    },
  );

  it("a plain GET is unchanged: its own headers, redirects followed", async () => {
    const r = await safeFetch("http://api.example/moved", base);
    expect(r.status).toBe(200);
    expect(seen.method).toBe("GET");
  });
});

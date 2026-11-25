/**
 * v1.180.0 — a link check may name any PUBLIC host (owner decision,
 * 2026-11-25), with a budget of its own for hosts off the approved list.
 *
 * What must stay true:
 *   - only /api/analyze-url is opened; the routes that persist reports, drive
 *     a browser, or fan out keep the allowlist;
 *   - opening the host rule opens nothing else (scheme, port, private
 *     addresses);
 *   - an off-list request is counted against the tighter budget, an approved
 *     host and the privileged token are not, and a malformed body is counted
 *     rather than excused.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { RATE_LIMITS } from "#config";
import { isOnApprovedList, validateUrlPublic } from "../services/urlPolicy.js";
import { urlAnyHostLimiter } from "../middleware/rateLimiter.js";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("isOnApprovedList", () => {
  it("is true for an approved host and its subdomains", () => {
    expect(isOnApprovedList("https://icjia.illinois.gov/a.pdf")).toBe(true);
    expect(isOnApprovedList("https://www2.illinois.gov/x/y.docx")).toBe(true);
  });

  it("is false for any other host, and for a look-alike", () => {
    expect(isOnApprovedList("https://example.com/a.pdf")).toBe(false);
    expect(isOnApprovedList("https://illinois.gov.example.com/a.pdf")).toBe(false);
    expect(isOnApprovedList("https://notillinois.gov/a.pdf")).toBe(false);
  });

  it("is false — counted, never excused — for anything that is not a usable address", () => {
    for (const v of [undefined, null, 7, {}, [], "", "not a url", "ftp://illinois.gov/a.pdf"]) {
      expect(isOnApprovedList(v), JSON.stringify(v)).toBe(false);
    }
    // An approved host on an odd port is not "on the list" either.
    expect(isOnApprovedList("https://illinois.gov:8443/a.pdf")).toBe(false);
  });
});

describe("opening the host rule opens nothing else", () => {
  it("validateUrlPublic still refuses other schemes and non-standard ports", () => {
    expect(() => validateUrlPublic(new URL("ftp://example.com/a.pdf"))).toThrow();
    expect(() => validateUrlPublic(new URL("https://example.com:8443/a.pdf"))).toThrow();
    expect(() => validateUrlPublic(new URL("https://example.com/a.pdf"))).not.toThrow();
  });

  it("the pipeline widens only the validator, and still hands safeFetch one", () => {
    const pipeline = src("services/urlAuditPipeline.ts");
    expect(pipeline).toContain(
      "validateUrl: privileged || input.anyPublicHost ? validateUrlPublic : validateUrlForFetch,",
    );
  });

  it("only /api/analyze-url sets anyPublicHost, and only for an anonymous off-list address", () => {
    const route = src("routes/analyze-url.ts");
    expect(route).toContain("const anyPublicHost = !privileged && !isOnApprovedList(url);");
    expect(route).toMatch(
      /router\.post\(\s*"\/analyze-url",\s*analyzeLimiter,\s*urlAnyHostLimiter,/,
    );
    for (const other of ["audit-url.ts", "audit-url-page.ts", "bulk-from-inventory.ts"]) {
      const text = src(`routes/${other}`);
      expect(text, other).not.toContain("anyPublicHost");
      expect(text, other).not.toContain("urlAnyHostLimiter");
    }
  });
});

describe("urlAnyHostLimiter", () => {
  let server: Server;
  let base = "";
  const savedToken = process.env.API_PRIVILEGED_TOKEN;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post("/t", urlAnyHostLimiter, (_req, res) => {
      res.json({ ok: true });
    });
    await new Promise<void>((r) => {
      server = app.listen(0, "127.0.0.1", r);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });
  afterEach(() => {
    if (savedToken === undefined) delete process.env.API_PRIVILEGED_TOKEN;
    else process.env.API_PRIVILEGED_TOKEN = savedToken;
  });

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/t`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("the budget is far below the general audit budget", () => {
    expect(RATE_LIMITS.urlAnyHost.max).toBeLessThanOrEqual(20);
    expect(RATE_LIMITS.urlAnyHost.windowMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it("counts off-list and malformed requests, then answers 429 with a usable message", async () => {
    const max = RATE_LIMITS.urlAnyHost.max;
    for (let i = 0; i < max; i++) {
      // Alternate a real off-list address with a body that names none.
      const res = await post(i % 2 ? { url: "https://example.com/a.pdf" } : {});
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
    const over = await post({ url: "https://example.org/b.pdf" });
    expect(over.status).toBe(429);
    const body = (await over.json()) as { error: string; code?: string };
    expect(body.error).toMatch(/upload the file/i);

    // The same caller, now over the any-host budget, is still served for an
    // approved host…
    const approved = await post({ url: "https://icjia.illinois.gov/a.pdf" });
    expect(approved.status).toBe(200);

    // …and a privileged caller is not counted here at all.
    process.env.API_PRIVILEGED_TOKEN = "t".repeat(48);
    const privileged = await post(
      { url: "https://example.org/b.pdf" },
      { authorization: `Bearer ${"t".repeat(48)}` },
    );
    expect(privileged.status).toBe(200);
  });
});

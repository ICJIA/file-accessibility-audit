/**
 * GET /api/openapi.json — the hand-written OpenAPI 3.1 description cannot go
 * stale: the routes actually mounted on the app (app.ts) are enumerated from
 * the Express router stack and compared, both ways, with the document's
 * paths. Add a route and this fails until the document describes it; remove
 * one and it fails until the description is gone.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { root } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/openapi-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  return { root };
});

let app: import("express").Express;
let server: Server;
let baseUrl = "";
let doc: any;

beforeAll(async () => {
  mkdirSync(root, { recursive: true });
  const { createApp } = await import("../app.js");
  app = createApp();
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", r);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  doc = await (await fetch(`${baseUrl}/api/openapi.json`)).json();
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

/**
 * Every "METHOD /path" the app answers, read from Express's own router
 * stack: routes registered on the app itself, and the routes of each router
 * mounted with app.use(prefix, router). Path parameters are written the
 * OpenAPI way (:id → {id}).
 */
function mountedRoutes(expressApp: any): string[] {
  const found: string[] = [];
  const openApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const add = (prefix: string, route: any) => {
    for (const method of Object.keys(route.methods)) {
      if (!route.methods[method] || !HTTP_METHODS.includes(method)) continue;
      const full = `${prefix}${route.path}`.replace(/\/+$/, "") || "/";
      found.push(`${method.toUpperCase()} ${openApiPath(full)}`);
    }
  };
  /** The literal prefix a mounted router answers under ("" for app.use(fn)). */
  const prefixOf = (layer: any): string => {
    for (const candidate of ["/api"]) {
      if (layer.regexp.test(candidate) && !layer.regexp.test("/")) return candidate;
    }
    // A router mounted somewhere this test does not know about must not be
    // silently enumerated under the wrong prefix.
    if (!layer.regexp.test("/"))
      throw new Error(`router mounted at an unknown prefix: ${layer.regexp}`);
    return "";
  };
  for (const layer of expressApp._router.stack) {
    if (layer.route) add("", layer.route);
    else if (layer.name === "router" && Array.isArray(layer.handle?.stack)) {
      const prefix = prefixOf(layer);
      for (const inner of layer.handle.stack) {
        if (inner.route) add(prefix, inner.route);
        // A router nested inside a router would be missed — refuse it.
        else if (inner.name === "router") throw new Error("nested router: extend this test");
      }
    }
  }
  return [...new Set(found)].sort();
}

function documentedRoutes(d: any): string[] {
  const out: string[] = [];
  for (const [path, item] of Object.entries<any>(d.paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out.sort();
}

describe("the document matches the routes that are mounted", () => {
  it("the enumeration finds the routes it should (the walk works)", () => {
    const routes = mountedRoutes(app);
    expect(routes).toContain("POST /api/analyze");
    expect(routes).toContain("GET /api/remediate/{jobId}/download");
    expect(routes).toContain("GET /api/health");
    expect(routes).toContain("GET /");
    expect(routes.length).toBeGreaterThanOrEqual(18);
  });

  it("every mounted route is described, and nothing is described that is not mounted", () => {
    expect(documentedRoutes(doc)).toEqual(mountedRoutes(app));
  });

  it("includes the two routes the hand-kept endpoint table had lost", () => {
    expect(doc.paths["/api/analyze-job"].post).toBeDefined();
    expect(doc.paths["/api/analyze-job/{id}"].get).toBeDefined();
    expect(doc.paths["/api/audit-url-page"].post).toBeDefined();
  });

  it("every path parameter in a path is declared, and no other", () => {
    for (const [path, item] of Object.entries<any>(doc.paths)) {
      const inPath = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        const declared = (op.parameters ?? [])
          .filter((p: any) => p.in === "path")
          .map((p: any) => p.name)
          .sort();
        expect(declared, `${method} ${path}`).toEqual(inPath);
        for (const p of op.parameters ?? []) {
          if (p.in === "path") expect(p.required, `${method} ${path} ${p.name}`).toBe(true);
        }
      }
    }
  });
});

describe("the document is a well-formed OpenAPI 3.1 description", () => {
  it("is served as JSON, with the API's own version", async () => {
    const res = await fetch(`${baseUrl}/api/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const { readApiVersion } = await import("../services/status.js");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe(readApiVersion());
    expect(doc.info.title.length).toBeGreaterThan(0);
  });

  it("is rate-limited like the other cheap GETs (mounted after the global limiter)", async () => {
    const res = await fetch(`${baseUrl}/api/openapi.json`);
    // express-rate-limit's standard headers are only present on a limited route.
    expect(res.headers.get("ratelimit-limit")).not.toBeNull();
  });

  it("every operation has a unique operationId, a summary and at least one response", () => {
    const ids: string[] = [];
    for (const [path, item] of Object.entries<any>(doc.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        expect(typeof op.operationId, `${method} ${path}`).toBe("string");
        expect(op.summary?.length ?? 0, `${method} ${path}`).toBeGreaterThan(0);
        expect(Object.keys(op.responses).length, `${method} ${path}`).toBeGreaterThan(0);
        ids.push(op.operationId);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every $ref resolves inside the document", () => {
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "$ref" && typeof v === "string") refs.push(v);
          else walk(v);
        }
      }
    };
    walk(doc);
    expect(refs.length).toBeGreaterThan(20);
    for (const ref of refs) {
      expect(ref.startsWith("#/"), ref).toBe(true);
      const target = ref
        .slice(2)
        .split("/")
        .reduce<any>((node, key) => node?.[key], doc);
      expect(target, ref).toBeDefined();
    }
  });
});

describe("the shared error schema", () => {
  it("requires error and code, and lists exactly the codes the API can send", async () => {
    const { API_ERROR_CODES } = await import("../services/apiError.js");
    const schema = doc.components.schemas.ApiError;
    expect(schema.required).toEqual(["error", "code"]);
    expect(schema.properties.code.enum).toEqual([...API_ERROR_CODES]);
    expect(schema.properties.details.type).toBe("string");
  });

  it("every 4xx / 5xx response of every operation uses it (bar the status document's 503)", () => {
    const resolve = (r: any) =>
      r.$ref ? doc.components.responses[r.$ref.split("/").pop() as string] : r;
    let checked = 0;
    for (const [path, item] of Object.entries<any>(doc.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        for (const [status, raw] of Object.entries<any>(op.responses)) {
          if (Number(status) < 400) continue;
          if (path === "/api/status" && status === "503") continue;
          const schema = resolve(raw).content?.["application/json"]?.schema;
          expect(schema, `${method} ${path} ${status}`).toEqual({
            $ref: "#/components/schemas/ApiError",
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("429 and 503 are the same shared responses everywhere, each with Retry-After", () => {
    for (const name of ["RateLimited", "ServerBusy"]) {
      expect(doc.components.responses[name].headers["Retry-After"]).toBeDefined();
    }
    for (const [path, item] of Object.entries<any>(doc.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        // Every route sits behind a rate limiter.
        expect(op.responses["429"], `${method} ${path}`).toEqual({
          $ref: "#/components/responses/RateLimited",
        });
        if (op.responses["503"] && path !== "/api/status") {
          expect(op.responses["503"], `${method} ${path}`).toEqual({
            $ref: "#/components/responses/ServerBusy",
          });
        }
      }
    }
  });
});

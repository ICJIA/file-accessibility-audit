/**
 * C5: status/receipt authorization in anonymous mode. Today (AUTH.
 * REQUIRE_LOGIN false, the production default), GET /remediate/:jobId/
 * status and /receipt have NO authorization check at all — anyone who
 * learns or guesses a jobId (a UUID, but still) can read another caller's
 * scores, filename, and full audit JSON. The fix requires the SAME
 * download token already returned in the POST /api/remediate creation
 * response (and already required by the existing /download route) on
 * these two reads as well, whenever `!AUTH.REQUIRE_LOGIN || !job.email`.
 * Unauthorized reads return 404 (not 401/403) so a caller without the
 * token cannot distinguish "wrong token" from "no such job."
 *
 * The route module is imported for real via extractHandler — the same
 * supertest-free pattern audit-url.test.ts / audit-url-page.test.ts /
 * auth.test.ts use: a router.get(path, ...middleware, handler)
 * registration stores each function as a Layer in `.stack`; the LAST
 * layer of the matching route is the async handler itself (the rate
 * limiter / requireEnabled / authMiddleware layers are never invoked, so
 * they need no mocking — req.user is set directly on the fake req to
 * simulate what authMiddleware would have produced).
 *
 * DB_PATH must be isolated before the dynamic imports below (db +
 * prepared statements are created at import time).
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "remediate-authz-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");

let jobs: typeof import("../services/remediationJobs.js");
let router: (typeof import("../routes/remediate.js"))["default"];

beforeAll(async () => {
  jobs = await import("../services/remediationJobs.js");
  router = (await import("../routes/remediate.js")).default;
});

function extractHandler(r: unknown, path: string): (req: any, res: any) => void | Promise<void> {
  const stack = (r as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };
  return res;
}

function makeReq(jobId: string, overrides: Record<string, unknown> = {}): any {
  return {
    params: { jobId },
    query: {},
    // Mirrors what authMiddleware sets in anonymous mode (AUTH.REQUIRE_LOGIN
    // false, the real production default in this app today).
    user: { email: "anonymous", authMethod: "session" },
    ...overrides,
  };
}

function makeAnonJob(overrides: Partial<Parameters<typeof jobs.createJob>[0]> = {}) {
  return jobs.createJob({
    email: null,
    inputFilename: "report.pdf",
    contentHash: "hash-1",
    pageCount: 3,
    ...overrides,
  });
}

for (const path of ["/remediate/:jobId/status", "/remediate/:jobId/receipt"] as const) {
  describe(`${path} — anonymous-mode token authorization (C5)`, () => {
    it("without a token → 404 (does not leak job existence)", () => {
      const { job } = makeAnonJob();
      const handler = extractHandler(router, path);
      const req = makeReq(job.id);
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(404);
      expect(res._json).toEqual({ error: "Job not found" });
    });

    it("with the correct token → 200", () => {
      const { job, downloadToken } = makeAnonJob();
      const handler = extractHandler(router, path);
      const req = makeReq(job.id, { query: { token: downloadToken } });
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.jobId).toBe(job.id);
    });

    it("with the WRONG token → 404 (same shape as missing — does not leak existence)", () => {
      const { job } = makeAnonJob();
      const handler = extractHandler(router, path);
      const req = makeReq(job.id, { query: { token: "not-the-real-token" } });
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(404);
      expect(res._json).toEqual({ error: "Job not found" });
    });

    it("an unknown jobId → 404 regardless of token", () => {
      const handler = extractHandler(router, path);
      const req = makeReq("00000000-0000-0000-0000-000000000000", {
        query: { token: "whatever" },
      });
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(404);
    });
  });
}

describe("logged-in owner path is unchanged (C5)", () => {
  afterEach(() => {
    vi.doUnmock("#config");
    vi.resetModules();
  });

  async function loadWithLoginRequired() {
    vi.resetModules();
    vi.doMock("#config", async (importOriginal) => {
      const actual = (await importOriginal()) as { AUTH: Record<string, unknown> };
      return { ...actual, AUTH: { ...actual.AUTH, REQUIRE_LOGIN: true } };
    });
    const jobsMod = await import("../services/remediationJobs.js");
    const routerMod = (await import("../routes/remediate.js")).default;
    return { jobsMod, routerMod };
  }

  for (const path of ["/remediate/:jobId/status", "/remediate/:jobId/receipt"] as const) {
    it(`${path}: owner match → 200, even with no token at all (unchanged)`, async () => {
      const { jobsMod, routerMod } = await loadWithLoginRequired();
      const { job } = jobsMod.createJob({
        email: "owner@illinois.gov",
        inputFilename: "r.pdf",
        contentHash: "h-owner",
        pageCount: 1,
      });
      const handler = extractHandler(routerMod, path);
      const req = {
        params: { jobId: job.id },
        query: {},
        user: { email: "owner@illinois.gov" },
      };
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(200);
    });

    it(`${path}: a DIFFERENT logged-in user → 403 (unchanged — NOT 404, since this is the pre-existing owner check, not the new token gate)`, async () => {
      const { jobsMod, routerMod } = await loadWithLoginRequired();
      const { job } = jobsMod.createJob({
        email: "owner@illinois.gov",
        inputFilename: "r.pdf",
        contentHash: "h-owner-2",
        pageCount: 1,
      });
      const handler = extractHandler(routerMod, path);
      const req = {
        params: { jobId: job.id },
        query: {},
        user: { email: "someone-else@illinois.gov" },
      };
      const res = makeRes();

      handler(req, res);

      expect(res._status).toBe(403);
      expect(res._json).toEqual({ error: "Forbidden" });
    });
  }
});

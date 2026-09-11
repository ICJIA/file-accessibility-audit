/**
 * Field-name limits on every multipart parser in the API (v1.156.4).
 *
 * multer 2.2.0 carried two advisories that one anonymous upload request could
 * reach, both through append-field's bracket parsing of TEXT field names:
 *
 *   - GHSA-wc9g-mqfw-jrwm: `a[4294967294]` builds a maximum-length sparse
 *     array, then `a[]` pushes onto it. The RangeError is thrown inside a
 *     busboy event, never reaches Express, and ends the process. multer 2.3.0
 *     catches it.
 *   - GHSA-535w-7cp7-47q4: `a[4294967294]` then `a[x]` walks all 4.29 billion
 *     slots synchronously. multer 2.3.0 only OFFERS limits.fieldArrayIndexLimit
 *     — it defaults to Infinity, so the upgrade alone leaves this open.
 *
 * These drive the REAL parsers over a real socket: each upload route's multer
 * middleware is lifted out of its router, the way remediateAuthz.test lifts
 * handlers, so the rate limiter and the remediation feature flag never run.
 * Per route, not once, because a limit set on one parser and forgotten on
 * another is exactly the bug worth catching — /api/remediate builds its own.
 *
 * The CPU payload is never sent whole. Its first field alone proves the limit
 * holds, and the second would freeze the suite on a build without it.
 *
 * DB_PATH must be isolated before the dynamic imports below (the routes pull
 * in modules that open the database at import time).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import express, { type RequestHandler } from "express";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "multipart-limits-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");

type ErrorHandler = (typeof import("../middleware/errorHandler.js"))["errorHandler"];

let errorHandler: ErrorHandler;
const parsers = new Map<string, RequestHandler>();

/** The multer middleware registered on `method path` of a router. */
function liftParser(router: unknown, path: string): RequestHandler {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods.post);
  const parser = layer?.route.stack.find((s: any) => s.handle.name === "multerMiddleware");
  if (!parser) throw new Error(`liftParser: no multer middleware on POST ${path}`);
  return parser.handle;
}

beforeAll(async () => {
  ({ errorHandler } = await import("../middleware/errorHandler.js"));
  parsers.set(
    "POST /api/analyze",
    liftParser((await import("../routes/analyze.js")).default, "/analyze"),
  );
  parsers.set(
    "POST /api/analyze-job",
    liftParser((await import("../routes/analyzeJob.js")).default, "/analyze-job"),
  );
  parsers.set(
    "POST /api/remediate",
    liftParser((await import("../routes/remediate.js")).default, "/remediate"),
  );
});

afterEach(() => vi.restoreAllMocks());

/** POSTs a multipart body through `parser` on an ephemeral local server.
 *  Reaching the stub handler means the parser ACCEPTED the body. */
async function post(
  parser: RequestHandler,
  build: (form: FormData) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // A rejected upload logs one warn line by design; keep the run quiet.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const app = express();
  app.post("/upload", parser, (_req, res) => {
    res.status(200).json({ accepted: true });
  });
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const form = new FormData();
    build(form);
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/upload`, { method: "POST", body: form });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const ROUTES = ["POST /api/analyze", "POST /api/analyze-job", "POST /api/remediate"];

describe.each(ROUTES)("%s — multipart field-name limits", (route) => {
  it("refuses a field name whose array index is above the limit", async () => {
    // The first half of GHSA-535w-7cp7-47q4. Refused before append-field can
    // build the array, as a client error rather than a server fault.
    const res = await post(parsers.get(route)!, (form) => {
      form.append("items[4294967294]", "x");
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Field name array index too large");
  });

  it("answers the GHSA-wc9g-mqfw-jrwm field pair with a 400 instead of dying", async () => {
    // On multer 2.2.0 this pair ended the process. A response of any kind
    // proves the process survived it; 400 proves it was classified correctly.
    const res = await post(parsers.get(route)!, (form) => {
      form.append("a[4294967294]", "x");
      form.append("a[]", "y");
    });
    expect(res.status).toBe(400);
  });

  it("still accepts the upload every client actually sends — one file part, no text fields", async () => {
    // The good twin. The web app and the CLI append a single "file" part and
    // nothing else, which is why the tightest limit costs nothing.
    const res = await post(parsers.get(route)!, (form) => {
      form.append(
        "file",
        new Blob(["%PDF-1.7\n%%EOF\n"], { type: "application/pdf" }),
        "report.pdf",
      );
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  });
});

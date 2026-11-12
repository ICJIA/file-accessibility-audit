/**
 * Review 2026-11-12, finding 8 — POST /api/bulk-from-inventory.
 *
 * A non-string `filename` on an entry that FAILS made sanitizeStoredFilename
 * throw inside the failure recorder — outside its try and outside the
 * per-entry catch — so the whole batch answered 500 and every result already
 * computed was lost. And the loop kept fetching and inserting after the
 * client had gone. Fixed in three places, each pinned here: entry shape is
 * validated up front, the sanitiser / recorder are total, and the loop stops
 * on disconnect.
 *
 * The REAL route handler, with the network, the engine and the DB replaced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const { safeFetch, analyzeDocument, runs } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  analyzeDocument: vi.fn(),
  runs: [] as Array<{ sql: string; args: unknown[] }>,
}));

vi.mock("../db/sqlite.js", () => ({
  default: {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(),
      run: vi.fn((...args: unknown[]) => void runs.push({ sql, args })),
    })),
  },
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  safeFetch,
}));
vi.mock("../services/analyzer.js", () => ({
  analyzeDocument,
  detectFileType: vi.fn(async () => "pdf"),
}));

import router, { parseInventory } from "../routes/bulk-from-inventory.js";
import { SafeFetchError } from "../services/safeFetch.js";
import { recordAuditFailure, sanitizeStoredFilename } from "../services/auditLog.js";

const handler: (req: any, res: any) => Promise<void> = (() => {
  const layer = (router as any).stack.find((l: any) => l.route?.path === "/bulk-from-inventory");
  return layer.route.stack[layer.route.stack.length - 1].handle;
})();

function makeRes() {
  const res: any = new EventEmitter();
  res.writableEnded = false;
  res._status = 200;
  res._json = undefined;
  res.status = (c: number) => ((res._status = c), res);
  res.json = (b: unknown) => {
    res._json = b;
    res.writableEnded = true;
    return res;
  };
  return res;
}
const makeReq = (lines: unknown[]) => ({
  body: { inventory: lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") },
  headers: {},
  get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : undefined),
});
const OK = {
  ok: true,
  status: 200,
  statusText: "OK",
  buffer: Buffer.from("%PDF-1.4"),
  finalUrl: "https://icjia.illinois.gov/a.pdf",
  resolvedIp: "93.184.216.34",
};
const url = (n: number) => `https://icjia.illinois.gov/files/${n}.pdf`;
const sharedReportInserts = () => runs.filter((r) => r.sql.includes("INSERT INTO shared_reports"));
const auditLogInserts = () => runs.filter((r) => r.sql.includes("INSERT INTO audit_log"));

beforeEach(() => {
  vi.clearAllMocks();
  runs.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  safeFetch.mockResolvedValue(OK);
  analyzeDocument.mockResolvedValue({ overallScore: 80, grade: "B", categories: [] });
});

describe("sanitizeStoredFilename / recordAuditFailure are total", () => {
  it.each([[42], [null], [undefined], [{ a: 1 }], [["x"]], [true]])(
    "sanitizeStoredFilename(%j) returns a safe name instead of throwing",
    (value) => {
      expect(sanitizeStoredFilename(value)).toBe("unnamed_file");
    },
  );

  it("still sanitises real names exactly as before", () => {
    expect(sanitizeStoredFilename("../../etc/pass\nwd<script>.pdf")).toBe("pass wd_script_.pdf");
  });

  it("recordAuditFailure never throws on a non-string filename, for either kind of event", () => {
    for (const eventType of ["bulk-from-inventory", "audit-url"] as const) {
      expect(() =>
        recordAuditFailure({
          eventType,
          privileged: false,
          filename: { not: "a string" } as never,
          reason: "fetch-failed",
        }),
      ).not.toThrow();
    }
    expect(auditLogInserts()).toHaveLength(2);
  });
});

describe("parseInventory validates entry shape up front", () => {
  it("skips lines that are valid JSON but not objects (null used to throw → 500)", () => {
    const text = [
      "null",
      "7",
      '"text"',
      "[1,2]",
      JSON.stringify({ category: "pdf", publicUrl: url(1) }),
    ].join("\n");
    const { entries, invalid, totalLineCount } = parseInventory(text, "pdf");
    expect(entries).toHaveLength(1);
    expect(invalid).toEqual([]);
    expect(totalLineCount).toBe(5);
  });

  it("coerces non-string filename / path / sha256 to the documented fallbacks", () => {
    const { entries } = parseInventory(
      JSON.stringify({
        category: "pdf",
        publicUrl: url(1),
        filename: 42,
        path: { x: 1 },
        sha256: 9,
      }),
      "pdf",
    );
    expect(entries).toEqual([
      { path: "", filename: "unnamed.pdf", category: "pdf", publicUrl: url(1), sha256: undefined },
    ]);
    // A usable path still names the file when filename is unusable.
    expect(
      parseInventory(
        JSON.stringify({ category: "pdf", publicUrl: url(1), filename: [], path: "docs/a.pdf" }),
        "pdf",
      ).entries[0]!.filename,
    ).toBe("docs/a.pdf");
  });

  it("rejects an entry whose publicUrl is not a string — individually", () => {
    const { entries, invalid } = parseInventory(
      [
        JSON.stringify({
          category: "pdf",
          publicUrl: { href: "x" },
          path: "bad.pdf",
          sha256: "abc",
        }),
        JSON.stringify({ category: "pdf", publicUrl: url(2) }),
      ].join("\n"),
      "pdf",
    );
    expect(entries).toHaveLength(1);
    expect(invalid).toEqual([
      {
        path: "bad.pdf",
        sha256: "abc",
        error: "invalid inventory entry: publicUrl must be a string",
      },
    ]);
  });

  it("ignores a non-string publicUrlBase in the header instead of throwing", () => {
    const text = [
      JSON.stringify({ kind: "filecap-header", metadata: { publicUrlBase: 12345 } }),
      JSON.stringify({ category: "pdf", path: "a.pdf" }),
    ].join("\n");
    expect(() => parseInventory(text, "pdf")).not.toThrow();
    expect(parseInventory(text, "pdf").entries).toEqual([]);
  });
});

describe("POST /api/bulk-from-inventory — one bad entry never costs the batch", () => {
  it("THE BUG: a failing entry with a non-string filename no longer 500s and loses earlier results", async () => {
    safeFetch
      .mockResolvedValueOnce(OK) // entry 1 audits fine
      .mockRejectedValueOnce(new SafeFetchError("network_error", "ECONNRESET")) // entry 2 fails
      .mockResolvedValueOnce(OK); // entry 3 audits fine
    const res = makeRes();
    await handler(
      makeReq([
        { category: "pdf", publicUrl: url(1), filename: "one.pdf", path: "one.pdf" },
        { category: "pdf", publicUrl: url(2), filename: { evil: true }, path: "two.pdf" },
        { category: "pdf", publicUrl: url(3), filename: "three.pdf", path: "three.pdf" },
      ]),
      res,
    );
    expect(res._status).toBe(200);
    expect(res._json.summary).toEqual({ total: 3, analyzed: 2, failed: 1, skipped: 0 });
    expect(res._json.results.map((r: any) => r.overallScore)).toEqual([80, undefined, 80]);
    expect(res._json.results[1].error).toMatch(/^network_error: /);
    // The failure was still recorded, under the fallback name.
    const failures = auditLogInserts().filter((r) => r.args[0] === "bulk-from-inventory-failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]!.args[1]).toBe("two.pdf");
  });

  it("an analysis failure on a non-string-filename entry is contained the same way", async () => {
    analyzeDocument
      .mockResolvedValueOnce({ overallScore: 80, grade: "B", categories: [] })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ETIMEDOUT" }));
    const res = makeRes();
    await handler(
      makeReq([
        { category: "pdf", publicUrl: url(1), filename: "one.pdf" },
        { category: "pdf", publicUrl: url(2), filename: 12345 },
      ]),
      res,
    );
    expect(res._status).toBe(200);
    expect(res._json.summary).toMatchObject({ analyzed: 1, failed: 1 });
  });

  it("a malformed entry is reported as its own failed result and never fetched", async () => {
    const res = makeRes();
    await handler(
      makeReq([
        "null",
        { category: "pdf", publicUrl: 99, path: "bad.pdf" },
        { category: "pdf", publicUrl: url(1), filename: "good.pdf", path: "good.pdf" },
      ]),
      res,
    );
    expect(res._status).toBe(200);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(res._json.summary).toEqual({ total: 2, analyzed: 1, failed: 1, skipped: 1 });
    expect(res._json.results[0]).toEqual({
      sha256: undefined,
      path: "bad.pdf",
      error: "invalid inventory entry: publicUrl must be a string",
    });
  });

  it("an inventory of only malformed entries answers 200 with their errors, not 400/500", async () => {
    const res = makeRes();
    await handler(makeReq([{ category: "pdf", publicUrl: false }]), res);
    expect(res._status).toBe(200);
    expect(res._json.summary).toMatchObject({ total: 1, analyzed: 0, failed: 1 });
  });
});

describe("POST /api/bulk-from-inventory — stops when the client has gone", () => {
  const entries = Array.from({ length: 6 }, (_, i) => ({
    category: "pdf",
    publicUrl: url(i + 1),
    filename: `${i + 1}.pdf`,
  }));

  it("stops fetching and storing after the connection closes mid-batch", async () => {
    const res = makeRes();
    let fetches = 0;
    safeFetch.mockImplementation(async () => {
      fetches++;
      if (fetches === 2) res.emit("close"); // client disconnects during entry 2
      return OK;
    });
    await handler(makeReq(entries), res);

    expect(fetches).toBe(2); // entries 3–6 were never fetched
    expect(sharedReportInserts()).toHaveLength(1); // only entry 1 was stored
    expect(res._json).toBeUndefined(); // nothing written to a dead socket
  });

  it("aborts the in-flight fetch through its signal, and records no failure for it", async () => {
    const res = makeRes();
    let signal: AbortSignal | undefined;
    safeFetch.mockImplementation(
      (_u: string, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = opts.signal;
          opts.signal?.addEventListener("abort", () =>
            reject(new SafeFetchError("aborted", "Fetch aborted: the client disconnected")),
          );
          setImmediate(() => res.emit("close"));
        }),
    );
    await handler(makeReq(entries), res);
    expect(signal?.aborted).toBe(true);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(auditLogInserts()).toHaveLength(0);
    expect(sharedReportInserts()).toHaveLength(0);
  });

  it("stores the engine version with every report, as /api/audit-url does", async () => {
    const { engineVersion } = await import("../services/engineVersion.js");
    const res = makeRes();
    await handler(makeReq(entries.slice(0, 2)), res);
    const inserts = sharedReportInserts();
    expect(inserts).toHaveLength(2);
    for (const ins of inserts) {
      expect(ins.sql).toContain("engine_version");
      expect(ins.args).toHaveLength(6);
      expect(ins.args[5]).toBe(engineVersion());
    }
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("a normal run is unaffected: every entry processed, and the close listener removed", async () => {
    const res = makeRes();
    await handler(makeReq(entries), res);
    expect(res._json.summary).toMatchObject({ total: 6, analyzed: 6, failed: 0 });
    expect(sharedReportInserts()).toHaveLength(6);
    expect(res.listenerCount("close")).toBe(0);
  });
});

/**
 * runPublist — concurrency, busy retries, and the exit status.
 *
 * 2026-11-12: `--concurrency` accepted up to 10 while the engine admits
 * ANALYSIS.MAX_CONCURRENT_ANALYSES at a time. The surplus stood in the
 * engine's line and was rejected with "Server busy" after 60 seconds; the
 * rejection was stored as a transient error, the document was left out of
 * the CSV, and the run exited 0. These tests pin the three repairs: the
 * clamp, the retry, and a non-zero exit that lists what is missing.
 *
 * The engine and the network are mocked; the cache is a real SQLite file in
 * a temp directory (the `runtime.cacheDir` seam), and the report is written
 * to that same directory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisResult } from "@file-audit/analyzer";
import { ANALYSIS } from "#config";

const analyzeDocument = vi.hoisted(() => vi.fn());
vi.mock("@file-audit/analyzer", () => ({ analyzeDocument }));
vi.mock("../lib/colors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/colors.js")>()),
  checkQpdf: () => true,
}));

import {
  runPublist,
  clampConcurrency,
  isBusyError,
  withBusyRetry,
  ENGINE_CONCURRENCY_LIMIT,
} from "../commands/publist.js";
import { initCache, upsertResult } from "../lib/cache.js";

class Exit extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

const busy = () =>
  Object.assign(new Error("Server busy — too many analyses queued. Please try again shortly."), {
    status: 503,
  });

const result = (filename: string, overallScore = 90) =>
  ({
    filename,
    fileType: "pdf",
    pageCount: 2,
    overallScore,
    grade: "A",
    isScanned: false,
    executiveSummary: "",
    categories: [],
    warnings: [],
  }) as unknown as AnalysisResult;

describe("clampConcurrency", () => {
  it("the limit is the engine's own", () => {
    expect(ENGINE_CONCURRENCY_LIMIT).toBe(ANALYSIS.MAX_CONCURRENT_ANALYSES);
  });
  it("never exceeds the engine limit, never drops below 1", () => {
    expect(clampConcurrency(10)).toBe(ENGINE_CONCURRENCY_LIMIT);
    expect(clampConcurrency(ENGINE_CONCURRENCY_LIMIT)).toBe(ENGINE_CONCURRENCY_LIMIT);
    expect(clampConcurrency(1)).toBe(1);
    expect(clampConcurrency(0)).toBe(1);
  });
});

describe("withBusyRetry", () => {
  const noSleep = async () => {};

  it("recognises the engine's refusal by status or by message", () => {
    expect(isBusyError(busy())).toBe(true);
    expect(isBusyError(new Error("Server busy — try again"))).toBe(true);
    expect(isBusyError(new Error("encrypted"))).toBe(false);
    expect(isBusyError(undefined)).toBe(false);
  });

  it("retries a busy engine and returns the eventual answer", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(busy())
      .mockResolvedValue(7);
    const slept: number[] = [];
    expect(await withBusyRetry(fn, [10, 20, 30], async (ms) => void slept.push(ms))).toBe(7);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([10, 20]);
  });

  it("gives up after the last delay and surfaces the busy error", async () => {
    const fn = vi.fn().mockRejectedValue(busy());
    await expect(withBusyRetry(fn, [1, 1], noSleep)).rejects.toThrow(/Server busy/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error that is about the document", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("encrypted"));
    await expect(withBusyRetry(fn, [1, 1], noSleep)).rejects.toThrow("encrypted");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("runPublist", () => {
  let dir: string;
  let out: string[];
  let err: string[];
  let csvPath: string;

  const pubs = (...names: string[]) => {
    const p = join(dir, "pubs.json");
    writeFileSync(
      p,
      JSON.stringify(
        names.map((n) => ({
          id: n,
          title: n,
          slug: n,
          fileURL: `https://example.test/${n}`,
          publicationDate: null,
          pubType: null,
          summary: null,
          tags: null,
        })),
      ),
    );
    return p;
  };

  async function run(...argv: string[]): Promise<number> {
    try {
      await runPublist(argv, { cacheDir: dir, busyRetryDelaysMs: [0, 0] });
      return 0;
    } catch (e) {
      if (e instanceof Exit) return e.code;
      throw e;
    }
  }

  /** Every URL downloads fine unless listed in `status`. */
  function stubFetch(status: Record<string, number> = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const code = status[url.split("/").pop()!] ?? 200;
        return new Response(code === 200 ? "bytes" : null, { status: code });
      }),
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "a11y-audit-publist-"));
    csvPath = join(dir, "out.csv");
    out = [];
    err = [];
    analyzeDocument.mockReset();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Exit(code ?? 0);
    }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true); // the progress bar
    vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a clean run writes the CSV and exits 0", async () => {
    stubFetch();
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => result(name));
    expect(await run("--from", pubs("a.pdf", "b.pdf"), "-o", csvPath)).toBe(0);
    const csv = readFileSync(csvPath, "utf8");
    expect(csv).toContain("a.pdf");
    expect(csv).toContain("b.pdf");
    expect(err.join("\n")).not.toContain("INCOMPLETE");
  });

  it("never runs more analyses at once than the engine admits, whatever -c says", async () => {
    stubFetch();
    let active = 0;
    let peak = 0;
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return result(name);
    });
    const names = Array.from({ length: 12 }, (_, i) => `f${i}.pdf`);
    expect(await run("--from", pubs(...names), "-o", csvPath, "-c", "10")).toBe(0);
    expect(peak).toBeLessThanOrEqual(ENGINE_CONCURRENCY_LIMIT);
    expect(peak).toBeGreaterThan(0);
    expect(err.join("\n")).toContain(`--concurrency 10 lowered to ${ENGINE_CONCURRENCY_LIMIT}`);
  });

  it("--concurrency 0 is a usage error", async () => {
    expect(await run("--from", pubs("a.pdf"), "-c", "0")).toBe(2);
  });

  it("a busy engine is retried, and the document lands in the report", async () => {
    stubFetch();
    analyzeDocument
      .mockRejectedValueOnce(busy())
      .mockImplementation(async (_b: Buffer, n: string) => result(n));
    expect(await run("--from", pubs("a.pdf"), "-o", csvPath)).toBe(0);
    expect(analyzeDocument).toHaveBeenCalledTimes(2);
    expect(readFileSync(csvPath, "utf8")).toContain("a.pdf");
  });

  it("an engine that stays busy fails the run: exit 1, the document listed, not in the CSV", async () => {
    stubFetch();
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      if (name === "stuck.pdf") throw busy();
      return result(name);
    });
    expect(await run("--from", pubs("ok.pdf", "stuck.pdf"), "-o", csvPath)).toBe(1);
    const text = err.join("\n");
    expect(text).toContain("INCOMPLETE:");
    expect(text).toContain("1 publication(s) could not be audited");
    expect(text).toContain("https://example.test/stuck.pdf");
    // The report is still written for what did succeed — and omits the failure.
    const csv = readFileSync(csvPath, "utf8");
    expect(csv).toContain("ok.pdf");
    expect(csv).not.toContain("stuck.pdf");
  });

  it("the failure is retried on the next run, which then exits 0", async () => {
    stubFetch();
    analyzeDocument.mockRejectedValue(new Error("analysis timed out"));
    expect(await run("--from", pubs("a.pdf"), "-o", csvPath)).toBe(1);
    expect(existsSync(csvPath)).toBe(false);

    analyzeDocument.mockReset().mockImplementation(async (_b: Buffer, n: string) => result(n));
    expect(await run("--from", pubs("a.pdf"), "-o", csvPath)).toBe(0);
    expect(readFileSync(csvPath, "utf8")).toContain("a.pdf");
  });

  it("a file that is gone (404) is reported but does not fail the run", async () => {
    stubFetch({ "gone.pdf": 404 });
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => result(name));
    expect(await run("--from", pubs("ok.pdf", "gone.pdf"), "-o", csvPath)).toBe(0);
    expect(out.join("\n")).toContain("1 publication(s) could not be downloaded");
    expect(out.join("\n")).toContain("https://example.test/gone.pdf");
  });

  it("a result cached by another engine version is audited again", async () => {
    stubFetch();
    const db = initCache(dir);
    upsertResult(
      db,
      {
        id: "a.pdf",
        title: "a.pdf",
        slug: "a",
        fileURL: "https://example.test/a.pdf",
        publicationDate: null,
        pubType: null,
        summary: null,
        tags: null,
      },
      result("a.pdf", 11),
      "0.0.1",
    );
    db.close();
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => result(name, 77));

    expect(await run("--from", pubs("a.pdf"), "-o", csvPath)).toBe(0);
    expect(analyzeDocument).toHaveBeenCalledTimes(1);
    expect(out.join("\n")).toContain("scored by a different engine version");

    // …and a second run at the same version is served from the cache.
    analyzeDocument.mockClear();
    expect(await run("--from", pubs("a.pdf"), "-o", csvPath)).toBe(0);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});

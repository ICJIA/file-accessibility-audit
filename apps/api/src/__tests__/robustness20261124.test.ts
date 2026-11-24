/**
 * Smaller robustness fixes, 2026-11-24 — each against the real thing:
 *
 *   a. A refused audit no longer leaves a veraPDF JVM running (a real child
 *      process, really killed).
 *   b. A remediation worker's stderr reaches the error log (a real child that
 *      really crashes while starting).
 *   d. A job already failed by the hard timeout cannot have a result attached
 *      afterwards.
 *   g. /api/bulk-from-inventory returns the same report link /api/audit-url
 *      does, and its limits come from the root config.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const { root, veraScript, pidFile, analysis, spawned } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/robustness-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  process.env.TMP_DIR = `${root}/tmp`;
  return {
    root,
    veraScript: `${root}/fake-verapdf.sh`,
    pidFile: `${root}/verapdf.pid`,
    analysis: { impl: null as null | (() => Promise<unknown>) },
    spawned: [] as Array<{ args: string[]; options: any }>,
  };
});

vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    REMEDIATION: {
      ...actual.REMEDIATION,
      VERAPDF_PATH: veraScript,
      VERAPDF_WCAG_ENABLED: false,
      VERAPDF_MAX_CONCURRENT: 1,
    },
  };
});

// The analysis itself is the one thing stubbed for (a): it is told to refuse.
vi.mock("../services/analyzer.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/analyzer.js")>()),
  detectFileType: async () => "pdf",
  analyzeDocument: () => analysis.impl!(),
}));

// For (b): the worker is replaced by a real process that fails while
// starting, launched with the very stdio the queue chose.
vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (cmd: string, args: string[], options: any) => {
      if (Array.isArray(args) && args.some((a) => String(a).endsWith("jobs/remediate.ts"))) {
        spawned.push({ args, options });
        return actual.spawn(
          process.execPath,
          ["-e", "console.error('worker boot crash: cannot find module x'); process.exit(7)"],
          { ...options, detached: false },
        );
      }
      return actual.spawn(cmd, args, options);
    },
  };
});

const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

beforeAll(() => {
  mkdirSync(root, { recursive: true });
  // Stands in for the veraPDF launcher: records its pid, then runs for far
  // longer than any test (the real one runs a JVM for up to 45 s).
  writeFileSync(veraScript, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 60\n`);
  chmodSync(veraScript, 0o755);
});

afterAll(async () => {
  const { stopCleanupInterval } = await import("../services/remediationCleanup.js");
  stopCleanupInterval();
  rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(pidFile, { force: true });
});

async function until(cond: () => boolean, ms = 8_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readPid = () => Number(readFileSync(pidFile, "utf8").trim());

describe("a. a refused audit stops its veraPDF run", () => {
  it("the analysis line is full (503): the veraPDF process is killed, its slot and temp copy released", async () => {
    const { performAudit } = await import("../services/analyzeCore.js");
    // Refused only once veraPDF is demonstrably running.
    analysis.impl = async () => {
      await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim().length > 0);
      throw Object.assign(new Error("Server busy"), { status: 503 });
    };

    const started = Date.now();
    await expect(performAudit(PDF, "a.pdf", false)).rejects.toMatchObject({ status: 503 });
    const pid = readPid();

    // Killed — not left to run out its 60 s (the real timeout is 45 s).
    await until(() => !alive(pid));
    expect(Date.now() - started).toBeLessThan(10_000);
    // The temp copy of the document is gone…
    await until(() => readdirSync(`${root}/tmp/file-audit-tmp`).length === 0);

    // …and the single veraPDF slot is free: the next audit's check starts at
    // once instead of queueing behind a run nobody is waiting for.
    rmSync(pidFile, { force: true });
    const { runVeraPdfChecksOnBuffer } = await import("../services/veraPdfBuffer.js");
    const abort = new AbortController();
    const next = runVeraPdfChecksOnBuffer(PDF, { wcag: false, signal: abort.signal });
    await until(
      () => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim().length > 0,
      3_000,
    );
    const nextPid = readPid();
    expect(nextPid).not.toBe(pid);
    abort.abort();
    const verdict = await next;
    // Aborted = "could not check", never a pass.
    expect(verdict.pdfUa.passed).toBe(false);
    await until(() => !alive(nextPid));
  });

  it("an encrypted-PDF style failure stops it too, without logging a veraPDF error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { performAudit } = await import("../services/analyzeCore.js");
    analysis.impl = async () => {
      await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim().length > 0);
      throw new Error("encrypted");
    };
    await expect(performAudit(PDF, "a.pdf", false)).rejects.toThrow("encrypted");
    const pid = readPid();
    await until(() => !alive(pid));
    await until(() => readdirSync(`${root}/tmp/file-audit-tmp`).length === 0);
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/veraPDF invocation failed/);
  });

  it("a signal that is already aborted starts nothing and writes nothing", async () => {
    const { runVeraPdfChecksOnBuffer } = await import("../services/veraPdfBuffer.js");
    const abort = new AbortController();
    abort.abort();
    const verdict = await runVeraPdfChecksOnBuffer(PDF, { wcag: false, signal: abort.signal });
    expect(verdict.pdfUa.available).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
    expect(readdirSync(`${root}/tmp/file-audit-tmp`)).toEqual([]);
  });
});

describe("b. a remediation worker's stderr reaches the error log", () => {
  it("a worker that crashes while starting leaves its message in today's errors-*.log", async () => {
    const { spawnWorker } = await import("../services/remediationQueue.js");
    const { errorLogFileName } = await import("../services/errorLog.js");
    const { localDate } = await import("../services/activityDays.js");
    const { DEPLOY } = await import("#config");

    const child = spawnWorker("00000000-0000-4000-8000-000000000001");
    await new Promise((r) => child.once("exit", r));

    // stdin and stdout are still discarded; stderr is a file descriptor.
    const { options } = spawned.at(-1)!;
    expect(options.stdio[0]).toBe("ignore");
    expect(options.stdio[1]).toBe("ignore");
    expect(typeof options.stdio[2]).toBe("number");
    expect(options.detached).toBe(true);

    const file = `${root}/logs/${errorLogFileName(localDate(Date.now(), DEPLOY.LOCAL_TIME_ZONE))}`;
    await until(() => existsSync(file) && readFileSync(file, "utf8").includes("worker boot crash"));
    // The same file the API's own errors go to: pruned by the same rule
    // (pruneErrorLogs matches errors-YYYY-MM-DD.log), owner-only.
    const { statSync } = await import("node:fs");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(`${root}/logs`).mode & 0o777).toBe(0o700);
    const { pruneErrorLogs } = await import("../services/errorLog.js");
    expect(
      pruneErrorLogs(`${root}/logs`, Date.now() + 400 * 86_400_000, 30, DEPLOY.LOCAL_TIME_ZONE),
    ).toBe(1);
    expect(existsSync(file)).toBe(false);
  });

  it("the worker still starts when the log cannot be opened", async () => {
    const queue = await import("../services/remediationQueue.js");
    const prev = process.env.ACTIVITY_LOG_DIR;
    // A path under a regular FILE: the directory cannot be created.
    writeFileSync(`${root}/not-a-dir`, "x");
    process.env.ACTIVITY_LOG_DIR = `${root}/not-a-dir/logs`;
    try {
      expect(queue.openWorkerStderr()).toBe("ignore");
      const child = queue.spawnWorker("00000000-0000-4000-8000-000000000002");
      await new Promise((r) => child.once("exit", r));
      expect(spawned.at(-1)!.options.stdio).toEqual(["ignore", "ignore", "ignore"]);
    } finally {
      process.env.ACTIVITY_LOG_DIR = prev;
    }
  });
});

describe("d. the first outcome of an analyze job is the only one", () => {
  it("a result that arrives after the hard-timeout 504 is not attached", async () => {
    const jobs = await import("../services/analyzeJobs.js");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      jobs._resetAnalyzeJobs();
      const { id, token } = jobs.createAnalyzeJob(true)!;
      vi.setSystemTime(Date.now() + jobs.JOB_HARD_TIMEOUT_MS + 1_000);
      // The sweep (run on any access) fails the job…
      expect(jobs.hasAnalyzeJobCapacity()).toBe(true);
      // …and then the pipeline settles after all.
      jobs.finishJob(id, {
        result: { filename: "late.pdf", overallScore: 100, grade: "A" } as any,
      });

      const status = jobs.pollAnalyzeJob(id, token)!;
      expect(status.done).toBe(true);
      expect(status.error?.status).toBe(504);
      expect(status.error?.body.code).toBe("TIMEOUT");
      expect(status.result).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late ERROR cannot replace a delivered result either", async () => {
    const jobs = await import("../services/analyzeJobs.js");
    jobs._resetAnalyzeJobs();
    const { id, token } = jobs.createAnalyzeJob(false)!;
    jobs.finishJob(id, { result: { filename: "a.docx", overallScore: 90, grade: "A" } as any });
    jobs.finishJob(id, {
      error: { status: 500, body: { error: "late", code: "INTERNAL" } },
    });
    const status = jobs.pollAnalyzeJob(id, token)!;
    expect(status.result?.filename).toBe("a.docx");
    expect(status.error).toBeUndefined();
  });
});

describe("g. /api/bulk-from-inventory", () => {
  it("returns the report PAGE link, in the shape /api/audit-url returns", async () => {
    const { buildReportUrl } = await import("../routes/bulk-from-inventory.js");
    const { DEPLOY } = await import("#config");
    const id = "a".repeat(32);
    expect(buildReportUrl(id)).toBe(`${DEPLOY.DEV_FRONTEND_URL}/report/${id}`);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(buildReportUrl(id)).toBe(`${DEPLOY.PRODUCTION_URL}/report/${id}`);
    } finally {
      process.env.NODE_ENV = prev;
    }
    // Same construction as audit-url.ts — and no relative API path left.
    const bulk = readFileSync(new URL("../routes/bulk-from-inventory.ts", import.meta.url), "utf8");
    const auditUrl = readFileSync(new URL("../routes/audit-url.ts", import.meta.url), "utf8");
    expect(bulk).toContain("result.reportUrl = buildReportUrl(id);");
    expect(bulk).not.toContain("`/api/reports/${id}`");
    expect(auditUrl).toContain("return `${getReportBaseUrl()}/report/${id}`;");
    expect(bulk).toContain("return `${getReportBaseUrl()}/report/${id}`;");
  });

  it("its limits are the root config's, and the per-file cap is the upload cap", async () => {
    const { ANALYSIS, BULK_INVENTORY } = await import("#config");
    expect(BULK_INVENTORY.MAX_INVENTORY_BYTES).toBe(5 * 1024 * 1024);
    expect(BULK_INVENTORY.JSON_BODY_LIMIT_BYTES).toBe(1024 * 1024);
    expect(BULK_INVENTORY.MAX_FILES_PER_REQUEST).toBe(100);
    expect(BULK_INVENTORY.FETCH_TIMEOUT_MS).toBe(30_000);
    const src = readFileSync(new URL("../routes/bulk-from-inventory.ts", import.meta.url), "utf8");
    expect(src).toContain("const MAX_INVENTORY_BYTES = BULK_INVENTORY.MAX_INVENTORY_BYTES;");
    expect(src).toContain("const MAX_FILE_BYTES = ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024;");
    expect(src).toContain("const MAX_FILES_PER_REQUEST = BULK_INVENTORY.MAX_FILES_PER_REQUEST;");
    expect(src).toContain("const FETCH_TIMEOUT_MS = BULK_INVENTORY.FETCH_TIMEOUT_MS;");
    expect(ANALYSIS.MAX_FILE_SIZE_MB).toBeGreaterThan(0);
    // The body parsers read the same numbers the messages quote.
    const parsers = readFileSync(new URL("../middleware/bodyParsers.ts", import.meta.url), "utf8");
    expect(parsers).toContain("express.json({ limit: BULK_INVENTORY.JSON_BODY_LIMIT_BYTES })");
    expect(parsers).toContain("limit: BULK_INVENTORY.MAX_INVENTORY_BYTES");
  });

  it("an entry limit still stops the parse at MAX_FILES_PER_REQUEST", async () => {
    const { parseInventory } = await import("../routes/bulk-from-inventory.js");
    const { BULK_INVENTORY } = await import("#config");
    const lines = Array.from({ length: BULK_INVENTORY.MAX_FILES_PER_REQUEST + 25 }, (_, i) =>
      JSON.stringify({
        category: "pdf",
        path: `${i}.pdf`,
        publicUrl: `https://icjia.illinois.gov/${i}.pdf`,
      }),
    ).join("\n");
    expect(parseInventory(lines, "pdf").entries).toHaveLength(BULK_INVENTORY.MAX_FILES_PER_REQUEST);
  });
});

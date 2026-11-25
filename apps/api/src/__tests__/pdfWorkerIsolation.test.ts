/**
 * PDF analysis runs in a process of its own and is KILLED when its time or
 * memory runs out (red-team review 2026-11-25, finding 1 — High).
 *
 * Before: pdf.js ran inside the API. A crafted 1.2 MB PDF whose page tree
 * repeats one page 200,000 times held the whole service at 100% CPU for
 * minutes, and the 120 s timeout never fired, because a timeout cannot run
 * on the thread it is timing.
 *
 * These tests use the real thing: a real child process, the real engines, a
 * real hostile file. Nothing here is mocked.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYSIS } from "#config";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import { defaultPdfRunLimits, runPdfInWorker } from "@file-audit/analyzer/pdfRunner";
import { WATCHDOG_SOURCE, analyzePdfInProcess } from "@file-audit/analyzer/pdfWorker";
import { repeatedPagePdf } from "./helpers/hostilePdf.js";

// A fixture that is committed with the tests (the documents under controls/
// are not all in the repository, so CI does not have them).
const REAL_PDF = readFileSync(resolve(__dirname, "fixtures/accessible.pdf"));
const src = (p: string) =>
  readFileSync(resolve(__dirname, "../../../../packages/analyzer/src", p), "utf8");

/** Is a process with this pid still there? Signal 0 tests without signalling. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True once the process is gone, allowing the OS a moment to finish with one
 *  that has just been killed. */
async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** Runs `work` while sampling this process's event loop every 20 ms; returns
 *  the longest gap between samples. A blocked loop shows up as one long gap. */
async function longestStall<T>(work: () => Promise<T>): Promise<{ value: T; stallMs: number }> {
  let stallMs = 0;
  let last = Date.now();
  const probe = setInterval(() => {
    const now = Date.now();
    stallMs = Math.max(stallMs, now - last);
    last = now;
  }, 20);
  try {
    return { value: await work(), stallMs };
  } finally {
    clearInterval(probe);
  }
}

describe("a PDF is analysed in a separate process", () => {
  it("gives the same result as the pipeline run in process", async () => {
    const viaChild = await analyzePDF(REAL_PDF, "report.pdf");
    const inProcess = await analyzePdfInProcess(REAL_PDF);
    expect(viaChild.pageCount).toBe(inProcess.pageCount);
    expect(viaChild.pdfMetadata).toEqual(inProcess.metadata);
    expect(viaChild.overallScore).toBe(inProcess.scoring.overallScore);
    expect(viaChild.grade).toBe(inProcess.scoring.grade);
    expect(viaChild.categories).toEqual(inProcess.scoring.categories);
    expect(viaChild.filename).toBe("report.pdf");
    expect(viaChild.fileType).toBe("pdf");
  }, 60_000);

  it("analyzePDF itself no longer parses anything in this process", () => {
    const analyzer = src("pdfAnalyzer.ts");
    expect(analyzer).toContain("await runPdfInWorker(buffer)");
    expect(analyzer).not.toMatch(/analyzeWithPdfjs\(|analyzeWithQpdfAsync\(/);
    // …and the engines are not loaded here either: only their TYPES are.
    expect(analyzer).not.toMatch(/^import \{[^}]*\} from "\.\/(pdfjsService|qpdfService)\.js";/m);
  });
});

describe("a PDF that never yields is killed, and the service stays up", () => {
  it("the 200,000-page file is stopped at the limit; this process never stalls", async () => {
    const hostile = repeatedPagePdf(200_000);
    expect(hostile.length).toBeLessThan(2 * 1024 * 1024); // a small upload

    const started = Date.now();
    let pid = 0;
    const { value: outcome, stallMs } = await longestStall(() =>
      runPdfInWorker(
        hostile,
        {
          ...defaultPdfRunLimits(),
          // Seconds, not the production two minutes — the mechanism is the same.
          pdfjsPhaseMs: 4_000,
        },
        (p) => (pid = p),
      ).then(
        () => "finished" as const,
        (err: { code?: string; killed?: boolean }) => err,
      ),
    );
    const took = Date.now() - started;

    expect(outcome).toMatchObject({ killed: true, code: "ETIMEDOUT" });
    // Stopped a few seconds after the limit — not minutes later.
    expect(took).toBeLessThan(25_000);
    // The whole point: while that file was being parsed, THIS process (the
    // API, in production) went on answering. In process, the stall equalled
    // the entire run.
    expect(stallMs).toBeLessThan(1_000);
    // Nothing is left behind: the process that was parsing it no longer exists.
    expect(pid).toBeGreaterThan(0);
    expect(await gone(pid)).toBe(true);
  }, 60_000);

  it("a process that uses too much memory is stopped by its own watchdog", async () => {
    let pid = 0;
    const outcome = await runPdfInWorker(
      REAL_PDF,
      {
        ...defaultPdfRunLimits(),
        // Any Node process is past 16 MB, so this trips at the first look.
        maxRssBytes: 16 * 1024 * 1024,
      },
      (p) => (pid = p),
    ).then(
      () => "finished" as const,
      (err: { code?: string; killed?: boolean; message?: string }) => err,
    );
    expect(outcome).toMatchObject({ killed: true, code: "PDF_RESOURCE_LIMIT" });
    expect((outcome as { message: string }).message).toMatch(/more memory or time/);
    expect(await gone(pid)).toBe(true);
  }, 30_000);

  it("a slot is free again after a kill: the next real PDF is analysed", async () => {
    await runPdfInWorker(REAL_PDF, {
      ...defaultPdfRunLimits(),
      maxRssBytes: 16 * 1024 * 1024,
    }).catch(() => undefined);
    const ok = await analyzePDF(REAL_PDF, "after.pdf");
    expect(ok.grade).toBeTruthy();
  }, 60_000);
});

describe("the watchdog acts when nobody else can", () => {
  /** A process whose main thread spins forever, guarded only by the watchdog. */
  function spinWithWatchdog(workerData: Record<string, number>): Promise<NodeJS.Signals | null> {
    const program = `
      const { Worker } = require("node:worker_threads");
      new Worker(${JSON.stringify(WATCHDOG_SOURCE)}, { eval: true, workerData: ${JSON.stringify(workerData)} });
      setTimeout(() => { for (;;) {} }, 100);
    `;
    return new Promise((done) => {
      const child = spawn(process.execPath, ["-e", program], { stdio: "ignore", detached: true });
      const giveUp = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* gone */
        }
      }, 15_000);
      child.once("exit", (_code, signal) => {
        clearTimeout(giveUp);
        done(signal);
      });
    });
  }

  it("kills a stuck process whose parent has gone away", async () => {
    const started = Date.now();
    // parentPid 1 is never this test's pid, so the watchdog sees "parent gone".
    const signal = await spinWithWatchdog({
      parentPid: 1,
      maxRssBytes: Number.MAX_SAFE_INTEGER,
      hardDeadlineMs: 10 * 60_000,
    });
    expect(signal).toBe("SIGKILL");
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);

  it("kills a stuck process at its absolute deadline, parent or no parent", async () => {
    const started = Date.now();
    const signal = await spinWithWatchdog({
      parentPid: process.pid,
      maxRssBytes: Number.MAX_SAFE_INTEGER,
      hardDeadlineMs: 1_000,
    });
    expect(signal).toBe("SIGKILL");
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);
});

describe("the limits are set where an operator can see them", () => {
  it("memory limits leave room for two analyses beside the API on the production server", () => {
    expect(ANALYSIS.PDF_WORKER_MAX_OLD_SPACE_MB).toBeLessThan(ANALYSIS.PDF_WORKER_MAX_RSS_MB);
    // 4 GB droplet: two workers, the API (768 MB cap) and headroom.
    expect(ANALYSIS.MAX_CONCURRENT_ANALYSES * ANALYSIS.PDF_WORKER_MAX_RSS_MB).toBeLessThanOrEqual(
      2_048,
    );
  });

  it("each pass keeps its own time limit, and the child runs without the API's secrets", () => {
    const limits = defaultPdfRunLimits();
    expect(limits.qpdfPhaseMs).toBeGreaterThanOrEqual(ANALYSIS.QPDF_TIMEOUT_MS);
    expect(limits.pdfjsPhaseMs).toBeGreaterThanOrEqual(ANALYSIS.PDFJS_TIMEOUT_MS);
    expect(limits.pdfjsPhaseMs).toBeLessThanOrEqual(ANALYSIS.PDFJS_TIMEOUT_MS + 10_000);
    const runner = src("pdfRunner.ts");
    expect(runner).toContain("env: buildChildSpawnEnv(),");
    expect(runner).toContain("detached: true,");
    expect(runner).toMatch(/process\.kill\(-pid, "SIGKILL"\)/);
  });
});

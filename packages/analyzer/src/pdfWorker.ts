/**
 * Child-process entry point for PDF analysis + scoring.
 *
 * WHY a separate process (red-team review 2026-11-25, finding 1 — High).
 * pdf.js used to run inside the API's own process. On a crafted PDF its page
 * loops never return to the event loop, so NOTHING else in that process ran:
 * not the 120 s `withTimeout`, not the abort signal, not another visitor's
 * request, not `/api/health`. Measured: a 1.2 MB file whose page tree repeats
 * one page 200,000 times held 100% CPU for over seven minutes at 1.1 GB; a
 * 385 KB file with one 50 MB content stream peaked at 1.5 GB against the
 * API's 768 MB cap. A timeout that runs on the same thread as the work it
 * times cannot fire while that work refuses to yield.
 *
 * So the work runs HERE, in a process of its own, and the parent
 * (pdfRunner.ts) keeps the clock. When the clock runs out the parent sends
 * SIGKILL, which no amount of busy JavaScript can ignore. The same move was
 * made for Word, PowerPoint and Excel in ooxmlWorker.ts; see that file for
 * why this is a child_process and not a worker_thread under tsx.
 *
 * qpdf's JSON is parsed here too (finding 4): a PDF with hundreds of
 * thousands of objects cost the API process ~460 MB in `JSON.parse`. It now
 * costs this process that, and this process is disposable.
 *
 * THE WATCHDOG. Two things the parent cannot do for us:
 *   - if the PARENT dies (a deploy, a crash) while this process is stuck in a
 *     loop, nobody is left to kill it;
 *   - the parent cannot see how much memory this process is using.
 * A blocked main thread cannot check either. So a small worker thread — its
 * own event loop, plain JavaScript, no imports to resolve — looks four times
 * a second and kills this whole process group (this process and any qpdf it
 * started) when the parent is gone, when memory passes the limit, or when an
 * absolute deadline passes.
 *
 * Transport contract with pdfRunner.ts: the parent spawns this file with
 * `serialization:'advanced'` IPC and sends `{ buffer, limits }`. This
 * process replies with zero or more `{ stage }` notes and then exactly one
 * result:
 *   { ok: true,  pageCount, metadata, scoring }
 *   { ok: false, code?, message, killed?, status? }
 * then exits.
 */
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { analyzeWithQpdfAsync } from "./qpdfService.js";
import { analyzeWithPdfjs, type PdfMetadata } from "./pdfjsService.js";
import { scoreDocument, type ScoringResult } from "./scorer.js";
import { ANALYSIS } from "#config";

/** How long a timed-out pdfjs pass is given to notice its abort signal and
 *  tear down before the error is reported regardless. */
const PDFJS_ABORT_GRACE_MS = 2_000;

export interface PdfWorkerLimits {
  /** Resident memory above which the watchdog kills this process. */
  maxRssBytes: number;
  /** Absolute lifetime of this process, whatever the parent does. */
  hardDeadlineMs: number;
}

export interface PdfWorkerRequest {
  buffer: Buffer;
  limits: PdfWorkerLimits;
}

/** A progress note: which pass is starting. The parent restarts its clock on
 *  "pdfjs" so each pass keeps its own time limit. */
export interface PdfWorkerStage {
  stage: "pdfjs";
}

export interface PdfWorkerSuccess {
  ok: true;
  pageCount: number;
  metadata: PdfMetadata;
  scoring: ScoringResult;
}

export interface PdfWorkerFailure {
  ok: false;
  code?: string;
  message: string;
  killed?: boolean;
  status?: number;
}

export type PdfWorkerResult = PdfWorkerSuccess | PdfWorkerFailure;
export type PdfWorkerMessage = PdfWorkerStage | PdfWorkerResult;

/**
 * Reject if `promise` doesn't settle within `ms`. The rejection carries
 * `killed: true` and `code: 'ETIMEDOUT'` so the analyze routes map it to a
 * 504 the same way a QPDF timeout is handled.
 *
 * This is a COURTESY timeout: it works whenever the work yields to the event
 * loop, and gives a clean error when it does. It cannot fire while the work
 * holds the thread — that case is the parent's SIGKILL.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(label) as Error & {
        killed?: boolean;
        code?: string;
      };
      err.killed = true;
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * The PDF pipeline itself: qpdf to completion, then pdf.js, then the scorer.
 * This is the body `analyzePDF` had until 2026-11-25, unchanged in what it
 * computes — only where it runs moved. Exported so the pipeline can be
 * unit-tested in process (no child spawn), exactly as `analyzeAndScore` is
 * for Office files.
 *
 * `onStage("pdfjs")` is called when qpdf has finished and pdf.js is about to
 * start.
 */
export async function analyzePdfInProcess(
  buffer: Buffer,
  onStage?: (stage: PdfWorkerStage["stage"]) => void,
): Promise<PdfWorkerSuccess> {
  // QPDF FIRST, to completion — then pdfjs. These two used to share one
  // `Promise.all`, and that overlap was a trap rather than a saving: pdfjs
  // runs on this thread, so Node only drains QPDF's multi-megabyte JSON off
  // its stdout pipe between pdfjs page chunks. QPDF would sit blocked on a
  // full pipe while its own subprocess timeout ran, which made
  // QPDF_TIMEOUT_MS measure the whole audit's wall clock instead of QPDF's
  // own work. On the production droplet a 246-page report measured 1.7s for
  // QPDF alone but 15.7s beside pdfjs, and with the two veraPDF JVMs also
  // competing for the two cores QPDF was killed at 30s — reported to the
  // author as "this file is too complex", which it was not (v1.109.0).
  const qpdfResult = await analyzeWithQpdfAsync(buffer);
  onStage?.("pdfjs");

  // The signal makes the extraction quit at its next page boundary and tear
  // the document down (2026-11-12) — for the files that DO yield.
  const pdfjsAbort = new AbortController();
  const pdfjsWork = analyzeWithPdfjs(buffer, { signal: pdfjsAbort.signal });
  let pdfjsResult: Awaited<typeof pdfjsWork>;
  try {
    pdfjsResult = await withTimeout(
      pdfjsWork,
      ANALYSIS.PDFJS_TIMEOUT_MS,
      "pdfjs extraction timed out",
    );
  } catch (err) {
    pdfjsAbort.abort();
    const grace = Math.min(PDFJS_ABORT_GRACE_MS, ANALYSIS.PDFJS_TIMEOUT_MS);
    await Promise.race([
      pdfjsWork.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, grace)),
    ]);
    throw err;
  }

  if (qpdfResult.error && pdfjsResult.error) {
    const error = new Error("PDF parsing failed") as Error & {
      code?: string;
    };
    error.code = "PDF_PARSE_FAILED";
    throw error;
  }

  return {
    ok: true,
    pageCount: pdfjsResult.pageCount,
    metadata: pdfjsResult.metadata,
    scoring: scoreDocument(qpdfResult, pdfjsResult),
  };
}

/**
 * The watchdog's whole program, as text: a worker thread started with
 * `eval: true` loads no module of ours, so it needs none of tsx's resolution
 * (which worker threads do not inherit — see ooxmlWorker.ts). CommonJS on
 * purpose; an eval'd worker is not an ES module.
 *
 * Kills the process GROUP first (this process leads its own group — the
 * parent spawns it detached — so that takes any running qpdf with it), then
 * this process directly in case it leads no group.
 */
export const WATCHDOG_SOURCE = `
const { workerData } = require("node:worker_threads");
const started = Date.now();
setInterval(() => {
  let over = false;
  try {
    over =
      process.ppid !== workerData.parentPid ||
      process.memoryUsage().rss > workerData.maxRssBytes ||
      Date.now() - started > workerData.hardDeadlineMs;
  } catch {
    over = true;
  }
  if (!over) return;
  try { process.kill(-process.pid, "SIGKILL"); } catch {}
  try { process.kill(process.pid, "SIGKILL"); } catch {}
}, 250);
`;

export function startWatchdog(limits: PdfWorkerLimits, parentPid: number = process.ppid): Worker {
  return new Worker(WATCHDOG_SOURCE, {
    eval: true,
    workerData: { parentPid, ...limits },
  });
}

// Only run the IPC message loop when this FILE is the program that was
// started (pdfRunner.ts spawns `node … pdfWorker.ts`) and there is an IPC
// channel. Checking `process.send` alone is not enough: a test runner's own
// worker processes have one too, and importing this module there (for
// `analyzePdfInProcess`) would answer the runner's messages as if they were
// requests — and then exit the runner.
const startedAsProgram =
  typeof process.argv[1] === "string" && process.argv[1] === fileURLToPath(import.meta.url);
if (startedAsProgram && typeof process.send === "function") {
  process.once("message", (msg: PdfWorkerRequest) => {
    void (async () => {
      startWatchdog(msg.limits);
      let result: PdfWorkerResult;
      try {
        result = await analyzePdfInProcess(Buffer.from(msg.buffer), (stage) => {
          process.send!({ stage } satisfies PdfWorkerStage);
        });
      } catch (err: unknown) {
        const e = err as
          { code?: string; message?: string; killed?: boolean; status?: number } | null | undefined;
        result = {
          ok: false,
          code: e?.code,
          message: e?.message ?? String(err),
          killed: e?.killed,
          status: e?.status,
        };
      }
      // Send the reply, then exit once it has flushed so the process never
      // lingers. If the parent already killed us, send fails — ignore it.
      process.send!(result, (sendErr: Error | null) => {
        process.exit(sendErr ? 1 : 0);
      });
    })();
  });
}

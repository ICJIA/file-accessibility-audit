/**
 * Parent side of the killable PDF analysis — see pdfWorker.ts for why PDF
 * work runs in a process of its own (red-team review 2026-11-25, finding 1).
 *
 * The parent holds the clock and the kill switch:
 *
 *   qpdf pass    QPDF_TIMEOUT_MS (qpdf's own subprocess timeout, enforced in
 *                the child) plus an allowance for the child to start;
 *   pdf.js pass  PDFJS_TIMEOUT_MS, counted from the child's "pdfjs" note,
 *                plus a short grace so the child's own clean timeout error
 *                (when the work yields) arrives before the kill does.
 *
 * On either deadline the child's whole process group gets SIGKILL. The child
 * is spawned `detached` precisely so that it leads a group of its own: the
 * kill then takes the qpdf it may have started with it, and nothing else.
 *
 * Settlement mirrors ooxmlRunner.ts: a timeout does not settle the promise
 * until the OS confirms the child is gone (or a short grace passes), so the
 * caller's concurrency slot is not released while the dying process still
 * holds its memory.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildChildSpawnEnv } from "./childSpawnEnv.js";
import { resolveTsxSpecifier } from "./ooxmlRunner.js";
import type {
  PdfWorkerMessage,
  PdfWorkerRequest,
  PdfWorkerResult,
  PdfWorkerSuccess,
} from "./pdfWorker.js";
import { ANALYSIS } from "#config";

const WORKER_PATH = fileURLToPath(new URL("./pdfWorker.ts", import.meta.url));
const TSX_SPECIFIER = resolveTsxSpecifier();

/** Wait this long for the OS to confirm a killed child has exited. */
const TIMEOUT_KILL_GRACE_MS = 2_000;

export interface PdfRunLimits {
  /** Budget for the child to start and finish its qpdf pass. */
  qpdfPhaseMs: number;
  /** Budget for the pdf.js pass, from the child's "pdfjs" note. */
  pdfjsPhaseMs: number;
  /** Resident-memory ceiling for the child (its watchdog enforces it). */
  maxRssBytes: number;
  /** V8 heap ceiling for the child, in MB. */
  maxOldSpaceMb: number;
}

export function defaultPdfRunLimits(): PdfRunLimits {
  return {
    qpdfPhaseMs: ANALYSIS.QPDF_TIMEOUT_MS + ANALYSIS.PDF_WORKER_STARTUP_ALLOWANCE_MS,
    pdfjsPhaseMs: ANALYSIS.PDFJS_TIMEOUT_MS + ANALYSIS.PDF_WORKER_KILL_GRACE_MS,
    maxRssBytes: ANALYSIS.PDF_WORKER_MAX_RSS_MB * 1024 * 1024,
    maxOldSpaceMb: ANALYSIS.PDF_WORKER_MAX_OLD_SPACE_MB,
  };
}

type RunError = Error & { killed?: boolean; code?: string; status?: number };

/**
 * Run the PDF pipeline in a dedicated child process and return its result.
 *
 * Rejections keep the shapes the routes already map:
 *  - a deadline          → `{ killed: true, code: "ETIMEDOUT" }` (HTTP 504)
 *  - killed by its own watchdog, or by the OS (out of memory)
 *                        → `{ killed: true, code: "PDF_RESOURCE_LIMIT" }` (504)
 *  - an error the pipeline raised (`PDF_PARSE_FAILED`, a qpdf timeout, …)
 *                        → the same `code` / `killed` / `status` it had in process
 */
export function runPdfInWorker(
  buffer: Buffer,
  limits: PdfRunLimits = defaultPdfRunLimits(),
  /** Called with the child's pid as soon as it exists — for a test to check
   *  afterwards that the process really is gone. */
  onSpawn?: (pid: number) => void,
): Promise<PdfWorkerSuccess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${limits.maxOldSpaceMb}`, "--import", TSX_SPECIFIER, WORKER_PATH],
      {
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        serialization: "advanced",
        // Its own process group, so one signal reaches it and its qpdf.
        detached: true,
        // Denylisted copy of the parent's env (childSpawnEnv.ts): this child
        // parses attacker-controlled bytes and must not hold the API's
        // secrets.
        env: buildChildSpawnEnv(),
      },
    );

    if (typeof child.pid === "number") onSpawn?.(child.pid);

    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    /** SIGKILL the child's process group, then the child itself. Idempotent. */
    const killChild = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const pid = child.pid;
      if (typeof pid === "number") {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // no such group (already gone, or never became a leader)
        }
      }
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    };

    const timeoutError = (): RunError => {
      const err = new Error("PDF analysis timed out") as RunError;
      err.killed = true;
      err.code = "ETIMEDOUT";
      return err;
    };

    const arm = (ms: number): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled || timedOut) return;
        timedOut = true;
        killChild();
        graceTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(timeoutError());
        }, TIMEOUT_KILL_GRACE_MS);
      }, ms);
    };
    arm(limits.qpdfPhaseMs);

    const finish = (): void => {
      settled = true;
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
    };

    child.on("message", (msg: PdfWorkerMessage) => {
      if (settled || timedOut) return;
      if ("stage" in msg) {
        // qpdf is done; pdf.js gets its own full budget from here.
        if (msg.stage === "pdfjs") arm(limits.pdfjsPhaseMs);
        return;
      }
      const result: PdfWorkerResult = msg;
      finish();
      killChild();
      if (result.ok) {
        resolve(result);
        return;
      }
      const err = new Error(result.message) as RunError;
      if (result.code !== undefined) err.code = result.code;
      if (result.killed !== undefined) err.killed = result.killed;
      if (result.status !== undefined) err.status = result.status;
      reject(err);
    });

    child.once("error", (err) => {
      if (settled || timedOut) return;
      finish();
      killChild();
      reject(err);
    });

    child.once("exit", (code, signal) => {
      if (settled) return;
      const wasTimeout = timedOut;
      finish();
      if (wasTimeout) {
        reject(timeoutError());
        return;
      }
      if (signal === "SIGKILL") {
        // Not our kill: the child's watchdog (memory, or its absolute
        // deadline) or the operating system's out-of-memory killer.
        const err = new Error(
          "PDF analysis was stopped: it needed more memory or time than the checker allows",
        ) as RunError;
        err.killed = true;
        err.code = "PDF_RESOURCE_LIMIT";
        reject(err);
        return;
      }
      reject(
        new Error(`PDF analysis process exited without a result (code ${code}, signal ${signal})`),
      );
    });

    const request: PdfWorkerRequest = {
      buffer,
      limits: {
        maxRssBytes: limits.maxRssBytes,
        // Absolute: both phases, plus a margin. The parent's own timers are
        // tighter; this is for the case where the parent is no longer there
        // to run them but has not died in a way the watchdog can see.
        hardDeadlineMs: limits.qpdfPhaseMs + limits.pdfjsPhaseMs + 10_000,
      },
    };
    child.send(request, (sendErr: Error | null) => {
      if (sendErr && !settled && !timedOut) {
        finish();
        killChild();
        reject(sendErr);
      }
    });
  });
}

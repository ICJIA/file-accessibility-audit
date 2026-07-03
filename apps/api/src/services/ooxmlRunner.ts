/**
 * Main-thread side of the interruptible OOXML (docx/pptx/xlsx) analysis
 * pipeline — see ooxmlWorker.ts for the child-process entry point and the
 * full rationale (Promise.race alone can abandon a promise but cannot stop
 * the synchronous JS it's awaiting; a separate process can be SIGKILLed
 * mid-execution).
 *
 * This deliberately does NOT reuse pdfAnalyzer.ts's `withTimeout` for OOXML:
 * withTimeout's timeout branch only stops the CALLER from waiting — exactly
 * the gap this module closes by killing the child instead. PDF is unaffected
 * and keeps using withTimeout (qpdf's subprocess is already killable; pdfjs's
 * timeout risk is smaller and out of scope here).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DocxMetadata } from "./docxService.js";
import type { PptxMetadata } from "./pptxService.js";
import type { XlsxMetadata } from "./xlsxService.js";
import type { ScoringResult } from "./scorer.js";
import type {
  OoxmlType,
  OoxmlWorkerRequest,
  OoxmlWorkerResult,
} from "./ooxmlWorker.js";

// The child-process entry point, resolved once. Spawned as
// `node --import tsx ooxmlWorker.ts` — the same launch the API itself uses
// (see routes/remediate.ts's WORKER_PATH), so tsx's `.js`→`.ts` resolution
// and the `#config` alias work in the child (they do NOT in a worker_thread —
// see ooxmlWorker.ts's header for why this is a child_process, not a Worker).
const WORKER_PATH = fileURLToPath(new URL("./ooxmlWorker.ts", import.meta.url));

/** Maps each OOXML type to its precise metadata shape, so callers get a
 *  correctly-narrowed result without an unsafe cast at the call site (see
 *  runOoxmlInWorker's generic signature below). */
export interface OoxmlMetadataMap {
  docx: DocxMetadata;
  pptx: PptxMetadata;
  xlsx: XlsxMetadata;
}

export interface OoxmlRunResult<T extends OoxmlType = OoxmlType> {
  pageCount: number;
  metadata: OoxmlMetadataMap[T];
  scoring: ScoringResult;
}

/**
 * Run analyzeDocx/Pptx/Xlsx + the matching scorer inside a dedicated,
 * per-request child process, enforcing `timeoutMs` by SIGKILLing the child —
 * not merely abandoning it — when it fires first. OOXML analysis spawns no
 * further subprocesses (unlike remediation's JVM), so a plain
 * `child.kill('SIGKILL')` on the pid is sufficient; no process-group kill is
 * needed.
 *
 * Settlement contract:
 *  - The child's `{ ok: true, ... }` message resolves with its payload.
 *  - The child's `{ ok: false, code, message }` message rejects with
 *    `Object.assign(new Error(message), { code })`, so existing route-level
 *    mapping (`err.code === 'PPTX_PARSE_FAILED'` → 422, etc.) is unaffected
 *    by where the analysis ran.
 *  - A timeout rejects with an error carrying `killed: true` and
 *    `code: 'ETIMEDOUT'` — the exact shape `withTimeout` (pdfAnalyzer.ts)
 *    produces — so the analyze routes' existing `err.code === 'ETIMEDOUT'
 *    || err.killed` → 504 mapping keeps working unchanged.
 *  - A spawn `'error'` event (e.g. the runtime binary is missing) rejects
 *    with that error as-is.
 *  - An `'exit'`/`'close'` before any message (child crashed) rejects rather
 *    than hanging the caller forever.
 *
 * In every path the timer is cleared and the child is killed exactly once
 * before the returned promise settles, so a caller never leaks a live child
 * process (which would otherwise hang a `vitest run`).
 */
export function runOoxmlInWorker<T extends OoxmlType>(
  type: T,
  buffer: Buffer,
  timeoutMs: number,
): Promise<OoxmlRunResult<T>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", WORKER_PATH],
      {
        // fd3 IPC channel with advanced (structured-clone) serialization so
        // the Buffer moves efficiently and arrives as a Buffer (no base64).
        // stdin ignored; stdout/stderr inherited so any child diagnostics
        // surface in the parent's logs, matching the remediation worker.
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        serialization: "advanced",
        env: process.env,
      },
    );

    let settled = false;

    /** Kill the child if it's still alive. Idempotent. */
    const killChild = (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone — nothing to do
        }
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killChild();
      const err = new Error(`${type} analysis timed out`) as Error & {
        killed?: boolean;
        code?: string;
      };
      err.killed = true;
      err.code = "ETIMEDOUT";
      reject(err);
    }, timeoutMs);

    child.once("message", (result: OoxmlWorkerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The child exits itself right after sending; nothing to kill in the
      // normal path, but call anyway in case exit is delayed. Idempotent.
      killChild();
      if (result.ok) {
        resolve({
          pageCount: result.pageCount,
          // Runtime-checked only against `type`; the generic signature above
          // gives every caller a precisely-typed result without its own cast.
          metadata: result.metadata as OoxmlMetadataMap[T],
          scoring: result.scoring,
        });
      } else {
        reject(Object.assign(new Error(result.message), { code: result.code }));
      }
    });

    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killChild();
      reject(err);
    });

    // 'exit' before any message means the child crashed or was killed without
    // replying. In the timeout path `settled` is already true (we reject +
    // kill above), so this is a no-op there; otherwise it's an unexpected
    // crash and we must reject rather than hang the caller forever.
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `${type} analysis process exited without a result (code ${code}, signal ${signal})`,
        ),
      );
    });

    // Hand the work to the child. Under advanced serialization the Buffer is
    // structured-cloned across the channel. If send fails (e.g. the channel
    // closed because the child died on spawn), reject once — unless a timeout
    // or exit already settled us.
    const request: OoxmlWorkerRequest = { type, buffer };
    child.send(request, (sendErr: Error | null) => {
      if (sendErr && !settled) {
        settled = true;
        clearTimeout(timer);
        killChild();
        reject(sendErr);
      }
    });
  });
}

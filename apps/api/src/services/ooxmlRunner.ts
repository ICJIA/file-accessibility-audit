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
import { buildChildSpawnEnv } from "./childSpawnEnv.js";
import type { DocxMetadata } from "./docxService.js";
import type { PptxMetadata } from "./pptxService.js";
import type { XlsxMetadata } from "./xlsxService.js";
import type { ScoringResult } from "./scorer.js";
import type { OoxmlType, OoxmlWorkerRequest, OoxmlWorkerResult } from "./ooxmlWorker.js";

// The child-process entry point, resolved once. Spawned as
// `node --import tsx ooxmlWorker.ts` — the same launch the API itself uses
// (see routes/remediate.ts's WORKER_PATH), so tsx's `.js`→`.ts` resolution
// and the `#config` alias work in the child (they do NOT in a worker_thread —
// see ooxmlWorker.ts's header for why this is a child_process, not a Worker).
const WORKER_PATH = fileURLToPath(new URL("./ooxmlWorker.ts", import.meta.url));

// How long to wait for the OS to confirm a SIGKILLed child has actually
// exited before giving up and settling the promise anyway (see the timeout
// branch below). SIGKILL cannot be caught or blocked, so in practice 'exit'
// fires within milliseconds; this is a backstop against a hypothetical
// stuck/uninterruptible child, not the expected path.
const TIMEOUT_KILL_GRACE_MS = 2_000;

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
 *  - A timeout SIGKILLs the child immediately but does NOT settle the
 *    promise in that same tick: settlement (and therefore the caller's
 *    `finally { releaseSemaphore() }`) is delayed until the child's 'exit'
 *    event confirms the OS has actually reaped the process, or a short
 *    grace period (`TIMEOUT_KILL_GRACE_MS`) elapses, whichever is first —
 *    closing a brief peak-memory-overlap window where a new analysis could
 *    otherwise be admitted while the killed one was still resident. Either
 *    way the rejection carries `killed: true` and `code: 'ETIMEDOUT'` — the
 *    exact shape `withTimeout` (pdfAnalyzer.ts) produces — so the analyze
 *    routes' existing `err.code === 'ETIMEDOUT' || err.killed` → 504 mapping
 *    keeps working unchanged.
 *  - A spawn `'error'` event (e.g. the runtime binary is missing) rejects
 *    with that error as-is.
 *  - An `'exit'` before any message and outside the timeout path (child
 *    crashed on its own) rejects rather than hanging the caller forever.
 *
 * In every path the timer is cleared and the child is killed exactly once
 * before the returned promise settles, so a caller never leaks a live child
 * process (which would otherwise hang a `vitest run`).
 *
 * The child's env is a denylisted copy of the parent's (see
 * childSpawnEnv.ts), never the raw `process.env` — this child parses
 * attacker-controlled document bytes and must not hold the API's secrets.
 */
export function runOoxmlInWorker<T extends OoxmlType>(
  type: T,
  buffer: Buffer,
  timeoutMs: number,
): Promise<OoxmlRunResult<T>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", WORKER_PATH], {
      // fd3 IPC channel with advanced (structured-clone) serialization so
      // the Buffer moves efficiently and arrives as a Buffer (no base64).
      // stdin ignored; stdout/stderr inherited so any child diagnostics
      // surface in the parent's logs, matching the remediation worker.
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      serialization: "advanced",
      // Denylisted copy of the parent's env (see childSpawnEnv.ts): this
      // child parses attacker-controlled document bytes, so it must not
      // hold the API's secrets (JWT_SECRET, API_PRIVILEGED_TOKEN, SMTP
      // creds, ...) while still getting everything it needs to boot under
      // `node --import tsx` (PATH/HOME/NODE_*/TSX_*).
      env: buildChildSpawnEnv(),
    });

    let settled = false;
    // Set synchronously the instant the timeout fires — BEFORE the promise
    // actually settles (see the timer below). Kept separate from `settled`:
    // `settled` guards "has the promise settled" (unchanged, across every
    // path); `timedOut` guards "has a timeout already claimed this outcome"
    // so the message/error/send-callback paths stop treating the run as
    // still-in-play the instant the timeout fires, even though the actual
    // settlement is deliberately delayed.
    let timedOut = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

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

    const timeoutError = (): Error & { killed?: boolean; code?: string } => {
      const err = new Error(`${type} analysis timed out`) as Error & {
        killed?: boolean;
        code?: string;
      };
      err.killed = true;
      err.code = "ETIMEDOUT";
      return err;
    };

    const timer = setTimeout(() => {
      if (settled || timedOut) return;
      timedOut = true;
      // Issue the SIGKILL immediately, as before — but do NOT resolve the
      // promise here. Rejecting synchronously in this same tick (the old
      // behavior) let analyzer.ts's `finally { releaseSemaphore() }` free
      // the concurrency slot the instant the signal was *issued*, before
      // the OS had actually reaped the process — a brief peak-memory-
      // overlap window where a new analysis could be admitted while the
      // dying one was still resident. Settlement now happens from the
      // 'exit' handler below (OS-confirmed exit) or, failing that, the
      // grace timer — whichever comes first.
      killChild();
      graceTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(timeoutError());
      }, TIMEOUT_KILL_GRACE_MS);
    }, timeoutMs);

    child.once("message", (result: OoxmlWorkerResult) => {
      if (settled || timedOut) return;
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
      if (settled || timedOut) return;
      settled = true;
      clearTimeout(timer);
      killChild();
      reject(err);
    });

    // 'exit' before any message means the child crashed, was killed without
    // replying, or — the timeout path — was SIGKILLed by the timer above and
    // has now been OS-confirmed dead. In the timeout case this is where
    // settlement actually happens (see the timer's comment); otherwise it's
    // an unexpected crash and we must reject rather than hang the caller
    // forever.
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        if (graceTimer) clearTimeout(graceTimer);
        reject(timeoutError());
        return;
      }
      reject(
        new Error(
          `${type} analysis process exited without a result (code ${code}, signal ${signal})`,
        ),
      );
    });

    // Hand the work to the child. Under advanced serialization the Buffer is
    // structured-cloned across the channel. If send fails (e.g. the channel
    // closed because the child died on spawn), reject once — unless a
    // timeout or exit already settled us.
    const request: OoxmlWorkerRequest = { type, buffer };
    child.send(request, (sendErr: Error | null) => {
      if (sendErr && !settled && !timedOut) {
        settled = true;
        clearTimeout(timer);
        killChild();
        reject(sendErr);
      }
    });
  });
}

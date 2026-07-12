/**
 * Child-process entry point for OOXML (docx/pptx/xlsx) analysis + scoring.
 *
 * WHY a separate process: analyzeDocx/analyzePptx/analyzeXlsx are pure
 * synchronous JS (unzip + XML parse + multiple full-tree extract passes)
 * with no subprocess to kill and no natural yield point. Running them on the
 * API's main thread behind a Promise.race timeout (see `withTimeout` in
 * pdfAnalyzer.ts — still used as-is for PDF, whose qpdf subprocess is already
 * killable) only abandons the *promise* on timeout: the underlying
 * synchronous work keeps burning the event loop to completion while its
 * concurrency-semaphore slot is freed immediately, so a handful of
 * pathological uploads pin the process while new requests keep being
 * admitted (the DoS this closes). Running the same work in a dedicated child
 * process instead means a timeout can `child.kill('SIGKILL')` it — genuinely
 * stopping the work, not just the caller's wait for it.
 *
 * WHY a child_process and not a worker_thread: this repo runs under tsx
 * (`node --import tsx`), and tsx's module-resolution hooks (the `.js`→`.ts`
 * specifier mapping every file here relies on, plus the `#config`
 * package-imports alias) are NOT inherited by worker_threads spawned with
 * `execArgv:['--import','tsx']` — a known, currently-unresolved Node/tsx
 * limitation (nodejs/node#47747, privatenumber/tsx#354). A child process
 * launched the same way the API itself is (`node --import tsx <file>`) is a
 * fresh "main thread" from tsx's perspective, so the whole module graph
 * resolves normally. This mirrors the existing remediation worker
 * (routes/remediate.ts spawns `node --import tsx jobs/remediate.ts`).
 *
 * Transport contract with ooxmlRunner.ts (the parent side): the parent
 * spawns this file with `serialization:'advanced'` IPC (structured clone,
 * so a Buffer moves across the channel efficiently and arrives as a Buffer —
 * no base64), then `child.send({ type, buffer })`. This process runs the
 * matching analyze+score and `process.send(...)`s exactly one reply:
 *   { ok: true,  pageCount, metadata, scoring }  on success
 *   { ok: false, code, message }                 on a caught *ParseError
 * then `process.exit(0)` so it never lingers (a leaked child would hang a
 * `vitest run`). On a timeout the parent SIGKILLs this process before any
 * reply — this file does nothing special for that case; it's just killed.
 */
import { analyzeDocx } from "./docxService.js";
import { analyzePptx } from "./pptxService.js";
import { analyzeXlsx } from "./xlsxService.js";
import { scoreDocx, scorePptx, scoreXlsx } from "./scorer.js";
import type { DocxMetadata } from "./docxService.js";
import type { PptxMetadata } from "./pptxService.js";
import type { XlsxMetadata } from "./xlsxService.js";
import type { ScoringResult } from "./scorer.js";

export type OoxmlType = "docx" | "pptx" | "xlsx";

/** Message the parent sends over IPC. `buffer` arrives as a Node Buffer
 *  under `serialization:'advanced'` (structured clone). */
export interface OoxmlWorkerRequest {
  type: OoxmlType;
  buffer: Buffer;
}

export interface OoxmlWorkerSuccess {
  ok: true;
  pageCount: number;
  metadata: DocxMetadata | PptxMetadata | XlsxMetadata;
  scoring: ScoringResult;
}

export interface OoxmlWorkerFailure {
  ok: false;
  /** Carries the *ParseError's `.code` (e.g. "PPTX_PARSE_FAILED") when the
   *  caught error has one, so route-level `err.code === '...'` mapping keeps
   *  working unchanged across the process boundary. */
  code?: string;
  message: string;
}

export type OoxmlWorkerResult = OoxmlWorkerSuccess | OoxmlWorkerFailure;

/**
 * Run the matching analyze + score for `type`. `pageCount` per type mirrors
 * analyzer.ts's original inline branches EXACTLY (docx →
 * `metadata.pageCount ?? 0`, pptx → `metadata.slideCount`, xlsx →
 * `metadata.sheetCount`) so the result object is byte-identical to the
 * pre-child inline path — this changes WHERE the work runs, never WHAT it
 * produces. Exported for direct in-process unit testing (no child spawn).
 */
export async function analyzeAndScore(
  type: OoxmlType,
  buffer: Buffer,
): Promise<OoxmlWorkerSuccess> {
  if (type === "docx") {
    const analysis = await analyzeDocx(buffer);
    return {
      ok: true,
      pageCount: analysis.metadata.pageCount ?? 0,
      metadata: analysis.metadata,
      scoring: scoreDocx(analysis),
    };
  }
  if (type === "pptx") {
    const analysis = await analyzePptx(buffer);
    return {
      ok: true,
      pageCount: analysis.metadata.slideCount,
      metadata: analysis.metadata,
      scoring: scorePptx(analysis),
    };
  }
  const analysis = await analyzeXlsx(buffer);
  return {
    ok: true,
    pageCount: analysis.metadata.sheetCount,
    metadata: analysis.metadata,
    scoring: scoreXlsx(analysis),
  };
}

// Only run the IPC message loop when actually spawned as a child (i.e. the
// parent set up an IPC channel, so process.send exists). Importing this
// module for its exported types/analyzeAndScore (e.g. from a unit test) does
// NOT start the loop, so a test import can never leave a dangling listener.
if (typeof process.send === "function") {
  process.once("message", (msg: OoxmlWorkerRequest) => {
    void (async () => {
      let result: OoxmlWorkerResult;
      try {
        // Buffer arrives as a Buffer under advanced serialization; Buffer.from
        // is a defensive no-copy-when-already-a-Buffer normalization.
        result = await analyzeAndScore(msg.type, Buffer.from(msg.buffer));
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string } | null | undefined;
        result = { ok: false, code: e?.code, message: e?.message ?? String(err) };
      }
      // Send the reply, then exit once it has flushed so the process never
      // lingers. If the parent already SIGKILLed us (timeout), send throws /
      // calls back with an error — ignore it and exit; we're being torn down.
      process.send!(result, (sendErr: Error | null) => {
        process.exit(sendErr ? 1 : 0);
      });
    })();
  });
}

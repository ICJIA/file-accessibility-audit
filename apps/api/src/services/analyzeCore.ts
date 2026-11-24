/**
 * The audit request's shared core (v1.100.0). Extracted from routes/analyze.ts
 * so the synchronous POST /api/analyze and the job-model progress endpoints
 * (POST /api/analyze-job + status polling) run EXACTLY the same pipeline,
 * record the same audit_log rows, and map errors to the same responses —
 * duplication here is how the two paths would drift.
 *
 * The step hooks are the only addition: the job path observes the real
 * transitions (engine analysis; the two concurrent veraPDF passes), the
 * synchronous path passes no hooks and behaves byte-for-byte as before.
 */
import type { Response } from "express";
import type { AnalysisResult } from "@file-audit/analyzer";
import { analyzeDocument, detectFileType, detectLegacyFormat } from "./analyzer.js";
import { AUDIT_TIMEOUT_MESSAGE, unsupportedFormatMessage } from "@file-audit/shared";
import { runVeraPdfChecksOnBuffer } from "./veraPdfBuffer.js";
import { REMEDIATION } from "#config";
import {
  recordAudit,
  recordAuditFailure,
  recordRejectedUpload,
  sanitizeStoredFilename,
  sha256Hex,
} from "./auditLog.js";
import { classifyAuditFailure } from "./auditFailure.js";
import { retryWhileBusy, setBusyRetryAfter } from "./busy.js";
import type { ApiErrorCode } from "./apiError.js";

export type AnalyzeStep = "analysis" | "veraPdfUa" | "veraPdfWcag";
export type AnalyzeStepState = "running" | "done";
export type StepHook = (step: AnalyzeStep, state: AnalyzeStepState) => void;

/**
 * Run the full audit for an uploaded buffer: analysis + (for PDFs) the two
 * concurrent veraPDF passes, verdicts attached, audit_log row recorded.
 * Throws the analyzer's own errors untouched — map them with
 * mapAnalyzeError, which also records the failure/rejection rows.
 */
export async function performAudit(
  buffer: Buffer,
  originalname: string,
  privileged: boolean,
  onStep?: StepHook,
  opts: {
    /**
     * Keep retrying — with backoff, for at most this long — when the
     * analysis line is full (a 503 from the analyzer's semaphore) instead of
     * failing. For the JOB path only: its caller is polling and cannot retry.
     * The synchronous route leaves this unset and answers 503 + Retry-After.
     */
    retryBusyMs?: number;
  } = {},
): Promise<AnalysisResult> {
  const filename = sanitizeStoredFilename(originalname);
  const contentHash = sha256Hex(buffer);

  // Detect type up front so veraPDF runs concurrently with the analysis for
  // PDFs only — cost is max(analyze, veraPDF), not the sum.
  const detectedType = await detectFileType(buffer).catch(() => null);
  onStep?.("analysis", "running");
  // The veraPDF passes run beside the analysis, and are STOPPED the moment
  // the analysis is refused or fails (the line is full, the PDF is
  // encrypted): Promise.all rejects at once, but the JVM used to carry on for
  // up to VERAPDF_AUDIT_TIMEOUT_MS holding the only veraPDF slot — and a temp
  // copy of the document — for a verdict nobody would receive.
  const veraAbort = new AbortController();
  const analysis = (
    opts.retryBusyMs
      ? retryWhileBusy(() => analyzeDocument(buffer, filename), { totalMs: opts.retryBusyMs })
      : analyzeDocument(buffer, filename)
  ).finally(() => onStep?.("analysis", "done"));
  analysis.catch(() => veraAbort.abort());
  const [result, veraChecks] = await Promise.all([
    analysis,
    detectedType === "pdf"
      ? runVeraPdfChecksOnBuffer(buffer, {
          wcag: REMEDIATION.VERAPDF_WCAG_ENABLED,
          onUa: (s) => onStep?.("veraPdfUa", s),
          onWcag: (s) => onStep?.("veraPdfWcag", s),
          signal: veraAbort.signal,
        })
      : Promise.resolve(null),
  ]);
  // v1.91.0: attach the verdict for every PDF, INCLUDING available:false —
  // the web panel renders an explicit "did not run" disclosure from it;
  // absent field = non-PDF only.
  if (veraChecks) {
    result.pdfUaVerdict = veraChecks.pdfUa;
    // v1.97.0: the WCAG second opinion — attached only when the feature is
    // on (null = off/unconfigured → key ABSENT downstream). Never scored.
    if (veraChecks.wcag) {
      result.wcagVerdict = veraChecks.wcag;
    }
  }

  // Always record the audit — audit_log is the canonical "this content has
  // been audited" metadata consulted by /api/remediate's audit-gate. The row
  // is about the event only: file name, score, grade, content hash. No
  // identity (v1.68.0).
  recordAudit({
    eventType: "analyze",
    privileged,
    filename,
    score: result.overallScore,
    grade: result.grade,
    contentHash,
  });

  return result;
}

/**
 * Whether a PDF's bytes declare an /Encrypt dictionary. The key sits in the
 * trailer (or in the cross-reference stream's own dictionary, which is never
 * compressed), so a byte scan finds it. Exported for tests.
 */
export function declaresEncryption(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-" && buffer.includes("/Encrypt");
}

export interface MappedAnalyzeError {
  status: number;
  /** `code` is the stable machine-readable part (services/apiError.ts). */
  body: { error: string; details?: string; code: ApiErrorCode };
}

/** What differs between the callers of mapAnalyzeError. */
export interface MapAnalyzeContext {
  /**
   * "upload" (default) — the caller sent the file. "url" — the server
   * fetched it: the URL routes have always said "The fetched … could not be
   * read." and given the short busy hint, and keep doing so.
   */
  source?: "upload" | "url";
  /** audit_log event the failed-audit row is recorded under. Default "analyze". */
  eventType?: "analyze" | "analyze-url" | "audit-url";
  /** Name recorded on the failed-audit row. Default: the file's own name;
   *  the URL routes record the URL that was asked for. */
  failureName?: string;
  /**
   * false = record no audit_log row at all: the caller keeps its own records
   * (bulk-from-inventory), or the failure is not an audit (the remediation
   * preflight). Default true.
   */
  record?: boolean;
}

/**
 * The single error → HTTP mapping for audit failures, extracted verbatim
 * from the pre-v1.100.0 handler. Also records the v1.88.0 failed-audit /
 * rejected-upload rows, exactly as the synchronous route always has.
 *
 * EVERY analysis path maps through here: the upload routes (/analyze,
 * /analyze-job), the URL routes (/analyze-url, /audit-url), each entry of
 * /bulk-from-inventory, and the /remediate preflight. The URL routes used to
 * keep their own copies of this chain, which had no password-protected and
 * no unreadable branch — so the same encrypted PDF answered 422 as an upload
 * and 500 by URL.
 */
export function mapAnalyzeError(
  err: {
    status?: number;
    code?: string;
    message?: string;
    killed?: boolean;
  },
  file: { originalname: string; buffer: Buffer } | undefined,
  privileged: boolean,
  ctx: MapAnalyzeContext = {},
): MappedAnalyzeError {
  const fetched = ctx.source === "url";
  const record = ctx.record !== false;
  // v1.88.0: an audit the tool attempted and could not complete leaves a row
  // of its own — same fields as a successful one, no score/grade/hash, a
  // one-word reason. The classifier answers null for capacity (503) and for
  // refusals, which the UNSUPPORTED_FILE_TYPE branch below records as
  // rejected-upload instead.
  const failure = classifyAuditFailure(err);
  const failureName = ctx.failureName ?? file?.originalname;
  if (record && failure && failureName !== undefined) {
    recordAuditFailure({
      eventType: ctx.eventType ?? "analyze",
      privileged,
      filename: failureName,
      reason: failure,
    });
  }

  if (err.status === 503) {
    return {
      status: 503,
      body: {
        error: "The server is busy processing other files.",
        details: fetched
          ? "Please wait a moment and try again."
          : "Please wait a moment and try again. The server can analyze two files at a time — your request will be processed as soon as a slot opens.",
        code: "SERVER_BUSY",
      },
    };
  }

  if (err.code === "UNSUPPORTED_FILE_TYPE") {
    // The extension filter never saw this one — either the file was renamed
    // (a .doc saved as .docx sails through multer and only fails here) or it
    // arrived without a telling extension. Counted here rather than in the
    // upload filter: this file passed the extension check, so the filter
    // never saw it as a refusal.
    if (record && file) {
      recordRejectedUpload({
        filename: sanitizeStoredFilename(file.originalname),
        privileged,
      });
    }
    const legacy = file ? detectLegacyFormat(file.buffer) : null;
    if (legacy) {
      return {
        status: 400,
        body: {
          error: "This file is a legacy format that cannot be audited.",
          details: unsupportedFormatMessage(legacy),
          code: "UNSUPPORTED_TYPE",
        },
      };
    }
    return {
      status: 400,
      body: {
        error: "This file is not a supported document.",
        details:
          "Upload a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file. The file content matches none of these formats — check that you are not uploading a renamed file of another type (e.g., .zip, .jpg).",
        code: "UNSUPPORTED_TYPE",
      },
    };
  }

  if (err.code === "DOCX_DISABLED") {
    return {
      status: 415,
      body: {
        error: "Word (.docx) auditing is currently disabled.",
        details:
          "This server is not configured to audit Word files. Contact the administrator to enable it.",
        code: "FORMAT_DISABLED",
      },
    };
  }
  if (err.code === "DOCX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: fetched
          ? "The fetched Word document could not be read."
          : "This Word document could not be read.",
        details:
          "The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.",
        code: "FILE_UNREADABLE",
      },
    };
  }
  if (err.code === "PPTX_DISABLED") {
    return {
      status: 415,
      body: {
        error: "PowerPoint (.pptx) auditing is currently disabled.",
        details:
          "This server is not configured to audit PowerPoint files. Contact the administrator to enable it.",
        code: "FORMAT_DISABLED",
      },
    };
  }
  if (err.code === "PPTX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: fetched
          ? "The fetched PowerPoint file could not be read."
          : "This PowerPoint file could not be read.",
        details:
          "The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.",
        code: "FILE_UNREADABLE",
      },
    };
  }
  if (err.code === "XLSX_DISABLED") {
    return {
      status: 415,
      body: {
        error: "Excel (.xlsx) auditing is currently disabled.",
        details:
          "This server is not configured to audit Excel files. Contact the administrator to enable it.",
        code: "FORMAT_DISABLED",
      },
    };
  }
  if (err.code === "XLSX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: fetched
          ? "The fetched Excel file could not be read."
          : "This Excel file could not be read.",
        details:
          "The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.",
        code: "FILE_UNREADABLE",
      },
    };
  }

  // A password-protected PDF. The analyzer names it in the message when qpdf
  // says "encrypted" — but current qpdf says "invalid password" for a file
  // that needs a password to open, pdf.js then fails as well, and what
  // arrives here is the generic PDF_PARSE_FAILED. So a parse failure of a
  // file that declares an /Encrypt dictionary is treated as what it almost
  // certainly is, and the person is told about the password instead of being
  // sent to re-download a "corrupt" file.
  if (
    err.message?.includes("encrypted") ||
    err.message?.includes("password") ||
    (err.code === "PDF_PARSE_FAILED" && file !== undefined && declaresEncryption(file.buffer))
  ) {
    return {
      status: 422,
      body: {
        error: "This PDF is password-protected.",
        details:
          "Screen readers and accessibility tools also cannot access password-protected content. Please remove the password protection in Adobe Acrobat (Document properties — ☰ Menu on Windows, File menu on Mac → Security tab → Security Method: No Security) and re-upload.",
        code: "FILE_ENCRYPTED",
      },
    };
  }

  // A killed analysis is NOT evidence that the document is at fault — this
  // branch catches any killed subprocess, and server contention is the more
  // common cause. See AUDIT_TIMEOUT_MESSAGE for the incident behind the copy.
  if (err.code === "ETIMEDOUT" || err.killed) {
    return { status: 504, body: { ...AUDIT_TIMEOUT_MESSAGE, code: "TIMEOUT" } };
  }

  return {
    status: 422,
    body: {
      error: "This file could not be analyzed.",
      details:
        "It may be corrupt or in an unsupported format. To fix this: (1) Re-download the file from its original source; (2) Open the file in its native application and re-save it; (3) If all else fails, try re-exporting it to the same format.",
      code: "FILE_UNREADABLE",
    },
  };
}

/** Send a mapped error; a busy (503) answer also says when to come back. */
export function sendMappedAnalyzeError(
  res: Pick<Response, "setHeader" | "status">,
  mapped: MappedAnalyzeError,
): void {
  if (mapped.status === 503) setBusyRetryAfter(res);
  res.status(mapped.status).json(mapped.body);
}

/**
 * Map an error thrown by the ANALYSIS of a document the server fetched by
 * URL, log it when it is not one of the expected kinds, and return the
 * response to send — the URL routes' one catch for analyzeDocument.
 */
export function mapUrlAnalyzeError(
  err: unknown,
  input: {
    eventType: "analyze-url" | "audit-url";
    url: string;
    filename: string;
    buffer: Buffer;
    privileged: boolean;
  },
): MappedAnalyzeError {
  // The detail stays server-side — never echo a raw err.message to the
  // client (it can carry library internals and paths). Expected outcomes (a
  // password-protected or corrupt file, a timeout, a full line) are not
  // logged with a stack; only the unclassified ones are.
  if (classifyAuditFailure(err) === "internal") console.error(`${input.eventType} error:`, err);
  return mapAnalyzeError(
    (err ?? {}) as { status?: number; code?: string; message?: string; killed?: boolean },
    { originalname: input.filename, buffer: input.buffer },
    input.privileged,
    { source: "url", eventType: input.eventType, failureName: input.url },
  );
}

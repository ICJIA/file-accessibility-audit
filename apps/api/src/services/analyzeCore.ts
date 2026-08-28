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
): Promise<AnalysisResult> {
  const filename = sanitizeStoredFilename(originalname);
  const contentHash = sha256Hex(buffer);

  // Detect type up front so veraPDF runs concurrently with the analysis for
  // PDFs only — cost is max(analyze, veraPDF), not the sum.
  const detectedType = await detectFileType(buffer).catch(() => null);
  onStep?.("analysis", "running");
  const [result, veraChecks] = await Promise.all([
    analyzeDocument(buffer, filename).finally(() => onStep?.("analysis", "done")),
    detectedType === "pdf"
      ? runVeraPdfChecksOnBuffer(buffer, {
          wcag: REMEDIATION.VERAPDF_WCAG_ENABLED,
          onUa: (s) => onStep?.("veraPdfUa", s),
          onWcag: (s) => onStep?.("veraPdfWcag", s),
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

export interface MappedAnalyzeError {
  status: number;
  body: { error: string; details?: string };
}

/**
 * The single error → HTTP mapping for audit failures, extracted verbatim
 * from the pre-v1.100.0 handler. Also records the v1.88.0 failed-audit /
 * rejected-upload rows, exactly as the synchronous route always has.
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
): MappedAnalyzeError {
  // v1.88.0: an audit the tool attempted and could not complete leaves a row
  // of its own — same fields as a successful one, no score/grade/hash, a
  // one-word reason. The classifier answers null for capacity (503) and for
  // refusals, which the UNSUPPORTED_FILE_TYPE branch below records as
  // rejected-upload instead.
  const failure = classifyAuditFailure(err);
  if (failure && file) {
    recordAuditFailure({
      eventType: "analyze",
      privileged,
      filename: file.originalname,
      reason: failure,
    });
  }

  if (err.status === 503) {
    return {
      status: 503,
      body: {
        error: "The server is busy processing other files.",
        details:
          "Please wait a moment and try again. The server can analyze two files at a time — your request will be processed as soon as a slot opens.",
      },
    };
  }

  if (err.code === "UNSUPPORTED_FILE_TYPE") {
    // The extension filter never saw this one — either the file was renamed
    // (a .doc saved as .docx sails through multer and only fails here) or it
    // arrived without a telling extension. Counted here rather than in the
    // upload filter: this file passed the extension check, so the filter
    // never saw it as a refusal.
    if (file) {
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
        },
      };
    }
    return {
      status: 400,
      body: {
        error: "This file is not a supported document.",
        details:
          "Upload a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file. The file content matches none of these formats — check that you are not uploading a renamed file of another type (e.g., .zip, .jpg).",
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
      },
    };
  }
  if (err.code === "DOCX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: "This Word document could not be read.",
        details:
          "The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.",
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
      },
    };
  }
  if (err.code === "PPTX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: "This PowerPoint file could not be read.",
        details:
          "The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.",
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
      },
    };
  }
  if (err.code === "XLSX_PARSE_FAILED") {
    return {
      status: 422,
      body: {
        error: "This Excel file could not be read.",
        details:
          "The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.",
      },
    };
  }

  if (err.message?.includes("encrypted") || err.message?.includes("password")) {
    return {
      status: 422,
      body: {
        error: "This PDF is password-protected.",
        details:
          "Screen readers and accessibility tools also cannot access password-protected content. Please remove the password protection in Adobe Acrobat (File → Properties → Security → No Security) and re-upload.",
      },
    };
  }

  // A killed analysis is NOT evidence that the document is at fault — this
  // branch catches any killed subprocess, and server contention is the more
  // common cause. See AUDIT_TIMEOUT_MESSAGE for the incident behind the copy.
  if (err.code === "ETIMEDOUT" || err.killed) {
    return { status: 504, body: { ...AUDIT_TIMEOUT_MESSAGE } };
  }

  return {
    status: 422,
    body: {
      error: "This file could not be analyzed.",
      details:
        "It may be corrupt or in an unsupported format. To fix this: (1) Re-download the file from its original source; (2) Open the file in its native application and re-save it; (3) If all else fails, try re-exporting it to the same format.",
    },
  };
}

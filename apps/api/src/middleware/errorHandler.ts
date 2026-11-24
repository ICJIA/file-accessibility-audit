/**
 * Global Express error handler — never leak internals. Extracted from
 * index.ts in v1.88.0 so its logging can be tested.
 *
 * Logging (v1.88.0): an expected client-side outcome — a 4xx, including
 * multer's LIMIT_FILE_SIZE → 413 — logs ONE line: status, code, method, path.
 * It used to log the full error with stack, so an over-sized upload filled
 * the error log exactly like a crash. A server fault (5xx) keeps the full
 * error. Neither line carries an IP, a token, a user agent or a body
 * (req.path has no query string), the same constraint the `[rate-limit]` log
 * lines are tested for.
 */
import type { NextFunction, Request, Response } from "express";
import { ANALYSIS, BULK_INVENTORY } from "#config";
import { apiErrorBody, type ApiErrorCode } from "../services/apiError.js";
import { runWithRequestId } from "../services/requestContext.js";

interface ErrorShape {
  type?: unknown;
  status?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

function shape(err: unknown): ErrorShape {
  return typeof err === "object" && err !== null ? (err as ErrorShape) : {};
}

/** The HTTP status the response will be sent with. */
export function statusOf(err: unknown): number {
  const e = shape(err);
  if (e.code === "LIMIT_FILE_SIZE") return 413;
  // Every other multer rejection is the caller's malformed upload — a refused
  // field name, a second file, an unexpected part — never a server fault.
  // MulterError carries a code and no status, so these used to fall through
  // to 500 and log a full error object, which includes the caller-written
  // field name, exactly like a crash.
  if (e.name === "MulterError") return 400;
  return (e.status as number) || 500;
}

export function logHandledError(err: unknown, req: { method: string; path: string }): void {
  const status = statusOf(err);
  if (Number(status) < 500) {
    const e = shape(err);
    const label =
      typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "error";
    console.warn(`[api] ${status} ${label} ${req.method} ${req.path}`);
  } else {
    console.error(err);
  }
}

/** The stable machine code for an error that reached the global handler. */
export function codeOf(err: unknown): ApiErrorCode | undefined {
  const e = shape(err);
  // The upload filter's refusal (uploadMiddleware.ts / routes/remediate.ts).
  if (e.name === "UnsupportedFileTypeError") return "UNSUPPORTED_TYPE";
  return undefined; // the status's default (services/apiError.ts)
}

const mb = (bytes: number): string => `${bytes / 1024 / 1024} MB`;

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  // Inside the request's context, so the error-log line carries its id even
  // when the error surfaced from a callback that had lost it.
  runWithRequestId(res.locals?.requestId as string | undefined, () => logHandledError(err, req));

  const status = statusOf(err);

  // Multer file size error — keyed on the cause (multer's code), not the
  // status, so body-parser's own 413 ("request entity too large") keeps
  // answering with its own message instead of the multer upload guidance.
  if (shape(err).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      code: "FILE_TOO_LARGE",
      error: `This file is too large. The maximum upload size is ${ANALYSIS.MAX_FILE_SIZE_MB} MB.`,
      details:
        "Large PDFs are often inflated by uncompressed images. To reduce file size: (1) In Adobe Acrobat, use ☰ Menu (Windows) or File menu (Mac) → Save as Other → Reduced Size PDF; (2) use Save as Other → Optimized PDF to downsample images; (3) split the document into smaller sections (All tools → Organize pages → Split) and analyze each part separately.",
    });
    return;
  }

  // body-parser's own 413. The `error` text is body-parser's, unchanged; the
  // details name the REAL limits — the bulk endpoint's own "too large"
  // message describes the 5 MB text/plain limit, which a JSON request can
  // never reach because this 1 MB one refuses it first.
  if (shape(err).type === "entity.too.large") {
    res.status(413).json(
      apiErrorBody(413, {
        error: err.message,
        details:
          `A JSON request body may be up to ${mb(BULK_INVENTORY.JSON_BODY_LIMIT_BYTES)}. ` +
          `An NDJSON inventory for /api/bulk-from-inventory may be up to ` +
          `${mb(BULK_INVENTORY.MAX_INVENTORY_BYTES)} when it is sent as text/plain.`,
      }),
    );
    return;
  }

  res
    .status(status)
    .json(
      apiErrorBody(
        status,
        { error: status === 500 ? "Internal server error" : err.message },
        codeOf(err),
      ),
    );
}

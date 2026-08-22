/**
 * Global Express error handler — never leak internals. Extracted from
 * index.ts in v1.88.0 so its logging can be tested.
 *
 * Logging (v1.88.0): an expected client-side outcome — a 4xx, including
 * multer's LIMIT_FILE_SIZE → 413 — logs ONE line: status, code, method, path.
 * It used to log the full error with stack, so an over-sized upload filled
 * the error log exactly like a crash. A server fault (5xx) keeps the full
 * error. Neither line carries an IP, a token, a user agent or a body
 * (req.path has no query string), the same constraint the [rate-limit] lines
 * are tested for.
 */
import type { NextFunction, Request, Response } from "express";
import { ANALYSIS } from "#config";

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

function shape(err: unknown): ErrorShape {
  return typeof err === "object" && err !== null ? (err as ErrorShape) : {};
}

/** The HTTP status this error will be answered with. */
export function statusOf(err: unknown): number {
  const e = shape(err);
  if (e.code === "LIMIT_FILE_SIZE") return 413;
  const s = Number(e.status);
  return Number.isInteger(s) && s >= 400 && s <= 599 ? s : 500;
}

export function logHandledError(err: unknown, req: { method: string; path: string }): void {
  const status = statusOf(err);
  if (status < 500) {
    const e = shape(err);
    const label =
      typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "error";
    console.warn(`[api] ${status} ${label} ${req.method} ${req.path}`);
  } else {
    console.error(err);
  }
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  logHandledError(err, req);

  // Multer file size error
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: `This file is too large. The maximum upload size is ${ANALYSIS.MAX_FILE_SIZE_MB} MB.`,
      details:
        "Large PDFs are often inflated by uncompressed images. To reduce file size: (1) In Adobe Acrobat, use File → Save As Other → Reduced Size PDF; (2) Use File → Save As Other → Optimized PDF to downsample images; (3) Split the document into smaller sections (File → Organize Pages → Split) and analyze each part separately.",
    });
    return;
  }

  const status = err?.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
}

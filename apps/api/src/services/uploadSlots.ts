/**
 * Capacity check for the synchronous upload route, taken BEFORE the body is
 * read.
 *
 * POST /api/analyze buffers the whole file in memory (multer memoryStorage,
 * up to ANALYSIS.MAX_FILE_SIZE_MB) before its handler runs, and only then
 * asks the analyzer for a place — so a saturated server still read and held
 * 25 MB for every request it was about to refuse with 503. /api/analyze-job
 * already reserves its place first (routes/analyzeJob.ts requireJobCapacity);
 * this is the same approach for the synchronous route.
 *
 * The bound is the analyzer's own: MAX_CONCURRENT_ANALYSES running plus
 * MAX_QUEUED_ANALYSES waiting. More synchronous uploads than that cannot all
 * be served anyway — the ones past it were always answered 503, just after
 * their upload instead of before it. The analyzer's semaphore stays the
 * authoritative check (it is shared with the URL routes and the job route);
 * this one only stops the buffering.
 *
 * A place is held from the moment the request is admitted until its response
 * closes, however it ends.
 */
import type { NextFunction, Request, Response } from "express";
import { ANALYSIS } from "#config";
import { apiErrorBody } from "./apiError.js";
import { setBusyRetryAfter } from "./busy.js";

let reserved = 0;

export function uploadSlotLimit(): number {
  return ANALYSIS.MAX_CONCURRENT_ANALYSES + ANALYSIS.MAX_QUEUED_ANALYSES;
}

/** Take a place, or null when there is none. The release is idempotent. */
export function reserveUploadSlot(): (() => void) | null {
  if (reserved >= uploadSlotLimit()) return null;
  reserved++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    reserved--;
  };
}

/** Test hooks. */
export function _reservedUploadSlots(): number {
  return reserved;
}
export function _resetUploadSlots(): void {
  reserved = 0;
}

/** The same body the route sends when the analyzer's line is full. */
export const UPLOAD_BUSY_BODY = apiErrorBody(
  503,
  {
    error: "The server is busy processing other files.",
    details:
      "Please wait a moment and try again. The server can analyze two files at a time — your request will be processed as soon as a slot opens.",
  },
  "SERVER_BUSY",
);

export function requireUploadCapacity(_req: Request, res: Response, next: NextFunction): void {
  const release = reserveUploadSlot();
  if (!release) {
    setBusyRetryAfter(res);
    res.status(503).json(UPLOAD_BUSY_BODY);
    return;
  }
  res.once("close", release);
  next();
}

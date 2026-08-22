/**
 * Classifies an error caught by an audit route into ONE of a closed set of
 * reasons — or null, meaning "this was not an audit failure; record nothing".
 *
 * The reason is persisted (audit_log.reason, migration 13) and exported to the
 * daily activity CSV, and the data-retention policy describes it as a fixed
 * one-word code. So this function is the whole vocabulary: nothing derived
 * from err.message ever leaves it — messages embed file names, URLs and
 * library paths. Pinned by auditFailureClassifier.test.ts.
 *
 * Checks run in order; the first match wins (spec § 1.4):
 *   1. SafeFetchError → fetch-failed (its own codes include "timeout")
 *   2. status 503 (analysis semaphore, PageAuditBusyError) → null: capacity
 *   3. refusal codes → null: rejected-upload already records those
 *   4. parse codes, or an encrypted/password-protected document → unreadable
 *   5. ETIMEDOUT / killed / TimeoutError / AbortError / "timeout" → timeout
 *   6. Chromium "net::ERR_*" → navigation-failed
 *   7. anything else, including non-Error throwables → internal
 */
import { SafeFetchError } from "./safeFetch.js";

export const AUDIT_FAILURE_REASONS = [
  "unreadable",
  "timeout",
  "fetch-failed",
  "navigation-failed",
  "internal",
] as const;

export type AuditFailureReason = (typeof AUDIT_FAILURE_REASONS)[number];

/** Not audit failures: the tool refused the file (recorded as rejected-upload
 *  by the route) or the format is switched off on this server. */
const REFUSAL_CODES = new Set([
  "UNSUPPORTED_FILE_TYPE",
  "DOCX_DISABLED",
  "PPTX_DISABLED",
  "XLSX_DISABLED",
]);

const PARSE_CODES = new Set([
  "PDF_PARSE_FAILED",
  "DOCX_PARSE_FAILED",
  "PPTX_PARSE_FAILED",
  "XLSX_PARSE_FAILED",
]);

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  killed?: unknown;
  name?: unknown;
  message?: unknown;
}

export function classifyAuditFailure(err: unknown): AuditFailureReason | null {
  if (err instanceof SafeFetchError) return "fetch-failed";

  const e: ErrorShape = typeof err === "object" && err !== null ? (err as ErrorShape) : {};
  if (e.status === 503) return null;

  const code = typeof e.code === "string" ? e.code : "";
  if (REFUSAL_CODES.has(code)) return null;
  if (PARSE_CODES.has(code)) return "unreadable";

  const message = typeof e.message === "string" ? e.message : "";
  if (/encrypted|password/i.test(message)) return "unreadable";

  if (
    code === "ETIMEDOUT" ||
    e.killed === true ||
    e.name === "TimeoutError" ||
    e.name === "AbortError" ||
    /timeout/i.test(message)
  ) {
    return "timeout";
  }

  if (/net::ERR_/.test(message)) return "navigation-failed";

  return "internal";
}

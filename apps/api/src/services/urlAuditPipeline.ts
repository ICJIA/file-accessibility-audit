/**
 * Shared URL-audit pipeline for /api/analyze-url and /api/audit-url.
 *
 * Both routes fetch a remote document, sniff its type, derive a filename,
 * and hash it before doing anything route-specific. This function is that
 * common prefix: validated URL in, SSRF-hardened fetch, format detection,
 * filename derivation, and a content hash out. It intentionally stops
 * BEFORE calling analyzeDocument()/analyzeDocument-adjacent persistence:
 * audit-url.ts's hash-dedup cache must be able to short-circuit WITHOUT
 * ever running analysis on a cache hit, so analyzeDocument, recordAudit,
 * and any DB persistence stay in each route, which also keeps this
 * function decoupled from the two routes' differing privileged/response
 * shapes.
 *
 * Security notes (see safeFetch.ts / urlPolicy.ts for the full rationale):
 * - `validateUrl` (validateUrlForFetch, or validateUrlPublic for a
 *   privileged caller) is re-checked by safeFetch on every redirect hop —
 *   scheme, SSRF/private-IP block, and (unless privileged) the hostname
 *   allowlist.
 * - Size cap on fetched content matches the direct-upload cap
 *   (ANALYSIS.MAX_FILE_SIZE_MB via MAX_PDF_BYTES), enforced during
 *   streaming so an oversized body never fully buffers.
 * - Content-type detection uses detectFileType(), which sniffs the
 *   fetched bytes against all four supported formats (PDF, Word .docx,
 *   PowerPoint .pptx, Excel .xlsx) — not a hardcoded %PDF- magic-byte
 *   check.
 */
import type { Response } from "express";
import { detectFileType, type DetectedFileType } from "./analyzer.js";
import { sha256Hex } from "./auditLog.js";
import { safeFetch, SafeFetchError } from "./safeFetch.js";
import {
  MAX_PDF_BYTES,
  FETCH_TIMEOUT_MS,
  sendSafeFetchError,
  validateUrlForFetch,
  validateUrlPublic,
} from "./urlPolicy.js";

export interface RunUrlAuditInput {
  /** Already validated as a non-empty string by the caller. */
  url: string;
  /** Whether the caller presented a valid API_PRIVILEGED_TOKEN. */
  privileged: boolean;
  /**
   * Used to write the HTTP response directly on every early-exit failure
   * path (400/502/422, or whatever sendSafeFetchError maps a
   * SafeFetchError to) — mirrors the sendSafeFetchError(res, err) pattern
   * already used elsewhere, so failures look exactly like they did when
   * this logic was inlined in each route.
   */
  res: Response;
}

export type UrlAuditOutcome =
  | { ok: false }
  | {
      ok: true;
      buf: Buffer;
      filename: string;
      fileType: DetectedFileType;
      contentHash: string;
    };

/**
 * Fetch → detect → derive filename → hash. Returns `{ ok: false }` after
 * already writing the appropriate error response to `res` when the URL
 * can't be fetched or the fetched content isn't a supported document type;
 * callers should just `return` in that case. Any exception this function
 * doesn't handle itself (e.g. a non-SafeFetchError thrown by safeFetch)
 * propagates to the caller's own try/catch, unchanged from today.
 */
export async function runUrlAudit(input: RunUrlAuditInput): Promise<UrlAuditOutcome> {
  const { url, privileged, res } = input;

  // SSRF-hardened fetch. safeFetch handles:
  //   - URL allowlist (re-checked on every redirect hop)
  //   - DNS resolution + private-IP rejection on every hop
  //   - Manual redirect handling (max 3 hops, no fetch-internal
  //     blind follow)
  //   - Size cap enforced during streaming (no oversized buffer)
  //   - Timeout
  // SafeFetchError carries a structured code that maps to the right
  // HTTP status via sendSafeFetchError.
  let fetched;
  try {
    fetched = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_PDF_BYTES,
      validateUrl: privileged ? validateUrlPublic : validateUrlForFetch,
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      sendSafeFetchError(res, err);
      return { ok: false };
    }
    throw err;
  }

  if (!fetched.ok) {
    res.status(502).json({
      error: `fetch returned ${fetched.status} ${fetched.statusText}`,
    });
    return { ok: false };
  }

  const buf = fetched.buffer;

  // Detect PDF vs DOCX vs PPTX vs XLSX from the fetched content (not the URL extension).
  const fileType = await detectFileType(buf);
  if (!fileType) {
    res.status(422).json({
      error: "Fetched content is not a supported document.",
      details:
        "The URL must point directly at a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file — the fetched content matches none of these formats.",
    });
    return { ok: false };
  }

  // Derive a safe filename from the final URL's path (after any followed
  // redirects). safeFetch returns finalUrl so we use the redirect target's
  // filename rather than the original.
  const finalPath = new URL(fetched.finalUrl).pathname;
  const rawName = finalPath.split("/").pop() ?? `remote.${fileType}`;
  const filename = rawName.slice(0, 200) || `remote.${fileType}`;

  const contentHash = sha256Hex(buf);

  return { ok: true, buf, filename, fileType, contentHash };
}

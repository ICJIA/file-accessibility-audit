import { Router, Request, Response, type IRouter } from "express";
import { AUDIT_TIMEOUT_SUMMARY } from "@file-audit/shared";
import crypto from "node:crypto";
import { bulkLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { forLog } from "../services/logSanitize.js";
import { analyzeDocument, detectFileType } from "../services/analyzer.js";
import { recordAudit, recordAuditFailure, sha256Hex } from "../services/auditLog.js";
import { safeFetch, SafeFetchError } from "../services/safeFetch.js";
import { validateUrlForFetch } from "../services/urlPolicy.js";
import { SHARED_REPORTS } from "#config";
import db from "../db/sqlite.js";
import { sanitizeStoredReport } from "../services/reportSanitize.js";
import { classifyAuditFailure } from "../services/auditFailure.js";
import { engineVersion } from "../services/engineVersion.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INVENTORY_BYTES = 5 * 1024 * 1024; // 5 MB NDJSON cap
const MAX_FILE_BYTES = 25 * 1024 * 1024; // match ANALYSIS.MAX_FILE_SIZE_MB; applies to any of the four supported formats, not just PDF
const MAX_FILES_PER_REQUEST = 100; // cap to keep requests reasonable
const FETCH_TIMEOUT_MS = 30_000; // matches SCHEDULED_CHECKS.FETCH_TIMEOUT_MS

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryEntry {
  path: string;
  filename: string;
  category: string;
  publicUrl?: string;
  sha256?: string;
}

/** A matching inventory line that cannot be audited as written — reported
 *  as its own failed result instead of being fetched. */
interface InvalidEntry {
  path: string;
  sha256?: string;
  error: string;
}

interface BulkResult {
  sha256?: string;
  path: string;
  publicUrl?: string;
  overallScore?: number;
  grade?: string;
  reportId?: string;
  reportUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// RB3-4 [pre-merge re-audit]: curated, per-code client-facing text for a
// SafeFetchError caught around the safeFetch() call below — never echoes
// the raw e.message (network_error/dns_failed wrap a raw Node socket/DNS
// error's .message, which is unpredictable and not meant for end users;
// see safeFetch.ts). Keeps the useful classification (the code, still
// prefixed onto the returned string) without the raw detail. Mirrors the
// generic per-entry catch-all's F2 fix further below — same rationale, this
// is the SafeFetchError-specific catch, which F2 didn't touch.
function curateSafeFetchMessage(code: string): string {
  switch (code) {
    case "malformed_url":
    case "redirect_invalid":
      return "the URL could not be parsed or redirected to an invalid location";
    case "private_ip":
      return "the URL resolves to a private or reserved address and cannot be fetched";
    case "dns_failed":
      return "the URL's hostname could not be resolved";
    case "redirect_loop":
      return "the URL redirected in a loop";
    case "too_many_redirects":
      return "the URL redirected too many times";
    case "timeout":
      return "the request to the URL timed out";
    case "oversized":
      return "the file at the URL exceeded the size limit";
    case "network_error":
      return "could not connect to the URL";
    default:
      return "the file could not be fetched";
  }
}

// v1.20.1 SECURITY FIX (red/blue team finding P1.4): the previous
// implementation used a private `fetchWithTimeout` here with NO host
// allowlist and NO private-IP rejection. Authenticated callers with
// a PAT could submit an inventory containing arbitrary URLs —
// including internal addresses — and the server would dutifully
// fetch them, returning the response body and timing through the
// per-entry result. That's a textbook SSRF vector even though the
// endpoint required auth.
//
// Replaced with the centralized SSRF-hardened safeFetch + the same
// allowlist (validateUrlForFetch) used by /api/analyze-url and
// /api/audit-url. DNS resolution + private-IP rejection happens on
// every hop including redirects.

/**
 * Parse + SHAPE-VALIDATE the inventory (review 2026-11-12). Every field read
 * from a line is client JSON, so each is type-checked here, once, up front:
 *
 *   - a line that is not a JSON object (`null`, `7`, `"x"`, `[…]`) is skipped
 *     like an unparseable line — `parsed.kind` on `null` used to throw and
 *     500 the whole request;
 *   - `path` / `filename` / `sha256` that are not strings fall back to the
 *     documented defaults (a non-string `filename` on a FAILING entry used to
 *     throw inside the failure recorder, escape the per-entry catch, and lose
 *     every result already computed);
 *   - a `publicUrl` that is present but not a string is reported as that
 *     entry's own error (`invalid`) — rejected individually, never fetched.
 *
 * Exported for tests.
 */
export function parseInventory(
  inventoryText: string,
  filterCategory: string,
): { entries: InventoryEntry[]; invalid: InvalidEntry[]; totalLineCount: number } {
  const lines = inventoryText.split("\n").filter((l) => l.trim().length > 0);
  const entries: InventoryEntry[] = [];
  const invalid: InvalidEntry[] = [];
  let publicUrlBase: string | undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;

    // filecap header record carries publicUrlBase in metadata
    if (typeof parsed.kind === "string" && parsed.kind.endsWith("-header")) {
      publicUrlBase = str(parsed.metadata?.publicUrlBase);
      continue;
    }

    // skip footer records
    if (typeof parsed.kind === "string" && parsed.kind.endsWith("-footer")) continue;

    if (parsed.category !== filterCategory) continue;

    // Resolve publicUrl: use entry value first, then construct from header base + path
    const entryPath = str(parsed.path) ?? "";
    const sha256 = str(parsed.sha256);

    if (
      parsed.publicUrl !== undefined &&
      parsed.publicUrl !== null &&
      typeof parsed.publicUrl !== "string"
    ) {
      invalid.push({
        path: entryPath,
        sha256,
        error: "invalid inventory entry: publicUrl must be a string",
      });
      if (entries.length + invalid.length >= MAX_FILES_PER_REQUEST) break;
      continue;
    }

    let publicUrl: string | undefined = str(parsed.publicUrl);
    if (!publicUrl && publicUrlBase) {
      const cleanBase = publicUrlBase.replace(/\/+$/, "");
      const cleanPath = entryPath.replace(/^\/+/, "");
      if (cleanPath) {
        publicUrl = `${cleanBase}/${cleanPath}`;
      }
    }

    if (!publicUrl) continue;

    entries.push({
      path: entryPath,
      filename: str(parsed.filename) ?? str(parsed.path) ?? `unnamed.${filterCategory}`,
      category: parsed.category,
      publicUrl,
      sha256,
    });

    if (entries.length + invalid.length >= MAX_FILES_PER_REQUEST) break;
  }

  return { entries, invalid, totalLineCount: lines.length };
}

// ---------------------------------------------------------------------------
// POST /api/bulk-from-inventory
// ---------------------------------------------------------------------------
// Accepts a filecap NDJSON inventory, iterates the entries matching
// filterCategory, fetches each file server-side, and audits it through the
// same detectFileType + analyzeDocument dispatcher /api/analyze-url and
// /api/audit-url use — so every audited file inherits the concurrency
// semaphore, per-format DoS caps, and the interruptible-child-process
// analysis timeout. Persists results via shared_reports and returns a
// manifest with per-file scores/grades.
//
// This endpoint used to accept PDFs only (a raw %PDF- magic-byte gate + a
// direct analyzePDF call; filterCategory always defaulted to 'pdf' and any
// other value's entries would parse fine here but then always fail that
// magic-byte gate). filterCategory now also accepts 'docx', 'pptx', and
// 'xlsx' to audit the other three supported formats — one category per
// request, same as before. The default stays 'pdf' so existing callers keep
// working byte-identically.
//
// No authentication (none exists since v1.68.0). One request fans out into
// up to MAX_FILES_PER_REQUEST server-side fetches and analyses, so it carries
// its own rate-limit budget (bulkLimiter, 2026-09-02) rather than sharing the
// share-link limiter's.
//
// Processing is serial to respect the shared concurrency semaphore in
// pdfAnalyzer.ts (used by every format via analyzeDocument). For
// inventories with many files this endpoint is slow by design — a
// background job model is the long-term answer for large fleets.
// ---------------------------------------------------------------------------

/**
 * The per-document error line for one inventory entry, or null when nothing
 * matched — the caller logs that case server-side and records a generic line,
 * because a raw err.message can carry library internals and filesystem paths.
 *
 * Exported so the mapping is TESTED RATHER THAN RE-IMPLEMENTED: its test used
 * to keep a hand-copied duplicate of this chain, which had already drifted
 * from production on the unmatched case.
 */
export function mapEntryError(err: any): string | null {
  if (err?.name === "AbortError") return `fetch timed out after ${FETCH_TIMEOUT_MS}ms`;
  if (err?.status === 503) return "server busy — analysis queue full, try again";
  if (err?.code === "DOCX_DISABLED")
    return "Word (.docx) auditing is currently disabled on this server";
  if (err?.code === "PPTX_DISABLED")
    return "PowerPoint (.pptx) auditing is currently disabled on this server";
  if (err?.code === "XLSX_DISABLED")
    return "Excel (.xlsx) auditing is currently disabled on this server";
  if (err?.code === "DOCX_PARSE_FAILED")
    return "the Word (.docx) file could not be read (corrupt or not a valid Word document)";
  if (err?.code === "PPTX_PARSE_FAILED")
    return "the PowerPoint (.pptx) file could not be read (corrupt or not a valid PowerPoint presentation)";
  if (err?.code === "XLSX_PARSE_FAILED")
    return "the Excel (.xlsx) file could not be read (corrupt or not a valid Excel workbook)";
  if (err?.code === "ETIMEDOUT" || err?.killed) return AUDIT_TIMEOUT_SUMMARY;
  if (err?.message?.includes("encrypted") || err?.message?.includes("password"))
    return "PDF is password-protected and cannot be analyzed";
  return null;
}

router.post(
  "/bulk-from-inventory",
  bulkLimiter,
  // Use text/plain body parsing with an expanded 5 MB limit for the inventory
  // payload. The global express.json({ limit: '1mb' }) does not cover this
  // route because the Content-Type here is text/plain, not application/json.
  // Callers should send: Content-Type: text/plain  (or multipart — TBD).
  // For the initial implementation the caller can also send JSON with an
  // `inventory` string field; see parsing logic below.
  async (req: Request, res: Response) => {
    try {
      // Tier recorded on every bulk audit row so /status can attribute this
      // fleet volume to the privileged tier.
      const privileged = isPrivilegedRequest(req);
      // Support two intake modes:
      //   1. JSON body: { inventory: "<NDJSON>", filterCategory?: "pdf" | "docx" | "pptx" | "xlsx" }
      //   2. Raw text/plain body: the NDJSON content directly
      //      (requires the caller to set Content-Type: text/plain).
      //      filterCategory has no side channel in this mode, so it always
      //      uses the 'pdf' default below — pre-existing limitation,
      //      unchanged by the four-format migration.
      let inventoryText: string | undefined;
      let filterCategory = "pdf";

      const contentType = req.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        // Mode 1: JSON body — inventory field carries the NDJSON text
        inventoryText = req.body?.inventory;
        if (typeof req.body?.filterCategory === "string") {
          filterCategory = req.body.filterCategory;
        }
      } else if (contentType.includes("text/plain")) {
        // Mode 2: raw text body — entire body is the NDJSON
        // express.text() middleware must be mounted above this route for this
        // to work. See index.ts for the mount.
        inventoryText = req.body;
      } else {
        // Fallback: try JSON body field for curl --data-binary use
        inventoryText = req.body?.inventory;
      }

      if (typeof inventoryText !== "string" || inventoryText.length === 0) {
        res.status(400).json({
          error:
            'Missing inventory. Send { "inventory": "<NDJSON>" } as JSON, or send the NDJSON directly as text/plain.',
        });
        return;
      }

      if (inventoryText.length > MAX_INVENTORY_BYTES) {
        res.status(413).json({
          error: `Inventory too large. Maximum is ${MAX_INVENTORY_BYTES} bytes (${MAX_INVENTORY_BYTES / 1024 / 1024} MB).`,
        });
        return;
      }

      // Parse the NDJSON and filter to the target category
      const { entries, invalid, totalLineCount } = parseInventory(inventoryText, filterCategory);

      if (entries.length === 0 && invalid.length === 0) {
        res.status(400).json({
          error: `Inventory contains no ${filterCategory} entries with a resolvable public URL.`,
          details:
            "Each entry needs either a publicUrl field, or a publicUrlBase in the inventory header so the URL can be constructed from the path. Supported filterCategory values are pdf, docx, pptx, and xlsx (default: pdf).",
        });
        return;
      }

      // Process each entry serially: fetch → validate → analyze → persist
      // Entries refused at parse time are reported first, each as its own
      // failed result — one bad line never costs the rest of the batch.
      const results: BulkResult[] = invalid.map((bad) => ({
        sha256: bad.sha256,
        path: bad.path,
        error: bad.error,
      }));

      // Stop when the client has gone (review 2026-11-12). A batch is up to
      // 100 serial fetch + analyse + INSERT rounds; without this, a caller
      // that disconnected after the first one left the server fetching and
      // storing reports nobody would ever receive. `res` 'close' before the
      // response has been written means the connection dropped (`req` 'close'
      // is no use here: since Node 16 it also fires once the body is read).
      const abort = new AbortController();
      let clientGone = false;
      const onClose = (): void => {
        if (res.writableEnded) return;
        clientGone = true;
        abort.abort();
      };
      if (typeof res.on === "function") res.on("close", onClose);

      for (const entry of entries) {
        if (clientGone) break;
        const result: BulkResult = {
          sha256: entry.sha256,
          path: entry.path,
          publicUrl: entry.publicUrl,
        };

        try {
          // SSRF-hardened fetch — allowlist + DNS-rebinding + redirect
          // chain mitigations (v1.20.1+). Errors propagate as a
          // SafeFetchError which we map to a per-entry error string.
          let fetched;
          try {
            fetched = await safeFetch(entry.publicUrl!, {
              timeoutMs: FETCH_TIMEOUT_MS,
              maxBytes: MAX_FILE_BYTES,
              validateUrl: validateUrlForFetch,
              signal: abort.signal,
            });
          } catch (e) {
            // Aborted because the client disconnected: not a failed audit of
            // this entry, and nobody to report it to — just stop.
            if (e instanceof SafeFetchError && e.code === "aborted") break;
            if (e instanceof SafeFetchError) {
              // RB3-4 [pre-merge re-audit]: never echo the raw e.message —
              // curateSafeFetchMessage keeps the code classification, drops
              // the raw (possibly-Node-socket-internal) detail. Full detail
              // still goes to the server log.
              console.error(
                `Bulk-from-inventory fetch error (${e.code}) for ${forLog(entry.publicUrl)}:`,
                e,
              );
              // v1.88.0: a URL the tool could not fetch is a failed audit of
              // that inventory entry.
              recordAuditFailure({
                eventType: "bulk-from-inventory",
                privileged,
                filename: entry.filename,
                reason: "fetch-failed",
              });
              result.error = `${e.code}: ${curateSafeFetchMessage(e.code)}`;
              results.push(result);
              continue;
            }
            throw e;
          }

          if (!fetched.ok) {
            // v1.88.0: an upstream HTTP error status is a failed audit of
            // that inventory entry too, same as a SafeFetchError above.
            recordAuditFailure({
              eventType: "bulk-from-inventory",
              privileged,
              filename: entry.filename,
              reason: "fetch-failed",
            });
            result.error = `fetch failed: ${fetched.status} ${fetched.statusText}`;
            results.push(result);
            continue;
          }

          const buf = fetched.buffer;
          if (clientGone) break;

          // Detect PDF vs DOCX vs PPTX vs XLSX from the fetched content
          // (not the inventory's declared category) — same dispatcher
          // /api/analyze-url and /api/audit-url use. Replaces the old hard
          // %PDF- magic-byte check, which made every non-PDF entry fail
          // here even when filterCategory selected docx/pptx/xlsx entries
          // upstream in parseInventory().
          const fileType = await detectFileType(buf);
          if (!fileType) {
            result.error =
              "fetched content is not a supported document (matches none of PDF, Word .docx, PowerPoint .pptx, or Excel .xlsx)";
            results.push(result);
            continue;
          }

          const contentHash = sha256Hex(buf);
          const analysis = await analyzeDocument(buf, entry.filename);
          // Nobody left to receive it: do not store a report for it either.
          if (clientGone) break;

          result.overallScore = analysis.overallScore;
          result.grade = analysis.grade;

          // Persist to shared_reports for a stable shareable URL
          const id = crypto.randomBytes(16).toString("hex");
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS);

          // F3 [LOW, defense-in-depth, pre-merge re-audit finding]: reports.ts
          // runs every stored report through sanitizeStoredReport() before
          // it's written (strips unsafe helpLinks[].url / neutralizes
          // conformance finding urls anywhere in the payload — a stored-XSS
          // guard on the public /report/:id page). This insert skipped that
          // call. It's a no-op for analyzeDocument's own output today (its
          // helpLinks/conformance urls aren't attacker-shaped), but applying
          // the same sanitizer here keeps the store boundary consistently
          // enforced. Fall back to the unsanitized analysis on the
          // (structurally-shouldn't-happen-for-internal-output) failure case
          // rather than newly failing the whole batch entry over it.
          const sanitized = sanitizeStoredReport(analysis);
          const reportToStore = sanitized.ok ? sanitized.report : analysis;

          db.prepare(
            // engine_version: recorded like /api/audit-url's inserts, whose
            // version-aware dedup reads this same table by content hash — a
            // bulk row without it would be a permanent cache miss there.
            "INSERT INTO shared_reports (id, filename, report_json, content_hash, expires_at, engine_version) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            entry.filename,
            JSON.stringify(reportToStore),
            contentHash,
            expiresAt.toISOString(),
            engineVersion(),
          );

          // Canonical audit-log write so each bulk-audited entry
          // counts for the remediation gate (v1.20.1+). Metadata only.
          recordAudit({
            eventType: "bulk-from-inventory",
            privileged,
            filename: entry.filename,
            score: analysis.overallScore,
            grade: analysis.grade,
            contentHash,
          });

          result.reportId = id;
          result.reportUrl = `/api/reports/${id}`;
        } catch (err: any) {
          // v1.88.0: record the failed audit before mapping the error to the
          // per-entry message. null = capacity (503), recorded nowhere.
          const failure = classifyAuditFailure(err);
          if (failure) {
            recordAuditFailure({
              eventType: "bulk-from-inventory",
              privileged,
              filename: entry.filename,
              reason: failure,
            });
          }
          // Distinguish specific error types for better diagnostics. The
          // *_DISABLED / *_PARSE_FAILED / ETIMEDOUT branches below are new
          // as of the four-format migration — analyzeDocument's docx/pptx/
          // xlsx paths can throw FileTypeError, DocxParseError/
          // PptxParseError/XlsxParseError, or a killed/ETIMEDOUT error from
          // the child-process runner (ooxmlRunner.ts). Each maps to a
          // per-file result.error string here (mirroring how audit-url.ts /
          // analyze-url.ts map the same codes to HTTP statuses) instead of
          // aborting the batch.
          const mapped = mapEntryError(err);
          if (mapped) {
            result.error = mapped;
          } else {
            // F2 [MEDIUM, pre-merge re-audit finding]: never echo the raw
            // err.message to the client — it can leak library internals /
            // filesystem paths, same rationale as the outer catch below and
            // audit-url.ts's / analyze-url.ts's generic-500 fallback. Log
            // the detail server-side only.
            console.error("Bulk-from-inventory per-entry analysis error:", err);
            result.error = "Analysis failed for this item.";
          }
        }

        results.push(result);
      }

      if (typeof res.off === "function") res.off("close", onClose);
      if (clientGone) {
        console.warn(
          `[bulk-from-inventory] client disconnected — stopped after ${results.length} of ` +
            `${entries.length + invalid.length} entries`,
        );
        return;
      }

      const analyzed = results.filter((r) => r.overallScore !== undefined).length;
      const failed = results.filter((r) => r.error !== undefined).length;
      const skipped = totalLineCount - entries.length - invalid.length;

      res.json({
        summary: {
          total: entries.length + invalid.length,
          analyzed,
          failed,
          skipped,
        },
        results,
      });
    } catch (err: any) {
      // F2 [MEDIUM, pre-merge re-audit finding]: `details: err?.message` used
      // to echo the raw thrown message to the client — never do that (it can
      // leak library internals / filesystem paths). Log server-side only,
      // same pattern as audit-url.ts's / analyze-url.ts's generic-500
      // fallback and the per-entry catch-all above.
      console.error("Bulk-from-inventory error:", err);
      res.status(500).json({
        error: "Internal error during bulk processing.",
      });
    }
  },
);

export default router;

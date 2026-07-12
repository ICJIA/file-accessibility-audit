import { Router, Response, type IRouter } from "express";
import crypto from "node:crypto";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware.js";
import { reportsLimiter } from "../middleware/rateLimiter.js";
import { analyzeDocument, detectFileType } from "../services/analyzer.js";
import { gateIdentity, recordAudit, sha256Hex } from "../services/auditLog.js";
import { safeFetch, SafeFetchError } from "../services/safeFetch.js";
import { validateUrlForFetch } from "../services/urlPolicy.js";
import { SHARED_REPORTS } from "#config";
import db from "../db/sqlite.js";
import { sanitizeStoredReport } from "../services/reportSanitize.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INVENTORY_BYTES = 5 * 1024 * 1024; // 5 MB NDJSON cap
const MAX_FILE_BYTES = 15 * 1024 * 1024; // match ANALYSIS.MAX_FILE_SIZE_MB; applies to any of the four supported formats, not just PDF
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

function parseInventory(
  inventoryText: string,
  filterCategory: string,
): { entries: InventoryEntry[]; totalLineCount: number } {
  const lines = inventoryText.split("\n").filter((l) => l.trim().length > 0);
  const entries: InventoryEntry[] = [];
  let publicUrlBase: string | undefined;

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // filecap header record carries publicUrlBase in metadata
    if (typeof parsed.kind === "string" && parsed.kind.endsWith("-header")) {
      publicUrlBase = parsed.metadata?.publicUrlBase;
      continue;
    }

    // skip footer records
    if (typeof parsed.kind === "string" && parsed.kind.endsWith("-footer")) continue;

    if (parsed.category !== filterCategory) continue;

    // Resolve publicUrl: use entry value first, then construct from header base + path
    let publicUrl: string | undefined = parsed.publicUrl;
    if (!publicUrl && publicUrlBase) {
      const cleanBase = publicUrlBase.replace(/\/+$/, "");
      const cleanPath = (parsed.path ?? "").replace(/^\/+/, "");
      if (cleanPath) {
        publicUrl = `${cleanBase}/${cleanPath}`;
      }
    }

    if (!publicUrl) continue;

    entries.push({
      path: parsed.path ?? "",
      filename: parsed.filename ?? parsed.path ?? `unnamed.${filterCategory}`,
      category: parsed.category,
      publicUrl,
      sha256: parsed.sha256,
    });

    if (entries.length >= MAX_FILES_PER_REQUEST) break;
  }

  return { entries, totalLineCount: lines.length };
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
// Auth required (authMiddleware). The reportsLimiter is reused; a dedicated
// bulk rate-limit class may be warranted once traffic patterns are known.
//
// Processing is serial to respect the shared concurrency semaphore in
// pdfAnalyzer.ts (used by every format via analyzeDocument). For
// inventories with many files this endpoint is slow by design — a
// background job model is the long-term answer for large fleets.
// ---------------------------------------------------------------------------

router.post(
  "/bulk-from-inventory",
  authMiddleware,
  reportsLimiter,
  // Use text/plain body parsing with an expanded 5 MB limit for the inventory
  // payload. The global express.json({ limit: '1mb' }) does not cover this
  // route because the Content-Type here is text/plain, not application/json.
  // Callers should send: Content-Type: text/plain  (or multipart — TBD).
  // For the initial implementation the caller can also send JSON with an
  // `inventory` string field; see parsing logic below.
  async (req: AuthRequest, res: Response) => {
    try {
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
      const { entries, totalLineCount } = parseInventory(inventoryText, filterCategory);

      if (entries.length === 0) {
        res.status(400).json({
          error: `Inventory contains no ${filterCategory} entries with a resolvable public URL.`,
          details:
            "Each entry needs either a publicUrl field, or a publicUrlBase in the inventory header so the URL can be constructed from the path. Supported filterCategory values are pdf, docx, pptx, and xlsx (default: pdf).",
        });
        return;
      }

      // Process each entry serially: fetch → validate → analyze → persist
      const results: BulkResult[] = [];

      for (const entry of entries) {
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
            });
          } catch (e) {
            if (e instanceof SafeFetchError) {
              // RB3-4 [pre-merge re-audit]: never echo the raw e.message —
              // curateSafeFetchMessage keeps the code classification, drops
              // the raw (possibly-Node-socket-internal) detail. Full detail
              // still goes to the server log.
              console.error(
                `Bulk-from-inventory fetch error (${e.code}) for ${entry.publicUrl}:`,
                e,
              );
              result.error = `${e.code}: ${curateSafeFetchMessage(e.code)}`;
              results.push(result);
              continue;
            }
            throw e;
          }

          if (!fetched.ok) {
            result.error = `fetch failed: ${fetched.status} ${fetched.statusText}`;
            results.push(result);
            continue;
          }

          const buf = fetched.buffer;

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
            "INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            req.user!.email,
            entry.filename,
            JSON.stringify(reportToStore),
            contentHash,
            expiresAt.toISOString(),
          );

          // Canonical audit-log write so each bulk-audited entry
          // counts for the remediation gate (v1.20.1+).
          recordAudit({
            eventType: "bulk-from-inventory",
            email: gateIdentity(req.user?.email ?? null, req.ip),
            filename: entry.filename,
            score: analysis.overallScore,
            grade: analysis.grade,
            contentHash,
            ipAddress: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
          });

          result.reportId = id;
          result.reportUrl = `/api/reports/${id}`;
        } catch (err: any) {
          // Distinguish specific error types for better diagnostics. The
          // *_DISABLED / *_PARSE_FAILED / ETIMEDOUT branches below are new
          // as of the four-format migration — analyzeDocument's docx/pptx/
          // xlsx paths can throw FileTypeError, DocxParseError/
          // PptxParseError/XlsxParseError, or a killed/ETIMEDOUT error from
          // the child-process runner (ooxmlRunner.ts). Each maps to a
          // per-file result.error string here (mirroring how audit-url.ts /
          // analyze-url.ts map the same codes to HTTP statuses) instead of
          // aborting the batch.
          if (err?.name === "AbortError") {
            result.error = `fetch timed out after ${FETCH_TIMEOUT_MS}ms`;
          } else if (err?.status === 503) {
            result.error = "server busy — analysis queue full, try again";
          } else if (err?.code === "DOCX_DISABLED") {
            result.error = "Word (.docx) auditing is currently disabled on this server";
          } else if (err?.code === "PPTX_DISABLED") {
            result.error = "PowerPoint (.pptx) auditing is currently disabled on this server";
          } else if (err?.code === "XLSX_DISABLED") {
            result.error = "Excel (.xlsx) auditing is currently disabled on this server";
          } else if (err?.code === "DOCX_PARSE_FAILED") {
            result.error =
              "the Word (.docx) file could not be read (corrupt or not a valid Word document)";
          } else if (err?.code === "PPTX_PARSE_FAILED") {
            result.error =
              "the PowerPoint (.pptx) file could not be read (corrupt or not a valid PowerPoint presentation)";
          } else if (err?.code === "XLSX_PARSE_FAILED") {
            result.error =
              "the Excel (.xlsx) file could not be read (corrupt or not a valid Excel workbook)";
          } else if (err?.code === "ETIMEDOUT" || err?.killed) {
            result.error =
              "analysis timed out — this document is too complex to analyze within the time limit";
          } else if (err?.message?.includes("encrypted") || err?.message?.includes("password")) {
            result.error = "PDF is password-protected and cannot be analyzed";
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

      const analyzed = results.filter((r) => r.overallScore !== undefined).length;
      const failed = results.filter((r) => r.error !== undefined).length;
      const skipped = totalLineCount - entries.length;

      res.json({
        summary: {
          total: entries.length,
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

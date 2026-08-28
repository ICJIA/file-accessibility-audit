import { Router, Request, Response, type IRouter } from "express";
import crypto from "node:crypto";
import { regradeStoredReport } from "@file-audit/analyzer";
import { AUDIT_TIMEOUT_MESSAGE } from "@file-audit/shared";
import { analyzeLimiter, isPrivilegedRequest } from "../middleware/rateLimiter.js";
import { analyzeDocument } from "../services/analyzer.js";
import { recordAudit, recordAuditFailure } from "../services/auditLog.js";
import { DEPLOY, SHARED_REPORTS } from "#config";
import db from "../db/sqlite.js";
import { isAllowedUrl } from "../services/urlPolicy.js";
import { runUrlAudit } from "../services/urlAuditPipeline.js";
import { sanitizeStoredReport } from "../services/reportSanitize.js";
import { classifyAuditFailure } from "../services/auditFailure.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/audit-url
// ---------------------------------------------------------------------------
// Combined "analyze a document by URL and persist a shareable report"
// endpoint. Designed for fleet-audit automation: one call per document
// returns the strict / practical grades plus a stable reportUrl that can
// be embedded in the fleet inventory's HTML / CSV output.
//
// Accepts PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) —
// detected from the fetched content via detectFileType(), never from the
// URL's extension — and dispatched through the same analyzeDocument()
// pipeline used by /api/analyze and /api/analyze-url, so this endpoint
// inherits the concurrency semaphore, per-format DoS caps, and the
// interruptible-child-process analysis timeout for free. This endpoint
// used to accept PDFs only (a raw %PDF- magic-byte gate + a direct
// analyzePDF call); fleet callers that send PDFs keep working
// byte-identically after this change.
//
// Body: { url: string, force?: boolean }
// Auth: none — the tool has no accounts (v1.68.0); per-IP rate limits apply
//
// Hash-based dedup (Policy A):
//   After fetching the document the server computes sha256(bytes). If an
//   unexpired shared_reports row already exists for that content_hash
//   the existing reportUrl is returned and no new audit runs. Pass
//   force=true (body field) or ?force=true (query) to skip dedup and
//   produce a fresh audit + new reportId.
//
// Response shape — fleet-CSV friendly (every field a single scalar):
//   {
//     "filename":        "report.pdf",
//     "pageCount":       12,
//     "audited":         "2026-05-18T15:32:11.000Z",
//     "strict":   { "score": 49, "grade": "F" },
//     "practical":{ "score": 49, "grade": "F" },   // v1.21+: alias of strict
//     "reportId":        "<32 hex chars>",
//     "reportUrl":       "https://audit.icjia.app/report/<id>",
//     "reportExpiresAt": "2027-05-18T15:32:11.000Z",
//     "cached":          false
//   }
//
// As of v1.21.0 the UI shows only the Strict (WCAG + IITAA §E205.4)
// score. `practical` is retained as an alias of `strict` so existing
// fleet CSVs and external consumers keep parsing without changes — the
// alias will be removed in a future release.
// ---------------------------------------------------------------------------

interface DedupRow {
  id: string;
  report_json: string;
  filename: string;
  expires_at: string;
}

function getReportBaseUrl(): string {
  // Mirror the CORS resolution in apps/api/src/index.ts.
  const isProduction = process.env.NODE_ENV === "production";
  return isProduction ? DEPLOY.PRODUCTION_URL : DEPLOY.DEV_FRONTEND_URL;
}

function buildReportUrl(id: string): string {
  return `${getReportBaseUrl()}/report/${id}`;
}

router.post("/audit-url", analyzeLimiter, async (req: Request, res: Response) => {
  try {
    const url = req.body?.url;
    if (typeof url !== "string" || url.length === 0) {
      res.status(400).json({ error: "Missing required field: url" });
      return;
    }

    // Honor either body.force or ?force=true for CLI ergonomics.
    const force =
      req.body?.force === true || req.body?.force === "true" || req.query?.force === "true";

    // Privileged (API_PRIVILEGED_TOKEN) callers may audit any public URL;
    // anonymous callers are restricted to the ICJIA / illinois.gov allowlist.
    // The private/reserved-IP SSRF block inside safeFetch stays on either way.
    const privileged = isPrivilegedRequest(req);
    const check = isAllowedUrl(url);
    if (!privileged && !check.ok) {
      res.status(400).json({
        error: "URL not allowed",
        details: check.reason,
      });
      return;
    }

    // SSRF-hardened fetch (v1.20.1+), format detection, filename
    // derivation, and content hash — shared with /api/analyze-url. See
    // urlAuditPipeline.ts for the DNS-rebinding + redirect-chain
    // mitigations and why analyzeDocument itself stays out of it (this
    // route's dedup cache below must be able to skip analysis entirely
    // on a cache hit).
    const outcome = await runUrlAudit({ url, privileged, res, eventType: "audit-url" });
    if (!outcome.ok) return;
    const { buf, filename, contentHash } = outcome;

    // --- Dedup lookup -------------------------------------------------
    // Unless force=true, look for an unexpired report with the same
    // content hash. If found, short-circuit with the cached entry so the
    // fleet inventory keeps a stable URL. Content-hash only (v1.68.0):
    // with sign-in gone every caller shared one identity anyway, so this
    // preserves the exact behavior production already had.
    if (!force) {
      const existing = db
        .prepare<[string, string]>(
          `SELECT id, report_json, filename, expires_at
               FROM shared_reports
              WHERE content_hash = ?
                AND expires_at > ?
              ORDER BY created_at DESC
              LIMIT 1`,
        )
        .get(contentHash, new Date().toISOString()) as DedupRow | undefined;

      if (existing) {
        // Regrade to the current scoring model before extracting scores —
        // the same regrade /report/:id applies (reports.ts). Without it this
        // branch serves the score frozen on the original audit date while
        // the reportUrl in the SAME response leads to a page showing the
        // regraded one; the fleet inventory published those stale pairs.
        const cached = regradeStoredReport(JSON.parse(existing.report_json));
        res.json({
          filename: existing.filename,
          pageCount: cached.pageCount ?? null,
          audited: cached.audited ?? null,
          strict: extractProfileScore(cached),
          practical: extractProfileScore(cached),
          reportId: existing.id,
          reportUrl: buildReportUrl(existing.id),
          reportExpiresAt: existing.expires_at,
          cached: true,
        });
        return;
      }
    }

    // --- Fresh audit + persist ----------------------------------------
    // filename is already derived from the final (post-redirect) URL by
    // runUrlAudit, mirroring analyze-url.ts — safeFetch returns finalUrl
    // so a short-link that 302s to the real file is named after the real
    // file, not the short-link path. The fallback name is parameterized
    // by the detected type instead of a hardcoded .pdf.
    const result = await analyzeDocument(buf, filename);
    const audited = new Date().toISOString();

    const id = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS);
    const reportExpiresAt = expiresAt.toISOString();

    // Persist with the audited timestamp baked into the report payload
    // so cached responses can return the original audit time later.
    const persistPayload = { ...result, audited };

    // F3 [LOW, defense-in-depth, pre-merge re-audit finding]: reports.ts
    // runs every stored report through sanitizeStoredReport() before it's
    // written (strips unsafe helpLinks[].url / neutralizes conformance
    // finding urls anywhere in the payload — a stored-XSS guard on the
    // public /report/:id page). This insert skipped that call. It's a
    // no-op for analyzeDocument's own output today (its helpLinks/
    // conformance urls aren't attacker-shaped), but applying the same
    // sanitizer here keeps the store boundary consistently enforced.
    // Fall back to the unsanitized payload on the
    // (structurally-shouldn't-happen-for-internal-output) failure case
    // rather than newly failing an otherwise-successful audit over it.
    const sanitized = sanitizeStoredReport(persistPayload);
    const reportToStore = sanitized.ok ? sanitized.report : persistPayload;

    db.prepare(
      `INSERT INTO shared_reports (id, filename, report_json, content_hash, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
    ).run(id, filename, JSON.stringify(reportToStore), contentHash, reportExpiresAt);

    // Canonical audit-log write so audit-url-audited content also
    // counts for the remediation gate (v1.20.1+). The fleet flow
    // typically uses this endpoint; without this write, remediating
    // a fleet-audited file would fail the gate. shared_reports above
    // is the durable / shareable record; audit_log is the gate
    // metadata. Both intentionally exist.
    recordAudit({
      // Tier recorded so /status can report privileged (fleet) volume.
      privileged,
      eventType: "audit-url",
      filename,
      score: result.overallScore,
      grade: result.grade,
      contentHash,
    });

    res.json({
      filename,
      pageCount: result.pageCount ?? null,
      audited,
      strict: extractProfileScore(result),
      practical: extractProfileScore(result),
      reportId: id,
      reportUrl: buildReportUrl(id),
      reportExpiresAt,
      cached: false,
    });
  } catch (err: any) {
    // v1.88.0: record the failed audit. `url` and `privileged` are declared
    // inside the try, so read them from the request again here; the classifier
    // returns null for capacity (503), which records nothing.
    const failure = classifyAuditFailure(err);
    if (failure && typeof req.body?.url === "string") {
      recordAuditFailure({
        eventType: "audit-url",
        privileged: isPrivilegedRequest(req),
        filename: req.body.url,
        reason: failure,
      });
    }

    // Server busy (concurrency semaphore full/timeout)
    if (err?.status === 503) {
      res.status(503).json({
        error: "The server is busy processing other files.",
        details: "Please wait a moment and try again.",
      });
      return;
    }

    // DOCX auditing disabled via DOCX_ENABLED=false
    if (err?.code === "DOCX_DISABLED") {
      res.status(415).json({
        error: "Word (.docx) auditing is currently disabled.",
        details: "This server is configured to audit PDF files only.",
      });
      return;
    }

    // DOCX could not be parsed (corrupt or not a real Word package)
    if (err?.code === "DOCX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched Word document could not be read.",
        details: "The .docx file appears to be corrupt or is not a valid Word document.",
      });
      return;
    }

    // PPTX auditing disabled via PPTX_ENABLED=false
    if (err?.code === "PPTX_DISABLED") {
      res.status(415).json({
        error: "PowerPoint (.pptx) auditing is currently disabled.",
        details:
          "This server is not configured to audit PowerPoint files. Contact the administrator to enable it.",
      });
      return;
    }

    // PPTX could not be parsed (corrupt or not a real PowerPoint package)
    if (err?.code === "PPTX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched PowerPoint file could not be read.",
        details:
          "The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.",
      });
      return;
    }

    // XLSX auditing disabled via XLSX_ENABLED=false
    if (err?.code === "XLSX_DISABLED") {
      res.status(415).json({
        error: "Excel (.xlsx) auditing is currently disabled.",
        details:
          "This server is not configured to audit Excel files. Contact the administrator to enable it.",
      });
      return;
    }

    // XLSX could not be parsed (corrupt or not a real Excel workbook)
    if (err?.code === "XLSX_PARSE_FAILED") {
      res.status(422).json({
        error: "The fetched Excel file could not be read.",
        details:
          "The .xlsx file appears to be corrupt or is not a valid Excel workbook. Re-save it in Excel and upload again.",
      });
      return;
    }

    // Analysis timed out. DOCX/PPTX/XLSX analysis runs in a dedicated
    // child process with a wall-clock timeout (see ooxmlRunner.ts),
    // which rejects with { killed: true, code: 'ETIMEDOUT' }.
    // analyze-url.ts has the matching branch too (analyze-url.ts:~180).
    if (err?.code === "ETIMEDOUT" || err?.killed) {
      res.status(504).json({ ...AUDIT_TIMEOUT_MESSAGE });
      return;
    }

    // Log the detail server-side only — never echo raw err.message to
    // the client (it can leak library internals / paths). Mirrors
    // analyze-url.ts / analyze.ts.
    console.error("audit-url error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Extract the Strict-profile scalar pair from an AnalysisResult-shaped
// payload. As of v1.21.0 there is only one scoring profile; the
// /api/audit-url response surfaces it under both `strict` and `practical`
// keys for backward compatibility with existing fleet CSV consumers.
function extractProfileScore(payload: any): { score: number | null; grade: string | null } {
  const profile = payload?.scoreProfiles?.strict;
  if (profile && typeof profile.overallScore === "number") {
    return {
      score: profile.overallScore,
      grade: profile.grade ?? null,
    };
  }
  if (typeof payload?.overallScore === "number") {
    return { score: payload.overallScore, grade: payload.grade ?? null };
  }
  return { score: null, grade: null };
}

export default router;

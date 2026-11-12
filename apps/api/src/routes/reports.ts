import { Router, Request, Response, type IRouter } from "express";
import crypto from "node:crypto";
import { regradeStoredReport } from "@file-audit/analyzer";
import { reportsLimiter } from "../middleware/rateLimiter.js";
import { SHARED_REPORTS } from "#config";
import db from "../db/sqlite.js";
import { sanitizeStoredReport } from "../services/reportSanitize.js";
import { REPORT_SEAL_ERROR, verifyReportSeal } from "../services/reportSeal.js";

const router: IRouter = Router();

// POST /api/reports — save a report and return a shareable ID
router.post("/reports", reportsLimiter, (req: Request, res: Response) => {
  try {
    const { report } = req.body;

    // Type-validate the fields we later interpolate. The shared-report page
    // renders via Vue mustache (escaped) and the HTML export escapes output,
    // but constraining the stored shape here is defense-in-depth against the
    // arbitrary-JSON store being abused (e.g. a non-numeric score/grade).
    if (
      !report ||
      typeof report.filename !== "string" ||
      typeof report.overallScore !== "number" ||
      !Number.isFinite(report.overallScore)
    ) {
      res.status(400).json({ error: "Invalid report data" });
      return;
    }

    // Provenance (review 2026-11-12): only a result THIS server computed may
    // be published. Every analysis result the API returns carries an HMAC
    // `seal` over the WHOLE result (services/reportSeal.ts); a missing or
    // non-matching seal means some field — a score, a weight the regrade
    // reads, a finding, an added key another view would render — was written
    // or altered by the client. Refuse it rather than host a forged report at
    // /report/<id> for a year. Only DOCUMENT results are shareable here: page
    // audits are stored by the server itself (audit-url-page) and their seal
    // kind can never verify as a document.
    if (!verifyReportSeal(report, "document")) {
      res.status(400).json({ error: REPORT_SEAL_ERROR });
      return;
    }

    // Store-boundary hardening: strip javascript:/data: help-link URLs
    // (stored XSS on the public /report/:id page) and reject a malformed
    // categories value (would 500 the render). See reportSanitize.ts.
    const sanitized = sanitizeStoredReport(report);
    if (!sanitized.ok) {
      res.status(400).json({ error: "Invalid report data" });
      return;
    }

    // The seal has done its job; it is not part of the published report.
    if (sanitized.report && typeof sanitized.report === "object") {
      delete (sanitized.report as Record<string, unknown>).seal;
    }

    const id = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS);

    db.prepare(
      "INSERT INTO shared_reports (id, filename, report_json, expires_at) VALUES (?, ?, ?, ?)",
    ).run(id, report.filename, JSON.stringify(sanitized.report), expiresAt.toISOString());

    res.json({ id, expiresAt: expiresAt.toISOString() });
  } catch (err: any) {
    console.error("Report save error:", err);
    res.status(500).json({ error: "Failed to save report" });
  }
});

// GET /api/reports/:id — retrieve a shared report (public, no auth)
router.get("/reports/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id)) {
      res.status(400).json({ error: "Invalid report ID" });
      return;
    }

    const row = db
      .prepare("SELECT report_json, expires_at, created_at FROM shared_reports WHERE id = ?")
      .get(id) as { report_json: string; expires_at: string; created_at: string } | undefined;

    if (!row) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (new Date(row.expires_at) < new Date()) {
      res.status(410).json({ error: "This report link has expired" });
      return;
    }

    // Regraded on read, not migrated on disk. The severity grade cap is a
    // pure function of the report's own category severities, so a link shared
    // before the cap existed self-corrects here — otherwise a report shared
    // last week would read B while the same document re-audited today reads D,
    // which is the contradiction the cap was added to remove. The stored row
    // is left byte-identical: it is an agency's evidence of what was computed
    // on the day, and deriving the display value beats rewriting the record.
    const report = regradeStoredReport(JSON.parse(row.report_json));

    // No sharer identity exists to return (v1.68.0): shared_reports has no
    // email column at all. Share links are bearer-style and the payload is
    // report + timestamps only.
    res.json({
      report,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    });
  } catch (err: any) {
    console.error("Report fetch error:", err);
    res.status(500).json({ error: "Failed to load report" });
  }
});

export default router;

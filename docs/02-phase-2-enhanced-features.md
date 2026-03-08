# 02 — Phase 2: Enhanced Features

**Project:** `file-accessibility-audit`
**Phase:** 2 of 3
**Depends on:** Phase 1 complete
**Goal:** Extend the grader with DOCX support, batch upload, and shareable report URLs.

---

## Scope

Phase 2 builds on the working Phase 1 grader by adding support for Word documents, multi-file batch processing with CSV export, and the ability to share report results via a short URL backed by server-side storage.

---

## Deliverables

### 1. DOCX Support via `mammoth`

- Add `mammoth` npm package to `apps/api`
- New service: `docxService.ts` — extracts HTML representation and raw text from `.docx` files
- Analysis targets for DOCX:
  - Heading structure (H1-H6 presence and hierarchy)
  - Alt text on embedded images
  - Table structure (TH/TD usage)
  - Document title and language metadata
  - Link text quality (raw URLs vs. descriptive text)
- Update `uploadMiddleware.ts` to accept `.docx` files in addition to `.pdf`
- File type validation: check magic bytes for both PDF (`%PDF-`) and DOCX (ZIP signature `PK\x03\x04` + `[Content_Types].xml` presence)
- Scoring model: reuse the same 9-category model where applicable. Categories that don't apply to DOCX (e.g., Reading Order via StructTree, Form Accessibility) are scored as N/A and excluded from the weighted average
- Update `POST /api/analyze` response to include `fileType: "pdf" | "docx"` field
- Update frontend DropZone to accept `.docx` and display file type in ScoreCard

### 2. Batch Upload

- New UI flow: user can drop multiple files at once (or use file picker for multiple selection)
- API option: sequential processing (files processed one at a time server-side to avoid memory spikes)
- Progress UI: list of files with individual status indicators (queued -> processing -> complete/error)
- Results view: summary table showing filename, page count, grade, and overall score for each file
- **CSV export**: button to download results as CSV with columns: `filename`, `fileType`, `pageCount`, `overallScore`, `grade`, plus one column per scoring category
- Upload limit: max `BATCH.MAX_FILES` (default 10) files per batch, each file max `ANALYSIS.MAX_FILE_SIZE_MB` (default 100MB) — both from `audit.config.ts`
- Audit log: one `analyze` event per file in the batch

### 3. Shareable Reports

Replace the original client-side URL encoding approach (which hits browser URL length limits for large reports) with server-side storage.

- After analysis, a "Share" button sends the report data to `POST /api/reports`
- Server stores the report in the `shared_reports` SQLite table (schema in 00-master-design.md, Section 8)
- Server returns a short, shareable URL: `https://audit.icjia.app/report/<uuid>` (base URL from `audit.config.ts → DEPLOY.PRODUCTION_URL`)
- Shared reports expire after `SHARED_REPORTS.EXPIRY_DAYS` days (default **30**) — a cleanup job purges expired rows
- The `/report/:id` page fetches `GET /api/reports/:id` and renders a read-only report view
- **No authentication required** to view a shared report — the UUID is the access token
- Shared view includes a disclaimer: *"This report was generated on [date] and reflects the document's accessibility at that time. This link expires on [expiry date]."*
- If a shared report has expired, the page shows: *"This report has expired. Reports are available for 30 days after creation."*
- **Rate limit**: `POST /api/reports` is rate-limited per `audit.config.ts → RATE_LIMITS.reports` (default 10/user/hour) to prevent database fill attacks (see 00-master-design.md, Section 9)
- **Report UUID security**: report IDs use `crypto.randomUUID()` (122 bits of entropy). The API returns 404 for both expired and non-existent IDs to prevent enumeration.
- **Payload size limit**: the `reportData` JSON body is limited per `audit.config.ts → SHARED_REPORTS.MAX_PAYLOAD_BYTES` (default 1MB). Reports exceeding this are rejected with 413.

Build checklist:
- [ ] `shared_reports` SQLite table (schema per doc 00)
- [ ] `POST /api/reports` — stores report, returns UUID and share URL
- [ ] `GET /api/reports/:id` — returns report JSON or 404
- [ ] Expired report cleanup (on insert or daily cron)
- [ ] Share button in results UI
- [ ] `/report/:id` page — read-only report view (no auth required)
- [ ] Expiry disclaimer on shared report view
- [ ] Expired report message
- [ ] Rate limit on `POST /api/reports` (10/user/hour)
- [ ] Report IDs generated with `crypto.randomUUID()`
- [ ] Report JSON payload limited to 1MB
- [ ] `GET /api/reports/:id` returns 404 for both expired and non-existent reports (no enumeration)

---

## Testing Checklist

- [ ] DOCX upload: valid `.docx` file returns scored report
- [ ] DOCX rejection: non-DOCX file with `.docx` extension returns error
- [ ] DOCX scoring: applicable categories produce correct scores; N/A categories excluded from weighted average
- [ ] ScoreCard displays "DOCX" file type indicator
- [ ] Batch upload: 5 files processed sequentially, all return results
- [ ] Batch upload: 11th file rejected (max 10 per batch)
- [ ] Batch progress UI: each file shows queued -> processing -> complete
- [ ] Batch results: summary table renders correctly with all columns
- [ ] CSV export: downloads valid CSV with correct data
- [ ] Share button: stores report and generates short URL
- [ ] Shared report: renders read-only report without authentication
- [ ] Shared report: expired report shows expiry message
- [ ] Shared report: report data persists in SQLite for 30 days
- [ ] Shared report: cleanup job removes expired reports
- [ ] Report creation: 11th report in 1 hour returns 429
- [ ] Report ID: cannot enumerate reports by incrementing IDs
- [ ] Report payload: JSON over 1MB rejected with 413
- [ ] Expired vs non-existent report: both return identical 404 response
- [ ] Audit log: batch of 5 files produces 5 separate `analyze` events

---

## Exit Criteria

Phase 2 is complete when:

1. Users can upload and score both PDF and DOCX files
2. Users can upload up to 10 files in a single batch and view a summary table
3. Users can export batch results as CSV
4. Users can share a report via a short URL that renders without auth and expires after 30 days

---

*End of Phase 2 — v1.3*

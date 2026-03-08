# 05 — Use Cases

**Project:** `file-accessibility-audit`

---

## 1. Primary Use Case: Pre-Publication Accessibility Check

**Actor:** ICJIA staff member (content producer)
**Trigger:** Staff member has a PDF ready to publish on an ICJIA website.
**Precondition:** User has an `@illinois.gov` email address.

### Flow

1. User navigates to the File Accessibility Audit in their browser.
2. System redirects to `/login` (user is not authenticated).
3. User enters their `@illinois.gov` email address.
4. System validates the email domain and sends a 6-digit OTP.
5. User checks their inbox, enters the OTP.
6. System verifies the OTP, issues a JWT, and redirects to the main page.
7. User drags a PDF onto the drop zone (or clicks to browse).
8. System displays processing overlay with stage labels.
9. System returns a scored report: overall grade, category breakdown, and findings.
10. User reviews findings and returns to Adobe Acrobat to remediate flagged issues.
11. User re-uploads the remediated PDF to verify improvement.

### Outcome

The user has a clear, actionable signal about their PDF's accessibility status before publishing. No guesswork — the grade and findings tell them exactly what to fix.

---

## 2. Scanned Document Detection

**Actor:** ICJIA staff member
**Trigger:** User uploads a scanned PDF (image-only, no text layer).

### Flow

1. User authenticates and drops a scanned PDF.
2. System detects zero extractable text and no StructTreeRoot.
3. System assigns an automatic F on Text Extractability (20% weight).
4. System displays a warning banner: *"This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required."*
5. Remaining categories are scored as N/A or 0 where they cannot be assessed.
6. User understands that OCR must be run before any other remediation can begin.

### Outcome

The user is immediately alerted that the PDF is fundamentally inaccessible and receives specific guidance on the required first step (OCR).

---

## 3. Iterative Remediation Workflow

**Actor:** ICJIA staff member working in Adobe Acrobat
**Trigger:** User received a low grade on their first upload and is fixing issues.

### Flow

1. User uploads PDF → receives grade D (score 62).
2. Findings show: missing document title, no heading tags, images without alt text.
3. User opens PDF in Acrobat, adds document title and language metadata.
4. User re-uploads → score improves to 68 (still D). Title & Language category now passes.
5. User returns to Acrobat, adds heading tags to the structure tree.
6. User re-uploads → score improves to 76 (C). Heading Structure now passes.
7. User adds alt text to all images in Acrobat.
8. User re-uploads → score reaches 88 (B). Alt Text category now passes.
9. User is satisfied and publishes the PDF.

### Outcome

The grader functions as a tight feedback loop — upload, fix, re-upload — until the score reaches an acceptable threshold. Each iteration shows exactly which categories improved and which still need work.

---

## 4. Batch Pre-Publication Review (Phase 2)

**Actor:** ICJIA publications coordinator
**Trigger:** Multiple PDFs are queued for website publication and need accessibility review.

### Flow

1. User authenticates and selects 8 PDF files for batch upload.
2. System processes files sequentially, showing per-file progress (queued → processing → complete).
3. System displays a summary table: filename, page count, grade, and overall score for each file.
4. User exports results as CSV for tracking and reporting.
5. User identifies the 3 files with grades below C and prioritizes those for remediation.
6. Remaining 5 files with B or higher grades are cleared for publication.

### Outcome

The coordinator can triage a batch of documents efficiently, focusing remediation effort on the lowest-scoring files and clearing compliant ones without manual review.

---

## 5. Sharing a Report with a Colleague (Phase 2)

**Actor:** ICJIA staff member
**Trigger:** User wants to share their PDF's accessibility report with a colleague or manager who doesn't have an account.

### Flow

1. User uploads a PDF and receives the scored report.
2. User clicks the "Share" button.
3. System stores the report in the database and generates a short shareable URL (e.g., `https://audit.icjia.app/report/a1b2c3d4`, using the production URL from `audit.config.ts`).
4. User copies the URL and sends it via email or Slack.
5. Recipient opens the URL in their browser.
6. System renders a read-only version of the report — no authentication required.
7. Report includes a disclaimer: *"This report was generated on [date] and reflects the document's accessibility at that time. This link expires on [expiry date]."*
8. After 30 days, the shared link expires. Visitors see: *"This report has expired. Reports are available for 30 days after creation."*

### Outcome

Report sharing works without requiring the recipient to create an account. Reports are stored server-side with a 30-day expiry for auditing purposes, and short URLs avoid browser length limitations.

---

## 6. DOCX Accessibility Check (Phase 2)

**Actor:** ICJIA staff member
**Trigger:** User has a Word document they plan to export as PDF for publication.

### Flow

1. User authenticates and drops a `.docx` file on the drop zone.
2. System detects the file type (DOCX) and uses the mammoth-based extraction pipeline.
3. System scores applicable categories: heading structure, alt text on images, table markup, document title, link text quality.
4. Categories that don't apply to DOCX (e.g., Reading Order, Form Accessibility) are marked N/A and excluded from the weighted average.
5. User reviews findings and fixes issues in Word before exporting to PDF.
6. User exports the corrected Word document to PDF and re-uploads the PDF for a final check.

### Outcome

Catching accessibility issues at the Word stage prevents them from cascading into the PDF. Fixing headings, alt text, and table structure in Word is easier than fixing them in Acrobat after export.

---

## 7. Scheduled Re-Check of Published PDF (Phase 3)

**Actor:** ICJIA webmaster
**Trigger:** A PDF is published on an ICJIA website and the webmaster wants to ensure it remains accessible over time (e.g., if it gets replaced by a less accessible version).

### Flow

1. User authenticates and navigates to the scheduled checks feature.
2. User pastes the public URL of a published PDF.
3. User selects a check frequency: weekly.
4. System fetches the PDF, runs the analysis, and stores the initial score.
5. Every week, the system re-fetches the URL and re-runs the analysis.
6. If the score changes (up or down), the system sends a notification email to the user.
7. The admin dashboard shows all scheduled checks with current score, trend indicator, and next check date.

### Outcome

The webmaster has passive monitoring of published PDFs. If a document is replaced with a less accessible version, they are notified automatically without needing to manually re-check.

---

## 8. Admin Usage Review (Phase 3)

**Actor:** ICJIA accessibility coordinator or IT administrator
**Trigger:** Administrator wants to understand tool adoption and common accessibility failures across the agency.

### Flow

1. Admin authenticates (email in the `ADMIN_EMAILS` allowlist).
2. Admin navigates to `/admin`.
3. Dashboard shows: total analyses (all time, 30 days, 7 days), unique users, average score, grade distribution chart, and most common failure categories.
4. Admin filters the log viewer by date range to see activity for the current month.
5. Admin identifies that "Alt Text on Images" is the most frequently failing category.
6. Admin uses this data to plan a targeted training session on adding alt text in Acrobat.

### Outcome

The admin has data-driven insight into which accessibility issues are most prevalent, enabling targeted training and resource allocation.

---

## 9. Reviewing Personal Analysis History

**Actor:** ICJIA staff member
**Trigger:** User wants to review past analyses they've run, check previous scores, or find a document they analyzed last week.

### Flow

1. User authenticates and navigates to "My History" from the main navigation.
2. System displays a paginated list of the user's own past analyses: filename, score, grade, and date.
3. User can see at a glance which documents scored well and which need remediation.
4. User identifies a document they analyzed last Tuesday, notes the score was a D, and decides to re-upload the remediated version for a new check.

### Outcome

Users have visibility into their own usage and can track remediation progress over time without needing admin access. Only the user's own events are visible — they cannot see other users' analyses.

---

*End of Use Cases — v1.2*

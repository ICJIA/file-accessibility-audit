# 03 — Phase 3: Admin & Monitoring

**Project:** `file-accessibility-audit`
**Phase:** 3 of 4
**Depends on:** Phase 2 complete
**Goal:** Add an admin dashboard with usage analytics, richer log viewing, and scheduled re-checks of published PDFs.

---

## Scope

Phase 3 focuses on operational visibility and proactive monitoring. It extends the basic `/history` page from Phase 1 into a full admin dashboard with usage statistics and adds the ability to schedule recurring accessibility checks on published PDF URLs.

---

## Deliverables

### 1. Admin Dashboard

- Redesigned `/history` route as a full admin section (`/admin`)
- **Usage statistics panel:**
  - Total analyses run (all time, last 30 days, last 7 days)
  - Unique users (by email)
  - Average score and grade distribution (pie/bar chart)
  - Most common failure categories (ranked list)
  - File type breakdown (PDF vs. DOCX)
- **Enhanced log viewer:**
  - Sortable, filterable table of audit log entries
  - Filters: email, event type, date range, filename search
  - Pagination with configurable page size
- **Access control:** admin endpoints restricted to a configurable allowlist of emails in `.env` (e.g., `ADMIN_EMAILS=chris@icjia.illinois.gov,admin@icjia.illinois.gov`)

### 2. Scheduled Re-Check

- New feature: user pastes a public URL pointing to a published PDF
- System fetches the PDF, runs the standard analysis pipeline, and stores the result
- **Schedule options:** one-time check, weekly, or monthly
- **Storage:** new SQLite table `scheduled_checks` with columns: `id`, `url`, `email` (owner), `frequency`, `status TEXT DEFAULT 'active'` (values: `active` | `inactive`), `consecutive_failures INTEGER DEFAULT 0`, `last_checked_at`, `last_score`, `last_grade`, `created_at`
- **Execution:** cron job or PM2-scheduled script runs at configured interval, fetches URLs due for re-check, runs analysis, updates results
- **Notification:** optional email sent to the owner when a score changes (improves or degrades)
- **Dashboard integration:** scheduled checks appear in the admin panel with URL, current score, trend (up/down/stable), and next check date
- **Limits:** max `SCHEDULED_CHECKS.MAX_ACTIVE` (default 50) active scheduled checks per instance; URL must return `Content-Type: application/pdf`. All limits from `audit.config.ts`
- **SSRF mitigation:** URL fetching must follow the security controls in 00-master-design.md, Section 9 (URL Fetch Security). Only `https://` URLs allowed. Private/reserved IPs blocked after DNS resolution. Response size and timeout enforced.
- **URL failure handling:** if a scheduled URL returns 404 or 410 for `SCHEDULED_CHECKS.FAILURE_THRESHOLD` (default 3) consecutive checks, the check is marked `inactive` and the owner is notified. The owner can reactivate with an updated URL.
- **Non-PDF response:** if the fetched URL returns a non-`application/pdf` Content-Type, the check fails for that run and the owner is notified. The check remains active (the URL might temporarily serve an error page).

---

## Testing Checklist

- [ ] Admin panel: accessible only to emails in `ADMIN_EMAILS` allowlist
- [ ] Admin panel: non-admin users see 403 or are redirected
- [ ] Usage stats: totals, averages, and distributions are accurate
- [ ] Failure category ranking: matches actual analysis data
- [ ] Log viewer: filters by email, event type, date range, filename
- [ ] Log viewer: pagination works with configurable page size
- [ ] Scheduled check: valid PDF URL accepted and analyzed
- [ ] Scheduled check: non-PDF URL rejected
- [ ] Scheduled check: weekly schedule fires on time (test with short interval)
- [ ] Scheduled check: notification email sent when score changes
- [ ] Scheduled check: max 50 active checks enforced
- [ ] Scheduled check: rejects `http://` URLs (requires `https://`)
- [ ] Scheduled check: rejects URLs resolving to private IPs (SSRF protection)
- [ ] Scheduled check: marks check inactive after 3 consecutive failures
- [ ] Scheduled check: owner notified when check marked inactive
- [ ] Scheduled check: non-PDF Content-Type response handled gracefully
- [ ] Admin dashboard: scheduled checks display with correct score and trend

---

## Exit Criteria

Phase 3 is complete when:

1. Admin users can access a dashboard with usage statistics and failure category rankings
2. The log viewer supports filtering, sorting, and pagination
3. Users can register a URL for scheduled re-checking (one-time, weekly, monthly)
4. Score change notifications are sent via email
5. Admin panel displays all scheduled checks with current status and trends

---

*End of Phase 3 — v1.1*

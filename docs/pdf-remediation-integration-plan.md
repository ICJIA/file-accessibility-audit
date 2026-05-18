# PDF Auto-Remediation — Integration Plan

## Context

The `file-accessibility-audit` tool currently audits PDFs (qpdf + pdfjs-dist),
scores them on 9 WCAG categories, and exports findings as Word reports. It does
**not** modify files. The user has confirmed that adding a "Remediate" button
post-audit is a strategic priority — especially for non-technical staff who find
manual remediation intimidating.

A two-pass spike (`docs/spike-remediation-results.md`, 12 representative PDFs)
established:

- **Basic OpenDataLoader** (Apache-2.0 npm package `@opendataloader/pdf@2.4.3`,
  ICJIA fork at `github.com/ICJIA/opendataloader-pdf`) plus a
  `qpdf --object-streams=disable` preprocessing step reliably auto-tags PDFs:
  avg +25 score on untagged inputs, 0 damaged outputs, ~0.4–2s wall time on
  typical reports (37s on a 246-page outlier).
- **Hybrid mode** (docling-fast) shows no aggregate gain over basic on the
  sample and runs 5–15× slower. Deferred to a roadmap "Deep Analysis" tier.
- **SmolVLM** (Tier 3 AI alt text) cannot share the production droplet —
  steady-state GPU/memory cost is prohibitive. Roadmap path is a hosted vision
  API (Claude vision / GPT-4o) instead of self-hosted SmolVLM.

This plan delivers **v1 only**: basic ODL with qpdf pre-/post-validation,
async single-file remediation, simple progress UI, honest fallback. Tier 2
hybrid and Tier 3 alt text are roadmap items, not v1.

## Framing principles (from earlier conversation)

- **Assist, don't replace, manual review.** Every remediated download surfaces
  "manual review still recommended" plainly. Avoids the "this PDF is now
  WCAG-compliant" trap every commercial vendor has been burned on.
- **Audit pipeline performance is sacred.** Remediation runs on a separate
  code path; no shared concurrency budget with the synchronous audit.
- **One-button UX for non-technical users.** No "basic vs hybrid" toggle in v1.
- **Privacy-first retention.** PDFs are never persisted longer than the
  pipeline strictly requires. No between-stage caches. Output deleted on
  first download or after a short timeout. See dedicated section below.

## Architecture

Three-step server pipeline:

```
audited PDF  ──►  qpdf --object-streams=disable  ──►  ODL tagged-pdf  ──►  validate
                  (normalize)                         (auto-tag)            (qpdf --check + re-audit)
                                                                            ├─ pass → serve + score delta
                                                                            └─ fail → discard + "try Acrobat"
```

Async job flow:

```
POST /api/remediate (multipart PDF upload)
                                  ─►  buffer streamed to job scratch dir
                                  ─►  creates remediation_jobs row, status=pending
                                  ─►  spawns detached `tsx src/jobs/remediate.ts <jobId>`
                                  ◄─  returns { jobId, downloadToken }

GET /api/remediate/:jobId/status  ─►  reads remediation_jobs row + recent events
                                  ◄─  { status, step, progressPct, scoreBefore, scoreAfter }

GET /api/remediate/:jobId/download?token=...
                                  ─►  validates one-time downloadToken
                                  ─►  streams output PDF
                                  ─►  deletes output on stream 'close' + verifies fs.stat ENOENT
                                  ─►  appends 'downloaded', 'output_deleted', 'verified_absent' events

GET /api/remediate/:jobId/receipt ─►  array of lifecycle events for the receipt panel
```

The detached worker process means the API stays fast — exactly the
"audit performance is sacred" constraint. PM2 keeps managing only
`file-audit-api` and `file-audit-web`; the worker is a per-request fork.

## UX flow (end-to-end)

**1. Audit results page** (`apps/web/app/pages/index.vue` and
`apps/web/app/pages/report/[id].vue`): add a `<RemediateButton>` component
near the existing "Download Report" / "Share report" actions.

- Show when `inputScore < 90` and the input is a valid PDF
- Suppress (or grey-out with note) when input is already A-grade
- Microcopy under button: *"Most issues fixed automatically.
  Manual review still recommended."*
- Optional inline notice if `inputTagged === true`:
  *"Your PDF already has some accessibility tags. Results may vary."*

**2. Progress page** (`apps/web/app/pages/remediate/[jobId].vue`):

- 4 visible steps in plain English: "Preparing file → Adding structure tags →
  Validating result → Comparing scores"
- Spinner on the current step, checkmarks on past steps
- Estimated time derived from page count: `max(15s, pages * 0.5s)`
- "You can leave this page; we'll email you when done" copy when user is
  logged in (Mailgun is already wired up via `apps/api/src/mailer.ts`)
- Frontend polls `GET /api/remediate/:jobId/status` every 2 s

**3. Result page** (same route, completed state):

- Big score comparison: `49 (F) → 90 (A)`
- Primary button: `⬇ Download Remediated PDF`
- Unmissable advisory: `⚠ Manual review still recommended`
- Bullet list of issues the re-audit still flagged
- Secondary: `View full comparison report` (existing Word export, post-fix)
- **Processing receipt panel** (see Lifecycle audit trail section):
  timestamped lifecycle, receipt ID, "deletion verified" line, and
  options to download or email the receipt. Visible by default, not
  collapsed — the agency wants this front and center.

**4. Fallback** (when post-flight validation rejects the output):

- Headline: *"Auto-remediation didn't help this time"*
- Honest explanation (input already tagged / complex layout / scanned)
- Concrete next step: *"Open in Adobe Acrobat Pro → Accessibility → Autotag,
  then run the Accessibility Checker"*
- `Download original (unchanged)` button so the user still gets a file

## API endpoints

All under `apps/api/src/routes/remediate.ts` (new):

| Method | Path                                  | Notes                                                     |
|--------|---------------------------------------|-----------------------------------------------------------|
| POST   | `/api/remediate`                      | Body is the uploaded file (multipart). Creates job, returns `{ jobId, downloadToken }`. No `auditId` — privacy posture requires re-upload. |
| GET    | `/api/remediate/:jobId/status`        | Polled by UI. Returns `{ status, step, progress, scores }`. |
| GET    | `/api/remediate/:jobId/download?token=...` | Streams output PDF. Single-use download token validated. File deleted after stream `'close'`. |
| GET    | `/api/remediate/:jobId/comparison`    | Word-format before/after comparison (reuses existing docx generator). |
| GET    | `/api/remediate/:jobId/receipt`       | JSON receipt — array of lifecycle events for the UI panel. |
| GET    | `/api/remediate/:jobId/receipt.pdf`   | Server-rendered PDF receipt suitable for records retention. |
| POST   | `/api/remediate/:jobId/receipt/email` | Emails the receipt to the user's address. No body. |
| GET    | `/api/me/remediations`                | Logged-in user's own remediation history (paginated). Returns metadata only — no PDFs. |
| GET    | `/api/admin/remediations`             | Admin-only. Filters: `email`, `from`, `to`, `status`. Returns full event timelines. |
| GET    | `/api/admin/remediations.csv`         | Admin-only. Same data as `/api/admin/remediations` but CSV for printing/emailing. |

Mount in `apps/api/src/index.ts` alongside existing route imports.

## Database

Add one new table to `apps/api/src/db/sqlite.ts` (schemas are inline; no
migrations system to integrate with):

```sql
CREATE TABLE IF NOT EXISTS remediation_jobs (
  id TEXT PRIMARY KEY,
  audit_id TEXT,
  email TEXT,                  -- optional, if user is logged in
  input_filename TEXT,
  status TEXT NOT NULL,        -- 'pending'|'running'|'complete'|'failed'
  step TEXT,                   -- 'preparing'|'tagging'|'validating'|'comparing'|null
  progress_pct INTEGER DEFAULT 0,
  input_score REAL,
  output_score REAL,
  output_valid INTEGER,        -- 1 = passed qpdf --check, 0 = damaged
  output_path TEXT,            -- absolute path on disk, only when complete
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER NOT NULL  -- 7 days after completion; file deleted on cleanup
);

CREATE INDEX IF NOT EXISTS idx_remediation_jobs_email_created
  ON remediation_jobs(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remediation_jobs_expires
  ON remediation_jobs(expires_at);
```

A second append-only table `remediation_events` captures the lifecycle
audit trail — see the **Lifecycle audit trail** section below for the
schema and event-type list.

## Privacy and retention (data minimization)

PDFs may contain sensitive content (case files, draft reports, personnel
information). The remediation feature must not weaken the privacy posture
of the audit tool, which today **never writes PDFs to disk** (multer uses
in-memory storage, buffer is discarded after the response).

**Rules:**

1. **No between-stage cache between audit and remediation.** Clicking
   "Remediate" prompts a re-upload. The just-audited PDF is NOT cached
   on disk waiting for the user to decide. This is the single biggest
   privacy gain over my original draft. UX cost: one extra upload click;
   privacy cost of caching: too high to accept by default.

2. **PDFs are on disk only during active job execution.** The worker
   writes the input to a job-scoped directory at the *start* of the
   pipeline and deletes it at the *end* (success or failure), wrapped
   in a `finally` block so a crash still cleans up.

3. **Intermediate files are deleted between pipeline stages.** Once
   `qpdf --object-streams=disable` has produced `normalized.pdf`, the
   uploaded input is deleted. Once ODL has produced the tagged output,
   the normalized intermediate is deleted. At any moment, at most one
   copy of the PDF exists on disk per job.

4. **Output retention: 30 minutes maximum, deleted on first download.**
   The remediated PDF lives at `apps/api/data/remediation/<jobId>.pdf`
   only long enough for the user to receive it:
   - On successful `GET /api/remediate/:jobId/download`: file is deleted
     *after* the response stream completes (in the response `'close'`
     event handler). Second download attempt returns `410 Gone`.
   - If not downloaded within 30 minutes: cleanup deletes the file and
     marks the DB row `status='expired'`.
   - No "redownload" feature — by design, to avoid pressure to extend
     retention.

5. **DB row retention: 30 days, content-free.** The `remediation_jobs`
   row outlives the file for analytics/debugging, but it never contains
   PDF content — only metadata (filename, page count, scores, status,
   timestamps). After 30 days, the row is purged.

6. **Restrictive filesystem permissions.** `apps/api/data/remediation/`
   created with mode `0700`; PDFs written with mode `0600`. The Node
   process should be the only reader.

7. **No PDF content in logs.** Filenames are logged once (audit purposes)
   but PDF content, extracted text, error stack traces that include
   PDF bytes are stripped. The mailer's "remediation complete" email
   uses the filename but does NOT attach the PDF — the user authenticates
   to download.

8. **Cleanup on crash.** A startup sweep in `apps/api/src/index.ts`
   reconciles disk vs DB on every API restart:
   - DB rows with `status='running'` and `created_at` older than 10
     minutes are marked `failed` (stuck/crashed).
   - Files in `data/remediation/` whose `jobId` has no matching
     `complete`/`failed` row are deleted (orphans from worker crashes).
   - Files past `expires_at` are deleted regardless of DB state.

**On-disk locations** (both gitignored):

- `apps/api/data/remediation/<jobId>.pdf` — final output, 30-min TTL
- `apps/api/data/remediation/<jobId>/work/` — worker scratch dir during
  active job; entirely removed when job finishes

**Retention summary**:

| What | How long | Where |
|------|----------|-------|
| Uploaded PDF (audit) | 0 (memory only) | – |
| Uploaded PDF (remediate, during job) | seconds | scratch dir, deleted between stages |
| Intermediate normalized PDF | seconds | scratch dir, deleted after ODL |
| Tagged-pdf output | until first download or 30 min | `data/remediation/` |
| `remediation_jobs` row | 30 days | sqlite, content-free |

## Job runner

New file: `apps/api/src/jobs/remediate.ts` — runnable as
`tsx src/jobs/remediate.ts <jobId>`. The API spawns it detached and
unref'd; the worker writes its own progress to the DB row.

Pseudo-code:

```ts
async function run(jobId: string) {
  updateJob(jobId, { status: 'running', step: 'preparing', progressPct: 10 });
  const job = loadJob(jobId);
  const inputPath = audit-temp/${job.audit_id}.pdf;

  // 1. qpdf normalize
  const normalized = tmpFile('normalized.pdf');
  await runQpdf(['--object-streams=disable', inputPath, normalized]);

  updateJob(jobId, { step: 'tagging', progressPct: 35 });

  // 2. ODL convert
  const outDir = tmpDir();
  await convert(normalized, { outputDir: outDir, format: 'tagged-pdf', quiet: true });
  const tagged = findFirstPdf(outDir);

  updateJob(jobId, { step: 'validating', progressPct: 70 });

  // 3. Validate
  const valid = qpdfCheckPasses(tagged);
  if (!valid) return rejectJob(jobId, 'output PDF failed qpdf --check');

  // 4. Re-audit
  updateJob(jobId, { step: 'comparing', progressPct: 90 });
  const before = await analyzePDF(readFile(inputPath), job.input_filename);
  const after = await analyzePDF(readFile(tagged), job.input_filename);
  if (after.overallScore < before.overallScore) {
    return rejectJob(jobId, `score regressed: ${before.overallScore} → ${after.overallScore}`);
  }

  // 5. Move output, finalize
  const finalPath = `apps/api/data/remediation/${jobId}.pdf`;
  rename(tagged, finalPath);
  finalizeJob(jobId, { status: 'complete', output_path: finalPath, input_score: before.overallScore, output_score: after.overallScore });

  // 6. Email if user is logged in
  if (job.email) sendCompletionEmail(job);
}
```

The worker imports the existing `analyzePDF` and `convert` directly — no
HTTP round-trip, no shared concurrency budget with the API.

The Java environment is set in-process before invoking ODL:

```ts
process.env.JAVA_HOME = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@17'; // macOS
// on Ubuntu the JRE is on PATH by default after `apt install openjdk-17-jre-headless`
```

## Frontend changes

New files under `apps/web/app/`:

- `components/RemediateButton.vue` — primary button + microcopy + tagged-input
  notice. Posts to `/api/remediate`, navigates to progress page.
- `pages/remediate/[jobId].vue` — single page that handles all three states
  (running, complete, failed) based on polled status.
- `composables/useRemediationJob.ts` — small wrapper around the polling
  endpoint, returns reactive `{ status, step, progressPct, ... }`.

Edits:

- `pages/index.vue` — render `<RemediateButton :audit-id="..." :input-score="..." />`
  alongside existing post-audit actions when an analysis result is in state.
- `pages/report/[id].vue` — same component on the shared-report page so users
  who land on a share link can also kick off remediation (if their token allows).

Copy lives in component templates; no i18n in v1 (existing pages are
English-only).

## DigitalOcean deployment

The production box is Ubuntu 22.04 on DigitalOcean, managed via Laravel
Forge, two PM2 apps (`file-audit-api` on 5103, `file-audit-web` on 5102,
each capped at 512 MB), with Nginx as reverse proxy. `rebuild.sh` is the
deploy script.

### One-time server bootstrap

Install OpenJDK 17 on the droplet (one command, persists across deploys):

```bash
sudo apt update
sudo apt install -y openjdk-17-jre-headless
java -version   # confirm: openjdk 17.x
```

No symlink dance needed on Ubuntu; the apt package puts `java` on PATH at
`/usr/bin/java`.

### PM2 ecosystem

**No changes to `ecosystem.config.cjs`.** The Java + qpdf invocations are
short-lived children of the API process; PM2 doesn't manage them. The 512 MB
memory cap on `file-audit-api` still works because the remediation worker
is a separate detached process — its memory isn't counted against the API's
cap. (Worth bumping to 768–1024 MB if the API itself starts pressing the
cap with the cleanup interval added; monitor first.)

### Nginx

The default Forge Nginx config proxies to the API at port 5103. Two notes:

1. **Status endpoint**: polled every 2 s. Default `proxy_read_timeout 60s`
   is fine; the status endpoint returns in <100 ms.
2. **Download endpoint**: serves PDFs up to ~30 MB (Juvenile-sized).
   `client_max_body_size` already handles upload size; no change for download.

No nginx changes required for v1. If we add SSE for progress later, then
`proxy_buffering off` for that location block.

### File storage on the droplet

`apps/api/data/audit-temp/` and `apps/api/data/remediation/` will be
created by the API on startup. Storage budget at typical volume
(say 100 remediations/day, avg 2 MB output, 7-day TTL) ≈ 1.4 GB.
The droplet has more than that on /var/. If droplet disk gets tight,
shorten `expires_at` to 3 days or 1 day.

### Preflight script extension

Append to the existing dependency check section in `rebuild.sh`:

```bash
# Java runtime for OpenDataLoader (PDF remediation)
if ! command -v java &> /dev/null; then
  echo "ERROR: java not found. Install OpenJDK 17:"
  echo "  sudo apt install -y openjdk-17-jre-headless"
  exit 1
fi
JAVA_VERSION=$(java -version 2>&1 | head -1 | grep -oE '"[0-9]+' | tr -d '"')
if [ "${JAVA_VERSION:-0}" -lt 11 ]; then
  echo "ERROR: java $JAVA_VERSION found; need 11 or newer. Run:"
  echo "  sudo apt install -y openjdk-17-jre-headless"
  exit 1
fi

# Confirm qpdf supports --object-streams (already required, but verify)
if ! qpdf --help 2>&1 | grep -q "object-streams"; then
  echo "WARNING: this qpdf does not support --object-streams; remediation"
  echo "  will skip the preprocessing step on tagged-input PDFs."
fi

echo "✓ All remediation dependencies present (java + qpdf)."
```

The existing `qpdf` and `pnpm` checks stay as-is. The script is idempotent
and safe to re-run on every deploy.

## Lifecycle audit trail and deletion verification

For agency compliance and auditor reporting, every remediation produces a
**verifiable, timestamped record** of the PDF's journey from upload through
deletion. This is non-optional: every job emits a receipt, even on failure.

### What we're being honest about

The PDF *does* leave the agency's local computer — it travels over TLS to
`audit.icjia.app`, processed on the DigitalOcean droplet (ICJIA-controlled,
single-tenant), and is deleted at the end. In v1 the droplet itself does
all the work; nothing is forwarded to any third party (no Adobe API, no
hosted Claude/OpenAI). When/if Tier 3 (AI alt text) ships, *that* call to
a hosted vision API will get its own explicit receipt entry — but it isn't
part of v1.

The UI and the receipt both state this plainly so the agency knows exactly
where their bytes went.

### Lifecycle events tracked per job

A new `remediation_events` table records each lifecycle event as an
append-only row. The table is the single source of truth for the receipt:

```sql
CREATE TABLE IF NOT EXISTS remediation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event TEXT NOT NULL,        -- see event list below
  occurred_at INTEGER NOT NULL,
  details TEXT,               -- JSON, content-free metadata only
  FOREIGN KEY (job_id) REFERENCES remediation_jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_remediation_events_job ON remediation_events(job_id, occurred_at);
```

**Event types** (immutable, append-only):

| Event | Logged when | Details JSON |
|-------|-------------|--------------|
| `received` | Upload received by API | filename, size_bytes, page_count |
| `processing_started` | Worker began pipeline | (none) |
| `normalize_complete` | qpdf preprocessing done | duration_ms |
| `input_deleted` | Original input removed from disk | path_hash (sha256 of path string, not content) |
| `tagging_complete` | ODL produced output | duration_ms |
| `intermediate_deleted` | Normalized PDF removed | path_hash |
| `validation_passed` (or `validation_failed`) | qpdf --check + re-audit done | input_score, output_score, valid |
| `output_ready` | Output staged for download | output_size_bytes, ttl_seconds |
| `downloaded` | User retrieved the file | client_ip_hash, bytes_sent |
| `output_deleted` | Output file removed from disk | trigger ("download" / "ttl_expired" / "manual") |
| `verified_absent` | Post-deletion `fs.stat` confirmed file is gone | path_hash, errno (ENOENT expected) |
| `error` | Anything went wrong | error_type, message (no PDF content) |

`verified_absent` is the auditor-critical row: it proves the file is gone,
not just "delete was attempted." The worker calls `fs.stat()` after every
deletion; ENOENT = gone, anything else = problem (logged + retried).

### What the user sees (receipt panel)

On the result page (success or failure), below the download/fallback area:

```
┌─────────────────────────────────────────────────────────┐
│  Processing receipt                                      │
│  Receipt ID: r-7a8f4c2e                                  │
│                                                          │
│  ✓ 14:42:18  Your PDF uploaded (audit.icjia.app)        │
│  ✓ 14:42:18  Processing started                         │
│  ✓ 14:42:19  Original file deleted from server          │
│  ✓ 14:42:20  Remediation completed (1.4 s)              │
│  ✓ 14:42:20  Intermediate files deleted from server     │
│  ✓ 14:46:12  You downloaded the remediated PDF          │
│  ✓ 14:46:12  Remediated file deleted from server        │
│  ✓ 14:46:12  Deletion verified (file no longer exists)  │
│                                                          │
│  Total time PDF was on our server: 3 minutes 54 seconds │
│  No copies were sent to any third party.                 │
│                                                          │
│  [Download receipt as PDF]    [Email receipt]            │
└─────────────────────────────────────────────────────────┘
```

This is the **auditor's evidence**: every event has a server-side timestamp,
the receipt ID indexes into `remediation_events`, and the "Deletion verified"
line is the post-delete `fs.stat` result.

The receipt is downloadable as a PDF (rendered server-side with our existing
docx/PDF stack adapted) and emailable. The emailed receipt is what an agency
records-retention officer would archive — it stands on its own without our
DB.

### Querying the audit trail (the "auditor asks" path)

The `remediation_events` table is the queryable source of truth. Three
access paths support "an auditor asks" or "an employee asks":

**1. Per-user self-service.** A logged-in user can view their own history
at `apps/web/app/pages/account/remediations.vue` — a paginated list of
their remediation jobs with status, scores, timestamps, and a "View
receipt" link per row. Powered by `GET /api/me/remediations` which joins
`remediation_jobs` + `remediation_events` filtered to the authenticated
email. No PDFs are returned (they're long gone) — only the records.

**2. Admin lookup.** An admin can search by email, filename pattern, or
date range:
- `GET /api/admin/remediations?email=foo@agency.gov&from=2026-01-01&to=2026-04-30` →
  JSON list with full event timelines per job
- `GET /api/admin/remediations.csv?...` → same data as CSV for emailing
  to an auditor or printing
- Admin-gated via the existing role check (`AUTH.ADMIN_EMAILS` in
  `audit.config.ts`)
- Lives in a new route file `apps/api/src/routes/admin-remediations.ts`

**3. Offline compliance report script.** For larger audits or
table-level queries beyond the UI's reach:
- `apps/api/src/scripts/compliance-report.ts --from 2026-01-01 --to 2026-04-30 [--email foo@agency.gov]`
- Outputs CSV to stdout (redirect to a file)
- Runs read-only against the same SQLite DB
- Includes "sentinel" checks: rows where retention exceeded the
  configured TTL, jobs missing `verified_absent` events, jobs that
  errored

**Canned queries the script answers**:

- *"How many remediations happened last quarter?"*
  `COUNT(*) FROM remediation_jobs WHERE created_at BETWEEN ?1 AND ?2`
- *"For each remediation, when did the PDF leave our server?"*
  `SELECT job_id, MAX(occurred_at) FROM remediation_events WHERE event IN ('output_deleted','verified_absent') GROUP BY job_id`
- *"Show me every job whose PDF was on disk longer than 30 minutes."*
  joins on `received` and `verified_absent` events, filter by duration
- *"Confirm: no job ever exceeded 30-minute retention."*
  sentinel query that should return 0 rows; non-empty result is a
  compliance flag
- *"What did user X remediate during the dispute window?"*
  `... WHERE email = ? AND created_at BETWEEN ? AND ?`
- *"Were any files retained after a worker crash?"*
  rows missing `verified_absent` after a `failed` status — startup
  sweep should make this return 0

This means: **when an auditor or employee asks, you don't need to dig
through logs or replay events** — there's a structured DB record that
already answers the question, accessible via UI, API, or CLI.

### Retention of the audit trail itself

The `remediation_events` rows are kept **as long as the agency needs them**
for compliance. Default in `audit.config.ts`: 7 years (matches typical
state-agency records retention). The rows contain no PDF content — only
lifecycle metadata — so retention is cheap and safe.

The `remediation_jobs` row's TTL (30 days) is *separate* from the event
log's TTL: even after the job row is purged, the events remain. This keeps
the long-term auditor record intact while keeping the operational table
small.

## Security (threat model)

Red-team / blue-team table. Each row is a real attack vector against
this specific feature on this specific stack (Express + SQLite + a
shell-out to a Java JAR + qpdf binary on a single DigitalOcean droplet
behind Nginx). Mitigations reference the concrete file/line where the
defense lives — or where it needs to be added.

| # | Attack vector (red team) | Defense (blue team) |
|---|---------------------------|----------------------|
| 1 | **Malicious PDF triggers RCE in ODL/qpdf/pdfjs** via crafted object streams, embedded JavaScript, or font parser exploits. | Magic-byte verification on upload (already in `apps/api/src/routes/analyze.ts` — extend to `/api/remediate`). Run the JVM with `-Djava.net.useSystemProxies=false -Dnetworkaddress.cache.ttl=0` and a process-level firewall blocking outbound from the worker. ODL is invoked with `quiet: true` and no `--hybrid` flag, so no remote calls. Consider running the worker under a dedicated unprivileged `audit-worker` user (Forge supports this) so an RCE has nothing else on the box to compromise. |
| 2 | **Decompression bomb / page bomb.** PDF that's small on disk but expands to gigabytes when ODL processes it (recursive object streams, deeply nested structures). | Pre-pipeline size + page-count gate: reject inputs over a configured threshold (suggest 50 MB file size, 500 pages). The 246-page Juvenile fixture is fine; pathological inputs aren't. Add a hard JVM heap cap via `JAVA_TOOL_OPTIONS=-Xmx768m` so a runaway can't OOM the droplet. Wall-clock timeout on the worker child (e.g., 5 min); kill on overrun. |
| 3 | **Resource exhaustion via concurrent jobs.** Attacker scripts dozens of remediation requests in parallel to fill disk and pin CPU. | Per-user concurrent-job limit (1 in v1, configurable). Reuse the existing rate limiter (`apps/api/src/middleware/rateLimiter.ts`) on `POST /api/remediate`. Refuse new jobs when `df` on `apps/api/data/` shows <2 GB free (or >85% utilization) — the API returns 503 and the UI shows "Remediation temporarily unavailable, try again later." |
| 4 | **Job-ID guessing / IDOR.** Attacker iterates `/api/remediate/<id>/download` hoping to grab someone else's remediated PDF. | UUIDv4 jobIds (122 bits of unguessable entropy). The download endpoint checks the job row's `email` against the authenticated session/token — request fails 403 if they don't match. Anonymous (no-login) jobs use a one-time download token issued with the `jobId` at creation, stored hashed in the DB; download URL is `?token=<one-time>`, single-use, invalidated on success. |
| 5 | **Path traversal via filename.** Upload filename `../../etc/shadow.pdf` or similar tries to escape the storage directory. | All on-disk paths are constructed from validated UUIDs, never from user-provided filenames. The original filename is stored in the DB row only for display, sanitized (`replace(/[^\w\s.-]/g, "_")`) before any rendering. `path.resolve()` after construction verifies the resulting path stays under `apps/api/data/remediation/`. |
| 6 | **Information disclosure via error messages.** A crash exposes server paths, PDF excerpts, or qpdf stderr in the user-facing error. | Generic user-facing errors (`{ error: "Could not remediate this file" }`); full details only in server logs. The mailer template includes filename + job ID but NEVER PDF text. Disable Express's default error stack traces in production (`app.set('env', 'production')`). |
| 7 | **Storage DoS via incomplete downloads.** User starts many jobs, never downloads, watches the disk fill. | 30-min output TTL with hard cleanup. Per-user concurrent-job limit (1) means an attacker has to wait between attempts. Cleanup runs every 5 minutes and on every API startup. Disk usage check before accepting new jobs (see #3). |
| 8 | **SSRF via PDF content.** Crafted PDF references external URLs (annotations, embedded fonts) and tricks ODL or pdfjs into fetching them. | ODL basic mode does not perform external fetches (no `--hybrid`, no font URL resolution by default). JVM started with `-Djava.net.useSystemProxies=false`. If a future ODL release adds fetch behavior, we add an `--no-network` analog or run the worker inside an outbound-blocked egress group. For pdfjs, the existing audit pipeline already does not load external resources (see `apps/api/src/services/pdfjsService.ts`); the remediation worker uses the same pattern. |
| 9 | **Cross-user data leak via incomplete cleanup.** Worker crashes mid-job; the input PDF or intermediate stays on disk past job lifetime. | All file writes wrapped in `try / finally`. Worker's scratch dir is namespaced by `jobId` and recursively removed in `finally`. Startup sweep in `apps/api/src/index.ts` reconciles disk vs DB — orphan files (no matching `complete`/`failed` row) are deleted; jobs stuck in `running` >10 min are marked `failed`. |
| 10 | **Replay attack on download URL.** User shares the download URL; attacker grabs the file after the user is done. | Single-use: file is deleted after first successful download (in the response `'close'` handler). Subsequent requests return 410 Gone. For users sharing links intentionally: the existing `shared_reports` feature handles that case — the remediated PDF is not a shareable artifact. |
| 11 | **Forged completion email triggering download.** Phishing email pretending to be a remediation-complete notification, linking to attacker-controlled domain. | Mailgun completion email uses the canonical `https://audit.icjia.app/remediate/<jobId>` path; the recipient still has to authenticate. The email contains the filename + job ID + the canonical URL but NEVER an embedded download token in the URL (that would be a single-click theft vector if email is intercepted). Use DMARC/SPF/DKIM on the sender domain (Mailgun handles this). |
| 12 | **Logs and DB backups leak PDF content.** Server logs or DB backups inadvertently expose PDF text. | The audit pipeline already operates on byte buffers and produces structured metadata only; the remediation pipeline maintains that pattern. The `remediation_jobs` row contains scores, statuses, paths, timestamps — no extracted text. Logging library is configured to exclude `req.body` and `req.file` content. Backups are unchanged from audit-tool baseline; PDFs are never in the DB. |
| 13 | **Symlink attack against output dir.** Attacker pre-creates a symlink at the expected output path; ODL writes through it to an arbitrary location. | The worker creates the scratch and output directories explicitly with `fs.mkdir({ recursive: true, mode: 0o700 })` and checks `fs.lstat` returns a directory (not a symlink) before writing. Production directory is owned by the audit-worker user; permissions prevent other users from pre-creating entries. |
| 14 | **Privilege escalation via Java vulnerabilities.** Future OpenJDK CVE allows JVM escape. | Pin major version (`openjdk-17-jre-headless`). Subscribe to ubuntu-security-announce. The preflight check in `rebuild.sh` reports the running Java version; an out-of-date version (>180 days since last apt update) emits a deploy warning. JVM ran as the audit-worker user, not root. |
| 15 | **DoS via giant upload size.** Multi-gigabyte PDF chokes Multer's parser. | `multer` is already configured with a file-size limit in `apps/api/src/middleware/uploadMiddleware.ts`; verify that limit is enforced on the remediation endpoint as well (it's a different route handler). Set to 50 MB matching the audit limit. Nginx `client_max_body_size` already configured for the audit endpoint. |

### What this section is *not*

- It's not "WCAG compliance for the security team." That's separate.
- It's not exhaustive. Specifically not covered here: TLS termination (Nginx handles), session fixation (existing auth), and CSRF (existing same-site cookie posture).
- It's not a substitute for a real penetration test before launch. Tracked as a launch-blocker checklist item: "Run an external pen test on the remediation surface before announcing the feature publicly."

### Security checklist before launch

- [ ] All 15 mitigations above implemented and verified
- [ ] Per-user concurrent-job limit live and tested with two simultaneous browsers
- [ ] Output-file lifecycle audited end-to-end: upload → process → download → file gone within 1 second
- [ ] Startup sweep tested by SIGKILL'ing the worker mid-job, restarting API, confirming cleanup
- [ ] JVM heap cap verified via `JAVA_TOOL_OPTIONS=-Xmx768m` env in PM2 ecosystem (or document why not)
- [ ] Production worker process running as `audit-worker` user, not root (or document why not)
- [ ] External pen test run, findings remediated

## Roadmap (post-v1)

Captured here so they're not lost; each gets its own design pass before
implementation.

### Deep Analysis tier (Tier 2 hybrid mode)

- Optional "Deep Analysis" button next to the standard remediate button
- Uses ODL hybrid mode with docling-fast backend
- Requires: Python venv + docling/EasyOCR install on the box (or a
  separate worker droplet)
- Trade-off: 5–15× slower; sometimes meaningfully better on complex
  tagged PDFs (e.g., FY22 in the spike: +5 over basic)
- Honest framing: "For PDFs where standard remediation didn't help much.
  Takes several minutes. Same recommendation: manual review still needed."

### AI-generated alt text (Tier 3)

- **Not** self-hosted SmolVLM — proven on this spike to be too heavy for
  shared infrastructure
- Path: rendered page → hosted vision API (Claude vision or GPT-4o vision)
  → suggested alt text per image
- Should be presented as suggestions the user reviews and accepts,
  not automatic writes
- Cost per remediation ≈ pennies; needs an admin-level on/off and budget
  cap

### Upstream ODL object-streams bug

The pdf-writer corruption on modern InDesign/Word inputs is reproducible
on `opendataloader-pdf-cli.jar` v2.4.3. We work around it with qpdf
preprocessing. Worth filing upstream at the ICJIA fork's parent
(`opendataloader-project/opendataloader-pdf`) with our two reproducer
PDFs (FY22 Annual Report and 2022 SFS) so future versions might not need
the workaround.

## Critical files (existing code to reuse)

- `apps/api/src/services/pdfAnalyzer.ts` — `analyzePDF(buffer, filename)`
  is the single entry to audit; the job runner imports it directly.
- `apps/api/src/services/scorer.ts` — produces the `ScoringResult` we
  display before/after.
- `apps/api/src/db/sqlite.ts` — add the new table inline alongside
  the four existing tables.
- `apps/api/src/middleware/authMiddleware.ts` — protects the download
  endpoint.
- `apps/api/src/mailer.ts` — Mailgun client for completion emails.
- `apps/web/app/pages/index.vue` and `apps/web/app/pages/report/[id].vue` —
  where the Remediate button mounts.
- `audit.config.ts` — add `REMEDIATION` block (TTLs, size limits,
  admin emails alias) alongside existing `ANALYSIS`, `AUTH`, etc.
- `rebuild.sh` — append Java preflight check (script already does qpdf +
  pnpm checks).
- `ecosystem.config.cjs` — left alone for v1.

**New files to create**:

- `apps/api/src/routes/remediate.ts` — public remediation API
- `apps/api/src/routes/admin-remediations.ts` — admin audit lookup
- `apps/api/src/jobs/remediate.ts` — detached worker
- `apps/api/src/services/remediationEvents.ts` — append-only event logger
- `apps/api/src/services/receiptGenerator.ts` — produces JSON + PDF receipts
- `apps/api/src/scripts/compliance-report.ts` — CLI for date-range CSVs
- `apps/api/src/scripts/remediation-cleanup.ts` — periodic + on-startup sweep
- `apps/web/app/components/RemediateButton.vue`
- `apps/web/app/composables/useRemediationJob.ts`
- `apps/web/app/pages/remediate/[jobId].vue`
- `apps/web/app/pages/account/remediations.vue` — user's own history

## Verification

End-to-end smoke test, manual:

1. Upload `controls/ILHEALSFallWinter2022FINAL.pdf` (Canva, untagged,
   spike-validated +41).
2. Audit completes, "Remediate" button appears.
3. Click → progress page shows 4 steps, completes in ~5 s.
4. Result page shows `49 (F) → ~90 (A)`, download works, output opens
   in Preview/Acrobat without errors.

Negative case:

5. Upload `controls/FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf` (InDesign 18,
   tagged, spike-validated +18 after qpdf preprocess).
6. Verify the preprocessing fires (output is valid PDF).
7. Verify the score actually moves; if the score moved but reading-order
   regressed, that should be surfaced in the remaining-issues list.

Failure-mode case:

8. Inject a PDF that ODL produces a corrupted output for (e.g., the FY22
   *without* preprocessing — temporarily disable the qpdf step in dev).
9. Confirm the post-flight `qpdf --check` catches the damage, the user
   sees the "couldn't remediate" page, no corrupted PDF is served.

Automated test (Vitest), `apps/api/src/__tests__/remediation.test.ts`:

- `controls/inaccessible.pdf` and `controls/accessible.pdf` provide stable
  fixtures.
- Test asserts: job lifecycle (pending → running → complete), output file
  exists, output passes `qpdf --check`, score didn't regress.
- **Privacy assertions** (separate test file `remediation-privacy.test.ts`):
  - After successful job: `fs.stat` returns ENOENT for every path the
    worker wrote (input copy, normalized intermediate, output after
    download).
  - `remediation_events` contains a `verified_absent` row for each
    deleted artifact.
  - The DB row never stored PDF content (assert column types/content).
- **Receipt assertions** (`remediation-receipt.test.ts`):
  - `/receipt` JSON has all required events in order.
  - `/receipt.pdf` renders successfully and is a valid PDF
    (`qpdf --check`).
  - Receipt-by-email path triggers Mailgun mock with the expected
    template variables.

Deploy verification:

- After `rebuild.sh` runs on the droplet, the preflight section confirms
  java + qpdf. PM2 status shows both apps healthy.
- Hit `https://audit.icjia.app/api/remediate/<known-good-job>/status` to
  confirm the endpoint responds (returns 404 for unknown jobs is fine).

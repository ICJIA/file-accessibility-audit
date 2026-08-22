# Activity Export & Failure Record — Design Spec

**Date:** 2026-08-22
**Status:** Approved by user (chat session, 2026-08-22)
**Target release:** v1.88.0 (migration → `user_version` 13, data-retention policy → v1.12)

## Problem

Auditors and managers will ask "what did users do with this service?" The answer
already exists — the `audit_log` table is the activity record (every audit, URL
audit, page audit and refused upload: event type, file name or URL, score, grade,
content hash, request tier, timestamp; no identity since v1.68.0; purged at 365
days) — but it has two gaps and one access problem:

1. **An audit that throws leaves no row.** "How many uploads failed last
   quarter" is unanswerable. Failures exist only as stack traces in PM2's stderr
   for ~14 days (`~/.pm2/logs`, rotated by `pm2-logrotate`).
2. **Nobody can review it without querying SQLite.** The user wants a directory
   on the server they can open with `less`, and files they can hand to a manager.
3. **The diagnostic log is mostly noise.** On 2026-08-19, 315 of the day's error
   lines were the same expected condition (fleet page-audit calls landing on PDF
   URLs → puppeteer `net::ERR_ABORTED`) logged with a full stack, and the global
   error handler logs ordinary 4xx responses (a 413 "too large") the same way.

A separate finding from the same assessment: `pm2-logrotate` 3.0.0 is configured
with `compress true` but every rotated file is plain `.log`, and
`docs/process-supervision.md` promises `*.log.gz` will appear. Cause: the module's
`parseBool` accepts only the *string* `'true'`, while pmx casts the `pm2 set`
value to a boolean before the module reads it. Documentation fix only.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| System of record | The database (`audit_log`). A text file would be a worse copy: unstructured, unqueryable, a second retention window to keep honest. |
| What the directory holds | A **derived** export — one CSV per day, regenerable from the DB, never a second source of truth. |
| Location | **`<repo-root>/logs/`** (user request 2026-08-22: "make sure the logs are easy to find in the app — a /logs in the root"), not `apps/api/data/activity/`. One `ls` from the checkout; already git-ignored (`logs/` in `.gitignore`); `rebuild.sh` never `git clean`s, so deploys leave it alone. `ACTIVITY_LOG_DIR` overrides (tests, containers). Still never served. |
| Format | **CSV** (user choice 2026-08-22): opens in Excel/Numbers for managers, greppable for the operator. RFC 4180 quoting, formula-injection guard, UTF-8 BOM. |
| Day boundaries | **America/Chicago** calendar days — the way the project already presents time to humans (`checked_at_chicago`) and the way a manager thinks about "yesterday". |
| Retention | **365 days, the same constant as the usage record** (`SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`). Never a second number. Files exist only for days fully inside the window. |
| Where it runs | Step 8 of the existing retention sweep (`runCleanup`: startup + every 5 min). No new scheduler, no cron. |
| Exposure | **Server disk only.** No download endpoint, nothing served by any route. The user's words: "a directory I can go into." |
| Failed audits | Recorded in `audit_log` as `<type>-failed` events with a one-word `reason` (new nullable column). Excluded from every existing count by construction — the counting helpers are allow-lists. |
| Capacity events | 503 busy and 429 rate-limited are **not** recorded — they are not audit outcomes. Refusals stay `rejected-upload` (already recorded). |
| Archive vs delete | Delete at the policy boundary. The data-retention page is a published deletion promise; a gzipped archive of year-old rows on disk would contradict it. A manager who needs a year-end snapshot takes a copy *inside* the window. |
| Backups | Not included. `backup-db.mjs` snapshots the database only; the files are derived from it. |
| Scope held out | Download endpoint; remediation and share events (different tables, different retention — clean follow-up); a `documents_failed` card on `/status` (symmetric to `documents_rejected`, one-liner later if wanted). |

## 1. Failure record

### 1.1 Event types

New `STATUS.FAILURE_EVENT_TYPES` in `audit.config.ts`, beside the existing lists:

```
analyze-failed, analyze-url-failed, audit-url-failed, audit-url-page-failed, bulk-from-inventory-failed
```

One `-failed` twin for every entry of `DOCUMENT_EVENT_TYPES` ∪ `PAGE_EVENT_TYPES`,
pinned by a test. Because `countDocuments`, `countDocumentsByFormat`,
`countDocumentsByGrade`, `countPrivilegedDocuments` and `countRejected*` all filter
on allow-lists, the new types can inflate nothing — still, negative tests assert it
(§ 6). `hasRecentAudit` matches on `content_hash`, which failure rows never carry.

### 1.2 Schema — migration 13

```sql
ALTER TABLE audit_log ADD COLUMN reason TEXT;
```

Probe-before-ALTER with the existing `hasColumn` helper (same shape as migration 12).
NULL on every non-failure row; a short code from the closed set below on failure
rows. Never free text.

### 1.3 Writer

`recordAuditFailure(input)` in `services/auditLog.ts`, beside `recordRejectedUpload`:

```ts
interface RecordAuditFailureInput {
  /** The BASE event type; the writer appends "-failed". Callers cannot misspell the twin. */
  eventType: "analyze" | "analyze-url" | "audit-url" | "audit-url-page" | "bulk-from-inventory";
  privileged: boolean;
  filename: string;            // file name, or the URL for URL/page audits — sanitised in the writer
  reason: AuditFailureReason;  // closed set, § 1.4
}
```

Writes `score`, `grade`, `content_hash` as NULL (NULL hash so a failure can never
satisfy the remediation audit-gate — the same reasoning as rejections), `privileged`
as 1/0, `reason` as given. Best-effort like the other writers: a logging failure
never changes the HTTP response.

### 1.4 Classifier

`classifyAuditFailure(err): AuditFailureReason | null` — a pure function in
`services/auditFailure.ts`, unit-tested against the real error shapes thrown today.
`null` means "not an audit failure — record nothing."

Checks run in this order; the first match wins:

| # | Input | Result |
|---|---|---|
| 1 | `err instanceof SafeFetchError` (its own `code` set includes a lowercase `"timeout"` and `"network_error"` — every one is a fetch outcome) | `fetch-failed` |
| 2 | `err.status === 503` (analysis semaphore, `PageAuditBusyError`) | `null` — capacity, not an outcome |
| 3 | `err.code` ∈ `UNSUPPORTED_FILE_TYPE`, `DOCX_DISABLED`, `PPTX_DISABLED`, `XLSX_DISABLED` | `null` — a refusal (`rejected-upload` already covers the first; the others are configuration, never on in production) |
| 4 | `err.code` ∈ `PDF_PARSE_FAILED`, `DOCX_PARSE_FAILED`, `PPTX_PARSE_FAILED`, `XLSX_PARSE_FAILED` | `unreadable` |
| 5 | `err.code === "ETIMEDOUT"` or `err.killed === true` or `err.name === "TimeoutError"` or `/timeout/i.test(err.message)` | `timeout` |
| 6 | `/net::ERR_/.test(err.message)` (puppeteer navigation) | `navigation-failed` |
| 7 | anything else | `internal` |

Non-`Error` throwables (a string, `undefined`) fall through to `internal`. The type
`AuditFailureReason = "unreadable" | "timeout" | "fetch-failed" | "navigation-failed" | "internal"`
is exported and the writer accepts nothing else.

### 1.5 Call sites

| Route | Catch | Records |
|---|---|---|
| `routes/analyze.ts` (~L73) | outer catch | `analyze-failed`, filename = upload name |
| `routes/analyze-url.ts` (~L140) | outer catch | `analyze-url-failed`, filename = URL |
| `routes/audit-url.ts` (~L302) | outer catch | `audit-url-failed`, filename = URL |
| `routes/audit-url-page.ts` (~L151) | the `auditPage` catch only | `audit-url-page-failed`, filename = URL |
| `routes/bulk-from-inventory.ts` (~L273, ~L394) | both **per-entry** catches | `bulk-from-inventory-failed`, filename = `entry.filename` |

Each site calls the classifier once; when it returns a code, it records the row and
then continues with the exact response it sends today. No status code or response
body changes. The `privileged` flag is the one already in scope at each site.

### 1.6 Not recorded

503 busy and 429 rate-limited (capacity events); refusals (already
`rejected-upload`); request-level failures *after* the audit itself succeeded
(`audit-url-page.ts`'s outer catch, bulk's whole-request catch — there is no single
document to attribute them to, and the audit row may already exist).

## 2. Daily activity export

### 2.1 Location and naming

```
<repo-root>/logs/activity-YYYY-MM-DD.csv
```

The directory is `logs/` at the root of the checkout (on the production host,
`/home/forge/audit.icjia.app/file-accessibility-audit/logs/`) — the user's requirement
is that the logs are easy to find, one `ls` from the application root. The path is
derived from the module's own location the way `defaultBackupStatusFile()` already
derives the repo root (`services/dataDir.ts: repoRoot()`), never from the process cwd;
`ACTIVITY_LOG_DIR` (absolute path) overrides it for tests and containerised deploys.
`logs/` is already in `.gitignore`, and `rebuild.sh` runs `git checkout -- .` +
`git pull` and never `git clean`, so the files survive every deploy. On the production
host the checkout and `apps/api/data` share one volume, which is the volume the
`/status` disk probe watches. `defaultDataDir()` (the database directory) moves to the
same `services/dataDir.ts` and is re-exported from `services/status.ts` so existing
imports are unchanged. Directory created `0700`, files written `0600`, owner is the
API process user (`forge` in production) — mirrors `data/remediation`.

Config: a new `ACTIVITY_EXPORT` block in `audit.config.ts` — `DIR_NAME: "logs"` (a
directory name at the repo root), `FILE_PREFIX: "activity-"`, `GRACE_MINUTES: 5`. The time zone becomes
`DEPLOY.LOCAL_TIME_ZONE: "America/Chicago"`, and `status.ts`'s `chicagoTime()` reads
the same constant instead of its hard-coded string, so the two can never drift.
Retention is **not** a new constant: the export reads
`SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`.

### 2.2 Day boundaries

A row belongs to the file for the **America/Chicago calendar date** of its
`created_at`. The date is obtained from `Intl.DateTimeFormat(...).formatToParts`
with `timeZone: DEPLOY.LOCAL_TIME_ZONE`, so DST transitions need no library and no
offset arithmetic. `created_at` is SQLite's `CURRENT_TIMESTAMP` (`YYYY-MM-DD
HH:MM:SS`, UTC, no zone marker) and is parsed with the existing `sqliteUtcToIso()`
from `services/status.ts`, never with bare `new Date(text)`.

Day arithmetic ("the day before", "days between") is done on `YYYY-MM-DD` strings via
`Date.UTC` — pure calendar math, no time zone involved.

If `Intl` cannot produce the zone (Node built without full ICU — not the case on
Node ≥ 22), the step **fails loudly** into the sweep's `errors` and writes nothing.
It must never fall back to UTC days silently: that would produce files whose
boundaries disagree with every file written before.

### 2.3 File format

UTF-8 with BOM, LF line endings (Excel and Numbers read LF-terminated CSV; RFC
4180's CRLF would render as `^M` on every line in `less`), header row, one row per
`audit_log` row for that day, ordered by `id`:

| Column | Source | Notes |
|---|---|---|
| `id` | `audit_log.id` | stable reference two people can point at |
| `timestamp_utc` | `created_at` | `2026-08-19T14:03:22Z` |
| `timestamp_chicago` | `created_at` | `2026-08-19 09:03:22 CDT` — sortable, 24-hour |
| `event` | `event_type` | verbatim: `analyze`, `analyze-failed`, `audit-url-page`, `rejected-upload`, … |
| `filename` | `filename` | file name, or the URL for URL/page audits |
| `score` | `score` | empty when NULL |
| `grade` | `grade` | empty when NULL |
| `content_hash` | `content_hash` | empty when NULL |
| `tier` | `privileged` | `trusted-tool` (1), `public` (0), `unknown` (NULL — rows predating migration 12). The policy page's own vocabulary; "anonymous" is a word its overclaim guard bans |
| `reason` | `reason` | failure code or empty |

This header is the column **allow-list**, pinned by test (§ 6). Adding a column is
a policy change and must touch the data-retention page in the same release.

Example:

```
id,timestamp_utc,timestamp_chicago,event,filename,score,grade,content_hash,tier,reason
48213,2026-08-19T14:03:22Z,2026-08-19 09:03:22 CDT,analyze,"Annual Report, FY24.pdf",72,C,9f2c…,public,
48214,2026-08-19T14:04:01Z,2026-08-19 09:04:01 CDT,audit-url-page-failed,https://example.gov/files/brief.pdf,,,,trusted-tool,navigation-failed
```

### 2.4 When it runs

Step 8 of `runCleanup()` in `services/remediationCleanup.ts`, after the `audit_log`
purge (step 6) so both see the same cutoff. Per run:

```
now              = Date.now()
cutoffDay        = chicagoDate(now − RETENTION_DAYS × 86 400 000)   // the day containing the cutoff instant
lastCompleteDay  = dayBefore(chicagoDate(now − GRACE_MINUTES × 60 000))
for each day d with cutoffDay < d ≤ lastCompleteDay, ascending:
    if activity-d.csv exists → skip
    else select rows whose created_at is within [d − 1 day, d + 2 days) UTC,
         keep those whose Chicago date is d, write the file
prune: delete every activity-*.csv whose filename date ≤ cutoffDay
```

Consequences, all deliberate:

- **The first sweep after deploy materializes the whole retention window** from
  the rows the DB still holds (≈ 365 files, tens of MB at most — on 2026-08-22 the
  DB holds 11,839 document rows, ~8,300 of them from one fleet month). It runs at
  startup, asynchronously, so it never delays the listen.
- **A missed midnight self-heals.** Nothing tracks "last exported" in memory; the
  file's existence is the state.
- **A complete day's file is never rewritten.** Rows are insert-only with
  server-set timestamps, and the grace window puts the file 5 minutes past the
  day's end. Regeneration is "delete the file; the next sweep rewrites it" — also
  the upgrade path if the writer's format ever changes.
- **Empty days get a header-only file.** An explicit "nothing happened" is
  different from "the export did not run."
- **The boundary day is excluded**, so a file exists only for days fully inside
  the window and a file and the DB can never disagree at the edge — including on
  first materialization.
- Writes are atomic: `activity-d.csv.tmp` (overwritten if a crashed run left one)
  then `rename`. Pruning deletes **only** names matching
  `activity-YYYY-MM-DD.csv` with a date ≤ cutoffDay; it never touches any other
  file in the directory, including `.tmp` files and anything a human put there.

`CleanupResult` gains `activityFilesWritten` and `activityFilesPruned`; the CLI
entry point prints them like the other counts. A failure in the step lands in
`errors` as `{ step: "activityExport", message }` and — per the sweep's existing
contract — blocks nothing else.

### 2.5 Retention and pruning

365 days, from `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`. The window is identical
to the usage record's, so a reviewer who can see a file can find its rows, and a
row that has been purged has no file. Not in backups (derived). Not served.

## 3. CSV safety

- RFC 4180: a field containing `,` `"` CR or LF is quoted, inner `"` doubled.
- Formula-injection guard: a field whose first character is `=` `+` `-` `@` TAB or
  CR is prefixed with a single quote before quoting (OWASP CSV-injection
  mitigation). A user can name a file `=HYPERLINK(...)` and a manager will open the
  file in Excel.
- UTF-8 BOM so Excel on Windows reads non-ASCII file names. The header line is
  `\uFEFFid,timestamp_utc,…`; a reader that strips the BOM sees a plain header.
- Filenames are already sanitised at write time (`sanitizeStoredFilename`: markup,
  newlines, traversal, length); the writer quotes regardless and never trusts it.

## 4. Noise trim

- `routes/audit-url-page.ts` (~L151): when the classifier returns
  `navigation-failed` or `timeout`, log **one** `console.warn` line —
  `[audit-url-page] page audit failed (<reason>): <message>` — with no stack.
  Any other result keeps today's full `console.error(err)`.
- Global error handler (`index.ts` ~L110): a response with status `< 500`
  (including multer's `LIMIT_FILE_SIZE` → 413) logs one line —
  `[api] <status> <code|name> <METHOD> <req.path>` — and a `≥ 500` keeps the full
  error with stack. `req.path` carries no query string.

Neither line carries an IP, a token, a user agent or a request body — the same
constraint the `[rate-limit]` lines are tested for.

## 5. Documentation and policy (same release)

**Data-retention page** — `POLICY_VERSION` in `apps/web/app/pages/data-retention.vue`
→ `1.12`; the sections live in `apps/web/app/components/dataRetention/`:

- `Section07RetentionTable.vue` — the "Usage log" row's category text gains
  "failed audits" (it reads *audits and refused-upload attempts* today). New row
  in the same four columns: **Data category** *Daily activity files — one CSV per
  calendar day (Central time), derived from the usage log and holding the same
  fields; no file content* · **Where stored** *On the same server, in `logs/` at the
  application's root — beside the code, outside the web root, unreachable from the
  web; not part of the nightly backup* · **Maximum retention** *365 days — the usage log's window* ·
  **Configurable** *Yes — `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` (shared with
  the usage log; there is no separate setting)*. The sweep paragraph under the
  table (the one that lists what `remediationCleanup.ts` does) gains the export
  and its pruning as the last step.
- `Section08Stored.vue` — two bullets in the "Stored (metadata only)" list: *For a
  failed audit: the file name or page address it was attempted on (sanitized), a
  timestamp, the request tier, and a one-word reason code — `unreadable`,
  `timeout`, `fetch-failed`, `navigation-failed`, `internal` — never the error
  text; no score, no grade, no content hash* and *Daily activity files: the usage
  log's rows for one calendar day, written to a CSV file on the server so the
  day can be reviewed without querying the database — the same fields, nothing
  more; deleted after 365 days; not backed up; not downloadable from this site.*
  The file name is named as the field that can carry personal information if a
  person put it there, the way § 8a already frames it.
- `Section08aStorageVerification.vue` — the `audit_log` row's "what it holds"
  cell gains the failure reason code; the `CREATE TABLE audit_log` block becomes
  *shape after migration 13* with `reason TEXT` and a comment (*one of five fixed
  codes on a failed audit, NULL otherwise — never error text*).
- `Section14ChangeLog.vue` — entry *v1.12 · 2026-08-22*, in the existing `<li>`
  shape, saying what is new (failed audits recorded with a reason; daily activity
  files), that no retention period changed, and that the files are derived, not
  backed up, and not served.
- Wording must pass the overclaim guards (`backupsExplained.test.ts` style): name
  the fields; never write "no personal data/information/details", "no PII", or
  "anonymous/anonymised" anywhere in the new copy.

**README** — the identity/retention paragraph, the usage-record description, the
test table (new files), and a short "Activity export" subsection pointing at the
runbook. **Announcement** — one What's New entry (≤ 5 sentences) linking to
`/data-retention`, since the policy changes. **`docs/activity-export.md`** — a
short runbook: where the files are, how to read one (`less`, Excel), how to
regenerate a day, the retention rule, what is deliberately not there.
**`docs/process-supervision.md`** — replace the gzip claim with the truth (plain
`.log`, why, and the resulting bound of 14 × 10 MB per stream) and correct
`workerInterval` to the value on the server (30).

## 6. Testing (TDD; every item below is a pinned test, not a manual check)

| Area | Pins |
|---|---|
| Classifier | every row of the § 1.4 table; the return is always in the closed set or `null`; never a substring of `err.message` |
| Failure writer | event is `<base>-failed`; score/grade/hash NULL; `reason` stored; tier stored; filename sanitised; `FAILURE_EVENT_TYPES` = twins of document ∪ page types |
| `/status` immunity | seed failure rows → `documents_audited`, by-format, by-grade, `privileged_audits`, `documents_rejected` unchanged; `statusPrivacy` allow-list unchanged |
| CSV writer | exact header (allow-list); quoting of `,` `"` CR LF; injection prefix for each trigger char; BOM; LF line endings; NULL → empty; tier mapping; a hostile filename round-trips through a CSV parse |
| Day logic | Chicago date of instants either side of local midnight in CDT and CST; the 2026 DST days (03-08, 11-01); grace window; `cutoffDay`/`lastCompleteDay`; day arithmetic across month/year ends |
| Export runner | against `:memory:` DB + temp dir: materialises every missing day in the window; header-only for empty days; second run writes 0; a mutated file is not rewritten; boundary day absent; prunes only matching names ≤ cutoff; ignores foreign files and `.tmp`; no `.tmp` left behind; result counts |
| Wiring | `runCleanup()` invokes the step and reports `activityFilesWritten`/`activityFilesPruned`; a step failure is captured in `errors` as `activityExport` |
| Noise trim | classified page-audit failure → one `warn` line, no stack; unclassified → `error` with stack; handler: 4xx one line, 5xx stack; neither line contains a token or IP |
| Policy page | reads the component files like `backupsExplained.test.ts` does: § 7 row present with "365" and "not part of the nightly backup"; § 8 failure + activity-file bullets present; § 8a block says "migration 13" and `reason TEXT`; § 14 has a v1.12 entry; `POLICY_VERSION` is 1.12; the new copy contains none of the banned phrases (incl. "anonymous") |
| Config | `DEPLOY.LOCAL_TIME_ZONE` is what `chicagoTime()` uses |

Then, from the repo root: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, all three test suites — before any push.

## 7. Release

v1.88.0 per `project_release_checklist`: CHANGELOG entry; versions ×6; README
§ Security entry and § 10 `SECURITY_AUDIT_ENTRIES` entry (the test fails the release
without both); annotated tag; What's New entry. Deploy via Forge (the user
deploys). After deploy, verify on the server: `ls -la logs | tail` from the checkout root,
`pm2 logs file-audit-api --lines 20` shows the sweep's counts, and one day's file
opens cleanly.

## 8. Non-goals and follow-ups

- No download endpoint. No new route of any kind.
- Remediation and share events in the export — follow-up; they live in tables with
  their own retention and would need their own policy lines.
- `documents_failed` on `/status` — follow-up; one count + one card + an allow-list
  line, if ever wanted.
- Compressing the export files — unnecessary at these sizes; revisit only if a
  year exceeds ~100 MB.
- The `pm2-logrotate` compression bug — upstream; documented, not worked around.

## 9. Risks

- **First-run burst:** up to ~366 files in one sweep. Bounded by the window; each
  day is one indexed-range query; runs off the request path.
- **ICU:** absent ICU makes the step error every sweep (visible in `errors` and the
  CLI output) rather than silently misfile rows. Node ≥ 22 ships full ICU.
- **Second-resolution timestamps:** rows within the same second order by `id`.

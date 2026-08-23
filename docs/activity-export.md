# Daily activity export

One CSV per calendar day, derived from the `audit_log` table, so a day can be reviewed — or
handed to a manager — without querying SQLite. Added in v1.88.0; design in
`docs/superpowers/specs/2026-08-22-activity-export-design.md`.

## Where

```
<repo-root>/logs/activity-YYYY-MM-DD.csv        # /home/forge/audit.icjia.app/file-accessibility-audit/logs/ in production
```

`logs/` at the root of the checkout — one `ls` from the application root. The path is derived
from the code's own location (`services/dataDir.ts: activityLogDir()`), never from the process
cwd; set `ACTIVITY_LOG_DIR` (absolute) to put it elsewhere. `logs/` is git-ignored and
`rebuild.sh` never `git clean`s, so deploys leave the files alone. Directory `0700`, files
`0600`, owned by the API process user (`forge` in production). Nothing serves these files; the
only way to read one is on the server.

```bash
cd /home/forge/audit.icjia.app/file-accessibility-audit
ls -lt logs | head                               # newest first
less logs/activity-2026-08-19.csv
scp forge@audit.icjia.app:audit.icjia.app/file-accessibility-audit/logs/activity-2026-08-19.csv .
```

Each file opens directly in Excel or Numbers (UTF-8 BOM, LF line endings).

## What a row is

Exactly the usage log's fields — the data-retention policy (§ 8) is the authority on what they
mean, and `ACTIVITY_CSV_COLUMNS` in `apps/api/src/services/activityCsv.ts` is the pinned allow-list:

| Column | Meaning |
| --- | --- |
| `id` | the `audit_log` row id — a stable reference two people can point at |
| `timestamp_utc` | `2026-08-19T14:03:22Z` |
| `timestamp_chicago` | `2026-08-19 09:03:22 CDT` — sortable, 24-hour |
| `event` | `analyze`, `analyze-url`, `audit-url`, `audit-url-page`, `bulk-from-inventory`, `rejected-upload`, or any of those with `-failed` |
| `filename` | the file's name, or the URL for URL / page audits |
| `score`, `grade` | empty for refusals and failures |
| `content_hash` | SHA-256 of the file; empty for refusals and failures |
| `tier` | `trusted-tool` (fleet token), `public`, or `unknown` (rows older than migration 12) |
| `reason` | failed audits only: `unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal` |

A day is an **America/Chicago** calendar day (`DEPLOY.LOCAL_TIME_ZONE`). A row at 23:30 Central
on the 19th is in the 19th's file even though its UTC date is the 20th.

## When it is written

Step 8 of the retention sweep (`runCleanup` in `apps/api/src/services/remediationCleanup.ts`),
which runs at API startup and every 5 minutes. Each run writes every *complete* day inside the
retention window that has no file yet (a day is complete 5 minutes after local midnight —
`ACTIVITY_EXPORT.GRACE_MINUTES`). So:

- the first run after deploy writes the whole past year from the rows the database still holds;
- a missed midnight (restart, reboot) heals itself on the next run;
- an empty day gets a header-only file — "nothing happened", not "the export did not run".

Check the sweep's own report: since v1.88.1 every startup sweep logs one line —
`[sweep] activity files: N written, N pruned · error logs pruned: N · audit_log rows purged: N · …` —
and an interval sweep logs one whenever it did anything, so `pm2 logs file-audit-api --lines 50`
after a restart shows it. Any step that failed is also logged on stderr (`[sweep] step … failed: …`),
which lands in `logs/errors-*.log`. For the full JSON result, run
`cd apps/api && pnpm tsx src/services/remediationCleanup.ts`.

## The quick way: `./logs.sh`

`logs.sh` at the repository root wraps everything on this page. Run it **from your laptop**
(it notices there is no local `logs/`, runs the same command on the server over SSH, and streams
the result back — so `--copy` fills *your* clipboard) **or on the server** from the checkout root.

```bash
./logs.sh                         # the 500 most recent audits, newest first, across days as needed
./logs.sh 200                     # the 200 most recent (same as: ./logs.sh recent 200)
./logs.sh help                    # every command, the DATE shape with examples, every format
./logs.sh activity 2026-08-19     # that day as an aligned table (raw CSV when piped)
./logs.sh 2026-08-19              # shortcut for the same
./logs.sh failed yesterday --md   # only the failed-audit rows, as a Markdown table
./logs.sh activity 2026-08-19 --copy   # TSV on the clipboard — paste into Excel / Sheets as columns
./logs.sh errors                  # today's error log
./logs.sh grep ERR_ABORTED 2026-08-19
./logs.sh tail                    # follow today's error log live
./logs.sh list                    # the newest files: which days are on file
./logs.sh pull 2026-08-19         # laptop only: download that day's CSV
```

DATE is `YYYY-MM-DD` (America/Chicago) or the word `today` / `yesterday`; anything else is
rejected with the accepted form and a live example. Because a day's file is written just after
midnight, the newest audits on file are yesterday's — a bare `./logs.sh` says so above its table.
Formats: `--table` (terminal default), `--csv` (piped default), `--tsv`, `--md`, `--copy`. The CSV
is parsed properly (quoted commas, the BOM), so file names with commas stay in one cell. Needs
`python3` for the table formats (present on the server and on macOS). `logsSh.test.ts` runs the
real script against a fixture directory.

## Retention

365 days — `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`, the usage log's own window. There is no
separate setting, so a file exists exactly when its rows do: the sweep prunes any
`activity-YYYY-MM-DD.csv` whose date is at or before the cutoff day, and never writes the cutoff
day itself. The files are **not** in the nightly backup (they are derived; the database is) and
must not be archived past the window — the policy page is a published deletion promise.

## Regenerating a day

A complete day's file is never rewritten. Delete it; the next sweep writes it again from the
database (within the window):

```bash
rm logs/activity-2026-08-19.csv                       # then wait ≤ 5 min, or run the sweep by hand
```

This is also the upgrade path if the file format ever changes: delete the files, let the sweep
rebuild them.

## The error log — when the site misbehaves

```
<repo-root>/logs/errors-YYYY-MM-DD.log
```

Everything the API process writes to its error output, one plain-text file per Chicago day:
each entry is `2026-08-19T14:03:22Z [error] …` or `[warn] …` followed by exactly what the
terminal would show — for an Error, its message and stack. It is a tee of stderr, installed at
startup, so `pm2 logs file-audit-api` shows the same lines; this file is just the copy that is
easy to find and that outlives PM2's 14-day rotation.

```bash
less logs/errors-2026-08-19.log
grep -n '\[error\]' logs/errors-2026-08-19.log | tail      # the failures, newest last
grep -c 'net::ERR_ABORTED' logs/errors-2026-08-19.log       # how often a known condition fired
```

To go from a failed audit to its cause: take the row's `timestamp_utc` and `filename` from the
day's activity CSV and grep the same day's error log for the URL or the file name — the failure
row's one-word `reason` is the classification, the error log has the detail.

- Kept **30 days** (`ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`), pruned by the sweep on the
  file-name date. Not in backups. Never served.
- A day's file stops growing at 50 MB (`ERROR_LOG_MAX_BYTES_PER_DAY`) after a final
  `[error-log] daily size limit reached` line — a crash loop cannot fill the disk; stderr (PM2)
  still gets everything.
- If the directory cannot be written, the tee says so once on stderr and stays off for the day;
  nothing else changes.
- Privacy: the file holds what stderr holds. The service never writes the requester's address,
  browser identifier, token or request body to stderr (tested); a message can name a file, a
  page address, a library path, or the address of a server the tool tried to reach — the
  data-retention policy says so (§ 7, § 8).
- Note: the tee is installed as the first statement of `index.ts`, but ES module imports are
  evaluated before it — anything a module logs while being imported (a failed migration at
  startup, for example) reaches PM2's stderr only. For that one case,
  `pm2 logs file-audit-api --lines 50`.

## What is deliberately not here

- No download endpoint. The files stay on the server.
- No remediation or share events — those live in tables with their own retention.
- No compression — a year is tens of MB at most.
- Pruning touches only names of the exact `activity-YYYY-MM-DD.csv` shape. Anything else placed
  in the directory (including a stale `.tmp` from a crash) is left alone.

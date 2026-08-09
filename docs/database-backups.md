# Database backups

Nightly, WAL-safe, integrity-checked snapshots of the SQLite database, with a
scripted and tested restore path. Added in v1.49.0 after the 2026-08-05
operational review found the single most valuable file in the deployment —
`apps/api/data/audit.db`, holding every audit row, shared-report link, and (at
the time) access token — had **no backup of any kind** and lives inside the git
working tree, where a `git clean -xdf` would delete it.

## What runs

| Piece | Path | Role |
| --- | --- | --- |
| Core | `apps/api/scripts/backup-db.mjs` | SQLite **online backup** via better-sqlite3's `db.backup()` — safe while the API is writing. Verifies `PRAGMA integrity_check` and the `audit_log` row count on the snapshot, gzips it, rotates old snapshots, writes `last-backup.json`. Plain JS: needs only `node`, no pnpm/tsx, so it runs under cron's minimal PATH. |
| Cron wrapper | `scripts/backup-db.sh` | Resolves the repo from its own location, probes for `node`, pins cwd to `apps/api` (so a relative `DB_PATH` means what it means under PM2), runs the core. |
| Restore | `scripts/restore-db.sh` | Verifies the snapshot **before** touching anything, sets the current DB aside (including `-wal`/`-shm` — a stale WAL next to a restored main file corrupts it), then swaps the snapshot in. Nothing is deleted. |
| Tests | `apps/api/src/__tests__/backup.test.ts` | 8 tests pinning the safety properties below. |

## What a snapshot contains (and why anyone asks)

A snapshot is a copy of `audit.db` and nothing else. Concretely: one `audit_log`
row per audit and per refused upload — timestamp, sanitized file name, score,
grade, content hash: **metadata about the audit event**, data about the file,
never the file — plus `shared_reports` rows for reports someone chose to share
and the `remediation_jobs`/`remediation_events` compliance trail. Since
v1.68.0 that is the whole database: there is no email, IP-address, or
user-agent column anywhere in the schema (migration 11 dropped the columns and
their data), and the `otp_codes`, `access_tokens`, and `revoked_jtis` tables
no longer exist. Snapshots taken **before** v1.68.0 still carry the old shape
— the identifier columns and the deleted tables — until the keep-5 rotation
ages them out (≈5 days of nightly runs). **No audited document is in it**,
because no audited document is ever written to disk in the first place — the
audit path holds the buffer in memory (a PDF's qpdf temp copy is deleted in
the same request).

This gets asked because the tool's headline promise is *your file is never
stored*, and a nightly backup reads as a contradiction until someone separates
the document from the metadata about having checked it. Since v1.58.0 the
product says so itself rather than leaving it to this runbook: the `/status`
backup card carries a ✓/✗ split and the plain-language answer, and § 7a of the
data-retention policy draws the same two lanes. Since v1.68.0 both state the
guarantees affirmatively — no accounts, no sign-in; no email, IP-address, or
browser column in the schema — while still never claiming "contains no
personal data": the file name as uploaded can itself name a person (a file
named after a person stores that name), and an overclaim, once caught, would
discredit the rest of the policy. Pinned by
`apps/web/app/__tests__/backupsExplained.test.ts`, whose overclaim guards fail
on that phrasing specifically.

**Why not `cp` + cron:** the database runs in WAL mode. Copying the main file
misses every committed row still sitting in `audit.db-wal` — a stale or torn
snapshot that looks fine until the day it's restored. The online backup API
snapshots the committed state atomically. (This is also why the old archived
deploy-guide suggestion of a `cp` cron was never safe to follow.)

**Safety properties (each pinned by test):**

- Rows still in the WAL are included in the snapshot.
- A missing source DB fails the run — the script can never manufacture an
  empty database and "successfully" back that up (`fileMustExist`).
- A database without `audit_log` fails the run — backing up the wrong file is
  an error, not a success.
- `integrity_check` runs on the snapshot itself before it is kept.
- Rotation deletes only the script's own `audit-*.db.gz` files, never
  anything else in the directory.
- `last-backup.json` is written atomically with timestamp, size, row count,
  and what was rotated — so "backups silently stopped" is observable.

## Production setup (Laravel Forge)

The repo checkout on the server is nested inside the Forge site directory:
`/home/forge/audit.icjia.app/file-accessibility-audit`. Backups land in
**`/home/forge/audit.icjia.app/backups`** — beside the checkout in the same
site folder (easy to find), but deliberately **outside** the git working tree
(a `git clean -xdf` in the repo cannot delete the backups together with the
database) and outside any web root. `BACKUP_DIR` overrides.

Forge → your server → **Scheduler** → New Scheduled Job:

| Field | Value |
| --- | --- |
| Command | `/home/forge/audit.icjia.app/file-accessibility-audit/scripts/backup-db.sh` |
| User | `forge` |
| Frequency | Custom: `0 0 * * *` (00:00 UTC = 7pm America/Chicago during CDT, 6pm during CST) — or Forge's "Nightly" preset |

No output redirect: Forge captures each run's output in the job's Output
panel, and `last-backup.json` plus the `/status` backup row are the durable
record. (An earlier suggested command redirected to a log file — that form
fails on first run if the log's directory doesn't exist yet, because the
shell opens the redirect before the script can create anything.)

The script must be on the server first (deploy `main`). First-run check,
from an SSH session:

```bash
/home/forge/audit.icjia.app/file-accessibility-audit/scripts/backup-db.sh
cat /home/forge/audit.icjia.app/backups/last-backup.json
```

Since v1.50.0 the public `/status` page also shows the last successful
backup (completion time, age, size, record count) — "unavailable" until the
first run completes, "stale" once it is older than
`STATUS.BACKUP_STALE_AFTER_HOURS` (30).

Environment knobs (all optional): `BACKUP_DIR` (destination),
`BACKUP_KEEP_COUNT` (how many snapshots to retain — the newest N are kept,
older ones deleted; default 5), `DB_PATH` (source override, same semantics as
the API). Rotation is count-based rather than age-based so disk use stays
bounded no matter how many manual runs happen between nightly ones.

## Restore

```bash
pm2 stop file-audit-api
/home/forge/audit.icjia.app/file-accessibility-audit/scripts/restore-db.sh \
  /home/forge/audit.icjia.app/backups/audit-<date>.db.gz
pm2 start file-audit-api
# then: check /status, spot-check a known report
```

The previous database is preserved as `audit.db.pre-restore-<timestamp>`
(with its `-wal`/`-shm`), so a restore is itself reversible.

**Restore drill — performed 2026-08-05** against the development database on
the maintainer's machine: source had 68 `audit_log` rows → snapshot verified
at 68 rows, `integrity_check: ok` → restored copy contained 68 rows,
integrity ok, with a deliberately planted stale `-wal` correctly set aside.
Re-run this drill (against a scratch target path, second argument of
`restore-db.sh`) whenever the backup code changes.

## What this does and doesn't protect against

| Scenario | Covered? |
| --- | --- |
| Bad deploy, fat-fingered `git clean`, app bug corrupting the DB | ✅ restore last night's snapshot, precisely and fast |
| Disk corruption on the DB file | ✅ (snapshots are integrity-checked at creation) |
| **Droplet loss** (destroyed/unbootable) | ✅ via DigitalOcean's own droplet backups (enabled, daily) — coarser and slower (whole-droplet restore), but it exists |

The two layers are complementary: DO's droplet backup answers "the server is
gone", this script answers "the database needs to go back to last night"
without rebuilding a droplet. If proper offsite copies of the DB alone are
ever wanted, `rclone copy /home/forge/backups/audit-db spaces:audit-backups`
as a second Scheduler job (plus a Spaces bucket + rclone config) is the
next step.

Retention note (documented in the public data-retention policy, v1.3): only
the `BACKUP_KEEP_COUNT` (5) newest snapshots are retained, so with nightly
runs a row purged by the 365-day retention sweep persists in snapshots for
roughly 5 further days. (DigitalOcean's droplet backups have their own
retention on DO's side, outside this repo's control.)

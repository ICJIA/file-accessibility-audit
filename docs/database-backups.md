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
| Cron wrapper | `scripts/backup-db.sh` | Resolves the repo from its own location, probes for `node`, pins cwd to `apps/api` (so a relative `DB_PATH` means what it means under PM2), runs the core, then copies the report-seal key beside the snapshots (mode 0600). |
| Restore | `scripts/restore-db.sh` | Verifies the snapshot **before** touching anything, sets the current DB aside (including `-wal`/`-shm` — a stale WAL next to a restored main file corrupts it), then swaps the snapshot in. Nothing is deleted. Puts the report-seal key back only when the database directory has none. |
| Tests | `apps/api/src/__tests__/backup.test.ts` | 8 tests pinning the safety properties below. |

## What a snapshot contains (and why anyone asks)

A snapshot is a copy of `audit.db` and nothing else. (One other file sits
beside the snapshots since 2026-11-24: a copy of the report-seal key — a
server secret, not data about anyone; see "The report-seal key" below.)
Concretely: one `audit_log`
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

## The two layers

There are two backups, and they answer different questions.

| | Layer 1 — SQLite snapshots | Layer 2 — DigitalOcean droplet backups |
| --- | --- | --- |
| What it copies | The database only (`audit.db`), plus one copy of the report-seal key | The whole server disk: system, checkout, database, the snapshots, `/etc/environment` |
| Where it lives | On the **same server**, in `/home/forge/audit.icjia.app/backups` | In DigitalOcean's backup storage, in the **same DigitalOcean account** |
| How often | Nightly (Forge Scheduler), and once before every deploy (`backups/pre-deploy/`) | Daily |
| How much is kept | The 5 newest nightly, the 3 newest pre-deploy | Set on DigitalOcean's side, outside this repository |
| Run by | This repository's scripts | The server's owner, in DigitalOcean: **a backup is taken by hand every day** (stated by the owner on 2026-11-24) |
| Restores | The database alone, in about a minute | The whole machine, to the state of the last daily backup |
| Checked by | `/status` shows the last snapshot's age; marked stale after 30 hours | Nothing in this repository can see it — check the droplet's Backups tab |

### What each one covers

| What went wrong | Layer 1 | Layer 2 | Notes |
| --- | --- | --- | --- |
| A migration or an app bug damaged the database | Yes | Yes, but coarse | Use layer 1: the pre-deploy snapshot, or last night's |
| `git clean -xdf` or a slip of the hand deleted `apps/api/data` | Yes | Yes, but coarse | Snapshots are outside the checkout |
| The database file is corrupt on disk | Yes | Probably | Snapshots are integrity-checked when made |
| The server's disk failed, or the droplet was destroyed or will not boot | **No** — the snapshots were on that disk | Yes | Restore the droplet; up to 24 hours of audit records are lost |
| The server was broken into and files were changed | Not safely — the snapshots were within reach | Yes, from a backup taken before the break-in | Rotate `API_PRIVILEGED_TOKEN` and the seal key afterwards |
| The DigitalOcean account was lost, closed, or its backups deleted | **No** | **No** | **Neither layer covers this.** See "The gap" below |
| A record must come back from more than 5 nights ago | No | Only within DigitalOcean's own retention | By design: the retention policy says snapshots are kept about 5 days |

### What a droplet restore costs

A droplet backup is a picture of the whole disk at one moment in the day.
Restoring it puts **everything** back to that moment:

- up to 24 hours of audit records, saved reports and remediation history made
  since the backup are gone;
- the checkout goes back to whatever commit was deployed then — run
  `./rebuild.sh` afterwards to return to the current release;
- the on-server snapshots go back too, so the newest one after a restore is
  from before the backup.

Use it for "the server is gone", never for "the database needs to go back a
day" — layer 1 does that without touching anything else.

### The gap

Both layers sit inside one DigitalOcean account. Losing the account, or a
mistake made with full access to it, loses both. Nothing copies the database
anywhere else today.

**Decided by the owner, 2026-11-24: the gap is accepted.** No third copy is
kept outside the DigitalOcean account, and none is planned; DigitalOcean's own
backups cannot be sent anywhere else. What stands against the gap is the daily
backup the owner takes by hand.

If that decision is ever revisited, closing the gap means a copy somewhere that
account cannot reach — for example a second Scheduler job that encrypts the
newest snapshot and uploads it to object storage held under a different
account. It would also change a published statement: the data-retention policy
and the README say snapshots stay on the server, so the policy text would have
to change in the same release as the job.

## The report-seal key

`apps/api/data/report-seal.key` is 32 random bytes the API creates on first
start (mode 0600), beside the database. Every audit result the API returns
carries a seal made with it, and `POST /api/reports` — saving a report so it
can be shared — refuses a result whose seal does not verify
(`apps/api/src/services/reportSeal.ts`).

**What losing it means, exactly.** The seal is checked only at the moment a
report is saved. So:

- reports already saved keep working — their links are not affected;
- the API makes a new key at its next start and carries on;
- an audit result that was issued under the old key and is still open in
  someone's browser can no longer be saved or shared. The page says to run the
  audit again. That is the whole loss.

It is small, but it is avoidable, so the key travels with the backups:

- `scripts/backup-db.sh` copies it to `<backup dir>/report-seal.key` (mode
  0600) on every run. One copy, replaced each time; it is not inside a
  snapshot file and is not rotated. Nothing is copied when the deployment
  supplies `REPORT_SEAL_SECRET` instead of a key file.
- `scripts/restore-db.sh` puts that copy back **only if the database directory
  has no key**. It never replaces a key that is there.
- A droplet restore brings the key back with the rest of the disk.

The key is a secret. It is never logged, and it must not be pasted into a
ticket or an email. Anyone holding it could make a hand-written result pass as
one this server produced.

## Recovery

### The database needs to go back (layer 1)

```bash
ssh forge@audit.icjia.app
cd ~/audit.icjia.app/file-accessibility-audit
ls -lt ../backups/ ../backups/pre-deploy/        # choose a snapshot
pm2 stop file-audit-api
./scripts/restore-db.sh ../backups/audit-<date>.db.gz
pm2 start file-audit-api
curl -s http://127.0.0.1:5103/api/health          # then open /status and one saved report
```

The script verifies the snapshot before touching anything and moves the
current database aside as `audit.db.pre-restore-<timestamp>` (with its
`-wal`/`-shm`). To undo a restore, stop the API and move that file back.

If the restored database is **older than the code** expects, the API applies
the missing migrations when it starts — that is normal. If it is **newer** than
the code (a restore after a rolled-back deploy), deploy the matching release.

### The server is gone (layer 2)

1. In DigitalOcean: the droplet → **Backups** → choose the newest backup →
   restore to this droplet, or create a new droplet from it.
2. If it is a new droplet, its IP address is different: point the DNS record
   for the site at it, and check Forge still manages the server.
3. SSH in. `pm2 status` — both apps should come back by themselves
   (`pm2 resurrect` if they do not).
4. `cd ~/audit.icjia.app/file-accessibility-audit && ./rebuild.sh --check`,
   then `./rebuild.sh` to return to the current release.
5. Open `/status`: the engines, the disk, and the backup row.
6. Run the nightly backup once by hand so the newest snapshot is current.
7. From a development machine: `pnpm prod-sentinels`.

If no droplet backup can be used, rebuild from nothing with `docs/runbook.md`.
The audit history is then lost; the checker itself is not.

## Restore drill — twice a year

A backup that has never been restored is a hope. Do this in **January and
July**, and write the date and the result in the table below.

Layer 1, on the server, against a scratch path — the live database is never
touched:

- [ ] `ls -lt ../backups/` shows a snapshot from the last 24 hours.
- [ ] `/status` shows the backup row as current, not stale.
- [ ] `mkdir -m 700 ~/restore-drill` — a private scratch directory.
- [ ] `./scripts/restore-db.sh ../backups/audit-<newest>.db.gz ~/restore-drill/audit.db`
      finishes without an error and prints the snapshot's integrity result and
      row count. (With a second argument the script restores to that path; the
      API does not need to be stopped.)
- [ ] The row count is close to the live one (`/status` shows it).
- [ ] The script reported "Report-seal key restored from …" — the copy beside
      the snapshots exists and can be put back.
- [ ] `ls -l ../backups/report-seal.key` shows `-rw-------`.
- [ ] `rm -rf ~/restore-drill` — it holds a copy of the database and the key.

Layer 2, in DigitalOcean:

- [ ] The droplet's Backups tab shows a backup from the last 24 hours.
- [ ] Create a **new** droplet from the newest backup (never restore over the
      live one for a drill).
- [ ] SSH to it by IP address. `pm2 status` shows both apps;
      `curl -s http://127.0.0.1:5103/api/health` answers.
- [ ] `sqlite3 ~/audit.icjia.app/file-accessibility-audit/apps/api/data/audit.db "SELECT MAX(created_at) FROM audit_log;"`
      is within a day of the backup time. (No `sqlite3` on the server? Open
      the drill droplet's `/status` through an SSH tunnel instead and read the
      audit counts.)
- [ ] **Destroy the drill droplet.** It holds a copy of the database and the
      privileged token.

| Date | Layer 1 | Layer 2 | Notes |
| --- | --- | --- | --- |
| 2026-08-05 | Passed (development database: 68 rows in, 68 rows out, stale `-wal` set aside) | Not drilled | First drill |
| | | | |

Retention note (documented in the public data-retention policy, v1.3): only
the `BACKUP_KEEP_COUNT` (5) newest snapshots are retained, so with nightly
runs a row purged by the 365-day retention sweep persists in snapshots for
roughly 5 further days. (DigitalOcean's droplet backups have their own
retention on DO's side, outside this repo's control.)

# Deploys

How the production server is updated, what happens when an update fails, and a
proposal for a safer layout that has **not** been adopted.

One server, one maintainer, deploys by hand over SSH. Pushing to `main` does
**not** deploy anything.

## The deploy, as it is today

```bash
ssh forge@audit.icjia.app
cd ~/audit.icjia.app/file-accessibility-audit
./rebuild.sh --check     # optional: preflight only, changes nothing
./rebuild.sh
```

Then, from any checkout: `pnpm prod-sentinels` (three uploads with known
answers, against the live site). GitHub runs the same check every Monday
(`.github/workflows/prod-sentinels.yml`), which catches a server that drifts
between deploys; it does not replace running it after a deploy.

`rebuild.sh` works **in the live checkout** — the same directory the running
site is served from. In order:

| Step | What it does | If it fails |
| --- | --- | --- |
| Preflight | node 22+, pnpm and pm2 are required; qpdf, Java and veraPDF are reported | Stops. Nothing has been changed. |
| Local edits | Lists uncommitted edits to tracked files, saves them as a patch in `~/deploy-logs/discarded-edits-<time>.patch`, then discards them | Stops if the patch cannot be saved. Nothing has been changed. |
| `git pull origin main` | Moves the source. If `rebuild.sh` itself changed, the script restarts itself | Stops. |
| `pnpm install --frozen-lockfile` | Relinks `node_modules` under the running site | Stops. Mixed state — the banner says what to do. |
| Build | Typechecks, then `nuxt build` rewrites `apps/web/.output`. The previous build is parked first | Stops; the parked build is put back. |
| Database snapshot | `scripts/backup-db.sh` into `backups/pre-deploy/` (newest 3 kept) | Stops. No restart without a snapshot unless `REBUILD_SKIP_DB_SNAPSHOT=1`. |
| PM2 restart | `pm2 restart ecosystem.config.cjs --update-env` (re-registers if the start command changed) | Stops; state uncertain; the banner names the snapshot. |
| Health gate | `http://127.0.0.1:5103/api/health` and `http://127.0.0.1:5102/healthz` must each answer 200 within 90 s | **Automatic rollback** — next section. |
| Smoke checks | Public URL, `/status`, `robots.txt`, veraPDF | Warnings only. The deploy has succeeded. |

Every run writes its full output to `~/deploy-logs/rebuild-<time>.log` (the
newest 30 are kept).

### Options

| Variable / flag | Effect |
| --- | --- |
| `--check` | Preflight only: tools and versions, local edits, last healthy commit, free disk. Pulls, installs, builds and restarts nothing; writes no log. |
| `ROLLBACK_ON_FAILURE=false` | Do not roll back when the health gate fails; end with the manual instructions, as the script did before 2026-11-24. |
| `REBUILD_DISCARD_WITHOUT_PATCH=1` | Discard local edits even if a patch of them could not be saved. |
| `REBUILD_SKIP_DB_SNAPSHOT=1` | Restart without a pre-deploy database snapshot. |
| `HEALTH_WAIT_SECONDS` | How long each health check may take (default 90). |
| `REMEDIATION_ENABLED=true\|false` | Skips the interactive question. |
| `REBUILD_LOG_DIR` | Where logs, patches and the last-healthy marker go (default `~/deploy-logs`). |

## Automatic rollback

If PM2 has restarted onto the new version and either process does not pass the
health gate, the script puts the previous version back by itself:

1. Copies the last PM2 log lines of the failed start into the deploy log.
2. `git reset --hard <the commit the run started from>`.
3. Puts the previous web build back in `apps/web/.output`. This is the copy
   parked before the build; it is kept until the health gate passes, so no
   rebuild is needed. (If no copy exists, the web app is rebuilt from the old
   commit.)
4. `pnpm install --frozen-lockfile` for the old lockfile.
5. Restarts PM2 the same way a deploy does.
6. Runs the same health gate again.

The script then **exits non-zero** with a banner that says the deploy failed
and was rolled back, and where the failed run's log is. A rolled-back deploy is
a failed deploy: Forge shows it red, and the site is up on the old version.

### What rollback does not do

- **It does not roll back the database.** Migrations only go forward, and an
  automatic restore could throw away audits recorded since the snapshot. If the
  failed version applied a migration before it stopped, the database is a step
  ahead of the code now running. The banner names the pre-deploy snapshot and
  the command: `pm2 stop file-audit-api`, then
  `./scripts/restore-db.sh <snapshot>`, then `pm2 start file-audit-api`.
- **It does not move `origin/main`.** The failed commit is still there, and the
  next `./rebuild.sh` pulls it again. Fix or revert it first.
- **It does not cover failures before the restart.** A failed install or build
  ends with the older banner (the parked web build is put back; the source is
  left at the new commit). A failed `pm2 restart` command also ends with manual
  instructions.

### When rollback is not attempted

The run ends with the manual instructions, and says which of these applied:

- `ROLLBACK_ON_FAILURE=false` was set.
- The run did not move the checkout to a new commit (a re-run on the same
  commit): there is no earlier version to return to.
- The commit the run started from is not the one recorded in
  `~/deploy-logs/last-healthy-commit`. That file is written each time a deploy
  passes its health gate. A mismatch means an earlier deploy failed and was left
  in place, so the parked web build and the starting commit may not belong
  together. (If the file does not exist yet — the first deploy with this script
  — the starting commit is trusted, and the output says so.)

### If the rollback itself fails

The banner reads "THE AUTOMATIC ROLLBACK DID NOT FINISH", names the step that
failed, and prints the manual steps:

```bash
pm2 status && pm2 logs --lines 80
git status && git log --oneline -1
git reset --hard <previous commit>        # printed in the banner
pnpm install --frozen-lockfile && pnpm build
pm2 restart ecosystem.config.cjs --update-env
```

### How this was checked

`rebuild.sh` cannot be run against production from a development machine. What
was done instead:

- `bash -n rebuild.sh`.
- A rehearsal in a throwaway git checkout with stand-ins for `pm2`, `pnpm` and
  `curl`: a healthy deploy; a new version that fails its health gate (rolled
  back, exit 1, previous build restored without a rebuild); a rollback whose
  install step fails; the opt-out; the last-healthy mismatch; no parked build
  (rebuilds); a failed web build; `--check`. One run used the **previous**
  `rebuild.sh` as the old commit, to prove the script survives `git reset`
  replacing its own file mid-run.
- Five of those run on every `pnpm test`, in
  `apps/api/src/__tests__/rebuildScript.test.ts`, with a text-level contract
  for the properties that are one edit away from disappearing.

**Not exercised:** real PM2 (re-registration during a rollback, `pm2 save`),
real `pnpm install` against two different lockfiles, a real `nuxt build`, real
migrations, Forge's deploy runner, and timing on the real server. `shellcheck`
was not available. The first production deploy that carries this change should
be made at a quiet time, by hand, with the terminal watched.

## Proposal: release directories (not adopted)

### The problem it solves

Between `git pull` and `pm2 restart` — several minutes — the running site and
the deploy share one directory:

- the API runs from source, and every Word, PowerPoint or Excel audit and
  every remediation job starts a new worker that loads **whatever is on disk at
  that moment**: new worker code under an old parent process;
- `pnpm install` relinks `node_modules` under both running processes;
- `nuxt build` rewrites `apps/web/.output` under the running web process.

Parking the previous build and rolling back automatically shorten the damage.
They do not remove the window.

### The layout

```
/home/forge/audit.icjia.app/
├── releases/
│   ├── 20261124T101500-<sha>/     a full checkout, installed and built
│   └── 20261120T090000-<sha>/     previous release, kept for rollback
├── current -> releases/20261124T101500-<sha>     symlink; PM2's cwd is under it
├── shared/
│   ├── data/                      audit.db, -wal, -shm, report-seal.key, remediation/
│   └── logs/                      activity export, error logs
└── backups/                       unchanged
```

A deploy builds a **new** directory while the old one keeps serving, then
switches the symlink and restarts PM2. Rollback is switching the symlink back
and restarting: seconds, no install, no build.

### Steps to adopt it

Each of these has to be done and checked **on the server** — which is why it
has not been done from the repository.

1. **Move state out of the checkout.** Three things live inside it today:
   `apps/api/data/` (the database with its `-wal`/`-shm` files,
   `report-seal.key`, and `remediation/` — the job outputs, whose location is
   `REMEDIATION.OUTPUT_DIR` in `audit.config.ts`, not an environment variable)
   and `logs/` at the checkout root. The simplest move needs no configuration
   change: stop the API, move both directories to `shared/`, and have the
   deploy script create two symlinks in every release
   (`apps/api/data -> ../../../../shared/data`, `logs -> ../../shared/logs`)
   before the restart. Start the API and check `/status`. Because the paths the
   code sees do not change, `scripts/backup-db.sh` and `scripts/restore-db.sh`
   keep working as they are.
2. **Check every path that is derived from the checkout's location.**
   `scripts/backup-db.sh` and `services/status.ts` both default the backup
   directory to "`backups/` beside the checkout". With releases one level
   deeper, that default moves. Set `BACKUP_DIR` explicitly for the Scheduler
   job and the API, and confirm the `/status` backup row still finds
   `last-backup.json`.
3. **Change the Forge Scheduler command** to
   `/home/forge/audit.icjia.app/current/scripts/backup-db.sh`.
4. **Re-register PM2 from `current/`.** PM2 stores the resolved working
   directory. `pm2 delete file-audit-api file-audit-web`, then
   `cd current && pm2 start ecosystem.config.cjs && pm2 save`. Confirm with
   `pm2 describe` that `exec cwd` contains `current`, not a release name —
   otherwise the next switch restarts the old release.
5. **Write the new deploy script**: clone or `git worktree add` into
   `releases/<stamp>-<sha>`, `pnpm install --frozen-lockfile`, `pnpm build`,
   snapshot the database, `ln -sfn` the new release to `current.tmp` and
   `mv -T current.tmp current` (atomic), `pm2 restart`, health gate; on failure
   switch back and restart. Keep the newest three releases.
6. **Point Forge's deploy script** at it, and check what Forge itself assumes
   about the site directory (its "Deploy Now" button, its nginx `root`).

### Risks

- **PM2 and symlinks.** If PM2 resolves `current` to the real path at
  registration, restarts keep using the old release. Step 4's check is the
  guard, and it has to be repeated after any `pm2 delete`.
- **Disk.** Each release is a full `node_modules` plus a build — several
  hundred MB. Three releases need the space; check `df -h` first. pnpm's
  content-addressed store keeps this lower than it looks, but not zero.
- **A forgotten symlink is silent.** A release started without the `data`
  symlink boots against an empty directory: the API creates a new, empty
  database and a new seal key and reports healthy. The deploy script must
  refuse to restart unless `apps/api/data` is a symlink into `shared/`.
- **Temp files** (a PDF's short-lived qpdf copy) live under the system temp
  directory, or `TMP_DIR` when set — outside the checkout, not affected.
- **In-flight work.** A remediation job running at the switch finishes on the
  old release's worker code, which is the right behaviour — but a release must
  not be deleted while one of its workers is alive. Keeping three releases
  covers this.
- **Migrations are still forward-only.** Release directories make code rollback
  instant; they do nothing for the database. The pre-deploy snapshot stays.
- **One-time cut-over.** Step 1 needs a short planned stop of the API.

### Recommendation

Adopt it only when a deploy-window failure has actually cost something, or when
the server is being rebuilt anyway (see `docs/runbook.md`) — a new server is
the cheap moment to start with this layout. Until then: deploy at a quiet time,
and rely on the health gate and the automatic rollback.

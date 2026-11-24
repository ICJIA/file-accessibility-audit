# Server runbook

Everything a new maintainer needs to run this service, and to rebuild its
server from nothing. The repository holds the application; this document is
the list of what lives **outside** it.

> **Read this note first.** This was written on 2026-11-24 from the
> repository: the code, the deploy script, and the other documents. It was
> **not** checked against the live server. Where it says "check on the server",
> nobody has yet. The first person to work through it on the real machine
> should correct it in place.
>
> It holds **names, never values.** No token, key or password belongs in this
> file or anywhere else in the repository.

Related: `docs/deploys.md` (deploy and rollback), `docs/database-backups.md`
(backups and restore), `docs/process-supervision.md` (PM2), `docs/releasing.md`.

## 1. What runs where

| Thing | Value |
| --- | --- |
| Host | One DigitalOcean droplet, Ubuntu 22.04, managed through Laravel Forge |
| User | `forge` |
| Site directory | `/home/forge/audit.icjia.app/` |
| Checkout | `/home/forge/audit.icjia.app/file-accessibility-audit/` |
| Database | `<checkout>/apps/api/data/audit.db` (SQLite, WAL mode) |
| Report-seal key | `<checkout>/apps/api/data/report-seal.key` (mode 0600) |
| Remediation job files | `<checkout>/apps/api/data/remediation/` (deleted 30 minutes after a job) |
| Activity + error logs | `<checkout>/logs/` |
| Database snapshots | `/home/forge/audit.icjia.app/backups/` and `backups/pre-deploy/` |
| Deploy logs, discarded-edit patches, last-healthy marker | `/home/forge/deploy-logs/` |
| PM2 logs | `/home/forge/.pm2/logs/` |
| Processes | `file-audit-api` on 127.0.0.1:5103 (768 MB cap), `file-audit-web` on 127.0.0.1:5102 (512 MB cap) |
| In front | nginx, TLS, `https://audit.icjia.app` |

Both processes listen on loopback only. Nothing but nginx is reachable from
outside.

## 2. Software to install

| Software | Version | Needed for | Check |
| --- | --- | --- | --- |
| Node.js | 22 or newer | Everything. `rebuild.sh` refuses older | `node --version` |
| pnpm | 10 | Install and build (the lockfile is written by pnpm 10) | `pnpm --version` |
| PM2 | current (7.x was in use, 2026-11) | Process supervision. `rebuild.sh` refuses to start without it | `pm2 --version` |
| pm2-logrotate | 3.x | Keeps PM2's logs from filling the disk — § 4 | `pm2 conf pm2-logrotate` |
| qpdf | 10 or newer (11+ advised) | Every PDF audit, and remediation | `qpdf --version` |
| Java (OpenJDK) | 17 or newer advised; 11 is the floor | PDF remediation (OpenDataLoader) and veraPDF | `java -version` |
| veraPDF | A current release. The parser handles the 1.26.x and 1.30.x output formats; **check on the server** which is installed and record it here | PDF/UA and WCAG machine checks on PDF reports. Optional: without it reports say "Did not run" | `/opt/verapdf/verapdf --version` |
| Chromium | The build puppeteer downloads during `pnpm install` | The web-page audit service (`/api/audit-url-page`) only | § 2.2 |
| git, curl, unzip | any | Deploys, smoke checks, installing veraPDF | |
| nginx | Forge's | Reverse proxy, TLS | `sudo nginx -t` |

```bash
sudo apt-get update
sudo apt-get install -y qpdf openjdk-17-jre-headless git curl unzip
npm install -g pnpm@10 pm2
```

Node 22 is installed through Forge (or NodeSource). **Not needed:** a database
server (SQLite is a file), a mail server (the app sends no email), Redis.

### 2.1 veraPDF

`./rebuild.sh --check` prints the exact install commands when veraPDF is
missing. In short: download the installer from
`https://software.verapdf.org/rel/verapdf-installer.zip`, run the izpack
installer in console mode into `/opt/verapdf`, then persist the path (§ 3).
The WCAG checks also need the profile file that ships in the repository at
`apps/api/resources/verapdf/WCAG-2-2-Machine.xml`.

### 2.2 Chromium

`pnpm install` runs puppeteer's install step, which downloads its own Chromium
into `/home/forge/.cache/puppeteer/`. To fetch it by hand:

```bash
cd ~/audit.icjia.app/file-accessibility-audit
pnpm --filter api exec puppeteer browsers install chrome
```

Chromium also needs system libraries a server image does not have. This is the
usual list from puppeteer's troubleshooting guide for Ubuntu — **check on the
server**, and correct it here:

```bash
sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 \
  libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 \
  libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
  libxrandr2 xdg-utils
```

To see what is missing: run `ldd` on the downloaded `chrome` binary and look
for "not found". The service starts Chromium with `--no-sandbox`
(`apps/api/src/services/pageAuditor.ts` explains why and what replaces it).

## 3. Environment variables

PM2 only sees variables that are in the environment when the processes are
registered or restarted. `/etc/environment` is read at **login**, so a value
added there does not reach a shell that is already open. `rebuild.sh` reads
`API_PRIVILEGED_TOKEN` from `/etc/environment` by name for that reason, and
restarts with `--update-env`.

### Set on the server (`/etc/environment`)

| Name | Secret? | Purpose |
| --- | --- | --- |
| `REMEDIATION_ENABLED` | No | `true` shows the PDF remediation feature. Read at **build** time by the web app and at run time by the API, so it must be set before `./rebuild.sh` |
| `REMEDIATION_VERAPDF_PATH` | No | Path to the `verapdf` launcher. `rebuild.sh` finds the usual locations for a deploy, but only this line makes it survive a reboot |
| `API_PRIVILEGED_TOKEN` | **Yes** | The fleet audit's service token: higher rate limits and audits of hosts outside the allowlist. Unset = the feature is off. Not a user account |

### Optional

| Name | Secret? | Purpose |
| --- | --- | --- |
| `REMEDIATION_JAVA_PATH` | No | Path to `java` if it is not on `PATH` |
| `QPDF_PATH` | No | Path to `qpdf` if it is not on `PATH` |
| `REPORT_SEAL_SECRET` | **Yes** | Replaces the generated `report-seal.key` file. Leave unset unless there is a reason |
| `ANALYZE_URL_ALLOWED_HOSTS` | No | Extra hosts the audit-by-URL endpoints may fetch from, comma-separated |
| `DB_PATH` | No | Database location. Default `./data/audit.db` under `apps/api` |
| `BACKUP_DIR` | No | Where snapshots go, and where `/status` looks for the last one. Default: `backups/` beside the checkout. If set, set it for **both** the Scheduler job and the API |
| `ACTIVITY_LOG_DIR` | No | Where the daily activity and error files go. Default: `logs/` in the checkout |
| `TMP_DIR` | No | Where a PDF's short-lived temporary copy is written. Default: a directory of the app's own under the system temp directory |
| `VERAPDF_WCAG_ENABLED` | No | `false` turns off the veraPDF WCAG second opinion |
| `DOCX_ENABLED`, `PPTX_ENABLED`, `XLSX_ENABLED` | No | `false` turns a format off |
| `WCAG_VERSION` | No | `2.2` displays WCAG 2.2 instead of 2.1 |
| `NUXT_API_INTERNAL_URL` | No | Where the web app's `/healthz` and `/status` reach the API. Default `http://127.0.0.1:5103` |

### Set by `ecosystem.config.cjs` — do not set by hand

`NODE_ENV=production`, `PORT` (5103 and 5102), `HOST=127.0.0.1` (web).

### Read by the deploy and backup scripts only

`ROLLBACK_ON_FAILURE`, `REBUILD_SKIP_DB_SNAPSHOT`, `REBUILD_SNAPSHOT_KEEP`,
`REBUILD_DISCARD_WITHOUT_PATCH`, `REBUILD_LOG_DIR`, `HEALTH_WAIT_SECONDS`,
`API_HEALTH_URL`, `WEB_HEALTH_URL`, `SMOKE_URL`, `BACKUP_KEEP_COUNT` — all
optional; see `docs/deploys.md` and `scripts/backup-db.sh`.

### No longer read

`JWT_SECRET`, `SMTP_*`, `MAILGUN_*`, `ADMIN_EMAILS`, `ALLOWED_DOMAINS`
(accounts and email were removed in v1.68.0) and `MAX_FILE_SIZE_MB` (the upload
limits are in `audit.config.ts`). If any is still in `/etc/environment`, it
does nothing and can be removed.

## 4. PM2

Full detail: `docs/process-supervision.md`.

```bash
cd ~/audit.icjia.app/file-accessibility-audit
pm2 start ecosystem.config.cjs
pm2 save                         # so a reboot brings them back
pm2 startup                      # prints one sudo command — run it once per server

pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:workerInterval 30
pm2 save
```

Changing a restart **option** in `ecosystem.config.cjs` (not an environment
value) needs `pm2 delete file-audit-api file-audit-web`, `pm2 start
ecosystem.config.cjs`, `pm2 save`. Always delete by name — other applications
may share this PM2.

## 5. Forge

| Setting | Value |
| --- | --- |
| Deploy script | `cd /home/forge/audit.icjia.app/file-accessibility-audit && ./rebuild.sh` — **check on the server** what the Forge deploy script actually contains |
| Quick deploy (deploy on push) | Expected to be off — deploys are run by hand. **Check on the server.** If it is on, every push to `main` deploys |
| Scheduler | One job: `/home/forge/audit.icjia.app/file-accessibility-audit/scripts/backup-db.sh`, user `forge`, nightly (`0 0 * * *`). No output redirect |
| nginx | Edited in Forge. Reference copy: `ops/nginx/audit.icjia.app.conf.example` |
| TLS | Let's Encrypt, renewed by Forge |

## 6. nginx

`ops/nginx/audit.icjia.app.conf.example` is a copy of the live configuration,
taken from `sudo nginx -T` on 2026-11-24. The live file is edited in Forge;
when it changes, update the copy. This site has `access_log off`; its error
log is kept. What must hold:

- `/api/` goes to `127.0.0.1:5103`; everything else to `127.0.0.1:5102`.
- In `location /api/`: `client_max_body_size` at least **60m** and
  `proxy_read_timeout` at least **180s**. Both have broken production when
  smaller, with nothing in the application logs.
- `X-Forwarded-For $proxy_add_x_forwarded_for` on both locations. The API
  trusts exactly one proxy and limits each caller by the address nginx
  appends. Without the header, every visitor shares one limit.
- HSTS.
- **No** `location = /robots.txt` or `location = /favicon.ico` block (Forge's
  default template adds them; they make both files 404).

## 7. Monitoring

| What | Where | Notes |
| --- | --- | --- |
| Uptime monitor | An external keyword monitor on `https://audit.icjia.app/status` | Alerts when the word **`degraded`** appears, and when the page does not answer. The account that owns the monitor is outside this repository — **record who holds it** |
| `/status` | Public | Engines, disk, last backup, load. `?format=json` for machines |
| `/healthz` | Public | Liveness of the web app and its view of the API |
| CI | GitHub Actions | Every push and pull request |

## 8. Building a server from nothing

1. Create the droplet (Ubuntu 22.04) and attach it to Forge. **Turn on
   DigitalOcean backups for it** — nothing in this repository can.
2. Install the software in § 2.
3. Create the Forge site `audit.icjia.app`; clone the repository into
   `/home/forge/audit.icjia.app/file-accessibility-audit`.
4. Add the § 3 variables to `/etc/environment`. Log out and back in.
5. `./rebuild.sh --check`. Fix every ERROR and read every WARNING.
6. First start: `pnpm install --frozen-lockfile && pnpm build`, then § 4.
7. Put the database back, if there is one to put back:
   `./scripts/restore-db.sh <snapshot>` (see `docs/database-backups.md`).
   With no snapshot the API starts with an empty database.
8. nginx (§ 6), TLS, DNS.
9. Add the Scheduler job (§ 5) and run it once by hand.
10. Point the uptime monitor at the new server if the address changed.
11. `./rebuild.sh` once, end to end, so the deploy path itself is known to
    work; then `pnpm prod-sentinels` from a development machine.

A new server is the cheap moment to adopt release directories — see the
proposal in `docs/deploys.md`.

## 9. Deploy, roll back, restore

| Task | Command | Detail |
| --- | --- | --- |
| Preflight | `./rebuild.sh --check` | Changes nothing |
| Deploy | `./rebuild.sh` | `docs/deploys.md` |
| After every deploy | `pnpm prod-sentinels` (from a development machine) | Three uploads with known answers. Each one adds a row to the production activity log |
| Every Monday, automatically | The same check, run by GitHub (`.github/workflows/prod-sentinels.yml`); it can also be started by hand from the Actions tab | A failure emails the repository's owner: the live site gave a different answer from the one that passed CI |
| Roll back the code | Automatic when the health gate fails. By hand: `git reset --hard <commit>`, `pnpm install --frozen-lockfile && pnpm build`, `pm2 restart ecosystem.config.cjs --update-env` | `docs/deploys.md` |
| Restore the database | `pm2 stop file-audit-api`, `./scripts/restore-db.sh <snapshot>`, `pm2 start file-audit-api` | `docs/database-backups.md` |
| Restore the whole server | DigitalOcean → droplet → Backups | `docs/database-backups.md` |

## 10. What to check when…

Start with these three, whatever the symptom:

```bash
pm2 status                       # are both online? is the restart count climbing?
curl -s http://127.0.0.1:5103/api/health
./logs.sh errors                 # today's application errors
```

### …the disk is full

Signs: `/status` reports `degraded` with low disk (below 10% free); uploads
fail; the nightly backup fails; a deploy stops at the snapshot step.

```bash
df -h /
du -sh ~/.pm2/logs ~/deploy-logs ~/audit.icjia.app/backups \
       ~/audit.icjia.app/file-accessibility-audit/logs \
       ~/audit.icjia.app/file-accessibility-audit/apps/api/data \
       ~/.cache/puppeteer /var/log/nginx 2>/dev/null
```

- `~/.pm2/logs` large: pm2-logrotate is missing or was not saved (§ 4).
- `apps/api/data/remediation` large: job files are not being deleted. Look in
  the error log for the sweep; restarting the API runs the sweep at once.
- `apps/api/data/*.pre-restore-*`: copies set aside by an earlier restore.
  Delete them once the restore is known to be good.
- `apps/web/node_modules/.cache/rebuild-*`: a parked web build left by an
  interrupted deploy. The next `./rebuild.sh` tidies it.
- `~/.cache/puppeteer`: old Chromium builds from earlier puppeteer versions.
  Only the version the current release uses is needed.
- Do **not** delete the newest database snapshot to make room.

### …the API keeps restarting on memory

Signs: the restart count for `file-audit-api` climbs; audits fail part-way;
`pm2 logs file-audit-api` shows restarts with no error before them.

```bash
pm2 describe file-audit-api | grep -E "restarts|memory|uptime"
pm2 monit
```

- The cap is 768 MB; the API idles near 240 MB. A restart during an audit loses
  that audit, and the visitor sees an error.
- One very large PDF can do it once. Several in a row means either unusual
  traffic (check `./logs.sh` for a batch of large files) or a leak (memory
  that grows while idle).
- PM2 gives up after 10 failed starts and marks the app **errored**. That is
  deliberate: `pm2 logs --lines 80`, fix the cause, then
  `pm2 restart ecosystem.config.cjs --update-env`.
- Raising the cap is a change to `ecosystem.config.cjs` (`API_MAX_MEMORY`) and
  needs the processes re-registered (§ 4). Check `free -m` first: the droplet
  must have the memory.

### …veraPDF or Java is missing

Signs: PDF reports show "PDF/UA-1 machine checks (veraPDF): Did not run";
`/status` shows the veraPDF engine as not ok; remediation jobs fail at once;
`rebuild.sh` ends with a veraPDF warning.

```bash
java -version
echo "$REMEDIATION_VERAPDF_PATH" && "$REMEDIATION_VERAPDF_PATH" --version
grep -E "^REMEDIATION_" /etc/environment
pm2 env $(pm2 id file-audit-api | tr -d '[] ') | grep REMEDIATION
```

- Works in the shell but not in the app: the running process has an old
  environment. `pm2 restart ecosystem.config.cjs --update-env`, from a shell
  that has the variable.
- Missing after a reboot: the path is not in `/etc/environment` (§ 3).
- Audits themselves keep working without either. Scores do not change: the
  veraPDF result is reported beside the grade, never part of it.

### …Chromium is failing

Signs: `/api/audit-url-page` returns errors; the fleet audit reports failed
page audits; document audits are **not** affected.

```bash
./logs.sh errors | grep -i -E "chrom|puppeteer|browser" | tail -20
ls ~/.cache/puppeteer/chrome/
cd ~/audit.icjia.app/file-accessibility-audit
pnpm --filter api exec puppeteer browsers install chrome
```

- "Could not find Chrome": the download is missing — the last command above.
  This follows a puppeteer upgrade when `pnpm install` skipped its install
  step.
- "error while loading shared libraries": a system library is missing (§ 2.2).
- Timeouts on every page: check memory (`free -m`) — Chromium needs a few
  hundred MB beside the API.

### …one agency says it is being rate-limited

Signs: people in one office see "Too many requests" while others do not.

Why it happens: limits are per caller address, and an office behind one
gateway is one address. The limits (in `audit.config.ts`, `RATE_LIMITS`): 100
requests a minute overall, 500 audits an hour, 10 saved reports an hour, 100
remediation jobs a day.

```bash
./logs.sh errors | grep "rate-limit" | tail -40
# or: grep "rate-limit" ~/.pm2/logs/file-audit-api-error*.log | tail -40
```

Each line names the limiter, the path and the limit. It **never names the
caller** — the service keeps no address on disk, by policy — so the log shows
which limit is being reached, not who reached it.

- `limiter=global` on `/api/health` or other light paths, for everyone at once:
  nginx is not forwarding `X-Forwarded-For` and the whole site shares one
  bucket (§ 6). This is a configuration fault, not traffic.
- `auth=invalid` or `auth=unconfigured`: an automated client is sending a token
  the server does not accept, so it runs at the public limits. Fix the token
  on the client, or set `API_PRIVILEGED_TOKEN` and restart with `--update-env`.
- An office that really does audit hundreds of files an hour: the limits are
  marked SAFE TO CHANGE in `audit.config.ts`. Raising one is a release and a
  deploy, and it raises it for everyone. Limits reset when the API restarts.
- The privileged token is for the fleet audit. Giving it to an office removes
  the host allowlist for them as well — that is the owner's decision, not a
  routine fix.

# Process supervision (PM2)

Both processes run under PM2 from `ecosystem.config.cjs`, restarted by
`rebuild.sh` on every deploy. This covers the two things the config alone
cannot do: the restart policy's reasoning, and log rotation, which is a
server-side PM2 module rather than repo configuration.

## Restart policy

Set in `ecosystem.config.cjs` as `restartPolicy`, shared by both apps:

| Setting | Value | Why |
| --- | --- | --- |
| `max_restarts` | 10 | Consecutive failed restarts before PM2 gives up |
| `min_uptime` | 20000 | A process must stay up 20s to count as a successful start |
| `restart_delay` | 3000 | Base delay between attempts |
| `exp_backoff_restart_delay` | 100 | Spreads retries out instead of hammering |
| `max_memory_restart` | 512M | Restart on runaway memory |
| `time` / `merge_logs` | true | Timestamped, single log stream per app — what rotation acts on |

**`max_restarts` + `min_uptime` are the pair that matters, and they were both
missing until v1.59.3.** Without them PM2 restarts a process that dies
instantly, for ever. A bad deploy or a missing binary becomes a silent hot
loop: CPU burns, the log disk fills, and `pm2 status` shows the app "online"
in the moments between crashes, so nothing looks wrong. With them, a process
that cannot stay up for 20 seconds ten times running is marked **errored** and
left down — which `/status` reports and a human can be paged about.

Failing visibly beats failing invisibly. That is the whole point of the
setting: it converts an indefinite, quiet failure into a loud, terminal one.

Exponential backoff is what keeps that from being trigger-happy. A dependency
that is merely slow to return (the database after a host reboot) still gets
recovered automatically, because the retries spread out across the window
rather than being spent in the first second.

**Changing these options requires re-registering the process — a redeploy is
not enough.** `pm2 restart ecosystem.config.cjs --update-env` (what
`rebuild.sh` runs) re-reads the file for *environment* only; changed restart
*options* are silently ignored for a process PM2 already knows. Proved on
production 2026-08-08: twenty deploys after v1.59.3 added
`max_restarts`/`min_uptime`, `pm2 prettylist` still showed neither. After
editing any option in `ecosystem.config.cjs`:

```bash
# required env must be exported in this shell — delete drops the old env
pm2 delete file-audit-api file-audit-web
pm2 start ecosystem.config.cjs
pm2 save        # persist, so resurrection after a reboot keeps the options
```

**To verify after a deploy:**

```bash
pm2 describe file-audit-api | grep -E "max restarts|min uptime|restarts"
pm2 status                      # both apps "online", restart count stable
```

A climbing restart count on a healthy-looking `pm2 status` is the exact
symptom this policy exists to make impossible.

## Log rotation

`pm2-logrotate` is a **PM2 module installed on the server**, not repo
configuration — nothing in this repository can enable it, and it does not
survive a fresh server unless it is installed there. Without it PM2's logs
grow without bound; a full disk then takes down uploads and the nightly
backup together, which is exactly the failure the disk-space probe on
`/status` now watches for.

Install once per server, as the `forge` user:

```bash
pm2 install pm2-logrotate

pm2 set pm2-logrotate:max_size 10M          # rotate at 10 MB
pm2 set pm2-logrotate:retain 14             # keep 14 rotated files per stream
pm2 set pm2-logrotate:compress true         # INEFFECTIVE in 3.0.0 — see below
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # also rotate nightly
pm2 set pm2-logrotate:workerInterval 30     # check every 30 seconds (the module default)

pm2 save
```

**Verify:**

```bash
pm2 conf pm2-logrotate                      # shows the values above
ls -lh ~/.pm2/logs/                         # rotated files appear as *__YYYY-MM-DD_HH-mm-ss.log
```

`pm2 save` matters: without it the module list is not written to the
resurrect file, and a server reboot brings PM2 back without rotation.

**Compression does not happen, despite `compress true`.** Verified on production
2026-08-22: every rotated file is plain `.log`. The cause is upstream, in
`pm2-logrotate` 3.0.0: the module's `parseBool` accepts only the *string*
`'true'`, but pmx casts the value stored by `pm2 set` to a boolean before the
module reads it, so `COMPRESSION` is always `false`. The setting is left in
place for whenever upstream fixes it; until then do not expect `.gz` files,
and do not "fix" it locally — the retention count is what bounds the disk.

The retention above therefore keeps up to **140 MB per log stream**
(14 × 10 MB, uncompressed) in the worst case, which is deliberate — enough
history to investigate an incident from a few days ago, bounded enough that
logs can never be what fills the disk. In practice the whole directory was
3.9 MB after two weeks. Application-level activity — what was audited, by
which path, with what result — is not in these logs at all; it is the
`audit_log` table and the daily activity export (`docs/activity-export.md`). Since v1.88.0 the
service also tees its own stderr into `logs/errors-YYYY-MM-DD.log` at the checkout root (30
days, 50 MB/day cap), so a fault can be diagnosed without opening `~/.pm2/logs` at all.

## Related

- `rebuild.sh` — the deploy script; runs `pm2 restart ecosystem.config.cjs --update-env`
- `docs/database-backups.md` — the nightly backup, which shares the disk this protects
- `/status` — reports free disk space, and marks the service degraded before the disk is full

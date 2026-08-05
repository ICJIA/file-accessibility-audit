#!/usr/bin/env bash
# Nightly SQLite backup — cron/Forge-Scheduler entry point.
#
#   Forge Scheduler command:  /home/forge/audit.icjia.app/scripts/backup-db.sh
#   Frequency: nightly (e.g. custom cron `0 8 * * *` ≈ 2–3am America/Chicago
#   on a UTC server). Runs as the `forge` user.
#
# The real work is apps/api/scripts/backup-db.mjs (SQLite online backup —
# WAL-safe, integrity-checked, self-rotating; see its header and
# apps/api/src/__tests__/backup.test.ts). This wrapper exists because cron's
# PATH is minimal: it resolves the repo from its own location (never cwd),
# finds node explicitly, and pins the working directory to apps/api so a
# relative DB_PATH resolves exactly as it does under PM2.
#
# Environment (optional):
#   BACKUP_DIR         destination directory (default: $HOME/backups/audit-db,
#                      deliberately OUTSIDE the git working tree so a
#                      `git clean -xdf` cannot touch it)
#   BACKUP_KEEP_COUNT  how many snapshots to retain (default: 5 — the newest
#                      five are kept, older ones deleted; disk use stays
#                      bounded, and the DO droplet's own backups cover
#                      anything older)
#   DB_PATH            source DB override (same semantics as the API)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$REPO_DIR/apps/api"
DEST="${BACKUP_DIR:-$HOME/backups/audit-db}"
KEEP="${BACKUP_KEEP_COUNT:-5}"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  for candidate in /usr/local/bin/node /usr/bin/node "$HOME/.nvm/current/bin/node"; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "backup-db.sh: node not found on PATH or in standard locations" >&2
  exit 1
fi

cd "$API_DIR"
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup-db: starting (dest=$DEST keep=$KEEP snapshots)"
"$NODE_BIN" "$API_DIR/scripts/backup-db.mjs" --dest "$DEST" --keep "$KEEP"
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup-db: done"

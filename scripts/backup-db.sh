#!/usr/bin/env bash
# Nightly SQLite backup — cron/Forge-Scheduler entry point.
#
#   Forge Scheduler command (exactly this, no redirect — Forge captures the
#   job's output itself, and the /status page + last-backup.json carry the
#   durable record):
#
#     /home/forge/audit.icjia.app/file-accessibility-audit/scripts/backup-db.sh
#
#   Frequency: nightly. Runs as the `forge` user.
#
# The real work is apps/api/scripts/backup-db.mjs (SQLite online backup —
# WAL-safe, integrity-checked, self-rotating; see its header and
# apps/api/src/__tests__/backup.test.ts). This wrapper exists because cron's
# PATH is minimal: it resolves the repo from its own location (never cwd),
# finds node explicitly, and pins the working directory to apps/api so a
# relative DB_PATH resolves exactly as it does under PM2.
#
# Environment (optional):
#   BACKUP_DIR         destination directory. Default: a `backups/` directory
#                      BESIDE the repository checkout (on the server:
#                      /home/forge/audit.icjia.app/backups) — easy to find in
#                      the site folder, but outside the git working tree so a
#                      `git clean -xdf` cannot delete the backups together
#                      with the database, and outside any web root.
#                      services/status.ts derives the same default for the
#                      /status backup row; change one, change both.
#   BACKUP_KEEP_COUNT  how many snapshots to retain (default: 5 — the newest
#                      five are kept, older ones deleted; disk use stays
#                      bounded, and the DO droplet's own backups cover
#                      anything older)
#   DB_PATH            source DB override (same semantics as the API)
#
# Besides the database snapshot, one copy of the report-seal key is kept in
# the same directory (see the note above that step, below).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$REPO_DIR/apps/api"
DEST="${BACKUP_DIR:-$(dirname "$REPO_DIR")/backups}"
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

# The report-seal key (2026-11-24). apps/api/src/services/reportSeal.ts keeps
# a 32-byte secret in `report-seal.key` beside the database; every audit
# result is sealed with it, and POST /api/reports refuses a result whose seal
# does not verify. The snapshot above is the database and nothing else, so a
# restore onto a new disk came back without the key: the API then made a new
# one, and every result issued before that (an audit still open in someone's
# browser) could no longer be saved — "run the audit again". Reports already
# saved are not affected; the seal is checked only when a report is saved.
#
# One copy is kept beside the snapshots, mode 0600, replaced on each run (the
# key does not change, so it is not rotated). It is a server-only secret and
# is NOT part of a snapshot file. Nothing is copied when the deployment
# supplies REPORT_SEAL_SECRET instead of a key file. A failed copy is a
# warning, never a failed backup: the database snapshot above already
# succeeded and must be reported as such.
#
# Every line printed here starts with "[" — rebuild.sh reads this script's
# output for the JSON line the core prints, which starts with "{".
case "${DB_PATH:-}" in
  "") DATA_DIR="$API_DIR/data" ;;
  /*) DATA_DIR="$(dirname "$DB_PATH")" ;;
  *) DATA_DIR="$(dirname "$API_DIR/$DB_PATH")" ;;
esac
SEAL_KEY="$DATA_DIR/report-seal.key"
if [ -f "$SEAL_KEY" ]; then
  if (umask 077 && cp "$SEAL_KEY" "$DEST/report-seal.key.tmp" && chmod 600 "$DEST/report-seal.key.tmp" && mv -f "$DEST/report-seal.key.tmp" "$DEST/report-seal.key"); then
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup-db: report-seal key copied beside the snapshots (mode 0600)"
  else
    rm -f "$DEST/report-seal.key.tmp" 2>/dev/null || true
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup-db: WARNING — could not copy the report-seal key to $DEST" >&2
  fi
fi
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup-db: done"

#!/usr/bin/env bash
# Restore a snapshot produced by backup-db.sh.
#
#   Usage: restore-db.sh <snapshot.db.gz> [target-db-path]
#
# Default target is apps/api/data/audit.db (or $DB_PATH, resolved against
# apps/api — the same semantics as the API and the backup).
#
# STOP THE API FIRST:  pm2 stop file-audit-api
# The script refuses nothing on its own — SQLite has no cross-process lock
# it can take here — so stopping the writer is on the operator. Every step
# is non-destructive: the current database (and its -wal/-shm) is moved
# aside as <target>.pre-restore-<timestamp>*, never deleted.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$REPO_DIR/apps/api"

if [ $# -lt 1 ]; then
  echo "usage: restore-db.sh <snapshot.db.gz> [target-db-path]" >&2
  exit 1
fi
SNAPSHOT="$1"
TARGET="${2:-}"
if [ -z "$TARGET" ]; then
  if [ -n "${DB_PATH:-}" ]; then
    case "$DB_PATH" in
      /*) TARGET="$DB_PATH" ;;
      *) TARGET="$API_DIR/$DB_PATH" ;;
    esac
  else
    TARGET="$API_DIR/data/audit.db"
  fi
fi

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
  echo "restore-db.sh: node not found" >&2
  exit 1
fi

echo "==> Verifying snapshot before touching anything: $SNAPSHOT"
"$NODE_BIN" "$API_DIR/scripts/backup-db.mjs" --verify "$SNAPSHOT"

STAMP="$(date -u '+%Y%m%d-%H%M%S')"
TMP_RESTORE="$TARGET.restore-tmp"
gunzip -c "$SNAPSHOT" >"$TMP_RESTORE"

# Move the current database aside — including its WAL and SHM. Leaving a
# stale -wal next to a freshly restored main file corrupts the restore the
# moment SQLite opens it; they must travel together or not at all.
if [ -e "$TARGET" ]; then
  echo "==> Setting aside current database as $TARGET.pre-restore-$STAMP"
  mv "$TARGET" "$TARGET.pre-restore-$STAMP"
fi
for suffix in -wal -shm; do
  if [ -e "$TARGET$suffix" ]; then
    mv "$TARGET$suffix" "$TARGET.pre-restore-$STAMP$suffix"
  fi
done

mv "$TMP_RESTORE" "$TARGET"
echo "==> Restored $SNAPSHOT -> $TARGET"

# The report-seal key (see scripts/backup-db.sh). It lives beside the database
# and is copied beside the snapshots. If the database directory has NO key —
# a restore onto a new disk — and the snapshot's directory holds the copy, put
# it back, so results issued before the loss can still be saved. An existing
# key is never replaced: it is the one the running service has been sealing
# with.
KEY_TARGET="$(dirname "$TARGET")/report-seal.key"
KEY_BACKUP="$(dirname "$SNAPSHOT")/report-seal.key"
# A pre-deploy snapshot lives one level down (backups/pre-deploy/); the nightly
# copy of the key, if that directory has none, is in its parent.
if [ ! -f "$KEY_BACKUP" ] && [ -f "$(dirname "$(dirname "$SNAPSHOT")")/report-seal.key" ]; then
  KEY_BACKUP="$(dirname "$(dirname "$SNAPSHOT")")/report-seal.key"
fi
if [ -f "$KEY_TARGET" ]; then
  echo "==> Report-seal key already present beside the database; left as it is"
elif [ -f "$KEY_BACKUP" ]; then
  (umask 077 && cp "$KEY_BACKUP" "$KEY_TARGET" && chmod 600 "$KEY_TARGET")
  echo "==> Report-seal key restored from $KEY_BACKUP (mode 0600)"
else
  echo "==> No report-seal key beside the database and none beside the snapshot."
  echo "    The API will create a new one when it starts. Saved reports are not"
  echo "    affected; an audit result still open in a browser from before this"
  echo "    restore can no longer be saved — it has to be run again."
fi
echo "==> Next: pm2 start file-audit-api   (then check /status and spot-check history)"
echo "==> The previous database is preserved at $TARGET.pre-restore-$STAMP"

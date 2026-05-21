#!/usr/bin/env bash
#
# clear-fleet-data.sh — wipe scoring-dependent rows for a clean re-audit.
#
# When the scoring methodology changes (e.g. the v1.22.0 reweight + WCAG
# conformance gate), stored audit results from the old methodology are no
# longer comparable to new ones. This script clears the two tables that
# hold that data so the fleet can be re-audited from a clean slate:
#
#     audit_log        — per-document audit history
#     shared_reports   — saved / shared report JSON
#
# It does NOT touch otp_codes, access_tokens, remediation_jobs, or
# remediation_events (the long-retention remediation compliance trail).
#
# The database is backed up before anything is deleted.
#
# Run order on the production server. The clear itself is version-agnostic
# (audit_log / shared_reports are unchanged across versions); the only hard
# rule is that the fleet RE-AUDIT runs on the deployed new build:
#     git pull                              fetch the new code + this script
#     bash scripts/clear-fleet-data.sh      this script (clear stale rows)
#     ./rebuild.sh                          build + restart on the new code
#     re-run the full fleet audit           produces fresh, current scores
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="${DB_PATH:-$REPO_ROOT/apps/api/data/audit.db}"
API_PROC="file-audit-api"
BACKUP="${DB}.bak-$(date +%Y%m%d-%H%M%S)"

echo "clear-fleet-data — stale audit/report wipe"
echo "  database: $DB"
echo "  backup:   $BACKUP"
echo

# --- preflight checks -------------------------------------------------------
command -v sqlite3 >/dev/null 2>&1 || {
  echo "ERROR: the 'sqlite3' CLI is not installed."
  echo "       sudo apt-get update && sudo apt-get install -y sqlite3"
  exit 1
}
command -v pm2 >/dev/null 2>&1 || { echo "ERROR: 'pm2' not found on PATH."; exit 1; }
pm2 describe "$API_PROC" >/dev/null 2>&1 || {
  echo "ERROR: pm2 process '$API_PROC' not found. Check 'pm2 list'."
  exit 1
}
[ -f "$DB" ] || {
  echo "ERROR: database not found at: $DB"
  echo "       If production uses a custom DB_PATH, run:"
  echo "       DB_PATH=/path/to/audit.db bash $0"
  exit 1
}

# --- show what will be cleared ---------------------------------------------
before_audit="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM audit_log;')"
before_reports="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM shared_reports;')"
echo "Rows to be DELETED:"
echo "  audit_log:       $before_audit"
echo "  shared_reports:  $before_reports"
echo "Left untouched:    otp_codes, access_tokens, remediation_jobs, remediation_events"
echo
read -r -p "Back up the database and clear those two tables? Type 'yes' to proceed: " reply
[ "$reply" = "yes" ] || { echo "Aborted — nothing changed."; exit 0; }

# --- back up first ----------------------------------------------------------
echo
echo "==> Backing up the database..."
sqlite3 "$DB" ".backup '$BACKUP'"
[ -s "$BACKUP" ] || {
  echo "ERROR: backup file is missing or empty — aborting, nothing deleted."
  exit 1
}
# Prove the backup is a sound, restorable SQLite database before we touch
# the live one: a full integrity check, plus a read of both target tables.
integrity="$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;' 2>&1 || true)"
if [ "$integrity" != "ok" ]; then
  echo "ERROR: backup failed its integrity check — aborting, nothing deleted."
  echo "       sqlite3 reported: $integrity"
  exit 1
fi
sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM audit_log; SELECT COUNT(*) FROM shared_reports;' >/dev/null 2>&1 || {
  echo "ERROR: backup is unreadable or missing a table — aborting, nothing deleted."
  exit 1
}
echo "    backup OK — $(du -h "$BACKUP" | cut -f1), integrity check passed"

# --- stop the API, clear the tables, restart -------------------------------
echo "==> Stopping $API_PROC (quiesce the database)..."
pm2 stop "$API_PROC"
# If anything below fails, still bring the API back up.
trap 'echo "==> Restarting $API_PROC after an error..."; pm2 start "$API_PROC" >/dev/null 2>&1 || true' EXIT

echo "==> Clearing audit_log + shared_reports, then VACUUM..."
# busy_timeout: if a detached remediation worker happens to hold a write
# lock, wait for it rather than failing VACUUM with "database is locked".
sqlite3 "$DB" "PRAGMA busy_timeout = 10000;
               DELETE FROM audit_log;
               DELETE FROM shared_reports;
               VACUUM;"

echo "==> Restarting $API_PROC..."
pm2 start "$API_PROC"
trap - EXIT

# --- verify -----------------------------------------------------------------
after_audit="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM audit_log;')"
after_reports="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM shared_reports;')"
echo
echo "==> Done.  audit_log: $after_audit   shared_reports: $after_reports"

if [ "$after_audit" != "0" ] || [ "$after_reports" != "0" ]; then
  echo "WARNING: a table is not empty — investigate before re-auditing."
  exit 1
fi

echo
echo "Both tables cleared. Backup retained at:"
echo "  $BACKUP"
echo
echo "  - Re-run the full fleet audit against the production API now."
echo "  - Once the re-audit looks good, delete the backup:"
echo "        rm '$BACKUP'"
echo "  - To roll back instead:"
echo "        pm2 stop $API_PROC && cp '$BACKUP' '$DB' && pm2 start $API_PROC"

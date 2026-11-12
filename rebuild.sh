#!/bin/bash
set -e

# Absolute path of this script, resolved ONCE, before anything can change the
# working directory. The self re-exec after `git pull` used to run
# `bash "$0"`: started as `bash "repo dir/rebuild.sh"` from the parent
# directory, "$0" was relative to a directory this script had already left,
# and the re-exec died with "No such file" (exit 127) after the pull had
# moved HEAD.
_self_dir="$(cd "$(dirname "$0")" && pwd)"
_self="$_self_dir/$(basename "$0")"
cd "$_self_dir"

# ---------------------------------------------------------------------
# Deploy log.
#
# 2026-08-18: a deploy died inside `nuxt build` and the only copy of the
# error scrolled away in the operator's terminal — this script logged
# nothing, so the root cause is unknowable. Every run now tees its full
# output to a timestamped file OUTSIDE the checkout (a log inside it
# would dirty the working tree that `git checkout -- .` resets).
#
# The tee starts ONLY in the process that created the log file. The
# re-exec below preserves open fds, so the second half's output already
# flows through the first half's tee — starting another would chain two
# tees onto the same file and double-write every line (verified in a
# harness before this shipped). The path rides the same env-var pattern
# as REBUILD_PRE_PULL_SHA so the guard survives the re-exec.
# ---------------------------------------------------------------------
if [ -z "${REBUILD_LOG_FILE:-}" ]; then
  _log_dir="${REBUILD_LOG_DIR:-$HOME/deploy-logs}"
  mkdir -p "$_log_dir"
  export REBUILD_LOG_FILE="$_log_dir/rebuild-$(date +%Y%m%dT%H%M%S).log"
  # Keep the newest 30 logs; prune older ones so the directory stays small.
  ls -1t "$_log_dir"/rebuild-*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
  exec > >(tee -a "$REBUILD_LOG_FILE") 2>&1
  echo "Full deploy log: $REBUILD_LOG_FILE"
fi

# ---------------------------------------------------------------------
# Failure banner.
#
# set -e above aborts this script on the first failed command, so a
# broken build can never reach the pm2 restart at the bottom. That
# abort is easy to miss under a wall of compiler output, though — so
# this EXIT trap spells out what happened: whether PM2 was touched,
# and (once git pull has moved HEAD) how to put the source tree back.
#
# The trap prints, and does exactly ONE repair: if a web build was under way
# it puts the parked previous build back in apps/web/.output (see
# _restore_parked_output). It never touches git, node_modules, the database
# or PM2.
#
# INT and TERM are trapped too. Untrapped, a SIGTERM during the build killed
# this script with no banner (exit 143), left the build running as an orphan,
# and left apps/web/.output half-written under the running web process.
#
# 2026-11-12: the banner used to say "the previously deployed version is
# still running" for every failure before the PM2 restart. That is only true
# of the two PM2 parent processes. This deploy works IN the live checkout
# (see "RESIDUAL RISK" above the git pull), so once the pull, the install or
# the build has started, what those processes read from disk is no longer
# the version they were started from. The banner now says which of the two
# situations the operator is in, and what to do about it.
# ---------------------------------------------------------------------
_stage="preflight"
# After the self re-exec HEAD has ALREADY moved, so the commit that was
# deployed before this run can only come from the first half of the run.
# Seeded here — not after the second `git pull` — so a failure anywhere in
# between still knows the checkout changed.
_pre_pull_sha=""
if [ -n "${REBUILD_REEXECED:-}" ] && [ -n "${REBUILD_PRE_PULL_SHA:-}" ]; then
  _pre_pull_sha="$REBUILD_PRE_PULL_SHA"
fi
# Set once the pre-restart database snapshot has been written; printed by
# the failure banners so a restore never starts with "which file?".
_predeploy_snapshot=""
# Where the previous web build is parked while `nuxt build` rewrites
# apps/web/.output (see the build step).
_prev_output_dir="apps/web/node_modules/.cache/rebuild-previous-output"
# 0 = nothing to say, 1 = previous build put back, 2 = .output was never
# touched (the parked copy was identical and was simply dropped).
_output_restored=0
# pid of the long-running command started by _run, while it is running.
_child_pid=""

# Put the parked web build back. The parked directory only ever exists as a
# COMPLETE copy (it is copied under a .tmp name and renamed), and only while
# a web build is in flight or was interrupted — so whenever it exists it is
# the last known-good build. If apps/web/.output is still identical to it,
# nothing was overwritten and the live directory is left exactly as it is.
_restore_parked_output() {
  [ -d "$_prev_output_dir" ] || return 0
  if [ -d apps/web/.output ] && diff -rq "$_prev_output_dir" apps/web/.output > /dev/null 2>&1; then
    rm -rf "$_prev_output_dir"
    _output_restored=2
    return 0
  fi
  rm -rf apps/web/.output
  if mv "$_prev_output_dir" apps/web/.output; then
    _output_restored=1
  fi
}

# Kill a process and everything it started (pnpm → node → workers).
_kill_tree() {
  for _kid in $(pgrep -P "$1" 2>/dev/null || true); do
    _kill_tree "$_kid"
  done
  kill -TERM "$1" 2>/dev/null || true
}

# Run a long command so that a signal can interrupt it. bash does not run a
# trap while a FOREGROUND command is still going — it would sit through the
# rest of the build first — but `wait` returns at once.
_run() {
  "$@" &
  _child_pid=$!
  _run_rc=0
  wait "$_child_pid" || _run_rc=$?
  _child_pid=""
  return "$_run_rc"
}

# INT / TERM: stop whatever _run started, wait until it is really gone (it
# must not keep writing into .output after the previous build is put back),
# then leave through the EXIT trap, which restores and prints the banner.
_on_signal() {
  trap '' INT TERM
  _interrupted_by="$1"
  if [ -n "$_child_pid" ]; then
    _kill_tree "$_child_pid"
    wait "$_child_pid" 2>/dev/null || true
    _child_pid=""
  fi
  exit "$2"
}
# How to get the database back. Printed whenever the new version has been
# started (or may have been) and is not known to be healthy.
_print_restore_hint() {
  echo ""
  if [ -n "$_predeploy_snapshot" ]; then
    echo "  Database snapshot taken just before this restart:"
    echo "      $_predeploy_snapshot"
    echo "  To go back to it (the current database is moved aside, not deleted):"
    echo "      pm2 stop file-audit-api"
    echo "      ./scripts/restore-db.sh \"$_predeploy_snapshot\""
  else
    echo "  No pre-restart database snapshot was taken on this run (first"
    echo "  deploy, or REBUILD_SKIP_DB_SNAPSHOT was set). The nightly snapshots,"
    echo "  if any, are in the backups/ directory beside this checkout; restore"
    echo "  one with ./scripts/restore-db.sh after  pm2 stop file-audit-api"
  fi
  if [ -n "$_pre_pull_sha" ]; then
    echo "  Then put the previous code back and start it:"
    echo "      git reset --hard $_pre_pull_sha"
    echo "      pnpm install --frozen-lockfile && pnpm build"
    echo "      pm2 restart ecosystem.config.cjs --update-env"
  fi
}

# The checkout has been changed but PM2 has not been restarted. $1 = HEAD now.
_print_skew_notice() {
  echo "  PM2 was NOT restarted, so the two long-running processes are still"
  echo "  the previously deployed ones — but the files under them have ALREADY"
  echo "  CHANGED, and they are not isolated from that:"
  if [ -n "$_pre_pull_sha" ] && [ -n "$1" ] && [ "$1" != "$_pre_pull_sha" ]; then
    echo "    - source is now at ${1:0:12} (was ${_pre_pull_sha:0:12}). The API runs"
  else
    echo "    - the source tree was re-installed/re-built in place. The API runs"
  fi
  echo "      from source: every Word/PowerPoint/Excel audit and every"
  echo "      remediation job starts a NEW worker that loads the code on disk"
  echo "      now, and any PM2 auto-restart (crash, memory limit, reboot) boots"
  echo "      it entirely."
  case "$_stage" in
    pnpm-install)
      echo "    - node_modules may be HALF-INSTALLED (the install is what failed)."
      ;;
    build-analyzer|build-api-typecheck)
      echo "    - the web build had not started: apps/web/.output is untouched."
      ;;
    build-web|build)
      if [ "$_output_restored" -eq 1 ]; then
        echo "    - the web build did not finish; the PREVIOUS apps/web/.output was"
        echo "      put back, so the running web process still has a complete build."
      elif [ "$_output_restored" -eq 2 ]; then
        echo "    - apps/web/.output had not been changed yet and was left as it was."
      elif [ -d "$_prev_output_dir" ]; then
        echo "    - apps/web/.output may be INCOMPLETE and could not be put back"
        echo "      automatically. The previous build is parked at"
        echo "      $_prev_output_dir —"
        echo "      rm -rf apps/web/.output && mv \"$_prev_output_dir\" apps/web/.output"
      else
        echo "    - apps/web/.output may be INCOMPLETE (no copy of the previous"
        echo "      build could be kept)."
      fi
      ;;
  esac
  echo ""
  echo "  This is a mixed state. Do one of these now — do not leave it:"
  echo "    a) fix the cause (see the error above) and re-run ./rebuild.sh, or"
  if [ -n "$_pre_pull_sha" ]; then
    echo "    b) put the last deployed version back, then restart onto it:"
    echo "         git reset --hard $_pre_pull_sha"
    echo "         pnpm install --frozen-lockfile && pnpm build"
    echo "         pm2 restart ecosystem.config.cjs --update-env"
  else
    echo "    b) check out the last deployed commit, then:"
    echo "         pnpm install --frozen-lockfile && pnpm build"
    echo "         pm2 restart ecosystem.config.cjs --update-env"
  fi
}

_on_exit() {
  _status=$?
  set +e  # a failure inside the banner must not truncate the banner
  if [ "$_status" -eq 0 ]; then
    exit 0
  fi
  # Before PM2 is restarted, a parked build means the web build did not
  # finish: put it back. (After the restart the new build is the live one.)
  case "$_stage" in
    pm2-restart|pm2-restarted|unhealthy|healthy) ;;
    *) _restore_parked_output ;;
  esac
  echo ""
  echo "======================================================================"
  if [ -n "${_interrupted_by:-}" ]; then
    echo "  INTERRUPTED by SIG${_interrupted_by} — the command that was running was stopped."
  fi
  case "$_stage" in
    pm2-restart)
      echo "  DEPLOY FAILED during PM2 restart (exit $_status)."
      echo "  Process state is uncertain — inspect it with:"
      echo "      pm2 status && pm2 logs --lines 50"
      _print_restore_hint
      ;;
    healthy)
      echo "  The new version IS live and both processes passed their health"
      echo "  checks — but a later check in this script failed unexpectedly"
      echo "  (exit $_status). Read the output above; the site itself is up."
      ;;
    pm2-restarted)
      echo "  PM2 was restarted, but a later step of this script failed"
      echo "  (exit $_status) before the new processes were confirmed healthy."
      echo "  Do not assume the deploy worked — check:"
      echo "      pm2 status && pm2 logs --lines 50"
      echo "      curl -i ${API_HEALTH_URL:-http://127.0.0.1:5103/api/health}"
      _print_restore_hint
      ;;
    unhealthy)
      echo "  DEPLOY FAILED: PM2 restarted the new version, but it is NOT healthy."
      echo "  ${_unhealthy_summary:-A process did not answer its health check.}"
      echo ""
      echo "  The site is running the NEW code, badly or not at all. Look first:"
      echo "      pm2 status && pm2 logs --lines 80"
      echo ""
      echo "  The API applies database migrations when it starts, so a start-up"
      echo "  failure may have left the database part-migrated."
      _print_restore_hint
      ;;
    preflight|git-pull)
      _head_now=$(git rev-parse HEAD 2>/dev/null)
      echo "  DEPLOY ABORTED during: $_stage (exit $_status)"
      if [ -n "$_pre_pull_sha" ] && [ -n "$_head_now" ] && \
         [ "$_head_now" != "$_pre_pull_sha" ]; then
        _print_skew_notice "$_head_now"
      else
        echo "  PM2 was NOT restarted and this checkout was not changed — the"
        echo "  previously deployed version is still running, untouched."
      fi
      ;;
    *)
      echo "  DEPLOY ABORTED during: $_stage (exit $_status)"
      _print_skew_notice "$(git rev-parse HEAD 2>/dev/null)"
      if [ "$_stage" = "db-snapshot" ]; then
        echo ""
        echo "  The pre-restart database snapshot could not be taken, so the"
        echo "  restart (which runs migrations) was not attempted. Fix the cause"
        echo "  (disk space? see the error above) and re-run. To deploy without a"
        echo "  snapshot, knowingly:  REBUILD_SKIP_DB_SNAPSHOT=1 ./rebuild.sh"
      fi
      ;;
  esac
  if [ -n "${REBUILD_LOG_FILE:-}" ]; then
    echo ""
    echo "  Full output of this run: $REBUILD_LOG_FILE"
  fi
  echo "======================================================================"
  exit "$_status"
}
trap _on_exit EXIT
trap '_on_signal INT 130' INT
trap '_on_signal TERM 143' TERM

# A parked build left by an earlier run means that run was killed in the
# middle of a web build: apps/web/.output is half-written and the parked
# directory is the last complete one. Put it back NOW, before anything else —
# the next build step would otherwise park the half-written directory and,
# on a second failure, "restore" that. (A leftover .tmp is an unfinished
# copy and is only ever discarded.)
rm -rf "$_prev_output_dir.tmp"
if [ -d "$_prev_output_dir" ]; then
  _restore_parked_output
  if [ "$_output_restored" -eq 1 ]; then
    echo "NOTE: an earlier run was interrupted during the web build; the last complete"
    echo "      build has been put back in apps/web/.output."
  fi
  _output_restored=0
fi

# ---------------------------------------------------------------------
# Remediation feature flag.
#
# Three ways to set this on a deploy, in priority order:
#
#   1. Pre-set the env var when invoking — wins outright:
#        REMEDIATION_ENABLED=true  ./rebuild.sh   # explicit on
#        REMEDIATION_ENABLED=false ./rebuild.sh   # explicit off
#
#   2. Interactive prompt — only when run from a TTY (typing
#      `./rebuild.sh` at an ssh session). Defaults to YES; hit Enter
#      to accept, or type `n` to deploy audit-only.
#
#   3. Non-interactive default (Forge webhook, CI, anything without a
#      TTY) — falls through to YES so a stock auto-deploy stands up
#      the full pipeline without manual intervention.
#
# This pairs with the auto-detection of REMEDIATION_VERAPDF_PATH
# below, so a fresh deploy on a server with veraPDF installed lights
# up the full pipeline end-to-end with one ./rebuild.sh call.
# ---------------------------------------------------------------------
if [ -n "$REMEDIATION_ENABLED" ]; then
  : # already set by the caller — respect it
elif [ -t 0 ]; then
  # Interactive TTY — ask. Default is yes; hit Enter or type y/yes
  # for on, type n/no for off. Anything else falls through to on.
  echo ""
  printf "Enable remediation feature on this deploy? [Y/n] "
  read -r _ans
  case "$_ans" in
    [nN]|[nN][oO]) REMEDIATION_ENABLED=false ;;
    *)             REMEDIATION_ENABLED=true ;;
  esac
  unset _ans
else
  # Non-interactive (webhook / CI / piped stdin) — default to on.
  REMEDIATION_ENABLED=true
fi
export REMEDIATION_ENABLED

if [ "$REMEDIATION_ENABLED" = "true" ]; then
  echo "Remediation feature: ENABLED"
else
  echo "Remediation feature: disabled (audit-only deploy)"
fi
echo ""

# Check for required system dependencies
echo "Checking system dependencies..."

# Node runtime. PM2 execs whatever `node` (and `pnpm`, which itself needs
# node) resolve on PATH at restart — package.json's "engines": { "node":
# ">=22" } is advisory only and nothing else on this box enforces it, so a
# droplet with a drifted Node install would otherwise deploy silently onto
# an unsupported runtime. Hard-fail like the pnpm check below, unlike the
# qpdf/java checks (which degrade gracefully instead of hard-requiring).
if ! command -v node &> /dev/null; then
  echo "ERROR: node is not installed. Install Node.js 22 or newer."
  exit 1
fi
NODE_VERSION_LINE=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION_LINE" | grep -oE '[0-9]+' | head -1)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: node ${NODE_VERSION_LINE:-?} found; this app requires Node 22 or"
  echo "  newer (see package.json \"engines\"). Upgrade Node before deploying —"
  echo "  PM2 would otherwise restart the app on an unsupported runtime."
  exit 1
fi

if ! command -v qpdf &> /dev/null; then
  echo "WARNING: qpdf is not installed. Image detection and PDF structure analysis will be limited."
  echo "  Install with: sudo apt-get install qpdf  (Debian/Ubuntu)"
  echo "            or: brew install qpdf           (macOS)"
  echo ""
fi

if ! command -v pnpm &> /dev/null; then
  echo "ERROR: pnpm is not installed. Install with: npm install -g pnpm"
  exit 1
fi

# Java runtime for OpenDataLoader (PDF auto-remediation feature)
if ! command -v java &> /dev/null; then
  echo "WARNING: java is not installed. PDF auto-remediation will be"
  echo "  unavailable until you install OpenJDK 17:"
  echo "    sudo apt install -y openjdk-17-jre-headless    (Ubuntu/Debian)"
  echo "    brew install openjdk@17                        (macOS)"
  echo ""
else
  JAVA_VERSION_LINE=$(java -version 2>&1 | head -1)
  JAVA_MAJOR=$(echo "$JAVA_VERSION_LINE" | grep -oE '"[0-9]+' | tr -d '"' | head -1)
  if [ -z "$JAVA_MAJOR" ] || [ "$JAVA_MAJOR" -lt 11 ]; then
    echo "WARNING: java ${JAVA_MAJOR:-?} found; PDF remediation needs 11 or"
    echo "  newer. Upgrade with: sudo apt install -y openjdk-17-jre-headless"
    echo ""
  fi
fi

# Confirm qpdf supports --object-streams (used by remediation preprocessing).
# qpdf 12.x reorganized help output, so version-based check is reliable.
# --object-streams=disable shipped in qpdf 10.x.
if command -v qpdf &> /dev/null; then
  QPDF_VERSION_LINE=$(qpdf --version 2>/dev/null | head -1)
  QPDF_MAJOR=$(echo "$QPDF_VERSION_LINE" | grep -oE '[0-9]+' | head -1)
  if [ -z "$QPDF_MAJOR" ] || [ "$QPDF_MAJOR" -lt 10 ]; then
    echo "WARNING: qpdf < 10.x detected — --object-streams=disable may not be supported."
    echo "  PDF remediation will skip the preprocessing step on tagged-input"
    echo "  PDFs, which may cause output corruption on InDesign/Word inputs."
    echo "  Upgrade qpdf to 10.x or newer."
    echo ""
  fi
fi

# veraPDF for PDF/UA-1 conformance reporting (optional but recommended
# for IITAA compliance disclosure on the remediation result page).
# Auto-detects at common install locations if REMEDIATION_VERAPDF_PATH
# isn't already set in the environment.
if [ -z "$REMEDIATION_VERAPDF_PATH" ]; then
  for candidate in \
    /opt/verapdf/verapdf \
    /home/forge/verapdf/verapdf \
    "$HOME/verapdf/verapdf" \
    /usr/local/bin/verapdf; do
    if [ -x "$candidate" ]; then
      REMEDIATION_VERAPDF_PATH="$candidate"
      export REMEDIATION_VERAPDF_PATH
      break
    fi
  done
fi

if [ -n "$REMEDIATION_VERAPDF_PATH" ] && [ -x "$REMEDIATION_VERAPDF_PATH" ]; then
  VERAPDF_VERSION=$("$REMEDIATION_VERAPDF_PATH" --version 2>/dev/null | head -1 || echo "unknown")
  echo "✓ veraPDF found: $REMEDIATION_VERAPDF_PATH ($VERAPDF_VERSION)"
  # v1.97.0: the WCAG second opinion needs the vendored validation profile.
  WCAG_PROFILE="apps/api/resources/verapdf/WCAG-2-2-Machine.xml"
  if [ -f "$WCAG_PROFILE" ]; then
    echo "✓ veraPDF WCAG profile present: $WCAG_PROFILE"
  else
    echo "✗ veraPDF WCAG profile MISSING: $WCAG_PROFILE"
    echo "  The WCAG machine-check panel will report \"Did not run\" until the"
    echo "  file is restored (it ships in the repository — check the checkout)."
  fi
  # Warn if the path isn't persisted in /etc/environment — PM2 won't see
  # it on a fresh server boot otherwise.
  if [ -f /etc/environment ] && ! grep -q '^REMEDIATION_VERAPDF_PATH' /etc/environment 2>/dev/null; then
    echo "  NOTE: this path is set in the current shell only. To persist it"
    echo "  so PM2 inherits it across reboots, run:"
    echo "    echo 'REMEDIATION_VERAPDF_PATH=$REMEDIATION_VERAPDF_PATH' | sudo tee -a /etc/environment"
    echo ""
  fi
elif [ -n "$REMEDIATION_VERAPDF_PATH" ]; then
  echo "WARNING: REMEDIATION_VERAPDF_PATH is set to '$REMEDIATION_VERAPDF_PATH'"
  echo "  but that path is not executable. veraPDF conformance checks will"
  echo "  be skipped. Verify the path or unset the variable."
  echo ""
else
  echo "NOTE: veraPDF not installed. PDF/UA-1 conformance reporting on the"
  echo "  remediation result page will show 'veraPDF check was not run'."
  echo ""
  echo "  To install on this Ubuntu server (one-time, ~30 MB download,"
  echo "  requires OpenJDK 17+ which the Java check above already verifies):"
  echo ""
  echo "    cd /opt"
  echo "    sudo curl -L -o verapdf-installer.zip \\"
  echo "         https://software.verapdf.org/rel/verapdf-installer.zip"
  echo "    sudo unzip verapdf-installer.zip"
  echo "    cd verapdf-greenfield-*"
  echo "    # Text-mode installer. Type 1 to accept license; press Enter for"
  echo "    # each remaining prompt (default install path will be /opt/verapdf)."
  echo "    sudo java -jar verapdf-izpack-installer-*.jar -console"
  echo "    cd /opt && sudo rm -rf verapdf-greenfield-* verapdf-installer.zip"
  echo "    /opt/verapdf/verapdf --version    # verify"
  echo ""
  echo "  Then make the path persistent for PM2 (one-time):"
  echo ""
  echo "    echo 'REMEDIATION_VERAPDF_PATH=/opt/verapdf/verapdf' | sudo tee -a /etc/environment"
  echo "    source /etc/environment"
  echo ""
  echo "  Then re-run ./rebuild.sh — the preflight above will find veraPDF"
  echo "  and the result-page disclaimer card will start showing the actual"
  echo "  PDF/UA-1 verdict for every remediation."
  echo ""
fi

# ---------------------------------------------------------------------
# RESIDUAL RISK — this deploy works in the live checkout (2026-11-12).
#
# From here until `pm2 restart`, the running site and this script share one
# directory, for as long as the install and the build take (minutes):
#
#   - `git pull` replaces the source the API runs from. The API parent
#     process keeps its already-loaded code, but every Office audit and
#     every remediation job spawns a FRESH worker (`node --import tsx …`)
#     that loads whatever is on disk at that moment — new worker code under
#     an old parent.
#   - `pnpm install` relinks node_modules under both running processes.
#   - `nuxt build` rewrites apps/web/.output under the running web process,
#     which loads server chunks lazily and serves hashed assets from it.
#
# The real cure is building in a separate release directory and switching
# to it atomically (blue/green). That changes the paths Forge, PM2 and the
# backup job are configured with, so it is the server owner's change to
# make, not this script's. Nitro's output directory cannot be redirected
# from the environment in this configuration (it is a nuxt.config.ts
# setting), so "build elsewhere, swap in" is not available here either.
#
# What this script does instead:
#   - keeps the window as short as it can (nothing slow happens between the
#     pull and the restart except the install and the build themselves);
#   - parks a copy of the previous web build and puts it back if the new
#     build fails, so a failed deploy does not leave the running web process
#     over a half-written .output;
#   - tells the truth in the failure banner: the tree HAS changed, the
#     processes have NOT been restarted, and how to get out of that state.
#
# Deploy at a quiet time. An audit that fails during a deploy window is
# most likely this, and succeeds on retry.
# ---------------------------------------------------------------------
echo "Pulling latest changes..."
_stage="git-pull"
if [ -z "$_pre_pull_sha" ]; then
  _pre_pull_sha=$(git rev-parse HEAD 2>/dev/null || true)
fi
git checkout -- .
git pull origin main

# ---------------------------------------------------------------------
# Re-exec after the pull, because that pull may have replaced THIS FILE.
#
# bash reads a script lazily, by byte offset — it does not slurp the whole
# file up front. So when `git pull` rewrites rebuild.sh mid-run, bash keeps
# reading from its saved offset into the NEW contents. Best case it silently
# runs the previous version of the later steps (which is exactly what
# happened on the v1.41.1 deploy: the fixed smoke checks were pulled but the
# OLD ones executed). Worst case the offset lands mid-line and bash executes
# a fragment of a command.
#
# Re-executing once, only when the pull actually moved HEAD, means the rest
# of the deploy always runs the code that was just fetched. The guard env var
# stops this from recursing.
# ---------------------------------------------------------------------
if [ -z "${REBUILD_REEXECED:-}" ]; then
  _post_pull_sha=$(git rev-parse HEAD 2>/dev/null || true)
  if [ -n "$_pre_pull_sha" ] && [ "$_pre_pull_sha" != "$_post_pull_sha" ]; then
    echo "Pull moved HEAD ${_pre_pull_sha:0:12} -> ${_post_pull_sha:0:12}; re-running the updated script..."
    export REBUILD_REEXECED=1
    export REBUILD_PRE_PULL_SHA="$_pre_pull_sha"
    exec bash "$_self" "$@"
  fi
fi

echo "Installing dependencies..."
_stage="pnpm-install"
_run pnpm install --frozen-lockfile

echo "Building..."
# The root `pnpm build` is three steps. They are run one at a time here so
# that this script knows WHICH one failed, and — the point — whether the web
# build ever started: only `nuxt build` touches apps/web/.output, so a failed
# typecheck must leave the live web build alone and must not be reported as
# a web-build failure. If package.json's "build" ever stops being exactly
# these three steps, the whole script is run as one (stage "build") rather
# than silently skipping whatever was added.
_expected_build='pnpm --filter @file-audit/analyzer build && pnpm --filter api build && pnpm --filter web build'
_build_split=0
if grep -qF "\"build\": \"$_expected_build\"" package.json; then
  _build_split=1
  _stage="build-analyzer"
  _run pnpm --filter @file-audit/analyzer build
  _stage="build-api-typecheck"
  _run pnpm --filter api build
  _stage="build-web"
else
  echo "NOTE: package.json \"build\" is not the three steps this script knows; running it whole."
  _stage="build"
fi

# Nuxt's persistent build cache corrupted on 2026-08-17 (two concurrent
# builds → ENOENT .cache/nuxt/.nuxt/manifest.json on every later build,
# 41 PM2 crash-loops). The cache only speeds up incremental rebuilds; a
# deploy wants a cold, reproducible build. Drop it first, every time.
rm -rf apps/web/node_modules/.cache/nuxt

# Park a copy of the web build that is serving traffic right now. `nuxt
# build` empties and rewrites apps/web/.output in place; if it dies part-way
# the running web process is left over a half-written build, and so is any
# PM2 auto-restart of it. The EXIT trap (and the start of the next run, if
# this one is killed outright) puts the parked copy back.
# Copied under a .tmp name and renamed, so the parked directory is never a
# partial copy. Inside node_modules/.cache so git never sees it. A failed
# copy — a full disk — is not a reason to stop: the build will say so more
# clearly.
if [ -d apps/web/.output ]; then
  mkdir -p "$(dirname "$_prev_output_dir")"
  rm -rf "$_prev_output_dir.tmp"
  if cp -a apps/web/.output "$_prev_output_dir.tmp" && mv "$_prev_output_dir.tmp" "$_prev_output_dir"; then
    :
  else
    echo "WARNING: could not park a copy of the current web build; continuing without one."
    rm -rf "$_prev_output_dir.tmp" "$_prev_output_dir"
  fi
fi

# Not piped. A failure ends the script through set -e; the EXIT trap puts
# the parked build back and says which stage failed.
if [ "$_build_split" -eq 1 ]; then
  _run pnpm --filter web build
else
  _run pnpm build
fi
rm -rf "$_prev_output_dir"

# Load app secrets persisted in /etc/environment so PM2 inherits them even when
# this script runs in a shell that didn't pick them up at login (/etc/environment
# is only applied to fresh login sessions — the gotcha that makes a rotated
# token silently fail to deploy). Extract specific vars BY NAME; never source the
# whole file, so a PATH= line there can't clobber the PATH that resolves pnpm/pm2.
_stage="load-secrets"
if [ -f /etc/environment ]; then
  for _var in API_PRIVILEGED_TOKEN; do
    _line=$(grep -E "^${_var}=" /etc/environment | tail -n1 || true)
    if [ -n "$_line" ]; then
      _val=${_line#*=}
      _val=${_val#\"}; _val=${_val%\"}   # tolerate optional surrounding quotes
      export "${_var}=${_val}"
    fi
  done
  unset _var _line _val
fi
if [ -n "$API_PRIVILEGED_TOKEN" ]; then
  echo "API_PRIVILEGED_TOKEN: set (${#API_PRIVILEGED_TOKEN} chars) — privileged rate-limit tier ON"
else
  echo "API_PRIVILEGED_TOKEN: not set — privileged rate-limit tier OFF (everyone strict)"
fi

# ---------------------------------------------------------------------
# Database snapshot, immediately before the restart (2026-11-12).
#
# The API applies its numbered migrations when it boots (db/sqlite.ts →
# runMigrations), against the live database, and some of them are not
# reversible (dropped columns, dropped tables). Until now nothing captured
# the database first: a migration that went wrong on production data had no
# way back except the previous night's backup, minus the day's rows.
#
# This reuses the nightly backup (scripts/backup-db.sh — SQLite's online
# backup, integrity-checked, safe while the old API is still writing) with
# two differences:
#   - it writes to a `pre-deploy/` directory INSIDE the backups directory,
#     so the two sets never rotate each other away (each rotation only ever
#     lists its own directory), and the nightly job's last-backup.json —
#     what /status reports on — is not touched;
#   - it keeps the newest 3 (REBUILD_SNAPSHOT_KEEP), not 5.
#
# A failed snapshot ABORTS the deploy: restarting without one is exactly
# the gamble this step removes. First deploy on a new server (no database
# yet) has nothing to snapshot and says so. REBUILD_SKIP_DB_SNAPSHOT=1
# skips the step for the operator who has decided to.
# ---------------------------------------------------------------------
_stage="db-snapshot"
case "${DB_PATH:-}" in
  "")  _db_file="apps/api/data/audit.db" ;;
  /*)  _db_file="$DB_PATH" ;;
  *)   _db_file="apps/api/$DB_PATH" ;;
esac
if [ "${REBUILD_SKIP_DB_SNAPSHOT:-}" = "1" ]; then
  echo "Database snapshot: SKIPPED (REBUILD_SKIP_DB_SNAPSHOT=1) — restarting with no way back."
elif [ ! -f "$_db_file" ]; then
  echo "Database snapshot: nothing to snapshot yet ($_db_file does not exist — first deploy)."
else
  _snapshot_dir="${BACKUP_DIR:-$(dirname "$(pwd)")/backups}/pre-deploy"
  echo "Snapshotting the database before the restart -> $_snapshot_dir"
  # The snapshot's path is taken from what the backup itself reports (the
  # JSON line backup-db.mjs prints on success) — never from "the newest name
  # in the directory", which is a different file whenever two runs share a
  # second or the clock has stepped backwards.
  _snap_out=$(BACKUP_DIR="$_snapshot_dir" BACKUP_KEEP_COUNT="${REBUILD_SNAPSHOT_KEEP:-3}" \
    bash scripts/backup-db.sh)
  printf '%s\n' "$_snap_out"
  _predeploy_snapshot=$(printf '%s\n' "$_snap_out" | node -e '
    let text = "";
    process.stdin.on("data", (d) => (text += d));
    process.stdin.on("end", () => {
      for (const line of text.split("\n")) {
        if (!line.startsWith("{")) continue;
        try {
          const j = JSON.parse(line);
          if (j.action === "backup" && typeof j.snapshotPath === "string") {
            process.stdout.write(j.snapshotPath);
            return;
          }
        } catch {}
      }
    });
  ')
  if [ -z "$_predeploy_snapshot" ] || [ ! -s "$_predeploy_snapshot" ]; then
    echo "ERROR: the backup did not report a snapshot that exists (got: '${_predeploy_snapshot}')"
    exit 1
  fi
  echo "✓ Pre-restart snapshot: $_predeploy_snapshot"
fi

echo "Restarting PM2..."
# --update-env so rotated secrets (e.g. API_PRIVILEGED_TOKEN) actually refresh;
# a plain `pm2 restart` reuses the env snapshot from the original `pm2 start`.
_stage="pm2-restart"
pm2 restart ecosystem.config.cjs --update-env
_stage="pm2-restarted"

echo "PM2 restart issued. Process list:"
pm2 status

# ---------------------------------------------------------------------
# Is the new version actually up? (2026-11-12)
#
# `pm2 restart` returns as soon as the processes are SPAWNED. Until now
# this script then probed the public URL, treated every failure as a
# warning, and ended with "The deploy itself succeeded" and exit 0 — also
# when the API was dead or crash-looping on a failed migration. Forge
# showed a green deploy over a site that was down.
#
# Each process is now asked directly, on loopback (no nginx, no DNS, no
# TLS in the way), with a bounded wait. If either does not answer 200 the
# deploy FAILS: non-zero exit, a banner that says so, and the snapshot to
# restore from. Everything further down (public URL, nginx-intercepted
# static files, veraPDF) stays a warning, as before — those are about
# routing and optional engines, not about whether the app is running.
#
# /api/health is static liveness, but the API only starts listening after
# db/sqlite.ts has opened the database and run every pending migration, so
# a 200 here means the migrations completed.
# ---------------------------------------------------------------------
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:5103/api/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:5102/healthz}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-90}"

# HTTP status of one local URL, or 000. curl when present; otherwise node,
# which this script has already required.
_local_code() {
  _lc=""
  if command -v curl > /dev/null 2>&1; then
    _lc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || true)
  else
    _lc=$(node -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(5000) }).then((r) => console.log(r.status), () => console.log("000"))' "$1" 2>/dev/null || true)
  fi
  [ -n "$_lc" ] || _lc="000"
  printf '%s' "$_lc"
}

# Wait until $2 answers 200, for at most HEALTH_WAIT_SECONDS. $1 = label.
_wait_healthy() {
  _waited=0
  printf "Waiting for %s (%s)" "$1" "$2"
  while :; do
    _hc=$(_local_code "$2")
    if [ "$_hc" = "200" ]; then
      echo " healthy after ~${_waited}s."
      return 0
    fi
    if [ "$_waited" -ge "$HEALTH_WAIT_SECONDS" ]; then
      echo ""
      echo "  ✗ $1 did not answer 200 within ${HEALTH_WAIT_SECONDS}s (last status: $_hc)"
      return 1
    fi
    printf "."
    sleep 2
    _waited=$((_waited + 2))
  done
}

echo ""
_api_ok=1
_web_ok=1
_wait_healthy "the API" "$API_HEALTH_URL" || _api_ok=0
_wait_healthy "the web app" "$WEB_HEALTH_URL" || _web_ok=0
if [ "$_api_ok" -eq 0 ] || [ "$_web_ok" -eq 0 ]; then
  if [ "$_api_ok" -eq 0 ] && [ "$_web_ok" -eq 0 ]; then
    _unhealthy_summary="Neither the API nor the web app answered its local health check."
  elif [ "$_api_ok" -eq 0 ]; then
    _unhealthy_summary="The API did not answer $API_HEALTH_URL (the web app did answer)."
  else
    _unhealthy_summary="The web app did not answer $WEB_HEALTH_URL (the API did answer)."
  fi
  pm2 status || true
  _stage="unhealthy"
  exit 1
fi
_stage="healthy"

# ---------------------------------------------------------------------
# Is PM2 watching the right process? (2026-11-12) — warning only.
#
# ecosystem.config.cjs starts each app as `pnpm start`, so the process PM2
# spawned — the one whose memory it measures for max_memory_restart — is
# the pnpm wrapper, and the server is its child. PM2 samples only the pid
# it spawned (it does not add up children), so the 512M cap may never fire
# for the real server. This compares the pid PM2 reports with the pid that
# is actually listening on the port, and says so when they differ. See the
# note above `restartPolicy` in ecosystem.config.cjs for the fix and why it
# is not applied automatically.
# ---------------------------------------------------------------------
_listener_pid() {
  # $1 = TCP port. Prints the listening pid, or nothing if it cannot tell.
  if command -v ss > /dev/null 2>&1; then
    ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -n 1 | cut -d= -f2
  elif command -v lsof > /dev/null 2>&1; then
    lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -n 1
  fi
}
_rss_mb() {
  # $1 = pid. Resident memory in MB, or "?".
  _kb=$(ps -o rss= -p "$1" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$_kb" ]; then echo $((_kb / 1024)); else echo "?"; fi
}
_check_supervised_pid() {
  # $1 = PM2 app name, $2 = port
  _pm2_pid=$(pm2 pid "$1" 2>/dev/null | tr -d '[:space:]' || true)
  _real_pid=$(_listener_pid "$2" || true)
  if [ -z "$_pm2_pid" ] || [ "$_pm2_pid" = "0" ] || [ -z "$_real_pid" ]; then
    echo "  - $1: could not compare PM2's pid with the listener on :$2 (skipped)"
    return 0
  fi
  if [ "$_pm2_pid" = "$_real_pid" ]; then
    echo "  ✓ $1: PM2 supervises the listening process itself (pid $_pm2_pid)"
    return 0
  fi
  echo "  ! $1: PM2 watches pid $_pm2_pid ($(_rss_mb "$_pm2_pid") MB), but the process listening"
  echo "    on :$2 is pid $_real_pid ($(_rss_mb "$_real_pid") MB). max_memory_restart is measured on"
  echo "    the first one — the pnpm wrapper — so the memory cap does not protect"
  echo "    the server. Confirm with \`pm2 monit\`; fix: see ecosystem.config.cjs."
  return 1
}
echo ""
echo "PM2 supervision check (warning only):"
_supervision_warn=0
_check_supervised_pid file-audit-api 5103 || _supervision_warn=1
_check_supervised_pid file-audit-web 5102 || _supervision_warn=1

# ---------------------------------------------------------------------
# Post-deploy smoke checks.
#
# Non-fatal by design: both processes have already answered their local
# health checks above, so a failed probe here is about what sits in FRONT
# of them (nginx, DNS, TLS) or beside them (veraPDF) — information, not a
# reason to fail a deploy that is serving.
#
# These exist because two of the paths below have silently 404'd in
# production for months. Nothing in the build catches it: the files are
# correct in .output/public, and every OTHER static asset serves fine —
# nginx intercepts these two specific paths before they ever reach Nuxt.
# ---------------------------------------------------------------------
SMOKE_URL="${SMOKE_URL:-https://audit.icjia.app}"

# One request. Prints the HTTP status, or 000 if there was no response.
#
# Uses --head for HEAD, NEVER `-X HEAD`. With -X HEAD curl still waits for a
# response body, which a HEAD response never sends, so it blocks until
# --max-time and exits non-zero — which on the first version of this script
# printed the real code AND the fallback, producing a nonsense "502000".
#
# `|| true` keeps `set -e` from aborting on a failed probe: by this point both
# processes have answered locally, and a bad public probe is information, not
# a reason to abort.
_http_code() {
  _m=""
  [ "${2:-GET}" = "HEAD" ] && _m="--head"
  _c=$(curl -s $_m -o /dev/null -w '%{http_code}' --max-time 20 "${SMOKE_URL}$1" 2>/dev/null || true)
  [ -n "$_c" ] || _c="000"
  printf '%s' "$_c"
}

# Wait for the PUBLIC route to come back before probing it. The processes are
# already known to be up (local health checks above); nginx can lag them by a
# moment, and probing immediately measures our own impatience: the first
# version of this block reported 502s against a completely healthy deploy.
echo ""
printf "Waiting for %s to answer" "$SMOKE_URL"
_ready=0
for _i in $(seq 1 15); do
  if [ "$(_http_code /healthz GET)" = "200" ]; then
    _ready=1
    echo " ready."
    break
  fi
  printf "."
  sleep 2
done
if [ "$_ready" -eq 0 ]; then
  echo ""
  echo "  (the public URL is still not answering after 30s although both"
  echo "   processes answer locally — look at nginx / DNS / TLS; probing anyway)"
fi

echo ""
echo "Post-deploy smoke checks against ${SMOKE_URL} ..."

_probe() {
  # $1 = path, $2 = expected status, $3 = method (GET | HEAD)
  _code=$(_http_code "$1" "${3:-GET}")
  if [ "$_code" = "$2" ]; then
    echo "  ✓ ${3:-GET} $1 -> $_code"
    return 0
  fi
  echo "  ✗ ${3:-GET} $1 -> $_code (expected $2)"
  return 1
}

_smoke_failed=0

# The app itself. HEAD is checked explicitly because uptime monitors
# send it by default and these routes 404'd it before v1.40.3.
_probe /healthz 200 GET  || _smoke_failed=1
_probe /status  200 GET  || _smoke_failed=1
_probe /status  200 HEAD || _smoke_failed=1

# Static files nginx is known to intercept. See the note below.
_robots_ok=1
_probe /robots.txt  200 GET || _robots_ok=0
_probe /favicon.ico 200 GET || _robots_ok=0

if [ "$_robots_ok" -eq 0 ]; then
  cat <<'ROBOTS_HINT'

  ---------------------------------------------------------------
  robots.txt and/or favicon.ico are 404ing.

  This is an nginx configuration issue, NOT a build problem — both
  files ARE present in apps/web/.output/public, and every other
  static asset serves correctly.

  Cause: Laravel Forge's default vhost template contains

      location = /favicon.ico { access_log off; log_not_found off; }
      location = /robots.txt  { access_log off; log_not_found off; }

  An exact-match `location =` block outranks the proxy_pass to
  Nuxt, and resolves against the vhost `root` (Forge's default
  /home/forge/<site>/public) — which holds neither file for a Nuxt
  app. So nginx answers 404 itself and never forwards the request.

  Fix: edit the site's nginx config (Forge UI, or
  /etc/nginx/sites-available/<site>), DELETE those two location
  blocks, then:

      sudo nginx -t && sudo service nginx reload

  Impact while broken: the entire robots.txt is missing in
  production, so no Disallow rule is being honoured by crawlers.
  /status and /healthz are still protected by their X-Robots-Tag
  response headers, but /login, /my-history, /history and /publist
  have no such backstop.
  ---------------------------------------------------------------

ROBOTS_HINT
  _smoke_failed=1
fi

# ---------------------------------------------------------------------
# veraPDF engine probe (v1.91.0).
#
# veraPDF powers the PDF/UA machine-check layer — the machine-testable
# subset of the Matterhorn Protocol's 31 checkpoints. Since v1.91.0 a PDF
# report DISCLOSES when veraPDF did not run instead of silently hiding
# the panel, so a deploy that lost the binary (env drift, a removed
# install, a broken JAVA) would otherwise be discovered one apologetic
# report at a time. Make it loud here instead.
#
# /status?format=json carries the engine probe (services/status.ts); the
# first request after a restart spawns the veraPDF JVM, hence the longer
# --max-time. Field order inside the object is not guaranteed, so grab
# the whole {...} block and test for "ok":true inside it.
# ---------------------------------------------------------------------
_status_json=$(curl -s --max-time 60 "${SMOKE_URL}/status?format=json" 2>/dev/null || true)
_verapdf_block=$(printf '%s' "$_status_json" | grep -o '"verapdf":{[^}]*}' || true)
if printf '%s' "$_verapdf_block" | grep -q '"ok":true'; then
  echo "  ✓ engine verapdf -> ${_verapdf_block}"
else
  echo "  ✗ engine verapdf -> ${_verapdf_block:-no verapdf block in /status?format=json}"
  echo "    PDF reports will show 'PDF/UA-1 machine checks (veraPDF): Did not run'"
  echo "    until VERAPDF_PATH (in /etc/environment, then pm2 restart --update-env)"
  echo "    points at a working veraPDF install. See /status for the engine panel."
  _smoke_failed=1
fi

echo ""
echo "✓ Deployed: the API and the web app both answer their local health checks."
if [ -n "$_predeploy_snapshot" ]; then
  echo "  Pre-restart database snapshot: $_predeploy_snapshot"
fi
if [ "$_smoke_failed" -eq 0 ]; then
  echo "✓ All post-deploy smoke checks passed."
else
  echo "WARNING: one or more post-deploy smoke checks failed (see above). Both"
  echo "         processes are running and healthy locally, so these are routing"
  echo "         or configuration problems (nginx, DNS, TLS, veraPDF) — but they"
  echo "         are real, and visitors may be affected until they are fixed."
fi
if [ "$_supervision_warn" -ne 0 ]; then
  echo "WARNING: PM2 is not measuring the server processes' memory (see the"
  echo "         supervision check above)."
fi
